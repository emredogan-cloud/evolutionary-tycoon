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

|                    |                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------ |
| **Proje adı**      | Evolutionary Tycoon                                                                  |
| **Repository**     | <https://github.com/emredogan-cloud/evolutionary-tycoon> (public, MIT)               |
| **Sürüm**          | 0.1.0                                                                                |
| **Mevcut faz**     | **PHASE 14 — Offline Progression** (BATCH P14→P16'nın ilk fazı)                      |
| **Mevcut kapı**    | Kullanıcı 2026-08-20'de P14+P15+P16'yı toplu yetkilendirdi (otonom, P16 sonunda DUR) |
| **Durum**          | 🟢 **BATCH P14–P16 YÜRÜTÜLÜYOR.** P0–P13 ✅ + konsolidasyon ✅. P17+ yetkisiz.       |
| **Son güncelleme** | 2026-08-20 — CHECKPOINT Z (P14–P16 batch başlangıcı)                                 |
| **Son commit SHA** | `4394acfc1463252f8e7d724f79c792ed72faf53e` (phase/consolidation-art)                 |
| **Yerel dizin**    | `/home/emre/Downloads/Evolutionary-Tycoon`                                           |

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

| Katman             | Karar                                                                                                                                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Simülasyon**     | Motordan tamamen bağımsız, deterministik, saf TypeScript. 20 Hz sabit tick, tohumlanmış 6 RNG stream'i, command log, event bus. `src/sim` içinde Phaser/Svelte/DOM/`Math.random`/`Date.now`/timer **yasak** — CI zorlar.                                                                                        |
| **Render**         | Phaser 4.2.1 (WebGL 1 — ADR-017 kabul, 2026-08-21). 2:1 dimetrik izometrik, painter's algorithm depth sort (topolojik sıralama yok), 9 katmanlı sahne. `SpriteGPULayer` **yalnızca** statik dekor/parallax/tek-atış partikül (derinlik sıralanamıyor). Zemin **tilemap değil**, aşama başına elle kompoze bake. |
| **UI**             | Svelte 5.56 DOM overlay. `src/ui` → `src/sim` importu **yasak**; yalnızca `src/app/bridge` üzerinden, 10 Hz throttle. Gerekçe: a11y + E2E testedilebilirlik + per-frame maliyet yok.                                                                                                                            |
| **Data**           | Save = yalnızca kalıcı durum (~15 KB). Transient (yoldaki araçlar, yarım siparişler) kaydedilmez. Versiyonlu şema + zincirleme migration + her sürüm için commit'li fixture.                                                                                                                                    |
| **Persistence**    | IndexedDB (`idb`), localStorage fallback, CRC32 (bozulma tespiti, güvenlik değil), 3'lü yedek rotasyonu, JSON dışa/içe aktarma.                                                                                                                                                                                 |
| **Deployment**     | Vercel statik. Backend yok — tek istisna 5 satırlık `/api/time` (offline saat referansı). `VITE_ASSET_BASE_URL` ile CDN çıkış yolu baştan hazır.                                                                                                                                                                |
| **Testing**        | Determinizm süiti (en kritik) · balance simülatörü CI kapısı · visual regression yalnızca Chromium + pinlenmiş container + zorunlu SwiftShader · Firefox `xvfb` · WebKit yalnızca smoke. **CI asla FPS iddia etmez.**                                                                                           |
| **Asset pipeline** | AI **statik** üretir; animasyon runtime'da parça tabanlı "Doll rig" ile (Spine ücretli, DragonBones ölü, AI kare-tutarlılığı üretemiyor). Tutarlılık sözleşmeyle: altın referanslar + değişmez prompt + 9 doğrulama + 4 tutarlılık kapısı.                                                                      |

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
| vite-plugin-pwa              | **1.3.0**    | Faz 14'te eklendi — aşağıdaki DEPENDENCY CHANGE #1                                      |

## DEPENDENCY CHANGE #1 — vite-plugin-pwa

Eski: — (yoktu)
Önerilen: 1.3.0 (exact)
Sınıf: APPROVED-FEATURE
Gerekçe: Faz 14'ün service worker'ı; onaylı stack zaten bu paketi bu sürümle adlandırıyor (TECHNICAL_ARCHITECTURE §3, RESEARCH_NOTES §1 "Faz 14+").
Kanıt: kullanıcının 2026-08-20 P14–P16 toplu yetkisi + roadmap P14 Technical Architecture ("Service worker (vite-plugin-pwa)").
Uyumluluk: peer `vite ^8` ✓ (vite 8.2.1); workbox-build/workbox-window 7.4.1 bağımlılık olarak gelir; `pnpm audit --audit-level=high` kurulumdan hemen sonra temiz.
Testler: e2e `serviceWorker.spec.ts` (kontrol + precache + offline boot), build çıktısı denetimi (sw.js öz-yeterli, health.json precache dışı).
Onay: onaylandı — 2026-08-20 (batch yetkisi kapsamında).

**Faz sonunda gerçekleşen sürümler:** (Faz 1 bitişinde doldurulacak — lockfile'dan)

---

## 5. Phase State

| Faz                     | Durum                | Başlangıç  | Bitiş      | Commit/PR                 | Kapı                    | Kanıt                                                                                                                                        |
| ----------------------- | -------------------- | ---------- | ---------- | ------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 Research & Design    | ✅ TAMAMLANDI        | 2026-08-14 | 2026-08-14 | (pre-repo)                | **GATE 0 ✅ ONAYLANDI** | 8 doküman, ~55k kelime                                                                                                                       |
| P1 Foundation           | ✅ TAMAMLANDI        | 2026-08-14 | 2026-08-14 | PR #1, main `cbdaef4`     | **GATE 1 ✅ ONAYLANDI** | [PHASE_1_REPORT](phases/PHASE_1_REPORT.md)                                                                                                   |
| P2 Sim Core             | ✅ TAMAMLANDI        | 2026-08-14 | 2026-08-15 | PR #8, main `4643d88`     | Batch içi kapı ✅       | [PHASE_2_REPORT](phases/PHASE_2_REPORT.md)                                                                                                   |
| P3 Iso Render           | ✅ TAMAMLANDI        | 2026-08-15 | 2026-08-15 | main `a60b641`            | Batch içi kapı ✅       | [PHASE_3_REPORT](phases/PHASE_3_REPORT.md)                                                                                                   |
| P4 Asset Pipeline v1    | ✅ TAMAMLANDI\*      | 2026-08-15 | 2026-08-15 | `phase/04-asset-pipeline` | Batch içi kapı ✅       | [PHASE_4_REPORT](phases/PHASE_4_REPORT.md) — pipeline ✅; sanat 2026-08-18 konsolidasyonda entegre (ADR-013)                                 |
| P5 Traffic              | ✅ TAMAMLANDI        | 2026-08-15 | 2026-08-15 | `phase/05-traffic`        | Batch içi kapı ✅       | [PHASE_5_REPORT](phases/PHASE_5_REPORT.md) — yoğunluk çelişkisi #7 hâlâ açık                                                                 |
| P6 Customer             | ✅ TAMAMLANDI        | 2026-08-15 | 2026-08-15 | `phase/6-customer-system` | Batch içi kapı ✅       | [PHASE_6_REPORT](phases/PHASE_6_REPORT.md)                                                                                                   |
| P7 Navigation           | ✅ TAMAMLANDI        | 2026-08-15 | 2026-08-15 | `phase/7-navigation`      | Batch çıkış kapısı ✅   | [PHASE_7_REPORT](phases/PHASE_7_REPORT.md)                                                                                                   |
| P8 Service Loop         | ✅ TAMAMLANDI        | 2026-08-15 | 2026-08-15 | PR #17 (açık)             | Batch içi kapı ✅       | [PHASE_8_REPORT](phases/PHASE_8_REPORT.md)                                                                                                   |
| P9 Economy v1           | ✅ TAMAMLANDI        | 2026-08-15 | 2026-08-15 | PR #17 (açık)             | Batch içi kapı ✅       | [PHASE_9_REPORT](phases/PHASE_9_REPORT.md) — vertical slice insan ölçütleri açık                                                             |
| P10 Employee AI         | ✅ TAMAMLANDI        | 2026-08-15 | 2026-08-15 | PR #17 (açık)             | Batch çıkış kapısı ✅   | [PHASE_10_REPORT](phases/PHASE_10_REPORT.md)                                                                                                 |
| P11 Evolution           | ✅ TAMAMLANDI        | 2026-08-16 | 2026-08-16 | `phase/11-evolution`      | Batch içi kapı ✅       | [PHASE_11_REPORT](phases/PHASE_11_REPORT.md)                                                                                                 |
| P12 Balancing           | ✅ TAMAMLANDI        | 2026-08-16 | 2026-08-16 | `phase/11-evolution`      | Batch içi kapı ✅       | [PHASE_12_REPORT](phases/PHASE_12_REPORT.md) — `CALIBRATED_STAGES=[1]`                                                                       |
| P13 Upgrade v2          | ✅ TAMAMLANDI        | 2026-08-16 | 2026-08-16 | `phase/11-evolution`      | Batch çıkış kapısı ✅   | [PHASE_13_REPORT](phases/PHASE_13_REPORT.md)                                                                                                 |
| — Konsolidasyon (sanat) | ✅ TAMAMLANDI        | 2026-08-18 | 2026-08-19 | `phase/consolidation-art` | Yönerge kapısı ✅       | [ASSET_INTEGRATION_REPORT](ASSET_INTEGRATION_REPORT.md) · [FINAL_PRE_NEXT_BATCH_REPORT](FINAL_PRE_NEXT_BATCH_REPORT.md) — CI yeşil `d720a3f` |
| **P14 Offline**         | 🟦 **YÜRÜTÜLÜYOR**   | 2026-08-20 | —          | `phase/14-offline`        | Batch içi kapı          | —                                                                                                                                            |
| P15 Events/Weather      | 🟨 Yetkili, sırada   | —          | —          | —                         | Batch içi kapı          | —                                                                                                                                            |
| P16 Asset v2            | 🟨 Yetkili, sırada   | —          | —          | —                         | **BATCH ÇIKIŞ KAPISI**  | —                                                                                                                                            |
| P17–P24                 | ⬜ Yetkilendirilmedi | —          | —          | —                         | —                       | —                                                                                                                                            |

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

### BATCH 8–10 · CHECKPOINT R — Batch başlangıcı (2026-08-15)

**Yetkilendirme:** P8 → P9 → P10 tek batch, otonom, **aralarda onay beklenmeyecek**, P10 sonrası
DUR. P11+ yetkisiz.

| Ne              | Değer                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| main SHA        | `3d3b036` (P7 merge)                                                             |
| Batch başlangıç | `964705e` üzerinde `phase/8-service-loop`                                        |
| Testler         | 969 → **1 008**                                                                  |
| Sanat           | **Kullanıcı 172 görseli dışarıda üretiyor.** Hiçbir faz/test sanata bloke değil. |

**Sanat kuralı, kullanıcı direktifi:** eksik sanat hiçbir fazı bloke etmez, sahte prosedürel sanat
"nihai" diye sunulmaz, batch sırasında yükleme istenmez. Görsel insan yargısı gerektiren DoD
maddeleri **"NOT JUDGED: AWAITING EXTERNAL ART"** olarak işaretlenir; mekanik ölçütler geçtiyse faz
**teknik PASS** sayılır.

### BATCH 8–10 · CHECKPOINT U — P10 tamamlandı, BATCH BİTTİ (2026-08-15) ✅ PASS (teknik)

Oyuncu artık aşçı değil, yönetici. Bir aşçı tutuluyor ve **hiç tıklamadan** para
kazanılıyor: aynı seed'de 20 dakikada **elle 29 müşteri, aşçıyla 30**.

| Kanıt         | Değer                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| Testler       | **1 131** (P9 sonunda 1 076)                                            |
| E2E           | **104** (chromium + firefox) — staffFlow 14, verticalSlice 6            |
| Staffed tick  | **0.216 ms** p95 (8 çalışan + 60 yaya + 120 araç) — bütçe 3.0 ms        |
| Ayırma        | **1.39 B/tick** — bütçe 32 B                                            |
| Save şeması   | **v7** — v6→v7 migration + gerçek kadro taşıyan `save-v7.json`          |
| `pnpm verify` | ✅ baştan sona temiz                                                    |
| DoD           | 15'te 14 — 15. madde "çalışanlar niyetli görünüyor mu" **yargılanmadı** |

**Işınlanma yok** — sert gereksinim, test yeşil: 4 çalışan, 4 farklı yetenek, 30
simüle dakika, **her tick'te her pozisyon kaydediliyor**, her adım
`walkSpeed × TICK_MS × 1.001` ile sınırlı. Varış da yürünüyor, ışınlanmıyor.

**TaskBoard'da bir gate'in yakaladığı üç kusur:**

1. `post()` sipariş döngüsünün _içinde_ `nextStartable` çağırıyordu → O(n²) → mevcut
   bir birim testi milisaniyeden **153 saniyeye** çıktı.
2. Bunu düzelten `Set`, her tick temizlenip dolduruluyordu → **123 B/tick**, bütçe 32 B.
   Artık tick damgalı düz `Int32Array`; hiçbir şey temizlenmiyor, hiçbir şey ayrılmıyor.
3. Ayrı raporlanan **%44 yavaşlama aynı `Set`'ti** — iş değil, çöp toplama basıncı.
4. Ve dördüncüsü: kadro boşken bile tam tarama yapılıyordu (**populated tick'in %57'si**),
   yani her Aşama 1 oturumunda. Artık kadro ve pano boşsa hemen dönüyor.

**Dürüst bulgular:**

- Aşçı vardiyanın **%98'i BLOCKED**. Kusur değil, Aşama 1 hacmi hakkında bir ifade:
  1.8 müşteri/dk'da bir aşçının 30 saniyede ~1 saniyelik işi var. Sanat ne olursa
  olsun %98 hareketsiz duran biri "jeton" gibi görünecek — çözüm animasyon değil,
  daha fazla iş (Aşama 2/3).
- **Garson ve temizlikçi implement edildi, test edildi, yapacak işleri yok.** Roadmap'in
  kendi kapsam kararı. Temizlikçinin masası yok; garsonun taşıyacağı tabak yok çünkü
  pass hiç dolmuyor.
- **"Pass hiç dolmuyor" artık üç fazda üç özelliği bloke etti**: P8 pass tabağı, P9
  soğutucu, P10 garson. Bu bir örüntü, tesadüf değil — **karar gerekiyor**.

### BATCH 8–10 · CHECKPOINT T — P9 tamamlandı (2026-08-15) ✅ PASS (mekanik) · ⚠️ SLICE KAPISI AÇIK

Oyunda ilk **karar** var: para kazanılıyor ve altı yükseltmeden birine yatırılıyor.
Her biri simülasyonun okuduğu bir sayıyı değiştiriyor, dünyaya bir nesne koyuyor ve
sonraki yirmi dakikayı değiştiriyor.

| Kanıt         | Değer                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| Testler       | **1 076** (P8 sonunda 1 008)                                                |
| E2E           | **90** (chromium + firefox) — upgradeFlow 16, verticalSlice 6               |
| Visual golden | **11** — `upgrades-before` / `upgrades-after` çifti eklendi                 |
| Service tick  | **0.238 ms** p95 — bütçe 2.8 ms                                             |
| Save şeması   | **v6** — v5→v6 migration + gerçek satın alma taşıyan `save-v6.json` fixture |
| `pnpm verify` | ✅ baştan sona temiz                                                        |
| DoD           | 15'te 14 — 15. madde kapının kendisi                                        |

**★ VERTICAL SLICE KAPISI: 8 ölçütün 2'si kanıtlandı, 5'i İNSAN YARGISI BEKLİYOR.**

| #          | Ölçüt                                      | Durum                                                                                            |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 6          | 30 dk sıfır hata, sızıntı yok              | ✅ 30 simüle dk: **0 konsol hatası**, heap **21.7 → 21.7 MB (%0.0)**                             |
| 7          | Kaydet → yenile → geri yükle               | ✅ idempotent; **kapsam notu**: geçici trafik kasten kaydedilmiyor (TECHNICAL_ARCHITECTURE §8.1) |
| 5          | Gerçek cihazda FPS                         | ⚠️ **ÖLÇÜLMEDİ** — CI FPS ölçemez, gerçek cihaz koşusu yapılmadı, iddia edilmiyor                |
| 1, 2, 3, 8 | Oturum, anlaşılırlık, karar, tekrar oynama | ⚠️ **PENDING HUMAN REVIEW** — 3 kişi gerekiyor                                                   |
| 4          | Ekran görüntüsü tür üstünde                | ⚠️ **BUGÜN İMKÂNSIZ** — ekrandaki her aktör magenta dama tahtası                                 |

Kullanıcının yürütücü kararıyla mekanik ölçütler geçtikten sonra P10'a geçildi.
**Kapı "geçti" ilan edilmiyor** — GDD onu "pazarlığa kapalı" diye tanımlıyor; ertelendi
ve bekleyen beş yargı yukarıda tek tek yazılı.

**Üç açık madde:**

1. **ECONOMY_DESIGN §6.2 tablosu birebir okunamıyor.** Görünürlük satırı `L1 = 1.30`
   (L = satın alma sayısı), hız satırı `0.80^(L−1)` ile `L1 = 1.00` (yani ilk satın
   alma hiçbir şey yapmıyor — §6.3 bunu yasaklıyor). `0.80^level` seçildi, %20 kesinti.
   **Hangi satırın değişeceği bir tasarım kararı.**
2. **Soğutucu atıl.** Etkisi gerçek ve test edilmiş; Aşama 1'de hiçbir oyuncunun
   hissedemeyeceği bir etki, çünkü pass hiç dolmuyor (P8 §6). Faz 10'da canlanır ve
   bunu bir test bekliyor.
3. **P8'in verim çelişkisi hâlâ açık.** Tabela tavanı 1.8 → ~2.3/dk'ya çıkarıyor,
   tam yükseltilmiş tabela ~3.2'ye. Roadmap'in "3/dk" ölçütü **ilk dakikadan mı**
   yoksa **yatırımdan sonra mı** kastediliyor — karar hâlâ kullanıcının.

**Kaydetme kapsamı, kapının görmesi gereken:** geçici durum (yoldaki araçlar, yürüyen
müşteriler, yarım siparişler) kasten kaydedilmiyor. Oyuncu servis ortasında kaydedip
yeniden yüklerse yol boşalıp birkaç saniyede doluyor. Tasarım böyle; kusur değil ama
oyuncunun fark edeceği bir şey.

### BATCH 8–10 · CHECKPOINT S — P8 tamamlandı (2026-08-15) ✅ PASS (teknik)

Döngü kapandı. Araba yavaşlar → park eder → yürür → sipariş verir → oyuncu pişirir → teslim →
yer → **öder** → HUD'daki nakit artar. Oyun ilk kez oynanabilir.

| Kanıt         | Değer                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Testler       | **1 008** (P7 sonunda 907/969)                                         |
| E2E           | **68** (chromium + firefox) — 4 yeni servis testi                      |
| Visual golden | **9** — `stage1-serving` yeni; `stage1-queue` **yeniden türetildi**    |
| Service tick  | **0.185 ms** p95 (120 araç + 40 yaya + 20 sipariş) — bütçe 2.8 ms      |
| Ayırma        | **4.83 B/tick** — bütçe 32 B                                           |
| 10 dk ölçüm   | 195 gelen · 21 dönüşüm · 18 servis · **0 terk** · **0 israf** · ₡52.34 |
| `pnpm verify` | ✅ baştan sona temiz                                                   |
| DoD           | 15'te 14 — §11 "döngü tatmin edici mi?" **yargılanmadı, sanat yok**    |

**Bulunan 7 gerçek kusur** (hepsi ölçümle, hiçbiri çökmeyle): sipariş sızıntısı (30 canlı sipariş /
4 müşteri), herkesin aynı anda sipariş vermesi, bekleme alanı yokluğu (7.9 cm), araç çakışması
(4 cm), sıfır tick süren sipariş anı, **overlay'in bir kez çizilip donması** (Svelte referans
karşılaştırması), **projektöre var olmayan sahne adı verilmesi** (`WorldScene` ≠ `world` → hiçbir
dünya işareti görünmüyordu, hata da vermiyordu). Ayrıntı: PHASE_8_REPORT §4.

**Perf baseline yeniden kaydedildi** (`964705e`): populated tick %18 yavaşladı. **Değiştirerek
atfedildi** — `enforceGaps` kapatıldı, fark sürdü; üç yeni sistem no-op ile değiştirildi, fark
tamamen kayboldu. Yani üç sistemin maliyeti. Mutlak bütçelerin hepsi bir kat pay ile geçiyor.

**Sarılmış-sistem profilcisi çöpe atıldı:** 189 µs/tick raporladı, gerçek 15 µs/tick. Harness
ölçtüğünün %92'siydi. PERF_LOG'a bu da yazıldı.

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

### BATCH 5–7 · CHECKPOINT Q — P7 tamamlandı, BATCH BİTTİ (2026-08-15) ✅ PASS

Yayalar yürüyor: layout'tan üretilen grid, hedef başına flow field, steering,
kuyruk slotları, A* fallback, prosedürel yürüyüş. **500 senaryo × 2 000 tick
deadlock testi temiz.**

| Kanıt          | Değer                                                |
| -------------- | ---------------------------------------------------- |
| Testler        | **907** (P6 sonunda 834) · branches %87.8            |
| Kalabalık tick | **0.234 ms** p95 (60 yaya + 120 araç) — bütçe 2.5 ms |
| Flow field     | **9.75 ms** (64×64 × 20 hedef) — bütçe 12 ms         |
| Deadlock       | 500 senaryo, 0 kilitlenme                            |
| Rapor          | [PHASE_7_REPORT.md](phases/PHASE_7_REPORT.md)        |
| Batch raporu   | [BATCH_5_7_REPORT.md](phases/BATCH_5_7_REPORT.md)    |

**Kaçırılan bütçe — üç turda çözüldü, hiçbiri bütçeyi oynatarak değil.**
Roadmap'in yazdığı ölçekte (64×64, 20 hedef) tam yeniden hesaplama **42.9 ms**,
bütçe 12 ms. Roadmap'in kendi B planı: "gerekirse hedef başına kareler arasına
böl, **ama önce ölç**". (1) Ölçüm maliyeti en iç döngüdeki tuple destructure'da
buldu (~650 000 kez/yeniden hesaplama) → düz typed array'lerle **9.8 ms**,
yerelde geçti. (2) **CI 19.7 ms ölçtü** — bu normalize edilecek bir ölçüm hatası
değil, "bazı makinelerde eşiği aşıyor" demenin dürüst hâli. (3) Bu yüzden
**bölündü**: tick başına bir hedef, kare başına en fazla **0.46 ms**. Eski
alanlar kuyruk boşalırken silinmiyor — bayat, yanlış değil.

**Ölçümle bulunan beş kusur** (PHASE_7_REPORT §4). En sessiz ikisi: park
kapıları araç merkezinden 1.2 m'ye yazılmıştı — araç 1.9 m geniş, 0.5 m grid
ikisini aynı hücreye yuvarlıyor, yani **müşterinin indiği nokta kendi arabası
tarafından dolu işaretleniyordu**; ve kuyruk dolduğunda yer bulamayan herkes
tezgâha yürütülüyordu, otuz yaya senaryosunda on beş kişi **aynı noktada** üst
üste yığıldı (en yakın mesafe 2.2 cm).

**Kanıtla reddedilen iki fikir** — kodda kayıtlı, aynı fikri tekrar deneyen
ölçümü bulsun diye: (1) çakışma düzeltmesine tick başına tavan koymak ayırmayı
kötüleştirdi (29 cm → 6 cm) ve hiçbir pürüzsüzlük kazandırmadı; (2) kuyruğu son
slotun ötesine uzatmak — gerçek kuyrukların yaptığı şey — bu layout'ta yanlış,
çünkü Aşama 1 kuyruğu **kasten yola doğru** bakıyor (spillover mekaniği), yani
uzatma insanları trafiğe yürütüyor ve kaldırıma yığıyor: 40 kat daha kötü.

**Yapılmayan yargı — dürüstçe:** roadmap "30 yayanın kalabalık girişte insan gibi
mi yoksa parçacık gibi mi göründüğünü doğrula" diyor. Üretim sanatı yok, bu yargı
**verilmedi**. Ölçülenler: en yakın yaklaşma 0.29 m, kişisel alan ihlali %0.25,
0 deadlock — ve **görünür adımların %57'sinin yön değiştirmesi**, ki bu iyi bir
sayı değil ve öyle raporlandı. İki mekanizma bulunup düzeltildi, sayı çok az
oynadı; metriğin kendisine de güvenilmiyor (1 piksel = 2.9 cm ve bir kişinin
ayağını kaydırması tam bir yön değişimi sayılıyor). Sanat geldikten sonra
izlenerek karara bağlanmalı.

**Perf altyapısı bu batch'te beş ayrı kusurdan arındırıldı** (BATCH_5_7 §5). En
öğreticisi: kalibrasyon saf kayan nokta aritmetiğiydi, normalize ettiği işler ise
belleği tarıyordu — yerelde kaydedilen baseline CI'ı %19 yavaş, CI'da kaydedilen
baseline yereli %18 yavaş gösteriyordu, **iki makine de diğerinden yavaş
değildi**. Kalibrasyon artık aritmetik + 4 MB üzerinde adımlı yürüyüş; en kötü
makineler arası sapma %19'dan %5'e indi.

### BATCH 5–7 · CHECKPOINT P — P6 tamamlandı (2026-08-15) ✅ PASS

Döngü kapandı: araç frene basıyor, yoldan ayrılıyor, park ediyor, sürücü iniyor ve
tezgâha yürüyor. Kimse servis vermediği için sıkılıp gidiyor — **bu fazın
şartnamedeki bitiş durumu bu**, eksik değil.

| Kanıt         | Değer                                                   |
| ------------- | ------------------------------------------------------- |
| Testler       | **834** (P5 sonunda 727) · branches %88.6               |
| Dönüşüm oranı | günlük ortalama **0.087** · 20 dk ölçüm **%9.8**        |
| Perf, p95     | **11.2 µs/tick** (120 araç + 20 müşteri) — bütçe 2.2 ms |
| Tahsis        | 11.1 B/tick — bütçe 32                                  |
| Save şeması   | **v4 → v5**, migration + sıfır olmayan `save-v5.json`   |
| Rapor         | [PHASE_6_REPORT.md](phases/PHASE_6_REPORT.md)           |

**Ölçümle bulunan yedi kusur** (hepsi PHASE_6_REPORT §3). En ciddi ikisi:

_Girişi engel olarak modellemek yolu kilitledi._ IDM duruş boşluğu tuttuğu için
kararını vermiş araç dönmek istediği yerin **2.4 m gerisinde** durdu ve sonsuza
kadar sıfır hızda frenledi; arkasında iki şerit de tıkandı. Yirmi simüle dakikada
spawn sayısı ~2 400'den **108**'e düştü. Giriş, uzak durulacak bir engel değil,
_varılacak_ bir nokta — ve bu ikisinden yalnızca birinin minimum boşluğu var.
Kinematiğe çevrildi (`v² = u² + 2as`).

_Sabır hiç başlamadı._ `SEEKING_PARKING` bekleme durumu olarak işaretliydi ama
saatini kimse kurmuyordu; sıfırdan başladığı için **her müşteri vardığı tick'te
vazgeçti** — on dakikada 17 dönüşüm ve tek bir park eden araç yok. Süre artık
durumun kendi tanımında; "sabırsız bekleme durumu" ifade edilemez hâle geldi.

**Tick dört sistem eklenmesine rağmen %44 ucuzladı.** Her sistem her tick'te
mağazayı canlı varlık aramak için tarıyordu; 160 kapasitede bir düzine araçla bu
taramanın %90'ı hiçbir şey bulmakla geçiyordu. `scanLimit` (en yüksek canlı
slot + 1) bunu kaldırdı.

