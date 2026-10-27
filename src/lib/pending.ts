import { hasRedis, redis } from "./redis";

// LINE delivers a photo and its caption as separate messages. Each message is queued here,
// and only the last one to arrive within the wait window answers, using everything queued.
// Photos take a while to send (and often come in a set), so they get a longer window than text.
export const waitMs = (type: "text" | "image") => (type === "image" ? 10_000 : 3_000);

export interface PendingMessage {
  id: string;
  type: "text" | "image";
  text?: string;
}

const memory = new Map<string, { queue: PendingMessage[]; latest: string }>();

export async function enqueue(userId: string, message: PendingMessage) {
  if (hasRedis()) {
    await redis(["RPUSH", `pending:${userId}`, JSON.stringify(message)]);
    await redis(["EXPIRE", `pending:${userId}`, 60]);
    await redis(["SET", `latest:${userId}`, message.id, "EX", 60]);
    return;
  }
  const entry = memory.get(userId) ?? { queue: [], latest: "" };
  entry.queue.push(message);
  entry.latest = message.id;
  memory.set(userId, entry);
}

/** After the wait, returns every queued message if `messageId` is still the newest; otherwise []. */
export async function takeIfLatest(messageId: string, userId: string): Promise<PendingMessage[]> {
  if (hasRedis()) {
    if ((await redis(["GET", `latest:${userId}`])) !== messageId) return [];
    // LPOP with a count empties the queue atomically; anything arriving later queues anew.
    const raw = (await redis(["LPOP", `pending:${userId}`, 100])) as string[] | null;
    return (raw ?? []).map((r) => JSON.parse(r) as PendingMessage);
  }
  const entry = memory.get(userId);
  if (!entry || entry.latest !== messageId) return [];
  memory.delete(userId);
  return entry.queue;
}
