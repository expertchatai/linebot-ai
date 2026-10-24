import { db, must } from "@/lib/db";
import type { ApprovedItem } from "./diff";

/** The Approved snapshot in Supabase — the only knowledge the AI may use. */
export async function getApprovedKnowledge(): Promise<ApprovedItem[]> {
  return must(
    await db().from("knowledge_items").select("key, seq, sheet, question, answer, hash, source").order("seq"),
  ) as ApprovedItem[];
}

export async function getKnowledgeBySeq(seq: number): Promise<ApprovedItem | null> {
  return must(
    await db().from("knowledge_items").select("key, seq, sheet, question, answer, hash, source").eq("seq", seq).maybeSingle(),
  ) as ApprovedItem | null;
}

export async function searchKnowledge(term: string): Promise<ApprovedItem[]> {
  const t = term.replace(/[%,()]/g, " ").trim();
  return must(
    await db()
      .from("knowledge_items")
      .select("key, seq, sheet, question, answer, hash, source")
      .or(`question.ilike.%${t}%,answer.ilike.%${t}%`)
      .order("seq")
      .limit(10),
  ) as ApprovedItem[];
}

export const knowledgeCode = (seq: number) => `K${seq}`;
