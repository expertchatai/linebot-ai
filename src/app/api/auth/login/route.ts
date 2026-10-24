import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { createSession, safeEqualString, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  if (!safeEqualString(password, env.dashboardPassword())) {
    await logEvent("warn", "dashboard", "เข้าสู่ระบบ Dashboard ไม่สำเร็จ");
    return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  }
  const res = NextResponse.redirect(new URL("/dashboard", req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSession(env.sessionSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
