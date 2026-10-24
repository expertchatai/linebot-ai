import { db, must } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DEFAULT_NOTIFY_HOURS, type NotifyHours } from "@/lib/time";
import type { Channel } from "@/modules/messaging/types";

export type Mode = "test" | "live";

export interface Settings {
  mode: Mode;
  channels: Record<Channel, boolean>;
  /** External user ids (LINE userId / Messenger PSID) the AI answers while in Test Mode */
  testUsers: string[];
  notifyHours: NotifyHours;
}

const DEFAULTS: Settings = {
  // Safe defaults: test mode, nobody on the tester list.
  mode: "test",
  channels: { line: true, messenger: true },
  testUsers: [],
  notifyHours: DEFAULT_NOTIFY_HOURS,
};

const KEY_MAP = {
  mode: "mode",
  channels: "channels",
  testUsers: "test_users",
  notifyHours: "notify_hours",
} as const satisfies Record<keyof Settings, string>;

export async function getSettings(): Promise<Settings> {
  const rows = must(await db().from("settings").select("key, value")) as { key: string; value: unknown }[];
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    mode: byKey.get(KEY_MAP.mode) === "live" ? "live" : "test",
    channels: { ...DEFAULTS.channels, ...((byKey.get(KEY_MAP.channels) as object) ?? {}) },
    testUsers: (byKey.get(KEY_MAP.testUsers) as string[]) ?? [],
    notifyHours: { ...DEFAULT_NOTIFY_HOURS, ...((byKey.get(KEY_MAP.notifyHours) as object) ?? {}) },
  };
}

export async function updateSetting<K extends keyof Settings>(key: K, value: Settings[K], actor: string) {
  must(
    await db()
      .from("settings")
      .upsert({ key: KEY_MAP[key], value, updated_at: new Date().toISOString(), updated_by: actor }),
  );
  await audit(actor, `settings.${key}`, { value });
}

/** Raw JSON state that is not admin-facing (e.g. Google Sheets sync state). */
export async function getState<T>(key: string, fallback: T): Promise<T> {
  const { data } = await db().from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

export async function setState<T>(key: string, value: T) {
  must(await db().from("settings").upsert({ key, value, updated_at: new Date().toISOString(), updated_by: "system" }));
}
