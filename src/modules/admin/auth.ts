import { db, must } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

export type Role = "super_admin" | "admin";

export interface Actor {
  userId: string;
  role: Role | null;
  name: string | null;
}

export type Permission =
  | "view"
  | "approve"
  | "manage_knowledge"
  | "control_ai"
  | "claim_handoff"
  | "manage_admins"
  | "set_mode";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ["view", "approve", "manage_knowledge", "control_ai", "claim_handoff", "manage_admins", "set_mode"],
  admin: ["view", "approve", "manage_knowledge", "control_ai", "claim_handoff"],
};

export async function getActor(userId: string | undefined): Promise<Actor> {
  if (!userId) return { userId: "unknown", role: null, name: null };
  if (env.superAdminIds().includes(userId)) {
    const { data } = await db().from("admins").select("display_name").eq("line_user_id", userId).maybeSingle();
    return { userId, role: "super_admin", name: data?.display_name ?? null };
  }
  const { data } = await db()
    .from("admins")
    .select("role, display_name, active")
    .eq("line_user_id", userId)
    .maybeSingle();
  if (!data || !data.active) return { userId, role: null, name: null };
  return { userId, role: data.role as Role, name: data.display_name };
}

export function can(actor: Actor, permission: Permission): boolean {
  return actor.role !== null && ROLE_PERMISSIONS[actor.role].includes(permission);
}

export function actorLabel(actor: Actor): string {
  return actor.name ? `${actor.name} (${actor.userId})` : actor.userId;
}

export async function listAdmins() {
  return must(
    await db().from("admins").select("line_user_id, display_name, role, active").eq("active", true).order("created_at"),
  ) as { line_user_id: string; display_name: string | null; role: Role; active: boolean }[];
}

export async function grantAdmin(userId: string, name: string | null, by: Actor) {
  must(
    await db().from("admins").upsert({
      line_user_id: userId,
      display_name: name,
      role: "admin",
      active: true,
      created_by: by.userId,
      revoked_at: null,
      revoked_by: null,
    }),
  );
  await audit(by.userId, "admin.grant", { userId, name });
}

export async function revokeAdmin(userId: string, by: Actor) {
  must(
    await db()
      .from("admins")
      .update({ active: false, revoked_at: new Date().toISOString(), revoked_by: by.userId })
      .eq("line_user_id", userId)
      .eq("role", "admin"),
  );
  await audit(by.userId, "admin.revoke", { userId });
}
