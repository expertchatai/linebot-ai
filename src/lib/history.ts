// Recent chat turns per LINE user, kept in memory so follow-up questions make sense.
// Lives as long as the Vercel instance stays warm; a cold start simply starts a fresh conversation.
const MAX_TURNS = 6;
const EXPIRE_MS = 30 * 60 * 1000;

export interface Turn {
  role: "user" | "model";
  text: string;
}

const chats = new Map<string, { turns: Turn[]; at: number }>();

export function getHistory(userId: string): Turn[] {
  const chat = chats.get(userId);
  if (!chat || Date.now() - chat.at > EXPIRE_MS) {
    chats.delete(userId);
    return [];
  }
  return chat.turns;
}

export function addTurns(userId: string, ...turns: Turn[]) {
  const all = [...getHistory(userId), ...turns].slice(-MAX_TURNS * 2);
  chats.set(userId, { turns: all, at: Date.now() });
}
