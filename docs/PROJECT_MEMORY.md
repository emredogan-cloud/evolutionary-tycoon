# PROJECT MEMORY — Evolutionary Tycoon

> **Bu dosya, projenin kalıcı operasyonel hafızasıdır.** Fazlar, Claude CLI oturumları,
> context sıfırlamaları ve ajan devirleri arasında bağlam kaymasını (context drift) önlemek için var.
>
> **Otorite sırası:** 1) Açık kullanıcı kararları → 2) Onaylı roadmap → 3) `WORKING_DISCIPLINE.md` → 4) bu dosya.
> Bu dosya onları **asla sessizce geçersiz kılmaz.** Çelişki bulunursa: **DUR**, çelişen dokümanları,
> tam çelişkiyi, olası doğruluk kaynağını ve önerilen çözümü raporla.
>
> **Kanıt kuralı:** "muhtemelen", "çalışıyor olmalı", "iyi görünüyor" yazılmaz. Komut, çıktı,
> commit SHA, URL, ölçülen değer veya açık "bilinmiyor" yazılır.

---

## 1. Project Identity

|                    |                                                                                |
| ------------------ | ------------------------------------------------------------------------------ |
| **Proje adı**      | Evolutionary Tycoon                                                            |
| **Repository**     | <https://github.com/emredogan-cloud/evolutionary-tycoon> (public, MIT)         |
| **Sürüm**          | 0.1.0                                                                          |
| **Mevcut faz**     | **PHASE 4 — Art Direction & Asset Pipeline v1** (BATCH P2→P4'ün son fazı)      |
| **Mevcut kapı**    | GATE 0 ✅ · GATE 1 ✅ (kullanıcı 2026-08-14'te P2+P3+P4'ü toplu yetkilendirdi) |
| **Durum**          | 🔴 **BATCH BİTTİ — DURULDU.** P2 ✅ · P3 ✅ · P4 🟡 PARTIAL. P5–P7 yetkisiz.   |
| **Son güncelleme** | 2026-08-15 — CHECKPOINT L (P4 tamamlandı, kısmi)                               |
| **Son commit SHA** | `9b2570f667115537a98c85bfb3de3370e5709e90` (main, `git rev-parse HEAD`)        |
| **Yerel dizin**    | `/home/emre/Downloads/Evolutionary-Tycoon`                                     |

---

## 2. Current Mission

**BATCH P2 → P3 → P4** (kullanıcı tarafından 2026-08-14'te toplu yetkilendirildi, otonom yürütme).

| Faz    | Misyon                                                                                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2** | Motordan bağımsız, deterministik, headless simülasyon çekirdeği: Clock, 6 RNG stream'i, World+hash, 18 slotluk sistem hattı, CommandLog, EventBus, store'lar, SaveManager v1, GameLoop, determinizm süiti, sim benchmark'ı. |
| **P3** | İzometrik render temeli: Phaser 4 bootstrap, 2:1 dimetrik projeksiyon, depth sort, 9 katmanlı sahne, kamera, RenderBridge, görsel determinizm modu, ilk visual golden'lar, gerçek GPU perf ölçümü.                          |
| **P4** | Sanat yönü + asset pipeline v1: lisans kapısı (9 madde, birincil kaynak), palet, validate/process/atlas/manifest/report, deterministik asset build'i, bütçeler.                                                             |

**Batch kuralı:** faz geçişleri otomatik, ama her geçiş tam doğrulama kapısı gerektirir
(implementasyon + testler + CI + preview E2E + dokümantasyon + memory + faz raporu).
**P4 sonunda DUR.** P5–P7 yetkilendirilmemiştir.

---

## 3. Approved Architecture (kompakt)

| Katman             | Karar                                                                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Simülasyon**     | Motordan tamamen bağımsız, deterministik, saf TypeScript. 20 Hz sabit tick, tohumlanmış 6 RNG stream'i, command log, event bus. `src/sim` içinde Phaser/Svelte/DOM/`Math.random`/`Date.now`/timer **yasak** — CI zorlar.                                                           |
| **Render**         | Phaser 4.2.1 (WebGL2). 2:1 dimetrik izometrik, painter's algorithm depth sort (topolojik sıralama yok), 9 katmanlı sahne. `SpriteGPULayer` **yalnızca** statik dekor/parallax/tek-atış partikül (derinlik sıralanamıyor). Zemin **tilemap değil**, aşama başına elle kompoze bake. |
| **UI**             | Svelte 5.56 DOM overlay. `src/ui` → `src/sim` importu **yasak**; yalnızca `src/app/bridge` üzerinden, 10 Hz throttle. Gerekçe: a11y + E2E testedilebilirlik + per-frame maliyet yok.                                                                                               |
| **Data**           | Save = yalnızca kalıcı durum (~15 KB). Transient (yoldaki araçlar, yarım siparişler) kaydedilmez. Versiyonlu şema + zincirleme migration + her sürüm için commit'li fixture.                                                                                                       |
| **Persistence**    | IndexedDB (`idb`), localStorage fallback, CRC32 (bozulma tespiti, güvenlik değil), 3'lü yedek rotasyonu, JSON dışa/içe aktarma.                                                                                                                                                    |
| **Deployment**     | Vercel statik. Backend yok — tek istisna 5 satırlık `/api/time` (offline saat referansı). `VITE_ASSET_BASE_URL` ile CDN çıkış yolu baştan hazır.                                                                                                                                   |
| **Testing**        | Determinizm süiti (en kritik) · balance simülatörü CI kapısı · visual regression yalnızca Chromium + pinlenmiş container + zorunlu SwiftShader · Firefox `xvfb` · WebKit yalnızca smoke. **CI asla FPS iddia etmez.**                                                              |
| **Asset pipeline** | AI **statik** üretir; animasyon runtime'da parça tabanlı "Doll rig" ile (Spine ücretli, DragonBones ölü, AI kare-tutarlılığı üretemiyor). Tutarlılık sözleşmeyle: altın referanslar + değişmez prompt + 9 doğrulama + 4 tutarlılık kapısı.                                         |

Detay: [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md)

---

## 4. Approved Technology Stack (tam sürümler)

> **Politika:** [WORKING_DISCIPLINE §2.5](WORKING_DISCIPLINE.md#25-bağımlılık-sürüm-kilidi-politikası) — sessiz yükseltme yok.
> Tam (exact) pinleme; caret/tilde yok.

| Paket                        | Onaylı sürüm | Not                                                                                     |
| ---------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| typescript                   | **6.0.3**    | TS7 **kullanılmıyor** — typescript-eslint peer `<6.1.0`                                 |
| vite                         | 8.2.1        |                                                                                         |
| phaser                       | 4.2.1        | Faz 1'de kurulur, kullanılmaz (bundle bütçesi ölçümü için)                              |
| svelte                       | 5.56.9       |                                                                                         |
| @sveltejs/vite-plugin-svelte | 7.3.0        | peer `vite ^8`                                                                          |
| vitest                       | 4.1.10       |                                                                                         |
| @playwright/test             | 1.62.1       | Docker: `mcr.microsoft.com/playwright:v1.62.1-noble`                                    |
| eslint                       | 10.8.1       |                                                                                         |
| typescript-eslint            | 8.67.0       | peer: `eslint ^8.57 \|\| ^9 \|\| ^10`, `typescript >=4.8.4 <6.1.0`                      |
| prettier                     | 3.9.6        |                                                                                         |
| dependency-cruiser           | 18.2.0       |                                                                                         |
| knip                         | 6.32.2       |                                                                                         |
| zod                          | 4.4.3        |                                                                                         |
| idb                          | 8.0.3        |                                                                                         |
| **Node**                     | 24.13.1      | `.nvmrc` + `engines`                                                                    |
| **pnpm**                     | 10.33.4      | `packageManager`                                                                        |
| **vercel (CLI)**             | **59.0.0**   | Karar: repo devDependency olarak pinlendi, global kuruluma bağımlı değil — bkz. §8 D-04 |

**Faz sonunda gerçekleşen sürümler:** (Faz 1 bitişinde doldurulacak — lockfile'dan)

---

## 5. Phase State

| Faz                      | Durum                | Başlangıç  | Bitiş      | Commit/PR                 | Kapı                    | Kanıt                                                                                          |
| ------------------------ | -------------------- | ---------- | ---------- | ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| P0 Research & Design     | ✅ TAMAMLANDI        | 2026-08-14 | 2026-08-14 | (pre-repo)                | **GATE 0 ✅ ONAYLANDI** | 8 doküman, ~55k kelime                                                                         |
| P1 Foundation            | ✅ TAMAMLANDI        | 2026-08-14 | 2026-08-14 | PR #1, main `cbdaef4`     | **GATE 1 ✅ ONAYLANDI** | [PHASE_1_REPORT](phases/PHASE_1_REPORT.md)                                                     |
| P2 Sim Core              | ✅ TAMAMLANDI        | 2026-08-14 | 2026-08-15 | PR #8, main `4643d88`     | Batch içi kapı ✅       | [PHASE_2_REPORT](phases/PHASE_2_REPORT.md)                                                     |
| P3 Iso Render            | ✅ TAMAMLANDI        | 2026-08-15 | 2026-08-15 | main `a60b641`            | Batch içi kapı ✅       | [PHASE_3_REPORT](phases/PHASE_3_REPORT.md)                                                     |
| **P4 Asset Pipeline v1** | 🟡 **KISMİ**         | 2026-08-15 | 2026-08-15 | `phase/04-asset-pipeline` | **BATCH ÇIKIŞ KAPISI**  | [PHASE_4_REPORT](phases/PHASE_4_REPORT.md) — pipeline ✅, sanat üretimi lisans kapısında bloke |
| P5–P24                   | ⬜ Yetkilendirilmedi | —          | —          | —                         | —                       | —                                                                                              |

**Onaylı roadmap:** 25 faz (P0–P24). Orijinal 22 fazlık yapıya **dönülmeyecek**.
Onaylı 6 değişiklik: D1 (yeni P2 Sim Core) · D2 (Pathfinding→P7) · D3 (Asset P4+P16) · D4 (Economy P9+P12+P13) · D5 (Employee AI, Evolution'dan önce) · D6 (P9 sonunda Vertical Slice Kapısı).

---

## 6. Current Phase — BATCH P2 → P4

### CHECKPOINT F — Batch başlangıcı (2026-08-14)

**Context reset tespit edildi ve kabul edildi.** Önceki Claude oturumu kasıtlı olarak sıfırlandı;
durum bu dosyadan, `PHASE_1_REPORT.md`'den ve **doğrudan repo/CI/deployment ölçümünden** yeniden kuruldu.

**Yetkilendirme değişikliği (kullanıcı, 2026-08-14):** Yürütme kadansı üçlü batch'e geçti.
`P2 → P3 → P4` **otonom** yürütülecek; ara onay istenmeyecek; **P4 sonunda DURULACAK**.
Sonraki batch adayı `P5 → P6 → P7` — **henüz yetkilendirilmemiş.**

**Ölçülen başlangıç durumu (varsayım değil):**

| Ne                        | Ölçüm                                                                     | Nasıl                                            |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| main HEAD                 | `cbdaef4bcc6ba99edc1eef2f96737bfe47791286`                                | `git rev-parse HEAD`                             |
| Çalışma ağacı             | temiz                                                                     | `git status`                                     |
| Son CI (main)             | ✅ başarılı — run 31837638087                                             | `gh run list`                                    |
| CodeQL (main)             | ✅ başarılı — run 31837638095                                             | `gh run list`                                    |
| Production `/health.json` | 200, `buildSha` = `cbdaef4…` → **main ile eşleşiyor**                     | `curl`                                           |
| `/api/time`               | 204                                                                       | `curl`                                           |
| node / pnpm               | v24.13.1 / 10.33.4 → `.nvmrc` + `packageManager` ile birebir              | `node -v`, `pnpm -v`                             |
| **Vercel SSO koruması**   | **`ssoProtection.enabled = false` — KAPALI**                              | Vercel API (`get_project_deployment_protection`) |
| **Deployment-başına URL** | **HTTP 200** (`…-1ob1fg36g-…vercel.app/health.json`) — artık erişilebilir | `curl`                                           |

**Bunun sonucu:** Faz 1'in bilinen açık sorunu #1 (Deployment Protection) **çözüldü**.
`preview-e2e`'nin "uyarıp atla" davranışı artık gerekçesiz — bu batch'te **bloke edici kapıya geri çevrilecek**.

### Düzeltilen doküman tutarsızlığı (CHECKPOINT F)

Bu dosyanın §1 ve §5'i "P1 yürütülüyor, henüz commit yok" diyordu; aynı dosyanın §6/§15/§16/§20/§21'i,
`PHASE_1_REPORT.md` ve repo'nun kendisi P1'in tamamlandığını söylüyordu. Bu bir otorite çelişkisi değil,
tek dosya içinde **bayat başlık alanı**ydı; repo ve faz raporu doğruluk kaynağı kabul edilip düzeltildi.
`PHASE_1_REPORT.md` "main HEAD `64988ba`" diyor; o rapor yazıldıktan sonra iki docs commit'i daha girdi,
güncel HEAD `cbdaef4`. Rapor tarihsel kayıt olarak olduğu gibi bırakıldı.

### Faz 1'den taşınan risk sonuçları

- R-P1-01 (Vercel davranışı) → gerçekleşti, çözüldü: `vercel.json`+`vercel.ts` çakışması, `vercel.ts` tek kaynak
- R-P1-02 (typescript-eslint + ESLint 10) → **sorun çıkmadı**, uyumlu
- R-P1-03 (Playwright container hızı) → e2e job'ları 53 s–1 m 09 s, kabul edilebilir
- R-P1-04 (branch protection gh ile) → **başarılı**, API ile kuruldu
- R-P1-05 (Firefox headless WebGL) → gerçekleşti ama farklı sebeple: `HOME` sahipliği; `HOME=/root` ile çözüldü

### CHECKPOINT G — P2 başlangıcı (2026-08-14)

Dal: `phase/02-simulation-core`, `cbdaef4`'ten. Kapsam: motordan bağımsız deterministik çekirdek,
**sıfır gameplay**. 18 sistem slotu sırasıyla ayrıldı, hepsi no-op.

### CHECKPOINT H — P2 tamamlandı (2026-08-15) ✅

| Kanıt           | Değer                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| PR              | [#8](https://github.com/emredogan-cloud/evolutionary-tycoon/pull/8) · 11 commit                                             |
| CI              | [run 31844494830](https://github.com/emredogan-cloud/evolutionary-tycoon/actions/runs/31844494830) — 8/8 + CodeQL           |
| **preview-e2e** | [run 31844512902](https://github.com/emredogan-cloud/evolutionary-tycoon/actions/runs/31844512902) — **BLOKE EDİCİ, 23/23** |
| Testler         | 314 unit/integration (58'i determinizm) · lines %99.53 · branches %91.73                                                    |
| Bench           | 1000 boş tick 0.195 ms (bütçe 5 ms) · 0.20 B/tick (bütçe ≈0) · 7 bütçenin 7'si geçti                                        |
| Bundle          | 41.23 kB gzip / 550 kB                                                                                                      |
| Canlı preview   | Chromium 23/23 · Firefox 23/23 · buildSha eşleşti                                                                           |
| Rapor           | [PHASE_2_REPORT.md](phases/PHASE_2_REPORT.md)                                                                               |

**Preview kapısı ilk kez gerçekten koştu** ve ilk koşuşunda iki gerçek sorun buldu — ikisi de yerel
build'in gösteremeyeceği cinsten:

1. **Vercel preview-comments toolbar'ı** (`vercel.live/.../feedback.js`) yalnızca preview'lara
   enjekte ediliyor; CSP'miz (`script-src 'self'`) onu doğru biçimde blokluyor ve tarayıcı bunu
   konsola hata olarak yazıyor. Blok **doğru davranış**; CSP korundu, yalnızca o tek mesaj —
   host + CSP ifadesi ile çift çapalanarak — tolere ediliyor. Chromium "Content Security Policy",
   Firefox "Content-Security-Policy" yazıyor; ikisi de eşleşiyor.
2. **Kendi bundle'ımız CSP'nin blokladığı bir `eval()` deniyordu** (Firefox, yalnızca preview).
   Kaynak: Zod, açılışta validator'ları `Function` constructor ile JIT derleyip derleyemeyeceğini
   yokluyor. Zod reddi yakalayıp yorumlanan yola düşüyordu — doğrulama hiç bozulmadı — ama tarayıcı
   ihlali önce logluyor. Kaynağında çözüldü: `z.config({ jitless: true })`.
   **CSP'ye `unsafe-eval` EKLENMEDİ.** O direktif, bu politikanın en değerli maddesi.

**Perf regresyon kapısı hakkında bir tasarım kararı:** 25 örneğin **medyanı** yerine **minimumu**
karşılaştırılıyor. Paylaşımlı runner'da medyan, yalnızca zamanlayıcı gürültüsünden %15'i aşıyor;
rastgele patlayan bir kapı, kapı olmamaktan kötüdür (WORKING_DISCIPLINE §11). Eşik %15 olarak
korundu; yalnızca **ölçülebilir** istatistik seçildi. Baseline bir **CI koşusundan** kaydedildi —
yerel sayı, her CI koşusunu regresyon gibi gösterirdi.

### CHECKPOINT I — P3 başlangıcı (2026-08-15)

Dal: `phase/03-isometric-world`, main `4643d88`'ten. P2 kapısı geçildi; production `4643d88`'i
sunuyor ve production E2E 23/23.

**P3 kapsamı (roadmap Faz 3):** Phaser 4 bootstrap (WebGL2 zorunlu, context loss/restore) ·
`IsoProjection` (2:1 dimetrik, round-trip ≤1e-9) · `DepthSorter` (painter's, footprint anchor,
kararlı tie-break) · 9 katmanlı `SceneGraph` · `CameraController` · `RenderBridge` + `ActorView`
havuzu · görsel determinizm modu · placeholder set + register · `stage1` layout · ilk 3 visual
golden · **gerçek GPU FPS ölçümü**.

**Yasak:** trafik davranışı, müşteri davranışı, servis, ekonomi, çalışan AI. Render sim'i çizer,
sim'e sahip olmaz.

**Ortam doğrulaması (P3 için kritik):**

- `docker` 29.6.2 kurulu ve daemon erişilebilir → visual golden'lar **pinlenmiş
  `mcr.microsoft.com/playwright:v1.62.1-noble` container'ında** üretilebilir (roadmap şartı:
  yerel ve CI aynı pikselleri üretmeli).
- Gerçek GPU FPS ölçümü için kullanıcının gerçek Chrome'u erişilebilir (browser automation) —
  CI'ın SwiftShader'ı bunu ölçemez, ADR-011.

### CHECKPOINT J — P3 tamamlandı (2026-08-15) ✅

| Kanıt              | Değer                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| Testler            | **447** unit/integration + 10 perf · lines %98.56 · branches %89.81                    |
| Visual regression  | **3 golden + 3 determinizm testi** · 10/10 bayt-özdeş ekran görüntüsü                  |
| Golden üretimi     | Pinlenmiş container'da üretildi **ve** host çıktısıyla SHA-256 eşitliği ölçüldü        |
| **Gerçek GPU FPS** | **200 FPS p50 · 5.1 ms frame p95** (bütçe 16.6 ms) — GTX 1660 Ti, 100 aktör, 1920×1080 |
| Depth sort         | **0.013 ms** / 260 nesne (bütçe 0.15 ms) — 11× pay                                     |
| **Bundle**         | **405.39 kB** gzip / 550 kB — Faz 1'den beri açık olan soru **cevaplandı**             |
| Save şeması        | **v1 → v2** (placed objects `z` kazandı) — zincirin ilk gerçek migration'ı             |
| Rapor              | [PHASE_3_REPORT.md](phases/PHASE_3_REPORT.md)                                          |

**Faz 3'ün bulduğu dört gerçek hata** (hepsi test/ölçüm tarafından yakalandı, hiçbiri etrafından dolanılmadı):

1. **İnterpolasyon sessizce çöküyordu** — pozisyonlar tick'in ilk frame'inin _sonunda_ kaydediliyordu,
   böylece o tick'in sonraki frame'leri zaten varılmış konumdan harmanlıyordu. İki anlık görüntüye
   (previous/current) geçildi. "Yüksek frame rate'te hareket basamaklı görünüyor" olarak
   yayınlanacaktı ve sebebi çok zor bulunacaktı.
2. **Depth tie-break'i yükseklik farkını ezebiliyordu** — tavanı tam bir `Z_WEIGHT` birimiydi (10),
   oysa 0.5 m'lik bir basamak yalnızca 5 katkı veriyor. Tavan `Z_WEIGHT × 0.05 m`'ye indirildi.
   Aksi hâlde yerdeki bir müşteri, tezgâhın üstündekinin önüne geçebiliyordu — üstelik entity id'ye göre.
3. **Checksum migration'dan SONRA doğrulanıyordu** ama saklanan baytlar üzerinden hesaplanmıştı →
   v2 çıkar çıkmaz her v1 save'i "bozuk" oldu. Sıra düzeltildi: önce checksum (saklanan hâl üzerinde),
   sonra migration, en sonda şema.
4. **Stress sahnesi 100 değil 74 aktör ölçüyordu** — eşit müşteri/çalışan bölüşümü 24 kapasiteli
   havuzdan 50 çalışan istiyordu. Artık her 5'te 1 çalışan ve `scenes.test.ts` her fixture'ın
   havuzlara sığdığını doğruluyor. Gerçek donanımda ölçüm alırken fark edildi.

**Kapatılan Faz 1 borçları:** visual regression altyapısı (DoD #7) ve gerçek performans ölçümü
(DoD #12) — ikisi de Faz 1'de "Faz 3'te" diye ertelenmişti.

**Kullanıcıya havale edilen:** Phaser'ın WebGL1/WebGL2 çelişkisi (§12, AÇIK ÇELİŞKİ #4). Faz 3
bu yüzden hiçbir şeyi değiştirmedi ve Faz 4'ü bloke etmiyor.

### CHECKPOINT K — P4 başlangıcı (2026-08-15)

Dal: `phase/04-asset-pipeline`, main `a60b641`'ten. P3 kapısı geçildi; production `a60b641`'i
sunuyor (`/health.json` → `buildSha a60b6418…`, `schemaVersion 2`).

**P4 START CONDITION önce koşuldu — ve KAPANMADI.** Roadmap Faz 4 START CONDITIONS: dokuz maddelik
lisans doğrulaması, birincil kaynaktan, üretimden **önce**. Sonuç [`assets/LICENSES.md`](../assets/LICENSES.md) §1'de,
sağlayıcı başına tablo hâlinde, URL + erişim tarihi + birebir alıntı ile:

| Sağlayıcı   | Karşılanan | Sonuç                                                             |
| ----------- | ---------- | ----------------------------------------------------------------- |
| God Mode AI | 6 / 9      | En güçlüsü — telif **devri**, atıf yok, özel içerikle eğitim yok  |
| Scenario    | 5 / 9      | Sahiplik/dağıtım net; madde 6 self-serve planda modelini eğitiyor |
| PixelLab    | 3 / 9      | Beş madde hiç ele alınmamış — ancak yedek                         |
| Sprixen     | 0 / 9      | **Birincil ToS belgesi bulunamadı** — yalnızca pazarlama metni    |

**Madde 8 (abonelik bittikten sonraki haklar) dört sağlayıcının hiçbirinde yazılı değil.** Bu, kamuya
açık sayfa okuyarak kapatılabilecek bir madde değil; sağlayıcıdan yazılı teyit gerekir. Bu yüzden:

> **Faz 4'te tek bir üretim asset'i üretilmedi. Altın referanslar dâhil.** Roadmap'in kendi kuralı:
> "Bu kapı geçilmeden Faz 4'te tek bir üretim asset'i üretilmez. Altın referans üretimi de buna dâhil."
> Sessiz araç değişimi de yapılmadı (ASSET_PIPELINE §4.2 bunu açıkça yasaklıyor).

**Bunun P4 kapsamına etkisi:** roadmap Faz 4 görevlerinden 2, 3, 9, 10, 11 (altın referans üretimi →
insan onayı, batch üretim, placeholder değişimi, golden güncelleme, dört tutarlılık kapısı) sanat
üretimine bağlı ve **bu fazda tamamlanamaz**. Kalan görevler — palet, değişmez prompt bloğu, dokuz
kontrollü doğrulayıcı, işleme/atlas/manifest/rapor hattı, contact sheet üreteci, asset yükleme
sistemi, yükleme ekranı, CI bütçeleri — sanat gerektirmez ve tam olarak yapılır. **P4 bu yüzden
PARTIAL olarak raporlanacak**; PASS iddia edilmeyecek.

**Bağımlılık değişikliği (WORKING_DISCIPLINE §2.5.2):** `sharp@0.35.3` ve
`free-tex-packer-core@0.3.9` devDependency olarak eklendi. İkisi de **onaylı stack'te zaten adı
geçen** sürümler ([TECHNICAL_ARCHITECTURE §3](TECHNICAL_ARCHITECTURE.md), roadmap Faz 4) — yeni
karar değil, onaylı kararın uygulanması. Yükseltme değil, ilk kurulum.

**Ortam olayı:** Faz 3'ün container'da golden üretimi `node_modules`'ü konteynerin store yoluna
(`/work/.pnpm-store`) bağlamıştı; `pnpm add` `ERR_PNPM_UNEXPECTED_STORE` ile durdu. Root'a ait
dizinler aynı pinlenmiş container içinden silinip host store'undan temiz kurulum yapıldı.
`.pnpm-store/` zaten `.gitignore`'da (satır 3) — repoya hiçbir şey sızmadı.

### CHECKPOINT L — P4 tamamlandı (2026-08-15) 🟡 KISMİ

| Kanıt               | Değer                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Testler             | **583** unit/integration (37 dosya) + 10 perf · lines %98.46 · branches %89.85 · functions %96.64 |
| E2E                 | 48 geçti / 12 atlandı (chromium + firefox) · WebKit 3/3 pinlenmiş container'da                    |
| Visual              | 3 golden yeniden üretildi, 6/6 yeşil — **artık gerçekten çalışan bir kapı altında** (bkz. aşağı)  |
| Bundle              | **406.45 kB** gzip / 550 kB                                                                       |
| Asset pipeline      | `assets:validate` → `assets:build` CI'da; boş ağaçta "0 assets" der ve 0 döner                    |
| Determinizm (asset) | process ×2 → 8/8 SHA-256 aynı · atlas ×2 → webp+json aynı · manifest ×2 → aynı hash               |
| **Üretim asset'i**  | **0** — START CONDITION kapanmadı                                                                 |
| Rapor               | [PHASE_4_REPORT.md](phases/PHASE_4_REPORT.md)                                                     |

**Faz 4'ün bulduğu altı gerçek hata:**

1. **Visual regression kapısı bir çeyrek karelik renk değişimini göremiyordu.** Faz 3
   `maxDiffPixelRatio: 0.002` koymuş ama `threshold`'u Playwright varsayılanında (**0.2**)
   bırakmıştı. İkisi aynı şey değil: `threshold` bir pikselin "farklı" sayılıp sayılmayacağına,
   `maxDiffPixelRatio` kaç tanesinin farklı olabileceğine karar verir. Zemin ve yol paletin
   renklerine taşınınca **233 365 piksel** değişti ve süit **geçti**. `threshold: 0` yapıldı
   (render bit-exact olduğu için karşılanabilir); tek kanalda tek birimlik değişimin
   (`0x586e22`→`0x586e23`) kapıyı kırdığı ölçüldü: "233418 pixels (ratio 0.26) are different".
2. **Paletin ilk taslağında UI başarı yeşili ile tehlike kırmızısı döteranopide çakışıyordu**
   (22.6 birim). Eşik indirilmedi; **palet değişti** — başarı `foliage-500`'den `foliage-300`'e
   taşındı, ayrım 74 birime çıktı. ASSET_PIPELINE §12 artık dokümanda değil testte.
3. **Prompt bloğunun hash'i yanlış metni hash'liyordu** — `indexOf` işaretçinin _ilk_ geçtiği yeri
   buluyordu, o da bloğu anlatan düzyazıydı. İşaretçiler kendi satırlarına sabitlendi.
4. **Tick başına tahsis kapısı Faz 2'den beri kararsızdı** — `pnpm verify` 8.87 B/tick ile düştü
   (bütçe 8). `src/sim` Faz 4'te hiç değişmedi; yedi koşuda iki düşüş. Sebep bütçe değil ölçüm
   yöntemiydi: tek bir `heapUsed` deltası, hem simülasyonu hem runtime'ın aynı penceredeki işini
   ölçüyor. Beş örneğin **minimumu**na geçildi (gürültü tek yönlü: yığına yalnızca ekler). Bütçe
   değişmedi; ölçüm **0.02 B/tick (en kötü örnek 0.09)** çıktı — iki kat büyüklük derece altında ve
   kararlı. Ardışık 8 koşu yeşil.
5. **%15 regresyon kapısı, aynı süreçte bozulmuş bir koşuyu temiz bir baseline'a karşı ölçüyordu** —
   CI `world snapshot + JSON serialise: 0.492 ms vs baseline 0.425 ms (%16 yavaş)` ile düştü. Faz 4
   `src/sim`'e dokunmadı; aynı makinede `main` 0.335 ms, dal 0.331 ms. Sebep, düşen job'ın kendi
   log'unda: `runSimBench()` süreç başına **iki kez** çağrılıyordu (bir kez raporlamak, bir kez
   kapı için) ve aynı job aynı ölçümü **0.431** ve **0.492** olarak kaydetti. İkinci koşu birincinin
   çöpüyle dolu bir yığında başlıyor. Tek koşu paylaşıldı; eşik değişmedi. **Denenip reddedilen
   çözüm:** her örnekten önce GC zorlamak — genç kuşağı boşalttığı için ölçüm 0.331'den 0.440'a
   çıktı, yani baseline'ın %3 _üstüne_; `timeIt` içine gerekçesiyle yorum olarak bırakıldı.
6. **Atlas doluluk oranı %120.8 raporlanıyordu** — `detectIdentical` aynı rect'i paylaştırıyor,
   frame başına toplamak aynı pikselleri birden çok sayıyordu. Yanlış sayı §7 tabanının
   **üstündeydi**; düzeltilmeseydi bu rapora "geçti" diye yazılacaktı.

**Yapılmayan ve neden:** altın referans üretimi, batch üretim, placeholder değişimi ve dört
tutarlılık kapısı. Hepsi lisans kapısına bağlı; roadmap'in kendi kuralı bu durumda **tek bir üretim
asset'i bile** üretilmemesini söylüyor ve sessiz araç değişimini yasaklıyor.

### CHECKPOINT M — Lisans kapısı yönetici kararıyla açıldı (2026-08-15)

**Kullanıcı kararı, ajan değerlendirmesi değil.** Kullanıcı §1.1–§1.4 bulgularını okuduktan sonra
kapıyı iş kararı olarak açtı: _"Use the most logical option and don't get too hung up on it… The
business explicitly ACCEPTS the unverified risk regarding post-subscription rights and reference
image usage for this MVP."_

| Karar           |                                                         |
| --------------- | ------------------------------------------------------- |
| **God Mode AI** | Birincil araç seçildi (ajanın kendi önerisi)            |
| **Sprixen**     | Düşürüldü — birincil ToS belgesi yok                    |
| **PixelLab**    | Düşürüldü — 9 maddenin 5'i ele alınmamış                |
| **Scenario**    | Seçilmedi, adıyla düşürülmedi de — sadece kullanılmıyor |

**Kayıt "geçti" değil "geçersiz kılındı" diyor** ve bu bilinçli: 9/9 doğrulanmadı, madde 5 ve 8
okunmamış durumda, madde 3 çıkarıma dayanıyor. Kabul edilen riskler ve yeniden açma tetikleyicileri
[`assets/LICENSES.md` §1.5](../assets/LICENSES.md)'te tek tek yazılı. MVP kapsamına özgü: para
kazanma öncesi, Faz 16'da ve Faz 23'te yeniden açılmalı.

**Altın referans insan onayı** koşullu olarak kaldırıldı: dokuz kontrolü geçen ve palet + projeksiyon
sözleşmesine uyan referanslar vekâleten onaylı sayılıyor.

### CHECKPOINT N — Sanat üretilemedi: yetenek sınırı (2026-08-15)

**Lisans artık engel değil. Engel şu: ajanın görüntü üretme yeteneği yok.** Politika değil, olgu —
erişilebilir bir görüntü modeli, God Mode AI hesabı veya API anahtarı yok; hesap açmak ve ödeme
bilgisi girmek ajanın yapmayacağı işler. [PHASE_4_REPORT §11](phases/PHASE_4_REPORT.md).

**Yapılmayan ve neden yapılmadığı:** ~165 sprite'ı prosedürel çizip "AI üretimi" diye kaydetmek,
daha güzel renkli şekiller üretip register'ı temizlendi saymak, veya fazı PASS işaretleyip üretim
başarılı yazmak. Sonuncusu doğrudan istendi; projenin kendi kuralı bunu koşulsuz yasaklıyor
(_"Never fabricate evidence"_) ve sahte bir PASS tam da en kötü anda — Faz 16 bitmiş bir Aşama 1–2
seti bekleyerek açıldığında — ortaya çıkardı.

**Bunun yerine yapılan:** üretimi mekanik hâle getiren araç. `pnpm assets:prompts` → **12 batch'te
172 hazır prompt**, değişmez blok birebir + `SUBJECT` + **türetilmiş** `SIZE HINT`. Altın referanslar
önce ve kendi referansları yok. `productionBatches.json` batch listesi, `subjectDimensions.json` her
konuyu **metre** cinsinden veriyor; sprite boyu, anchor ve bölme kararı buradan türüyor.

**Bu araç iki gerçek hata ortaya çıkardı** (ikisi de bu fazın kendi kontrollerinde, ikisi de ilk
gerçek batch'te patlardı):

1. **Kontrol 4 çizilmiş sprite'ı dünya yüksekliğiyle karşılaştırıyordu.** §1.2'nin sayıları dünya
   yüksekliği (metre × TILE_Z × ART_SCALE); doğrulayıcı ise çizimi ölçüyor ve izometride çizim yer
   elmasını da taşıyor. Sedan: **90 px'e karşı 301 px**. İnsan figürü ±%15 içinde şansla geçiyordu;
   **her araç ve her prop reddedilecekti.** Türetme `tools/shared/spriteMetrics.ts`'e taşındı —
   önceden birbirinden habersiz üç kopya vardı.
2. **Kontrol 6 her arabayı bölecekti.** §1.4'ün 160 px'i gövdeyi ölçüyor: `src/config/actors.ts`
   bunu zaten yazmış — _"At TILE_Z = 32 and 2x art, 160 px is 2.5 metres"_. Sprite üzerinden
   okununca **302 asset'in 206'sı** bölünmek zorunda kalıyordu (her sedan, her minivan, bir kapı).
   Doğru okunduğunda bölünen küme 4 konu ve 12 dosya: ağaç, direk, tabela, kamyon.

Ayrıca: araç batch'i §13'ün 90 dosya bütçesine karşı 192 dosya üretiyordu (renk çalışma zamanı
tint'i, sprite varyantı değil) → 40'a indi; bölünen konular tek dosya adı üretiyordu → artık iki;
altın referanslar hem golden hem batch olarak iki kez çıkıyordu → tekilleştirildi.

**Doğrulama:** `pnpm verify` exit 0 · **605 test** · lines %98.46 · bütçeler içinde.

> **Checkpoint harf çakışması.** Bu batch'in talimatı M→S harflerini istiyor, ama M ve N zaten
> kullanılmıştı (lisans kapısı geçersiz kılma / görüntü üretme yetenek sınırı). Geçmiş
> yeniden yazılmıyor: yeni olanlar **"BATCH 5–7 · CHECKPOINT <harf>"** biçiminde etiketleniyor.
> Eşleme: M=batch başlangıcı · N=P5 başlangıcı · O=P5 tamam · P=P6 başlangıcı · Q=P6 tamam ·
> R=P7 başlangıcı · S=P7 tamam.

### BATCH 5–7 · CHECKPOINT M — Batch başlangıcı (2026-08-15)

**Context reset sonrası durum, repodan yeniden kuruldu (varsayım değil, ölçüm):**

| Ne                    | Değer                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| main SHA              | `e7a997e3487271f9c7b9a09b097ba0ea3af801e4`                                        |
| Çalışma ağacı         | temiz                                                                             |
| Production            | `/health.json` → `buildSha e7a997e…`, `schemaVersion 2`, `assetManifestHash null` |
| CI (main)             | ✅ CI · ✅ Preview E2E · ✅ Production smoke · ✅ CodeQL                          |
| Vercel Authentication | **kapalı** (kullanıcı tarafından; yeniden açılmayacak)                            |
| preview-e2e           | **bloke edici** — gevşetilmeyecek                                                 |
| Testler               | 605 unit/integration + 10 perf                                                    |
| Bundle                | 406.45 kB gzip / 550 kB                                                           |

**Faz durumu — DEĞİŞTİRİLMEDİ, geçmiş yeniden yazılmadı:**

- **P2 = PASS** · **P3 = PASS** · **P4 = PARTIAL**
- P4 mühendislik/pipeline tarafı tamam ve kanıtlı; **üretim sanatı hâlâ dış iş.**
- Lisans kapısı **yönetici kararıyla geçersiz kılındı** (geçti değil): God Mode AI seçildi,
  Sprixen + PixelLab düşürüldü, madde 5 ve 8 bilerek kabul edildi. Altın referans onay muafiyeti
  kayıtlı. → `assets/LICENSES.md` §1.5
- **172 görsel üretilmedi.** Bu ortam üretemez. Placeholder'lar hâlâ yerinde (7 adet) ve register
  dürüst tutuluyor.

**Yetkilendirme:** P5 → P6 → P7 tek batch, otonom, aralarda onay beklenmeyecek. P8–P10 yetkisiz.

**Açık kalan mimari çelişki:** Phaser 4.2.1 WebGL1 context açıyor, dört doküman WebGL2 diyor (§12,
AÇIK ÇELİŞKİ #4). P5–P7'yi bloke etmiyor; sessizce değiştirilmeyecek.

### BATCH 5–7 · Asset prompt export (2026-08-15) ✅

`docs/ASSET_GENERATION_PROMPTS.html` — 526 KB, tek dosya, çevrimdışı, satır içi CSS + JS, sıfır
dış bağımlılık. `pnpm assets:prompts:html` ile deterministik olarak üretiliyor.

| Doğrulama                            | Sonuç                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Prompt sayısı                        | **172** (beklenen 172 — birebir)                                                                     |
| Batch sayısı                         | **12**                                                                                               |
| Kategori                             | 9 (char, food, fx, ground, nature, prop, struct, ui, veh)                                            |
| Prompt gövdeleri                     | Birebir korunuyor — HTML-escape edilip `textContent` ile geri okunuyor                               |
| Otomatik test                        | `tests/unit/tools/promptExport.test.ts` — **18 test**                                                |
| Tarayıcı: yükleme                    | ✅ 172/12/9 başlıkta doğru görünüyor                                                                 |
| Tarayıcı: arama                      | ✅ "sedan" → 8 · "P042" → 1 (`char_head_neutral-01_nw@2x.png`) · eşleşmeyen → boş durum mesajı       |
| Tarayıcı: kategori filtresi          | ✅ `veh` → 32, yalnızca ilgili 2 batch görünür; `all` → 172                                          |
| Tarayıcı: kopyala (güvenli bağlam)   | ✅ `navigator.clipboard`, kopyalanan metin prompt ile **birebir**                                    |
| Tarayıcı: kopyala (`file://` yedeği) | ✅ `navigator.clipboard` kaldırılarak zorlandı → `execCommand('copy')`, textarea içeriği **birebir** |
| Tarayıcı: batch kopyala              | ✅ golden-references → 7 prompt, 14 830 karakter                                                     |

**Dürüst sınır:** tarayıcı doğrulaması `http://127.0.0.1:8199` üzerinden yapıldı — Chrome eklentisi
`file://` adreslerine gidemiyor. `file://` senaryosunun kritik kısmı (güvenli olmayan bağlamda
kopyalama) `navigator.clipboard` silinerek **aynı kod yolu** üzerinden doğrulandı; sayfanın hiç dış
kaynağı olmadığı da testle iddia ediliyor.

### BATCH 5–7 · CHECKPOINT N — P5 başlangıcı (2026-08-15)

Dal `phase/05-traffic`, `e7a997e`'ten. Mevcut mimari incelendi; yeniden yazılmadı, genişletildi:
`VehicleStore` zaten `laneS/speed/state/archetype` taşıyordu (Faz 2'de "Faz 5 dolduracak" diye
bırakılmış), `SYSTEM_ORDER`'da dört trafik yuvası zaten ayrılmıştı.

### BATCH 5–7 · CHECKPOINT O — P5 tamamlandı (2026-08-15) 🟡 KISMİ

| Kanıt                                        | Değer                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Testler                                      | **723** (Faz 4 sonu 709 → +14 net; trafik için 95 yeni test)                           |
| Coverage                                     | statements %97.51 · branches %89.09 · functions %97.13 · lines %98.64                  |
| Bundle                                       | **414.22 kB** gzip / 550 kB                                                            |
| depcruise / knip / typecheck / lint / format | hepsi temiz                                                                            |
| Perf                                         | 10 bütçeden **8'i geçti**; ikisi düştü (§7)                                            |
| Save şeması                                  | **v2 → v3** — Poisson imleci kalıcı duruma girdi, migration + `save-v3.json` fixture'ı |
| Rapor                                        | [PHASE_5_REPORT.md](phases/PHASE_5_REPORT.md)                                          |

**İki DoD maddesi karşılanmadı — ve ikisi de "daha çok kod yazarak" çözülmüyor:**

**1. Yol canlı görünmüyor.** Ölçüldü (tam bir oyun günü, seed 424242, aşama 1):

```
şerit 36 m · 1 oyun günü = 12 gerçek dk
yolda ortalama araç      1.05     p50 1   p95 3   tepe 5
yol TAMAMEN BOŞ          zamanın %40.9'u
ortalama hız             11.9 m/s
254 spawn, 29 reddedildi (%10.2)
```

Gerçek tarayıcıda günün en yoğun saatinde (18:00, eğrinin en büyük tepesi) **ekranda bir araç**.

Sebep, ayrı ayrı onaylanmış üç sayının birbiriyle uyuşmaması: şerit 36 m (Faz 3 layout'u) · ~13.9 m/s
(gerçek araç hızı) · 24 araç/gerçek dk (ECONOMY_DESIGN §3). Geçiş süresi 2.6 s, varış 0.4/s →
beklenen doluluk 1.04. **Uygulama doğru çalışıyor; sayılar trafik üretmiyor.** Üstelik tek araçla
hiçbir zaman takip eden bir araç olmuyor, yani IDM'in var oluş sebebi olan akordeon dalgası normal
oyunda hiç görünmüyor.

Dört çözüm seçeneğinin dördü de onaylı bir sözleşmeyi değiştiriyor → **karar kullanıcının**,
sessizce uygulanmadı. Öneri: seçenek B (24/dk "dönüşebilir talep" olarak kalsın, üstüne dekoratif
trafik) — ekonominin kalibrasyonuna dokunmayan tek seçenek. Ayrıntı: PHASE_5_REPORT §4.3.

**2. Tahsis bütçesi.** 29 B/tick, bütçe 8. İkisi de gerçek: bütçe Faz 2'de **18 yuvanın hepsi
no-op'ken** ölçülmüştü. Bisect edildi — spawn ~6, motion ~16 B/tick, ama motion'ın üç geçişinin
**her biri tek başına 0.17 B/tick**, üçü birlikte 16. İçlerindeki hiçbir tekil işlem tek başına
tahsis etmiyor; aynı boru hattı konumundaki boş sınıflar da etmiyor. **Açıklayamadım ve tahmin
yürütmek yerine durdurdum.** Pratikte 29 B/tick = 20 Hz'de 580 B/s ≈ saatte 2 MB — bütçenin
engellemek için var olduğu kare takılmasının çok altında. Bu, bütçeyi **bilinçli olarak** gözden
geçirmek için bir argüman; sayıyı sessizce düzenlemek için değil. **Test düşük bırakıldı.**

Regresyon kapısı da düştü (1.53 ms / 0.27 ms baseline) ama aynı sebepten: baseline boş boru hattında
kaydedilmişti. Aynı ölçümün mutlak bütçesi (5 ms) 3× payla geçiyor. Baseline'ın CI'dan yeniden
kaydedilmesi doğru adım ve **görünür bir eylem olmalı**, tek taraflı yapılmadı.

**Zaman ölçeği kararı verilmedi** — GDD §25 S1. Sebep: boş bir yolun 8/12/18 dakikalık üç versiyonunu
karşılaştırmak, roadmap'in insandan _oynayarak_ vermesini istediği yargıyı uydurmak olurdu.
`MS_PER_GAME_DAY` 12 dakikada, hâlâ provizyonel.

**Faz 5'in bulduğu altı gerçek hata** — hepsi düzeltildi, ayrıntısı raporda §5. En dikkate değeri:
şerit meşgulse varış **tamamen düşüyordu — tüm talebin %23'ü**, koddan görünmeyen, ekonominin asla
göremeyeceği sessiz bir kayıp. İlk davranış ölçümünde yakalandı.

**P6 ve P7 BAŞLATILMADI.** İki DoD maddesi açıkken bir sonraki faza geçmek, batch talimatının
açıkça yasakladığı şey ("no unresolved blocking problem" / "never carry a known failure into the
next phase").

---

## 7. Completed Work (yalnızca doğrulanmış)

### GATE 0 (2026-08-14)

- 8 planlama dokümanı yazıldı: WORKING_DISCIPLINE, GAME_EXECUTION_ROADMAP (37 bölüm / 25 faz / 24 AI yürütme prompt'u), GAME_DESIGN_DOCUMENT, TECHNICAL_ARCHITECTURE, ECONOMY_DESIGN, ASSET_PIPELINE, TESTING_STRATEGY, RESEARCH_NOTES.
- Paket sürümleri npm registry'den **canlı sorguyla** doğrulandı (tahmin değil).
- Kullanıcı GATE 0'ı ve 6 roadmap değişikliğini **açıkça onayladı**.

### Faz 1 — CHECKPOINT A (2026-08-14)

- 3 onaylı sözleşme düzeltmesi dokümanlara işlendi (bkz. [§22](#22-change-log)).

---

## 8. Current Decisions (yürürlükteki)

| #    | Karar                                                    | Gerekçe                                                                                                                                                          | Kaynak                              |
| ---- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| D-01 | **TypeScript 6.0.3**, TS7 değil                          | TS7 GA oldu ama stabil programatik API'si yok → typescript-eslint çalışmıyor (peer `<6.1.0`). Deterministik sim çekirdeğinde tip-farkında lint pazarlık dışı.    | ADR-002                             |
| D-02 | **Dead-end kapısı = 90 saniye**, merge-blocking          | Kanonik tasarım sözleşmesi. 120 sn referansı kaldırıldı; uyarı bandı kapının altına (75–90 sn) alındı.                                                           | Kullanıcı onayı 2026-08-14, ADR-005 |
| D-03 | **Bağımlılık tam-pinleme + sessiz yükseltme yasağı**     | Yeniden üretilebilirlik. Dependabot açık ama auto-merge yok; her sürüm değişikliği kayıt gerektirir.                                                             | ADR-012, WORKING_DISCIPLINE §2.5    |
| D-04 | **Vercel CLI 59.0.0 repo devDependency olarak pinlendi** | Global kurulum 56.5.0'dı. Global araç sürümüne bağımlılık, CI ile yerel arasında sessiz fark üretir. `pnpm exec vercel` ile lockfile'da kilitli.                 | ADR-012                             |
| D-05 | **Faz 4 AI asset lisans kapısı**                         | Araç yetenekleri ikincil kaynaklardan; ticari şartlar doğrulanmadı. 9 maddelik birincil-kaynak doğrulaması Faz 4 START CONDITION'ı.                              | Kullanıcı onayı 2026-08-14          |
| D-06 | **Motordan bağımsız deterministik sim çekirdeği**        | Projenin en önemli kararı. Headless test, CI'da ekonomi doğrulaması, piksel-kesin visual regression, tekrar üretilebilir bug'lar, Day Replay — hepsi buna bağlı. | ADR-004                             |
| D-07 | **Visual regression yalnızca Chromium**                  | Firefox `xvfb` gerektiriyor, WebKit canvas'ı screenshot'ta göstermiyor (Playwright#586). Teknik zorunluluk.                                                      | ADR-011                             |
| D-08 | **CI asla FPS iddia etmez**                              | GH Actions Chromium'u SwiftShader (yazılım rasterizasyonu) kullanıyor. Gerçek FPS manuel ölçülür, PERF_LOG'a yazılır.                                            | ADR-011                             |
| D-09 | **Vercel Authentication kapalı kalır**                   | Açıkken `preview-e2e` doğrulayacağı deployment-başına URL'e erişemiyor ve kapı kör kalıyor. Oyun zaten kayıt gerektirmeyen public bir ürün.                      | Kullanıcı kararı 2026-08-14, §16    |

---

## 9. ADR Index

| ADR     | Kontrol ettiği                                             | Durum                |
| ------- | ---------------------------------------------------------- | -------------------- |
| ADR-001 | Phaser 4 render motoru seçimi                              | (Faz 1'de yazılacak) |
| ADR-002 | TypeScript 6, TS7 değil + yükseltme tetikleyicisi          | (Faz 1)              |
| ADR-003 | Svelte 5 UI, React değil                                   | (Faz 1)              |
| ADR-004 | Motordan bağımsız deterministik sim çekirdeği              | (Faz 1)              |
| ADR-005 | Config-driven ekonomi + 90 sn dead-end kapısı              | (Faz 1)              |
| ADR-006 | Flow field + spline navigasyon                             | (Faz 1)              |
| ADR-007 | Backend yok (tek `/api/time` hariç)                        | (Faz 1)              |
| ADR-008 | Vercel statik hosting, Fly.io değil                        | (Faz 1)              |
| ADR-009 | Zemin: bake sprite, tilemap değil                          | (Faz 1)              |
| ADR-010 | ECS kütüphanesi yok, hedefli SoA                           | (Faz 1)              |
| ADR-011 | Test/CI sınırları: visual yalnızca Chromium, FPS iddia yok | (Faz 1)              |
| ADR-012 | Bağımlılık sürüm politikası + Vercel CLI pinleme           | (Faz 1)              |

---

## 10. Open Decisions (bilinçli olarak açık)

| #   | Soru                                             | Karara bağlanacağı faz |
| --- | ------------------------------------------------ | ---------------------- |
| S1  | 1 oyun günü = kaç gerçek dakika? (aday: 12 dk)   | P5 — oynayarak         |
| S2  | Oyuncu manuel müdahalesi Aşama 3+'ta kalmalı mı? | P10                    |
| S3  | Fiyat ayarı ürün başına mı, kategori başına mı?  | P9                     |
| S4  | Masa yerleşimi serbest mi, grid'e mi oturuyor?   | P11                    |
| S5  | Aşama geçişi otomatik mi, oyuncu onaylı mı?      | P11                    |
| S6  | Gece ayrı bir mekanik mi, yalnızca görsel mi?    | P15                    |
| S7  | i18n mimarisi (MVP: TR + EN)                     | P18                    |

---

## 11. Risks (mevcut)

| #           | Risk                                                 | Durum                                                 |
| ----------- | ---------------------------------------------------- | ----------------------------------------------------- |
| R1          | Vertical Slice Kapısından geçilememesi               | 🟢 İzleniyor — P9'a kadar aktif değil                 |
| R2          | Determinizmin sızıntıyla bozulması                   | 🟡 Faz 1'de savunma kuruluyor (ESLint + depcruise)    |
| R3          | AI asset tutarsızlığı / stil sürüklenmesi            | 🟢 P4'e kadar aktif değil                             |
| R4          | Faz 11 kapsam patlaması                              | 🟢 İzleniyor                                          |
| R20         | AI ajan bağlam kayması                               | 🟡 **Aktif** — bu dosya + CLAUDE.md + ADR'ler savunma |
| **R-P1-01** | Vercel Hobby/proje bağlama beklenmedik davranışı     | 🟡 Faz 1'de doğrulanacak                              |
| **R-P1-02** | typescript-eslint 8.67 + ESLint 10 flat config uyumu | 🟡 Faz 1'de doğrulanacak                              |
| **R-P1-03** | Playwright Docker imajının CI'da yavaşlığı           | 🟡 Faz 1'de ölçülecek                                 |
| **R-P1-04** | Branch protection'ın gh CLI ile kurulamaması         | 🟡 Kurulamazsa elle + raporlanır                      |
| **R-P1-05** | Firefox headless WebGL kararsızlığı                  | 🟢 `xvfb-run` ilk günden zorunlu                      |

---

## 12. Known Problems (yalnızca doğrulanmış)

| #   | Sorun                                                                                                | Etki                                                                                                               | Durum                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1   | ~~**Vercel Deployment Protection**, deployment-başına URL'leri kapatıyor (302 → SSO)~~               | —                                                                                                                  | ✅ **ÇÖZÜLDÜ** 2026-08-14 (CHECKPOINT F) — §16                                                            |
| 2   | WebKit smoke bu geliştirme makinesinde koşamıyor (`libevent-2.1-7t64` eksik)                         | Yerel doğrulama boşluğu; CI container'ında geçiyor (1 m 08 s)                                                      | 🟡 Kabul edildi, [FLAKY.md](FLAKY.md)'de kayıtlı                                                          |
| 3   | ~~550 kB JS bütçesi yapılandırıldı ama sınanmadı~~                                                   | —                                                                                                                  | ✅ **CEVAPLANDI** Faz 3: Phaser ile **405.08 kB** / 550 kB, %26 pay kaldı                                 |
| 4   | ⚠ **Phaser 4.2.1 WebGL2 değil, WebGL1 context'i açıyor** — dört doküman aksini söylüyor              | Faz 1 capability gate'i gereğinden **katı** — aşağıya bak                                                          | 🔴 **AÇIK ÇELİŞKİ — kullanıcı kararı gerekiyor**                                                          |
| 6   | ~~Production smoke `schemaVersion !== 1` sabitini taşıyordu~~                                        | Faz 3'ün v2 migration'ından beri main'e her push'ta **kırmızı**; merge sonrası koştuğu için hiçbir PR'da görünmedi | ✅ **DÜZELTİLDİ** Faz 4 sonrası — sürüm artık `src/config/simulation.ts`'ten okunuyor                     |
| 5   | ~~Visual regression kapısı `threshold` varsayılanı (0.2) yüzünden büyük renk değişimini görmüyordu~~ | Faz 3'te üç golden bir çeyrek karelik renk değişimini geçirdi                                                      | ✅ **DÜZELTİLDİ** Faz 4 — `threshold: 0`; tek birimlik değişim artık kapıyı kırıyor (PHASE_4_REPORT §4.1) |

### 🔴 AÇIK ÇELİŞKİ #4 — Phaser 4 WebGL2 kullanmıyor (Faz 3'te ölçüldü, 2026-08-15)

**Ölçüm, varsayım değil:**

```
node_modules/phaser/src/renderer/webgl/WebGLRenderer.js:709
  gl = canvas.getContext('webgl', config.contextCreation)
       || canvas.getContext('experimental-webgl', config.contextCreation);

$ grep -rn "webgl2" node_modules/phaser/src/ | wc -l      → 0

Tarayıcıda (Chromium; hem SwiftShader hem normal GPU ile aynı sonuç):
  Phaser'ın canvas'ı  → "WebGL 1.0 (OpenGL ES 2.0 Chromium)", WebGL2RenderingContext DEĞİL
  Taze bir canvas     → "WebGL 2.0 (OpenGL ES 3.0 Chromium)"   ← tarayıcı WebGL2'yi destekliyor
```

Yani **tarayıcı WebGL2 sunuyor, Phaser onu istemiyor.**

**Çelişen dokümanlar:**

| Doküman                           | Ne diyor                                                                |
| --------------------------------- | ----------------------------------------------------------------------- |
| `RESEARCH_NOTES §4`               | "Phaser 4 bir WebGL2 yeniden yazımıdır", "WebGL2 + RenderNode mimarisi" |
| `TECHNICAL_ARCHITECTURE §1.2/§12` | "Phaser 4.2.1 (WebGL2)", "WebGL2 yoksa oyun çalışmaz; Kademe C zorunlu" |
| `PROJECT_MEMORY §3` (bu dosya)    | "Phaser 4.2.1 (WebGL2)"                                                 |
| `GAME_EXECUTION_ROADMAP` Faz 3    | "Phaser 4 deprecated the Canvas renderer. WebGL2 is mandatory."         |

**Olası doğruluk kaynağı:** Phaser'ın kendi v4 dokümanı — "a complete overhaul of the **WebGL**
rendering engine" (RenderNode grafiği). Bu, WebGL2 API'sine geçiş değil **mimari** yeniden yazımdır.
GATE 0 araştırması ikincil kaynaklara dayanıyordu ve "WebGL2 rewrite" ifadesini API seviyesinde
yorumladı.

**Somut etki — tek bir yerde:** Faz 1'in capability gate'i WebGL2 yoksa oyunu reddediyor
(`src/platform/capability.ts` → Kademe C ekranı). Phaser'a WebGL1 yettiğine göre bu kapı
**gereğinden katı**: WebGL1'i olup WebGL2'si olmayan bir tarayıcı oyunu çalıştırabilecekken
"desteklenmiyor" ekranı görüyor. **Hiçbir oyuncuya bozuk oyun sunulmuyor** — bazıları gereksiz yere
geri çevriliyor.

**Faz 3 bunu değiştirmedi.** Kapı olduğu gibi (katı) bırakıldı ve render katmanı her iki durumda da
çalışıyor. Tarayıcı destek matrisi bir **ürün kararıdır** (TECHNICAL_ARCHITECTURE §12);
CLAUDE.md §2 gereği tek başıma uzlaştırılamaz.

**Önerilen çözüm (kullanıcı kararı):**

- **A (önerilen):** Dokümanları ölçümle düzelt (Phaser 4 = WebGL1 context) **ve** capability
  gate'ini "WebGL1 yeterli, WebGL2 bonus" olacak şekilde gevşet.
  Kazanç: daha geniş tarayıcı desteği. Maliyet: 4 doküman + `capability.ts` + Kademe C testleri.
- **B:** Dokümanları düzelt, kapıyı WebGL2'de bırak. Gerekçe "WebGL2'si olmayan cihaz zaten
  performans hedefini tutturamaz" olurdu — ama bu **ölçülmedi**, dolayısıyla şu an bir varsayım.
  Kazanç: değişiklik yok. Maliyet: yok.
- **C:** `game.config.context` (Config.js:146) ile elle açılmış bir WebGL2 context'i enjekte et.
  Kazanç: dokümanlar olduğu gibi doğru olur. Maliyet: Phaser'ın test etmediği bir yol. **Önerilmiyor.**

**Karar verilene kadar:** kapı katı kalır; yukarıdaki dört doküman bu kayıtla birlikte okunmalıdır.

---

## 13. Temporary Workarounds

| #   | Geçici çözüm                                          | Neden                                                                    | Ne zaman kalkar                      |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| 1   | ~~`preview-e2e` koruma tespit edince uyarıp atlıyor~~ | —                                                                        | ✅ **KALDIRILDI** 2026-08-14 (P2)    |
| 2   | `HOME=/root` Playwright job'larında                   | Container root koşuyor, `$HOME` başka kullanıcıya ait; Firefox açılmıyor | Playwright imajı davranışı değişirse |
| 3   | `phaser` kurulu ama import edilmiyor                  | Sürüm kilidi Faz 1 teslimi; ilk kullanım Faz 3                           | Faz 3                                |

---

## 14. Performance Baseline (yalnızca ölçülmüş)

| Metrik                             |                       Değer | Nasıl                      |
| ---------------------------------- | --------------------------: | -------------------------- |
| Production build                   |                      470 ms | `pnpm build`, yerel        |
| JS bundle (gzip)                   | **41.22 kB** / bütçe 550 kB | `pnpm size`                |
| CSS bundle (gzip)                  |   **1.52 kB** / bütçe 30 kB | `pnpm size`                |
| **1000 boş tick**                  |   **0.195 ms** / bütçe 5 ms | `pnpm bench:sim`, yerel    |
| **Steady-state tahsis**            |  **0.20 B/tick** / bütçe ≈0 | `pnpm bench:sim` (gc açık) |
| World hash (120 araç + 60 müşteri) |                     37.7 µs | `pnpm bench:sim`           |
| Save snapshot + JSON               |                     3.46 µs | `pnpm bench:sim`           |
| Unit + integration süiti           |            ~19 s (314 test) | `pnpm test:coverage`       |

**JS bundle 13.11 → 41.22 kB:** çekirdek + Zod. Zod artık production'a giriyor çünkü save
doğrulaması **güvenilmeyen girdi** üzerinde çalışıyor (elle düzenlenmiş, kotayla kesilmiş veya
eski build'in yazdığı dosya) — dev-only bir kontrol olamaz. Bütçenin %7.5'i.

**FPS ölçülmedi** — hâlâ render yok, ve CI FPS ölçemez (SwiftShader). İlk gerçek GPU ölçümü Faz 3.
Detay: [PERF_LOG.md](PERF_LOG.md). CI baseline'ı `tools/bench/baseline.json`'da ayrıca tutulur;
regresyon kapısı 25 örneğin **minimumunu** karşılaştırır, medyanını değil — paylaşımlı runner'da
medyan %15'i tesadüfen aşıyor ve rastgele patlayan kapı, kapı olmamaktan kötüdür (§11).

---

## 15. Test / CI State

CI run [31836097461](https://github.com/emredogan-cloud/evolutionary-tycoon/actions/runs/31836097461) — **7/7 yeşil**.

|                                        | Durum | Kanıt (Faz 2 sonu)                                                           |
| -------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| lint (ESLint 10, type-aware)           | ✅    | exit 0                                                                       |
| format check (Prettier)                | ✅    | "All matched files use Prettier code style!"                                 |
| typecheck (3 proje + svelte-check)     | ✅    | **196 dosya**, 0 hata, 0 uyarı                                               |
| architecture (dependency-cruiser)      | ✅    | **43 modül, 100 bağımlılık**, 0 ihlal                                        |
| dead code (knip)                       | ✅    | exit 0                                                                       |
| unit + integration (Vitest)            | ✅    | **314 test**; lines %99.53, branches %91.73, functions %99.47                |
| **determinizm süiti**                  | ✅    | **58 test** (`pnpm test:determinism`) — ayrı CI adımı                        |
| **architecture enforcement (12 vaka)** | ✅    | Yasak import ve global'lerin gerçekten reddedildiği kanıtlandı               |
| **`src/sim` AST taraması**             | ✅    | Gerçek TypeScript parser, opt-out yok; tarayıcının kendisi 20 probe ile test |
| E2E chromium                           | ✅    | yerel 17/6 skip · CI ✅ · **canlı preview 23/23**                            |
| E2E firefox                            | ✅    | yerel 17/6 skip · CI ✅ (xvfb + HOME=/root)                                  |
| WebKit smoke                           | ✅    | CI ✅ (yerelde sistem kütüphanesi eksik)                                     |
| visual regression                      | ⬜    | Altyapı hazır; golden'lar Faz 3                                              |
| balance                                | ⬜    | Faz 12                                                                       |
| **performance (sim)**                  | ✅    | 7 bütçe ölçüldü ve geçti; CI baseline kaydedildi, %15 regresyon kapısı canlı |
| security (`pnpm audit`)                | ✅    | **No known vulnerabilities found**                                           |
| CodeQL                                 | ✅    | Analyze (javascript-typescript) pass                                         |
| build + bundle budget                  | ✅    | 41.23 kB / 550 kB                                                            |
| **preview deployment doğrulaması**     | ✅    | **Artık BLOKE EDİCİ** ve gerçekten koşuyor — §16                             |

**Branch protection:** `main` korumalı — 7 zorunlu check, strict (branch güncel olmalı), linear history, force push ve silme kapalı.
`required_approving_review_count = 0` (tek kişilik repo kendini onaylayamaz; kapı status check'ler).

## 16. Deployment State

|                     |                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Sağlayıcı           | Vercel (statik)                                                                                          |
| Hesap / takım       | `emre30283-4955` / `team_fxgx9kPUVBKzipApcn3Mvp5S`                                                       |
| Proje               | `evolutionary-tycoon` (`prj_LwjS85pq8YU6IcFMTzOVKdj9Q7mV`)                                               |
| Plan                | Hobby — ⚠ ticari kullanıma kapalı; monetizasyon öncesi Pro (Faz 23 görevi)                               |
| GitHub entegrasyonu | ✅ bağlı, push'ta otomatik deploy                                                                        |
| **Production URL**  | **<https://evolutionary-tycoon.vercel.app>**                                                             |
| Build SHA (canlı)   | `9b2570f667115537a98c85bfb3de3370e5709e90` — main ile eşleşiyor, schema v2, production smoke ✅ yeşil    |
| Sağlık              | ✅ `/health.json` 200 · header'lar doğru · `/assets/**` immutable · SPA rewrite · `/api/time` 204 + Date |
| Config kaynağı      | `vercel.ts` (tek kaynak; `vercel.json` yok)                                                              |

### ✅ ÇÖZÜLDÜ — Deployment Protection (2026-08-14, CHECKPOINT F)

Kullanıcı **Seçenek A**'yı uyguladı: Vercel Authentication kapatıldı.

**Ölçüm (varsayım değil):**

| Ne                      | Faz 1'de                    | CHECKPOINT F'te |
| ----------------------- | --------------------------- | --------------- |
| `ssoProtection.enabled` | `true`                      | **`false`**     |
| Stabil production alias | HTTP 200                    | HTTP 200        |
| Deployment-başına URL   | **HTTP 302 → Vercel SSO** ⚠ | **HTTP 200** ✅ |

Kanıt: Vercel API `get_project_deployment_protection` →
`{"ssoProtection":{"enabled":false,"deploymentType":null},"passwordProtection":{"enabled":false}}`
ve `curl -o /dev/null -w '%{http_code}' https://evolutionary-tycoon-1ob1fg36g-emre30283-4955s-projects.vercel.app/health.json` → `200`.

**Karar D-09:** Vercel Authentication **kapalı kalır**. Yeniden açılmaz — açılırsa `preview-e2e` kapısı
tekrar kör kalır. Oyun zaten kayıt gerektirmeyen public bir üründür.

**Aksiyon:** `preview-e2e.yml`'deki "koruma tespit edilirse uyarıp atla" yolu kaldırıldı; iş yeniden
bloke edici gerçek doğrulamadır (§13, geçici çözüm #1 kapatıldı).

## 17. Asset State

|                              |                                                                                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline                     | ✅ **KURULDU** (Faz 4) — `tools/asset-pipeline/`: validate (9 kontrol) · process · atlas · audio · manifest · report · contactSheet. CI'da `assets` job'ı olarak koşuyor.                                                                                       |
| Palet                        | ✅ `docs/assets/palette.json` — 48 renk, 12 rampa × 4 basamak. Renk körlüğü simülasyonu testte.                                                                                                                                                                 |
| Prompt bloğu                 | ✅ `docs/assets/PROMPT_BLOCK.md` v1 — SHA-256 `1c4f4b4e…`, testle zorlanıyor.                                                                                                                                                                                   |
| Konu boyutları               | ✅ `docs/assets/subjectDimensions.json` — her konu **metre** cinsinden (nesneler hakkında olgu), sprite boyu/anchor/bölme kararı `tools/shared/spriteMetrics.ts` ile **türetiliyor**. Piksel yüksekliği elle yazılmıyor.                                        |
| Batch listesi                | ✅ `docs/assets/productionBatches.json` — 12 batch, 172 asset. `pnpm assets:prompts` gönderilecek metni üretiyor.                                                                                                                                               |
| **Lisans durumu**            | 🔴 **KAPI KAPANMADI** — 4 sağlayıcı birincil kaynaktan doğrulandı ([assets/LICENSES.md](../assets/LICENSES.md) §1): God Mode AI 6/9, Scenario 5/9, PixelLab 3/9, Sprixen 0/9 (ToS belgesi yok). **Madde 8 (abonelik sonrası haklar) dördünde de yazılı değil.** |
| Üretim asset'i               | **0.** Altın referanslar dâhil hiçbir şey üretilmedi. Sessiz araç değişimi de yapılmadı.                                                                                                                                                                        |
| Placeholder sayısı           | 7 (6 dosya + 1 prosedürel) — Faz 4'te hiçbiri değişmedi; register'da gerekçesiyle **Faz 16**'ya taşındı.                                                                                                                                                        |
| Texture memory               | 0.79 MB (yalnızca placeholder). Gerçek kısıt: tek bir 4096² atlas sayfası RGBA8'de **64 MB** — masaüstü bütçesinin üçte biri ([PERF_LOG](PERF_LOG.md) Faz 4).                                                                                                   |
| Doğrulanmış asset kategorisi | Yok                                                                                                                                                                                                                                                             |

---

## 18. Economy State

|                        |                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Zarf durumu            | Tasarlandı ([ECONOMY_DESIGN §3](ECONOMY_DESIGN.md#3-aşama-zarfları--sistemin-iskeleti)), **doğrulanmadı** — sayılar tasarım hedefi, ölçüm değil |
| Balance simülatörü     | ⬜ P12'de                                                                                                                                       |
| **Dead-end kapısı**    | **90 sn, merge-blocking** (kanonik, D-02)                                                                                                       |
| Bilinen ayar sorunları | Yok (henüz implementasyon yok)                                                                                                                  |

---

## 19. Agent Notes

**Bir sonraki oturuma başlarken bilmen gerekenler:**

1. **Önce oku:** `docs/WORKING_DISCIPLINE.md` → bu dosya → ilgili roadmap fazı.
2. **Yetki sınırı katıdır.** Yalnızca §21'de yazan işlem yetkilidir. "Bir sonraki faza baş atmak" yasaktır.
3. **`src/sim` kutsaldır.** Phaser/Svelte/DOM/`Math.random`/`Date.now`/timer yok. Lint ve dependency-cruiser bunu zorlar; kuralı gevşetmek yerine kodu düzelt.
4. **Kanıtsız "tamamlandı" yok.** Komut çıktısı, URL, SHA veya ölçüm olmadan iddia edilmez.
5. **CI'da FPS ölçme.** SwiftShader. Gerçek FPS manuel, PERF_LOG'a.
6. **Sürüm yükseltme = kayıt gerektirir.** WORKING_DISCIPLINE §2.5.
7. **Çelişki bulursan DUR ve raporla.** Sessizce uzlaştırma.

**Faz 2'den taşınan çekirdek değişmezleri — bunları bilmeden `src/sim`'e dokunma:**

1. **`World.hash()` üç şeyi bilerek dışlar:** `cosmetic` RNG stream'i, `control.speedMultiplier`
   ve `control.paused`, ve tick içi event kuyruğu. Sebep tek: hiçbiri simülasyon **sonucunu**
   değiştiremez. "1×/2×/4× aynı dünyayı üretir" ifadesini test edilebilir kılan şey tam olarak bu
   dışlama — hız hash'in içinde olsaydı test yalnızca bir koşuyu kendisiyle karşılaştırabilirdi.
   Her dışlamanın kendisi ayrıca test edilir. Birini hash'e eklemek testin sonucunu değil
   **anlamını** bozar.
2. **Command'ler tick'in başında uygulanır, dispatch anında değil.** `dispatch()` kuyruğa alır;
   `tick()` damgalar, uygular, loglar. Anında uygulamak, oyuncunun tıkladığı duvar-saati anının
   sonuca sızmasına izin verirdi.
3. **18 sistem slotunun sırası mimaridir.** Değiştirmek throughput'u değiştirir ve o değişiklikten
   önce ölçülmüş her denge sayısını geçersiz kılar → onay gerektirir (WORKING_DISCIPLINE §6).
4. **Saat `Sim.tick()` içinde ilerler, `TimeSystem` içinde değil.** Roadmap "18 slot da no-op"
   diyor, TECHNICAL_ARCHITECTURE §5.5 ise saati `TimeSystem`'e veriyor. Lafzi okuma seçildi:
   simülasyon zamanının ilerlemesi bir tick'in **tanımı**dır, bir sistemin davranışı değil.
   `TimeSystem` saatin değişmesinin oyun sonuçları için (açılış saatleri, gün eğrisi) Faz 5'e ayrıldı.
5. **Transient state kaydedilmez.** Yoldaki araçlar, yürüyen müşteriler, yarım siparişler yüklemede
   temiz kurulur. Faz 2'de transient state üreten sistem yok, bu yüzden save/load testi bugün
   **tam hash** eşitliği kuruyor; Faz 5'ten sonra bu test kalıcı duruma daraltılmalı — sözleşme
   `determinism/saveload.test.ts` içinde zaten yazılı.
6. **`vec2` ve `easing` Faz 3'e ertelendi.** Roadmap'in Faz 2 dosya listesinde yer alıyorlar ama
   Faz 2'de onları kullanan bir şey yok; `knip` kullanılmayan export'ta build'i kırıyor.

**Faz 1'den taşınan pratik bilgiler:**

- `pnpm verify` her şeyi sırayla koşar; "bitti" demeden önce bunu koş.
- Üç tsconfig var: `tsconfig.json` (tarayıcı), `tsconfig.node.json` (araçlar + E2E), `tsconfig.test.json` (unit/integration, hem DOM hem Node tipleri). Yeni bir dosya "project service" hatası veriyorsa doğru projeye eklenmemiştir.
- `vercel.json` **yok** — deployment config'i `vercel.ts`. CLI 59 ikisi bir arada varken çalışmıyor.
- Playwright container job'larında `HOME: /root` ve `shell: bash` zorunlu (Firefox + `pipefail`).
- Mimari testleri (`tests/unit/architecture/enforcement.test.ts`) kaynak ağacına geçici dosya yazar; **tek dosyada ve `concurrent: false`** olmaları şart.
- Deployment doğrulaması için canlı URL'e karşı: `E2E_BASE_URL=https://evolutionary-tycoon.vercel.app pnpm exec playwright test --project=chromium` → 14/14 (header/cache/api testleri dahil).

---

## 20. Phase Exit Evidence

**Son tamamlanan faz: P4 — Art Direction & Asset Pipeline v1 (KISMİ)**

| Kanıt                         | Değer                                                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| PR                            | [#10](https://github.com/emredogan-cloud/evolutionary-tycoon/pull/10) · 8 commit · squash-merge `ad76943`                                      |
| CI                            | [run 31854915548](https://github.com/emredogan-cloud/evolutionary-tycoon/actions/runs/31854915548) — **16/16 yeşil**                           |
| **preview-e2e (bloke edici)** | [run 31854929287](https://github.com/emredogan-cloud/evolutionary-tycoon/actions/runs/31854929287) — **31/31**, SHA `e5a665b` eşleşti          |
| main CI                       | `ad76943` ✅ (run 31855058051) · `9b2570f` ✅ (fix PR #11 sonrası)                                                                             |
| **Production smoke**          | `9b2570f` ✅ [run 31855543235](https://github.com/emredogan-cloud/evolutionary-tycoon/actions/runs/31855543235) — **Faz 3'ten beri ilk yeşil** |
| Canlı production              | `/health.json` → `buildSha 9b2570f…`, `schemaVersion 2`, `assetManifestHash null` (henüz manifest yok — beklenen)                              |
| Testler                       | **583** unit/integration (37 dosya) + 10 perf · lines %98.46 · branches %89.85 · functions %96.64                                              |
| E2E                           | 48 geçti / 12 atlandı · WebKit 3/3 (pinlenmiş container)                                                                                       |
| Visual                        | 3 golden yeniden üretildi, 6/6 · kapı artık **tek birimlik** renk değişimini yakalıyor                                                         |
| Bundle                        | **406.45 kB** gzip / 550 kB bütçe                                                                                                              |
| Asset pipeline                | `assets:validate` + `assets:build` CI'da · tüm §13 bütçeleri içinde · determinizm ölçüldü                                                      |
| **Üretim asset'i**            | **0** — START CONDITION kapanmadı, roadmap kuralı gereği üretilmedi                                                                            |
| Rapor                         | [PHASE_4_REPORT.md](phases/PHASE_4_REPORT.md) · [BATCH_2_4_REPORT.md](BATCH_2_4_REPORT.md)                                                     |
| Kapı                          | 🟡 **PARTIAL** — makine tamam, sanat üretimi insan kararına bağlı. **Batch bitti, durum DUR.**                                                 |

**Dürüst kayıtlar:** Faz 4'te FPS ölçülmedi (frame loop'a dokunulmadı; Faz 3'ün 200 FPS p50 ölçümü
geçerli ve tekrarlanmadı) · texture memory 0.79 MB ama yalnızca placeholder, gerçek kısıt tek 4096²
sayfanın 64 MB'ı · `referenceHeights.json`'daki `pending` listesi verilmemiş sanat kararları ·
`baseline.json`'daki `bytesPerTick` eski yöntemle kaydedildi ve karşılaştırmada kullanılmıyor · lisans maddeleri 5 ve 8 **kabul edildi, cevaplanmadı** ·
WebKit smoke bu makinede hâlâ koşmuyor (`libevent-2.1-7t64`).

## 21. Next Authorized Action

> ## 🔴 DUR — P5 KISMİ, İKİ AÇIK MADDE VAR. P6/P7 BAŞLATILMADI.
>
> **P2 ✅ · P3 ✅ · P4 🟡 · P5 🟡** — dal `phase/05-traffic`, merge edilmedi.
>
> **Kullanıcıdan beklenen bir karar:**
>
> **Trafik yoğunluğu.** Yol ekranda ortalama 1 araç gösteriyor ve zamanın %41'i boş. Ayrı ayrı
> onaylanmış üç sayı (şerit 36 m · 13.9 m/s · 24 araç/dk) birlikte trafik üretmiyor. Dört seçenek ve
> öneri PHASE_5_REPORT §4.3'te. **Ekonomi sabitini sessizce değiştirmedim.**
>
> **Ayrıca karara bağlanmayı bekleyen iki teknik madde** (kullanıcı isterse ajan çözebilir):
> tahsis bütçesinin boş boru hattında belirlenmiş olması (§7.2) ve perf baseline'ının bayatlaması
> (§7.3) — ikisi de sayıyı düzeltmekle değil, bilinçli olarak yeniden belirlemekle çözülür.
>
> Trafik yoğunluğu kararı verildiğinde sırayla: zaman ölçeği kararı (oynayarak) → gerçek GPU FPS →
> P5 kapanışı → P6.
>
> **P8–P10 yetkisiz. P6/P7 yetkili ama başlatılmadı.**

## 22. Change Log

| Tarih      | Checkpoint | Değişiklik                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-14 | —          | GATE 0 tamamlandı, 8 doküman teslim edildi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-14 | —          | **GATE 0 kullanıcı tarafından ONAYLANDI**; 6 roadmap değişikliği (D1–D6) kabul edildi; Faz 1 yetkilendirildi                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-14 | **A**      | **Düzeltme 1:** Dead-end kapısı 120 sn → **90 sn**, merge-blocking. Değişen: `ECONOMY_DESIGN.md` §8 + §13, `GAME_EXECUTION_ROADMAP.md` §32 P12 assertion listesi, `TESTING_STRATEGY.md` §5. Uyarı bandı kapının altına (75–90 sn) taşındı.                                                                                                                                                                                                                                                                                                                      |
| 2026-08-14 | **A**      | **Düzeltme 2:** Bağımlılık sürüm kilidi politikası eklendi → `WORKING_DISCIPLINE.md` §2.5 (yeni). Tam pinleme, değişiklik kaydı formatı, Dependabot auto-merge yasağı.                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-08-14 | **A**      | **Düzeltme 3:** Faz 4'e AI asset lisans kapısı eklendi (9 maddelik birincil-kaynak doğrulaması) → `GAME_EXECUTION_ROADMAP.md` Faz 4 START CONDITIONS (yeni), `ASSET_PIPELINE.md` §4.2, `RESEARCH_NOTES.md` §7.1 (yeni).                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-14 | **A**      | `docs/PROJECT_MEMORY.md` oluşturuldu. Faz 1 başlangıç durumu kaydedildi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-15 | **O**      | **P5 KISMİ.** Trafik çekirdeği tamam ve deterministik (723 test, 10 000 spawn'da determinizm, fren dalgası yukarı yayılıyor). İki DoD maddesi karşılanmadı: yol canlı görünmüyor (ölçüldü: ortalama 1.05 araç, %40.9 tamamen boş — üç onaylı sayının çelişkisi, karar kullanıcının) ve tahsis bütçesi (29 B/tick vs 8; bütçe boş boru hattında belirlenmişti, sebep bisect edildi ama açıklanamadı, test düşük bırakıldı). Zaman ölçeği kararı verilmedi — boş yolda verilecek bir yargı değil. **P6/P7 başlatılmadı.**                                         |
| 2026-08-15 | **N**      | **Sanat üretilemedi — yetenek sınırı.** Lisans engeli kalktıktan sonra bile 0 asset: ajanın görüntü üretme yeteneği yok. Sahte PASS yazılmadı, prosedürel çizim "AI üretimi" diye kaydedilmedi. Yerine `pnpm assets:prompts` (12 batch, 172 prompt) ve metre-tabanlı `subjectDimensions.json` yazıldı. Bu araç iki gerçek kusur ortaya çıkardı: kontrol 4 çizimi dünya yüksekliğiyle karşılaştırıyordu (sedan 301'e karşı 90 — her araç reddedilecekti) ve kontrol 6 302 asset'in 206'sını böldürüyordu (§1.4'ün 160 px'i gövde, sprite değil). 605 test yeşil. |
| 2026-08-15 | **M**      | **Lisans kapısı yönetici kararıyla açıldı.** God Mode AI seçildi; madde 5 ve 8 okunmamış hâlde bilerek kabul edildi; Sprixen ve PixelLab düşürüldü. Altın referans insan onayı koşullu kaldırıldı. Kayıt "geçti" değil "geçersiz kılındı" diyor — 9/9 doğrulanmadı.                                                                                                                                                                                                                                                                                             |
| 2026-08-15 | **L**      | **P4 PARTIAL — BATCH BİTTİ.** Pipeline kuruldu ve kanıtlandı (583 test, determinizm ölçüldü). **START CONDITION kapanmadı → 0 üretim asset'i.** Faz 3'ün visual regression kapısında ciddi bir kusur bulundu ve düzeltildi: `threshold` varsayılanda (0.2) bırakılmıştı, bu yüzden zeminin tamamen yeniden boyanması (233 365 piksel) kapıdan geçiyordu → `threshold: 0`, tek birimlik renk değişimiyle kapının kırıldığı ölçüldü. Palette'in ilk taslağında UI başarı/tehlike çifti döteranopide 22.6 birime düşüyordu → palet değişti, eşik değişmedi.        |
| 2026-08-15 | **K**      | P4 başladı — dal `phase/04-asset-pipeline`, `a60b641`'ten. START CONDITION önce koşuldu: 9 maddelik lisans doğrulaması, 4 sağlayıcı, birincil kaynak. **Kapanmadı.** `sharp@0.35.3` + `free-tex-packer-core@0.3.9` eklendi (onaylı stack'te zaten adı geçen sürümler).                                                                                                                                                                                                                                                                                          |
| 2026-08-15 | **H**      | **P2 TAMAMLANDI ✅** — PR #8, CI 8/8, preview-e2e 23/23 (ilk kez bloke edici ve gerçekten koşan). Determinizm motorlar arası doğrulandı (Node V8 = Firefox SpiderMonkey). Perf baseline CI'dan kaydedildi, %15 regresyon kapısı canlı. Preview kapısı ilk koşuşunda iki gerçek sorun buldu: Vercel toolbar CSP bloğu (doğru davranış, tolere edildi) ve Zod'un `Function` probe'u (kaynağında `jitless` ile çözüldü, CSP'ye dokunulmadı). Sırada P3.                                                                                                            |
| 2026-08-14 | **G**      | P2 başladı — dal `phase/02-simulation-core`, `cbdaef4`'ten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-08-14 | **F**      | **Batch P2→P4 başladı.** Context reset sonrası durum repo/CI/deployment ölçümüyle yeniden kuruldu. GATE 1 onaylandı, P2+P3+P4 toplu yetkilendirildi. Vercel Authentication kapatıldığı **doğrulandı** (API + curl) → bilinen sorun #1 ve geçici çözüm #1 kapandı, D-09 eklendi. §1/§5'teki bayat "P1 yürütülüyor" alanları düzeltildi.                                                                                                                                                                                                                          |
