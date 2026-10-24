import type { KnowledgeEntry } from "./parser";

export const DELETED_HASH = "DELETED";

export interface ApprovedItem {
  key: string;
  seq: number;
  sheet: string;
  question: string;
  answer: string;
  hash: string;
  source: "sheet" | "line";
}

export interface Change {
  key: string;
  sheet: string;
  type: "add" | "update" | "delete";
  row: number | null;
  old: { question: string; answer: string } | null;
  new: { question: string; answer: string } | null;
  newHash: string;
}

export interface TrackedChange {
  item_key: string;
  new_hash: string;
  status: "pending" | "rejected";
}

/** Compares the live sheet with the Approved snapshot (sheet-sourced items only). */
export function diffKnowledge(entries: KnowledgeEntry[], approved: ApprovedItem[]): Change[] {
  const approvedByKey = new Map(approved.filter((a) => a.source === "sheet").map((a) => [a.key, a]));
  const changes: Change[] = [];

  for (const e of entries) {
    const prev = approvedByKey.get(e.key);
    approvedByKey.delete(e.key);
    if (prev && prev.hash === e.hash) continue;
    changes.push({
      key: e.key,
      sheet: e.sheet,
      type: prev ? "update" : "add",
      row: e.row,
      old: prev ? { question: prev.question, answer: prev.answer } : null,
      new: { question: e.question, answer: e.answer },
      newHash: e.hash,
    });
  }
  for (const prev of approvedByKey.values()) {
    changes.push({
      key: prev.key,
      sheet: prev.sheet,
      type: "delete",
      row: null,
      old: { question: prev.question, answer: prev.answer },
      new: null,
      newHash: DELETED_HASH,
    });
  }
  return changes;
}

/**
 * Drops changes that are already waiting for a decision or were rejected with the exact same
 * content, so pending items are never re-sent and rejected content is not proposed again.
 */
export function withoutTracked(changes: Change[], tracked: TrackedChange[]): Change[] {
  const known = new Set(tracked.map((t) => `${t.item_key}|${t.new_hash}`));
  return changes.filter((c) => !known.has(`${c.key}|${c.newHash}`));
}
