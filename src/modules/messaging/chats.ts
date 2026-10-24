import { db, must } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { Channel, Chat } from "./types";

export const chatIdFor = (channel: Channel, externalId: string) => `${channel}:${externalId}`;

export async function getOrCreateChat(channel: Channel, externalId: string): Promise<Chat> {
  const id = chatIdFor(channel, externalId);
  must(
    await db()
      .from("chats")
      .upsert({ id, channel, external_id: externalId }, { onConflict: "id", ignoreDuplicates: true }),
  );
  return getChat(id) as Promise<Chat>;
}

export async function getChat(id: string): Promise<Chat | null> {
  return must(await db().from("chats").select("*").eq("id", id).maybeSingle()) as Chat | null;
}

export async function getChatByRef(ref: string): Promise<Chat | null> {
  return must(
    await db().from("chats").select("*").eq("ref_code", ref.trim().toUpperCase()).maybeSingle(),
  ) as Chat | null;
}

export async function listAiOffChats(): Promise<Chat[]> {
  return must(
    await db().from("chats").select("*").eq("ai_enabled", false).order("ai_off_at", { ascending: false }).limit(50),
  ) as Chat[];
}

export async function setAiEnabled(chatId: string, enabled: boolean, actor: string, reason?: string) {
  must(
    await db()
      .from("chats")
      .update(
        enabled
          ? { ai_enabled: true, ai_off_reason: null, ai_off_at: null, ai_off_by: null }
          : { ai_enabled: false, ai_off_reason: reason ?? null, ai_off_at: new Date().toISOString(), ai_off_by: actor },
      )
      .eq("id", chatId),
  );
  await audit(actor, enabled ? "chat.ai_on" : "chat.ai_off", { chatId, reason });
}

export async function markReplied(chatId: string) {
  await db().from("chats").update({ last_bot_reply_at: new Date().toISOString() }).eq("id", chatId);
}

export async function tryLockChat(chatId: string, seconds: number): Promise<boolean> {
  const { data, error } = await db().rpc("try_lock_chat", { p_chat_id: chatId, p_seconds: seconds });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function unlockChat(chatId: string) {
  await db().from("chats").update({ lock_until: null }).eq("id", chatId);
}