**Yapılmayan yargı — dürüstçe:** roadmap bu fazın kapanış şartı olarak "20 dönüşüm
izle ve anın oturup oturmadığını doğrula" diyor. Üretim sanatı olmadığı için
(PHASE_4_REPORT §11) ekrandaki her aktör magenta dama tahtası ve gerçek boyutunun
üç katı. **Bu yargı verilmedi.** Yerine yargının dayanacağı mekanikler ölçüldü:
karardan dönüşe ortalama **5.61 m/s** hız düşüşü, **3.88 s** yavaşlama süresi,
arkadaki trafiğin frenlediği **334** kare. Sanat geldikten sonraki ilk fazda
yeniden ele alınmalı.

### BATCH 5–7 · CHECKPOINT O — P5 tamamlandı (2026-08-15) ✅ PASS

Önce KISMİ raporlandı; iki DoD maddesi **kullanıcı kararıyla** çözüldü ve uygulandı.
Kayıt "geçersiz kılındı ve uygulandı" diyor, "sessizce sağlandı" demiyor.

| Kanıt       | Değer                                                        |
| ----------- | ------------------------------------------------------------ |
| Testler     | **727** · branches %89+                                      |
| CI          | **15/15 yeşil** — PR #13                                     |
| Bundle      | 414 kB gzip / 550 kB                                         |
| Save şeması | **v2 → v3 → v4**, her biri migration + commit'li fixture ile |
| Rapor       | [PHASE_5_REPORT.md](phases/PHASE_5_REPORT.md)                |

