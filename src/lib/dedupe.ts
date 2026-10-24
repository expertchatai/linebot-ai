import { db } from "./db";

/** Returns true the first time an event id is seen; false for redeliveries/duplicates. */
export async function firstSeen(eventId: string, source: string): Promise<boolean> {
  const { error } = await db().from("processed_events").insert({ event_id: eventId, source });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}
