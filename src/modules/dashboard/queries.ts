import { db, must } from "@/lib/db";
import { getSettings } from "@/modules/admin/settings";
import { listPendingBatches, type ChangeItem } from "@/modules/approval/workflow";
import type { Handoff } from "@/modules/handoff/handoff";
import { getApprovedKnowledge } from "@/modules/knowledge/repository";
import { getSheetState } from "@/modules/knowledge/sync";
import { getDisabledTopics } from "@/modules/knowledge/topics";

export interface StatRow {
  day: string;
  channel: string;
  metric: string;
  count: number;
}

export interface SystemEvent {
  id: number;
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  created_at: string;
}

export async function overview() {
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 10);
  const [settings, sheet, pendingBatches, topics, stats, openHandoffs, offChats, errors] = await Promise.all([
    getSettings(),
    getSheetState(),
    listPendingBatches(),
    getDisabledTopics(),
    db().from("stats_daily").select("*").gte("day", since).order("day"),
    db().from("handoffs").select("id", { count: "exact", head: true }).eq("status", "open"),
    db().from("chats").select("id", { count: "exact", head: true }).eq("ai_enabled", false),
    db()
      .from("system_events")
      .select("id, level, source, message, created_at")
      .in("level", ["warn", "error"])
      .order("id", { ascending: false })
      .limit(8),
  ]);
  return {
    settings,
    sheet,
    pendingBatches,
    pendingItems: pendingBatches.reduce((n, b) => n + b.pending, 0),
    topics,
    stats: (stats.data ?? []) as StatRow[],
    openHandoffs: openHandoffs.count ?? 0,
    aiOffChats: offChats.count ?? 0,
    recentIssues: (errors.data ?? []) as SystemEvent[],
  };
}

export function sumMetric(rows: StatRow[], metric: string, channel?: string) {
  return rows.filter((r) => r.metric === metric && (!channel || r.channel === channel)).reduce((n, r) => n + r.count, 0);
}

export async function knowledgePage() {
  const [approved, pending] = await Promise.all([
    getApprovedKnowledge(),
    db().from("change_items").select("*").eq("status", "pending").order("id").limit(200),
  ]);
  return { approved, pending: must(pending) as ChangeItem[] };
}

export async function handoffsPage() {
  return must(
    await db()
      .from("handoffs")
      .select("*, chats(ref_code, channel, ai_enabled)")
      .order("id", { ascending: false })
      .limit(100),
  ) as (Handoff & { chats: { ref_code: string; channel: string; ai_enabled: boolean } | null })[];
}

export async function eventsPage() {
  return must(
    await db().from("system_events").select("id, level, source, message, created_at").order("id", { ascending: false }).limit(200),
  ) as SystemEvent[];
}
