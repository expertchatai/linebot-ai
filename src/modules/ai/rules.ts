// Deterministic routing that runs before (and regardless of) the language model.

export type HandoffCategory =
  | "repair_status"
  | "complaint"
  | "human_request"
  | "unanswerable"
  | "video"
  | "file"
  | "disabled_topic"
  | "request";

export const HANDOFF_LABEL: Record<HandoffCategory, string> = {
  repair_status: "ติดตามสถานะงานซ่อม",
  complaint: "ข้อร้องเรียน",
  human_request: "ขอคุยกับเจ้าหน้าที่",
  unanswerable: "คำถามที่ AI ตอบไม่ได้",
  video: "ลูกค้าส่งวิดีโอ",
  file: "ลูกค้าส่งไฟล์",
  disabled_topic: "หัวข้อที่ปิดการตอบของ AI",
  request: "คำขอนัดหมาย / ติดต่อกลับ",
};

const REPAIR_STATUS = [
  /สถานะ.{0,15}(ซ่อม|งาน|นาฬิกา)/,
  /(ซ่อม|งาน).{0,15}(เสร็จ|ถึงไหน|คืบหน้า|ได้รึยัง|ได้หรือยัง)/,
  /(เช็ค|เช็ก|ตรวจ|ติดตาม)\s*(งาน|สถานะ)/,
  /เลขที่?\s*(ใบรับ|งานซ่อม)/,
  /\b(repair|service|order)\s+status\b/i,
  /\bis my watch (ready|done|fixed)\b/i,
];

const HUMAN = [
  /(ขอ|อยาก)?(คุย|ติดต่อ|สนทนา)(กับ)?\s*(พนักงาน|เจ้าหน้าที่|แอดมิน|admin|คนจริง|คน)/i,
  /\b(talk|speak|chat)\s+(to|with)\s+(a\s+)?(human|person|agent|staff|someone)\b/i,
];

const COMPLAINT = [/ร้องเรียน/, /ไม่พอใจ/, /แย่มาก/, /ผิดหวัง/, /\bcomplain(t)?\b/i, /\bterrible service\b/i];

export function preRoute(text: string): HandoffCategory | null {
  if (REPAIR_STATUS.some((r) => r.test(text))) return "repair_status";
  if (COMPLAINT.some((r) => r.test(text))) return "complaint";
  if (HUMAN.some((r) => r.test(text))) return "human_request";
  return null;
}

const numbersIn = (s: string) =>
  (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "")).filter((n) => Number(n) >= 100);

/**
 * Price/number grounding guard: every number ≥ 100 in the reply (prices, phone fragments)
 * must appear verbatim in the cited knowledge. Catches invented prices and self-computed totals.
 */
export function ungroundedNumbers(reply: string, sources: string[]): string[] {
  const allowed = new Set(sources.flatMap(numbersIn));
  return numbersIn(reply).filter((n) => !allowed.has(n));
}

/** Thai replies must use the male polite particle. */
export function enforceMaleParticle(reply: string): string {
  return reply
    .replace(/นะคะ/g, "นะครับ")
    .replace(/ค่ะ|คะ(?=[\s.!?)]|$)/g, "ครับ");
}
