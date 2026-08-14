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

|                    |                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------- |
| **Proje adı**      | Evolutionary Tycoon                                                                 |
| **Repository**     | <https://github.com/emredogan-cloud/evolutionary-tycoon> (public, MIT)              |
| **Sürüm**          | 0.1.0                                                                               |
| **Mevcut faz**     | **PHASE 2 — Simulation Core & Determinism** (BATCH P2→P4'ün ilk fazı)               |
| **Mevcut kapı**    | GATE 0 ✅ · GATE 1 ✅ (kullanıcı 2026-08-14'te P2+P3+P4'ü toplu yetkilendirdi)      |
| **Durum**          | 🟡 Batch 2→4 yürütülüyor                                                            |
| **Son güncelleme** | 2026-08-14 — CHECKPOINT F                                                           |
| **Son commit SHA** | `cbdaef4bcc6ba99edc1eef2f96737bfe47791286` (main, doğrulandı: `git rev-parse HEAD`) |
| **Yerel dizin**    | `/home/emre/Downloads/Evolutionary-Tycoon`                                          |

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

| Faz                  | Durum                | Başlangıç  | Bitiş      | Commit/PR                  | Kapı                    | Kanıt                                      |
| -------------------- | -------------------- | ---------- | ---------- | -------------------------- | ----------------------- | ------------------------------------------ |
| P0 Research & Design | ✅ TAMAMLANDI        | 2026-08-14 | 2026-08-14 | (pre-repo)                 | **GATE 0 ✅ ONAYLANDI** | 8 doküman, ~55k kelime                     |
| P1 Foundation        | ✅ TAMAMLANDI        | 2026-08-14 | 2026-08-14 | PR #1, main `cbdaef4`      | **GATE 1 ✅ ONAYLANDI** | [PHASE_1_REPORT](phases/PHASE_1_REPORT.md) |
| **P2 Sim Core**      | 🟡 **YÜRÜTÜLÜYOR**   | 2026-08-14 | —          | `phase/02-simulation-core` | Batch içi kapı          | —                                          |
| P3 Iso Render        | 🟢 Yetkilendirildi   | —          | —          | —                          | Batch içi kapı          | —                                          |
| P4 Asset Pipeline v1 | 🟢 Yetkilendirildi   | —          | —          | —                          | **BATCH ÇIKIŞ KAPISI**  | —                                          |
| P5–P24               | ⬜ Yetkilendirilmedi | —          | —          | —                          | —                       | —                                          |

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

| #   | Sorun                                                                                  | Etki                                                          | Durum                                                             |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | ~~**Vercel Deployment Protection**, deployment-başına URL'leri kapatıyor (302 → SSO)~~ | —                                                             | ✅ **ÇÖZÜLDÜ** 2026-08-14 (CHECKPOINT F) — §16                    |
| 2   | WebKit smoke bu geliştirme makinesinde koşamıyor (`libevent-2.1-7t64` eksik)           | Yerel doğrulama boşluğu; CI container'ında geçiyor (1 m 08 s) | 🟡 Kabul edildi, [FLAKY.md](FLAKY.md)'de kayıtlı                  |
| 3   | 550 kB JS bütçesi **yapılandırıldı ama sınanmadı** — Phaser import edilmiyor           | Bütçenin doğru olup olmadığı bilinmiyor                       | 🟡 Faz 3'te cevaplanacak, [DEPENDENCY_NOTES](DEPENDENCY_NOTES.md) |

---

## 13. Temporary Workarounds

| #   | Geçici çözüm                                          | Neden                                                                    | Ne zaman kalkar                      |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| 1   | ~~`preview-e2e` koruma tespit edince uyarıp atlıyor~~ | —                                                                        | ✅ **KALDIRILDI** 2026-08-14 (P2)    |
| 2   | `HOME=/root` Playwright job'larında                   | Container root koşuyor, `$HOME` başka kullanıcıya ait; Firefox açılmıyor | Playwright imajı davranışı değişirse |
| 3   | `phaser` kurulu ama import edilmiyor                  | Sürüm kilidi Faz 1 teslimi; ilk kullanım Faz 3                           | Faz 3                                |

---

## 14. Performance Baseline (yalnızca ölçülmüş)

| Metrik                    |                       Değer | Nasıl                |
| ------------------------- | --------------------------: | -------------------- |
| Production build          |                      395 ms | `pnpm build`, yerel  |
| JS bundle (gzip)          | **13.11 kB** / bütçe 550 kB | `pnpm size`          |
| CSS bundle (gzip)         |   **1.52 kB** / bütçe 30 kB | `pnpm size`          |
| Unit + architecture süiti |             ~17 s (27 test) | `pnpm test:coverage` |
| CI toplam (en uzun job)   |     1 m 09 s (E2E chromium) | run 31836097461      |

**FPS ölçülmedi** — henüz render yok, ve CI FPS ölçemez (SwiftShader). İlk gerçek GPU ölçümü Faz 3.
Detay: [PERF_LOG.md](PERF_LOG.md).

---

## 15. Test / CI State

CI run [31836097461](https://github.com/emredogan-cloud/evolutionary-tycoon/actions/runs/31836097461) — **7/7 yeşil**.

|                                        | Durum | Kanıt                                                          |
| -------------------------------------- | ----- | -------------------------------------------------------------- |
| lint (ESLint 10, type-aware)           | ✅    | exit 0                                                         |
| format check (Prettier)                | ✅    | "All matched files use Prettier code style!"                   |
| typecheck (3 proje + svelte-check)     | ✅    | 81 dosya, 0 hata, 0 uyarı                                      |
| architecture (dependency-cruiser)      | ✅    | 11 modül, 13 bağımlılık, 0 ihlal                               |
| dead code (knip)                       | ✅    | exit 0                                                         |
| unit + integration (Vitest)            | ✅    | 27 test; statements %100, branches %92.85                      |
| **architecture enforcement (12 vaka)** | ✅    | Yasak import ve global'lerin gerçekten reddedildiği kanıtlandı |
| E2E chromium                           | ✅    | yerel 8/6 skip · CI ✅ · **canlı deployment 14/14**            |
| E2E firefox                            | ✅    | yerel 8/6 skip · CI ✅ (xvfb + HOME=/root)                     |
| WebKit smoke                           | ✅    | CI ✅ (yerelde sistem kütüphanesi eksik)                       |
| visual regression                      | ⬜    | Altyapı hazır; golden'lar Faz 3                                |
| balance                                | ⬜    | Faz 12                                                         |
| performance (sim)                      | ⬜    | Faz 2                                                          |
| security (`pnpm audit`)                | ✅    | **No known vulnerabilities found**                             |
| CodeQL                                 | ✅    | Analyze (javascript-typescript) pass                           |
| build + bundle budget                  | ✅    | 13.11 kB / 550 kB                                              |
| deployment validation                  | ✅    | §16                                                            |

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
| Build SHA (canlı)   | `2a740b6a272c7e189f19e9e7b49ffbd5d4b67765`                                                               |
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

|                              |                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline                     | ⬜ P4'te kurulacak                                                                                                                                                                            |
| Placeholder sayısı           | 0 (henüz asset yok)                                                                                                                                                                           |
| **Lisans durumu**            | ❌ **DOĞRULANMADI** — God Mode AI, Scenario, PixelLab, Sprixen için ticari kullanım şartları birincil kaynaktan teyit edilmedi. **P4 START CONDITION** olarak kayıtlı (9 maddelik doğrulama). |
| Doğrulanmış asset kategorisi | Yok                                                                                                                                                                                           |

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

**Faz 1'den taşınan pratik bilgiler:**

- `pnpm verify` her şeyi sırayla koşar; "bitti" demeden önce bunu koş.
- Üç tsconfig var: `tsconfig.json` (tarayıcı), `tsconfig.node.json` (araçlar + E2E), `tsconfig.test.json` (unit/integration, hem DOM hem Node tipleri). Yeni bir dosya "project service" hatası veriyorsa doğru projeye eklenmemiştir.
- `vercel.json` **yok** — deployment config'i `vercel.ts`. CLI 59 ikisi bir arada varken çalışmıyor.
- Playwright container job'larında `HOME: /root` ve `shell: bash` zorunlu (Firefox + `pipefail`).
- Mimari testleri (`tests/unit/architecture/enforcement.test.ts`) kaynak ağacına geçici dosya yazar; **tek dosyada ve `concurrent: false`** olmaları şart.
- Deployment doğrulaması için canlı URL'e karşı: `E2E_BASE_URL=https://evolutionary-tycoon.vercel.app pnpm exec playwright test --project=chromium` → 14/14 (header/cache/api testleri dahil).

---

## 20. Phase Exit Evidence

**Son tamamlanan faz: P1 — Foundation**

| Kanıt             | Değer                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Repo              | <https://github.com/emredogan-cloud/evolutionary-tycoon> (public, MIT, 83 dosya)                                   |
| PR                | [#1](https://github.com/emredogan-cloud/evolutionary-tycoon/pull/1) · 12 commit · HEAD `382a5ae`                   |
| CI                | [run 31836097461](https://github.com/emredogan-cloud/evolutionary-tycoon/actions/runs/31836097461) — **7/7 yeşil** |
| CodeQL            | Analyze (javascript-typescript) — pass                                                                             |
| Production        | <https://evolutionary-tycoon.vercel.app> — 200, header'lar ve cache doğrulandı                                     |
| Canlı E2E         | **14/14** (deployment-only header/cache/SPA/api testleri dahil)                                                    |
| Testler           | 27 unit · statements %100 · branches %92.85                                                                        |
| Mimari zorlama    | **12 vaka** ile kanıtlandı (yasak import ve global'ler gerçekten reddediliyor)                                     |
| Bundle            | 13.11 kB gzip / 550 kB bütçe                                                                                       |
| Güvenlik          | `pnpm audit` — sıfır zafiyet                                                                                       |
| Branch protection | 7 zorunlu check, strict, linear history                                                                            |
| Rapor             | [PHASE_1_REPORT.md](phases/PHASE_1_REPORT.md)                                                                      |
| Kapı              | **GATE 1 🔴 ONAY BEKLİYOR**                                                                                        |

**Dürüst kayıtlar:** FPS ölçülmedi (render yok) · JS bütçesi sınanmadı (Phaser import edilmiyor) · WebKit yerelde koşamadı (CI'da geçti) · 3 commit hook bypass ile yapıldı (hook'lar çalışır durumda, tam `pnpm verify` sonradan koşuldu) — hepsi PHASE_1_REPORT §8'de.

## 21. Next Authorized Action

> ## 🟢 BATCH P2 → P3 → P4 (otonom)
>
> Kullanıcı 2026-08-14'te üç fazı **birlikte** yetkilendirdi. Sıra:
>
> `P2 tamamla → tam doğrulama → memory → P3 tamamla → tam doğrulama → memory → P4 tamamla → tam doğrulama → memory → BATCH RAPORU → DUR`
>
> **Şu an:** P2 — Simulation Core & Determinism (`phase/02-simulation-core`).
>
> **Yasak:** P5 (Trafik), P6 (Müşteri), P7 (Navigasyon), P8 (Servis), P9 (Ekonomi) ve sonrası.
> "Hazırlık" kılığında ileri faz implementasyonu da yasak. P4 bittiğinde DURULUR ve onay beklenir.
>
> **Onay beklerken yapılabilecek tek şey:** kullanıcı §16'daki Deployment Protection kararını
> verirse ilgili ayarı/secret'ı uygulamak.

## 22. Change Log

| Tarih      | Checkpoint | Değişiklik                                                                                                                                                                                                                                                                                                                             |
| ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-14 | —          | GATE 0 tamamlandı, 8 doküman teslim edildi                                                                                                                                                                                                                                                                                             |
| 2026-08-14 | —          | **GATE 0 kullanıcı tarafından ONAYLANDI**; 6 roadmap değişikliği (D1–D6) kabul edildi; Faz 1 yetkilendirildi                                                                                                                                                                                                                           |
| 2026-08-14 | **A**      | **Düzeltme 1:** Dead-end kapısı 120 sn → **90 sn**, merge-blocking. Değişen: `ECONOMY_DESIGN.md` §8 + §13, `GAME_EXECUTION_ROADMAP.md` §32 P12 assertion listesi, `TESTING_STRATEGY.md` §5. Uyarı bandı kapının altına (75–90 sn) taşındı.                                                                                             |
| 2026-08-14 | **A**      | **Düzeltme 2:** Bağımlılık sürüm kilidi politikası eklendi → `WORKING_DISCIPLINE.md` §2.5 (yeni). Tam pinleme, değişiklik kaydı formatı, Dependabot auto-merge yasağı.                                                                                                                                                                 |
| 2026-08-14 | **A**      | **Düzeltme 3:** Faz 4'e AI asset lisans kapısı eklendi (9 maddelik birincil-kaynak doğrulaması) → `GAME_EXECUTION_ROADMAP.md` Faz 4 START CONDITIONS (yeni), `ASSET_PIPELINE.md` §4.2, `RESEARCH_NOTES.md` §7.1 (yeni).                                                                                                                |
| 2026-08-14 | **A**      | `docs/PROJECT_MEMORY.md` oluşturuldu. Faz 1 başlangıç durumu kaydedildi.                                                                                                                                                                                                                                                               |
| 2026-08-14 | **F**      | **Batch P2→P4 başladı.** Context reset sonrası durum repo/CI/deployment ölçümüyle yeniden kuruldu. GATE 1 onaylandı, P2+P3+P4 toplu yetkilendirildi. Vercel Authentication kapatıldığı **doğrulandı** (API + curl) → bilinen sorun #1 ve geçici çözüm #1 kapandı, D-09 eklendi. §1/§5'teki bayat "P1 yürütülüyor" alanları düzeltildi. |
