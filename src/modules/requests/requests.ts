import { db, must } from "@/lib/db";
import { incrementStat } from "@/lib/stats";
import type { RequestDetails } from "@/modules/ai/engine";
import type { Chat } from "@/modules/messaging/types";

/** Stores only the fields needed for staff to follow up. Appointments are never confirmed by the AI. */
export async function createCustomerRequest(chat: Chat, req: RequestDetails): Promise<number> {
  const row = must(
    await db()
      .from("customer_requests")
      .insert({
        chat_id: chat.id,
        kind: req.kind,
        name: req.name ?? null,
        phone: req.phone ?? null,
        service: req.service ?? null,
        branch: req.branch ?? null,
        preferred_time: req.preferred_time ?? null,
      })
      .select("id")
      .single(),
  ) as { id: number };
  await incrementStat(chat.channel, "requests");
  return row.id;
}
