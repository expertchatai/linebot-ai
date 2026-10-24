import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logEvent, errorMessage } from "@/lib/events";
import { safeEqualString } from "@/lib/session";
import { remindOpenHandoffs } from "@/modules/handoff/handoff";
import { checkSheets } from "@/modules/knowledge/sync";
import { processStaleBuffers } from "@/modules/messaging/inbound";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  return safeEqualString(header, `Bearer ${env.cronSecret()}`);
}

async function purgeTemporaryData() {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  await db().from("message_buffer").delete().lt("received_at", ago(10 * 60_000));
  await db().from("chat_context").delete().lt("expires_at", new Date().toISOString());
  await db().from("processed_events").delete().lt("created_at", ago(3 * 24 * 3600_000));
  await db().from("pending_actions").update({ status: "expired" }).eq("status", "pending").lt("expires_at", new Date().toISOString());
}

/**
 * Background jobs. Call every minute (Supabase pg_cron, or any scheduler) with
 * `Authorization: Bearer $CRON_SECRET`.
 */
async function tick(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const results: Record<string, unknown> = {};
  const jobs: [string, () => Promise<unknown>][] = [
    ["staleBuffers", processStaleBuffers],
    ["sheets", () => checkSheets()],
    ["handoffReminders", () => remindOpenHandoffs()],
    ["purge", purgeTemporaryData],
  ];
  for (const [name, job] of jobs) {
    try {
      results[name] = (await job()) ?? "ok";
    } catch (e) {
      results[name] = `error: ${errorMessage(e)}`;
      await logEvent("error", `job.${name}`, errorMessage(e));
    }
  }
  return NextResponse.json({ ok: true, results });
}

export const GET = tick;
export const POST = tick;
