import type { messagingApi } from "@line/bot-sdk";
import { db, must } from "@/lib/db";
import { formatThai } from "@/lib/time";
import { generateReply } from "@/modules/ai/engine";
import { HANDOFF_LABEL } from "@/modules/ai/rules";
import {
  batchPage,
  createBatch,
  decideBatch,
  decideItem,
  getBatchKind,
  getItem,
  itemBubble,
  listPendingBatches,
  type Decision,
} from "@/modules/approval/workflow";
import { claimHandoff, getHandoff, handoffMessage, resolveHandoff, type Handoff } from "@/modules/handoff/handoff";
import { contentHash, normalizeQuestion } from "@/modules/knowledge/parser";
import { getKnowledgeBySeq, knowledgeCode, searchKnowledge } from "@/modules/knowledge/repository";
import { getSheetState, checkSheets } from "@/modules/knowledge/sync";
import { getDisabledTopics, TOPIC_KIND_LABEL, type TopicKind } from "@/modules/knowledge/topics";
import { getChat, getChatByRef, listAiOffChats } from "@/modules/messaging/chats";
import { CHANNEL_LABEL } from "@/modules/messaging/types";
import { bubble, flex, textMessage } from "@/modules/notifications/flex";
import { actorLabel, can, getActor, listAdmins, type Actor } from "./auth";
import { cancel, confirm, propose } from "./confirm";
import { getSettings } from "./settings";

export interface AdminSource {
  userId?: string;
  groupId?: string;
}

const HELP = `คำสั่งผู้ดูแล Expert Watch AI

ทั่วไป
• STATUS — สถานะระบบ
• MYID — ดู LINE User ID ของคุณ
• GROUPID — ดู Group ID (พิมพ์ในกลุ่ม)
• ASK <คำถาม> — ทดลองถาม AI (ไม่ส่งถึงลูกค้า)

ควบคุม AI
• AI LINE ON|OFF · AI MESSENGER ON|OFF
• TOPIC OFF brand Rolex · TOPIC ON service ติดฟิล์ม
  (ประเภท: service / brand / model)
• TOPICS — หัวข้อที่ปิดอยู่
• OFFAI — รายการแชทที่หยุด AI
• OFFAI <รหัสแชท> · ONAI <รหัสแชท>
• HANDOFFS — เรื่องที่รอเจ้าหน้าที่

ข้อมูล
• PENDING — รายการรออนุมัติ
• SYNC — ตรวจ Google Sheets ทันที
• FIND <คำค้น>
• ADD <หมวด> | <คำถาม> | <คำตอบ>
• EDIT K12 | <คำตอบใหม่> · DEL K12
  (เฉพาะข้อมูลที่เพิ่มผ่าน LINE — ข้อมูลจาก Sheet ให้แก้ใน Sheet)

Super Admin
• ADMINS · ADMIN ADD <userId> [ชื่อ] · ADMIN REMOVE <userId>
• TESTERS · TESTER ADD <userId> · TESTER REMOVE <userId>
• MODE TEST · MODE LIVE`;

const DENIED = textMessage("คุณไม่มีสิทธิ์ใช้คำสั่งนี้ (พิมพ์ MYID แล้วส่งให้ Super Admin เพื่อขอสิทธิ์)");

