import { after, NextResponse, type NextRequest } from "next/server";
import { answer, FALLBACK_REPLY, isHandoff } from "@/lib/gemini";
import { addTurns, getHistory } from "@/lib/history";
import { getDisplayName, getImage, notifyAdmins, reply, showLoading, verifySignature } from "@/lib/line";

export const runtime = "nodejs";
export const maxDuration = 30;

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
      after(() => reply(replyToken, text).catch((e) => console.error("[line-webhook] join reply failed", e)));
      continue;
    }
    // Only answer 1:1 chats, so the bot stays quiet in the admin group.
    if (event.source.type !== "user") continue;
    const message = event.message;
    if (event.type !== "message" || !message || !event.replyToken) continue;
    if (message.type !== "text" && message.type !== "image") continue;
    const { replyToken } = event;
    // A photo has no text; this placeholder is what the bot remembers and what admins see.
    const question = message.type === "image" ? "[ลูกค้าส่งรูปนาฬิกา]" : (message.text ?? "");
    const userId = event.source.userId;

    // Respond to LINE right away; answer in the background.
    after(async () => {
      if (userId) await showLoading(userId);
      const customerName = await getDisplayName(userId);
      let text = FALLBACK_REPLY;
      try {
        const image = message.type === "image" ? await getImage(message.id) : undefined;
        text = await answer(question, { history: userId ? await getHistory(userId) : [], image, customerName });
        if (userId) await addTurns(userId, { role: "user", text: question }, { role: "model", text });
      } catch (e) {
        console.error("[line-webhook] answer failed", e);
      }
      try {
        await reply(replyToken, text);
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
