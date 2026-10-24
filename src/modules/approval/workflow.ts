import type { messagingApi } from "@line/bot-sdk";
import { db, must } from "@/lib/db";
import { formatThai } from "@/lib/time";
import type { Change, TrackedChange } from "@/modules/knowledge/diff";
import { bubble, flex, textMessage } from "@/modules/notifications/flex";
import { pushToAdmins } from "@/modules/notifications/notify";

export type BatchKind = "edit" | "recovery" | "line";
export type Decision = "approved" | "rejected";

export interface ChangeItem {
  id: number;
  batch_id: number;
  item_key: string;
  sheet: string;
  source: "sheet" | "line";
  change_type: "add" | "update" | "delete";
  source_row: number | null;
  old_question: string | null;
  old_answer: string | null;
  new_question: string | null;
  new_answer: string | null;
  new_hash: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  decided_by: string | null;
  decided_at: string | null;
}

export interface Batch {
  id: number;
  kind: BatchKind;
  status: "pending" | "closed";
  created_by: string;
  created_at: string;
}

const PAGE_SIZE = 10;

const TYPE_LABEL = { add: "เพิ่มใหม่", update: "แก้ไข", delete: "ลบ" } as const;
const KIND_LABEL: Record<BatchKind, string> = {
  edit: "การแก้ไขจาก Google Sheets",
  recovery: "ข้อมูลไม่ตรงกันหลัง Google Sheets กลับมา",
  line: "การแก้ไขผ่าน LINE",
};

export async function createBatch(
  kind: BatchKind,
  changes: Change[],
  opts: { createdBy?: string; source?: "sheet" | "line"; warnings?: string[] } = {},
): Promise<Batch> {
  const batch = must(
    await db().from("change_batches").insert({ kind, created_by: opts.createdBy ?? "system" }).select("*").single(),
  ) as Batch;

  // A newer version of the same item replaces any older pending proposal.
  must(
    await db()
      .from("change_items")
      .update({ status: "superseded", decided_by: "system", decided_at: new Date().toISOString() })
      .in("item_key", changes.map((c) => c.key))
      .eq("status", "pending"),
  );

  must(
    await db()
      .from("change_items")
      .insert(
        changes.map((c) => ({
          batch_id: batch.id,
          item_key: c.key,
          sheet: c.sheet,
          source: opts.source ?? "sheet",
          change_type: c.type,
          source_row: c.row,
          old_question: c.old?.question ?? null,
          old_answer: c.old?.answer ?? null,
          new_question: c.new?.question ?? null,
          new_answer: c.new?.answer ?? null,
          new_hash: c.newHash,
        })),
      ),
  );
  await closeBatchesWithoutPending();
  await notifyBatch(batch, changes.length, opts.warnings ?? []);
  return batch;
}

async function closeBatchesWithoutPending() {
  const open = must(await db().from("change_batches").select("id").eq("status", "pending")) as { id: number }[];
  for (const b of open) {
    const { count } = await db()
      .from("change_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", b.id)
      .eq("status", "pending");
    if (!count) await db().from("change_batches").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", b.id);
  }
}

async function notifyBatch(batch: Batch, count: number, warnings: string[]) {
  const recovery = batch.kind === "recovery";
  const summary = bubble({
    title: recovery ? "⚠️ ต้องเลือกข้อมูลที่ถูกต้อง" : "📝 ขออนุมัติข้อมูลใหม่",
    subtitle: KIND_LABEL[batch.kind],
    fields: [
      ["ชุดที่", `#${batch.id}`],
      ["จำนวน", `${count} รายการ`],
      ["เวลา", formatThai(batch.created_at)],
    ],
    sections: warnings.length ? [{ heading: "ข้อควรตรวจสอบ", text: warnings.join("\n") }] : undefined,
    note: recovery
      ? "เลือก “ใช้ข้อมูลสำรอง” เพื่อคงข้อมูลใน Supabase หรือ “ใช้ข้อมูล Sheet” เพื่อรับข้อมูลใหม่ ระบบจะไม่แก้ไข Google Sheets"
      : "ข้อมูลที่ยังไม่อนุมัติจะไม่ถูกนำไปตอบลูกค้า",
    buttons: [
      { label: "ดูทีละรายการ", data: `a=batch_page&b=${batch.id}&p=0`, primary: true },
      ...(recovery
        ? []
        : [
            { label: "อนุมัติทั้งชุด", data: `a=batch_decide&b=${batch.id}&d=approved` },
            { label: "ปฏิเสธทั้งชุด", data: `a=batch_decide&b=${batch.id}&d=rejected` },
          ]),
    ],
  });
  await pushToAdmins([flex(`ขออนุมัติข้อมูล ชุด #${batch.id} (${count} รายการ)`, [summary])]);
  await db().from("change_batches").update({ notified_at: new Date().toISOString() }).eq("id", batch.id);
}