export async function handleAdminText(source: AdminSource, raw: string): Promise<messagingApi.Message[]> {
  const text = raw.trim();
  const [head = "", ...rest] = text.split(/\s+/);
  const cmd = head.toUpperCase();
  const arg = text.slice(head.length).trim();

  // Available to everyone, so new staff can request access.
  if (cmd === "MYID") return [textMessage(`LINE User ID ของคุณ:\n${source.userId ?? "-"}`)];
  if (cmd === "GROUPID") return [textMessage(source.groupId ? `Group ID:\n${source.groupId}` : "ใช้คำสั่งนี้ในกลุ่ม LINE")];

  const actor = await getActor(source.userId);
  if (!actor.role) return source.groupId ? [] : [DENIED];

  switch (cmd) {
    case "HELP":
    case "ช่วยเหลือ":
    case "เมนู":
      return [textMessage(HELP)];
    case "STATUS":
    case "สถานะ":
      return [await statusMessage()];
    case "ASK":
    case "ทดสอบ":
      return [await testAsk(arg)];
    case "AI":
      return [await aiChannelCommand(actor, rest)];
    case "TOPIC":
      return [await topicCommand(actor, rest)];
    case "TOPICS":
      return [await topicsMessage()];
    case "OFFAI":
      return arg ? [await chatAiCommand(actor, arg, false)] : [await offAiList()];
    case "ONAI":
      return [await chatAiCommand(actor, arg, true)];
    case "HANDOFFS":
      return [await openHandoffsMessage()];
    case "PENDING":
      return [await pendingMessage()];
    case "SYNC":
      if (!can(actor, "manage_knowledge")) return [DENIED];
      return [textMessage(`ผลการตรวจ Google Sheets: ${await checkSheets()}`)];
    case "FIND":
      return [await findMessage(arg)];
    case "ADD":
      return [await addKnowledge(actor, arg)];
    case "EDIT":
      return [await editKnowledge(actor, arg)];
    case "DEL":
      return [await deleteKnowledge(actor, arg)];
    case "ADMINS":
      return [await adminsMessage(actor)];
    case "ADMIN":
      return [await adminCommand(actor, rest)];
    case "TESTERS":
      return [textMessage(`บัญชีทดสอบ:\n${(await getSettings()).testUsers.join("\n") || "(ไม่มี)"}`)];
    case "TESTER": {
      const [op, userId] = rest;
      if (!userId || !["ADD", "REMOVE"].includes(op?.toUpperCase())) return [textMessage("รูปแบบ: TESTER ADD <userId>")];
      return [await propose(actor, { type: "tester", userId, add: op.toUpperCase() === "ADD" })];
    }
    case "MODE": {
      const mode = rest[0]?.toLowerCase();
      if (mode !== "live" && mode !== "test") return [textMessage("รูปแบบ: MODE TEST หรือ MODE LIVE")];
      return [await propose(actor, { type: "set_mode", mode })];
    }
    default:
      // Ignore normal conversation in groups; guide in 1:1 chats.
      return source.groupId ? [] : [textMessage("ไม่รู้จักคำสั่งนี้ พิมพ์ HELP เพื่อดูคำสั่งทั้งหมด")];
  }
}

export async function handleAdminPostback(source: AdminSource, data: string): Promise<messagingApi.Message[]> {
  const p = new URLSearchParams(data);
  const actor = await getActor(source.userId);
  if (!actor.role) return [DENIED];
  const label = actor.name ?? actor.userId;

  switch (p.get("a")) {
    case "confirm":
      return [textMessage(await confirm(actor, p.get("p") ?? ""))];
    case "cancel":
      return [textMessage(await cancel(actor, p.get("p") ?? ""))];

    case "batch_page":
      return batchPage(Number(p.get("b")), Number(p.get("p") ?? 0));
    case "batch_decide": {
      if (!can(actor, "approve")) return [DENIED];
      const batchId = Number(p.get("b"));
      const decision = p.get("d") as Decision;
      if ((await getBatchKind(batchId)) === "recovery") return [textMessage("ชุดกู้คืนข้อมูลต้องเลือกทีละรายการ")];
      const n = await decideBatch(batchId, actorLabel(actor), decision);
      return [
        textMessage(
          n
            ? `${decision === "approved" ? "✅ อนุมัติ" : "❌ ปฏิเสธ"} ${n} รายการในชุด #${batchId} โดย ${label}`
            : `ชุด #${batchId} ไม่มีรายการรอพิจารณาแล้ว`,
        ),
      ];
    }
    case "item_decide": {
      if (!can(actor, "approve")) return [DENIED];
      const itemId = Number(p.get("i"));
      const decision = p.get("d") as Decision;
      const item = await decideItem(itemId, actorLabel(actor), decision);
      if (!item) {
        const current = await getItem(itemId);
        return [textMessage(`รายการ #${itemId} ถูกดำเนินการแล้ว (${current?.status ?? "ไม่พบ"}${current?.decided_by ? ` โดย ${current.decided_by}` : ""})`)];
      }
      const kind = (await getBatchKind(item.batch_id)) ?? "edit";
      return [flex(`รายการ #${item.id}: ${item.status}`, [itemBubble(item, kind)]), textMessage(`บันทึกแล้ว โดย ${label}`)];
    }

    case "claim": {
      if (!can(actor, "claim_handoff")) return [DENIED];
      const id = Number(p.get("h"));
      const h = await claimHandoff(id, actor.userId, label);
      if (!h) {
        const current = await getHandoff(id);
        return [textMessage(`เรื่อง #${id} ${current?.claimed_by_name ? `รับโดย ${current.claimed_by_name} แล้ว` : "ถูกดำเนินการแล้ว"}`)];
      }
      return [textMessage(`✅ ${label} รับเรื่อง #${id} แล้ว (${formatThai(h.claimed_at)}) — หยุดเตือนซ้ำ`)];
    }
    case "resolve": {
      if (!can(actor, "claim_handoff")) return [DENIED];
      const h = await resolveHandoff(Number(p.get("h")), actor.userId);
      return [textMessage(h ? `ปิดเรื่อง #${h.id} แล้ว\nหากต้องการให้ AI ตอบแชทนี้ต่อ ใช้ปุ่ม “เปิด AI แชทนี้” หรือคำสั่ง ONAI` : "เรื่องนี้ถูกปิดไปแล้ว")];
    }
    case "resume": {
      const chatId = p.get("c") ?? "";
      return [await propose(actor, { type: "chat_ai", chatId, enabled: true })];
    }
    default:
      return [];
  }
}

