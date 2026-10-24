import { describe, expect, it } from "vitest";
import { diffKnowledge, withoutTracked, DELETED_HASH, type ApprovedItem } from "@/modules/knowledge/diff";
import { findDuplicateQuestions, parseCells, parseRows, type SheetRow } from "@/modules/knowledge/parser";
import { filterKnowledge, matchDisabledTopic } from "@/modules/knowledge/topics";

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
    expect(parseCells(["รับเปลี่ยนถ่านไหม", "รับครับ"])).toEqual({ question: "รับเปลี่ยนถ่านไหม", answer: "รับครับ" });
  });

  it("skips blank templates and headers", () => {
    expect(parseCells(["Q :\nA : "])).toBeNull();
    expect(parseCells(["Brand ที่รับตรวจ"])).toBeNull();
  });

  it("gives duplicate questions distinct keys and flags conflicting answers", () => {
    const entries = parseRows(rows);
    expect(entries).toHaveLength(5);
    const credit = entries.filter((e) => e.question === "รับบัตรเครดิตไหม");
    expect(new Set(credit.map((e) => e.key)).size).toBe(2);
    expect(findDuplicateQuestions(entries)).toEqual([{ sheet: "ทั่วไป", question: "รับบัตรเครดิตไหม", rows: [3, 4] }]);
  });

  it("keeps keys stable when rows are inserted above", () => {
    const before = parseRows(rows);
    const shifted = parseRows(rows.map((r) => ({ ...r, row: r.row + 5 })));
    expect(shifted.map((e) => e.key)).toEqual(before.map((e) => e.key));
  });
});

describe("diff", () => {
  const entries = parseRows(rows);
  const approved: ApprovedItem[] = entries.map((e, i) => ({ ...e, seq: i + 1, source: "sheet" }));

  it("reports nothing when the sheet matches the approved snapshot", () => {
    expect(diffKnowledge(entries, approved)).toEqual([]);
  });

  it("detects add, update and delete", () => {
    const edited = parseRows([
      ...rows.filter((r) => r.row !== 2 && r.row !== 13),
      { sheet: "ติดฟิล์ม", row: 13, cells: ["คำถาม : สนใจติดฟิล์มนาฬิกา Datejust\nคำตอบ : ราคา 7000 บาท"] },
      { sheet: "ทั่วไป", row: 20, cells: ["ถาม : จอดรถได้ไหม\nตอบ : ได้"] },
    ]);
    const changes = diffKnowledge(edited, approved);
    expect(changes.map((c) => c.type).sort()).toEqual(["add", "delete", "update"]);
    expect(changes.find((c) => c.type === "delete")?.newHash).toBe(DELETED_HASH);
  });

  it("ignores line-sourced approved items", () => {
    const lineItem: ApprovedItem = { ...approved[0], key: "line::x", source: "line" };
    expect(diffKnowledge(entries, [...approved, lineItem])).toEqual([]);
  });

  it("does not re-propose pending or rejected content", () => {
    const changes = diffKnowledge(entries, []);
    const tracked = [{ item_key: changes[0].key, new_hash: changes[0].newHash, status: "rejected" as const }];
    expect(withoutTracked(changes, tracked)).toHaveLength(changes.length - 1);
  });
});

describe("topics", () => {
  const items: ApprovedItem[] = parseRows(rows).map((e, i) => ({ ...e, seq: i + 1, source: "sheet" }));

  it("filters knowledge for disabled brands and services", () => {
    expect(filterKnowledge(items, [{ kind: "brand", value: "rolex", enabled: false }]).some((i) => i.answer.includes("Rolex"))).toBe(false);
    expect(filterKnowledge(items, [{ kind: "service", value: "ติดฟิล์ม", enabled: false }]).some((i) => i.sheet === "ติดฟิล์ม")).toBe(false);
  });

  it("matches disabled topics in customer text case-insensitively", () => {
    expect(matchDisabledTopic("ติดฟิล์ม ROLEX ราคา", [{ kind: "brand", value: "rolex", enabled: false }])?.value).toBe("rolex");
    expect(matchDisabledTopic("เปลี่ยนถ่าน", [{ kind: "brand", value: "rolex", enabled: false }])).toBeNull();
  });
});
