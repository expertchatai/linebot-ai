import { knowledgePage } from "@/modules/dashboard/queries";
import { knowledgeCode } from "@/modules/knowledge/repository";

const TYPE_LABEL = { add: "เพิ่ม", update: "แก้ไข", delete: "ลบ" } as const;

export default async function KnowledgePage() {
  const { approved, pending } = await knowledgePage();
  return (
    <>
      <div className="page-head">
        <h1>ฐานความรู้</h1>
        <span className="sub">AI ใช้เฉพาะข้อมูล Approved · {approved.length} รายการ</span>
      </div>

      <section className="section">
        <h2>รออนุมัติ ({pending.length})</h2>
        <div className="table-wrap">
          {pending.length ? (
            <table>
              <thead>
                <tr><th>#</th><th>ชุด</th><th>หมวด</th><th>ประเภท</th><th>เดิม → ใหม่</th></tr>
              </thead>
              <tbody>
                {pending.map((i) => (
                  <tr key={i.id}>
                    <td>{i.id}</td>
                    <td>#{i.batch_id}</td>
                    <td>{i.sheet}{i.source_row ? ` · แถว ${i.source_row}` : ""}</td>
                    <td>{TYPE_LABEL[i.change_type]}</td>
                    <td>
                      <div className="diff">
                        <div>{i.old_question ? `Q: ${i.old_question}\nA: ${i.old_answer}` : "—"}</div>
                        <div>{i.new_question ? `Q: ${i.new_question}\nA: ${i.new_answer}` : "(ลบ)"}</div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">ไม่มีรายการรออนุมัติ</div>
          )}
        </div>
      </section>

      <section className="section">
        <h2>Approved</h2>
        <div className="table-wrap">
          {approved.length ? (
            <table>
              <thead>
                <tr><th>รหัส</th><th>หมวด</th><th>คำถาม</th><th>คำตอบ</th></tr>
              </thead>
              <tbody>
                {approved.map((k) => (
                  <tr key={k.key}>
                    <td>{knowledgeCode(k.seq)}</td>
                    <td>{k.sheet}{k.source === "line" ? " · LINE" : ""}</td>
                    <td className="pre">{k.question}</td>
                    <td className="pre">{k.answer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">ยังไม่มีข้อมูล Approved — AI จะส่งต่อเจ้าหน้าที่ทุกคำถามจนกว่าจะอนุมัติข้อมูล</div>
          )}
        </div>
      </section>
    </>
  );
}
