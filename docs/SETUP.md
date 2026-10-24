# คู่มือติดตั้งและเชื่อมต่อระบบ

ทำตามลำดับนี้ ทุกขั้นตอนยังอยู่ใน **TEST MODE** ลูกค้าจริงจะยังไม่ได้รับคำตอบจาก AI

## 1. Supabase

1. สร้าง Project ใหม่ เลือก Region **Southeast Asia (Singapore)**
2. เปิด **SQL Editor** วางเนื้อหา `supabase/migrations/0001_init.sql` ทั้งไฟล์ แล้วกด Run
3. คัดลอกค่าจาก **Project Settings → API** มาใส่ env
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (service_role) — **ห้ามใส่ฝั่ง browser**
4. Scheduler ให้ทำหลัง Deploy Vercel เสร็จ (ดูขั้นตอนที่ 7)

## 2. Google Gemini

1. สร้าง API key ที่ [Google AI Studio](https://aistudio.google.com/apikey) → `GEMINI_API_KEY`
2. `GEMINI_MODEL` ค่าเริ่มต้นคือ `gemini-3.5-flash` เปลี่ยนได้ผ่าน env
3. **ต้องเปิด Billing (Paid tier)** เพราะข้อมูลที่ส่งผ่าน Free tier อาจถูกนำไปใช้ปรับปรุงบริการของ Google
   ซึ่งขัดกับข้อกำหนดเรื่องความเป็นส่วนตัวของลูกค้า

## 3. Google Sheets (อ่านอย่างเดียว)

Spreadsheet ID: `1GXglURewLCrX9Gpv9GtXKgSWdgn1l29Hnb80P_dK1lw`

**วิธีที่แนะนำ: Service Account**
1. ที่ Google Cloud Console สร้าง Project แล้วเปิด **Google Sheets API**
2. ไปที่ IAM → Service Accounts → Create → Keys → Add key (JSON)
3. แชร์ Google Sheet ให้อีเมลของ Service Account แบบ **Viewer**
4. แปลงไฟล์ JSON เป็นบรรทัดเดียวแล้วใส่ใน `GOOGLE_SERVICE_ACCOUNT_JSON`

ทางเลือกสำรอง: ถ้า Sheet ยังแชร์แบบ "Anyone with the link" ให้ใช้ API key ที่เปิด Sheets API ไว้ใส่ใน `GOOGLE_API_KEY`
ปัจจุบัน Sheet นี้ **เปิดอ่านแบบสาธารณะอยู่** ควรเปลี่ยนเป็นแชร์เฉพาะทีมและ Service Account

รูปแบบข้อมูลที่ระบบรองรับ: แต่ละแท็บคือหนึ่งหมวด และแต่ละแถวเขียนได้สองแบบ
- คอลัมน์ A เซลล์เดียว: `คำถาม : ...` ขึ้นบรรทัดใหม่ `คำตอบ : ...` (ใช้ `ถาม/ตอบ` หรือ `Q/A` แทนได้)
- หรือคอลัมน์ A = คำถาม, คอลัมน์ B = คำตอบ

## 4. LINE OA (ต้องมี 2 Channel)

สร้าง Messaging API channel สองตัวใน **Provider เดียวกัน** เพื่อให้ LINE userId ของพนักงานตรงกันทั้งสองช่อง

### 4.1 OA ลูกค้า (OA เดิมของ Expert Watch)
- Webhook URL: `https://<โดเมน>/api/webhooks/line` → เปิด **Use webhook**
- LINE OA Manager → Response settings: เปิด **Chat** ไว้ให้พนักงานตอบได้ และ **ปิด Auto-response** (ไม่งั้นลูกค้าจะได้คำตอบซ้ำ)
- `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`

### 4.2 OA ผู้ดูแล (สร้างใหม่ ใช้เฉพาะทีม)
- Webhook URL: `https://<โดเมน>/api/webhooks/line-admin` → เปิด **Use webhook**
- เปิด **Allow bot to join group chats** และปิด Auto-response
- `LINE_ADMIN_CHANNEL_SECRET`, `LINE_ADMIN_CHANNEL_ACCESS_TOKEN`
- สร้างกลุ่ม LINE สองกลุ่ม ได้แก่ **Admin** และ **Super Admin** แล้วเชิญ OA ผู้ดูแลเข้ากลุ่ม
  บอทจะตอบ Group ID มาให้ (หรือพิมพ์ `GROUPID` ในกลุ่ม) นำไปใส่ `LINE_ADMIN_GROUP_ID` และ `LINE_SUPER_ADMIN_GROUP_ID`
- Super Admin แต่ละคนแอด OA ผู้ดูแลเป็นเพื่อน แล้วพิมพ์ `MYID` นำค่าที่ได้ไปใส่ `SUPER_ADMIN_LINE_USER_IDS` (คั่นด้วย comma)

## 5. Facebook Messenger

1. ที่ [Meta for Developers](https://developers.facebook.com) สร้าง App ประเภท Business แล้วเพิ่ม product **Messenger**
2. เชื่อม Page ของ Expert Watch แล้ว Generate **Page Access Token** → `FB_PAGE_ACCESS_TOKEN`
3. App Settings → Basic → **App Secret** → `FB_APP_SECRET`
4. ตั้งค่า Webhook
   - Callback URL: `https://<โดเมน>/api/webhooks/messenger`
   - Verify Token: ตั้งเป็นข้อความสุ่ม แล้วใส่ค่าเดียวกันใน `FB_VERIFY_TOKEN`
   - Subscribe field: `messages`
5. ระหว่างที่ App ยังอยู่ใน Development mode จะมีแค่ผู้ที่มี role ใน App เท่านั้นที่ส่งข้อความเข้ามาได้
   ถ้าจะใช้กับลูกค้าจริง ต้องผ่าน App Review สิทธิ์ `pages_messaging` ก่อน

## 6. Vercel

1. Import repo จาก GitHub ระบบจะใช้ `vercel.json` (`"framework": "nextjs"`, region `sin1`) อัตโนมัติ
2. ใส่ Environment Variables ทั้งหมดจาก `.env.example`
   - `CRON_SECRET`, `SESSION_SECRET`: ใช้ข้อความสุ่มยาว 32 ตัวอักษรขึ้นไป (`openssl rand -hex 32`)
   - `DASHBOARD_PASSWORD`: รหัสผ่านที่คาดเดายาก
   - `ALLOW_LIVE_MODE=false`
3. Deploy แล้วนำโดเมนที่ได้ไปตั้งเป็น Webhook URL ในขั้นตอนที่ 4 และ 5
4. **แผน Hobby:** ฟังก์ชันรันได้ไม่เกิน 60 วินาที ซึ่งเพียงพอแล้ว (เราตั้ง `maxDuration = 60` ไว้)

## 7. Scheduler (เรียก `/api/jobs/tick` ทุก 1 นาที)

งานที่รันในแต่ละ tick: ตรวจ Google Sheets, รอให้หยุดแก้ไขครบ 1 นาทีแล้วส่งขออนุมัติ, เตือนเรื่องที่ยังไม่มีคนรับ, ประมวลผลข้อความที่ค้าง และลบข้อมูลชั่วคราว

**แนะนำ: Supabase pg_cron** (ใช้ได้ทุกแผนของ Vercel)
1. Supabase → Database → Extensions → เปิด `pg_cron` และ `pg_net`
2. รัน SQL ต่อไปนี้ (แทนค่า `<โดเมน>` และ `<CRON_SECRET>`)

```sql
select cron.schedule(
  'expert-watch-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<โดเมน>/api/jobs/tick',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    timeout_milliseconds := 55000
  );
  $$
);
```

ทางเลือก: ถ้าใช้ Vercel Pro ให้เพิ่ม `"crons": [{ "path": "/api/jobs/tick", "schedule": "* * * * *" }]` ใน `vercel.json`
(Vercel จะแนบ `Authorization: Bearer $CRON_SECRET` ให้อัตโนมัติ) ส่วนแผน Hobby ตั้ง cron ได้วันละครั้งเท่านั้น จึงไม่พอสำหรับงานนี้

## 8. ตรวจสอบหลังติดตั้ง

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<โดเมน>/api/jobs/tick
```
ถ้าได้ `{"ok":true,"results":{"sheets":"sheets:changes-detected",...}}` แสดงว่าระบบอ่าน Sheet ได้แล้ว
ประมาณ 1–2 นาทีต่อมา กลุ่ม Admin จะได้รับข้อความขออนุมัติชุดแรก ซึ่งมีข้อมูลทั้งหมดประมาณ 72 รายการ
จากนั้นทำตาม [TEST_PLAN.md](TEST_PLAN.md) ต่อ
