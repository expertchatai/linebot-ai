import { formatThai } from "@/lib/time";
import { TOPIC_KIND_LABEL } from "@/modules/knowledge/topics";
import { overview, sumMetric } from "@/modules/dashboard/queries";
import { CHANNEL_LABEL, type Channel } from "@/modules/messaging/types";

const SHEET_STATUS = {
  ok: ["ปกติ", "ok"],
  down: ["ขัดข้อง — ใช้ข้อมูลสำรอง", "error"],
  recovering: ["รอ Admin เลือกข้อมูล", "warn"],
} as const;

export default async function DashboardPage() {
  const o = await overview();
  const [sheetLabel, sheetClass] = SHEET_STATUS[o.sheet.status];
  const questions = sumMetric(o.stats, "questions");
  const handoffs = sumMetric(o.stats, "handoffs");

  return (
    <>
      <div className="page-head">
        <h1>ภาพรวม</h1>
        <span className={`pill ${o.settings.mode === "live" ? "on" : "warn"}`}>
          {o.settings.mode === "live" ? "LIVE MODE" : `TEST MODE · ${o.settings.testUsers.length} บัญชีทดสอบ`}
        </span>
      </div>

      <div className="grid">
        {(Object.keys(CHANNEL_LABEL) as Channel[]).map((ch) => (
          <div className="card" key={ch}>
            <div className="label">AI · {CHANNEL_LABEL[ch]}</div>
            <div className="value">
              <span className={`pill ${o.settings.channels[ch] ? "on" : "off"}`}>{o.settings.channels[ch] ? "เปิด" : "ปิด"}</span>
            </div>
          </div>
        ))}
        <div className="card">
          <div className="label">Google Sheets</div>
          <div className="value">
            <span className={`pill ${sheetClass}`}>{sheetLabel}</span>
          </div>
          <div className="sub" style={{ marginTop: 8 }}>ตรวจล่าสุด {formatThai(o.sheet.lastCheckedAt)}</div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="label">คำถาม (7 วัน)</div>
          <div className="value">{questions}</div>
        </div>
        <div className="card">
          <div className="label">AI ตอบเอง (7 วัน)</div>
          <div className="value">{sumMetric(o.stats, "ai_answers")}</div>
        </div>
        <div className="card">
          <div className="label">ส่งต่อเจ้าหน้าที่ (7 วัน)</div>
          <div className="value">
            {handoffs}
            <span className="sub"> {questions ? `${Math.round((handoffs / questions) * 100)}%` : ""}</span>
          </div>
        </div>
        <div className="card">
          <div className="label">รอเจ้าหน้าที่รับเรื่อง</div>
          <div className="value">{o.openHandoffs}</div>
        </div>
        <div className="card">
          <div className="label">แชทที่หยุด AI</div>
          <div className="value">{o.aiOffChats}</div>
        </div>
        <div className="card">
          <div className="label">ข้อมูลรออนุมัติ</div>
          <div className="value">{o.pendingItems}</div>
        </div>
        <div className="card">
          <div className="label">ส่งข้อความล้มเหลว (7 วัน)</div>
          <div className="value">{sumMetric(o.stats, "send_errors")}</div>
        </div>
      </div>

      <section className="section">
        <h2>ข้อมูลรออนุมัติ</h2>
        <div className="table-wrap">
          {o.pendingBatches.length ? (
            <table>
              <thead>
                <tr><th>ชุด</th><th>ประเภท</th><th>รอพิจารณา</th><th>สร้างเมื่อ</th></tr>
              </thead>
              <tbody>
                {o.pendingBatches.map((b) => (
                  <tr key={b.id}>
                    <td>#{b.id}</td>
                    <td>{b.kind === "recovery" ? "กู้คืนข้อมูล" : b.kind === "line" ? "แก้ไขผ่าน LINE" : "Google Sheets"}</td>
                    <td>{b.pending} รายการ</td>
                    <td>{formatThai(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">ไม่มีรายการรออนุมัติ</div>
          )}
        </div>
        <p className="sub">อนุมัติผ่านปุ่มในกลุ่ม LINE Admin หรือพิมพ์ PENDING ใน LINE OA ผู้ดูแล</p>
      </section>

      <section className="section">
        <h2>หัวข้อที่ปิดการตอบ</h2>
        {o.topics.length ? (
          o.topics.map((t) => (
            <span key={`${t.kind}:${t.value}`} className="pill off" style={{ marginRight: 6 }}>
              {TOPIC_KIND_LABEL[t.kind]}: {t.value}
            </span>
          ))
        ) : (
          <span className="sub">ไม่มี</span>
        )}
      </section>

      <section className="section">
        <h2>เหตุการณ์ผิดปกติล่าสุด</h2>
        <div className="table-wrap">
          {o.recentIssues.length ? (
            <table>
              <tbody>
                {o.recentIssues.map((e) => (
                  <tr key={e.id}>
                    <td><span className={`pill ${e.level}`}>{e.level}</span></td>
                    <td>{e.source}</td>
                    <td className="pre">{e.message}</td>
                    <td>{formatThai(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">ไม่มีเหตุการณ์ผิดปกติ</div>
          )}
        </div>
      </section>
    </>
  );
}
