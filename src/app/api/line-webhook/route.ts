import { after, NextResponse, type NextRequest } from "next/server";
import { answer, FALLBACK_REPLY, isHandoff, splitBubbles } from "@/lib/gemini";
import { addTurns, getHistory } from "@/lib/history";
import { getDisplayName, getImage, notifyAdmins, reply, showLoading, verifySignature } from "@/lib/line";
import { enqueue, takeIfLatest, waitMs, type PendingMessage } from "@/lib/pending";

export const runtime = "nodejs";
export const maxDuration = 60;

interface LineEvent {
  type: string;
  replyToken?: string;
  source: { type: string; userId?: string; groupId?: string };
  message?: { id: string; type: string; text?: string };
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!verifySignature(body, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const { events = [] } = JSON.parse(body) as { events?: LineEvent[] };
  for (const event of events) {
    // Added to a group: post its ID so it can be set as ADMIN_GROUP_ID.
    if (event.type === "join" && event.source.groupId && event.replyToken) {
      const { replyToken, source } = event;
      const text = `Group ID ของกลุ่มนี้:\n${source.groupId}\n\nนำไปใส่ใน Vercel เป็น ADMIN_GROUP_ID เพื่อรับแจ้งเตือนเมื่อลูกค้ารอเจ้าหน้าที่`;
      after(() => reply(replyToken, [text]).catch((e) => console.error("[line-webhook] join reply failed", e)));
      continue;
    }
    // Only answer 1:1 chats, so the bot stays quiet in the admin group.
    const { message, replyToken } = event;
    const userId = event.source.userId;
    if (event.source.type !== "user" || !userId) continue;
    if (event.type !== "message" || !message || !replyToken) continue;
    if (message.type !== "text" && message.type !== "image") continue;

    // Respond to LINE right away; answer in the background.
    after(async () => {
      await showLoading(userId);
      // Wait for a caption or more photos, then answer everything in one reply.
      const pending: PendingMessage = { id: message.id, type: message.type as "text" | "image", text: message.text };
      let batch: PendingMessage[] = [pending];
      try {
        await enqueue(userId, pending);
        await new Promise((r) => setTimeout(r, waitMs(pending.type)));
        batch = await takeIfLatest(message.id, userId);
      } catch (e) {
        console.error("[line-webhook] batching failed, answering this message alone", e);
      }
      if (!batch.length) return; // A newer message will answer for this one.

      const photos = batch.filter((m) => m.type === "image");
      const texts = batch.filter((m) => m.type === "text").map((m) => m.text ?? "");
      // A photo has no text; this placeholder is what the bot remembers and what admins see.
      const question = [...(photos.length ? [`[ลูกค้าส่งรูปนาฬิกา ${photos.length} รูป]`] : []), ...texts].join("\n");

      const customerName = await getDisplayName(userId);
      let text = FALLBACK_REPLY;
      try {
        const images = await Promise.all(photos.map((p) => getImage(p.id)));
        text = await answer(question, { history: await getHistory(userId), images, customerName });
        await addTurns(userId, { role: "user", text: question }, { role: "model", text });
      } catch (e) {
        console.error("[line-webhook] answer failed", e);
      }
      try {
        await reply(replyToken, splitBubbles(text));
      } catch (e) {
        console.error("[line-webhook] reply failed", e);
      }
      if (isHandoff(text)) {
        try {
          await notifyAdmins(customerName, question);
        } catch (e) {
          console.error("[line-webhook] admin alert failed", e);
        }
      }
    });
  }
  return NextResponse.json({ ok: true });
}
