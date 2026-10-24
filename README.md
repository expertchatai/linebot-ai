# Expert Watch LINE Bot

บอทตอบแชท LINE OA อัตโนมัติจาก FAQ ใน Google Sheet โดยใช้ Gemini ช่วยเขียนคำตอบ

```
ลูกค้าทักใน LINE
   → Webhook URL  /api/line-webhook
   → Vercel Function (บอท ทำงาน 24 ชั่วโมง)
        ├─ Google Sheet  (FAQ ของร้าน)
        └─ Gemini AI     (อ่าน FAQ + คิดคำตอบ)
   → ส่ง reply กลับ
   → ลูกค้าได้คำตอบ (~2 วินาที)
```

## ไฟล์หลัก

| ไฟล์ | หน้าที่ |
|---|---|
| `src/app/api/line-webhook/route.ts` | รับข้อความจาก LINE, ตรวจลายเซ็น, ตอบกลับ |
| `src/lib/faq.ts` | อ่าน FAQ จาก Google Sheet (แคชไว้ 5 นาที) |
| `src/lib/sheets.ts`, `src/lib/parser.ts` | ดึงข้อมูลจาก Sheet และแยกคำถาม/คำตอบ |
| `src/lib/gemini.ts` | ส่ง FAQ + คำถามให้ Gemini แล้วรับคำตอบ |
| `src/lib/line.ts` | ส่งข้อความกลับ LINE |

## รันในเครื่อง

```bash
cp .env.example .env.local   # ใส่ key
npm install
npm run dev
npm test
```

ขั้นตอนติดตั้งบน Vercel และ LINE: [docs/SETUP.md](docs/SETUP.md)

## แก้ FAQ

แก้ใน Google Sheet ได้เลย บอทจะใช้ข้อมูลใหม่ภายใน 5 นาที
แต่ละแท็บคือหนึ่งหมวด และแต่ละแถวเขียนได้สองแบบ
- คอลัมน์ A เซลล์เดียว: `คำถาม : ...` ขึ้นบรรทัดใหม่ `คำตอบ : ...`
- หรือคอลัมน์ A = คำถาม, คอลัมน์ B = คำตอบ

ถ้า FAQ ไม่มีคำตอบ บอทจะตอบว่าให้เจ้าหน้าที่ตอบกลับ พนักงานจึงต้องคอยดูแชทใน LINE OA Manager ด้วย
