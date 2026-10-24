import { formatThai } from "@/lib/time";
import { HANDOFF_LABEL } from "@/modules/ai/rules";
import { handoffsPage } from "@/modules/dashboard/queries";

const STATUS = { open: ["รอรับเรื่อง", "error"], claimed: ["รับเรื่องแล้ว", "warn"], resolved: ["ปิดแล้ว", "ok"] } as const;

export default async function HandoffsPage() {
  const rows = await handoffsPage();
  return (
    <>
      <div className="page-head">
        <h1>ส่งต่อเจ้าหน้าที่</h1>
        <span className="sub">รับเรื่องผ่านปุ่มในกลุ่ม LINE Admin</span>
      </div>
      <div className="table-wrap">
        {rows.length ? (
          <table>
            <thead>
              <tr><th>#</th><th>แชท</th><th>ประเภท</th><th>สรุป</th><th>สถานะ</th><th>ผู้รับเรื่อง</th><th>เวลา</th></tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const [label, cls] = STATUS[h.status];
                return (
                  <tr key={h.id}>
                    <td>{h.id}</td>
                    <td>
                      {h.chats?.ref_code}
                      <div className="sub">{h.chats?.channel}{h.chats && !h.chats.ai_enabled ? " · AI หยุด" : ""}</div>
                    </td>
                    <td>{HANDOFF_LABEL[h.category] ?? h.category}</td>
                    <td className="pre">{h.summary}</td>
                    <td><span className={`pill ${cls}`}>{label}</span></td>
                    <td>{h.claimed_by_name ?? "-"}<div className="sub">{h.claimed_at ? formatThai(h.claimed_at) : ""}</div></td>
                    <td>{formatThai(h.created_at)}<div className="sub">แจ้ง {h.notify_count} ครั้ง</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty">ยังไม่มีการส่งต่อ</div>
        )}
      </div>
    </>
  );
}
