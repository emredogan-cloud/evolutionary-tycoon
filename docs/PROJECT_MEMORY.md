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

|                    |                                                                                   |
| ------------------ | --------------------------------------------------------------------------------- |
| **Proje adı**      | Evolutionary Tycoon                                                               |
| **Repository**     | `https://github.com/emredogan-cloud/evolutionary-tycoon` (Faz 1'de oluşturulacak) |
| **Sürüm**          | 0.1.0 (Faz 1 hedefi)                                                              |
| **Mevcut faz**     | **PHASE 1 — Foundation: Repository + CI/CD + Testing + Deployment**               |
| **Mevcut kapı**    | GATE 0 ✅ ONAYLANDI (2026-08-14) → GATE 1 açık                                    |
| **Durum**          | 🟡 Faz 1 yürütülüyor                                                              |
| **Son güncelleme** | 2026-08-14 — CHECKPOINT A                                                         |
| **Son commit SHA** | — (henüz commit yok)                                                              |
| **Yerel dizin**    | `/home/emre/Downloads/Evolutionary-Tycoon`                                        |

---

## 2. Current Mission

Hiç oyun kodu yazmadan, projeyi taşıyacak mühendislik temelini kurmak: public repo, katı TypeScript,
tip-farkında lint, **makine tarafından zorlanan katman sınırları**, test altyapısı (Vitest + Playwright),
GitHub Actions CI, üretim build'i, Vercel preview + production deployment, ve doğrulanmış sağlık kontrolü.

**Faz 1'in ürünü görsel olarak minimaldir. Mühendislik temeli güçlü olmalıdır.**

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

| Faz                  | Durum                | Başlangıç  | Bitiş      | Commit/PR  | Kapı                    | Kanıt                  |
| -------------------- | -------------------- | ---------- | ---------- | ---------- | ----------------------- | ---------------------- |
| P0 Research & Design | ✅ TAMAMLANDI        | 2026-08-14 | 2026-08-14 | (pre-repo) | **GATE 0 ✅ ONAYLANDI** | 8 doküman, ~55k kelime |
| **P1 Foundation**    | 🟡 **YÜRÜTÜLÜYOR**   | 2026-08-14 | —          | —          | GATE 1 açık             | —                      |
| P2 Sim Core          | ⬜ Yetkilendirilmedi | —          | —          | —          | —                       | —                      |
| P3–P24               | ⬜ Yetkilendirilmedi | —          | —          | —          | —                       | —                      |

**Onaylı roadmap:** 25 faz (P0–P24). Orijinal 22 fazlık yapıya **dönülmeyecek**.
Onaylı 6 değişiklik: D1 (yeni P2 Sim Core) · D2 (Pathfinding→P7) · D3 (Asset P4+P16) · D4 (Economy P9+P12+P13) · D5 (Employee AI, Evolution'dan önce) · D6 (P9 sonunda Vertical Slice Kapısı).

---

## 6. Current Phase — PHASE 1

**Yetkilendirilmiş kapsam:** Yalnızca mühendislik temeli. **Sıfır oyun kodu.**

Açıkça yasak: simülasyon implementasyonu · entity · trafik · müşteri · restoran · ekonomi ·
oyun sahnesi · üretim asset'i · "altyapı kılığında" Faz 2+ özelliği.

**38 teslim kalemi** — [GAME_EXECUTION_ROADMAP Faz 1](GAME_EXECUTION_ROADMAP.md#phase-1--foundation-repo--cicd--testing--deployment)

**Başlangıç ortamı (doğrulandı, 2026-08-14):**

```
node        v24.13.1
npm         11.8.0
pnpm        10.33.4
git         2.43.0
gh          2.45.0    → emredogan-cloud (scopes: gist, read:org, repo, workflow)
vercel CLI  56.5.0 (global)  → repo'da 59.0.0 pinlenecek (§8 D-04)
disk        502 GB boş
repo        emredogan-cloud/evolutionary-tycoon → HENÜZ YOK (doğrulandı: gh repo view → 404)
```

**Başlangıç CI durumu:** Yok (repo yok).

**Bilinen faz riskleri:** [§11](#11-risks) R-P1-01..05

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

Yok. (Faz 1 henüz implementasyona geçmedi.)

---

## 13. Temporary Workarounds

Yok.

---

## 14. Performance Baseline (yalnızca ölçülmüş)

Ölçüm yok. Faz 1'de bundle boyutu ve build süresi ilk kez ölçülecek.
Gerçek GPU FPS ölçümü Faz 3'ten itibaren, [PERF_LOG.md](PERF_LOG.md)'de.

**CI'da FPS ölçülmez ve iddia edilmez** (SwiftShader).

---

## 15. Test / CI State

|                                     | Durum                    |
| ----------------------------------- | ------------------------ |
| lint                                | ⬜ Kurulmadı             |
| format check                        | ⬜ Kurulmadı             |
| typecheck                           | ⬜ Kurulmadı             |
| dependency architecture (depcruise) | ⬜ Kurulmadı             |
| dead code (knip)                    | ⬜ Kurulmadı             |
| unit (vitest)                       | ⬜ Kurulmadı             |
| determinism                         | ⬜ P2'de (altyapı P1'de) |
| E2E (playwright)                    | ⬜ Kurulmadı             |
| visual regression                   | ⬜ P3'te (altyapı P1'de) |
| balance                             | ⬜ P12'de                |
| performance                         | ⬜ Kurulmadı             |
| security (audit + CodeQL)           | ⬜ Kurulmadı             |
| build                               | ⬜ Kurulmadı             |
| deployment validation               | ⬜ Kurulmadı             |

---

## 16. Deployment State

|                |                                                                                     |
| -------------- | ----------------------------------------------------------------------------------- |
| Sağlayıcı      | Vercel (onaylı)                                                                     |
| Vercel hesabı  | `emre30283-4955` (CLI oturumu açık, doğrulandı)                                     |
| Plan           | Hobby — ⚠ **ticari kullanıma kapalı**; monetizasyon öncesi Pro gerekli (P23 görevi) |
| Proje          | ⬜ Henüz bağlanmadı                                                                 |
| Preview URL    | —                                                                                   |
| Production URL | —                                                                                   |
| Build SHA      | —                                                                                   |
| Health durumu  | —                                                                                   |

---

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

---

## 20. Phase Exit Evidence

**Son tamamlanan faz: P0 — Research & Game Design**

| Kanıt             | Değer                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Teslim            | 8 doküman, 8.079 satır, ~55.000 kelime                                                             |
| Sürüm doğrulaması | npm registry canlı sorgu, 2026-08-14                                                               |
| Yapısal doğrulama | 25 faz başlığı, 37 bölüm, 24 AI yürütme prompt'u (grep ile sayıldı)                                |
| Self-audit        | §37, 15 kontrol, 11'inde sorun bulundu ve revize edildi, 5 çözülmemiş zayıflık dürüstçe raporlandı |
| Kapı              | **GATE 0 ✅ ONAYLANDI** — kullanıcı, 6 roadmap değişikliğini + Faz 1 başlangıcını açıkça onayladı  |

---

## 21. Next Authorized Action

> **PHASE 1 — Foundation: Repository + CI/CD + Testing + Deployment**
>
> Faz 1'in 38 teslim kalemini tamamla, DoD'nin her maddesini kanıtla, `docs/phases/PHASE_1_REPORT.md` yaz, **DUR.**
>
> **PHASE 2 YETKİLENDİRİLMEMİŞTİR.** "tamam", "iyi", "güzel" gibi ifadeler Faz 2 için yetki sayılmaz.

---

## 22. Change Log

| Tarih      | Checkpoint | Değişiklik                                                                                                                                                                                                                                 |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-14 | —          | GATE 0 tamamlandı, 8 doküman teslim edildi                                                                                                                                                                                                 |
| 2026-08-14 | —          | **GATE 0 kullanıcı tarafından ONAYLANDI**; 6 roadmap değişikliği (D1–D6) kabul edildi; Faz 1 yetkilendirildi                                                                                                                               |
| 2026-08-14 | **A**      | **Düzeltme 1:** Dead-end kapısı 120 sn → **90 sn**, merge-blocking. Değişen: `ECONOMY_DESIGN.md` §8 + §13, `GAME_EXECUTION_ROADMAP.md` §32 P12 assertion listesi, `TESTING_STRATEGY.md` §5. Uyarı bandı kapının altına (75–90 sn) taşındı. |
| 2026-08-14 | **A**      | **Düzeltme 2:** Bağımlılık sürüm kilidi politikası eklendi → `WORKING_DISCIPLINE.md` §2.5 (yeni). Tam pinleme, değişiklik kaydı formatı, Dependabot auto-merge yasağı.                                                                     |
| 2026-08-14 | **A**      | **Düzeltme 3:** Faz 4'e AI asset lisans kapısı eklendi (9 maddelik birincil-kaynak doğrulaması) → `GAME_EXECUTION_ROADMAP.md` Faz 4 START CONDITIONS (yeni), `ASSET_PIPELINE.md` §4.2, `RESEARCH_NOTES.md` §7.1 (yeni).                    |
| 2026-08-14 | **A**      | `docs/PROJECT_MEMORY.md` oluşturuldu. Faz 1 başlangıç durumu kaydedildi.                                                                                                                                                                   |
