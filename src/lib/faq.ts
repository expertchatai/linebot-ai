import { parseRows, type KnowledgeEntry } from "./parser";
import { fetchSheetRows } from "./sheets";

// Keep the FAQ in memory between requests so most replies don't wait for Google Sheets.
const CACHE_MS = 5 * 60 * 1000;

let cache: { entries: KnowledgeEntry[]; at: number } | null = null;

export async function getFaq(): Promise<KnowledgeEntry[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.entries;
  try {
    cache = { entries: parseRows(await fetchSheetRows()), at: Date.now() };
  } catch (e) {
    // Sheet unreachable: keep answering from the last copy we have.
    if (!cache) throw e;
    console.error("[faq] Google Sheets read failed, using cached FAQ", e);
  }
  return cache.entries;
}

export function formatFaq(entries: KnowledgeEntry[]): string {
  return entries.map((e) => `(${e.sheet})\nQ: ${e.question}\nA: ${e.answer}`).join("\n\n");
}
