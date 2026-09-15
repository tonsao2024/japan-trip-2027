# Fuji Trip / ระบบจัดแผนและหารค่าใช้จ่ายกลุ่ม

Static HTML + CSS + JavaScript ES Modules + Firebase Modular SDK 11.10.0 สำหรับ GitHub Pages ไม่ต้องใช้ build tool หรือ backend server ของตัวเอง

## เริ่มทดลอง

ในโฟลเดอร์นี้ รัน:

```sh
python3 -m http.server 8080
```

เปิด `http://localhost:8080/?demo=1` โหมดนี้ไม่โหลด Firebase และไม่เขียนข้อมูลจริง ข้อมูลตัวอย่างเก็บใน localStorage ของเบราว์เซอร์ สามารถตั้ง PIN 6–12 หลักแล้วทดลองแก้ไขได้ รหัสผ่านชั้นที่ 2 ของโหมดทดลองคือ `demo1234` การอัปโหลดไฟล์ใช้ได้เฉพาะโหมด Firebase จริง

เปิด `http://localhost:8080/` เพื่อใช้ Firebase จริง ต้องตั้งค่าด้านล่างก่อน ห้ามเปิด index.html ผ่าน `file://` เพราะ ES Modules ต้องทำงานผ่าน HTTP/HTTPS

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | โครงหน้า แท็บ ฟอร์ม dialog และ CDN dependencies |
| `style.css` | Responsive UI, Light/Dark, Fuji, หิมะ, reduced motion |
| `firebase-config.js` | Config ที่ให้มา, Firestore, Storage, Auth และ Analytics แบบ opt-in |
| `app.js` | DOM, นาฬิกา, filter, countdown, map, chart, form, export, backoffice |
| `services.js` | onSnapshot, transactions, CRUD, upload และ authentication |
| `domain.js` | สูตรหารเงิน แปลงสกุลเงิน จัดเวลา และ settlement ที่ทดสอบแยกได้ |
| `demo-services.js` | adapter ทดลองใน localStorage แยกจาก Firebase |
| `data-model.json` | ตัวอย่าง collection/document และชนิดข้อมูล |
| `firestore.rules` / `storage.rules` | กฎสิทธิ์เข้าถึงฝั่ง Firebase |
| `firebase.json` | path ของ rules สำหรับ Firebase CLI |
| `tests/domain.test.js` | ทดสอบสูตรเงินและเวลา |

## ตั้งค่า Firebase ครั้งแรก

### 1. Authentication

ใน Firebase Console ของ `japantrip2027-5bf9f`:

1. เปิด Authentication → Sign-in method → Email/Password
2. สร้างบัญชีของผู้ดูแลและเพื่อนใน Authentication → Users
3. คัดลอก UID ของแต่ละบัญชี
4. เพิ่มโดเมน GitHub Pages `<username>.github.io` ใน Authentication → Settings → Authorized domains และ `localhost` สำหรับทดสอบ
5. สร้าง Firestore Database (default) และเปิด Firebase Storage ให้เรียบร้อย ตรวจสอบว่าบักเก็ตตรงกับ `firebase-config.js` และแพ็กเกจ/การเรียกเก็บเงินของโปรเจกต์รองรับ Storage ที่ใช้

ไม่มีบัญชีเริ่มต้นหรือรหัสผ่านจริงฝังในซอร์ส

### 2. สมาชิกที่มีสิทธิ์เปิดแอป

สร้าง collection `members` และ document ID เป็น **Firebase Auth UID จริง** ของแต่ละคน:

```json
{ "role": "admin" }
```

role เลือกได้ `viewer`, `editor`, `admin`:

- viewer: ดูแผน ค่าใช้จ่าย แผนที่ สรุป และ export
- editor: เพิ่ม/แก้ไขบิลและแผน อัปโหลดรูป จัดลำดับ หลังปลดล็อก PIN
- admin: ทำแบบ editor และลบข้อมูล/เปลี่ยนเรท/ตั้งค่าทริป หลังยืนยันรหัสผ่านบัญชีอีกครั้ง

