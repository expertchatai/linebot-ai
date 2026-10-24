import { logEvent, errorMessage } from "@/lib/events";
import { incrementStat } from "@/lib/stats";
import { sendLineText, showLineLoading } from "./line";
import { sendMessengerText, showMessengerTyping } from "./messenger";
import type { Chat } from "./types";

export async function sendToCustomer(chat: Chat, text: string, replyToken?: string | null): Promise<boolean> {
  try {
    if (chat.channel === "line") await sendLineText(chat.external_id, text, replyToken);
    else await sendMessengerText(chat.external_id, text);
    await incrementStat(chat.channel, "messages_sent");
    return true;
  } catch (e) {
    await incrementStat(chat.channel, "send_errors");
    await logEvent("error", `send.${chat.channel}`, `ส่งข้อความถึงลูกค้าไม่สำเร็จ (${chat.ref_code}): ${errorMessage(e)}`, {
      chatRef: chat.ref_code,
    });
    return false;
  }
}

export async function showTyping(chat: Chat) {
  if (chat.channel === "line") await showLineLoading(chat.external_id);
  else await showMessengerTyping(chat.external_id);
}
