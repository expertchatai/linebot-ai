import { createHash } from "node:crypto";
import { logEvent, errorMessage } from "@/lib/events";
import { formatThai } from "@/lib/time";
import { getState, setState } from "@/modules/admin/settings";
import { createBatch, getTrackedChanges, hasPendingRecovery } from "@/modules/approval/workflow";
import { textMessage } from "@/modules/notifications/flex";
import { pushToAdmins } from "@/modules/notifications/notify";
import { diffKnowledge, withoutTracked, type Change } from "./diff";
import { findDuplicateQuestions, parseRows } from "./parser";
import { getApprovedKnowledge } from "./repository";
import { fetchSheetRows } from "./sheets";

/** Batch is created only after the sheet has been unchanged for this long. */
export const QUIET_PERIOD_MS = 60_000;

export interface SheetState {
  status: "ok" | "down" | "recovering";
  downSince?: string;
  lastCheckedAt?: string;
  lastError?: string;
  /** Fingerprint of untracked changes seen on the previous check */
  pendingFingerprint?: string;
  pendingSince?: string;
}

const STATE_KEY = "sheet_state";

const fingerprint = (changes: Change[]) =>
  createHash("sha256")
    .update(changes.map((c) => `${c.key}|${c.newHash}`).sort().join("\n"))
    .digest("hex");

export async function getSheetState(): Promise<SheetState> {
  return getState<SheetState>(STATE_KEY, { status: "ok" });
}

/**
 * Runs every minute from the job tick:
 *  1. Reads Google Sheets (read-only). On failure → AI keeps using the Approved backup in Supabase.
 *  2. After an outage → compares the sheet with the backup; identical = resume, else admin chooses.
 *  3. Normally → waits for 1 minute without further edits, then sends one approval batch.
 */
export async function checkSheets(now = new Date()): Promise<string> {
  const state = await getSheetState();
  state.lastCheckedAt = now.toISOString();

  let rows;
  try {
    rows = await fetchSheetRows();
  } catch (e) {
    if (state.status !== "down") {
      state.status = "down";
      state.downSince = now.toISOString();
      await logEvent("error", "sheets", `อ่าน Google Sheets ไม่ได้: ${errorMessage(e)}`);
      await pushToAdmins([
        textMessage(
          "⚠️ Google Sheets ขัดข้อง\nAI ยังตอบลูกค้าได้ตามปกติโดยใช้ข้อมูล Approved สำรองใน Supabase\nระบบจะตรวจสอบอีกครั้งอัตโนมัติ",
        ),
      ]);
    }
    state.lastError = errorMessage(e);
    await setState(STATE_KEY, state);
    return "sheets:down";
  }

  const entries = parseRows(rows);
  const approved = await getApprovedKnowledge();
  const changes = diffKnowledge(entries, approved);
  const warnings = findDuplicateQuestions(entries).map(
    (d) => `คำถามซ้ำแต่คำตอบต่างกัน: “${d.question.slice(0, 60)}” (${d.sheet} แถว ${d.rows.join(", ")})`,
  );

  // 2) Recovery after an outage: resolve Approved conflicts before any normal Pending work.
  if (state.status === "down") {
    const downSince = state.downSince;
    state.downSince = undefined;
    state.lastError = undefined;
    if (!changes.length) {
      state.status = "ok";
      await setState(STATE_KEY, state);
      await pushToAdmins([textMessage(`✅ Google Sheets กลับมาใช้งานได้ (ขัดข้องตั้งแต่ ${formatThai(downSince)})\nข้อมูลตรงกับข้อมูลสำรอง ระบบกลับมาทำงานปกติ`)]);
      return "sheets:recovered";
    }
    state.status = "recovering";
    await setState(STATE_KEY, state);
    await createBatch("recovery", changes, { warnings });
    return "sheets:recovery-batch";
  }

  if (state.status === "recovering") {
    if (await hasPendingRecovery()) {
      await setState(STATE_KEY, state);
      return "sheets:waiting-recovery";
    }
    state.status = "ok";
    await pushToAdmins([textMessage("✅ แก้ไขข้อมูลที่ไม่ตรงกันครบแล้ว ระบบกลับมาซิงก์ Google Sheets ตามปกติ")]);
  }

  // 3) Normal edits with a 1-minute quiet period.
  const fresh = withoutTracked(changes, await getTrackedChanges(changes.map((c) => c.key)));
  if (!fresh.length) {
    state.pendingFingerprint = undefined;
    state.pendingSince = undefined;
    await setState(STATE_KEY, state);
    return "sheets:no-changes";
  }

  const fp = fingerprint(fresh);
  if (fp !== state.pendingFingerprint || !state.pendingSince) {
    state.pendingFingerprint = fp;
    state.pendingSince = now.toISOString();
    await setState(STATE_KEY, state);
    return "sheets:changes-detected";
  }
  if (now.getTime() - new Date(state.pendingSince).getTime() < QUIET_PERIOD_MS) {
    await setState(STATE_KEY, state);
    return "sheets:waiting-quiet-period";
  }

  state.pendingFingerprint = undefined;
  state.pendingSince = undefined;
  await setState(STATE_KEY, state);
  await createBatch("edit", fresh, { warnings });
  return `sheets:batch(${fresh.length})`;
}