`members/{uid}` เป็นสิทธิ์บัญชี ส่วน `settings/trip.members` เป็นรายชื่อคนที่ร่วมหารเงิน ใช้คนละ ID และหน้าที่ สมาชิกหารเงินไม่จำเป็นต้องมีบัญชีทุกคน สิทธิ์บัญชีแก้จาก Console/Trusted Admin SDK เท่านั้น

### 3. ตั้งค่าทริป

สร้าง document `settings/trip` โดยคัดลอกค่าใน `data-model.json` ส่วน `settings.trip` เป็น field จริงของ document (ไม่ใช่เก็บ JSON ทั้งก้อนเป็น string):

```json
{
  "title": "Japan, together.",
  "exchangeRate": 0.24,
  "members": [
    { "id": "may", "name": "เมย์" },
    { "id": "bank", "name": "แบงค์" },
    { "id": "ploy", "name": "พลอย" },
    { "id": "ton", "name": "ต้น" }
  ],
  "memberIds": ["may", "bank", "ploy", "ton"],
  "scheduleVersion": 0,
  "revision": 1
}
```

เรท `0.24` เป็น **ตัวอย่างสำหรับเริ่มต้น ไม่ใช่เรทตลาด** เปลี่ยนตามเรทจริงที่ต้องการจากหลังบ้าน ค่า members และ memberIds ต้องตรงกัน สมาชิกสูงสุด 20 คน

เริ่มต้น `plans` / `costs` ว่างได้ แอปจะสร้าง collection เมื่อเพิ่มรายการแรก ไม่ต้องนำข้อมูลตัวอย่างเข้าโปรเจกต์จริง

### 4. ติดตั้ง Security Rules

วางเนื้อหา `firestore.rules` ใน Firestore → Rules และ `storage.rules` ใน Storage → Rules แล้ว Publish ทั้งสอง หรือใช้ Firebase CLI ที่ติดตั้งและ login แล้ว:

```sh
firebase deploy --only firestore:rules,storage --project japantrip2027-5bf9f
```

เมื่อ Storage ถามสิทธิ์เชื่อม Firestore เพื่ออ่านสมาชิก ให้เปิดสิทธิ์ดังกล่าว ทุกการอ่านต้องเป็นบัญชีสมาชิก ทุกการเขียนตรวจ role ฝั่ง server ห้ามใช้กฎ `allow read, write: if true`

กฎยังตรวจยอดรวมกับ shares, สกุลเงิน, ค่าธรรมเนียม, revision, ownership ของ upload และ version ของแผน กฎ settings อนุญาตให้เพิ่มสมาชิกและเปลี่ยนชื่อ โดยเก็บ ID เดิมเพื่อรักษาประวัติ แอดมินที่ใช้ Console มีสิทธิ์ข้าม rules จึงต้องรักษาโครงสร้างข้อมูลตามตัวอย่าง

### 5. ทดสอบข้อมูลจริง

เข้าสู่ระบบด้วยผู้ดูแล ตั้ง PIN ปลดล็อก และเพิ่มสถานที่/บิลจากแอป เปิดอีกเบราว์เซอร์ด้วยบัญชีเพื่อนเพื่อตรวจ real-time ก่อนใช้งานทริปจริง

## นำขึ้น GitHub Pages

1. สร้าง repository ที่ต้องการ
2. นำ **ไฟล์ข้างในโฟลเดอร์ fuji-trip** ไปไว้ที่ root ของ repository รวม `.nojekyll` (หรือวางใน `docs/` และเลือก source ให้ตรง)
3. ไป Settings → Pages → Deploy from a branch เลือก `main` และ `/(root)`
4. เปิด URL ที่ GitHub แจ้ง เช่น `https://<username>.github.io/<repository>/`
5. เพิ่มโดเมนดังกล่าวใน Firebase Authentication ตามขั้นตอนข้างต้น

