import { db, must } from "@/lib/db";
import { logEvent, errorMessage } from "@/lib/events";
import { sleep } from "@/lib/time";
import { getSettings } from "@/modules/admin/settings";
import { handleCustomerTurn } from "@/modules/ai/conversation";
import { getChat, getOrCreateChat, tryLockChat, unlockChat } from "./chats";
import type { BufferedMessage, Channel, InboundPart } from "./types";

/** Messages sent within this window are merged into one turn. */
export const QUIET_WINDOW_MS = 5_000;
const LOCK_SECONDS = 50;

/** Typed by a tester in the customer channel to get the id for TESTER ADD (works in any mode). */
export const TESTER_ID_COMMAND = "#MYID";

/**
 * Gatekeeper + buffer. Returns null when the AI must stay silent:
 * channel disabled, Test Mode for non-testers, or AI paused for this chat.
 */
export async function acceptInbound(
  channel: Channel,
  externalId: string,
  part: InboundPart,
  replyToken: string | null,
): Promise<{ chatId: string; bufferId: number } | null> {
  const settings = await getSettings();
  if (!settings.channels[channel]) return null;
  if (settings.mode !== "live" && !settings.testUsers.includes(externalId)) return null;

  const chat = await getOrCreateChat(channel, externalId);
  if (!chat.ai_enabled) return null;

  const row = must(
    await db().from("message_buffer").insert({ chat_id: chat.id, part, reply_token: replyToken }).select("id").single(),
  ) as { id: number };
  return { chatId: chat.id, bufferId: row.id };
}

async function latestBufferId(chatId: string): Promise<number | null> {
  const { data } = await db()
    .from("message_buffer")
    .select("id")
    .eq("chat_id", chatId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Runs after the webhook has responded. Only the newest message of a burst triggers processing. */
export async function processAfterQuietWindow(chatId: string, bufferId: number) {
  await sleep(QUIET_WINDOW_MS);
  if ((await latestBufferId(chatId)) !== bufferId) return;

  for (let attempt = 0; ; attempt++) {
    if (await tryLockChat(chatId, LOCK_SECONDS)) break;
    if (attempt >= 5) return; // The stale-buffer job will pick it up.
    await sleep(3_000);
  }
  try {
    await flushChat(chatId);
  } catch (e) {
    await logEvent("error", "inbound", `ประมวลผลข้อความไม่สำเร็จ (${chatId}): ${errorMessage(e)}`);
  } finally {
    await unlockChat(chatId);
  }
}

/** Takes every buffered message for the chat, deletes them, and answers once. */
export async function flushChat(chatId: string) {
  const rows = must(
    await db().from("message_buffer").select("*").eq("chat_id", chatId).order("id"),
  ) as BufferedMessage[];
  if (!rows.length) return;
  must(await db().from("message_buffer").delete().eq("chat_id", chatId).lte("id", rows[rows.length - 1].id));

  const chat = await getChat(chatId);
  if (!chat?.ai_enabled) return;
  await handleCustomerTurn(chat, rows);
}

/** Safety net for runs that died before processing (called by the job tick). */
export async function processStaleBuffers(): Promise<number> {
  const cutoff = new Date(Date.now() - 20_000).toISOString();
  const rows = must(
    await db().from("message_buffer").select("chat_id").lt("received_at", cutoff).limit(50),
  ) as { chat_id: string }[];
  const chatIds = [...new Set(rows.map((r) => r.chat_id))];
  for (const chatId of chatIds) {
    if (!(await tryLockChat(chatId, LOCK_SECONDS))) continue;
    try {
      await flushChat(chatId);
    } catch (e) {
      await logEvent("error", "inbound", `ประมวลผลข้อความค้างไม่สำเร็จ (${chatId}): ${errorMessage(e)}`);
    } finally {
      await unlockChat(chatId);
    }
  }
  return chatIds.length;
}
