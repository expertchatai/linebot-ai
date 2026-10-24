import { logEvent, errorMessage } from "@/lib/events";
import { incrementStat } from "@/lib/stats";
import { openHandoff } from "@/modules/handoff/handoff";
import { markReplied } from "@/modules/messaging/chats";
import { downloadLineContent } from "@/modules/messaging/line";
import { downloadMessengerAttachment } from "@/modules/messaging/messenger";
import { sendToCustomer, showTyping } from "@/modules/messaging/outbound";
import type { BufferedMessage, Chat } from "@/modules/messaging/types";
import { createCustomerRequest } from "@/modules/requests/requests";
import { clearContext, loadContext, saveContext } from "./context";
import { generateReply, handoffReply, type EngineMedia } from "./engine";

const GREETING_WINDOW_MS = 6 * 60 * 60 * 1000;

async function fetchMedia(chat: Chat, ref: string) {
  return chat.channel === "line" ? downloadLineContent(ref) : downloadMessengerAttachment(ref);
}

/** Handles one merged customer turn (all messages received within the quiet window). */
export async function handleCustomerTurn(chat: Chat, messages: BufferedMessage[]) {
  const replyToken = [...messages].reverse().find((m) => m.reply_token)?.reply_token ?? null;
  const parts = messages.map((m) => m.part);
  const texts = parts.filter((p) => p.kind === "text" && p.text).map((p) => p.text!);
  const lang = texts.join("").match(/[฀-๿]/) || !texts.length ? "th" : "en";

  await incrementStat(chat.channel, "questions");

  // Videos and files are forwarded to staff without analysis.
  const unsupported = parts.find((p) => p.kind === "video" || p.kind === "file");
  if (unsupported) {
    await sendToCustomer(chat, handoffReply(lang), replyToken);
    await openHandoff(chat, {
      category: unsupported.kind === "video" ? "video" : "file",
      summary: texts.length ? texts.join("\n").slice(0, 300) : "ลูกค้าส่งวิดีโอ/ไฟล์ (ไม่ได้วิเคราะห์)",
    });
    await clearContext(chat.id);
    return;
  }

  await showTyping(chat);

  // Media is held in memory for this request only.
  const media: EngineMedia[] = [];
  for (const p of parts) {
    if ((p.kind === "image" || p.kind === "audio") && p.mediaRef) {
      try {
        const { data, mime } = await fetchMedia(chat, p.mediaRef);
        media.push({ kind: p.kind, mime: p.mime ?? mime, data });
      } catch (e) {
        await logEvent("warn", "media", `ดาวน์โหลดไฟล์ลูกค้าไม่สำเร็จ (${chat.ref_code}): ${errorMessage(e)}`);
      }
    }
  }

  const context = await loadContext(chat.id);
  const greeted =
    !!chat.last_bot_reply_at && Date.now() - new Date(chat.last_bot_reply_at).getTime() < GREETING_WINDOW_MS;

  let result;
  try {
    result = await generateReply({ texts, media, context, greeted });
  } catch (e) {
    await logEvent("error", "ai", `Gemini error (${chat.ref_code}): ${errorMessage(e)}`);
    await sendToCustomer(chat, handoffReply(lang), replyToken);
    await openHandoff(chat, { category: "unanswerable", summary: `${texts.join("\n").slice(0, 300)}\n(AI ขัดข้อง)` });
    return;
  }

  const customerText = [
    result.transcript ? `[เสียง] ${result.transcript}` : "",
    ...texts,
    ...media.map((m) => (m.kind === "image" ? "[ภาพ]" : "")),
  ]
    .filter(Boolean)
    .join("\n");

  const sent = await sendToCustomer(chat, result.reply, replyToken);
  if (sent) await markReplied(chat.id);

  if (result.action === "handoff") {
    await openHandoff(chat, {
      category: result.handoffCategory ?? "unanswerable",
      summary: result.summary || customerText.slice(0, 300),
      draftReply: result.draftReply,
    });
    await clearContext(chat.id);
    return;
  }

  if (result.action === "request" && result.request) {
    const requestId = await createCustomerRequest(chat, result.request);
    // AI keeps answering other questions; staff coordinate and confirm the appointment.
    await openHandoff(chat, { category: "request", summary: result.summary, pauseAi: false, requestId });
  } else {
    await incrementStat(chat.channel, "ai_answers");
  }

  await saveContext(chat.id, [
    ...context,
    { role: "customer", text: customerText || "(สื่อ)" },
    { role: "assistant", text: result.reply },
  ]);
}
