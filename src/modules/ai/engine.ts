import { GoogleGenAI, Type, type Part } from "@google/genai";
import { z } from "zod";
import { env } from "@/lib/env";
import { getApprovedKnowledge, knowledgeCode } from "@/modules/knowledge/repository";
import { filterKnowledge, getDisabledTopics, matchDisabledTopic } from "@/modules/knowledge/topics";
import type { Turn } from "./context";
import { systemPrompt } from "./prompt";
import { enforceMaleParticle, preRoute, ungroundedNumbers, type HandoffCategory } from "./rules";

export interface EngineMedia {
  kind: "image" | "audio";
  mime: string;
  data: Buffer;
}

export interface EngineInput {
  texts: string[];
  media: EngineMedia[];
  context: Turn[];
  greeted: boolean;
}

export interface RequestDetails {
  kind: "appointment" | "callback";
  name?: string;
  phone?: string;
  service?: string;
  branch?: string;
  preferred_time?: string;
}

export interface EngineResult {
  action: "answer" | "handoff" | "request";
  language: "th" | "en";
  reply: string;
  handoffCategory?: HandoffCategory;
  summary: string;
  draftReply?: string;
  transcript?: string;
  citedIds: string[];
  request?: RequestDetails;
  /** Why the result was produced, for the admin test console */
  trace: string[];
}

const OutputSchema = z.object({
  action: z.enum(["answer", "handoff", "request"]),
  language: z.enum(["th", "en"]).catch("th"),
  reply: z.string(),
  handoff_category: z
    .enum(["repair_status", "complaint", "human_request", "unanswerable", "disabled_topic"])
    .optional()
    .nullable(),
  summary: z.string().catch(""),
  draft_reply: z.string().optional().nullable(),
  transcript: z.string().optional().nullable(),
  cited_ids: z.array(z.string()).catch([]),
  request: z
    .object({
      kind: z.enum(["appointment", "callback"]).catch("callback"),
      name: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      service: z.string().optional().nullable(),
      branch: z.string().optional().nullable(),
      preferred_time: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    action: { type: Type.STRING, enum: ["answer", "handoff", "request"] },
    language: { type: Type.STRING, enum: ["th", "en"] },
    reply: { type: Type.STRING },
    handoff_category: {
      type: Type.STRING,
      enum: ["repair_status", "complaint", "human_request", "unanswerable", "disabled_topic"],
    },
    summary: { type: Type.STRING },
    draft_reply: { type: Type.STRING },
    transcript: { type: Type.STRING },
    cited_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
    request: {
      type: Type.OBJECT,
      properties: {
        kind: { type: Type.STRING, enum: ["appointment", "callback"] },
        name: { type: Type.STRING },
        phone: { type: Type.STRING },
        service: { type: Type.STRING },
        branch: { type: Type.STRING },
        preferred_time: { type: Type.STRING },
      },
    },
  },
  required: ["action", "language", "reply", "summary", "cited_ids"],
};

let ai: GoogleGenAI | null = null;
const gemini = () => (ai ??= new GoogleGenAI({ apiKey: env.geminiApiKey() }));

const isThai = (s: string) => /[฀-๿]/.test(s);

export function handoffReply(language: "th" | "en"): string {
  return language === "en"
    ? "Thank you for your message. Our staff will get back to you shortly."
    : "ขอบคุณที่ติดต่อ Expert Watch ครับ เจ้าหน้าที่จะติดต่อกลับโดยเร็วที่สุดครับ";
}

function handoff(category: HandoffCategory, language: "th" | "en", summary: string, trace: string[]): EngineResult {
  return { action: "handoff", language, reply: handoffReply(language), handoffCategory: category, summary, citedIds: [], trace };
}

/** Pure decision function: no side effects, safe to use from the admin test console. */
export async function generateReply(input: EngineInput): Promise<EngineResult> {
  const text = input.texts.join("\n").trim();
  const language: "th" | "en" = !text || isThai(text) ? "th" : "en";
  const trace: string[] = [];

  const routed = text ? preRoute(text) : null;
  if (routed) {
    trace.push(`pre-route: ${routed}`);
    return handoff(routed, language, text.slice(0, 300), trace);
  }

  const disabled = await getDisabledTopics();
  const hit = text ? matchDisabledTopic(text, disabled) : null;
  if (hit) {
    trace.push(`disabled topic: ${hit.kind}=${hit.value}`);
    return handoff("disabled_topic", language, `${text.slice(0, 300)}\n(หัวข้อที่ปิด: ${hit.value})`, trace);
  }

  const knowledge = filterKnowledge(await getApprovedKnowledge(), disabled);
  trace.push(`knowledge items: ${knowledge.length}`);

  const history = input.context.map((t) => ({
    role: t.role === "customer" ? "user" : "model",
    parts: [{ text: t.text }],
  }));
  const parts: Part[] = [];
  if (text) parts.push({ text });
  for (const m of input.media) {
    parts.push({ inlineData: { mimeType: normaliseMime(m), data: m.data.toString("base64") } });
  }
  if (!parts.length) parts.push({ text: "(ลูกค้าส่งข้อความว่าง)" });

  const response = await gemini().models.generateContent({
    model: env.geminiModel(),
    contents: [...history, { role: "user", parts }],
    config: {
      systemInstruction: systemPrompt(knowledge, { greeted: input.greeted }),
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const parsed = OutputSchema.safeParse(safeJson(response.text ?? ""));
  if (!parsed.success) {
    trace.push("model output invalid → handoff");
    return handoff("unanswerable", language, text.slice(0, 300) || "ลูกค้าส่งสื่อ", trace);
  }
  const out = parsed.data;
  const lang = out.language;
  const citedIds = out.cited_ids.filter((id) => knowledge.some((k) => knowledgeCode(k.seq) === id));
  const reply = lang === "th" ? enforceMaleParticle(out.reply) : out.reply;
  trace.push(`model action: ${out.action}`, `cited: ${citedIds.join(", ") || "-"}`);

  if (out.action === "handoff") {
    return {
      ...handoff((out.handoff_category as HandoffCategory) ?? "unanswerable", lang, out.summary, trace),
      draftReply: out.draft_reply ?? undefined,
      transcript: out.transcript ?? undefined,
    };
  }

  // Guard: any price/number not found in cited knowledge means the model guessed.
  const sources = knowledge.filter((k) => citedIds.includes(knowledgeCode(k.seq))).flatMap((k) => [k.question, k.answer]);
  const bad = ungroundedNumbers(reply, sources);
  if (bad.length) {
    trace.push(`ungrounded numbers: ${bad.join(", ")} → handoff`);
    return {
      ...handoff("unanswerable", lang, `${out.summary}\n(AI ไม่แน่ใจข้อมูลตัวเลข/ราคา)`, trace),
      draftReply: reply,
      transcript: out.transcript ?? undefined,
    };
  }

  return {
    action: out.action,
    language: lang,
    reply,
    summary: out.summary,
    transcript: out.transcript ?? undefined,
    citedIds,
    request:
      out.action === "request" && out.request
        ? {
            kind: out.request.kind,
            name: out.request.name ?? undefined,
            phone: out.request.phone ?? undefined,
            service: out.request.service ?? undefined,
            branch: out.request.branch ?? undefined,
            preferred_time: out.request.preferred_time ?? undefined,
          }
        : undefined,
    trace,
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normaliseMime(m: EngineMedia): string {
  const mime = m.mime.split(";")[0].trim().toLowerCase();
  if (m.kind === "audio" && (mime === "audio/x-m4a" || mime === "audio/m4a")) return "audio/mp4";
  return mime;
}