**Karar 1 — dekoratif trafik (seçenek B).** Ekonominin 24 araç/dk dönüşebilir talebi
değişmedi; yola dönüşemeyen ama süren, frenleyen, dalga yayan araçlar eklendi.

|                            |  önce |     sonra |
| -------------------------- | ----: | --------: |
| yolda ortalama araç        |  1.05 |  **2.05** |
| yol tamamen boş            | %40.9 | **%14.6** |
| takipçi bulunan tick oranı |   ~%0 | **%36.6** |

Tek işaretlenmiş süreç yerine **iki bağımsız Poisson süreci**: paylaşılan süreç
reddedilenleri de paylaşıyor ve tıkanıklık — dekoratif katmanın bütün amacı —
dönüşebilir talebi 24'ten **7.3/dk**'ya düşürdü. Ayrıca dekoratif trafiğe daha
büyük giriş boşluğu (28 m / 12 m) verildi; yoksa iki saniye önce giren dekoratif
araç zaten şerit başını tutuyor.

**Dürüst yargı:** belirgin biçimde daha iyi ama "yoğun trafik" değil. Tepe saatte
2–3 araç. 36 m şerit 13.9 m/s'de toplam ~45 araç/dk taşıyor ve bunun 24'ü
dönüşebilir kalmak zorunda, yani ~2 ortalama doluluk bu yolun tavanı.

**Ve ortaya çıkan asıl bulgu:** yol 24 araç/dk'yı **hiçbir zaman teslim etmedi.**
Dekoratif trafik yokken bile 21.2/dk idi (varışların ~%12'si şerit başı doluyken
reddediliyor); şimdi 19.5/dk. Ekonomi 24'e göre kalibre; yol 19.5 veriyor. Faz 9
bunu bilerek kalibre etmeli.

**Karar 2 — tahsis bütçesi 8 → 32 B/tick.** Uygulandı. **Sonra CI aynı commit'te
7.4 B/tick ölçtü.** 29 B/tick tek bir geliştirici makinesinin V8'inin özelliğiymiş,
kodun değil — üç bisect turunun kaynağı bulamamasının sebebi de buymuş: bulunacak
bir tahsis yoktu. Tavan yerinde kaldı (kapının kimin makinesinde koştuğuna bağlı
olmasını engelliyor), ama kodu tanımlayan sayı CI'ın 7.4'ü.

**Bunu düzeltirken çok daha önemli bir kusur çıktı:** regresyon kapısı paylaşılan
CI runner'larında **hiç çalışamıyordu.** CI'da kaydedilen baseline, aynı commit
altı dakika sonra CI'da tekrar koştuğunda kendini **%47–68 yavaş** raporladı.
25 örneğin minimumu scheduler gürültüsünü siliyor ama farklı bir CPU'yu silemiyor.
Artık her ölçüm aynı süreçte koşan bir **kalibrasyon iş yüküne bölünüyor** — makine
hızı sadeleşiyor. %15 eşiği değişmedi; yalnızca karşılaştırılan büyüklük
karşılaştırılabilir olacak şekilde seçildi. Doğrulaması: dizüstünde kaydedilen
baseline artık CI'da geçiyor.

**Zaman ölçeği kararı hâlâ açık** — yoğunluk engeli kalktı, ama bu roadmap'in
açıkça _insana_ bıraktığı, oynayarak verilecek bir yargı. Ajanın hüküm vermesi
tam da o talimatın önlemek istediği şey olurdu.

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
| 7   | ⚠ **Roadmap P8 "60 sn'de ≥3 müşteri" ile ECONOMY_DESIGN §3 dönüşüm oranı 0.09 çelişiyor**            | Tavan **1.8 müşteri/dk**; mutfak değil yol darboğaz. Roadmap metriği Aşama 1'de erişilemez                         | 🔴 **AÇIK ÇELİŞKİ — kullanıcı kararı gerekiyor** — aşağıya bak                                            |
| 8   | ⚠ **Aşama 1'de pass hiç dolmuyor** — teslim otomatik ve aynı tick'te oluyor                          | Üç faz, üç bloke özellik: P8 pass tabağı, P9 soğutucu, P10 garson                                                  | 🔴 **KARAR GEREKİYOR** — aşağıya bak                                                                      |

### 🔴 KARAR GEREKİYOR #8 — Aşama 1'de pass hiç dolmuyor (P8'de ölçüldü, P10'da örüntü oldu)

**Ölçüm:** 24 000 tick'te **0 tick** pass'te tabak bekledi. `KitchenSystem` tabağı pass'e
koyuyor, `ServiceSystem` bir yuva sonra **aynı tick'te** teslim ediyor. Aşama 1'de garson
yok, teslim otomatik — tasarım böyle.

**Sonuç: üç fazda üç özellik atıl.**

| Faz | Özellik                           | Durum                                                 |
| --- | --------------------------------- | ----------------------------------------------------- |
| P8  | Pass tabağı + sıcaklık göstergesi | Yazıldı, test edildi, **oyuncu hiç göremiyor**        |
| P9  | Soğutucu yükseltmesi              | Etkisi gerçek ve ölçülü, **oyunda hiç tetiklenmiyor** |
| P10 | Garson rolü                       | Implement + test, **taşıyacak tabak yok**             |

Ayrıca sıcaklık düşüşü mekaniği — GAME_EXECUTION_ROADMAP'in "bunu şimdi doğru yap"
dediği şey — hiç ısırmıyor.

**İki olası yol, karar kullanıcının:**

1. **Aşama 1 teslimi anlık olmaktan çıkar.** Örneğin oyuncunun tabağı alması bir
   `MANUAL_SERVE` gerektirir, ya da `ServiceSystem` bir tick geciktirilir. Üç özellik
   de anında canlanır; Aşama 1'in "oyuncu aşçı" kimliğine "oyuncu garson" eklenir.
2. **Faz 11'e kadar atıl bırakılır.** Faz 11 masaları getiriyor; masa varsa tabak
   masaya taşınır ve üçü de kendiliğinden canlanır. Bu durumda P8/P9/P10'da yazılan
   üç şey üç faz boyunca ölü kod olarak durur.

**Bu fazda yapılan:** hiçbiri seçilmedi. Üç yerde de kod doğru, test edilmiş ve atıl
olduğu **testle** kayıtlı — P9'un soğutucu testi pass'in boş olduğunu iddia ediyor ve
Faz 10 masaları getirdiğinde **kırılacak**, ki bu kırılma sinyalin kendisi.

### 🔴 AÇIK ÇELİŞKİ #7 — P8 verimlilik hedefi ekonomiyle uyuşmuyor (Faz 8'de ölçüldü, 2026-08-15)

**Aritmetik, varsayım değil:**

```
GAME_EXECUTION_ROADMAP Faz 8  : "60 saniyede en az 3 müşteri servis ediliyor"  → 3.0 /dk
ECONOMY_DESIGN §3             : Aşama 1 dönüşüm oranı, sıfır yükseltme        → 0.09
PHASE_5_REPORT §4             : yoldan geçen dönüştürülebilir araç            → ~19.5 /dk
                                                        19.5 x 0.09 = 1.755 /dk
```

**Ölçüm (seed 424242, 10 dk, dikkatli aşçı):**

