// Short-lived, text-only conversation memory. Expires after inactivity — never permanent history.
import { db } from "@/lib/db";

export const CONTEXT_TTL_MS = 30 * 60 * 1000;
const MAX_TURNS = 8;

export interface Turn {
  role: "customer" | "assistant";
  text: string;
}

export async function loadContext(chatId: string): Promise<Turn[]> {
  const { data } = await db()
    .from("chat_context")
    .select("turns, expires_at")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return [];
  return data.turns as Turn[];
}

export async function saveContext(chatId: string, turns: Turn[]) {
  await db()
    .from("chat_context")
    .upsert({
      chat_id: chatId,
      turns: turns.slice(-MAX_TURNS),
      expires_at: new Date(Date.now() + CONTEXT_TTL_MS).toISOString(),
    });
}

export async function clearContext(chatId: string) {
  await db().from("chat_context").delete().eq("chat_id", chatId);
}
