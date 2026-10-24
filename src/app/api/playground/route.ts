import { NextResponse, type NextRequest } from "next/server";
import { errorMessage } from "@/lib/events";
import { generateReply } from "@/modules/ai/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Dashboard test console (protected by middleware). Nothing is sent to customers. */
export async function POST(req: NextRequest) {
  const { question } = (await req.json().catch(() => ({}))) as { question?: string };
  if (!question?.trim()) return NextResponse.json({ error: "question is required" }, { status: 400 });
  try {
    return NextResponse.json(await generateReply({ texts: [question], media: [], context: [], greeted: false }));
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
