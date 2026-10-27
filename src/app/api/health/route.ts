import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { gemini as client, THINKING } from "@/lib/gemini";
import { parseRows } from "@/lib/parser";
import { fetchSheetRows } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Open in a browser to see which part of the bot is failing. Never returns key values.
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export async function GET() {
  const vars = {
    LINE_CHANNEL_SECRET: !!process.env.LINE_CHANNEL_SECRET,
    LINE_CHANNEL_ACCESS_TOKEN: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
    GOOGLE_SERVICE_ACCOUNT_JSON: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    ADMIN_GROUP_ID: !!process.env.ADMIN_GROUP_ID,
    REDIS: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
  };

  let sheet: { ok: boolean; faqCount?: number; error?: string };
  try {
    sheet = { ok: true, faqCount: parseRows(await fetchSheetRows()).length };
  } catch (e) {
    sheet = { ok: false, error: message(e) };
  }

  let gemini: { ok: boolean; model: string; error?: string };
  const model = env.geminiModel();
  try {
    await client().models.generateContent({ model, contents: "ping", config: { maxOutputTokens: 5, thinkingConfig: THINKING } });
    gemini = { ok: true, model };
  } catch (e) {
    gemini = { ok: false, model, error: message(e) };
  }

  return NextResponse.json({ ok: sheet.ok && gemini.ok, vars, sheet, gemini });
}
