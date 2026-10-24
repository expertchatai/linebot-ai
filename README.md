# Expert Watch AI Customer Service

ระบบ AI ตอบลูกค้า 24 ชั่วโมงผ่าน **LINE OA** และ **Facebook Messenger** สำหรับ Expert Watch
AI ตอบจากข้อมูลที่ **Approved** แล้วเท่านั้น และส่งต่อเจ้าหน้าที่เมื่อไม่แน่ใจ

> ⚠️ ระบบเริ่มต้นใน **TEST MODE** เสมอ AI จะตอบเฉพาะบัญชีทดสอบ การเปิด Live Mode ต้องตั้ง
> `ALLOW_LIVE_MODE=true` **และ** มี Super Admin ยืนยันคำสั่ง `MODE LIVE` ระบบไม่มีทางเปิด Live Mode ได้เอง

## Stack

Next.js 15 (App Router) บน Vercel · Supabase (Postgres) · Google Gemini (`@google/genai`) ·
LINE Messaging API (`@line/bot-sdk`) · Messenger Platform · Google Sheets API (read-only)

## โครงสร้างโมดูล

| โมดูล | ไฟล์ | หน้าที่ |
|---|---|---|
| Messaging Integration | `src/modules/messaging/*`, `src/app/api/webhooks/*` | รับ/ส่งข้อความ, ตรวจลายเซ็น, กันข้อความซ้ำ, รวมข้อความภายใน 5 วินาที |
| AI Response Engine | `src/modules/ai/*` | กฎส่งต่อ, prompt, Gemini (JSON schema), ตัวกันราคาที่ไม่มีในข้อมูล |
| Knowledge Management | `src/modules/knowledge/*` | อ่าน Google Sheets, parser, diff, ปิดหัวข้อ, backup/recovery |
| Approval Workflow | `src/modules/approval/*` | ชุดขออนุมัติ, อนุมัติทั้งชุด/รายรายการ, กันอนุมัติซ้ำ (ฟังก์ชัน SQL แบบ atomic) |
| Admin Authorization | `src/modules/admin/auth.ts` | Super Admin / Admin (RBAC) |
| Admin Control | `src/modules/admin/commands.ts`, `confirm.ts` | คำสั่ง LINE ของผู้ดูแล, แสดงผลกระทบก่อนแล้วจึงยืนยัน |
| Human Handoff | `src/modules/handoff/*` | หยุด AI, แจ้งกลุ่ม Admin, เตือนซ้ำทุก 15 นาที, รับเรื่อง |
| Notifications | `src/modules/notifications/*` | Flex message ไปกลุ่ม Admin / Super Admin |
| Customer Requests | `src/modules/requests/*` | คำขอนัดหมาย / ติดต่อกลับ (AI ไม่ยืนยันนัดเอง) |
| Dashboard | `src/app/dashboard/*` | ภาพรวม, ฐานความรู้, การส่งต่อ, เหตุการณ์ระบบ, ทดลองถาม AI |
| Background Jobs | `src/app/api/jobs/tick` | ซิงก์ Sheets, เตือนซ้ำ, เก็บกวาดข้อมูลชั่วคราว (เรียกทุก 1 นาที) |

## Endpoints

| Path | ใช้กับ |
|---|---|
| `POST /api/webhooks/line` | LINE OA ลูกค้า |
| `POST /api/webhooks/line-admin` | LINE OA ผู้ดูแล (คำสั่ง + ปุ่มในกลุ่ม) |
| `GET/POST /api/webhooks/messenger` | Facebook Messenger |
| `GET/POST /api/jobs/tick` | Scheduler (`Authorization: Bearer $CRON_SECRET`) |
| `/dashboard` | Dashboard (รหัสผ่าน) |

## เริ่มต้นใช้งาน

```bash
cp .env.example .env.local   # กรอกค่า
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run build
```

## เอกสาร

- [docs/SETUP.md](docs/SETUP.md) — ติดตั้ง Vercel, Supabase, LINE OA, Messenger, Gemini, Google Sheets
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) — คู่มือ Admin และคำสั่ง LINE
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md) — ขั้นตอนทดสอบก่อนเปิดใช้งานจริง
- [docs/KNOWLEDGE_AUDIT.md](docs/KNOWLEDGE_AUDIT.md) — ผลตรวจข้อมูลใน Google Sheets ที่ต้องแก้ก่อนอนุมัติ

## ความเป็นส่วนตัว

- ไม่เก็บประวัติแชทถาวร: ข้อความรอตอบถูกลบทันทีหลังประมวลผล (สูงสุด 10 นาที) ส่วน context
  ข้อความล่าสุดจะหมดอายุภายใน 30 นาทีหลังไม่มีการสนทนา
- ไม่เก็บภาพ เสียง หรือวิดีโอ: ดาวน์โหลดเข้าหน่วยความจำเพื่อส่งให้ Gemini แล้วทิ้ง
- เก็บเฉพาะข้อมูลปฏิบัติงาน: สถานะแชท, การส่งต่อ, คำขอติดต่อกลับ, เหตุการณ์ระบบ, บันทึกการอนุมัติ/ตั้งค่า
- ทุกตาราง Supabase เปิด RLS โดยไม่มี policy จึงเข้าถึงได้จาก server (service role) เท่านั้น
- ระบบไม่แก้ไข Google Sheets เดิม เพราะใช้ scope `spreadsheets.readonly`
