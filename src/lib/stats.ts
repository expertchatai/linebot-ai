import { db } from "./db";

export type Metric = "questions" | "ai_answers" | "handoffs" | "requests" | "messages_sent" | "send_errors";

export async function incrementStat(channel: string, metric: Metric, by = 1) {
  const { error } = await db().rpc("increment_stat", { p_channel: channel, p_metric: metric, p_by: by });
  if (error) console.error("[stats] increment failed", error.message);
}
