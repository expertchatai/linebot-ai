import type { messagingApi } from "@line/bot-sdk";
import { env } from "@/lib/env";
import { logEvent, errorMessage } from "@/lib/events";
import { lineAdmin } from "@/modules/messaging/line";

interface PushOptions {
  /** Used by the error alerter itself to avoid alert loops. */
  silentFailure?: boolean;
}

async function pushToGroup(groupId: string, label: string, messages: messagingApi.Message[], opts: PushOptions) {
  if (!groupId) {
    if (!opts.silentFailure) await logEvent("warn", "notify", `ยังไม่ได้ตั้งค่า ${label} — ข้ามการแจ้งเตือน`);
    return false;
  }
  try {
    for (let i = 0; i < messages.length; i += 5) {
      await lineAdmin().pushMessage({ to: groupId, messages: messages.slice(i, i + 5) });
    }
    return true;
  } catch (e) {
    if (opts.silentFailure) console.error(`[notify] ${label} push failed`, e);
    else await logEvent("error", "notify", `ส่งแจ้งเตือนไป ${label} ไม่สำเร็จ: ${errorMessage(e)}`);
    return false;
  }
}

export function pushToAdmins(messages: messagingApi.Message[], opts: PushOptions = {}) {
  return pushToGroup(env.adminGroupId(), "LINE_ADMIN_GROUP_ID", messages, opts);
}

export function pushToSuperAdmins(messages: messagingApi.Message[], opts: PushOptions = {}) {
  return pushToGroup(env.superAdminGroupId() || env.adminGroupId(), "LINE_SUPER_ADMIN_GROUP_ID", messages, opts);
}
