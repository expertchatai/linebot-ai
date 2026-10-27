import { messagingApi, validateSignature } from "@line/bot-sdk";
import { env } from "./env";

let client: messagingApi.MessagingApiClient | null = null;
const line = () => (client ??= new messagingApi.MessagingApiClient({ channelAccessToken: env.lineAccessToken() }));

let blobClient: messagingApi.MessagingApiBlobClient | null = null;
const blob = () => (blobClient ??= new messagingApi.MessagingApiBlobClient({ channelAccessToken: env.lineAccessToken() }));

/** Downloads a photo the customer sent, as base64 for Gemini. LINE stores chat photos as JPEG. */
export async function getImage(messageId: string): Promise<{ data: string; mimeType: string }> {
  const chunks: Buffer[] = [];
  for await (const chunk of await blob().getMessageContent(messageId)) chunks.push(Buffer.from(chunk));
  return { data: Buffer.concat(chunks).toString("base64"), mimeType: "image/jpeg" };
}

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

/** The customer's LINE display name, or "" if it can't be read. */
export async function getDisplayName(userId: string | undefined): Promise<string> {
  if (!userId) return "";
  try {
    return (await line().getProfile(userId)).displayName;
  } catch {
    // Name is only for a friendlier reply; carry on without it.
    return "";
  }
}

/** Tells the admin group that a customer is waiting for a human. Does nothing until ADMIN_GROUP_ID is set. */
export async function notifyAdmins(name: string, question: string) {
  const groupId = env.adminGroupId();
  if (!groupId) return;
  const text = `🔔 มีลูกค้ารอเจ้าหน้าที่ตอบ\nชื่อ: ${name || "ลูกค้า"}\nคำถาม: ${question}\n\nเข้าไปตอบใน LINE OA Manager → แชท`;
  await line().pushMessage({ to: groupId, messages: [{ type: "text", text: text.slice(0, 5000) }] });
}