// ─── helpers ───────────────────────────────────────────────

async function statusMessage(): Promise<messagingApi.Message> {
  const s = await getSettings();
  const sheet = await getSheetState();
  const pending = await listPendingBatches();
  const { count: openHandoffs } = await db()
    .from("handoffs")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  const offChats = await listAiOffChats();
  const disabled = await getDisabledTopics();
  const onOff = (b: boolean) => (b ? "เปิด" : "ปิด");

  return flex("สถานะระบบ Expert Watch AI", [
    bubble({
      title: "สถานะระบบ",
      subtitle: formatThai(new Date()),
      fields: [
        ["โหมด", s.mode === "live" ? "LIVE" : `TEST (${s.testUsers.length} บัญชีทดสอบ)`],
        ["LINE OA", onOff(s.channels.line)],
        ["Messenger", onOff(s.channels.messenger)],
        ["Google Sheets", { ok: "ปกติ", down: "ขัดข้อง (ใช้ข้อมูลสำรอง)", recovering: "รอเลือกข้อมูล" }[sheet.status]],
        ["รออนุมัติ", `${pending.reduce((n, b) => n + b.pending, 0)} รายการ / ${pending.length} ชุด`],
        ["รอเจ้าหน้าที่", `${openHandoffs ?? 0} เรื่อง`],
        ["แชทที่หยุด AI", `${offChats.length}`],
        ["หัวข้อที่ปิด", disabled.map((t) => t.value).join(", ") || "-"],
      ],
    }),
  ]);
}

async function testAsk(question: string): Promise<messagingApi.Message> {
  if (!question) return textMessage("รูปแบบ: ASK <คำถาม>");
  const r = await generateReply({ texts: [question], media: [], context: [], greeted: false });
  return flex("ผลทดสอบ AI", [
    bubble({
      title: "🧪 ผลทดสอบ AI",
      subtitle: "ไม่ได้ส่งถึงลูกค้า",
      fields: [
        ["ผลลัพธ์", r.action === "answer" ? "ตอบเอง" : r.action === "request" ? "บันทึกคำขอ" : `ส่งต่อ: ${HANDOFF_LABEL[r.handoffCategory!]}`],
        ["อ้างอิง", r.citedIds.join(", ") || "-"],
      ],
      sections: [
        { heading: "คำถาม", text: question },
        { heading: "คำตอบที่ลูกค้าจะได้รับ", text: r.reply },
        ...(r.draftReply ? [{ heading: "ร่างคำตอบสำหรับ Admin", text: r.draftReply }] : []),
        { heading: "trace", text: r.trace.join("\n") },
      ],
    }),
  ]);
}

async function aiChannelCommand(actor: Actor, args: string[]): Promise<messagingApi.Message> {
  const channel = args[0]?.toLowerCase();
  const state = args[1]?.toUpperCase();
  if ((channel !== "line" && channel !== "messenger") || (state !== "ON" && state !== "OFF")) {
    return textMessage("รูปแบบ: AI LINE ON|OFF หรือ AI MESSENGER ON|OFF");
  }
  return propose(actor, { type: "set_channel", channel, enabled: state === "ON" });
}

