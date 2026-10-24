// Preview → confirm flow for every admin change that affects customers.
import type { messagingApi } from "@line/bot-sdk";
import { db, must } from "@/lib/db";
import { env } from "@/lib/env";
import { clearContext } from "@/modules/ai/context";
import { getChat, setAiEnabled } from "@/modules/messaging/chats";
import { CHANNEL_LABEL, type Channel } from "@/modules/messaging/types";
import { setTopic, TOPIC_KIND_LABEL, type TopicKind } from "@/modules/knowledge/topics";
import { bubble, flex, textMessage } from "@/modules/notifications/flex";
import { pushToSuperAdmins } from "@/modules/notifications/notify";
import { can, grantAdmin, revokeAdmin, type Actor, type Permission } from "./auth";
import { getSettings, updateSetting, type Mode } from "./settings";

export type PendingAction =
  | { type: "set_channel"; channel: Channel; enabled: boolean }
  | { type: "set_topic"; kind: TopicKind; value: string; enabled: boolean }
  | { type: "set_mode"; mode: Mode }
  | { type: "chat_ai"; chatId: string; enabled: boolean }
  | { type: "grant_admin"; userId: string; name: string | null }
  | { type: "revoke_admin"; userId: string }
  | { type: "tester"; userId: string; add: boolean };

export const REQUIRED_PERMISSION: Record<PendingAction["type"], Permission> = {
  set_channel: "control_ai",
  set_topic: "control_ai",
  set_mode: "set_mode",
  chat_ai: "control_ai",
  grant_admin: "manage_admins",
  revoke_admin: "manage_admins",
  tester: "control_ai",
};

export async function describe(action: PendingAction): Promise<string> {
  switch (action.type) {
    case "set_channel":
      return `${action.enabled ? "เปิด" : "ปิด"} AI ช่องทาง ${CHANNEL_LABEL[action.channel]}\nผลกระทบ: ${
        action.enabled ? "AI จะเริ่มตอบลูกค้าในช่องทางนี้" : "AI จะหยุดตอบลูกค้าทุกคนในช่องทางนี้"
      }`;
    case "set_topic":
      return `${action.enabled ? "เปิด" : "ปิด"}การตอบเรื่อง${TOPIC_KIND_LABEL[action.kind]} “${action.value}”\nผลกระทบ: ${
        action.enabled ? "AI จะกลับมาตอบเรื่องนี้" : "คำถามเรื่องนี้จะถูกส่งต่อเจ้าหน้าที่แทน"
      }`;
    case "set_mode":
      return action.mode === "live"
        ? "เปิด LIVE MODE\nผลกระทบ: AI จะตอบลูกค้าจริงทุกคนในช่องทางที่เปิดอยู่"
        : "กลับสู่ TEST MODE\nผลกระทบ: AI จะตอบเฉพาะบัญชีทดสอบ";
    case "chat_ai": {
      const chat = await getChat(action.chatId);
      return `${action.enabled ? "เปิด AI กลับมา" : "หยุด AI"} สำหรับแชท ${chat?.ref_code ?? action.chatId}`;
    }
    case "grant_admin":
      return `เพิ่มสิทธิ์ Admin ให้ ${action.name ?? ""} (${action.userId})`;
    case "revoke_admin":
      return `ยกเลิกสิทธิ์ Admin ของ ${action.userId}`;
    case "tester":
      return `${action.add ? "เพิ่ม" : "ลบ"}บัญชีทดสอบ ${action.userId}`;
  }
}

export async function propose(actor: Actor, action: PendingAction): Promise<messagingApi.Message> {
  if (!can(actor, REQUIRED_PERMISSION[action.type])) return textMessage("คุณไม่มีสิทธิ์ทำรายการนี้");
  if (action.type === "set_mode" && action.mode === "live" && !env.allowLiveMode()) {
    return textMessage("ยังเปิด LIVE MODE ไม่ได้: ต้องตั้งค่า ALLOW_LIVE_MODE=true บน Vercel หลังผ่านการทดสอบก่อน");
  }
  const preview = await describe(action);
  const row = must(
    await db().from("pending_actions").insert({ actor: actor.userId, action, preview }).select("id").single(),
  ) as { id: string };
  return flex(`ยืนยันการเปลี่ยนแปลง: ${preview.split("\n")[0]}`, [
    bubble({
      title: "ยืนยันการเปลี่ยนแปลง",
      subtitle: "ตรวจสอบผลกระทบก่อนยืนยัน (หมดอายุใน 10 นาที)",
      sections: [{ heading: "รายการ", text: preview }],
      buttons: [
        { label: "ยืนยัน", data: `a=confirm&p=${row.id}`, primary: true },
        { label: "ยกเลิก", data: `a=cancel&p=${row.id}` },
      ],
    }),
  ]);
}

export async function confirm(actor: Actor, id: string): Promise<string> {
  const rows = must(
    await db()
      .from("pending_actions")
      .update({ status: "confirmed", decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("actor", actor.userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .select("action, preview"),
  ) as { action: PendingAction; preview: string }[];
  const row = rows[0];
  if (!row) return "รายการนี้หมดอายุ ถูกดำเนินการแล้ว หรือไม่ใช่รายการของคุณ";
  if (!can(actor, REQUIRED_PERMISSION[row.action.type])) return "คุณไม่มีสิทธิ์ทำรายการนี้";

  await execute(actor, row.action);
  const done = `✅ ดำเนินการแล้ว\n${row.preview.split("\n")[0]}`;
  if (row.action.type === "set_mode" || row.action.type === "grant_admin" || row.action.type === "revoke_admin") {
    await pushToSuperAdmins([textMessage(`${done}\nโดย ${actor.name ?? actor.userId}`)]);
  }
  return done;
}

export async function cancel(actor: Actor, id: string): Promise<string> {
  const rows = must(
    await db()
      .from("pending_actions")
      .update({ status: "cancelled", decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("actor", actor.userId)
      .eq("status", "pending")
      .select("id"),
  ) as unknown[];
  return rows.length ? "ยกเลิกแล้ว" : "รายการนี้ถูกดำเนินการไปแล้ว";
}

async function execute(actor: Actor, action: PendingAction) {
  const who = actor.userId;
  switch (action.type) {
    case "set_channel": {
      const { channels } = await getSettings();
      await updateSetting("channels", { ...channels, [action.channel]: action.enabled }, who);
      return;
    }
    case "set_topic":
      return setTopic(action.kind, action.value, action.enabled, who);
    case "set_mode":
      if (action.mode === "live" && !env.allowLiveMode()) throw new Error("ALLOW_LIVE_MODE is not enabled");
      return updateSetting("mode", action.mode, who);
    case "chat_ai":
      await setAiEnabled(action.chatId, action.enabled, who, action.enabled ? undefined : "admin OFFAI");
      if (action.enabled) await clearContext(action.chatId);
      return;
    case "grant_admin":
      return grantAdmin(action.userId, action.name, actor);
    case "revoke_admin":
      return revokeAdmin(action.userId, actor);
    case "tester": {
      const { testUsers } = await getSettings();
      const next = action.add ? [...new Set([...testUsers, action.userId])] : testUsers.filter((u) => u !== action.userId);
      return updateSetting("testUsers", next, who);
    }
  }
}