ใช้ relative paths ทั้งหมด จึงรองรับ project subpath ของ Pages ไม่มี SPA rewrite หรือ Node.js server ฝั่ง production ไม่ต้องรัน `npm install` เพื่อเปิดเว็บ `package.json` มีไว้สำหรับเรียก test/serve เท่านั้น

Firebase web config เป็น public identifier ไม่ใช่ admin secret อย่าใส่ service-account JSON, private key หรือรหัสผ่านบัญชีลง repository

## วิธีใช้งานและพฤติกรรมสำคัญ

### แผนการเดินทาง

- เริ่มที่ **Up Next** ทุกครั้ง: แสดงกิจกรรมที่ยังไม่จบในวันเดินทางถัดไป หากจบทริปแล้วเลือก “ทั้งหมด” เพื่อดูย้อนหลัง
- “เลือกวัน” รองรับ checkbox วันเดียวหรือหลายวัน
- เวลาที่ป้อน/แสดงในแผนเป็น Tokyo (UTC+09:00) เสมอ ไม่ขึ้นกับ timezone เครื่อง นาฬิกา BKK/TYO แยกกัน
- `durationMin` = เวลาที่อยู่สถานที่, `travelMin` = เวลาเดินทาง **หลังออกจากสถานที่นั้น**
- แก้เวลา/ระยะเวลาที่แถวหนึ่งจะคำนวณแถวถัดไปภายในวันเดียวกัน เวลาแถวก่อนหน้าคงเดิม และปฏิเสธเวลาใหม่ที่ทับแถวก่อนหน้า
- ลากภายในวันเดียวกันบนเดสก์ท็อป หรือใช้ ↑ ↓ บนมือถือ การเรียงใหม่เริ่มจากเวลาแรกเดิมของวัน
- เปลี่ยนวันได้ในฟอร์ม จะย้ายไปท้ายวันใหม่และคำนวณวันเดิมใหม่
- เวลาอาจข้ามเที่ยงคืนได้ `day` เป็นวันกลุ่มแผนเดิม แต่ startMs/endMs เป็น instant จริง ไม่ได้ตรวจการทับซ้อนข้ามกลุ่มวัน จัดเวลาทั้งสองวันให้สอดคล้องกัน
- Popup เตือนเมื่อกิจกรรมปัจจุบันเหลือไม่เกิน 15 นาที ครั้งเดียวต่อรายการและเวลา endMs ต่อ browser session ใช้ได้เฉพาะหน้าเว็บที่ยังเปิดอยู่ ไม่ใช่ push notification ขณะปิดเว็บ หาก dialog อื่นเปิดจะรอให้ปิดก่อน
- รูปสถานที่ใช้ HTTPS URL จาก Firestore หรืออัปโหลด JPG/PNG/WebP สูงสุด 5 MB แผนที่ใช้พิกัด lat/lng และหมุดจากรายการที่ผ่าน filter

### บิลและการหาร

