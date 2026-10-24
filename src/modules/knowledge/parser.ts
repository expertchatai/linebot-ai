import { createHash } from "node:crypto";

export interface SheetRow {
  sheet: string;
  /** 1-based row number in the sheet */
  row: number;
  cells: string[];
}

export interface KnowledgeEntry {
  key: string;
  sheet: string;
  row: number;
  question: string;
  answer: string;
  hash: string;
}

const Q_LABEL = String.raw`(?:คำถาม|ถาม|Q)\s*[:：]`;
const A_LABEL = String.raw`(?:คำตอบ|ตอบ|A)\s*[:：]`;
const COMBINED = new RegExp(String.raw`^\s*${Q_LABEL}\s*([\s\S]*?)\n\s*${A_LABEL}\s*([\s\S]*)$`, "i");
const LEADING_Q = new RegExp(String.raw`^\s*${Q_LABEL}\s*`, "i");
const LEADING_A = new RegExp(String.raw`^\s*${A_LABEL}\s*`, "i");

const clean = (s: string) => s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();

export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}

export function contentHash(question: string, answer: string): string {
  return createHash("sha256").update(`${clean(question)}\n---\n${clean(answer)}`).digest("hex").slice(0, 32);
}

/**
 * Supports both layouts used by Expert Watch:
 *  - one cell: "คำถาม : …\nคำตอบ : …" (also "ถาม/ตอบ", "Q/A")
 *  - two cells: column A = question, column B = answer
 * Returns null for headers, blank templates ("Q :\nA :") and notes.
 */
export function parseCells(cells: string[]): { question: string; answer: string } | null {
  const first = clean(cells[0] ?? "");
  const second = clean(cells[1] ?? "");

  let question = "";
  let answer = "";
  if (second) {
    question = first.replace(LEADING_Q, "");
    answer = second.replace(LEADING_A, "");
  } else {
    const m = first.match(COMBINED);
    if (!m) return null;
    question = m[1];
    answer = m[2];
  }
  question = clean(question);
  answer = clean(answer);
  if (!question || !answer) return null;
  return { question, answer };
}

export function parseRows(rows: SheetRow[]): KnowledgeEntry[] {
  const seen = new Map<string, number>();
  const entries: KnowledgeEntry[] = [];
  for (const r of rows) {
    const parsed = parseCells(r.cells);
    if (!parsed) continue;
    // Identity = sheet + question (+ occurrence for duplicates), so inserting rows doesn't
    // turn every following row into a "change".
    const base = `${r.sheet}::${normalizeQuestion(parsed.question)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    entries.push({
      key: n === 1 ? base : `${base}::${n}`,
      sheet: r.sheet,
      row: r.row,
      question: parsed.question,
      answer: parsed.answer,
      hash: contentHash(parsed.question, parsed.answer),
    });
  }
  return entries;
}

/** Same question appearing more than once in a sheet with different answers. */
export function findDuplicateQuestions(entries: KnowledgeEntry[]): { sheet: string; question: string; rows: number[] }[] {
  const groups = new Map<string, KnowledgeEntry[]>();
  for (const e of entries) {
    const k = `${e.sheet}::${normalizeQuestion(e.question)}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1 && new Set(g.map((e) => e.hash)).size > 1)
    .map((g) => ({ sheet: g[0].sheet, question: g[0].question, rows: g.map((e) => e.row) }));
}
