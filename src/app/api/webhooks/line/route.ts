import { after, NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { firstSeen } from "@/lib/dedupe";
import { logEvent, errorMessage } from "@/lib/events";
import { sendLineText, verifyLineSignature } from "@/modules/messaging/line";
import { acceptInbound, processAfterQuietWindow, TESTER_ID_COMMAND } from "@/modules/messaging/inbound";
import type { InboundPart } from "@/modules/messaging/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface LineEvent {
  type: string;
  webhookEventId: string;
  replyToken?: string;
  source: { type: string; userId?: string };
  message?: { id: string; type: string; text?: string };
}

function toPart(m: NonNullable<LineEvent["message"]>): InboundPart | null {
  switch (m.type) {
    case "text":
      return { kind: "text", text: m.text ?? "" };
    case "image":
      return { kind: "image", mediaRef: m.id };
    case "audio":
      return { kind: "audio", mediaRef: m.id };
    case "video":
      return { kind: "video", mediaRef: m.id };
    case "file":
      return { kind: "file", mediaRef: m.id };
    default:
      return null; // stickers, locations: no reply
  }
}

/** Customer LINE OA webhook. */
export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!verifyLineSignature(body, req.headers.get("x-line-signature"), env.lineCustomer().secret)) {
    await logEvent("warn", "webhook.line", "ลายเซ็น webhook ไม่ถูกต้อง");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const { events = [] } = JSON.parse(body) as { events?: LineEvent[] };
  for (const event of events) {
    try {
      if (event.type !== "message" || event.source.type !== "user" || !event.source.userId || !event.message) continue;
      const part = toPart(event.message);
      if (!part) continue;
      if (!(await firstSeen(event.webhookEventId, "line"))) continue;

      if (part.text?.trim().toUpperCase() === TESTER_ID_COMMAND) {
        await sendLineText(event.source.userId, `Tester ID: ${event.source.userId}`, event.replyToken);
        continue;
      }

      const accepted = await acceptInbound("line", event.source.userId, part, event.replyToken ?? null);
      if (accepted) after(() => processAfterQuietWindow(accepted.chatId, accepted.bufferId));
    } catch (e) {
      await logEvent("error", "webhook.line", `รับข้อความไม่สำเร็จ: ${errorMessage(e)}`);
    }
  }
  return NextResponse.json({ ok: true });
}
