import { messagingApi, validateSignature } from "@line/bot-sdk";
import { env } from "@/lib/env";

let customerClient: messagingApi.MessagingApiClient | null = null;
let adminClient: messagingApi.MessagingApiClient | null = null;

export function lineCustomer(): messagingApi.MessagingApiClient {
  customerClient ??= new messagingApi.MessagingApiClient({ channelAccessToken: env.lineCustomer().token });
  return customerClient;
}

export function lineAdmin(): messagingApi.MessagingApiClient {
  adminClient ??= new messagingApi.MessagingApiClient({ channelAccessToken: env.lineAdmin().token });
  return adminClient;
}

export function verifyLineSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  try {
    return validateSignature(body, secret, signature);
  } catch {
    return false;
  }
}

/** Downloads image/audio content into memory only. */
export async function downloadLineContent(messageId: string): Promise<{ data: Buffer; mime: string }> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${env.lineCustomer().token}` },
  });
  if (!res.ok) throw new Error(`LINE content download failed: ${res.status}`);
  return {
    data: Buffer.from(await res.arrayBuffer()),
    mime: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

export async function sendLineText(userId: string, text: string, replyToken?: string | null) {
  const messages: messagingApi.Message[] = [{ type: "text", text: text.slice(0, 5000) }];
  if (replyToken) {
    try {
      await lineCustomer().replyMessage({ replyToken, messages });
      return;
    } catch {
      // Reply tokens expire after about a minute; fall back to push.
    }
  }
  await lineCustomer().pushMessage({ to: userId, messages });
}

export async function showLineLoading(userId: string) {
  try {
    await lineCustomer().showLoadingAnimation({ chatId: userId, loadingSeconds: 20 });
  } catch {
    // Cosmetic only.
  }
}

export async function getLineDisplayName(userId: string): Promise<string | null> {
  try {
    return (await lineCustomer().getProfile(userId)).displayName;
  } catch {
    return null;
  }
}
