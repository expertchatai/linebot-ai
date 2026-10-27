import { hasRedis, redis } from "./redis";

// Recent chat turns per LINE user, so follow-up questions make sense.
// Stored in Upstash Redis when configured (survives deploys and cold starts);
// otherwise kept in memory, which only lasts while one Vercel instance stays warm.
const MAX_TURNS = 6;
const EXPIRE_SECONDS = 30 * 60;

export interface Turn {
  role: "user" | "model";
  text: string;
}

const memory = new Map<string, { turns: Turn[]; at: number }>();
const key = (userId: string) => `chat:${userId}`;

export async function getHistory(userId: string): Promise<Turn[]> {
  if (hasRedis()) {
    try {
      const raw = await redis(["GET", key(userId)]);
      return typeof raw === "string" ? (JSON.parse(raw) as Turn[]) : [];
    } catch (e) {
      console.error("[history] Redis read failed", e);
      return [];
    }
  }
  const chat = memory.get(userId);
  if (!chat || Date.now() - chat.at > EXPIRE_SECONDS * 1000) {
    memory.delete(userId);
    return [];
  }
  return chat.turns;
}

export async function addTurns(userId: string, ...turns: Turn[]) {
  const all = [...(await getHistory(userId)), ...turns].slice(-MAX_TURNS * 2);
  if (hasRedis()) {
    try {
      await redis(["SET", key(userId), JSON.stringify(all), "EX", EXPIRE_SECONDS]);
    } catch (e) {
      console.error("[history] Redis write failed", e);
    }
    return;
  }
  memory.set(userId, { turns: all, at: Date.now() });
}
