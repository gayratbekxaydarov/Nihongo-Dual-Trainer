# nihongo-dual-trainer

Kanji o'rganish uchun ikki rejim. Ikkalasi ham telefonda ishlaydi, orqa fonda yapon manzarasi.

| Rejim | Papka | Tavsif |
|---|---|---|
| Ovozli | `1-voice-trainer` | Kanji chiqadi. **Space**ni (telefonda tugmani) bosib turib o'qiysiz. To'g'ri bo'lsa keyingisiga o'tadi. Xato bo'lsa hiragana, romaji ko'rsatiladi, talaffuz ovozda aytiladi va keyingisiga o'tadi |
| Taymerli | `2-timer-trainer` | Boshida "necha soniya?" deb so'raydi. Keyin faqat kanji ko'rinadi va shu vaqtdan keyin o'zi almashadi |

## So'zlar

Ikkala rejim ham ildizdagi `words.json` ni o'qiydi:

```json
{"kanji": "下げる", "reading": "さげる", "romaji": "sageru", "meaning": "Tushirmoq"}
```

Ixtiyoriy `"alt": ["..."]` bilan qo'shimcha to'g'ri o'qilishlar berish mumkin.

## Ovozli rejim qanday tekshiradi

1. Brauzer (Chrome) ovozni matnga aylantiradi.
2. Matn kanji yoki o'qilishga aynan mos kelsa, darrov to'g'ri hisoblanadi.
3. Mos kelmasa, matn serverga yuboriladi (`POST /api/check`). Server uni **pykakasi** bilan talaffuzga (hiragana) aylantirib, kutilgan o'qilish bilan solishtiradi. Shu tufayli bir xil o'qiladigan kanjilar (下りる / 降りる, ikkalasi `おりる`) ham to'g'ri hisoblanadi.
4. Solishtirish qat'iy: `さげる` va `さがる` kabi bir harfga farq qiluvchi so'zlar aralashmaydi.

## Lokal ishga tushirish

```bash
docker compose up --build
```

- Ovozli: http://localhost:8001
- Taymerli: http://localhost:8002

Eslatmalar:
- Bepul tarifda servis 15 daqiqa ishlatilmasa uxlaydi, keyingi ochilish sekin bo'ladi.
- Render HTTPS beradi, shuning uchun telefonda mikrofon ruxsati ishlaydi.

## Ovozli rejim uchun

- Eng yaxshi ishlaydigan brauzer: **Chrome** (kompyuter va Android). Firefox ovoz aniqlashni qo'llab-quvvatlamaydi, iPhone'dagi Safari'da cheklovlar bor.
- Internet kerak: Chrome ovozni Google serverida aniqlaydi.
- Talaffuzni ovozda aytish uchun qurilmada yapon ovozi bo'lishi kerak.
