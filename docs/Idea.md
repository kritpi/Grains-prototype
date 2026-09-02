# Grains - Discover film labs near me

1. Core Vision & Concept
- Vision: แพลตฟอร์มค้นหาและรวบรวมข้อมูลร้านล้างฟิล์มและชนิดฟิล์มแบบ Crowdsourced สำหรับคอมมูนิตี้ (คล้ายแอปวงการ Specialty Coffee)
- Core Rule:
  - ฝั่งร้านล้าง (Labs): Information-first (เน้นข้อมูลที่ถูกต้อง ชัดเจน เข้าถึงง่าย)
  - ฝั่งฟิล์ม (Films): Inspiration-first (เน้น mood & tone ตัวอย่างภาพจากคอมมูนิตี้)
  - ไม่ผูกรูปที่คอมมูนิตี้อัปโหลดเข้ากับร้านล้างโดยตรง เพื่อป้องกันปัญหาเรื่องคุณภาพงานที่อาจกระทบชื่อเสียงร้าน
2. Core Features (MVP)
A. Lab Directory & Discovery (ค้นหาร้านล้าง)
- Geospatial Search: ค้นหาร้านใกล้ตัวตามพิกัดและระยะทาง (PostGIS / ST_DWithin)
- Process & Scanner Filters:
  - Chemical Process: C-41 (สีปกติ), ECN-2 (ฟิล์มหนัง), B&W (ขาวดำ), E-6 (สไลด์)
  - Scanner Models: Fuji Frontier (เน้นสกินโทน/สีหวาน), Noritsu (คม คอนทราสต์จัด), SP-3000
- Lab Metadata & Details:
  - ราคาค่าบริการแต่ละกระบวนการ และ Turnaround Time (ระยะเวลาได้รูป)
  - บริการเสริม: จุด Drop box หน้าร้าน / ช่องทางส่งทางไปรษณีย์
  - ข้อมูลติดต่อ พิกัดแผนที่ วัน-เวลาเปิดปิด และสถานะร้าน
- Lab Inventory & Supplies (ฟีเจอร์เพิ่ม):
  - ค้นหาฟิล์มที่มีจำหน่ายที่ร้าน (เช่น Kodak Double-X, Cinestill)
  - อุปกรณ์ Darkroom & เคมีภัณฑ์ (น้ำยาล้าง D-76, แทงค์ล้าง, กระดาษอัดรูป)
  - มีระบบ "Last Verified" ระบุวันที่อัปเดตสต็อกล่าสุด
B. Film Stock Index & Gallery (แคตตาล็อกฟิล์ม)
- Catalog & Metadata: ค้นหาตามชื่อฟิล์ม, ISO (100, 200, 400, 800), และฟอร์แมต (135, 120)
- Community Inspiration Gallery: ตัวอย่างภาพถ่ายจากฟิล์มแต่ละตัวเพื่อดูโทนสีก่อนซื้อ
- Reverse Search: หน้ารายละเอียดฟิล์มจะบอกเลยว่า "มีขายที่ร้านไหนบ้างใกล้คุณ"
C. Community & Data Integrity (ระบบ Crowdsource)
- "Suggest Lab / Suggest Edit": ฟอร์มเสนอเพิ่มร้านใหม่ หรือกดแจ้งแก้ไขข้อมูลที่เปลี่ยนไป
- Community Upvote / Badges: โหวตจุดเด่นร้าน เช่น "Fast Turnaround", "Clean Scan"
D. Minimal Photobook Portfolio (/u/@username)
- Concept: หน้า Public Profile สไตล์ Early Instagram ผสม Fine Art Photobook เน้นโชว์ผลงานคราฟต์ ไร้ noise โฆษณาและยอดไลก์
- Core Mechanics:
  - Curation by Roll: จัดแสดงภาพเป็นชุดภาพ (Roll) หรือ Minimal Grid ที่เคารพ Aspect Ratio จริง (3:2, 1:1, 6:7)
    - "Roll" is the locked canonical term for the curation unit — see [CONTEXT.md](../CONTEXT.md). Previously the brief used "Story"/"Photo Essay"/"Series" interchangeably; avoid those going forward.
  - Analog Metadata Linkage: ผูก Film Stock, Camera, Lab, Scanner เข้ากับ Directory กลาง
  - Short Artist Note: พื้นที่เขียนบันทึกโมเมนต์สั้นๆ 2-3 บรรทัดใต้ชุดภาพ
  - MVP Safeguards: จำกัดจำนวนภาพต่อผู้ใช้เพื่อคุม Storage และกระตุ้นให้เลือกเฉพาะ Best Shots
3. Design Direction & Visual Identity
- Vibe & Influence: ได้รับแรงบันดาลใจจากช่างภาพ Street & Editorial (Saul Leiter, Cartier-Bresson, Vivian Maier, Joe Greer, Willem Verbeeck)
- Layout & Space: Editorial Grid, Negative Space สูง, ไร้เส้นขอบหนาและเงาฟุ้งแบบ generic SaaS
- Color Palette:
  - Light: Warm Fine-Art Paper (เช่น #F9F8F6, Off-White)
  - Dark: Muted Charcoal / Deep Obsidian
- Typography Pairing:
  - Headings / Series Title: Editorial Serif (เช่น Instrument Serif หรือ Newsreader)
  - Metadata / UI Labels: Clean Minimalist Sans หรือ Mono ขนาดเล็ก คล้ายป้าย Exhibition Tag ในหอศิลป์
- Frame Respect: ไม่บังคับครอปภาพ รองรับการแสดงผลแบบ Contact Sheet ขอบฟิล์มเดิม
4. Suggested Tech Stack
- Frontend: Next.js (App Router), Tailwind CSS, shadcn/ui
- Backend / API: Go หรือ Next.js Server Actions / API Routes
- Database: PostgreSQL (Supabase) + PostGIS extension สำหรับการคำนวณพิกัดระยะทาง