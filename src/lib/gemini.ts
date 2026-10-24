import { GoogleGenAI } from "@google/genai";
import { env } from "./env";
import { formatFaq, getFaq } from "./faq";

export const FALLBACK_REPLY = "ขออภัยค่ะ เรื่องนี้ขอให้เจ้าหน้าที่ตอบกลับนะคะ รบกวนรอสักครู่ค่ะ";

let ai: GoogleGenAI | null = null;
const gemini = () => (ai ??= new GoogleGenAI({ apiKey: env.geminiApiKey() }));

function systemPrompt(faq: string): string {
  return `คุณคือแอดมินตอบแชท LINE ของร้าน Expert Watch (ศูนย์บริการซ่อมนาฬิกา)

กฎ:
- ตอบจากข้อมูล FAQ ด้านล่างเท่านั้น ห้ามแต่งหรือเดาราคา เวลา สาขา หรือเงื่อนไขที่ไม่มีใน FAQ
- ราคาต้องตรงกับแบรนด์/รุ่น/บริการที่ลูกค้าถาม ถ้าไม่แน่ใจรุ่น ให้ถามรุ่นหรือขอรูปนาฬิกา
- ถ้า FAQ ไม่มีคำตอบ ให้ตอบว่า: "${FALLBACK_REPLY}"
- ตอบสั้น สุภาพ 1–3 ประโยค ลงท้ายด้วย "ค่ะ" ตอบภาษาเดียวกับที่ลูกค้าถาม

FAQ:
${faq}`;
}

export async function answer(question: string): Promise<string> {
  const faq = await getFaq();
  const res = await gemini().models.generateContent({
    model: env.geminiModel(),
    contents: question,
    config: { systemInstruction: systemPrompt(formatFaq(faq)), temperature: 0.2 },
  });
  return res.text?.trim() || FALLBACK_REPLY;
}
