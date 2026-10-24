import { db } from "./db";

export type EventLevel = "info" | "warn" | "error";

const ALERT_THROTTLE_MS = 10 * 60 * 1000;

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Error tracking: every warning/error is written to system_events (shown on the dashboard).
 * Errors also alert the Super Admin group, at most once per source every 10 minutes.
 */
export async function logEvent(
  level: EventLevel,
  source: string,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const log = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  log(`[${source}] ${message}`, meta ?? "");
  try {
    const { data } = await db()
      .from("system_events")
      .insert({ level, source, message, meta: meta ?? null })
      .select("id")
      .single();
    if (level === "error" && data) await maybeAlert(data.id, source, message);
  } catch (e) {
    console.error("[events] failed to record event", e);
  }
}

async function maybeAlert(eventId: number, source: string, message: string) {
  const since = new Date(Date.now() - ALERT_THROTTLE_MS).toISOString();
  const { count } = await db()
    .from("system_events")
    .select("id", { count: "exact", head: true })
    .eq("source", source)
    .eq("alerted", true)
    .gte("created_at", since);
  if (count) return;

  await db().from("system_events").update({ alerted: true }).eq("id", eventId);
  // Imported lazily: notifications log their own failures through logEvent.
  const { pushToSuperAdmins } = await import("@/modules/notifications/notify");
  await pushToSuperAdmins([{ type: "text", text: `⚠️ ระบบผิดพลาด [${source}]\n${message.slice(0, 500)}` }], {
    silentFailure: true,
  });
}