async function topicCommand(actor: Actor, args: string[]): Promise<messagingApi.Message> {
  const [state, kind, ...valueParts] = args;
  const value = valueParts.join(" ").trim();
  const k = kind?.toLowerCase() as TopicKind;
  if (!["ON", "OFF"].includes(state?.toUpperCase()) || !(k in TOPIC_KIND_LABEL) || !value) {
    return textMessage("รูปแบบ: TOPIC OFF brand Rolex\nประเภท: service / brand / model");
  }
  return propose(actor, { type: "set_topic", kind: k, value, enabled: state.toUpperCase() === "ON" });
}

async function topicsMessage(): Promise<messagingApi.Message> {
  const disabled = await getDisabledTopics();
  return textMessage(
    disabled.length
      ? `หัวข้อที่ปิดการตอบ:\n${disabled.map((t) => `• ${TOPIC_KIND_LABEL[t.kind]}: ${t.value}`).join("\n")}`
      : "ไม่มีหัวข้อที่ปิดอยู่",
  );
}

async function chatAiCommand(actor: Actor, ref: string, enabled: boolean): Promise<messagingApi.Message> {
  const chat = await getChatByRef(ref);
  if (!chat) return textMessage(`ไม่พบแชท ${ref}`);
  return propose(actor, { type: "chat_ai", chatId: chat.id, enabled });
}

async function offAiList(): Promise<messagingApi.Message> {
  const chats = await listAiOffChats();
  if (!chats.length) return textMessage("ไม่มีแชทที่หยุด AI");
  return flex(
    `แชทที่หยุด AI (${chats.length})`,
    chats.slice(0, 12).map((c) =>
      bubble({
        title: c.ref_code,
        subtitle: CHANNEL_LABEL[c.channel],
        fields: [
          ["เหตุผล", c.ai_off_reason ? (HANDOFF_LABEL[c.ai_off_reason as keyof typeof HANDOFF_LABEL] ?? c.ai_off_reason) : "-"],
          ["ตั้งแต่", formatThai(c.ai_off_at)],
        ],
        buttons: [{ label: "เปิด AI แชทนี้", data: `a=resume&c=${encodeURIComponent(c.id)}`, primary: true }],
      }),
    ),
  );
}

async function openHandoffsMessage(): Promise<messagingApi.Message> {
  const rows = must(
    await db().from("handoffs").select("*").in("status", ["open", "claimed"]).order("id", { ascending: false }).limit(10),
  ) as Handoff[];
  if (!rows.length) return textMessage("ไม่มีเรื่องที่รอเจ้าหน้าที่");
  const bubbles = [];
  for (const h of rows) {
    const chat = await getChat(h.chat_id);
    if (chat) bubbles.push((await handoffMessage(h, chat, false) as unknown as { contents: Record<string, unknown> }).contents);
  }
  return flex(`เรื่องที่รอเจ้าหน้าที่ (${rows.length})`, bubbles);
}

async function pendingMessage(): Promise<messagingApi.Message> {
  const batches = await listPendingBatches();
  if (!batches.length) return textMessage("ไม่มีรายการรออนุมัติ");
  return flex(
    "รายการรออนุมัติ",
    batches.slice(0, 12).map((b) =>
      bubble({
        title: `ชุด #${b.id}`,
        subtitle: `${b.kind === "recovery" ? "กู้คืนข้อมูล" : b.kind === "line" ? "แก้ไขผ่าน LINE" : "Google Sheets"} · ${formatThai(b.created_at)}`,
        fields: [["รอพิจารณา", `${b.pending} รายการ`]],
        buttons: [{ label: "ดูรายการ", data: `a=batch_page&b=${b.id}&p=0`, primary: true }],
      }),
    ),
  );
}

async function findMessage(term: string): Promise<messagingApi.Message> {
  if (!term) return textMessage("รูปแบบ: FIND <คำค้น>");
  const items = await searchKnowledge(term);
  if (!items.length) return textMessage("ไม่พบข้อมูล Approved ที่ตรงกับคำค้น");
  return textMessage(
    items
      .map((i) => `[${knowledgeCode(i.seq)}] ${i.sheet}${i.source === "line" ? " (LINE)" : ""}\nQ: ${i.question}\nA: ${i.answer.slice(0, 200)}`)
      .join("\n\n"),
  );
}