- รองรับ JPY (จำนวนเต็มเยน) และ THB (ทศนิยมไม่เกิน 2 ตำแหน่ง)
- `baseMinor`, `feeMinor`, `totalMinor`, `shares`, `fixedShares` เก็บเป็นจำนวนเต็มหน่วยย่อย ไม่ใช่ floating point เงิน
- THB 125.50 เก็บ 12550; JPY 125 เก็บ 125
- เลือกคนร่วมจ่าย กรอกยอดของบางคน ที่เหลือเว้นว่าง ระบบแบ่งยอดคงเหลือโดยอัตโนมัติ รวมค่าธรรมเนียมแล้ว ช่อง 0 เป็นยอดกำหนดเอง ไม่ใช่ช่องว่าง
- เศษหน่วยย่อยแบ่งให้คนที่เว้นว่างตามลำดับสมาชิก คนแรก ๆ ได้เพิ่มทีละ 1 หน่วย ยอดรวมตรงบิลเสมอ
- เงินสดไม่มีค่าธรรมเนียม บัตรเครดิตระบุชื่อบัตรและเปอร์เซ็นต์ ค่าธรรมเนียมปัดตามหน่วยย่อยของสกุลเงิน
- เปลี่ยนสกุลเงินในฟอร์มหมายถึงกรอกยอดในหน่วยใหม่ ไม่ใช่แปลงอัตโนมัติ ตรวจยอดที่กำหนดเองอีกครั้ง
- แต่ละบิลเก็บ exchangeRate ณ ตอนสร้าง แก้บิลย้อนหลังยังใช้เรทเดิม การเปลี่ยนเรทหลังบ้านใช้กับบิลใหม่
- สรุป THB แปลงต่อบิลและกระจายเศษสตางค์ด้วย largest remainder เพื่อให้ยอดรายบุคคลรวมเท่าบิล กราฟหมวดรายบุคคลแสดงค่าแปลงจากยอดต้นฉบับ (อาจต่างเศษสตางค์จากยอดชำระที่จัดสรร)
- Settlement คำนวณยอดรับ/จ่ายสุทธิและเสนอการโอน เป็นข้อเสนอ ไม่มี ledger บันทึกว่าโอนชำระแล้ว
- ยอดบัตรแยกตาม **ผู้จ่าย + ชื่อบัตร** และแสดงยอดต้นฉบับ JPY/THB พร้อมยอดรวม THB
- PNG ส่งออกเฉพาะพื้นที่สรุป ไม่รวมแผนที่หรือรูปภายนอก ลดปัญหา CORS; ใช้ Chart.js และ html2canvas ผ่าน CDN

### PIN และรหัสผ่านชั้นที่ 2

- ครั้งแรกเป็น read-only หลังเข้าสู่ระบบ editor/admin ตั้ง PIN ของอุปกรณ์ 6–12 หลัก
- จดจำ PIN และสถานะปลดล็อกใน localStorage ตาม UID; refresh ยังแก้ไขได้จนกด “ล็อกการแก้ไข” หรือออกจากระบบ
- **PIN ใน localStorage เป็นเพียงล็อก UI ตามโจทย์ ไม่ใช่ขอบเขตความปลอดภัย** ผู้ที่ใช้เบราว์เซอร์เดียวกันสามารถอ่าน/แก้ไข localStorage ได้ การอนุญาตจริงใช้ Firebase Auth + Rules
- ชั้นที่ 2 ใช้รหัสผ่าน Firebase ของ admin ซึ่งแยกจาก PIN เรียก `reauthenticateWithCredential` และ refresh token โดยไม่เก็บรหัสผ่านนี้
- Rules อนุญาต sensitive actions เมื่อ admin เพิ่งยืนยันตัวตนภายใน 120 วินาที เป็น recent-login gate ไม่ใช่ OTP/MFA หรือรหัสแบบใช้ครั้งเดียว
- หากต้องการ PIN กลางของทั้งกลุ่มที่ตรวจฝั่ง server หรือ second secret แยกจากบัญชีจริง ต้องเพิ่ม trusted backend/Cloud Function เพื่อออก token; static frontend อย่างเดียวเก็บ secret กลางอย่างปลอดภัยไม่ได้

### Real-time และความขัดแย้ง

