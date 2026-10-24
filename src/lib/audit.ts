import { db } from "./db";

export async function audit(actor: string, action: string, details?: Record<string, unknown>) {
  await db().from("audit_log").insert({ actor, action, details: details ?? null });
}
