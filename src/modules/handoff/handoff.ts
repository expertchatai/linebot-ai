import type { messagingApi } from "@line/bot-sdk";
import { db, must } from "@/lib/db";
import { audit } from "@/lib/audit";
import { incrementStat } from "@/lib/stats";
import { formatThai, isWithinNotifyHours } from "@/lib/time";
import { HANDOFF_LABEL, type HandoffCategory } from "@/modules/ai/rules";
import { getSettings } from "@/modules/admin/settings";
import { getChat, setAiEnabled } from "@/modules/messaging/chats";
import { getLineDisplayName } from "@/modules/messaging/line";
import { CHANNEL_LABEL, type Chat } from "@/modules/messaging/types";
import { bubble, flex } from "@/modules/notifications/flex";
import { pushToAdmins } from "@/modules/notifications/notify";

export const REMINDER_INTERVAL_MS = 15 * 60 * 1000;

export interface Handoff {
  id: number;
  chat_id: string;
  category: HandoffCategory;
  summary: string | null;
  draft_reply: string | null;
  ai_paused: boolean;
  request_id: number | null;
  status: "open" | "claimed" | "resolved";
  notify_count: number;
  last_notified_at: string | null;
  claimed_by: string | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  created_at: string;
}

export async function openHandoff(
  chat: Chat,
  opts: { category: HandoffCategory; summary: string; draftReply?: string; pauseAi?: boolean; requestId?: number },
): Promise<Handoff> {
  const pauseAi = opts.pauseAi ?? true;
  if (pauseAi) await setAiEnabled(chat.id, false, "system", opts.category);

  const handoff = must(
    await db()
      .from("handoffs")
      .insert({
        chat_id: chat.id,
        category: opts.category,
        summary: opts.summary,
        draft_reply: opts.draftReply ?? null,
        ai_paused: pauseAi,
        request_id: opts.requestId ?? null,
      })
      .select("*")
      .single(),
  ) as Handoff;

  await incrementStat(chat.channel, "handoffs");
  await notifyHandoff(handoff, pauseAi ? { ...chat, ai_enabled: false } : chat, false);
  return handoff;
}

async function requestFields(requestId: number | null): Promise<[string, string][]> {
  if (!requestId) return [];
  const { data } = await db().from("customer_requests").select("*").eq("id", requestId).maybeSingle();
  if (!data) return [];
  return [
    ["ชื่อ", data.name ?? "-"],
    ["เบอร์", data.phone ?? "-"],
    ["บริการ", data.service ?? "-"],
    ["สาขา", data.branch ?? "-"],
    ["วันเวลา", data.preferred_time ?? "-"],
  ];
}

export async function handoffMessage(h: Handoff, chat: Chat, reminder: boolean): Promise<messagingApi.Message> {
  const name = chat.channel === "line" ? await getLineDisplayName(chat.external_id) : null;
  const sections = [{ heading: "สรุปประเด็น (AI)", text: h.summary ?? "-" }];
  if (h.draft_reply) sections.push({ heading: "ร่างคำตอบ (Admin พิจารณาก่อนส่ง)", text: h.draft_reply });

  const buttons =
    h.status === "open"
      ? [{ label: "รับเรื่องแล้ว", data: `a=claim&h=${h.id}`, primary: true }]
      : h.status === "claimed"
        ? [{ label: "ปิดเรื่อง", data: `a=resolve&h=${h.id}` }]
        : [];
  if (!chat.ai_enabled) buttons.push({ label: "เปิด AI แชทนี้", data: `a=resume&c=${encodeURIComponent(chat.id)}`, primary: false });

  return flex(`${reminder ? "เตือนซ้ำ: " : ""}${HANDOFF_LABEL[h.category]} (${chat.ref_code})`, [
    bubble({
      title: `${reminder ? "⏰ เตือนซ้ำ · " : "🔔 "}${HANDOFF_LABEL[h.category]}`,
      subtitle: `เรื่อง #${h.id} · ${formatThai(h.created_at)}`,
      fields: [
        ["แชท", chat.ref_code],
        ["ช่องทาง", CHANNEL_LABEL[chat.channel]],
        ...(name ? ([["ลูกค้า", name]] as [string, string][]) : []),
        ["AI", chat.ai_enabled ? "เปิด" : "หยุดชั่วคราว"],
        ...(await requestFields(h.request_id)),
        ...(h.claimed_by_name ? ([["ผู้รับเรื่อง", h.claimed_by_name]] as [string, string][]) : []),
      ],
      sections,
      note: "ตอบลูกค้าผ่าน LINE OA Manager / Meta Business Suite — ระบบจะไม่ส่งร่างคำตอบให้อัตโนมัติ",
      buttons,
    }),
  ]);
}

async function notifyHandoff(h: Handoff, chat: Chat, reminder: boolean) {
  const sent = await pushToAdmins([await handoffMessage(h, chat, reminder)]);
  if (sent) {
    await db()
      .from("handoffs")
      .update({ last_notified_at: new Date().toISOString(), notify_count: h.notify_count + 1 })
      .eq("id", h.id);
  }
}

/** Atomic: only the first admin to press the button claims it. */
export async function claimHandoff(id: number, actorId: string, actorName: string | null): Promise<Handoff | null> {
  const rows = must(
    await db()
      .from("handoffs")
      .update({ status: "claimed", claimed_by: actorId, claimed_by_name: actorName ?? actorId, claimed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "open")
      .select("*"),
  ) as Handoff[];
  if (rows[0]) await audit(actorId, "handoff.claim", { id });
  return rows[0] ?? null;
}

export async function resolveHandoff(id: number, actorId: string): Promise<Handoff | null> {
  const rows = must(
    await db()
      .from("handoffs")
      .update({ status: "resolved", resolved_by: actorId, resolved_at: new Date().toISOString() })
      .eq("id", id)
      .neq("status", "resolved")
      .select("*"),
  ) as Handoff[];
  if (rows[0]) await audit(actorId, "handoff.resolve", { id });
  return rows[0] ?? null;
}

export async function getHandoff(id: number): Promise<Handoff | null> {
  return must(await db().from("handoffs").select("*").eq("id", id).maybeSingle()) as Handoff | null;
}

/** Re-notify open handoffs every 15 minutes, only within notification hours. */
export async function remindOpenHandoffs(now = new Date()): Promise<number> {
  const { notifyHours } = await getSettings();
  if (!isWithinNotifyHours(now, notifyHours)) return 0;
  const due = must(
    await db()
      .from("handoffs")
      .select("*")
      .eq("status", "open")
      .lte("last_notified_at", new Date(now.getTime() - REMINDER_INTERVAL_MS).toISOString())
      .order("id")
      .limit(20),
  ) as Handoff[];
  // Handoffs whose first notification failed are retried too.
  const neverSent = must(
    await db().from("handoffs").select("*").eq("status", "open").is("last_notified_at", null).limit(20),
  ) as Handoff[];

  let sent = 0;
  for (const h of [...neverSent, ...due]) {
    const chat = await getChat(h.chat_id);
    if (!chat) continue;
    await notifyHandoff(h, chat, h.notify_count > 0);
    sent++;
  }
  return sent;
}
