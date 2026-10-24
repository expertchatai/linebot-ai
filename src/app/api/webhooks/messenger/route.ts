import { after, NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { firstSeen } from "@/lib/dedupe";
import { logEvent, errorMessage } from "@/lib/events";
import { safeEqualString } from "@/lib/session";
import { sendMessengerText, verifyMessengerSignature } from "@/modules/messaging/messenger";
import { acceptInbound, processAfterQuietWindow, TESTER_ID_COMMAND } from "@/modules/messaging/inbound";
import type { InboundPart } from "@/modules/messaging/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface MessagingEvent {
  sender: { id: string };
  message?: {
    mid: string;
    is_echo?: boolean;
    text?: string;
    attachments?: { type: string; payload?: { url?: string } }[];
  };
}

const ATTACHMENT_KIND: Record<string, InboundPart["kind"]> = {
  image: "image",
  audio: "audio",
  video: "video",
  file: "file",
};

/** Webhook verification handshake. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token = q.get("hub.verify_token") ?? "";
  if (q.get("hub.mode") === "subscribe" && safeEqualString(token, env.messenger().verifyToken)) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!verifyMessengerSignature(body, req.headers.get("x-hub-signature-256"))) {
    await logEvent("warn", "webhook.messenger", "ลายเซ็น webhook ไม่ถูกต้อง");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body) as { object?: string; entry?: { messaging?: MessagingEvent[] }[] };
  if (payload.object !== "page") return NextResponse.json({ ok: true });

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      try {
        const msg = event.message;
        if (!msg || msg.is_echo) continue;
        if (!(await firstSeen(msg.mid, "messenger"))) continue;

        if (msg.text?.trim().toUpperCase() === TESTER_ID_COMMAND) {
          await sendMessengerText(event.sender.id, `Tester ID: ${event.sender.id}`);
          continue;
        }

        const parts: InboundPart[] = [];
        if (msg.text) parts.push({ kind: "text", text: msg.text });
        for (const a of msg.attachments ?? []) {
          const kind = ATTACHMENT_KIND[a.type];
          if (kind && a.payload?.url) parts.push({ kind, mediaRef: a.payload.url });
        }

        for (const part of parts) {
          const accepted = await acceptInbound("messenger", event.sender.id, part, null);
          if (accepted) after(() => processAfterQuietWindow(accepted.chatId, accepted.bufferId));
        }
      } catch (e) {
        await logEvent("error", "webhook.messenger", `รับข้อความไม่สำเร็จ: ${errorMessage(e)}`);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
