import { describe, expect, it } from "vitest";
import { findDuplicateQuestions, parseCells, parseRows, type SheetRow } from "@/lib/parser";
import { formatFaq } from "@/lib/faq";

// Shapes copied from the real Expert Watch sheet.
const rows: SheetRow[] = [
  { sheet: "ทั่วไป", row: 2, cells: ["ถาม : เวลาเปิดปิดร้าน\nตอบ : เปิด 10.30 - 20.00 น."] },
  { sheet: "ทั่วไป", row: 3, cells: ["ถาม : รับบัตรเครดิตไหม\nตอบ : \nรับเฉพาะบางสาขาค่ะ มีค่าธรรมเนียมเพิ่มเติม 2%"] },
  { sheet: "ทั่วไป", row: 4, cells: ["ถาม : รับบัตรเครดิตไหม\nตอบ : รับเฉพาะบางสาขาค่ะ"] },
  { sheet: "ทั่วไป", row: 7, cells: ["Q :\nA : "] },
  { sheet: "ตรวจนาฬิกา", row: 1, cells: ["Brand ที่รับตรวจ"] },
  {
    sheet: "ติดฟิล์ม",
    row: 13,
    cells: ["คำถาม : สนใจติดฟิล์มนาฬิกา Datejust\nคำตอบ : ราคาติดฟิล์ม Rolex รุ่นสาย oyster 6500 บาท รุ่นสาย jubilee 8900 บาท"],
  },
  { sheet: "เปลี่ยนถ่าน", row: 9, cells: ["รับเปลี่ยนถ่าน Seiko ไหม", "รับค่ะ ราคา 450 บาท"] },
];

describe("parser", () => {
  it("parses the single-cell Q/A layout with Thai and English labels", () => {
    expect(parseCells(["คำถาม : A\nคำตอบ : B"])).toEqual({ question: "A", answer: "B" });
    expect(parseCells(["Q : hello\nA : world"])).toEqual({ question: "hello", answer: "world" });
  });

  it("parses the two-column layout", () => {
    expect(parseCells(["รับเปลี่ยนถ่านไหม", "รับค่ะ"])).toEqual({ question: "รับเปลี่ยนถ่านไหม", answer: "รับค่ะ" });
  });

  it("skips blank templates and headers", () => {
    expect(parseCells(["Q :\nA : "])).toBeNull();
    expect(parseCells(["Brand ที่รับตรวจ"])).toBeNull();
  });

  it("parses every usable row and flags duplicate questions with different answers", () => {
    const entries = parseRows(rows);
    expect(entries).toHaveLength(5);
    expect(findDuplicateQuestions(entries)).toEqual([{ sheet: "ทั่วไป", question: "รับบัตรเครดิตไหม", rows: [3, 4] }]);
  });
});

describe("formatFaq", () => {
  it("renders entries for the Gemini prompt", () => {
    const text = formatFaq(parseRows(rows.slice(0, 1)));
    expect(text).toBe("(ทั่วไป)\nQ: เวลาเปิดปิดร้าน\nA: เปิด 10.30 - 20.00 น.");
  });
});
