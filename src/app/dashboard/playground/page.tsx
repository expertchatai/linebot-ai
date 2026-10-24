"use client";

import { useState } from "react";

interface Result {
  action: string;
  reply: string;
  handoffCategory?: string;
  draftReply?: string;
  citedIds: string[];
  trace: string[];
  error?: string;
}

export default function PlaygroundPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/playground", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    setResult(await res.json());
    setLoading(false);
  }

  return (
    <>
      <div className="page-head">
        <h1>ทดลองถาม AI</h1>
        <span className="sub">ใช้ข้อมูล Approved ปัจจุบัน · ไม่ส่งข้อความถึงลูกค้า</span>
      </div>
      <form onSubmit={ask} style={{ display: "grid", gap: 12, maxWidth: 640 }}>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="เช่น ติดฟิล์ม Rolex Datejust ราคาเท่าไหร่ครับ" />
        <div>
          <button className="btn" disabled={loading || !question.trim()}>
            {loading ? "กำลังประมวลผล…" : "ถาม AI"}
          </button>
        </div>
      </form>

      {result && (
        <div className="card" style={{ marginTop: 24, maxWidth: 640 }}>
          {result.error ? (
            <div className="notice">{result.error}</div>
          ) : (
            <>
              <div className="label">
                ผลลัพธ์: {result.action === "handoff" ? `ส่งต่อเจ้าหน้าที่ (${result.handoffCategory})` : result.action}
                {result.citedIds.length ? ` · อ้างอิง ${result.citedIds.join(", ")}` : ""}
              </div>
              <p style={{ whiteSpace: "pre-wrap" }}>{result.reply}</p>
              {result.draftReply && (
                <>
                  <div className="label">ร่างคำตอบสำหรับ Admin</div>
                  <p style={{ whiteSpace: "pre-wrap" }}>{result.draftReply}</p>
                </>
              )}
              <div className="label">trace</div>
              <pre className="sub" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{result.trace.join("\n")}</pre>
            </>
          )}
        </div>
      )}
    </>
  );
}
