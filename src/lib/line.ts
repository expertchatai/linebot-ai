import { messagingApi, validateSignature } from "@line/bot-sdk";
import { env } from "./env";

let client: messagingApi.MessagingApiClient | null = null;
const line = () => (client ??= new messagingApi.MessagingApiClient({ channelAccessToken: env.lineAccessToken() }));

export function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  try {
    return validateSignature(body, env.lineChannelSecret(), signature);
  } catch {
    return false;
  }
}

export async function reply(replyToken: string, text: string) {
  await line().replyMessage({ replyToken, messages: [{ type: "text", text: text.slice(0, 5000) }] });
}

/** Shows the "typing…" dots while Gemini is thinking. */
export async function showLoading(userId: string) {
  try {
    await line().showLoadingAnimation({ chatId: userId, loadingSeconds: 10 });
  } catch {
    // Cosmetic only.
  }
}