- onSnapshot ฟัง plans, costs, settings และยกเลิก listener เมื่อออกจากระบบ
- การแก้แผนอ่าน settings.scheduleVersion และ revision ของเอกสารใน transaction แล้วเขียนแผนทั้งหมดพร้อมเพิ่ม version แบบ atomic จำกัด 450 รายการต่อทริป
- หากมีเพื่อนแก้ก่อนหน้า transaction จะปฏิเสธ snapshot เก่า ให้ปิดฟอร์มและเปิดใหม่ ข้อมูลในฟอร์มที่กำลังกรอกไม่ถูก listener เขียนทับ
- costs/settings มี revision ป้องกัน lost update เช่นเดียวกัน
- transaction ต้องออนไลน์ ไม่มี offline write queue แอปแจ้ง error และเก็บฟอร์มไว้ให้ลองใหม่
- ถ้า upload สำเร็จแต่การบันทึกเอกสารล้มเหลว จะพยายามลบไฟล์ที่เพิ่งอัปโหลด ไฟล์เก่าที่ถูกแทนที่ไม่ลบอัตโนมัติ เพื่อไม่ทำลายเอกสารที่อาจยังอ้างอิง
- Storage `getDownloadURL` เป็น URL ที่มี token ผู้ที่มีลิงก์อาจเปิดไฟล์ได้แม้ไม่เข้าสู่ระบบ หลีกเลี่ยงเผยแพร่ลิงก์สลิป และ revoke token ใน Console หากจำเป็น

## การตรวจสอบ

```sh
npm test
```

ผ่าน 8 tests ครอบคลุมการหารไม่เท่ากัน/ยอดเกินบิล/ศูนย์/เศษเงิน/ค่าธรรมเนียม/ข้ามเที่ยงคืน/รักษาแถวก่อนหน้า/settlement หลายบิล/URL ที่ไม่ปลอดภัย และตรวจ syntax ของ JavaScript แล้ว

**ยังไม่ได้ยืนยันบน Firebase จริงหรือ Rules Emulator** เพราะไม่มีบัญชีผู้ดูแล/สภาพแวดล้อม emulator ของโปรเจกต์ การเปิด browser QA ถูกจำกัดโดย sandbox ในสภาพแวดล้อมที่สร้างไฟล์ จึงยังไม่ได้ยืนยันหน้าจอจริงหรือ PNG ที่เรนเดอร์

ก่อนใช้งานจริง ตรวจต่อไปนี้:

- หน้ากว้าง 390px/1440px: ไม่มี overflow, tab/dialog/keyboard ใช้งานได้, Dark/Light และหิมะ toggle
- viewer เขียนไม่ได้; ผู้ไม่อยู่ใน members อ่านไม่ได้; editor ลบ/ตั้งค่าไม่ได้
- admin ป้อนรหัสชั้นที่ 2 ผิดต้องไม่ลบหรือแก้เรท; token เก่าถูก Rules ปฏิเสธ
- สองบัญชีแก้แผน/บิลพร้อมกัน: ผู้ถือ revision เก่าถูกปฏิเสธและไม่เกิดข้อมูลเขียนบางส่วน
- upload รูป/สลิปจริง; ปฏิเสธไฟล์เกิน 5 MB; ตรวจภาพโหลดจาก Storage ได้
- chart และ PNG ทั้งภาพรวม/รายบุคคล; CDN ไม่ถูก network policy บล็อก
- ออกจากระบบแล้วข้อมูลส่วนตัวหายจาก DOM; เปิดอีกครั้งยังต้องมีบัญชีที่ได้รับเชิญ

## แหล่งอ้างอิง

- [Firebase Modular web SDK](https://firebase.google.com/docs/web/learn-more)
- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Firestore security](https://firebase.google.com/docs/firestore/security/overview)
- [Firebase reauthentication](https://firebase.google.com/docs/auth/web/manage-users)
- [Storage uploads](https://firebase.google.com/docs/storage/web/upload-files)
- [Leaflet](https://leafletjs.com/reference.html)
- [html2canvas configuration](https://html2canvas.hertzen.com/configuration)

Analytics ปิดเป็นค่าเริ่มต้น เปิดได้เมื่อมีการยินยอมโดยตั้ง `localStorage.setItem('fuji:analytics-consent', 'yes')` แล้ว reload; หาก Analytics ไม่รองรับ แอปยังทำงานตามปกติ
