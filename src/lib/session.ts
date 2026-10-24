// Dashboard session cookie: "<expiresAtMs>.<hex hmac>". Uses Web Crypto so it also runs in middleware.

export const SESSION_COOKIE = "ew_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(secret: string): Promise<string> {
  const expires = Date.now() + SESSION_TTL_MS;
  return `${expires}.${await hmac(secret, `dashboard:${expires}`)}`;
}

export async function verifySession(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return safeEqual(sig, await hmac(secret, `dashboard:${expires}`));
}

export function safeEqualString(a: string, b: string): boolean {
  return safeEqual(a, b);
}
