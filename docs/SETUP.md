# ติดตั้งบอท (ประมาณ 20 นาที)

## 1. Gemini API key
1. เข้า [Google AI Studio](https://aistudio.google.com/apikey) แล้วกด **Create API key**
2. เก็บค่าไว้ใช้เป็น `GEMINI_API_KEY`

> ข้อมูลที่ส่งผ่าน Free tier อาจถูก Google นำไปใช้ปรับปรุงบริการ ถ้าไม่ต้องการ ให้เปิด Billing

## 2. ให้บอทอ่าน Google Sheet ได้
ตอนนี้ Sheet แชร์แบบ "ทุกคนที่มีลิงก์" ไว้แล้ว จึงใช้แค่ API key ก็พอ
1. เข้า [Google Cloud Console](https://console.cloud.google.com) แล้วสร้าง Project
2. ไปที่ APIs & Services → Library → เปิด **Google Sheets API**
3. ไปที่ APIs & Services → Credentials → **Create credentials → API key**
4. แนะนำให้กด Restrict key และเลือกให้ใช้ได้เฉพาะ Google Sheets API
5. เก็บค่าไว้ใช้เป็น `GOOGLE_API_KEY`

ถ้าอยากปิด Sheet ไม่ให้คนนอกเห็น ให้ใช้ Service Account แทน: สร้าง Service Account → Keys → JSON
แล้วแชร์ Sheet ให้อีเมลของ Service Account แบบ Viewer และใส่ JSON (ทั้งไฟล์ในบรรทัดเดียว) ลงใน `GOOGLE_SERVICE_ACCOUNT_JSON`

## 3. LINE channel
1. เข้า [LINE Developers](https://developers.line.biz/console/) แล้วเลือก Provider และ channel ของ OA ร้าน
   (ถ้ายังไม่มี Messaging API channel ให้เปิดที่ LINE OA Manager → Settings → Messaging API)
2. แท็บ **Basic settings** → เก็บ **Channel secret** ไว้ใช้เป็น `LINE_CHANNEL_SECRET`
3. แท็บ **Messaging API** → กด Issue **Channel access token** แล้วเก็บไว้ใช้เป็น `LINE_CHANNEL_ACCESS_TOKEN`

## 4. Deploy บน Vercel
1. เข้า [vercel.com/new](https://vercel.com/new) แล้ว Import repo `expertchatai/linebot-ai`
2. ไม่ต้องเลือก Framework เพราะ `vercel.json` ตั้งเป็น Next.js ไว้แล้ว
3. ใส่ **Environment Variables** ดังนี้
   - `LINE_CHANNEL_SECRET`
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `GEMINI_API_KEY`
   - `GOOGLE_API_KEY`
4. กด **Deploy** แล้วจะได้โดเมนเช่น `https://linebot-ai.vercel.app`

## 5. ต่อ Webhook
1. กลับไปที่ LINE Developers → แท็บ **Messaging API**
2. ใส่ **Webhook URL** เป็น `https://<โดเมน>/api/line-webhook` แล้วกด **Verify** ต้องขึ้นว่า Success
3. เปิด **Use webhook**
4. ไปที่ LINE OA Manager → Settings → Response settings แล้ว **ปิด Auto-response messages** (ไม่งั้นลูกค้าจะได้คำตอบซ้ำ)
   และเปิด Chat ค้างไว้ เพื่อให้พนักงานยังตอบเองได้

## 6. ทดสอบ
ทักไลน์ร้านว่า "เปิดกี่โมงคะ" บอทควรตอบภายในประมาณ 2 วินาที

ถ้าบอทไม่ตอบ ให้เช็คตามนี้
- ดู log ที่ Vercel → Project → **Logs**
- Webhook URL ต้องลงท้ายด้วย `/api/line-webhook`
- หลังแก้ Environment Variables แล้ว ต้องกด **Redeploy** ทุกครั้ง
