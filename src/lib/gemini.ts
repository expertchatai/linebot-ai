import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { env } from "./env";
import { formatFaq, getFaq } from "./faq";
import type { Turn } from "./history";

export const FALLBACK_REPLY = "รบกวนรอทางเจ้าหน้าที่ตอบกลับสักครู่ครับ";

/** Gemini may reword the fallback slightly, so match its key phrase. */
export const isHandoff = (text: string) => text.includes("เจ้าหน้าที่ตอบกลับ");

// A little reasoning to connect follow-ups to earlier messages, without slowing replies much.
export const THINKING = { thinkingLevel: ThinkingLevel.LOW };

let ai: GoogleGenAI | null = null;
export const gemini = () => (ai ??= new GoogleGenAI({ apiKey: env.geminiApiKey() }));

function systemPrompt(faq: string): string {
  return `คุณคือแอดมินตอบแชท LINE ของร้าน Expert Watch (ศูนย์บริการซ่อมนาฬิกา)

กฎ:
- ตอบจากข้อมูล FAQ ด้านล่างเท่านั้น ห้ามแต่งหรือเดาราคา เวลา สาขา หรือเงื่อนไขที่ไม่มีใน FAQ
- ราคาต้องตรงกับแบรนด์/รุ่น/บริการที่ลูกค้าถาม ถ้าไม่แน่ใจรุ่น ให้ถามรุ่นหรือขอรูปนาฬิกา
- อ่านบทสนทนาก่อนหน้าก่อนตอบ ถ้าลูกค้าถามต่อสั้นๆ (เช่น "แล้วราคาเท่าไหร่", "สาขานั้นเปิดกี่โมง") ให้ตีความจากเรื่องที่คุยกันอยู่ ไม่ต้องถามซ้ำสิ่งที่ลูกค้าบอกไปแล้ว
- เมื่อลูกค้าส่งรูปนาฬิกา ทำตามลำดับนี้:
  1. บอกแบรนด์และรุ่นที่เห็นในรูปตรงๆ ไม่ต้องใช้คำว่า "น่าจะ" ห้ามบอกว่านาฬิกาแท้หรือปลอม
  2. ดูจากบทสนทนาว่าลูกค้าต้องการบริการอะไร (เช่น เปลี่ยนแบต ซ่อม ล้างเครื่อง) ถ้ายังไม่ได้บอก ให้ถามกลับว่าต้องการรับบริการอะไร
  3. ถ้า FAQ มีบริการหรือราคาของแบรนด์/รุ่นนั้น ให้ตอบได้เลย ถ้าไม่มี ให้ตอบว่า: "${FALLBACK_REPLY}"
  4. ถ้าดูแบรนด์/รุ่นจากรูปไม่ออก ให้ขอรูปหน้าปัดที่ชัดขึ้น ถ้าเคยขอรูปไปแล้วและยังดูไม่ออก ให้ตอบว่า: "${FALLBACK_REPLY}"
- ถ้า FAQ ไม่มีคำตอบ ให้ตอบว่า: "${FALLBACK_REPLY}"
- คุณเป็นแอดมินผู้ชาย ใช้ "ครับ" ลงท้ายทุกคำตอบ (ห้ามใช้ "ค่ะ" หรือ "คะ") แทนตัวเองว่า "ผม" หรือ "ทางร้าน" เรียกลูกค้าว่า "คุณลูกค้า"
- ตอบสั้น สุภาพ เป็นกันเอง 1–3 ประโยค ตอบภาษาเดียวกับที่ลูกค้าถาม

FAQ:
${faq}`;
}

export async function answer(
  question: string,
  history: Turn[] = [],
  image?: { data: string; mimeType: string },
): Promise<string> {
  const faq = await getFaq();
  const contents = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: "user", parts: [...(image ? [{ inlineData: image }] : []), { text: question }] },
  ];
  const res = await gemini().models.generateContent({
    model: env.geminiModel(),
    contents,
    config: { systemInstruction: systemPrompt(formatFaq(faq)), temperature: 0.2, thinkingConfig: THINKING },
  });
  return res.text?.trim() || FALLBACK_REPLY;
}
