import { describe, expect, it } from "vitest";
import { enforceMaleParticle, preRoute, ungroundedNumbers } from "@/modules/ai/rules";
import { isWithinNotifyHours, DEFAULT_NOTIFY_HOURS } from "@/lib/time";
import { createSession, verifySession } from "@/lib/session";

describe("preRoute", () => {
  it.each([
    ["นาฬิกาที่ส่งซ่อมเสร็จหรือยังครับ", "repair_status"],
    ["ขอเช็คสถานะงานซ่อมหน่อย", "repair_status"],
    ["Is my watch ready?", "repair_status"],
    ["ไม่พอใจบริการมาก", "complaint"],
    ["ขอคุยกับเจ้าหน้าที่", "human_request"],
    ["Can I talk to a human?", "human_request"],
  ])("%s → %s", (text, expected) => {
    expect(preRoute(text)).toBe(expected);
  });

  it("lets normal questions through", () => {
    expect(preRoute("ติดฟิล์ม Rolex Datejust ราคาเท่าไหร่")).toBeNull();
    expect(preRoute("มีสาขาไหนบ้าง")).toBeNull();
  });
});

describe("price grounding guard", () => {
  const source = ["ราคาติดฟิล์ม Rolex รุ่นสาย oyster 6500 บาท รุ่นสาย jubilee 8900 บาท"];

  it("accepts prices that appear in the cited knowledge (with or without commas)", () => {
    expect(ungroundedNumbers("ติดฟิล์มสาย Oyster ราคา 6,500 บาทครับ", source)).toEqual([]);
  });

  it("rejects invented prices and self-computed totals", () => {
    expect(ungroundedNumbers("ราคา 7,000 บาทครับ", source)).toEqual(["7000"]);
    expect(ungroundedNumbers("รวมทั้งหมด 15,400 บาทครับ", source)).toEqual(["15400"]);
  });

  it("ignores small numbers like durations", () => {
    expect(ungroundedNumbers("ใช้เวลา 2-3 ชั่วโมงครับ", [])).toEqual([]);
  });
});

describe("enforceMaleParticle", () => {
  it("rewrites female particles", () => {
    expect(enforceMaleParticle("รับค่ะ สนใจรุ่นไหนคะ")).toBe("รับครับ สนใจรุ่นไหนครับ");
    expect(enforceMaleParticle("ได้นะคะ")).toBe("ได้นะครับ");
  });
  it("does not touch words that contain คะ", () => {
    expect(enforceMaleParticle("คะแนนรีวิว")).toBe("คะแนนรีวิว");
  });
});

describe("notify hours (Asia/Bangkok)", () => {
  it("is inside 08:30–20:00 Bangkok time", () => {
    expect(isWithinNotifyHours(new Date("2026-10-24T01:30:00Z"), DEFAULT_NOTIFY_HOURS)).toBe(true); // 08:30
    expect(isWithinNotifyHours(new Date("2026-10-24T12:59:00Z"), DEFAULT_NOTIFY_HOURS)).toBe(true); // 19:59
  });
  it("is outside before 08:30, from 20:00, on excluded days and holidays", () => {
    expect(isWithinNotifyHours(new Date("2026-10-24T01:29:00Z"), DEFAULT_NOTIFY_HOURS)).toBe(false);
    expect(isWithinNotifyHours(new Date("2026-10-24T13:00:00Z"), DEFAULT_NOTIFY_HOURS)).toBe(false);
    expect(isWithinNotifyHours(new Date("2026-10-25T03:00:00Z"), { ...DEFAULT_NOTIFY_HOURS, days: [1, 2, 3, 4, 5, 6] })).toBe(false); // Sunday
    expect(isWithinNotifyHours(new Date("2026-10-24T03:00:00Z"), { ...DEFAULT_NOTIFY_HOURS, holidays: ["2026-10-24"] })).toBe(false);
  });
});

describe("dashboard session", () => {
  it("verifies its own tokens and rejects tampering", async () => {
    const token = await createSession("secret");
    expect(await verifySession("secret", token)).toBe(true);
    expect(await verifySession("other", token)).toBe(false);
    const tampered = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    expect(await verifySession("secret", tampered)).toBe(false);
    expect(await verifySession("secret", `${Date.now() - 1}.abc`)).toBe(false);
  });
});
