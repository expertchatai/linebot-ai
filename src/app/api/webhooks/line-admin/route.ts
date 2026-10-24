import { NextResponse, type NextRequest } from "next/server";
import type { messagingApi } from "@line/bot-sdk";
import { env } from "@/lib/env";
import { firstSeen } from "@/lib/dedupe";
import { logEvent, errorMessage } from "@/lib/events";
import { handleAdminPostback, handleAdminText, type AdminSource } from "@/modules/admin/commands";
import { lineAdmin, verifyLineSignature } from "@/modules/messaging/line";
import { textMessage } from "@/modules/notifications/flex";

export const runtime = "nodejs";
export const maxDuration = 60;

interface LineEvent {
  type: string;
  webhookEventId: string;
  replyToken?: string;
  source: { type: string; userId?: string; groupId?: string };
  message?: { type: string; text?: string };
  postback?: { data: string };
}

/** Admin LINE OA webhook: staff commands, approvals and handoff buttons. */
export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!verifyLineSignature(body, req.headers.get("x-line-signature"), env.lineAdmin().secret)) {
    await logEvent("warn", "webhook.line-admin", "ลายเซ็น webhook ไม่ถูกต้อง");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const { events = [] } = JSON.parse(body) as { events?: LineEvent[] };
  for (const event of events) {
    try {
      if (!(await firstSeen(event.webhookEventId, "line-admin"))) continue;
      const source: AdminSource = { userId: event.source.userId, groupId: event.source.groupId };

      let messages: messagingApi.Message[] = [];
      if (event.type === "join" && source.groupId) {
        messages = [textMessage(`สวัสดีครับ Expert Watch AI พร้อมแจ้งเตือนในกลุ่มนี้\nGroup ID: ${source.groupId}`)];
      } else if (event.type === "message" && event.message?.type === "text") {
        messages = await handleAdminText(source, event.message.text ?? "");
      } else if (event.type === "postback" && event.postback) {
        messages = await handleAdminPostback(source, event.postback.data);
      }

      if (messages.length && event.replyToken) {
        await lineAdmin().replyMessage({ replyToken: event.replyToken, messages: messages.slice(0, 5) });
      }
    } catch (e) {
      await logEvent("error", "webhook.line-admin", `ประมวลผลคำสั่งไม่สำเร็จ: ${errorMessage(e)}`);
      if (event.replyToken) {
        await lineAdmin()
          .replyMessage({ replyToken: event.replyToken, messages: [textMessage("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง")] })
          .catch(() => {});
      }
    }
  }
  return NextResponse.json({ ok: true });
}