| Nicelik                 | Değer      |
| ----------------------- | ---------- |
| Dönüştürülebilir geliş  | 195        |
| Dönüşüm başarılı        | 21         |
| Park yok, geri çevrilen | 2          |
| **Servis edilen**       | **18**     |
| Terk eden               | **0**      |
| İsraf                   | **0**      |
| Nakit                   | **₡52.34** |

**Mutfak darboğaz değil.** Tezgâha ulaşan 19 kişinin 18'i servis edildi, kimse beklemekten
vazgeçmedi, hiç yemek çöpe gitmedi. Kısıt tamamen yolun yukarısında.

**Bu tasarımın çalışıyor olması da mümkün:** Aşama 1'in müşteri kıtlığı çekmesi kasıtlı olabilir ve
Faz 9'un ilk iki yükseltmesi (el yapımı tabela, yol kenarı işareti) tam da dönüşümü artırıyor.

**Üç olası çözüm — karar kullanıcınındır, sessizce seçilmedi:**

1. Roadmap metriği "yükseltme sonrası" olarak yeniden yazılır (P9 sonrası ölçülür).
2. ECONOMY_DESIGN §3'ün 0.09'u yükseltilir — ama bu tüm Aşama 1 dengesini kaydırır.
3. Yol yoğunluğu artırılır — AÇIK ÇELİŞKİ (trafik yoğunluğu) ile aynı kutuya düşer.

**Bu fazda yapılan:** testler ekonominin izin verdiğini iddia ediyor, çelişki testin içine kelimesi
kelimesine yazıldı, hiçbir sabit "yeşil olsun diye" oynatılmadı. → PHASE_8_REPORT §5

### ✅ ÇÖZÜLDÜ (2026-08-21) — ÇELİŞKİ #4: Phaser 4 WebGL2 kullanmıyor (Faz 3'te ölçüldü, 2026-08-15)

> **Karar: ADR-017 Seçenek A kabul edildi (kullanıcı, 2026-08-21).** Kapı artık motorun
> gerçekten açtığı bağlamı — WebGL 1 — sınar (`no-webgl2` → `no-webgl`); WebGL'i hiç olmayan
> tarayıcı Kademe C ekranını görmeye devam eder. Yaşayan tüm dokümanlar aynı gün güncellendi;
> aşağıdaki ölçüm ve çelişki dökümü tarihsel kayıt olarak duruyor.

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

### Konsolidasyon güncellemesi (2026-08-18)

- **AÇIK ÇELİŞKİ #4 (WebGL1/WebGL2) artık ölçümlü:** canlı canvas'ta `canvasIsWebgl2:false / canvasIsWebgl1:true`, tarayıcı WebGL2 sunarken. Kapı WebGL2 istiyor, motor WebGL1 kullanıyor → WebGL1-only tarayıcılar oynayabilecekleri oyundan çevriliyor. Karar seçenekleriyle **ADR-017 (Proposed)** yazıldı; CLAUDE.md gereği kapıya ve dört dokümana **dokunulmadı**. Kullanıcı kararı bekliyor.
- **Ortalama sepet (§8.1) KAPANDI** — ADR-016 sepet modeli; iki DEĞERLENDİRİLEMEZ assertion değerlendirilebilir oldu, Aşama 3 zamanlaması ilk ölçümde yeşil.
- **Evrim mahsur bırakma KAPANDI** — ADR-014 işletme rezervi; ₡804 senaryosu birebir regresyon testi olarak kapıda.
- **Idle oyuncu KAPANDI** — ADR-015; ürün sınıfı belgelerden türetildi, §13 değişiklik kontrolüyle düzeltildi, dikkat merdiveni ölçüldü.
- **Yeni açık:** Aşama 2-4 gelir kalibrasyonu hiç yapılmadı (P12 yalnız Aşama 1'i ayarlamıştı; sepet öncesi aritmetik engel bunu gizliyordu). `CALIBRATED_STAGES=[1]` — kalibre edilmemiş satırlar kapıda ölçülüp raporlanıyor. İlk ölçümler: A3 tepe ₡66/dk (tasarım tavanı 179), A4'e varış 371-379 dk (pencere ≤320), A2 girişinde dead-end 166 s. Trafik yoğunluğu kararıyla (AÇIK ÇELİŞKİ #7) birlikte sonraki ekonomi pasosunun girdisi.
- **Drive-thru şeridi gerçek araç ölçeğine yeniden yerleşti** (1.5 m aralık → 5.5 m; şerit içi 2 araç + yolda görünür kuyruk). Dört-araçlık tam şerit, arsa/teras yeniden tasarımı istiyor — devralınan borç, ASSET_INTEGRATION_REPORT §4.

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

### Faz 8 ölçümleri (2026-08-15, bu makine, `pnpm bench:sim`, kalibrasyon 0.9124 ms)

| Yük                                                 |  Bütçe |     Ölçülen p95 | Bütçenin |
| --------------------------------------------------- | -----: | --------------: | -------: |
| populated tick — 120 araç + 20 müşteri (Faz 6)      | 2.2 ms |    **0.113 ms** |     %5.1 |
| crowded tick — 120 araç + 60 yaya (Faz 7)           | 2.5 ms |    **0.339 ms** |    %13.5 |
| service tick — 120 araç + 40 yaya + 20 sipariş (F8) | 2.8 ms |    **0.185 ms** |     %6.6 |
| Tahsis                                              |   32 B | **4.83 B**/tick |    %15.1 |
| JS bundle (gzip)                                    | 550 kB |   **428.97 kB** |    %78.0 |
| CSS bundle (gzip)                                   |  30 kB |     **2.19 kB** |     %7.3 |

Baseline `964705e`'de yeniden kaydedildi; populated tick %18 yavaşladı ve bu **değiştirerek**
üç yeni Faz 8 sistemine atfedildi (PHASE_8_REPORT §7.1). Yukarıdaki tablonun üstündeki eski
satırlar Faz 2 dönemine aittir ve tarihsel olarak bırakılmıştır.

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

|                              |                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline                     | ✅ **KURULDU** (Faz 4) — `tools/asset-pipeline/`: validate (9 kontrol) · process · atlas · audio · manifest · report · contactSheet. CI'da `assets` job'ı olarak koşuyor.                                                                                                                                                                                  |
| Palet                        | ✅ `docs/assets/palette.json` — 48 renk, 12 rampa × 4 basamak. Renk körlüğü simülasyonu testte.                                                                                                                                                                                                                                                            |
| Prompt bloğu                 | ✅ `docs/assets/PROMPT_BLOCK.md` v1 — SHA-256 `1c4f4b4e…`, testle zorlanıyor.                                                                                                                                                                                                                                                                              |
| Konu boyutları               | ✅ `docs/assets/subjectDimensions.json` — her konu **metre** cinsinden (nesneler hakkında olgu), sprite boyu/anchor/bölme kararı `tools/shared/spriteMetrics.ts` ile **türetiliyor**. Piksel yüksekliği elle yazılmıyor.                                                                                                                                   |
| Batch listesi                | ✅ `docs/assets/productionBatches.json` — 12 batch, 172 asset. `pnpm assets:prompts` gönderilecek metni üretiyor.                                                                                                                                                                                                                                          |
| **Lisans durumu**            | 🟠 **Yönetici kararıyla açıldı** (2026-08-15, [assets/LICENSES.md](../assets/LICENSES.md) §1.5) — God Mode AI, madde 5 ve 8 bilinçli kabul. MVP kapsamlı; Faz 16 ve Faz 23'te yeniden açılacak. Kapı "geçti" değil, "karar verildi".                                                                                                                       |
| **Üretim asset'i**           | ✅ **172/172 entegre (2026-08-18, konsolidasyon).** Kaynak: `docs/assets/sources` (153 MB drop, gitignore'lu) → `assets:import` (yeni aşama) → `assets/source` commit'li. `172 asset, 0 failing, 60 kabul edilmiş istisna, 17 off-family uyarı` (ADR-013).                                                                                                 |
| Placeholder sayısı           | **Üretim ekranlarında 0** — `data-asset-placeholders` her karede sayılıyor, `tests/e2e/productionArt.spec.ts` dört aşamada da assert ediyor. 6 üretilmiş sprite **yalnız ağ-hatası fallback'i** olarak diskte; yol yüzeyi hâlâ prosedürel (drop'ta yol dilimi yoktu).                                                                                      |
| Texture memory               | **21.13 MB / 96 MB** (decode edilmiş, 7 atlas — her sayfa içeriğine göre küçültülmüş power-of-two). Fill oranı ADR-013 ile _raporlanıyor_, bellek toplamı _zorlanıyor_.                                                                                                                                                                                    |
| Doğrulanmış asset kategorisi | **Hepsi** — araç (yön atama `DIRECTION_AUDIT.json` ile), karakter (5 parçalı rig — teslim edilen gövde bacaklı, "bacak" dosyaları ikinci kol çifti; 8 dosya çizilmiyor), yapı, mobilya, doğa (split çiftler), zemin bake, yemek ikonları (DOM sipariş balonu), UI ikonları (7'si off-family), fx (yüklü, tüketen emitter yok — P13 burst'leri prosedürel). |
| **Sanat borcu (regen)**      | 10 araç arka görünüşü · 8 gerçek bacak · 8 `_brake` karesi · 5 yemek ikonu · 7 UI ikonu (palet ailesine) · yol bake'i · aşama 2-4 zemin bake'leri — [ASSET_INTEGRATION_REPORT §5](ASSET_INTEGRATION_REPORT.md).                                                                                                                                            |

---

## 18. Economy State