export function itemBubble(item: ChangeItem, kind: BatchKind) {
  const sections: { heading: string; text: string }[] = [];
  if (item.old_question !== null) sections.push({ heading: "ข้อมูลเดิม", text: `Q: ${item.old_question}\nA: ${item.old_answer}` });
  if (item.new_question !== null) sections.push({ heading: "ข้อมูลใหม่", text: `Q: ${item.new_question}\nA: ${item.new_answer}` });
  const recovery = kind === "recovery";
  return bubble({
    title: `${TYPE_LABEL[item.change_type]} · ${item.sheet}`,
    subtitle: `รายการ #${item.id}${item.source_row ? ` · แถว ${item.source_row}` : ""}`,
    sections,
    buttons:
      item.status === "pending"
        ? [
            {
              label: recovery ? "ใช้ข้อมูล Sheet" : "อนุมัติ",
              data: `a=item_decide&i=${item.id}&d=approved`,
              primary: true,
            },
            { label: recovery ? "ใช้ข้อมูลสำรอง" : "ปฏิเสธ", data: `a=item_decide&i=${item.id}&d=rejected` },
          ]
        : undefined,
    note: item.status === "pending" ? undefined : `สถานะ: ${item.status}`,
  });
}

export async function batchPage(batchId: number, page: number): Promise<messagingApi.Message[]> {
  const batch = must(await db().from("change_batches").select("*").eq("id", batchId).maybeSingle()) as Batch | null;
  if (!batch) return [textMessage("ไม่พบชุดข้อมูลนี้")];
  const items = must(
    await db()
      .from("change_items")
      .select("*")
      .eq("batch_id", batchId)
      .eq("status", "pending")
      .order("id")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
  ) as ChangeItem[];
  if (!items.length) return [textMessage(`ชุด #${batchId} ไม่มีรายการรอพิจารณาแล้ว`)];

  const hasMore = items.length > PAGE_SIZE;
  const bubbles = items.slice(0, PAGE_SIZE).map((i) => itemBubble(i, batch.kind));
  if (hasMore) {
    bubbles.push(
      bubble({
        title: "ยังมีรายการถัดไป",
        buttons: [{ label: "หน้าถัดไป", data: `a=batch_page&b=${batchId}&p=${page + 1}`, primary: true }],
      }),
    );
  }
  return [flex(`รายการรออนุมัติ ชุด #${batchId}`, bubbles)];
}

/** Atomic and idempotent: returns null when the item was already decided. */
export async function decideItem(itemId: number, actor: string, decision: Decision): Promise<ChangeItem | null> {
  const rows = must(
    await db().rpc("decide_change_item", { p_item_id: itemId, p_actor: actor, p_decision: decision }),
  ) as ChangeItem[];
  return rows[0] ?? null;
}

export async function decideBatch(batchId: number, actor: string, decision: Decision): Promise<number> {
  const pending = must(
    await db().from("change_items").select("id").eq("batch_id", batchId).eq("status", "pending").order("id"),
  ) as { id: number }[];
  let done = 0;
  for (const p of pending) if (await decideItem(p.id, actor, decision)) done++;
  return done;
}

export async function getItem(itemId: number): Promise<ChangeItem | null> {
  return must(await db().from("change_items").select("*").eq("id", itemId).maybeSingle()) as ChangeItem | null;
}

export async function getBatchKind(batchId: number): Promise<BatchKind | null> {
  const { data } = await db().from("change_batches").select("kind").eq("id", batchId).maybeSingle();
  return (data?.kind as BatchKind) ?? null;
}

export async function listPendingBatches() {
  const batches = must(
    await db().from("change_batches").select("*").eq("status", "pending").order("id"),
  ) as Batch[];
  const result: (Batch & { pending: number })[] = [];
  for (const b of batches) {
    const { count } = await db()
      .from("change_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", b.id)
      .eq("status", "pending");
    result.push({ ...b, pending: count ?? 0 });
  }
  return result;
}

export async function hasPendingRecovery(): Promise<boolean> {
  const { count } = await db()
    .from("change_batches")
    .select("id", { count: "exact", head: true })
    .eq("kind", "recovery")
    .eq("status", "pending");
  return (count ?? 0) > 0;
}

export async function getTrackedChanges(keys: string[]): Promise<TrackedChange[]> {
  if (!keys.length) return [];
  const out: TrackedChange[] = [];
  for (let i = 0; i < keys.length; i += 200) {
    out.push(
      ...(must(
        await db()
          .from("change_items")
          .select("item_key, new_hash, status")
          .in("item_key", keys.slice(i, i + 200))
          .in("status", ["pending", "rejected"]),
      ) as TrackedChange[]),
    );
  }
  return out;
}
