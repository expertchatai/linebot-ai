import { formatThai } from "@/lib/time";
import { eventsPage } from "@/modules/dashboard/queries";

export default async function EventsPage() {
  const events = await eventsPage();
  return (
    <>
      <div className="page-head">
        <h1>เหตุการณ์ระบบ</h1>
        <span className="sub">ข้อผิดพลาดการส่งข้อความ, Google Sheets, AI และ webhook</span>
      </div>
      <div className="table-wrap">
        {events.length ? (
          <table>
            <thead>
              <tr><th>ระดับ</th><th>แหล่งที่มา</th><th>รายละเอียด</th><th>เวลา</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td><span className={`pill ${e.level === "info" ? "ok" : e.level}`}>{e.level}</span></td>
                  <td>{e.source}</td>
                  <td className="pre">{e.message}</td>
                  <td>{formatThai(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">ยังไม่มีเหตุการณ์</div>
        )}
      </div>
    </>
  );
}