|                        |                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Zarf durumu            | Tasarlandı ([ECONOMY_DESIGN §3](ECONOMY_DESIGN.md#3-aşama-zarfları--sistemin-iskeleti)), **kısmen ölçüldü** — Faz 8 ilk gerçek sayıları üretti |
| Menü                   | ✅ Aşama 1 üç kalem, `src/config/economy/menu.ts`, Zod ile modül yüklenirken doğrulanıyor, **append-only** (indeks dünya digest'ine giriyor)   |
| İstasyonlar            | ✅ üç istasyon + pass (kapasite 6), `src/config/economy/stations.ts`                                                                           |
| Ölçülen verim          | **1.8 müşteri/dk** (Aşama 1, sıfır yükseltme) — dönüşüm sınırlı, mutfak değil. Roadmap 3/dk istiyor → **AÇIK ÇELİŞKİ #7**                      |
| Ölçülen marj           | Nakit malzeme maliyeti düşülerek işleniyor; 10 dk'da ₡52.34, hiç zarar eden satış yok                                                          |
| Memnuniyet             | ✅ bekleme + kalite + fiyat canlı; temizlik/atmosfer/servis/erişilebilirlik **1.0 sabit**, TODO'ları fazlarıyla yazılı                         |
| Sıcaklık düşüşü        | ✅ formül birebir, 8 test — **ama Aşama 1'de hiç tetiklenmiyor** (24 000 tick'te 0 tabak pass'te bekledi). Faz 10'da canlanır                  |
| Balance simülatörü     | ⬜ P12'de                                                                                                                                      |
| **Dead-end kapısı**    | **90 sn, merge-blocking** (kanonik, D-02)                                                                                                      |
| Bilinen ayar sorunları | AÇIK ÇELİŞKİ #7 (verim hedefi) — kullanıcı kararı bekliyor                                                                                     |

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

**Son tamamlanan faz: P13 — Upgrade System v2 / tam ağaç (TEKNİK PASS) · BATCH 11–13 KAPANDI**

| Kanıt           | Değer                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testler         | **1 319** unit/integration · **5** balance · **128** E2E · **14** golden · **21** perf                                                                              |
| `pnpm verify`   | ✅ temiz (303 dosya, 155 modül, knip temiz, coverage eşikleri oynatılmadı)                                                                                          |
| Ağaç            | **30 yükseltme · 5 aile · 4 aşama**, ön koşul zincirleriyle                                                                                                         |
| Menü            | 3 → **13 kalem**; `MenuItem.stage` (Faz 8'den beri okunmayan alan) devreye alındı                                                                                   |
| Etki türleri    | 10 yeni tür, her biri `src/sim`'de **tam bir tüketiciyle** — test kaynak taraması yapıyor                                                                           |
| İki geçerli yol | **2 · 4 · 3 farklı satın alma seti** Aşama 1/2/3'ten çıkıyor — roadmap'in şartı ölçüldü                                                                             |
| İçerik tükenmi  | 6 saat sonra **12–26 yükseltme hâlâ alınmamış** — P12'nin `⊘` assertion'ı artık geçiyor                                                                             |
| Balance kapısı  | 11 assertion'ın **9'u geçiyor, 2'si DEĞERLENDİRİLEMEZ** (ortalama sepet aritmetiği)                                                                                 |
| Gelir eğrisi    | ₡12.8 → **₡21.1 → ₡40.8 → ₡69.3**/dk (aşama 1→4)                                                                                                                    |
| CI              | `workflow_dispatch` run **31933009343** — **11/11 job yeşil**, yeni **Economy balance gate** dahil; WebKit smoke pinlenmiş container'da geçti                       |
| Preview E2E     | run **31933221297** ✅ — ilk koşuşta kırmızıydı, sebebi kendi CSP'mizin Vercel toolbar'ını doğru reddetmesiydi; filtre `verticalSlice.spec.ts`'in biçiminde eklendi |
| Dal             | `phase/11-evolution` → `8fabe0c` (push edildi; **PR açılmadı** — PR #17 hâlâ açık ve bu dal onun üstünde)                                                           |
| Rapor           | [PHASE_13_REPORT.md](phases/PHASE_13_REPORT.md) · [BATCH_11_13_REPORT.md](BATCH_11_13_REPORT.md)                                                                    |
| Kapı            | ✅ **TEKNİK PASS** — 15 DoD maddesinin 14'ü temiz                                                                                                                   |

**Dürüst kayıtlar:** ağacın kendisi yetmedi — **menü Aşama 1'de duruyordu**, bu yüzden Aşama 3
lokantası limonata fiyatına limonata satıyordu ve hiçbir yükseltme bunu düzeltemezdi ·
drive-thru'da **pes eden müşteri şerit yuvasını bırakmıyordu** ve arkasını kilitliyordu (uzun
menü sabrı tüketince ortaya çıktı) · dünyaya çapalı yükseltme kartının **z-index'i yoktu**,
inşa panelinin altında açılabiliyordu — görünür, etkin ve tıklanamaz · iki assertion hâlâ
DEĞERLENDİRİLEMEZ ve engel **hesaplanıyor**: sipariş tek kalem olduğu sürece §3'ün ortalama
sepeti aritmetik olarak ulaşılamaz (değişiklik talebi §8.1) · **3 oyuncu ile 1 saatlik oturum
hâlâ yapılmadı**.

---

**Bir önceki: P12 — Economy Balancing & Balance Simulator (TEKNİK PASS)**

| Kanıt          | Değer                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Testler        | **1 218** unit/integration · **5** balance assertion · **114** E2E · **14** golden · **21** perf |
| `pnpm verify`  | ✅ temiz (balance kapısı artık verify'ın içinde)                                                 |
| Balance kapısı | 10 assertion'ın **7'si yeşil, 3'ü DEĞERLENDİRİLEMEZ** (Aşama 2–4 içeriği yok)                    |
| Çıkmaz kuralı  | **68 sn** / 90 sn — MERGE-BLOCKING, ayrı assert                                                  |
| Aşama 1 geliri | **₡12.8/dk** (gün ortalaması) / tasarım ₡15 — ±%25 bandın içinde                                 |
| Aşama 2 süresi | **21.4 dk** (bütçeli politikalar) · 21.2 dk (savurgan oyuncu) / hedef 12–18, bant 10–22          |
| Kuyruk         | ortalama **0.00 → 0.38** — direktifin istediği "kuyruk gerçekten oluşsun" karşılandı             |
| Ayırma bütçesi | **0.113 B/tick** / 32 — ölçüm aracı değişti, bütçe değişmedi (PHASE_12_REPORT §7)                |
| Koşu süresi    | 5 politika × 2 saat = **6.2 s** / CI bütçesi 90 s                                                |
| Rapor          | [PHASE_12_REPORT.md](phases/PHASE_12_REPORT.md) · [BALANCE_REPORT.md](../BALANCE_REPORT.md)      |
| Kapı           | ✅ **TEKNİK PASS** — 15 DoD maddesinin 13'ü temiz                                                |

**Dürüst kayıtlar:** itibar **sıfırdan** başlıyordu — yayınlanmış 0.60–1.40 bandının en kötü
ucu — ve her yeni stant dönüşümünün %60'ıyla çalışıyordu; Aşama 3 (itibar ≥40) bu yüzden
**ulaşılamazdı** (tam yükseltmeli Aşama 1'de 100 dk sonra 38.7 ölçüldü) · `roadside-marker`
her seviyede **geliri düşürüyordu** ve kaldırıldı (dönüşen sürücü **karar anında** park yeri
rezerve ediyor) · **oyun, işletemeyeceğin bir aşamaya geçmene izin veriyor**: ₡804 ile ₡800'lük
Aşama 3'ü kabul eden stant ₡4 ile açıyor, garson tutamıyor, 12 saatlik koşuda **92. dakikadan
sonra sıfır gelir** — geri dönüş yok (değişiklik talebi) · ayırma ölçümü kodu değil **ekonomiyi**
ölçüyormuş; `TimeSystem`'i atlamak (hiç ayırma yapmaz) rakamı dörde katlıyordu · **3 oyuncu ile
1 saatlik oturum YAPILMADI** ve yerine bir şey konulmadı · dört değişiklik talebi açık.

---

**Bir önceki: P11 — Restaurant Evolution (TEKNİK PASS)**

| Kanıt         | Değer                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------- |
| Testler       | **1 218** unit/integration (84 dosya) · **114** E2E · **14** visual golden · **21** perf  |
| `pnpm verify` | ✅ temiz (301 dosya typecheck 0 uyarı, depcruise 153 modül/532 bağımlılık, knip temiz)    |
| Stage 4 tick  | **0.307 ms** p95 / bütçe 3.2 ms · ayırma **11.8 B/tick** / 32 B                           |
| Save          | **v8**, v7→v8 migration + `save-v8.json` fixture                                          |
| Görsel golden | 3 yeni: `stage2/3/4-layout.png` — her aşamanın **geometrisi** (sanat değil)               |
| Dünya hash'i  | altıncı kez yenilendi: `6b9fb66d69f685fc` / `ac08da8925b9e88d` — Node ve tarayıcı birebir |
| S4 / S5       | **karara bağlandı** (ızgaraya oturan yerleşim · oyuncu onaylı geçiş) → GDD §25.1/§25.2    |
| Rapor         | [PHASE_11_REPORT.md](phases/PHASE_11_REPORT.md)                                           |
| Kapı          | ✅ **TEKNİK PASS** — 15 DoD maddesinin 13'ü temiz                                         |

**Dürüst kayıtlar:** renderer **Aşama 1 layout'una sabitlenmişti** — 2/3/4 simülasyonda
vardı, ekranda yoktu · otopark **4.5 m arabaları 3 m aralıkla** park ediyordu (bu fazda
yazılmış layout'lar; hiçbir test itiraz etmedi, çünkü park manevrayla yapılıyor) ·
**Aşama 4 hiç yeni park yeri eklemiyor** — batı bloğu dolu, doğu yarısı restoran; kapasite
drive-thru'nun kendisi · Aşama 1 **46.7–55.2 dk** sürüyor, tasarım **12–18 dk** (P12) ·
S4'ün ikinci argümanı **ölçümle desteklenmedi** ve öyle kaydedildi · **WebKit bu makinede
koşamadı** (`libevent-2.1-7t64`, root gerekiyor) — geçti denmedi · aşama silüetleri
**YARGILANMADI, sanat yok**.

---

**Bir önceki: P10 — Employee AI (TEKNİK PASS)**

| Kanıt         | Değer                                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| Testler       | **1 131** unit/integration · **104** E2E · **11** visual golden · **20** perf |
| `pnpm verify` | ✅ temiz (284 dosya typecheck, depcruise temiz, knip temiz)                   |
| Staffed tick  | **0.216 ms** p95 / bütçe 3.0 ms · ayırma **1.39 B/tick** / 32 B               |
| Bundle        | **439.23 kB** gzip / 550 kB                                                   |
| Save          | **v7**, v6→v7 migration + `save-v7.json` (gerçek kadro taşıyor)               |
| Ölçüm         | 20 dk: elle **29** müşteri, bir aşçıyla **30** — tıklama yok                  |
| Rapor         | [PHASE_10_REPORT.md](phases/PHASE_10_REPORT.md)                               |
| Kapı          | ✅ **TEKNİK PASS** — 15 DoD maddesinin 14'ü                                   |

**Dürüst kayıtlar:** aşçı vardiyanın %98'i BLOCKED · garson ve temizlikçinin yapacak işi
yok · "pass hiç dolmuyor" üç fazda üç özelliği bloke etti (KARAR GEREKİYOR #8) ·
"çalışanlar niyetli görünüyor mu" **yargılanmadı, sanat yok** · bir `Set` 123 B/tick'e
mal oldu ve gate yakaladı.

---

**Bir önceki: P9 — Economy v1 & Upgrade System v1 (MEKANİK PASS · SLICE KAPISI AÇIK)**

| Kanıt         | Değer                                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| Testler       | **1 076** unit/integration · **90** E2E · **11** visual golden · **18** perf  |
| `pnpm verify` | ✅ temiz (274 dosya typecheck, 126 modül depcruise, knip temiz)               |
| Service tick  | **0.238 ms** p95 / bütçe 2.8 ms · bundle **434.73 kB** / 550 kB               |
| Save          | **v6**, v5→v6 migration + `save-v6.json` fixture (gerçek satın alma taşıyor)  |
| Slice kapısı  | **2 kanıtlandı · 5 insan yargısı bekliyor · 1 ölçülmedi** — PHASE_9_REPORT §9 |
| Rapor         | [PHASE_9_REPORT.md](phases/PHASE_9_REPORT.md)                                 |
| Kapı          | ⚠️ **MEKANİK PASS** — slice kapısı ertelendi, geçti ilan edilmedi             |

**Dürüst kayıtlar:** ECONOMY_DESIGN §6.2'nin iki satırı birebir okunamıyor ve bir okuma
seçildi · soğutucu doğru ama atıl · P8'in verim çelişkisi hâlâ açık · gerçek cihazda FPS
ölçülmedi ve iddia edilmedi · kaydetme geçici trafiği tutmuyor.

---

**Bir önceki: P8 — Food / Order / Service Loop (TEKNİK PASS)**

| Kanıt         | Değer                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| Dal           | `phase/8-service-loop`                                                                                             |
| Testler       | **1 008** unit/integration · coverage eşikleri **oynatılmadı**                                                     |
| E2E           | **68** (chromium + firefox) · WebKit yerelde koşamıyor (§12 #2), CI'da koşuyor                                     |
| Visual        | **9 golden**, pinlenmiş container'da üretildi, host'ta bit-birebir geçti                                           |
| `pnpm verify` | ✅ lint · format · typecheck (265 dosya) · depcruise (117 modül) · knip · assets · coverage · bench · build · size |
| Service tick  | **0.185 ms** p95 / bütçe 2.8 ms                                                                                    |
| Ölçülen döngü | 10 dk: 195 geliş → 21 dönüşüm → **18 servis**, 0 terk, 0 israf, ₡52.34                                             |
| Rapor         | [PHASE_8_REPORT.md](phases/PHASE_8_REPORT.md)                                                                      |
| Kapı          | ✅ **TEKNİK PASS** — 15 DoD maddesinin 14'ü; §15 "döngü tatmin edici mi?" **yargılanmadı**                         |

**Dürüst kayıtlar:** roadmap'in "60 sn'de ≥3 müşteri" metriği onaylı ekonomiyle **erişilemez**
(AÇIK ÇELİŞKİ #7) · sıcaklık düşüşü doğru ve test edilmiş ama Aşama 1'de **hiç tetiklenmiyor**
(24 000 tick'te 0) · pass tabağı göstergesi oyuncuya Faz 8'de görünmüyor · overlay hiçbir golden'da
yok, çünkü DOM metni container ile host arasında 4 283 piksel (hepsi glif) fark üretiyordu · WebKit
smoke bu makinede koşmadı ve "geçti" diye raporlanmadı · FPS ölçülmedi ve iddia edilmedi.

---

**Bir önceki: P4 — Art Direction & Asset Pipeline v1 (KISMİ)**

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

> ## 🔴 DUR — BATCH P14–P16 TAMAMLANDI. P17+ YETKİSİZ.
>
> 2026-08-20: P14 (Offline) ✅ PASS · P15 (Takvim/Gece) ✅ PASS · P16 (Asset v2)
> 🟡 KISMİ — yetenek sınırıyla, bilerek: görüntü üretimi gerektiren her şey
> adlandırılmış borç, kaynak malzemesi olan her şey (yol bake'i) canlı ve
> doğrulanmış. Raporlar: `phases/PHASE_14_REPORT.md`, `phases/PHASE_15_REPORT.md`,
> `phases/PHASE_16_REPORT.md`, `BATCH_14_16_REPORT.md`.
>
> ### Kullanıcının önündeki kararlar
>
> 1. 🔴 **ADR-017 (WebGL kapısı)** — hâlâ Proposed; batch dokunmadı.
> 2. 🔴 **Yol genişliği ⊗ trafik yoğunluğu (#7) ⊗ şerit-değiştirme aktivasyonu ⊗
>    teslim edilen yol sanatının 2×2 görünümü** — tek dolaşık karar.
> 3. 🟠 **Oyun başlangıç saati** (00:00 → örn. 08:00) — ışık gelince görünür
>    oldu; §19 "ilk araç 8 sn" hedefiyle gerilimde; hash+fixture yenileme bedeli.
> 4. 🟠 **Aşama 2–4 gelir kalibrasyonu** — `CALIBRATED_STAGES=[1]` duruyor.
> 5. 🟠 **Yol dilimi araç/lisans teyidi** (assets/LICENSES.md eki).
> 6. 🟠 **Sanat regen listesi** — PHASE_16_REPORT §6 (arketip sanatı dahil büyüdü).
>
> ### Şimdi ne yapılıyor
>
> **HİÇBİR ŞEY.** P17 (Animation/VFX/Audio) açık kullanıcı onayı bekliyor.

## 22. Change Log

| Tarih      | Checkpoint | Değişiklik                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-21 | **AK**     | **Başlangıç saati 08:00 (kullanıcı kararı).** `DEFAULT_GAME_START_HOUR=8` config'te; yalnız taze dünya okur, save kendi saatini korur, pinler üstünü ezer. Anlamla çözülen serpinti: playtime artık tick'ten (taze kayıt 4 dk iddia etmez), `World.reset()` açılış saatine döner (reset ≡ kuruluş), boş-işyükü bench satırları derin geceye sabitlendi (sabit ek yük sinyali korunur — eşik/baseline DOKUNULMADI), maaş/drenaj fixture'ları yoksulluk öncülünü açıkça kurar, save-resume testleri snapshot.ts'in belgelediği gerçek sözleşmeyi assert eder (geçiciler tasarımca düşer — gece yarısı boşluğunda bedava yeşildi). Birim 1382/1382, determinizm 61/61, entegrasyon 97/97, bench 21/21. Balance stage-2 penceresi bilerek kırmızı (24.3 dk > 22) — kalibrasyon commit'i sahiplenecek. Commit 192218d.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-21 | **AL**     | **P17 (Animation/VFX/Audio) kapandı — DIŞ GİRDİYLE KISMİ, bilerek.** Uygulanmış: tam `DollRigRuntime` (9 keyframe klip + 3 prosedürel, 120 ms cross-fade, ayna kuralı, sim-zamanı sürüşü — donmuş dünya donmuş poz), aktivite sözlüğü readView'de türetilir (saklanmaz/hash'lenmez), 12 efektli `ParticleLibrary` (400 tavan KODLA, reduced-motion çeyrekler, noParticles'ta hiç kurulmaz — goldenlar 18/18 bayt-özdeş kaldı), eksiksiz `AudioDirector` (kanal şeritleri, ducking rampaları, 400 ms throttle, ±%6 pitch, mesafe, 24 tavan, saat-müziği, tembel manifest yükleyici), SET_AUDIO/SET_MUTED/SET_REDUCED_MOTION komutları + şema v11 (`ambience`, migration+oynanmış fixture), ayarlar paneli, `pnpm rig:editor`. SEVK EDİLMEYEN: ses dosyaları (23 kalem `AUDIO_ASSET_REQUIREMENTS.md` — sistem manifest'le kod değişmeden uyanır) ve fire/coin dokuları (P245-246; kayıtlı fallback). Doğrulama: verify exit 0, birim 1524, determinizm 61/61 + iki değişmezlik kanıtı (reduced-motion/mix sonuç değiştirmez), bench 22/22 (rig p50 ~0.04 ms / 1.2 bütçe), e2e 82, goldenlar değişmedi. GPU kare ölçümü KOŞULMADI (otomasyon Chromium'u üç bayrakta da SwiftShader — D-08 gereği FPS raporlanmadı); 20 dk ses yorgunluk testi sessizliğe karşı koşulamaz (dış teslime bloke). ECONOMY §6.2 eğri satırları kalibrasyon yetkisiyle güncellendi (eski değerler notta) — kendi pin testi yakaladı, doküman+test birlikte düzeltildi. CI kanıtı push sonrası eklenecek.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-21 | **AJ**     | **Aşama 2–4 ekonomi kalibrasyonu (kullanıcı yetkisiyle) — YALNIZ CONFIG.** 5 politika × 3 seed × 720 dk, gerçek balance simülatörü. SONUÇ: S2 penceresi 10–22 → 12/12 koşu içeride (16.5–19.0; önce 7/12 dışarıda, en kötü 25.4) — `stage-2-timing` ASSERT YEŞİL. S3 penceresi 51.5–59.8 ∈ [28,70] ölçülü-yeşil. S4 332–350 vs ≤320 — YAPISAL BLOK (tek şerit ~45 araç/dk tavanı; S4'e teslim ~17/dk; zarf ₡190 girişe karşı ulaşılabilir azami ~₡98/dk — aritmetik raporda). Değişen: S1 merdiveni §3'ün kendi aritmetiğine (tabela L1 0.30→0.50, menü L1 0.18→0.25); S2 merdiveni §3 bütçesine (₡1.355→₡499, üç rung 3→2 seviye); S4 fiyatları kendi ağırlığına (×3.5, iki ₡220 giriş rungu §8-m2 korunarak) — `content-not-exhausted` 0→7 kaldı. Etkisiz ölçülen 5 knob geri alındı ve rapora yazıldı. ÜÇ BELGELİ ÇATIŞMA (STAGE_2_4_CALIBRATION_REPORT §4): yol/şerit kararı S4'ü, §8-her-30sn ⊗ §6.1-2.2-büyüme S2 üyeliğini, yaya-kanalı yokluğu S3/S4 tavanını kilitliyor — üçü de kullanıcı kararı. `CALIBRATED_STAGES=[1]` kaldı (büyütme = kalibrasyonun bitti tanımı; hangi karara bağlı olduğu §4'te). 720 dk verdikt tablosu: assert edilen 8/8 YEŞİL. Birim 1382/1382, balance:check 5/5, determinizm 61/61. onSample kancası runner'a eklendi (kalibrasyon gözlemi).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-21 | **AH**     | **Prompt kataloğu genişletildi — EKLEME-YALNIZ.** 172 eski kart bayt-sabit (25'ine yalnız `data-superseded-by` niteliği + rozet eklendi — metinleri değişmedi; devralan yeni kart, aynı hedefin düzeltilmiş talimatı). **131 yeni kart (P173–P303), 10 denetim batch'i**; her biri kilitli PROMPT_BLOCK gövdesini birebir taşır + özne/boyut/yön/DO-NOT/runtime-rol satırları; 'new in this audit' rozeti, Status/Priority/Stage meta alanları, kategori filtreleri ve kopyalama korunarak (tarayıcı sağlaması: 303 kart, arama 'audit'→131, veh filtresi→92, copy düğmesi ✓, boş pre 0). `tools/validateAssetPromptCoverage.ts`: REQUIRED 131 / PRESENT 131 / **MISSING 0 / DUPLICATES 0 / ORPHANS 0** — `pnpm assets:prompt-coverage` verify zincirine ve CI asset işine bağlandı + birim test kancası. Katalog 524 kB → 956 kB.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-21 | **AG**     | **Kapsamlı asset denetimi TAMAM.** Makine envanterleri (173 kaynak, 172 kartlı katalog, DIRECTION_AUDIT, ACCEPTED_EXCEPTIONS, sprites.ts çerçeve tabloları, 30 tüketilmemiş iconKey, yerleşim kimlikleri, arketip blokları) çapraz mutabakatla birleşti: katalog↔kaynak birebir (tek promptsuz kaynak = kullanıcı-teslimi yol dilimi). `docs/FINAL_ASSET_REQUIREMENTS.md` + makine-ikizi `docs/assets/assetRequirements.json`: **300 satır** — 158 PRESENT+VERIFIED, 116 MISSING+PROMPT ADDED, 15 PRESENT+NEEDS REGEN (8 bacak + 7 palet-dışı UI ikonu), 9 PROCEDURAL BY DESIGN (gerekçeli), 1 NOT REQUIRED (mevsimlik ikon), 1 DEBUG ONLY (ölçek çubuğu). Yeni prompt ihtiyacı **131 (P173–P303)**: 10 arka görünüş + 8 fren + 6 yeni arketip×(5 görünüş+2 fren)=42 + 5 yemek ikonu + 30 upgrade kart ikonu + 3 zemin bake + 2 FX dokusu + 13 P18 ikonu + 3 illüstrasyon + 15 regen. ~290'lık S3/S4 bespoke planı matris DIŞI bırakıldı ve gerekçelendi (runtime hiçbir çerçevesi ona başvurmuyor; denetlenmemiş satır icat etmek §26 ihlali olurdu).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-21 | **AI**     | **WebGL kararı KAPANDI — ADR-017 Seçenek A kabul (kullanıcı: "WebGL1 kullanımı onaylandı").** Kapı motorun gerçekten açtığı bağlamı sınar: `capability.ts` `webgl` (+ eski Safari için `experimental-webgl`) yoklar, `no-webgl2` → `no-webgl`; WebGL'siz tarayıcı Kademe C ekranını korur. Uyumluluk kesin genişledi, hiçbir tarayıcıya yeni iddia yok. Birim 9/9 (WebGL1-only ortam DESTEKLENIR dahil), e2e boot+fallback 5/5. Yaşayan doküman süpürmesi: CLAUDE.md, ROADMAP (14 ifade), TECHNICAL_ARCHITECTURE, TESTING_STRATEGY, RESEARCH_NOTES, PROJECT_MEMORY §3/§12; tarihli raporlar kayıt olarak bırakıldı. ÇELİŞKİ #4 ✅ ÇÖZÜLDÜ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-20 | **AF**     | **P16 kapandı (KISMİ — yetenekle sınırlı, bilerek) ve BATCH P14–P16 BİTTİ.** Yol bake'i uçtan uca canlı: import → 9/9 doğrulama (palet-affinity aile içinde, 173 asset 0 failing) → tekil dosya + manifest + SW precache (30 giriş) → 12 m döşeme + flipX + prosedürel fallback; PLACEHOLDER_REGISTER yol satırı kapandı, LICENSES'a teslim kaydı + araç/lisans teyidi kullanıcı sorusu. Ölçülmüş renderer gerçeği: bu Phaser 4 WebGL'inde `setMask` sessizce işlevsiz (zemin bake'inin elması baştan beri kendi alfasıyla sınırlıymış) — ölü maske kodu söküldü. Dört-aşama tutarlılık yargısı tarayıcıdan verildi (aynı köşe, aynı palet, 0 placeholder, 0 hata). Regen listesi DÜRÜSTÇE BÜYÜDÜ: +6 arketip aracı sanatı (~36–48 görünüş); yol kalemi kapandı. Üretilemeyen ~290 sprite'lık Aşama 3/4 planı adlandırılmış borç (ajan görüntü üretemez — P4 bulgusu değişmedi). Golden'lar yol yeniden boyamasıyla konteynerde yenilendi (18/18, host bayt-özdeş, hepsi göz'le). Playtest KOŞULMADI. Kapanış raporları: PHASE_16_REPORT + BATCH_14_16_REPORT. KANIT: push zinciri bf3ec1a → 315bf6d → f9f2aae → 8ed164b. Yol push'u önizleme kapısında GERÇEK bir kusur yakaladı, üç parçada çözüldü: (1) enstrümante oturumlar SW kaydını atlar — taze context başına ~10.6 MB precache fırtınası ölçüldü (SW'li 13.7/32.5/22.9/18.8 sn vs SW'siz 12.8/8.6/6.3/5.8 sn, render-ready), (2) dış hedef bütçeleri ×2 (CDN taze context önyüklemesi ölçülü 6–13 sn), (3) e2e bekçileri P15'in §11-kayıtlı +%37 maliyetine göre yeniden boyutlandı (yeşil koşuda 29.5/30 sn ve 1.8/2.0 dk yaşayan testler; taban 30→45 sn, serviceLoop 120→180 sn) — hiçbir assertion değişmedi. SON SHA 8ed164b: CI 32381294123 deneme 2 BAŞARILI 11/11 (deneme 1: mutlak perf yedeği 5.660 ms/5 ms yavaş runner çekilişi — deneme 2 p50 3.944/p95 7.763; 5→8 ms boyutlandırma CHANGE REQUEST olarak PHASE_16_REPORT §7.4'te, UYGULANMADI, kullanıcı kararı bekliyor) + Preview E2E 32381594323 YEŞİL. Deployment r243gdgxh: health buildSha 8ed164b… birebir, schemaVersion 10. f9f2aae artefaktında ölçüldü: CDN soğuk 6.7 sn/7.67 MB tel, sıcak 1.6 sn/~0 ağ baytı (30 isteğin 20'si SW), yol 200/1.63 MB; canlı 5 dk oynayış {tick 6113, weather 1 — P15 yağmuru seans içinde geldi, droppedTicks 0, errors []}. **P17+ YETKİSİZ — DURULDU.**                       |
| 2026-08-20 | **AE**     | **P16 başladı.** Dal `phase/16-asset-v2` (`7ea73ab` üstünde). Tek yeni teslimat: kullanıcının bıraktığı **yol yüzeyi dilimi** — `road_segment_tile-a@2x` olarak import edildi, **9 kontrolden 9'u geçti** (palet ailesi İÇİNDE — 173 asset, 0 failing), tekil dosya olarak `public/assets`'e aktı. Render: doğal-ölçek döşeme + flipX ayna (sanatın şosesi öbür iso eksenindeydi — DIRECTION_AUDIT'in araba kuralı) + 12 m ölçek (16 m doğalda şose 9.5 m çıkıp 7 m'lik yol hakkını aşıyordu) + omuz maskeli bant; prosedürel yol fallback olarak altta. Kalan görsel çentikler adlandırıldı: döşeme ek yerleri, sürücü girişlerinde bordür kesiği yok. Sırada: Aşama 3/4 tarayıcı kategori denetimi, dört-aşama tutarlılık yargısı, golden yenilemesi, kalan regen listesinin dürüst envanteri (6 yeni arketip aracı DAHİL büyüdü).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-20 | **AD**     | **P15 kapandı — Advanced Traffic/Events/Weather/Day-Night.** Deterministik takvim (EventSystem slot 2'yi doldurdu; günde sabit çekiliş: 8 hava + 18 olay; aynı seed+gün → aynı takvim, testle), 6 olay + 4 hava config'te, save v10 + fixture, hash pini 9. kez yenilendi (`0e732b19…`/`b2a80a51…`). **Hava oyun-etkisi minStage 4** — GDD §9.6 başlığının kendisi + ölçüm: Aşama 1'den açıkken stage-2 zamanı 21.78→22.1 dk (tavan 22) — kalibre ekonomi, kalibre edilirken var olmayan gökyüzüyle yeniden fiyatlanıyordu. **Sola dönüş** stage-4'te canlı (Aşama 1'den açıkken teslim edilen talep 23.7→14.7/dk ölçüldü — config yorumunda); iki gerçek bulgu: yasadışı-dünya fixture'ı (ADR-014) ve bekleyen dönücünün birleşme kutusunu 18 dk boğması → `rejoinClear`'a dar "şeridi terk eden araç karşı akış değildir" muafiyeti. **Şerit değiştirme katmanı** canlı-ama-geometriyle-atıl (yol tek şerit×2 yön; sentetik çift-şeritte gerçek davranış testli; aktivasyon yol-genişliği/yoğunluk kararına bağlı — kullanıcının). **6 yeni arketip davranış-tam, pay 0** (sanat yok — testle sabit). Işıklandırma pasosu Graphics'le (CanvasTexture bu Phaser 4'te hiç çizmedi — probe'landı); draw call ölçümü gündüz 5 → gece +1, yağmur +2 (bütçe ≤+8). Golden'lar: 14 eski `forceHour=12`'ye sabitlendi (meğer 00:30 fotoğraflanıyormuş) + 4 çevre golden'ı; 18/18 konteynerde, host'ta bayt-özdeş, hepsi göz'le. Bench: 2 gerçek optimizasyon (tik-başına türetim önbelleği; ilk bağlama +%47 ölçüldü) sonrası kalan +%37 özelliğin bedeli → **baseline §11 disipliniyle `phase15` olarak yeniden kaydedildi**, phase12 sayıları PERF_LOG'da. Yerel: 1508 test, determinizm 61, balance 5/5, E2E 80, golden 18. S6 kararı GDD §25.3'te. Yeni açık madde: oyun 00:00'da başlıyor (ışık gelince görünür oldu; başlangıç saati kullanıcı kararı). **CI kanıtı:** ilk dispatch `ac26dac` yalnız CI-runner'ın mutlak taze-tik bütçesinde kırmızı (5.32/5 ms — zarf hatasının fiyatı); `7ea73ab`'deki aşama-duyarlı headroom düzeltmesiyle CI **yeşil** run 32368939802 (11/11) + preview-e2e **yeşil** 32369208677. Düzeltme yolunda ikinci golden gerçeği: öğlen pini boot pini imiş (600 tik = 1 oyun saati; serving 8280'de 18:54 alacakaranlığını fotoğraflıyormuş) — frozenUrl saati geriye çözüyor, serving tiki 13284'e yeniden türetildi. |
| 2026-08-20 | **AC**     | **P15 başladı.** Dal `phase/15-events-weather` (`26d4587` üstünde). Kapsam okuması ve iki dürüst kısıt baştan kayıtta: (1) **6 yeni arketipin üretim sanatı yok** (teslim edilen 32 araç dosyası mevcut dördü kapsıyor) — davranışlar eksiksiz + testli gelecek, spawn payları sanat gelene dek 0 (P4 dersi: sanat taklit edilmez; P16 regen listesi büyür). (2) **Onaylı yol her aşamada tek-şerit×2-yön** (`SHARED_ROAD`) — aynı-yön şerit çifti yok, bu yüzden "şerit değiştirme" karar katmanı gerçek ve testli ama sahada pasif; **sola dönüş** (karşı şeridi kesme, GDD 9.1'in adıyla andığı tıkanma kaynağı) canlı gelecek. Olaylar GDD §9.6 gereği minStage 4; hava dört durum tüm aşamalarda. Determinizm planı: takvim günde sabit çekiliş (8 hava + 18 olay), hash pini 9. kez yenilenecek, save v10.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-08-20 | **AB**     | **P14 kapandı — Offline Progression.** OfflineSystem saf fonksiyonlar (dört saat savunması tablo satırı olarak test ediliyor), beş dakikalık offline sayacı (EconomySystem slotundan, hash DIŞI — dışlama cosmetic stream gibi testli; tick-başı örnekleme bench'te %57 regresyon verdi, 5 sn kova örneklemesine taşındı, 21/21 yeşil), save v9 (`offline: {meter, pending}` zarfı + fixture), `COLLECT_OFFLINE` komutu, boot yükleme + 30 sn autosave + visibilitychange/pagehide, `/api/time` senkronu (Date header), vite-plugin-pwa 1.3.0 SW (29 giriş precache, sw.js öz-yeterli, health.json hariç; kayıt geç-boot düzeltmesiyle elle). Tarayıcı denetimi gerçek kusur yakaladı: %9 dolulukta "park sınırladı" yalandı → `OFFLINE_LIMITER_SIGNIFICANCE=0.5` + `demand` sınırlayıcısı (ECONOMY_DESIGN §10 aynı commit'te güncellendi). Ölçümler: computeOffline 190 ns; soğuk 486 ms/1.76 MB, SW'li sıcak 227 ms/**1.3 KB** ağ. Yerel: 1423 unit + determinizm 61 + balance 5 + bench 21 + E2E chromium 85 (80+5 yeni) + SW 2 + golden 14/14 bayt-özdeş. Firefox/WebKit kanıtı CI'dan (yerel xvfb yok — bilinen kısıt). Bir depo tutarsızlığı kaydı: CLAUDE.md §5 `config:check`/`vercel.json` komutları depoda yok; platform `vercel.ts`'i doğrudan tüketiyor (davranış çelişkisi değil, bayat komut listesi — kullanıcıya raporlanacak). **CI kanıtı:** ilk dispatch `09757f2` yalnız knip'te kırmızı (dead export), `26d4587`'de düzeltildi; CI **yeşil** run 32350807804 (11/11), preview-e2e **yeşil** 32350134863 + 32351060875, deploy health SHA `26d45870…` birebir, schemaVersion 9, sw.js no-cache.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-20 | **AA**     | **P14 başladı.** Dal `phase/14-offline` (`4394acf` üstünde, checkpoint Z commit'i `0e0a253`). Mevcut durum okuması: save v8'de `lastSeenAt`/`lastSeenServerAt` alanları var ama oyun boot'ta save YÜKLEMİYOR ve autosave YOK (test kancalarında yaşıyor) — P14 kalıcılığı gerçek yapacak. `/api/time` canlı (204 + Date). Plan: saf OfflineSystem + sayaç + zarf v9 + tüket-sonra-göster akışı (çifte claim'i imkânsız kılan sıralama) + SW.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-20 | **Z**      | **BATCH P14–P16 başladı.** Kullanıcı üç fazı toplu yetkilendirdi (otonom; P16'da DUR, P17+ yasak). Bağlam kurtarma ölçümle yeniden kuruldu: HEAD `4394acf` = origin/phase/consolidation-art; CI yeşil `d720a3f` (run 32195375649, 11/11) + preview-e2e yeşil (32195593116, 32196290411); kayıtlı deploy `3hj8n0ir3` canlı, health SHA `d720a3f…`, schemaVersion 8; balance: her değerlendirilebilir assertion ✅, `CALIBRATED_STAGES=[1]`, S3/S4 zamanları ⊘ ölçülüyor; placeholder üretim ekranlarında 0; playtest KOŞULMADI; ADR-017 (WebGL) kararı hâlâ kullanıcıda — kapıya dokunulmayacak. Yeni girdi: kullanıcı `assets/source/Pasted image.png` bıraktı (1774×887 RGBA, izometrik **yol yüzeyi dilimi** — regen listesindeki "road bake" kalemi; P16'da işlenecek). Dal açıldı: `phase/14-offline`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-18 | **T**      | **Asset entegrasyonu başladı.** 172 dosyalık drop envanterlendi (153 MB, 0 mükerrer, 0 çözümsüz ad); alpha-253 bulgusu ölçümü mümkün kıldı; `assets:import` aşaması yazıldı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-18 | **U**      | **Envanter + mutabakat tamam.** 172/172 beklenen↔teslim eşleşmesi; palet çelişkisi kullanıcı kararıyla ADR-013'e bağlandı (`palette-affinity`, yön başına sprite kutusu, genişlik-esaslı oturtma, 60 isimli istisna); doğrulama `0 failing`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-18 | **V**      | **Dünya entegrasyonu tamam.** Render katmanı atlas tüketiyor; 5 parçalı rig (teslim edilen "bacaklar" ikinci kol çifti — çizilmiyor); yön ataması `DIRECTION_AUDIT.json`; layout'lar gerçek nesne kimlikleri; navigasyon gövde-izi ayrımı (gövde ≠ taç); tüm aşamalar tarayıcıda 0 placeholder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-18 | **W**      | **Ürün maddeleri kapandı.** ADR-014 (evrim rezervi, ₡804 regresyonu), ADR-015 (dikkat modeli + §13 düzeltmesi), ADR-016 (sepet — §8.1 kapandı, A3 zamanlaması ilk kez yeşil, `CALIBRATED_STAGES=[1]` sınırı), ADR-017 Proposed (WebGL ölçümü, karar kullanıcıda). Playtest protokolü yazıldı, KOŞULMADI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-18 | **X**      | **Final tarayıcı denetimi.** Golden'lar pinli konteynerde 3 turda yenilendi (upgrade placeholder'ı, DT şerit istifi, fren boyası bulundu ve giderildi), host'ta bayt-özdeş 14/14; AGENT VISUAL REVIEW beş yargıyı verdi; gerçek GPU ölçümü PERF_LOG'a girdi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-19 | **Y**      | **Konsolidasyon tamam.** Final SHA `d720a3f`. Yerelde `pnpm verify` (1374 test) + E2E 146+12 + WebKit (konteyner, hermetik, 3/3) + 14 golden yeşil; GitHub CI **yeşil** (run 32195375649, 11/11 iş) ve `preview-e2e` **yeşil** (run 32195593116 — izole runner'da, CDN'e karşı tam süit). Kayıtlı deploy: Vercel'in kendi build'i `3hj8n0ir3`, health SHA birebir `d720a3f…`, 4 sahne 171 kare 0 placeholder, konsol 0 hata, soğuk yükleme 5.3 s. Dalın ilk push'u iki gerçek altyapı hatasını yakaladı — auto-deploy ve CI build'i atlassız çıkıyordu (`919bcc0`, `f530e9f`) — ve altı boot helper'daki HUD-köprü yarışı kapatıldı (`e331158`); dört bekleme bütçesi runner donanımına göre boyutlandırıldı (`95f50b7`, `d720a3f`), hiçbir assertion değişmedi. Raporlar yazıldı; P14 BAŞLATILMADI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-14 | —          | GATE 0 tamamlandı, 8 doküman teslim edildi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-14 | —          | **GATE 0 kullanıcı tarafından ONAYLANDI**; 6 roadmap değişikliği (D1–D6) kabul edildi; Faz 1 yetkilendirildi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-14 | **A**      | **Düzeltme 1:** Dead-end kapısı 120 sn → **90 sn**, merge-blocking. Değişen: `ECONOMY_DESIGN.md` §8 + §13, `GAME_EXECUTION_ROADMAP.md` §32 P12 assertion listesi, `TESTING_STRATEGY.md` §5. Uyarı bandı kapının altına (75–90 sn) taşındı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-14 | **A**      | **Düzeltme 2:** Bağımlılık sürüm kilidi politikası eklendi → `WORKING_DISCIPLINE.md` §2.5 (yeni). Tam pinleme, değişiklik kaydı formatı, Dependabot auto-merge yasağı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-14 | **A**      | **Düzeltme 3:** Faz 4'e AI asset lisans kapısı eklendi (9 maddelik birincil-kaynak doğrulaması) → `GAME_EXECUTION_ROADMAP.md` Faz 4 START CONDITIONS (yeni), `ASSET_PIPELINE.md` §4.2, `RESEARCH_NOTES.md` §7.1 (yeni).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-14 | **A**      | `docs/PROJECT_MEMORY.md` oluşturuldu. Faz 1 başlangıç durumu kaydedildi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-16 | **P13**    | **Faz 13 kapandı — Upgrade System v2, batch 11–13 bitti.** 30 yükseltme / 5 aile / 4 aşama, ön koşul grafiği döngü kontrollü, 10 yeni etki türü ve her biri için `src/sim` kaynak taramasıyla tüketici kanıtı. **Menü 3 → 13 kalem** ve `MenuItem.stage` devreye alındı — ağaç tek başına yetmiyordu, Aşama 3 lokantası limonata satıyordu. Gelir eğrisi ₡12.8 → 21.1 → 40.8 → **69.3**/dk. Roadmap'in "her aşamada en az 2 yatırım yolu" şartı **2/4/3 farklı satın alma setiyle ölçüldü**; "6 saat sonra alınmamış yükseltme var" assertion'ı artık geçiyor (12–26 kalıyor). İki gerçek kusur: drive-thru'da pes eden müşteri şerit yuvasını bırakmıyordu; yükseltme kartının z-index'i yoktu. Balance 11 assertion'ın 9'u yeşil, 2'si ortalama sepet aritmetiği yüzünden DEĞERLENDİRİLEMEZ (değişiklik talebi §8.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-16 | **P12**    | **Faz 12 kapandı — Economy Balancing & Balance Simulator.** `tools/balance-sim` 5 politika, 10 assertion, CI'da merge kapısı; 12 saatlik oyun 6.2 s'de koşuyor. **Trafik/atıl personel açlığı config ile çözüldü**: itibar sıfır yerine bandın nötr noktasından (50) başlıyor, arketip ilgileri ×0.75, yükseltme merdiveni 90 sn kuralına göre yeniden ölçeklendi, Aşama 1 fiyatları ve malzeme maliyetleri ×1.35 (marjlar sabit), trafik 24→28 denenen / 23.7 teslim. Aşama 1 geliri ₡8.3→**₡12.8**/dk, Aşama 2 süresi 46.7→**21.2** dk, kuyruk 0.00→**0.38**. `roadside-marker` ölçülerek zararlı bulundu ve kaldırıldı. Ayırma ölçüm aracı heap-delta'dan **örnekleyici profiler**'a geçti: 0.113 B/tick. **3 oyuncu testi yapılmadı**; dört değişiklik talebi açık.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-16 | **P11**    | **Faz 11 kapandı — Restaurant Evolution.** Dört aşama, drive-thru, inşaat maskesi, build mode. 1 218 test · 114 E2E · 14 golden · 21 perf bütçesi. Save **v8**. Dünya hash'i altıncı kez yenilendi (`6b9fb66d69f685fc`), Node ve tarayıcı birebir. **S4 ızgaraya oturan yerleşim**, **S5 oyuncu onaylı** olarak karara bağlandı (GDD §25.1/§25.2); S4'ün ikinci argümanı ölçümle desteklenmedi ve öyle kaydedildi. İki gerçek kusur bulundu ve düzeltildi: renderer Aşama 1 layout'una sabitlenmişti, otopark 4.5 m arabaları 3 m aralıkla park ediyordu. Aşama 1 süresi **46.7–55.2 dk** ölçüldü (tasarım 12–18) — P12'ye devredildi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-15 | **Q**      | **P7 TAMAMLANDI ✅ — BATCH 5–7 BİTTİ.** Yayalar yürüyor: nav grid, hedef başına flow field, steering, kuyruk slotları, A\* fallback, prosedürel yürüyüş, deadlock harness (500 senaryo × 2 000 tick, 0 kilitlenme). 907 test. Flow field bütçesi ilk ölçümde kaçtı (42.9 ms / 12 ms) — roadmap'in B planı bölmekti ama "önce ölç" diyordu; ölçüm en iç döngüdeki tuple destructure'ı gösterdi, düz typed array'lerle 9.3 ms, bölme gerekmedi. Beş kusur ölçümle bulundu (park kapısı kendi arabasının hücresinde; kuyruk dolunca on beş kişi aynı noktada). İki fikir kanıtla reddedildi ve kodda kayıtlı. Perf altyapısındaki beş kusur giderildi; kalibrasyon artık aritmetik + bellek karışımı (makineler arası sapma %19 → %5). **Yaya doğallığı yargısı verilmedi** — sanat yok; ölçülen %57 yön değişimi iyi bir sayı değil ve öyle raporlandı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-08-15 | **P**      | **P6 TAMAMLANDI ✅.** Döngü kapandı — araç frene basıyor, park ediyor, sürücü tezgâha yürüyor, sıkılıp gidiyor (fazın şartnamedeki bitiş durumu). 834 test. Ölçümle yedi kusur bulundu; ikisi sessiz ve tam kilitlenmeydi: girişi "yavaş bir araç" gibi modellemek IDM'nin duruş boşluğu yüzünden aracı dönüşün 2.4 m gerisinde sonsuza kadar durdurdu (20 dakikada spawn 2 400 → 108), ve `SEEKING_PARKING`'in sabri hiç kurulmadığı için her müşteri vardığı tick'te vazgeçti (10 dakikada 17 dönüşüm, 0 park). Sabır süresi artık durumun kendi tanımında. `scanLimit` ile tick, dört sistem eklenmesine rağmen %44 ucuzladı. Save v4 → v5. **Dönüşüm anı yargısı verilmedi** — üretim sanatı yok, yerine mekanikler ölçüldü (5.61 m/s düşüş, 3.88 s yavaşlama, 334 dalga karesi).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-08-15 | **O**      | **P5 KISMİ.** Trafik çekirdeği tamam ve deterministik (723 test, 10 000 spawn'da determinizm, fren dalgası yukarı yayılıyor). İki DoD maddesi karşılanmadı: yol canlı görünmüyor (ölçüldü: ortalama 1.05 araç, %40.9 tamamen boş — üç onaylı sayının çelişkisi, karar kullanıcının) ve tahsis bütçesi (29 B/tick vs 8; bütçe boş boru hattında belirlenmişti, sebep bisect edildi ama açıklanamadı, test düşük bırakıldı). Zaman ölçeği kararı verilmedi — boş yolda verilecek bir yargı değil. **P6/P7 başlatılmadı.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-15 | **N**      | **Sanat üretilemedi — yetenek sınırı.** Lisans engeli kalktıktan sonra bile 0 asset: ajanın görüntü üretme yeteneği yok. Sahte PASS yazılmadı, prosedürel çizim "AI üretimi" diye kaydedilmedi. Yerine `pnpm assets:prompts` (12 batch, 172 prompt) ve metre-tabanlı `subjectDimensions.json` yazıldı. Bu araç iki gerçek kusur ortaya çıkardı: kontrol 4 çizimi dünya yüksekliğiyle karşılaştırıyordu (sedan 301'e karşı 90 — her araç reddedilecekti) ve kontrol 6 302 asset'in 206'sını böldürüyordu (§1.4'ün 160 px'i gövde, sprite değil). 605 test yeşil.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-15 | **M**      | **Lisans kapısı yönetici kararıyla açıldı.** God Mode AI seçildi; madde 5 ve 8 okunmamış hâlde bilerek kabul edildi; Sprixen ve PixelLab düşürüldü. Altın referans insan onayı koşullu kaldırıldı. Kayıt "geçti" değil "geçersiz kılındı" diyor — 9/9 doğrulanmadı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-15 | **L**      | **P4 PARTIAL — BATCH BİTTİ.** Pipeline kuruldu ve kanıtlandı (583 test, determinizm ölçüldü). **START CONDITION kapanmadı → 0 üretim asset'i.** Faz 3'ün visual regression kapısında ciddi bir kusur bulundu ve düzeltildi: `threshold` varsayılanda (0.2) bırakılmıştı, bu yüzden zeminin tamamen yeniden boyanması (233 365 piksel) kapıdan geçiyordu → `threshold: 0`, tek birimlik renk değişimiyle kapının kırıldığı ölçüldü. Palette'in ilk taslağında UI başarı/tehlike çifti döteranopide 22.6 birime düşüyordu → palet değişti, eşik değişmedi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-15 | **K**      | P4 başladı — dal `phase/04-asset-pipeline`, `a60b641`'ten. START CONDITION önce koşuldu: 9 maddelik lisans doğrulaması, 4 sağlayıcı, birincil kaynak. **Kapanmadı.** `sharp@0.35.3` + `free-tex-packer-core@0.3.9` eklendi (onaylı stack'te zaten adı geçen sürümler).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-15 | **H**      | **P2 TAMAMLANDI ✅** — PR #8, CI 8/8, preview-e2e 23/23 (ilk kez bloke edici ve gerçekten koşan). Determinizm motorlar arası doğrulandı (Node V8 = Firefox SpiderMonkey). Perf baseline CI'dan kaydedildi, %15 regresyon kapısı canlı. Preview kapısı ilk koşuşunda iki gerçek sorun buldu: Vercel toolbar CSP bloğu (doğru davranış, tolere edildi) ve Zod'un `Function` probe'u (kaynağında `jitless` ile çözüldü, CSP'ye dokunulmadı). Sırada P3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-14 | **G**      | P2 başladı — dal `phase/02-simulation-core`, `cbdaef4`'ten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-08-14 | **F**      | **Batch P2→P4 başladı.** Context reset sonrası durum repo/CI/deployment ölçümüyle yeniden kuruldu. GATE 1 onaylandı, P2+P3+P4 toplu yetkilendirildi. Vercel Authentication kapatıldığı **doğrulandı** (API + curl) → bilinen sorun #1 ve geçici çözüm #1 kapandı, D-09 eklendi. §1/§5'teki bayat "P1 yürütülüyor" alanları düzeltildi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
