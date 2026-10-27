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

/** Tells the admin group that a customer is waiting for a human. Does nothing until ADMIN_GROUP_ID is set. */
export async function notifyAdmins(userId: string | undefined, question: string) {
  const groupId = env.adminGroupId();
  if (!groupId) return;
  let name = "ลูกค้า";
  if (userId) {
    try {
      name = (await line().getProfile(userId)).displayName;
    } catch {
      // Profile is only for display; send the alert anyway.
    }
  }
  const text = `🔔 มีลูกค้ารอเจ้าหน้าที่ตอบ\nชื่อ: ${name}\nคำถาม: ${question}\n\nเข้าไปตอบใน LINE OA Manager → แชท`;
  await line().pushMessage({ to: groupId, messages: [{ type: "text", text: text.slice(0, 5000) }] });
}
