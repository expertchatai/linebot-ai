import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export function verifyMessengerSignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", env.messenger().appSecret).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

async function graph(path: string, body: unknown) {
  const { pageToken, graphVersion } = env.messenger();
  const res = await fetch(`https://graph.facebook.com/${graphVersion}/${path}?access_token=${pageToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Messenger API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function sendMessengerText(psid: string, text: string) {
  // Messenger limits text messages to 2000 characters.
  for (let i = 0; i < text.length; i += 2000) {
    await graph("me/messages", {
      recipient: { id: psid },
      messaging_type: "RESPONSE",
      message: { text: text.slice(i, i + 2000) },
    });
  }
}

export async function showMessengerTyping(psid: string) {
  try {
    await graph("me/messages", { recipient: { id: psid }, sender_action: "typing_on" });
  } catch {
    // Cosmetic only.
  }
}

/** Downloads an attachment into memory only. */
export async function downloadMessengerAttachment(url: string): Promise<{ data: Buffer; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Messenger attachment download failed: ${res.status}`);
  return {
    data: Buffer.from(await res.arrayBuffer()),
    mime: res.headers.get("content-type") ?? "application/octet-stream",
  };
}
