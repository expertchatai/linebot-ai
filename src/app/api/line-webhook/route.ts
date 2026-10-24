import { after, NextResponse, type NextRequest } from "next/server";
import { answer, FALLBACK_REPLY } from "@/lib/gemini";
import { reply, showLoading, verifySignature } from "@/lib/line";

export const runtime = "nodejs";
export const maxDuration = 30;

interface LineEvent {
  type: string;
  replyToken?: string;
  source: { type: string; userId?: string };
  message?: { type: string; text?: string };
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!verifySignature(body, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const { events = [] } = JSON.parse(body) as { events?: LineEvent[] };
  for (const event of events) {
    if (event.type !== "message" || event.message?.type !== "text" || !event.replyToken) continue;
    const { replyToken } = event;
    const question = event.message.text ?? "";
    const userId = event.source.userId;

    // Respond to LINE right away; answer in the background.
    after(async () => {
      if (userId) await showLoading(userId);
      let text = FALLBACK_REPLY;
      try {
        text = await answer(question);
      } catch (e) {
        console.error("[line-webhook] answer failed", e);
      }
      try {
        await reply(replyToken, text);
      } catch (e) {
        console.error("[line-webhook] reply failed", e);
      }
    });
  }
  return NextResponse.json({ ok: true });
}