async function addKnowledge(actor: Actor, arg: string): Promise<messagingApi.Message> {
  if (!can(actor, "manage_knowledge")) return DENIED;
  const [sheet, question, answer] = arg.split("|").map((s) => s.trim());
  if (!sheet || !question || !answer) return textMessage("รูปแบบ: ADD <หมวด> | <คำถาม> | <คำตอบ>");
  const batch = await createBatch(
    "line",
    [
      {
        key: `line::${sheet}::${normalizeQuestion(question)}`,
        sheet,
        type: "add",
        row: null,
        old: null,
        new: { question, answer },
        newHash: contentHash(question, answer),
      },
    ],
    { createdBy: actor.userId, source: "line" },
  );
  return textMessage(`ส่งคำขอเพิ่มข้อมูลเข้ากลุ่ม Admin เพื่ออนุมัติแล้ว (ชุด #${batch.id})`);
}

async function lineItemByCode(code: string) {
  const seq = Number(code.replace(/^K/i, ""));
  if (!seq) return { error: "รหัสข้อมูลไม่ถูกต้อง (เช่น K12)" };
  const item = await getKnowledgeBySeq(seq);
  if (!item) return { error: `ไม่พบ ${code}` };
  if (item.source !== "line") return { error: `${code} มาจาก Google Sheets — กรุณาแก้ไขใน Sheet แล้วระบบจะส่งขออนุมัติอัตโนมัติ` };
  return { item };
}

async function editKnowledge(actor: Actor, arg: string): Promise<messagingApi.Message> {
  if (!can(actor, "manage_knowledge")) return DENIED;
  const [code, answer] = arg.split("|").map((s) => s.trim());
  if (!code || !answer) return textMessage("รูปแบบ: EDIT K12 | <คำตอบใหม่>");
  const found = await lineItemByCode(code);
  if (!found.item) return textMessage(found.error!);
  const { item } = found;
  const batch = await createBatch(
    "line",
    [
      {
        key: item.key,
        sheet: item.sheet,
        type: "update",
        row: null,
        old: { question: item.question, answer: item.answer },
        new: { question: item.question, answer },
        newHash: contentHash(item.question, answer),
      },
    ],
    { createdBy: actor.userId, source: "line" },
  );
  return textMessage(`ส่งคำขอแก้ไข ${code} เพื่ออนุมัติแล้ว (ชุด #${batch.id})`);
}

async function deleteKnowledge(actor: Actor, code: string): Promise<messagingApi.Message> {
  if (!can(actor, "manage_knowledge")) return DENIED;
  const found = await lineItemByCode(code);
  if (!found.item) return textMessage(found.error!);
  const { item } = found;
  const batch = await createBatch(
    "line",
    [
      {
        key: item.key,
        sheet: item.sheet,
        type: "delete",
        row: null,
        old: { question: item.question, answer: item.answer },
        new: null,
        newHash: "DELETED",
      },
    ],
    { createdBy: actor.userId, source: "line" },
  );
  return textMessage(`ส่งคำขอลบ ${code} เพื่ออนุมัติแล้ว (ชุด #${batch.id})`);
}

async function adminsMessage(actor: Actor): Promise<messagingApi.Message> {
  if (!can(actor, "manage_admins")) return DENIED;
  const admins = await listAdmins();
  return textMessage(
    `Admin ที่มีสิทธิ์:\n${admins.map((a) => `• ${a.display_name ?? "-"} (${a.role})\n  ${a.line_user_id}`).join("\n") || "(ไม่มี)"}\n\nSuper Admin กำหนดผ่าน SUPER_ADMIN_LINE_USER_IDS`,
  );
}

async function adminCommand(actor: Actor, args: string[]): Promise<messagingApi.Message> {
  const [op, userId, ...nameParts] = args;
  if (!userId || !["ADD", "REMOVE"].includes(op?.toUpperCase())) {
    return textMessage("รูปแบบ: ADMIN ADD <userId> [ชื่อ] หรือ ADMIN REMOVE <userId>");
  }
  if (op.toUpperCase() === "ADD") return propose(actor, { type: "grant_admin", userId, name: nameParts.join(" ") || null });
  return propose(actor, { type: "revoke_admin", userId });
}
