# ASSET PIPELINE — Evolutionary Tycoon

**Sürüm:** 1.0 · **Tarih:** 2026-08-14 · **Durum:** GATE 0 — onay bekliyor
**Kanıt:** [RESEARCH_NOTES §6–7](RESEARCH_NOTES.md#6-animasyon-iskelet-animasyon-araçlarının-durumu)

> **Bu pipeline'ın tek amacı:** TUTARLILIK. Tek tek güzel görseller değil, **birbirine ait görünen** bir dünya. Bir asset ne kadar güzel olursa olsun, stil sözleşmesine uymuyorsa reddedilir.

---

## 1. Görsel yön (Art Direction Bible)

Bu bölüm her AI üretim prompt'una **kelimesi kelimesine** eklenir. Tek doğruluk kaynağıdır.

### 1.1 Stil tanımı

```
Stil:        Temiz, sıcak, hafif stilize izometrik illüstrasyon.
             Fotogerçekçi DEĞİL. Piksel-art DEĞİL. Aşırı-cartoon DEĞİL.
             Referans hissi: modern mobil tycoon oyunlarının üst segmenti —
             okunabilir siluetler, yumuşak hacim, sakin renk.

Kamera:      2:1 dimetrik izometrik. Sabit. İstisnasız.
             Yaklaşık 30° yükseklik, 45° yaw. Perspektif YOK (ortografik).

Işık:        Tek yön: kuzeybatıdan (ekranda sol-üst), 35° eğim.
             Gölge: sağ-alta, yumuşak, %30 opak, mavimsi soğuk.
             Ambient: sıcak (gün ışığı). Bu ASLA değişmez — gün/gece
             runtime'da shader tint ile yapılır, asset'te değil.

Outline:     Dış kontur 2 px (2× ölçekte), koyu, renk-türetilmiş
             (siyah değil — nesnenin renginin koyu doygun hâli).
             İç detay çizgisi YOK — hacim gölgeyle anlatılır.

Detay:       Orta. Siluet önce. 1× ölçekte (yarı boyut) hâlâ tanınabilir olmalı.
             Küçük detaylar okunmaz, sadece gürültü yapar.

Palet:       docs/assets/palette.json — 48 renkli kilitli palet.
             Palet dışı renk kullanılamaz (doğrulama scripti kontrol eder).

Arka plan:   Şeffaf (RGBA). Zemin gölgesi ayrı katman/dosya.
```

### 1.2 Ölçek sözleşmesi

```
Dünya birimi         = 1 metre
1× izometrik tile    = 64 × 32 px  (TILE_W × TILE_H)
Yükseklik birimi     = 32 px       (TILE_Z)
ÜRETİM ölçeği        = 2×          (128 × 64 tile) → HiDPI için
Runtime              = 2× atlas + DPR'a göre ölçekleme

Referans yükseklikler (2× ölçekte, piksel):
  Yetişkin insan     = 128 px  (≈1.75 m)
  Çocuk              =  92 px
  Sedan araba        =  90 px yükseklik, 288 px uzunluk (4.5 m)
  Masa               =  50 px
  Sandalye           =  60 px
  Kapı               = 145 px
  Tabela direği      = 200 px  → BÖLÜNMELİ (bkz. §1.4)
```

### 1.3 Anchor kuralı

Her asset'in **ayak izi merkezi** anchor'dır — görsel merkez değil.

- Karakter: iki ayak arası orta nokta
- Araç: dört tekerlek merkezi
- Mobilya: taban dörtgeninin merkezi
- Bina: taban dörtgeninin merkezi

Anchor, dosya adında veya yan `.meta.json`'da kodlanır. Yanlış anchor = yanlış derinlik sıralaması = görsel hata. Doğrulama scripti anchor'ı zorunlu tutar.

### 1.4 Uzun nesne bölme kuralı (ZORUNLU)

Yüksekliği **160 px'i (2× ölçek)** aşan hiçbir nesne tek sprite olarak var olamaz. Alt ve üst parçalara bölünür (`_lower`, `_upper`), her parçanın kendi anchor'ı ve kendi derinliği olur.

**Neden:** İzometrik derinlik sıralamasında uzun nesneler döngü (cycle) yaratır — A, B'nin arkasında ama B de A'nın arkasında. Bunu çalışma zamanında çözmek O(n²) topolojik sıralama gerektirir ([RESEARCH_NOTES §11](RESEARCH_NOTES.md#11-i̇zometrik-derinlik-sıralama-teknikleri)). Asset seviyesinde bölerek problemi **var olmadan** çözüyoruz.

Doğrulama scripti bu kuralı zorlar: 160 px'i aşan ve adında `_lower`/`_upper` olmayan sprite **build'i kırar**.

> **Kapsam düzeltmesi (2026-08-21, konsolidasyon pasosu — değişiklik kaydı
> PROJECT_MEMORY §22 AO/AP):** kural, yürünebilir alanın İÇİNDEN geçilen statik
> nesneler için vardır — bir kişi ağacın gövdesinin arkasında ve tepesinin
> önünde aynı anda olabilir; bölme bu derinlik döngüsünü çözer. **Araçlar (`veh`)
> kapsam dışıdır:** araç yol düzleminde tek kinematik birimdir, yayalar iki
> yarısının arasından geçmez ve motor her arketipi yön başına tek kare çizer —
> `bus_lower/upper` diye bir çift hiçbir tüketicisi olmayan dosya olurdu. Eşik
> (160 px gövde) değişmedi; yalnız kuralın uygulandığı küme, kuralın var olma
> nedenine daraltıldı. 2.5 m'yi aşan otobüs/kamyon gövdeleri bu yüzden tek
> sprite'tır.

---

## 2. Asset kategorileri

Her kategori için: kaynak formatı → üretim formatı → runtime formatı, isimlendirme, çözünürlük, atlas, animasyon.

| Kategori                 | Kaynak                | Üretim                      | Runtime                    | Atlas              | Animasyon                |
| ------------------------ | --------------------- | --------------------------- | -------------------------- | ------------------ | ------------------------ |
| **Karakter parçaları**   | AI PNG 2048²          | PNG-32 RGBA, kırpılmış      | WebP + PNG fallback        | `chars`            | Doll rig (runtime)       |
| **Araçlar**              | AI PNG                | PNG-32, 8 yön               | WebP                       | `vehicles`         | Transform + fren frame'i |
| **Yemek / ikon**         | AI PNG                | PNG-32, 128²                | WebP                       | `ui`               | Yok                      |
| **Restoran yapıları**    | AI PNG                | PNG-32, bölünmüş            | WebP                       | `structures`       | Yok (inşaat = mask)      |
| **Mutfak ekipmanı**      | AI PNG                | PNG-32                      | WebP                       | `structures`       | 2–3 frame + partikül     |
| **Masa / sandalye**      | AI PNG                | PNG-32                      | WebP                       | `props`            | Yok                      |
| **Yol + işaretleme**     | AI/vektör             | PNG-32, dikişli             | WebP                       | ayrı büyük texture | Yok                      |
| **Zemin bake'leri**      | AI + elle kompozisyon | PNG-32, 2048×1024 dilimler  | WebP                       | atlas YOK (tekil)  | Yok                      |
| **Arka plan / parallax** | AI PNG                | PNG-32 yatay tile'lanabilir | WebP                       | `bg`               | Kaydırma                 |
| **Ağaç / kaya / bitki**  | AI PNG                | PNG-32                      | WebP                       | `nature`           | Rüzgâr salınımı (shader) |
| **Tabela / işaret**      | AI + metin katmanı    | PNG-32                      | WebP                       | `structures`       | Neon flicker (shader)    |
| **Dekorasyon**           | AI PNG                | PNG-32                      | WebP                       | `props`            | Yok                      |
| **UI ikon**              | AI/vektör             | SVG → PNG 64/128            | inline SVG veya `ui` atlas | `ui`               | CSS                      |
| **Partikül**             | Prosedürel/AI         | PNG-32 64²                  | WebP                       | `fx`               | Emitter                  |
| **Efekt (buhar/duman)**  | AI PNG                | PNG-32 grayscale+alpha      | WebP                       | `fx`               | Emitter + shader         |
| **Ses**                  | AI/kütüphane          | WAV 48 kHz                  | **OGG + M4A**              | —                  | —                        |
| **Müzik**                | AI/kütüphane          | WAV                         | OGG + M4A, 128 kbps        | —                  | —                        |
| **Font**                 | —                     | WOFF2 subset                | WOFF2                      | —                  | —                        |

**Ses formatı notu:** Safari OGG/Vorbis'i tarihsel olarak sorunlu destekler. Her ses **iki formatta** üretilir (OGG + M4A/AAC); Phaser hangisini destekliyorsa onu yükler. Bu, tarayıcı uyumluluk matrisindeki en yaygın sessiz hata kaynağını kapatır.

---

## 3. İsimlendirme sözleşmesi

```
<kategori>_<konu>_<varyant>_<yön>_<durum>@<ölçek>.<uzantı>

char_body_male-01_se@2x.png
char_head_female-03_se@2x.png
char_hair_short-02_se@2x.png
char_arm-l_default_se@2x.png
veh_sedan_red_ne@2x.png
veh_sedan_red_ne_brake@2x.png
food_burger_default@2x.png
struct_grill_lv2@2x.png
struct_sign_large_lower@2x.png
struct_sign_large_upper@2x.png
prop_table_round_4seat@2x.png
ground_stage2_tile-a@2x.png
fx_steam_soft@2x.png
ui_icon_cash@2x.png
sfx_car_brake_01.ogg
```

**Kurallar:**

- Yalnızca küçük harf, kelime ayırıcı `-`, alan ayırıcı `_`.
- Yönler: `n ne e se s sw w nw`. Ayna ile üretilenler dosya olarak var olmaz (atlas metadata'sında `mirrorOf` alanı).
- Ölçek son ek zorunlu.
- Türkçe karakter yok.
- Doğrulama scripti regex ile zorlar.

---

## 4. AI üretim workflow'u

### 4.1 Temel strateji

AI **statik** üretir, **animasyon üretmez**, **tileset üretmez**. Gerekçe: [RESEARCH_NOTES §7](RESEARCH_NOTES.md#7-ai-asset-üretimi--2026-durumu-ve-tutarlılık-sorunu) — AI araçları kare-kare tutarlılıkta hâlâ üretim kalitesinde değil.

### 4.2 Araç seçimi

| İhtiyaç                         | Birincil                                 | Yedek                | Neden                                                       |
| ------------------------------- | ---------------------------------------- | -------------------- | ----------------------------------------------------------- |
| Karakter parçaları, 8 yön       | **God Mode AI**                          | PixelLab             | İzometrik ve 8-yönlü sprite'ta güçlü, ticari lisanslı çıktı |
| Stil kilidi / proje tutarlılığı | **Scenario** (art bible üzerinde eğitim) | Sprixen (Style Lock) | Kendi referanslarımız üzerinde model                        |
| Mobilya, ekipman, dekor         | Scenario / genel image model             | elle düzeltme        |                                                             |
| Zemin kompozisyonu              | AI parçalar + **elle kompozisyon**       | —                    | Bake'ler tek seferlik, elle birleştirmeye değer             |
| UI ikonları                     | Vektör (elle) veya AI → vektörleştirme   | —                    | İkonlar keskin olmalı, AI rasteri yetersiz                  |
| Ses efekti                      | AI ses üretimi + kütüphane               | freesound (CC0)      |                                                             |

**⛔ LİSANS KAPISI (Faz 4 START CONDITION — onaylı düzeltme 2026-08-14):**
Yukarıdaki araçlar **araştırmada geçtikleri için ticari olarak doğrulanmış sayılmazlar.**
Tek bir üretim asset'i (altın referanslar dahil) üretilmeden önce, her aday araç için
**birincil/resmî kaynaktan** 9 maddelik lisans doğrulaması yapılır:

1. ticari kullanım hakkı · 2. üretilen asset'in mülkiyeti/lisansı · 3. yeniden dağıtım hakkı ·
2. çıktı üzerindeki kısıtlamalar · 5. referans görsel kısıtlamaları · 6. model/eğitim şartları ve opt-out ·
3. abonelik/hesap gereksinimi ve maliyeti · 8. **abonelik bittikten sonraki kullanım hakları** ·
4. atıf gereksinimi

**Kanıt biçimi:** resmî ToS/lisans sayfası URL'i + erişim tarihi + ilgili maddenin birebir alıntısı.
**Kayıt yerleri:** `docs/RESEARCH_NOTES.md` §7 · `assets/LICENSES.md` · `docs/PROJECT_MEMORY.md` §17.

Bir sağlayıcı kriterleri karşılamıyorsa **sessizce başka araca geçilmez** — dokümante edilmiş
değişiklik talebi açılır ve onaylı alternatif değerlendirilir.

**Sürekli lisans kuralı:** Her asset'in lisansı `assets/LICENSES.md`'de kaydedilir. Belirsiz lisanslı hiçbir asset repoya girmez. Şartlar Faz 16'da ve Faz 23'te (launch) yeniden doğrulanır.

### 4.3 Tutarlılık protokolü — 6 adım

**Adım 1 — Art bible referans seti (bir kez, Faz 4)**
6–10 "altın" referans görseli elle onaylanır: bir karakter, bir araç, bir masa, bir ekipman, bir zemin parçası, bir ağaç. Bunlar stilin **tanımı** olur. Sonraki her üretim bunlara referansla yapılır.

**Adım 2 — Prompt şablonu (değişmez gövde)**

```
[STYLE BLOCK — §1.1'den kelimesi kelimesine]
[CAMERA: 2:1 dimetric isometric, fixed, orthographic]
[LIGHT: single key light from upper-left, 35°, soft cool shadow lower-right]
[PALETTE: attached palette.json colors only]
[OUTLINE: 2px dark derived outline, no interior linework]
[BACKGROUND: transparent]
[REFERENCE IMAGES: <altın referanslar>]
---
[SUBJECT: <spesifik asset açıklaması>]
[SIZE HINT: <referans yükseklik, §1.2'den>]
```

**Adım 3 — Batch üretim**
Aynı oturumda, aynı seed ailesiyle, aynı referanslarla, **kategori bütünüyle** üretilir. Bir karakter tek başına üretilmez — tüm gövdeler birlikte, tüm kafalar birlikte. Bu, aynı-oturum tutarlılığından maksimum fayda sağlar.

**Adım 4 — Otomatik doğrulama** (`pnpm assets:validate`)

```
✓ Şeffaf arka plan (köşe pikselleri alpha=0)
✓ Alpha bounding box, tuvalin ≥%60'ını kaplıyor (aşırı boşluk yok)
✓ Palet uyumu: piksellerin ≥%92'si palete Δ<8 mesafede
✓ Boyut, kategori referans yüksekliğinin ±%15'i içinde
✓ Işık yönü: parlaklık gradyanı sol-üst → sağ-alt (histogram testi)
✓ Yükseklik ≤160px VEYA adında _lower/_upper var
✓ İsimlendirme regex'i geçiyor
✓ Anchor meta'sı mevcut ve sprite sınırları içinde
✓ Dosya boyutu kategori bütçesi içinde
```

Başarısız asset **kabul edilmez**. Bu doğrulama CI'da da koşar.

**Adım 5 — İnsan onayı**
Doğrulamayı geçen asset'ler bir **contact sheet** (tüm kategori tek sayfada, gerçek oyun zemininde, %100 ve %50 ölçekte) hâlinde derlenir. Onay tek tek değil, **toplu ve karşılaştırmalı** verilir — tutarlılık ancak yan yana görülebilir.

**Adım 6 — Kayıt**
Onaylanan her asset `assets/MANIFEST.md`'ye yazılır: kaynak araç, prompt hash, tarih, lisans, hangi altın referansa dayandığı. Bu, 3 ay sonra "bu karaktere uygun yeni bir şapka üret" dendiğinde aynı sonucu almayı mümkün kılar.

### 4.4 Tutarlılık kalite kapısı

Faz 4 ve Faz 16 çıkışında:

- Tüm karakterler tek bir sahnede yan yana → aynı dünyaya ait görünüyorlar mı?
- Rastgele 20 asset seçilip contact sheet → hangisi sırıtıyor?
- Gri tonlamaya çevir → siluetler ayırt edilebiliyor mu?
- %50'ye küçült → hâlâ okunabiliyor mu?

Bu dört testin herhangi biri başarısızsa kategori yeniden üretilir.

---

## 5. Zemin bake'leri — tilemap değil

**Neden bake:** `TilemapGPULayer` yalnızca ortografiktir, izometrik desteklemez ([RESEARCH_NOTES §4](RESEARCH_NOTES.md#4-kritik-bulgu-3--phaser-4ün-hızlı-yolları-isometrik-aktörler-için-kullanılamaz)). Ama daha önemlisi: tile tekrarı, tycoon oyunlarının en belirgin görsel zayıflığı — göz deseni hemen yakalar ve dünya ucuz görünür.

**Yaklaşım:** Her evrim aşaması için arsa, **elle kompoze edilmiş 2–6 büyük statik sprite** olarak üretilir.

```
ground_stage1@2x.webp      2048 × 1024   (~180 KB)
ground_stage2@2x.webp      2048 × 1024
ground_stage3_a@2x.webp    2048 × 1024
ground_stage3_b@2x.webp    2048 × 1024
ground_stage4_a..d@2x.webp 4 dilim
road_segment@2x.webp       yatay tekrarlanabilir, 1024 × 512
```

Draw call: 2–6. Görsel kalite: illüstrasyon. Bellek: aşama başına ~1.5 MB.

**Aşama geçişi:** Yeni bake, eskinin üzerine **maskeli olarak** (Phaser stencil rendering, v4.2) açılır — inşaat animasyonu bu maskenin genişlemesidir. Sahne değişimi yok, kamera sabit, oyuncu dünyasının büyüdüğünü görür.

---

## 6. Doll rig — animasyon üretim akışı

### 6.1 Rig anatomisi

```
char_<id>/
├── body_<variant>_<dir>.png      gövde (anchor: ayak arası)
├── head_<variant>_<dir>.png      kafa
├── hair_<variant>_<dir>.png      saç/şapka (opsiyonel)
├── arm-l_<dir>.png               sol kol
├── arm-r_<dir>.png               sağ kol
├── leg-l_<dir>.png               sol bacak
├── leg-r_<dir>.png               sağ bacak
└── rig.json                      hiyerarşi, pivotlar, varsayılan transform
```

**Yön üretimi:** 4 yön üretilir (`s`, `se`, `e`, `ne`); `sw`, `w`, `nw`, `n` **ayna** ile elde edilir. Bu, karakter asset işini yarıya indirir ve tutarlılığı garanti eder (ayna, sürüklenemez).

### 6.2 Klipler

| Klip             | Tip        | Süre        | Not                              |
| ---------------- | ---------- | ----------- | -------------------------------- |
| `idle`           | Prosedürel | —           | Nefes salınımı, ara sıra bakınma |
| `walk`           | Prosedürel | —           | Sinüs tabanlı; hıza göre frekans |
| `walk_carry`     | Prosedürel | —           | `walk` + kol kilidi              |
| `take_order`     | Keyframe   | 1.2 s       |                                  |
| `cook`           | Keyframe   | 0.9 s döngü |                                  |
| `serve`          | Keyframe   | 0.8 s       |                                  |
| `clean`          | Keyframe   | 1.1 s döngü |                                  |
| `eat`            | Keyframe   | 1.4 s döngü |                                  |
| `pay`            | Keyframe   | 0.7 s       |                                  |
| `wait_impatient` | Keyframe   | 2.0 s döngü | Saate bakma, ayak sallama        |
| `happy`          | Keyframe   | 1.0 s       |                                  |
| `angry`          | Keyframe   | 1.0 s       |                                  |

**Toplam 8 elle yazılmış klip + 3 prosedürel.** Bunlar tüm karakter varyantlarına uygulanır. Sprite sheet yaklaşımında bu, varyant × klip × yön × kare = binlerce sprite demek olurdu.

### 6.3 Klip yazma aracı

`tools/rig-editor/` — Vite dev sunucusunda çalışan basit bir editör: rig'i yükler, kanalları timeline'da düzenler, JSON'a yazar. Oyunun bir parçası değil, production build'e girmez. Faz 17'de yazılır; o zamana kadar klipler elle JSON olarak yazılır (kabul edilebilir, çünkü sadece 8 tane).

### 6.4 Görsel çeşitlilik matematiği

```
8 gövde × 10 kafa × 6 saç × 4 palet varyasyonu = 1.920 görsel olarak farklı müşteri
Asset maliyeti: (8+10+6) × 4 yön = 96 sprite
```

Sprite sheet yaklaşımında 1.920 varyant için ~1.920 × 11 klip × 8 yön × 8 kare = imkânsız.

Palet varyasyonu runtime'da **shader tint** ile (kıyafet rengi), sprite kopyası olmadan.

---

## 7. Atlas stratejisi

| Atlas        | İçerik                          | Maks boyut | Yükleme           | Not                       |
| ------------ | ------------------------------- | ---------- | ----------------- | ------------------------- |
| `boot`       | Yükleme ekranı, logo, temel UI  | 1024²      | Kritik yol        | < 120 KB                  |
| `ui`         | Tüm UI ikonları, yemek ikonları | 2048²      | Kritik yol        |                           |
| `chars`      | Tüm karakter parçaları          | 2048²      | Kritik yol        |                           |
| `vehicles`   | Tüm araçlar, tüm yönler         | 4096²      | Kritik yol        | En büyük                  |
| `structures` | Yapılar, ekipman, tabelalar     | 4096²      | Aşamaya göre lazy | Aşama başına ayrı         |
| `props`      | Mobilya, dekorasyon             | 2048²      | Aşamaya göre lazy |                           |
| `nature`     | Ağaç, kaya, bitki               | 2048²      | Lazy              |                           |
| `fx`         | Partikül, efekt                 | 1024²      | Kritik yol        |                           |
| `bg`         | Parallax katmanları             | 4096×1024  | Kritik yol        |                           |
| (atlas yok)  | Zemin bake'leri                 | tekil      | Aşamaya göre lazy | Atlas'a sığmaz, sığmamalı |

**Araç:** `free-tex-packer-core` 0.3.9 (açık kaynak, lisans gerektirmez — TexturePacker'ın aksine).
**Ayarlar:** MaxRects-BSSF, 2 px padding + extrude (bleeding önleme), power-of-two, trim açık, rotate **kapalı** (izometrik sprite'larda kafa karıştırıcı ve kazanç küçük).

**Format:** WebP birincil (tüm hedef tarayıcılar destekliyor), PNG fallback yalnızca `boot` atlası için (yükleme ekranı her koşulda görünmeli).

**Neden GPU texture sıkıştırma (KTX2/Basis) yok:** Karmaşıklık/kazanç oranı MVP'de negatif. Bellek bütçemiz (192 MB desktop / 96 MB mobil) WebP ile tutuluyor. Faz 20'de bütçe aşılırsa yeniden değerlendirilir.

---

## 8. Build pipeline

```
assets/source/                       AI ham çıktısı (kontrol edilmez)
   │
   ├─ pnpm assets:validate           §4.4 doğrulamaları    → başarısızsa DUR
   │
   ├─ pnpm assets:process            sharp ile:
   │                                   • trim (alpha bounding box)
   │                                   • anchor meta hesapla
   │                                   • 2× → 1× varyant (gerekirse)
   │                                   • renk profili normalize (sRGB)
   │                                 → assets/processed/
   │
   ├─ pnpm assets:atlas              free-tex-packer-core
   │                                 → public/atlas/*.webp + *.json
   │
   ├─ pnpm assets:audio              ffmpeg: WAV → OGG + M4A, normalize (-16 LUFS)
   │
   ├─ pnpm assets:manifest           içerik hash'li manifest
   │                                 → public/asset-manifest.json
   │
   └─ pnpm assets:report             boyut raporu, bütçe kontrolü → aşımda DUR
```

`pnpm assets:build` hepsini sırayla koşar. CI'da her PR'da koşar; çıktı deterministik olmalı (aynı girdi → aynı hash), aksi hâlde cache anlamsızlaşır.

---

## 9. Repo'da ne saklanır

| Yol                          | Git'te?                        | Gerekçe                                              |
| ---------------------------- | ------------------------------ | ---------------------------------------------------- |
| `assets/source/**`           | ✅ (Git LFS değerlendirilecek) | AI çıktısı tekrar üretilemez; kaybolursa geri gelmez |
| `assets/processed/**`        | ❌                             | Üretilebilir, `assets:process` çıktısı               |
| `public/atlas/**`            | ❌                             | Üretilebilir                                         |
| `public/asset-manifest.json` | ❌                             | Üretilebilir                                         |
| `assets/_placeholder/**`     | ✅                             | Kayıtlı ve geçici                                    |
| `docs/assets/palette.json`   | ✅                             | Stil sözleşmesi                                      |
| `assets/MANIFEST.md`         | ✅                             | Provenance                                           |
| `assets/LICENSES.md`         | ✅                             | Hukuki                                               |
| `src/**/rig.json`            | ✅                             | Elle yazılmış                                        |

**Git LFS kararı:** `assets/source` 200 MB'ı geçtiğinde LFS'e geçilir. Bu bir ADR gerektirir (CI ve klonlama süresini etkiler). Şimdilik: kaynak dosyalar 2048² PNG olarak tutulur, gereksiz büyük ham çıktılar (4096² AI upscale) saklanmaz.

---

## 10. Placeholder politikası

[WORKING_DISCIPLINE §7](WORKING_DISCIPLINE.md#7-placeholder-politikası)'nin asset tarafı:

- Placeholder'lar `assets/_placeholder/` altında, dosya adında `__PLACEHOLDER__`.
- Görsel olarak **belirgin** olmalı: macenta/siyah dama deseni + üzerinde ne olması gerektiğini yazan metin. Sessizce "yeterince iyi" görünen placeholder en tehlikelisidir.
- Her biri `docs/PLACEHOLDER_REGISTER.md`'de: dosya, neyin yerine, hangi fazda değişecek.
- Build placeholder sayısını sayar ve raporlar. Faz 22'den sonra production build'de sayı > 0 → **hata**.

---

## 11. Ses üretimi

| Kategori              | Kaynak                  | İşlem                                   | Bütçe             |
| --------------------- | ----------------------- | --------------------------------------- | ----------------- |
| Motor / trafik        | Kütüphane (CC0) veya AI | Döngüsel, kesintisiz                    | 3 varyant × 60 KB |
| Fren / korna          | Kütüphane / AI          | Kısa, pitch varyasyonlu                 | 8 dosya × 15 KB   |
| Mutfak                | AI / kütüphane          | Döngü + tek atış                        | 12 dosya          |
| Müşteri vokalizasyonu | AI                      | **Dilsiz** — evrensel, lokalize edilmez | 10 dosya × 12 KB  |
| UI                    | AI / sentez             | Çok kısa, düşük ses                     | 12 dosya × 6 KB   |
| İlerleme              | AI                      | Zengin, nadir                           | 5 dosya × 40 KB   |
| Ambiyans              | Kütüphane / AI          | Uzun döngü (30–60 s)                    | 4 dosya × 350 KB  |
| Müzik                 | AI                      | 3 varyant (gündüz/akşam/gece)           | 3 × 900 KB        |

**Toplam ses bütçesi: ≤ 5 MB.**
**Normalizasyon:** Tüm SFX −16 LUFS, müzik −20 LUFS. Ducking runtime'da.
**Format:** OGG + M4A (Safari için, §2 notu).

---

## 12. Erişilebilirlik kısıtları (asset seviyesinde)

- **Kontrast:** Etkileşimli her nesnenin arka planıyla kontrastı ≥ 3:1. Doğrulama scripti, nesneyi tipik zemin renklerine karşı test eder.
- **Renk-körü güvenliği:** Hiçbir durum yalnızca renkle iletilmez. Sabır halkası: renk + dolgu oranı + ikon. Memnuniyet: renk + yüz ifadesi + ikon. Palet, protanopi/döteranopi/tritanopi simülasyonuyla test edilir.
- **Siluet testi:** Gri tonlamada tüm ana nesneler ayırt edilebilir olmalı (§4.4).
- **Metin:** Asset'lere metin gömülmez (tabela hariç, o da dekoratif). Tüm okunabilir metin DOM'da — böylece çevrilebilir, ölçeklenebilir, ekran okuyucuya açık.

---

## 13. Asset bütçeleri

| Kategori                         | Sıkıştırılmış boyut |             Sprite/dosya sayısı |
| -------------------------------- | ------------------: | ------------------------------: |
| Karakter parçaları               |            ≤ 1.2 MB |                             ~96 |
| Araçlar                          |            ≤ 2.4 MB | ~90 (10 arketip × 8 yön + fren) |
| Yapılar (tüm aşamalar)           |            ≤ 6.0 MB |                            ~140 |
| Props                            |            ≤ 1.5 MB |                             ~70 |
| Doğa                             |            ≤ 1.0 MB |                             ~35 |
| Zemin bake'leri                  |            ≤ 7.0 MB |                       ~10 dilim |
| Arka plan / parallax             |            ≤ 1.8 MB |                              ~8 |
| UI + yemek ikonları              |            ≤ 0.8 MB |                             ~90 |
| FX                               |            ≤ 0.4 MB |                             ~25 |
| Ses                              |            ≤ 5.0 MB |                             ~60 |
| Font                             |           ≤ 0.15 MB |                        2 subset |
| **TOPLAM**                       |       **≤ 27.3 MB** |                                 |
| **Kritik yol (ilk oynanabilir)** |          **≤ 4 MB** |                                 |

CI'da zorlanır. Aşım = kırmızı build. Bu sadece performans değil, [Vercel bant genişliği](RESEARCH_NOTES.md#9-deployment-vercel-vs-flyio) kısıtı.

---

## 14. Yükleme stratejisi

```
1. boot atlası + font          (~150 KB)   → yükleme ekranı 300 ms içinde
2. Kritik yol                  (~4 MB)     → ilk oynanabilir kare
   ui, chars, vehicles, fx, bg, ground_stage<current>, structures_stage<current>, temel SFX
3. Arka planda (idle callback) → sonraki aşamanın asset'leri, müzik, ambiyans
4. Talep üzerine               → yalnızca ilgili aşamaya geçildiğinde
```

- Service worker (Faz 14) tüm asset'leri içerik hash'iyle cache'ler → ikinci ziyaret ~0 bant genişliği.
- Yükleme ekranı gerçek ilerleme gösterir (sahte progress bar yok).
- Asset yükleme hatası: 3 kez üstel geri çekilme ile tekrar, sonra düşük çözünürlüklü fallback, sonra kullanıcıya net hata.

---

## 15. Asset kalite kapısı (her faz)

```
[ ] pnpm assets:validate  → 0 hata
[ ] pnpm assets:report    → tüm bütçeler içinde
[ ] Contact sheet üretildi ve gözden geçirildi
[ ] Gri tonlama siluet testi geçti
[ ] %50 ölçek okunabilirlik testi geçti
[ ] Renk-körü simülasyonu geçti
[ ] Yeni asset'ler MANIFEST.md'ye yazıldı
[ ] Lisanslar LICENSES.md'de
[ ] Placeholder'lar PLACEHOLDER_REGISTER.md'de
[ ] Atlas doluluk oranı ≥ %70 (israf yok)
[ ] Visual regression golden'ları güncellendi ve diff'ler bilinçli
```
