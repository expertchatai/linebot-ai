import { db, must } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { ApprovedItem } from "./diff";

export type TopicKind = "service" | "brand" | "model";

export interface TopicRule {
  kind: TopicKind;
  value: string;
  enabled: boolean;
}

export const TOPIC_KIND_LABEL: Record<TopicKind, string> = { service: "บริการ", brand: "แบรนด์", model: "รุ่น" };

export async function getDisabledTopics(): Promise<TopicRule[]> {
  return must(await db().from("topic_rules").select("kind, value, enabled").eq("enabled", false)) as TopicRule[];
}

export async function setTopic(kind: TopicKind, value: string, enabled: boolean, actor: string) {
  must(
    await db()
      .from("topic_rules")
      .upsert(
        { kind, value: value.trim().toLowerCase(), enabled, updated_by: actor, updated_at: new Date().toISOString() },
        { onConflict: "kind,value" },
      ),
  );
  await audit(actor, "topic.set", { kind, value, enabled });
}

const mentions = (text: string, value: string) => text.toLowerCase().includes(value.toLowerCase());

export function matchDisabledTopic(text: string, disabled: TopicRule[]): TopicRule | null {
  return disabled.find((t) => mentions(text, t.value)) ?? null;
}

/** Removes knowledge about disabled services (sheet name or text), brands and models. */
export function filterKnowledge(items: ApprovedItem[], disabled: TopicRule[]): ApprovedItem[] {
  if (!disabled.length) return items;
  return items.filter(
    (item) =>
      !disabled.some(
        (t) =>
          (t.kind === "service" && mentions(item.sheet, t.value)) ||
          mentions(item.question, t.value) ||
          mentions(item.answer, t.value),
      ),
  );
}
