# GAME EXECUTION ROADMAP — Evolutionary Tycoon

**Sürüm:** 1.0 · **Tarih:** 2026-08-14 · **Durum:** 🔴 **GATE 0 — KULLANICI ONAYI BEKLİYOR**
**Yazan:** Principal Game Architect (GATE 0 teslimi)
**Kod yazılmadı. Repo oluşturulmadı. Faz 1 başlamadı.**

**Kardeş dokümanlar:**
[WORKING_DISCIPLINE](WORKING_DISCIPLINE.md) · [GAME_DESIGN_DOCUMENT](GAME_DESIGN_DOCUMENT.md) · [TECHNICAL_ARCHITECTURE](TECHNICAL_ARCHITECTURE.md) · [ECONOMY_DESIGN](ECONOMY_DESIGN.md) · [ASSET_PIPELINE](ASSET_PIPELINE.md) · [TESTING_STRATEGY](TESTING_STRATEGY.md) · [RESEARCH_NOTES](RESEARCH_NOTES.md)

---

## 1. Executive Summary

**Evolutionary Tycoon**, yol kenarındaki minik bir tezgâhın, önünden fiziksel olarak akan trafiği müşteriye çevirerek bir restoran imparatorluğuna dönüştüğü, 2D izometrik bir tarayıcı yönetim oyunudur.

**Ne yapıyoruz:** Tür standardının belirgin biçimde üstünde görünen, gerçek bir simülasyon üzerine kurulu, tarayıcıda anında oynanabilen bir tycoon oyunu.

**Neyi farklı yapıyoruz:** Türdeki oyunlarda talep bir spawn timer'dan gelir. Burada talep **görülebilir, izlenebilir ve etkilenebilir** bir araç akışıdır. Bütün oynanış bu tek farkın etrafında kurulur.

**Nasıl inşa ediyoruz:** Motordan tamamen bağımsız, deterministik, saf TypeScript bir simülasyon çekirdeği (Phaser 4 sadece çiziyor). Bu tek karar; headless testi, CI'da ekonomi doğrulamasını, piksel-kesin görsel regresyonu, birebir tekrar üretilebilir bug raporlarını ve "gün tekrarı" oyun özelliğini aynı anda mümkün kılıyor.

**Yığın:** TypeScript 6.0.3 · Vite 8.2.1 · Phaser 4.2.1 (WebGL2) · Svelte 5.56 (DOM UI) · Vitest 4.1 · Playwright 1.62 · Vercel (statik). Backend yok (tek 5 satırlık `/api/time` hariç).

**Süre yapısı:** 25 faz (P0–P24), her biri kapı (gate) ile ayrılmış. Faz 9 sonunda zorunlu bir **Vertical Slice Kapısı** var: oyun o noktada eğlenceli, görsel olarak ikna edici ve teknik olarak stabil değilse **genişleme durur**.

**Bu dokümanın statüsü:** Onaylanana kadar hiçbir kod yazılmayacak. Onay sonrası yalnızca Faz 1 yürütülecek, sonra tekrar durulacak.

---

## 2. Game Vision

> Yol kenarında oturuyorsun. Önünden arabalar geçiyor. Bazıları duruyor — çünkü sen onları durdurdun.

Küçük, yaşayan, izometrik bir minyatür dünya. Yolun çapraz aktığı, restoranın yanında büyüdüğü, her aracın bir fırsat olduğu bir pencere. Oyuncu bir tabloya bakmaz; bir sisteme bakar ve o sistemi eliyle şekillendirir.

**Beş yıl sonra hatırlanacak şey:** "O oyun vardı ya — arabaların gerçekten fren yapıp sana geldiği."

**Detay:** [GAME_DESIGN_DOCUMENT §1–2](GAME_DESIGN_DOCUMENT.md)

---

## 3. Target Player

18–40 yaş, tarayıcıda kısa oturumlar oynayan casual/mid-core oyuncu; tycoon ve yönetim türüne aşina; sistem optimize etmekten keyif alıyor. İkincil: idle/incremental oyuncuları ve trafik/şehir simülasyonu izlemeyi seven "ambient" oyuncular.

Oturum: 3–8 dk tipik, günde 2–4 kez. Cihaz karması hedefi %55 masaüstü / %45 mobil tarayıcı. İndirme yok, kayıt yok, 5 saniyede oyunda.

**Detay:** [GAME_DESIGN_DOCUMENT §3](GAME_DESIGN_DOCUMENT.md#3-hedef-oyuncu)

---

## 4. Core Fantasy

**"Bu yoldan geçen arabaları ben durduruyorum."**

Sahiplik değil, **çekim gücü** fantezisi. Oyuncu bir restoran sahibi olmaktan çok, bir akışı yönlendiren biri gibi hisseder. Tabelayı büyütür, arabalar yavaşlar. Kuyruk uzar, arabalar vazgeçer. Her sayı, ekranda görülebilen bir davranışa karşılık gelir.

---

## 5. Core Gameplay Loop

```
Trafik → Karar noktası → Dönüşüm testi → Sinyal + yavaşlama → Giriş
  → Park / Drive-thru → Sipariş → Hazırlık → Teslim → Ödeme + bahşiş
  → Memnuniyet → Ayrılış → Gelir → Yatırım → Fiziksel evrim → Daha çok trafik
```

Üç iç içe geri bildirim halkası: **anlık** (0–2 sn, bir aracın fren yapması), **kısa** (30 sn–2 dk, bir siparişin tamamlanması), **orta** (5–20 dk, bir darboğazın çözülmesi). Bir tycoon oyunu bu üçünden biri kırıldığında sıkıcılaşır; tasarım incelemelerinde üçü ayrı ayrı sorgulanır.

**Ana stratejik gerilim:** Drive-thru (yüksek throughput, düşük marj) ve dine-in (yüksek marj, yavaş) aynı mutfağı paylaşır. Tek doğru cevabı olmayan sürekli bir karar.

**Detay:** [GAME_DESIGN_DOCUMENT §5–6](GAME_DESIGN_DOCUMENT.md#5-core-gameplay-loop)

---

## 6. Game Systems

| Sistem                             | Kısa tanım                                                    | Faz     |
| ---------------------------------- | ------------------------------------------------------------- | ------- |
| Deterministik simülasyon çekirdeği | 20 Hz sabit tick, tohumlanmış RNG, command log                | P2      |
| İzometrik render                   | 2:1 dimetrik, depth sort, katmanlı sahne                      | P3      |
| Trafik                             | Şerit spline, IDM araç-takip, Poisson spawn, gün eğrisi       | P5      |
| Dönüşüm                            | 10 çarpanlı, tamamen görünür ve etkilenebilir olasılık modeli | P6      |
| Müşteri                            | FSM, iki kanal, sabır, park, kuyruk                           | P6, P8  |
| Navigasyon                         | Şerit + manevra spline'ları + flow field + A* fallback        | P7      |
| Mutfak / servis                    | İstasyon rezervasyonu, hazırlık, pass, sıcaklık               | P8      |
| Ekonomi                            | Config-driven, tavanlı, balance simülatörü ile doğrulanan     | P9, P12 |
| Yükseltme                          | 5 aile, azalan getiri, dünya-içi arayüz                       | P9, P13 |
| Çalışan AI                         | Ortak FSM iskeleti + rol görev tabloları + TaskBoard          | P10     |
| Evrim                              | 4 aşama, aynı arsada maskeli inşaat                           | P11     |
| Memnuniyet                         | 7 girdili, arketip-ağırlıklı model                            | P8, P12 |
| Offline                            | Ölçülen throughput × %40, 8 saat tavan, sınırlayıcı analizi   | P14     |
| Olaylar / hava                     | Deterministik takvim + tohumlanmış varyans                    | P15     |
| Animasyon                          | Doll rig (parça tabanlı), prosedürel + keyframe               | P17     |
| Ses                                | Phaser SoundManager + AudioDirector (ducking, throttle)       | P17     |
| UI                                 | Svelte 5 DOM overlay, dünya-içi yükseltme kartları            | P18     |
| Kalıcılık                          | IndexedDB, versiyonlu, migration zincirli, yedekli            | P2, P19 |

---

## 7. Progression

Dört aşama, her biri bir öncekinin darboğazını çözüp yenisini açar:

| Aşama              | Süre      | Çözülen darboğaz              | Açılan darboğaz            | Yeni sistem                  |
| ------------------ | --------- | ----------------------------- | -------------------------- | ---------------------------- |
| 1 Roadside Stand   | 12–18 dk  | —                             | Oyuncunun tıklama hızı     | Core loop                    |
| 2 Food Truck       | 30–45 dk  | Manuel hazırlık (aşçı)        | İstasyon sayısı            | Çalışan, park, kuyruk        |
| 3 Small Diner      | 2.5–4 sa  | İstasyon (endüstriyel mutfak) | Masa + garson koreografisi | Yürüyen müşteri, layout      |
| 4 Large Restaurant | Açık uçlu | Masa (genişleme)              | İki kanalın dengesi        | Drive-thru, vardiya, olaylar |

**Detay:** [GAME_DESIGN_DOCUMENT §7](GAME_DESIGN_DOCUMENT.md#7-evrim-sistemi--dört-aşama)

---

## 8. Economy

Tek yumuşak para birimi (₡). Gelir **yapısal olarak tavanlı** — üstel kaçış beş bağımsız frenle imkânsız kılınmış: (1) trafik oranı aşama başına sabit, (2) dönüşüm sert tavanlı, (3) kapasite sonlu, (4) kuyruk taşması kendi talebini keser, (5) maaş/bakım gelirle büyür.

Gelir eğrisi dört basamaklı bir S-eğrisi zinciridir; aşamalar arası oran 3.7× → 3.3× → 2.7× (azalan). Toplam max gelir ~₡483/dk — sayılar hiçbir zaman okunamaz hâle gelmez.

**Ekonomi CI'da test edilir:** 5 oyuncu politikasıyla 12 saatlik hızlandırılmış oynanış, tasarlanan zarfın dışına çıkarsa build kırmızı.

**Detay:** [ECONOMY_DESIGN.md](ECONOMY_DESIGN.md)

---

## 9. NPC Architecture

Tüm NPC'ler açık, unit-test edilebilir sonlu durum makineleri. **Işınlanma yasak** — her geçiş fiziksel hareket veya süre gerektirir; bu bir test tarafından zorlanır.

- **Müşteri:** `DRIVING → DECIDING → {PASSING_BY | ENTERING}` → kanal seçimi → iki ayrı alt-akış (drive-thru / dine-in) → `PAYING → REJOINING_ROAD`. Her bekleme durumundan `patience → ABANDONING` çıkışı var.
- **Çalışan:** Tek ortak `EmployeeBrain` iskeleti (`IDLE / MOVING / PERFORMING / BLOCKED`) + rol başına görev tablosu. Dört ayrı FSM yerine bir iskelet test edilir.
- **TaskBoard:** Görevler puanlanır (`aciliyet × ödül − mesafe × maliyet`), boştaki en uygun çalışana deterministik olarak atanır. "İki garson aynı masaya koşuyor" yapısal olarak imkânsız.

**Detay:** [GAME_DESIGN_DOCUMENT §8](GAME_DESIGN_DOCUMENT.md#8-npc-mimarisi--durum-makineleri)

---

## 10. Traffic Simulation

Rastgele değil; **tohumlanmış, deterministik, katmanlı**.

- İki şeritli yol, arc-length parametrize polyline spline.
- IDM-lite araç-takip modeli → gerçekçi akordeon tıkanma dalgaları.
- Deterministik Poisson spawn; oran = taban × gün eğrisi (24 nokta) × haftanın günü × hava × olay × aşama.
- 10 araç arketipi, her biri farklı dönüşüm eğilimi, fiyat toleransı ve memnuniyet ağırlıklarıyla.
- Dönüşüm: 10 çarpanlı formül; **her çarpan oyuncunun görebildiği ve etkileyebildiği bir şeye karşılık gelir.**

**Detay:** [GAME_DESIGN_DOCUMENT §9](GAME_DESIGN_DOCUMENT.md#9-trafik-simülasyonu)

---

## 11. Pathfinding

Üç katman, her biri farklı bir problem için — gerekçe [RESEARCH_NOTES §8](RESEARCH_NOTES.md#8-pathfinding-kanıt-ve-karar):

1. **Şerit spline'ları** (araçlar yolda) — arama yok, 1B ilerleme.
2. **Manevra spline'ları** (park, drive-thru) — önceden yazılmış Bézier'ler.
3. **Flow field** (yayalar) — 0.5 m grid, hedef başına önceden hesaplanmış vektör alanı, yalnızca layout değişiminde yeniden hesaplanır. + ayrım steering.
4. **A*** — yalnızca nadir dinamik hedefler için fallback.

Az hedef + çok ajan + küçük harita + nadir değişim = flow field'ın ders kitabı senaryosu. NavMesh reddedildi (aşırı mühendislik), saf A* reddedildi (aynı hedefe giden 40 müşteride tekrar arama).

---

## 12. Visual Direction

2:1 dimetrik izometrik, temiz-sıcak-hafif stilize illüstrasyon. Sabit kamera açısı, sabit ışık yönü (sol-üstten), kilitli 48 renkli palet, 2 px türetilmiş kontur, iç çizgi yok.

**Zemin tilemap değil.** Her evrim aşaması için elle kompoze edilmiş 2–6 büyük statik bake. Bu hem `TilemapGPULayer`'ın izometriği desteklememesinden ([RESEARCH_NOTES §4](RESEARCH_NOTES.md#4-kritik-bulgu-3--phaser-4ün-hızlı-yolları-isometrik-aktörler-için-kullanılamaz)) hem de tile tekrarının türün en belirgin görsel zayıflığı olmasından kaynaklanıyor.

**Detay:** [ASSET_PIPELINE §1, §5](ASSET_PIPELINE.md#1-görsel-yön-art-direction-bible)

---

## 13. UI/UX Direction

Oyun görsel olarak baskın kalır; UI ekranın en fazla %22'sini (masaüstü) / %28'ini (mobil) kaplar — bu ölçülen bir kısıt.

- **Modal yok.** Yükseltmeler dünyadaki nesneye tıklanarak, bağlamsal kartlarla yapılır.
- **Dönüşüm Analizi paneli** — imza özellik: son 100 aracın neden dönmediğini çarpan bazında gösterir. Ne yapacağını söylemez, ne olduğunu söyler.
- **"Uzaktayken" raporu** kazancı değil **sınırlayıcıyı** öne çıkarır.
- DOM overlay (Svelte), canvas-içi UI değil — a11y, responsive ve E2E testi için.

**Detay:** [GAME_DESIGN_DOCUMENT §14](GAME_DESIGN_DOCUMENT.md#14-ui--ux-yönü)

---

## 14. Animation Strategy

**Kare-kare sprite sheet kullanılmıyor.** Parça tabanlı kendi "Doll rig" sistemimiz.

Üç kısıt aynı çözüme işaret etti: Spine ücretli (kullanıcı başına lisans), DragonBones ölü, ve AI araçları kare-kare tutarlı animasyon üretemiyor ([RESEARCH_NOTES §6–7](RESEARCH_NOTES.md#6-animasyon-iskelet-animasyon-araçlarının-durumu)).

Sonuç: 8 elle yazılmış klip + 3 prosedürel klip, ~96 sprite'lık bir parça setinden **1.920 görsel olarak farklı karakter**. Runtime saf matematik → unit test edilebilir.

---

## 15. Audio Strategy

Phaser'ın yerleşik WebAudio yöneticisi (ekstra bağımlılık yok) + ince bir `AudioDirector`: kategori ducking, mesafe bazlı ses, aynı SFX'in 400 ms içinde tekrarını engelleyen throttle, ±%6 pitch varyasyonu.

Yedi katman: ambiyans, dünya SFX, mutfak, müşteri (dilsiz vokalizasyon — lokalize edilmez), UI, ilerleme, müzik. Tüm sesler OGG + M4A çift formatta (Safari uyumu).

---

## 16. Asset Pipeline

`source → validate → process (sharp) → atlas (free-tex-packer-core) → audio (ffmpeg) → manifest → report`

Her adım CI'da koşar ve bütçe aşımında durur. Doğrulama; şeffaflık, palet uyumu, boyut, ışık yönü, anchor, isimlendirme ve **uzun nesne bölme kuralını** kontrol eder.

**Uzun nesne bölme kuralı** özellikle önemli: 160 px'i (2× ölçek) aşan nesneler `_lower`/`_upper` olarak bölünmek zorunda. Bu, izometrik derinlik sıralamasındaki döngü problemini O(n²) bir algoritmayla çözmek yerine **var olmadan** engelliyor.

**Detay:** [ASSET_PIPELINE.md](ASSET_PIPELINE.md)

---

## 17. AI Asset Production

**AI statik üretir, animasyon üretmez, tileset üretmez.**

Tutarlılık "güzel görsel"le değil, **sözleşmeyle** sağlanır: 6–10 altın referans, değişmez prompt gövdesi, kategori bütünüyle batch üretim, 9 maddelik otomatik doğrulama, contact sheet ile toplu-karşılaştırmalı insan onayı, ve her asset'in provenance kaydı (araç, prompt hash, tarih, lisans, referans).

Araçlar: God Mode AI (izometrik 8-yön karakter), Scenario (art bible üzerinde stil kilidi), PixelLab (yedek). Lisanslar `assets/LICENSES.md`'de kayıtlı ve launch öncesi yeniden doğrulanıyor.

**Detay:** [ASSET_PIPELINE §4](ASSET_PIPELINE.md#4-ai-üretim-workflowu)

---

## 18. Technology Comparison

Tam puanlama tablosu: [TECHNICAL_ARCHITECTURE §1.1](TECHNICAL_ARCHITECTURE.md#11-puanlama-05-ağırlıklı).

|                  | Ağırlıklı puan /305 |
| ---------------- | ------------------: |
| **Phaser 4.2.1** |          **274** ✅ |
| PixiJS 8.19      |                 228 |
| Three.js         |                 189 |
| Custom WebGL2    |                 148 |

**Neden Phaser:** (1) Pixi bir renderer, Phaser bir framework — Pixi seçseydik sahne/girdi/kamera/tween/partikül/ses/loader'ı yazmak 4–6 hafta alırdı ve hiçbiri bu oyunun farklılaştırıcısı değil. (2) Phaser 4 tam bizim ihtiyaç duyduğumuz yerde yenilendi (WebGL2 RenderNode, cone lights, stencil, Mesh2D). (3) AI ajan uyumluluğu ölçülebilir bir teslim riski kriteri ve Phaser'ın doküman/örnek hacmi en yüksek.

**WebGPU kullanılmıyor:** Phaser 4 bir WebGL2 yeniden yazımı, WebGPU motoru değil; Firefox WebGPU'yu hâlâ default-off tutuyor; ve bizim darboğazımız GPU değil CPU. Bugün kazanç değil risk.

---

## 19. Final Technology Stack

| Katman           | Seçim                        | Sürüm (2026-08-14 doğrulandı)                           |
| ---------------- | ---------------------------- | ------------------------------------------------------- |
| Dil              | TypeScript                   | **6.0.3** (TS7 değil — typescript-eslint desteklemiyor) |
| Build            | Vite                         | 8.2.1                                                   |
| Motor            | Phaser (WebGL2)              | 4.2.1                                                   |
| UI               | Svelte 5 (runes)             | 5.56.9 + vite-plugin-svelte 7.3.0                       |
| Simülasyon       | Saf TypeScript               | —                                                       |
| Config doğrulama | Zod (dev-only)               | 4.4.3                                                   |
| Kalıcılık        | IndexedDB via `idb`          | 8.0.3                                                   |
| Ses              | Phaser SoundManager          | dahili                                                  |
| Animasyon        | Kendi Doll rig               | —                                                       |
| Test             | Vitest / Playwright          | 4.1.10 / 1.62.1                                         |
| Lint             | ESLint / typescript-eslint   | 10.8.1 / 8.67.0                                         |
| Mimari zorlama   | dependency-cruiser / knip    | 18.2.0 / 6.32.2                                         |
| Atlas            | free-tex-packer-core + sharp | 0.3.9 / 0.35.3                                          |
| Paket / Node     | pnpm / Node                  | 10.33.4 / 24.13.1                                       |
| Hosting          | Vercel (statik)              | —                                                       |

**Backend yok.** Supabase/PostgreSQL değerlendirildi ve reddedildi — MVP tek oyunculu. Tek istisna: 5 satırlık `/api/time` (offline doğrulama için sunucu zaman referansı).

**TypeScript 6 kararı:** TS 7.0 GA (8 Temmuz 2026, 8–12× hızlı) ama stabil programatik API'si yok, dolayısıyla typescript-eslint çalışmıyor (peer: `<6.1.0`). Deterministik simülasyon çekirdeğinde tip-farkında lint kuralları pazarlık dışı. Yükseltme tetikleyicisi dokümante edildi.

---

## 20. Architecture Diagram

Tam diyagram: [TECHNICAL_ARCHITECTURE §4](TECHNICAL_ARCHITECTURE.md#4-mimari-diyagram).

```
Oyuncu girdisi → Command → CommandLog → Sim.tick() → SimEvent[]
                                                        ├→ RenderBridge (Phaser)
                                                        ├→ UiBridge (Svelte)
                                                        ├→ AudioDirector
                                                        └→ Analytics

src/sim     saf TS   (Phaser/Svelte/DOM YASAK — CI zorlar)
src/render  Phaser   (sim'i yalnızca okur)
src/ui      Svelte   (sim'i import EDEMEZ — yalnızca bridge)
src/config  veri     (hiçbir şey import etmez)
```

---

## 21. Data Model

Save dosyası ~15 KB. **Transient state kaydedilmez** — yoldaki araçlar, yarım siparişler, yürüyen müşteriler yeniden oluşturulur. Yalnızca kalıcı durum: RNG state'leri, saat, ilerleme, ekonomi, layout, personel, istatistik, ayarlar.

Versiyonlu şema + zincirleme migration + her sürüm için commit edilmiş test fixture'ı + `v1 → current` zincirinin her CI koşusunda test edilmesi. Son 3 kayıt rotasyonlu yedek + CRC32 bozulma tespiti.

**Detay:** [TECHNICAL_ARCHITECTURE §8](TECHNICAL_ARCHITECTURE.md#8-veri-modeli-ve-kalıcılık)

---

## 22. Testing Architecture

~450 unit + ~90 integration + balance kapısı + sim benchmark + ~35 E2E (Chromium + Firefox) + ~25 visual golden (yalnızca Chromium, pinlenmiş container) + WebKit smoke + manuel checklist. Toplam CI hedefi < 12 dk.

**Kritik bulgu ve karşılığı:** CI'da headless Chromium SwiftShader kullanır (yazılım rasterizasyonu), Firefox `xvfb` gerektirir, WebKit headless canvas'ı ekran görüntüsünde göstermez. Bu yüzden: performans kapısı CI'da **headless simülasyon** üzerinden, visual regression **yalnızca Chromium'da pinlenmiş Docker imajında**, WebKit **yalnızca smoke**. CI hiçbir zaman FPS iddia etmez.

**Detay:** [TESTING_STRATEGY.md](TESTING_STRATEGY.md)

---

## 23. CI/CD Architecture

```
push/PR → ci.yml
  quality (lint, typecheck, depcruise, knip, secret scan)
  test (unit + integration + determinism, coverage gates)
  balance (5 politika, ekonomi zarfı)
  perf (sim benchmark, %15 regresyon eşiği)
  build (asset validate + build + size-limit)
  e2e (chromium | firefox matrix, pinlenmiş container)
  webkit-smoke
  visual (chromium, SwiftShader zorunlu)
  security (pnpm audit + CodeQL)

Vercel preview hazır → preview-e2e.yml
  /health.json buildSha doğrulama · gerçek CDN'e karşı E2E
  · güvenlik başlıkları · Cache-Control · Lighthouse

merge → main → production-smoke.yml
  /health.json · 5 smoke senaryosu · başarısızsa rollback talimatı
```

**Merge kapısı:** quality, test, balance, perf, build, e2e×2, visual, security — hepsi yeşil olmadan merge yok. WebKit smoke bilgilendirici.

---

## 24. Deployment Architecture

**Vercel (statik), birincil.** Fly.io reddedildi.

**Gerekçe:** MVP tamamen istemci taraflı statik bir uygulama. Fly.io'nun tek gerçek avantajı (container kontrolü, uzun ömürlü bağlantı) Faz 24'e kadar kullanılmıyor. Buna karşılık Vercel'in PR-başına preview deployment'ı bu projenin **faz kapısı iş akışının doğrudan bir parçası** — her fazın E2E'si gerçek bir preview URL'ine karşı koşacak. CLI zaten oturum açmış (`emre30283-4955`).

**Dokümante edilmiş uyarılar:**

- ⚠ **Vercel Hobby ticari kullanıma kapalı** (ödeme, reklam, bağış, affiliate dahil). Monetizasyon Faz 24'te değerlendiriliyorsa, **öncesinde Pro'ya geçiş bir görev olarak roadmap'te duruyor.**
- ⚠ **100 GB/ay bant genişliği** ≈ 8 MB'lık ilk yükleme için ~12.500 soğuk ziyaret. Bu yüzden asset bütçesi sadece performans değil **maliyet** kısıtı.
- 🚪 **Çıkış yolu baştan mimaride:** `VITE_ASSET_BASE_URL` env değişkeni. Bant genişliği bağlayıcı olursa `/assets/**` bir object store + CDN'e (R2/Bunny) tek satırlık değişiklikle taşınır.
- 🚪 Fly.io yeniden değerlendirme tetikleyicisi: gerçek zamanlı çok oyunculu veya kalıcı WebSocket gerektiren onaylı bir özellik.

---

## 25. Security

Orantılı strateji. Tek oyunculu bir oyunda hile yapan yalnızca kendi deneyimini bozar; DRM/obfuscation yatırımı haklı değil. Ama üç şey korunur:

| Korunan                                 | Nasıl                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Save bozulması** (gerçek ve sık risk) | CRC32 + şema versiyonu + son 3 kaydın rotasyonlu yedeği + nazik kurtarma akışı                                                |
| **Offline ödül sömürüsü**               | Sunucu zaman referansı (`/api/time`), 8 saat tavan, monotoniklik kontrolü, saat geri alınırsa 0 kazanç (ceza yok)             |
| **Web güvenliği**                       | Katı CSP, güvenlik başlıkları, `pnpm audit` + CodeQL + Dependabot, Svelte escaping, `{@html}` yasağı, üçüncü taraf script yok |

**Bilinçli olarak yapılmayanlar:** kod obfuscation, anti-debug, save şifreleme, bellek bütünlüğü. Bunlar oyuncuya karşı düşmanlıktır, güvenlik değil.

**Gelecek kancası:** Command log baştan var. Liderlik tablosu eklenirse sunucu log'u yeniden oynatıp doğrulayabilir — mimariyi değiştirmeden. Bugün maliyeti sıfır olan bir opsiyon.

---

## 26. Performance Budgets

| Metrik               |     Masaüstü |           Mobil | Zorlanma           |
| -------------------- | -----------: | --------------: | ------------------ |
| FPS p50 / p05        |      60 / 50 |         45 / 30 | Manuel, gerçek GPU |
| Frame time p95       |     ≤16.6 ms |          ≤22 ms | Manuel             |
| **Sim tick p95**     |  **≤2.0 ms** |         ≤3.5 ms | **CI**             |
| Sıcak döngü tahsisi  | **0 B/tick** |            aynı | **CI**             |
| Draw call            |          ≤60 |             ≤45 | Manuel             |
| JS heap (30 dk)      |      ≤220 MB |         ≤140 MB | Manuel             |
| Texture memory       |      ≤192 MB |          ≤96 MB | CI (atlas hesabı)  |
| İlk JS bundle (gzip) |      ≤550 KB |                 | **CI**             |
| Kritik yol asset     |        ≤4 MB |                 | **CI**             |
| Toplam asset         |       ≤28 MB |                 | **CI**             |
| TTI (hızlı 4G)       |         ≤4 s | ≤9 s (yavaş 4G) | Manuel             |

**Entity kapasitesi:** masaüstü 120 araç + 60 yaya + 80 prop + 400 partikül; mobil yarısı.

**Dört degradasyon kademesi** (Ultra/High/Medium/Low), boot'ta otomatik seçilir, 5 sn boyunca p05 FPS hedefin %70'inin altındaysa bir kademe düşer. Otomatik yükseltme yok (salınım önleme).

---

## 27. Browser Compatibility

| Tarayıcı                           | Min      | Kademe | Test                                 |
| ---------------------------------- | -------- | ------ | ------------------------------------ |
| Chrome / Edge desktop              | 120      | A      | E2E + visual + perf                  |
| Firefox desktop                    | 128      | A      | E2E (xvfb)                           |
| Safari macOS                       | 17       | A      | Smoke (canvas screenshot alınamıyor) |
| Chrome Android                     | 120      | A/B    | Manuel gerçek cihaz + emülasyon E2E  |
| Safari iOS                         | 17       | A/B    | Manuel gerçek cihaz                  |
| Samsung Internet / Firefox Android | 24 / 128 | B      | Manuel                               |
| **WebGL2 yok**                     | —        | **C**  | Nazik "desteklenmiyor" ekranı        |

**Kademe C zorunlu:** Phaser 4'te Canvas renderer deprecated — WebGL2 olmadan oyun çalışmaz. Siyah ekran yerine sebebini açıklayan bir sayfa gösterilir.

---

## 28. Monetization

**MVP'de yok.** Gerekçe: retention önce oyunun kendisiyle kazanılır; kanıtlanmamış bir oyuna monetizasyon eklemek hem oyunu bozar hem yanlış sinyal verir. Ayrıca Vercel Hobby ticari kullanıma kapalı — bu aynı zamanda bir altyapı kararı.

Faz 24'te öncelik sırasıyla değerlendirilecek: (1) kozmetik, (2) tek seferlik Supporter satın alımı, (3) opsiyonel rewarded video — yalnızca _zaten kazanılacak_ şeyleri hızlandırmak için, (4) genişleme içeriği (yeni harita/mutfak).

**Kesinlikle yapılmayacaklar:** pay-to-win, enerji satışı, ilerleme kilidi, rastgele kutu, agresif interstitial, karanlık desen.

---

## 29. Retention

Hedefler: **D1 ≥ %35, D7 ≥ %14, D30 ≥ %6** — casual ortalamasının (D1 %30 / D7 %14 / D30 %7.5) üstü, top-20 arcade idle'ın (D1 %48–52) altı. Dürüst hedef.

İlk araç 8 saniyede gelir. İlk yükseltme 5 dakikada. Tek aktif hedef (birden fazla değil). 3 günlük hedef, kilometre taşları, araç arketipi koleksiyonu, ~40 keşif tabanlı başarım, olaylar, ve sınırlayıcıyı gösteren offline raporu.

**Bilinçli olarak eklenmeyecekler:** enerji/can sistemi, zorunlu bekleme kapısı, günlük giriş serisi cezası, FOMO sayacı, push bildirimi baskısı. Bunlar metriği kısa vadede yükseltir, oyunu kötüleştirir.

---

## 30. Analytics

Cookieless, kişisel veri yok, opt-out. 17 olay tanımlı ([GAME_DESIGN_DOCUMENT §21](GAME_DESIGN_DOCUMENT.md#21-analitik)).

**En değerli dört tasarım metriği:** `first_customer_served` süresi (onboarding sağlığı), `bottleneck_detected` dağılımı (denge), `offline_reward_claimed.limiter` (hangi kısıt en çok bağlıyor), evrim başına oynanma süresi (pacing).

---

## 31. Differentiation Strategy

Rakip analizi: [RESEARCH_NOTES §10](RESEARCH_NOTES.md#10-rakip--tür-analizi).

### 5 Oynanış Farklılaştırıcısı

1. **Trafik, talep eğrisinin kendisidir.** Spawn timer beklemiyorsun; fiziksel olarak simüle edilen, görülebilen bir akışı dönüştürüyorsun. Her yükseltme yolda gözle görülür bir değişiklik yaratıyor.
2. **Yol kenarı okunabilirliği gerçek bir mekanik.** Tabela boyutu, aydınlatma, şerit konumu ve bilboard mesafesi soyut "pazarlama puanı" değil; küçük bir tabela **kelimenin tam anlamıyla** arabaların seni fark etmemesi demek.
3. **İki kanal, tek mutfak.** Drive-thru (throughput, düşük marj, sıfır sabır) ve dine-in (marj, bahşiş, itibar) aynı sonlu kaynağı paylaşır. Tek bir "doğru" yükseltme sırası yok; oyun tarzına göre değişen sürekli bir karar.
4. **Başarı kendi darboğazını yaratır.** Kuyruğun yola taşarsa geçen araçların dönüşümü düşer. Görülebilir, anlaşılabilir bir negatif geri besleme halkası — ve üstel büyümenin mekanik panzehiri.
5. **Day Replay.** Her gün tohumlanmış ve deterministik. Bir yükseltme aldıktan sonra **aynı günü** yeniden koşturup gerçek farkı ölçebiliyorsun. Mimarinin bir yan ürününü tasarlanmış bir özelliğe çeviriyoruz.

### 5 Görsel Farklılaştırıcı

1. **Tile tekrarı yok.** Her aşamanın arsası elle kompoze edilmiş bake — tycoon türünün en belirgin ucuzluk işareti tamamen ortadan kalkıyor.
2. **Parça tabanlı karakter rig'i** → ~96 sprite'tan 1.920 görsel olarak farklı müşteri. Kalabalık gerçekten kalabalık görünüyor, kopyala-yapıştır değil.
3. **Fiziksel evrim.** Sahne değişmiyor; kamera sabit kalıyor ve yapı yerinde büyüyor (stencil maskeli inşaat). İlk günkü tezgâh bir köşede duruyor.
4. **Gün döngüsü tam sahne aydınlatma geçişi** — renk filtresi değil. Farlar, aydınlatmalı tabelalar, pencerelerden sızan ışık, uzayan gölgeler.
5. **Diegetik geri bildirim.** Memnuniyet, müşterinin beden dilinde ve aracın davranışında okunuyor. HUD'a bakmadan salonun havası hissediliyor.

### 5 UX Farklılaştırıcısı

1. **Modal spam yok.** Yükseltme dünyadaki nesnenin üzerinde. Oyun alanı hiç kapanmıyor.
2. **Dönüşüm Analizi paneli.** Türün en büyük frustrasyonunu (görünmez sistemler) doğrudan çözüyor: son 100 aracın neden dönmediğini çarpan bazında gösteriyor — ama ne yapman gerektiğini söylemiyor.
3. **"Uzaktayken" raporu sınırlayıcıyı gösteriyor.** Ödül ekranı değil, yatırım kararı ekranı.
4. **Tek kod tabanı mobil parite.** Ayrı bir kısıtlanmış mobil sürüm yok; aynı layout sistemi telefonda tek parmakla çalışıyor.
5. **Anında devam.** Service worker cache'iyle son kamera konumu ve durumla 2 saniyede oyunda. Splash kapısı yok.

### 5 Teknik Farklılaştırıcı

1. **Motordan bağımsız deterministik simülasyon çekirdeği.** Sıfır renderer importu — CI'da zorlanıyor. Headless test edilebilir, benchmark edilebilir, değiştirilebilir.
2. **Command-log mimarisi baştan.** Replay, deterministik E2E, birebir tekrar üretilebilir bug raporları ve gelecekte sunucu doğrulaması — hepsi bugün bedava.
3. **Sabit adımlı sim + interpolasyonlu render.** 30/60/144 Hz ekranlarda ve throttle edilmiş sekmelerde birebir aynı davranış.
4. **Deterministik visual-regression koşum takımı.** Donmuş saat + sabit seed + pinlenmiş Playwright container + zorunlu SwiftShader → bir WebGL canvas'ın ekran görüntüsü diff'i gerçekten anlamlı.
5. **CI'da ekonomi regresyon testi.** Balance simülatörü 5 oyuncu politikasıyla 12 saatlik oynanışı saniyeler içinde koşturuyor; progression eğrisi tasarlanan zarfın dışına çıkarsa build kırmızı. Denge, "elle oyna ve hisset"ten bir sözleşmeye dönüşüyor.

**Gimmick kontrolü:** Bu 20 maddenin her biri ya bir gerçek oyuncu problemini çözüyor ya da bir üretim riskini azaltıyor. "Farklı olmak için" eklenen hiçbir şey yok.

---

## 32. Complete Phase Roadmap

### 32.0 Faz yapısı değişikliği — ONAY GEREKTİRİR

Orijinal proje sözleşmesi 22 faz (P0–P21) tanımlıyordu. Araştırma, bağımlılık sırasında **altı sorun** ortaya çıkardı. Önerilen yapı **25 faz (P0–P24)**. Değişiklikler ve gerekçeleri:

| #      | Değişiklik                                                                 | Gerekçe                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1** | **Yeni P2: Simulation Core & Determinism** (render'dan önce)               | Deterministik çekirdek, roadmap'in geri kalanının tamamının önkoşulu. Render'ı önce yazarsak oyun mantığı Phaser sahnelerine sızar ve geri almak çok pahalı olur ([TECHNICAL_ARCHITECTURE §2](TECHNICAL_ARCHITECTURE.md#2-en-önemli-mimari-karar-motordan-bağımsız-deterministik-simülasyon)). Save v1 de buraya alındı (orijinal P16'dan), çünkü save formatı erken sabitlenmezse her faz migration borcu üretir. |
| **D2** | **Pathfinding P8 → P7'ye alındı** (Customer System'den hemen sonra)        | Orijinalde Pathfinding (P8), Customer System (P4) ve Food/Service (P5) sonrasında geliyordu. Ama müşteriler park yerinden kapıya **yürümek** zorunda. Pathfinding olmadan Customer System yazılırsa geçici bir yürüme çözümü yazılır ve sonra atılır.                                                                                                                                                              |
| **D3** | **Asset Pipeline ikiye bölündü: P4 (v1) + P16 (v2)**                       | Orijinalde P13'teydi. Ama Vertical Slice Kapısı'nın (Faz 9) kriterlerinden biri "ekran görüntüsü tür ortalamasının görsel olarak üstünde". Placeholder kutucuklarla bu değerlendirilemez. P4 = Aşama 1–2'nin gerçek sanatı + pipeline altyapısı; P16 = Aşama 3–4'ün tam üretimi.                                                                                                                                   |
| **D4** | **Economy/Upgrade üçe bölündü: P9 (v1) + P12 (balancing) + P13 (v2)**      | Orijinalde P9 (Economy) ve P10 (Upgrade), P5 (Service Loop) sonrasındaydı — ama servis döngüsü fiyat ve maliyet olmadan kapanmıyor. P9 = döngüyü kapatan minimum ekonomi + ilk 6 yükseltme. P12 = balance simülatörü ve gerçek ayar (tüm sistemler var olduktan sonra). P13 = tam yükseltme ağacı.                                                                                                                 |
| **D5** | **Employee AI (orig P7) ve Restaurant Evolution (orig P6) yer değiştirdi** | Aşama 3 (Diner) evrimi **garsonları tanıtıyor**. Çalışan AI var olmadan Aşama 3'e evrim yazılamaz.                                                                                                                                                                                                                                                                                                                 |
| **D6** | **Faz 9 sonuna zorunlu VERTICAL SLICE KAPISI eklendi**                     | Orijinal sözleşme vertical slice'ı istiyordu ama bir faza bağlamamıştı. Bir kapıya bağlanmayan kriter, uygulanmayan kriterdir.                                                                                                                                                                                                                                                                                     |

**Orijinal → önerilen eşleme (hiçbir faz düşürülmedi):**

| Orijinal         | Önerilen               |     | Orijinal                  | Önerilen                         |
| ---------------- | ---------------------- | --- | ------------------------- | -------------------------------- |
| P0 Research      | **P0**                 |     | P11 Offline               | **P14**                          |
| P1 Foundation    | **P1**                 |     | P12 Adv. Traffic/Events   | **P15**                          |
| —                | **P2** Sim Core ← yeni |     | P13 Visual Asset Pipeline | **P4** + **P16**                 |
| P2 Rendering/Iso | **P3**                 |     | P14 Animation/VFX/Audio   | **P17**                          |
| P3 Traffic       | **P5**                 |     | P15 Premium UI/UX         | **P18**                          |
| P4 Customer      | **P6**                 |     | P16 Save/Account/Cloud    | **P2** (local) + **P19** (cloud) |
| P5 Food/Service  | **P8**                 |     | P17 Performance           | **P20**                          |
| P6 Evolution     | **P11**                |     | P18 Security/Anti-Cheat   | **P21**                          |
| P7 Employee AI   | **P10**                |     | P19 Full QA               | **P22**                          |
| P8 Pathfinding   | **P7**                 |     | P20 Launch Prep           | **P23**                          |
| P9 Economy       | **P9** + **P12**       |     | P21 Post-Launch           | **P24**                          |
| P10 Upgrade      | **P9** + **P13**       |     |                           |                                  |

> ⚠ **Bu yapı değişikliği onayınıza sunulur.** Onaylamazsanız orijinal 22 fazlık sırayla ilerlenir; bu durumda D1–D5'in yarattığı riskler (atılacak geçici kod, geç fark edilen mimari sızıntı, değerlendirilemeyen vertical slice) kabul edilmiş olur.

---

### Faz özeti tablosu

| #   | Faz                                      | Tahmini iş    | Kapı                        |
| --- | ---------------------------------------- | ------------- | --------------------------- |
| 0   | Research & Game Design                   | ✅ tamamlandı | **GATE 0** ← şu an burada   |
| 1   | Foundation: Repo + CI/CD + Test + Deploy | Küçük-orta    | GATE 1                      |
| 2   | Simulation Core & Determinism            | Orta          | GATE 2                      |
| 3   | Isometric Rendering & World              | Orta          | GATE 3                      |
| 4   | Art Direction & Asset Pipeline v1        | Orta-büyük    | GATE 4                      |
| 5   | Traffic Simulation                       | Orta-büyük    | GATE 5                      |
| 6   | Customer System                          | Orta          | GATE 6                      |
| 7   | Navigation & Pathfinding                 | Orta          | GATE 7                      |
| 8   | Food / Order / Service Loop              | Orta-büyük    | GATE 8                      |
| 9   | Economy v1 & Upgrade System v1           | Orta          | **★ VERTICAL SLICE KAPISI** |
| 10  | Employee AI                              | Büyük         | GATE 10                     |
| 11  | Restaurant Evolution                     | Büyük         | GATE 11                     |
| 12  | Economy Balancing & Balance Simulator    | Orta          | GATE 12                     |
| 13  | Upgrade System v2 (tam ağaç)             | Orta          | GATE 13                     |
| 14  | Offline Progression                      | Küçük-orta    | GATE 14                     |
| 15  | Advanced Traffic / Events / Weather      | Orta          | GATE 15                     |
| 16  | Asset Pipeline v2 (Aşama 3–4 sanatı)     | Büyük         | GATE 16                     |
| 17  | Animation / VFX / Audio                  | Büyük         | GATE 17                     |
| 18  | Premium UI/UX + A11y + Responsive        | Büyük         | GATE 18                     |
| 19  | Save / Account / Cloud Sync (koşullu)    | Orta          | GATE 19                     |
| 20  | Performance Optimization                 | Orta          | GATE 20                     |
| 21  | Security / Anti-Cheat / Trust            | Küçük-orta    | GATE 21                     |
| 22  | Full QA / Cross-Browser Validation       | Orta          | GATE 22                     |
| 23  | Launch Preparation                       | Orta          | GATE 23                     |
| 24  | Post-Launch Growth                       | Sürekli       | —                           |

---

## PHASE 0 — RESEARCH & GAME DESIGN

**Durum: ✅ TAMAMLANDI — bu doküman seti teslimdir.**

### Objective

Oyun konseptini, tarayıcı-oyun teknoloji manzarasını ve rakip alanı kanıta dayalı olarak anlamak; tüm mimari ve tasarım kararlarını almak; 25 fazlık yürütülebilir roadmap'i üretmek.

### Player Value

Doğrudan yok — ama bu fazın kalitesi, oyuncunun 6 ay sonra oynayacağı şeyin kalitesini belirler.

### Business Value

Yanlış motor, yanlış mimari veya yanlış deployment seçiminin maliyeti fazlarca sürer. Bir haftalık araştırma, aylarca yeniden yazımı önler. Ayrıca üç kritik bulgu (TS7/lint, CI'da WebGL, Phaser GPU layer kısıtları) implementasyon sırasında keşfedilseydi her biri bir roadmap değişikliği gerektirirdi.

### Dependencies

Yok.

### Systems / Game Design / Technical Architecture / UI/UX / Assets / Animation / Audio / Data

Hepsi tasarlandı ve dokümante edildi — bkz. kardeş dokümanlar.

### Testing

Test stratejisi tasarlandı ([TESTING_STRATEGY.md](TESTING_STRATEGY.md)); henüz test yazılmadı.

### Performance / Security / Deployment

Bütçeler, tehdit modeli ve deployment mimarisi tanımlandı.

### Tasks

- [x] Konsept analizi
- [x] Teknoloji araştırması (npm registry canlı sorgu + web + resmî release notları)
- [x] Motor karşılaştırması ve puanlama
- [x] Rakip / tür analizi + retention benchmark'ları
- [x] Ekonomi modeli ve zarflar
- [x] NPC / trafik / pathfinding tasarımı
- [x] Asset pipeline ve AI üretim protokolü
- [x] Test ve CI/CD mimarisi
- [x] Performans bütçeleri ve tarayıcı matrisi
- [x] Risk register
- [x] 7 doküman + RESEARCH_NOTES
- [x] Roadmap self-audit

### Files / Modules Expected

```
docs/WORKING_DISCIPLINE.md · GAME_DESIGN_DOCUMENT.md · TECHNICAL_ARCHITECTURE.md
docs/ECONOMY_DESIGN.md · ASSET_PIPELINE.md · TESTING_STRATEGY.md
docs/GAME_EXECUTION_ROADMAP.md · RESEARCH_NOTES.md
```

### Risks

| Risk                            | Durum                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Araştırma bulgularının eskimesi | Sürümler 2026-08-14'te canlı doğrulandı; her major fazda yeniden doğrulanacak |
| Aşırı planlama, yetersiz kanıt  | Her karar RESEARCH_NOTES'ta kaynağa bağlandı                                  |

### Rollback

Yok — kod yazılmadı.

### Success Metrics

- Her mimari karar bir kanıta bağlı ✅
- Üç kritik bulgu implementasyon öncesi yakalandı ✅
- Faz yapısı değişiklikleri açıkça teklif edildi ✅

### Definition of Done

- [x] 8 doküman yazıldı ve tutarlı
- [x] Sürümler canlı doğrulandı
- [x] Self-audit yapıldı ve roadmap revize edildi
- [ ] **Kullanıcı onayı** ← BEKLİYOR

---

## PHASE 1 — FOUNDATION: REPO + CI/CD + TESTING + DEPLOYMENT

### Objective

Hiç oyun kodu yazmadan, projeyi taşıyacak mühendislik temelini kurmak: public repo, katı TypeScript, lint, test, E2E, CI, production build, preview deployment ve mimari zorlama araçları.

### Player Value

Doğrudan yok. Görsel olarak minimal bir "shell" ekranı.

### Business Value

Bundan sonraki 23 fazın her biri bu temelin üstünde koşacak. Temel zayıfsa her faz onu tekrar tekrar öder. CI ve preview deployment, faz kapısı iş akışının **altyapısıdır** — onlar olmadan "tamamlandı" kanıtlanamaz.

### Dependencies

GATE 0 onayı.

### Systems

Yok (altyapı fazı).

### Game Design

Yok.

### Technical Architecture

- Dizin iskeleti ([TECHNICAL_ARCHITECTURE §14](TECHNICAL_ARCHITECTURE.md#14-proje-yapısı)) — boş ama katmanları tanımlı.
- `dependency-cruiser` kuralları **ilk günden** aktif: `src/sim` → phaser/svelte/render/ui importu yasak. Kurallar boş dizinlerde bile çalışır ve ilk ihlalde kırar.
- ESLint `no-restricted-globals` / `no-restricted-syntax`: `src/sim/**` içinde `Math.random`, `Date.now`, `new Date`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame` yasak.
- TypeScript **6.0.3** strict: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.

### UI/UX

Minimal shell: siyah zemin, oyun adı, sürüm/buildSha, "WebGL2 desteklenmiyor" fallback ekranı, yükleme göstergesi iskeleti.

### Assets

`assets/_placeholder/` dizini + `PLACEHOLDER_REGISTER.md`. Favicon ve temel ikonlar (gerçek, placeholder değil).

### Animation / Audio

Yok.

### Data

`/health.json` build sırasında üretilir: `{ version, buildSha, builtAt, assetManifestHash, schemaVersion }`.

### Testing

- Vitest kurulumu + 1 örnek unit test + coverage raporlama ve eşikler (başlangıçta düşük, faz başına yükselecek).
- Playwright kurulumu + 3 E2E: sayfa yükleniyor, `/health.json` doğru, konsol temiz.
- WebKit smoke projesi tanımlı.
- Visual regression altyapısı kurulu (henüz golden yok).
- **Docker container pinlenmiş:** `mcr.microsoft.com/playwright:v1.62.1-noble`.

### Performance

`size-limit` konfigürasyonu, bütçeler tanımlı (henüz Phaser yok, bu yüzden başlangıç bütçesi küçük). Bütçe aşımı build'i kırar.

### Security

- `.env.example`, `.gitignore`, secret tarama (pre-commit + CI).
- CSP ve güvenlik başlıkları `vercel.ts`'te tanımlı ve E2E ile doğrulanıyor.
- `pnpm audit` + CodeQL + Dependabot aktif.

### Deployment

- Vercel projesi bağlanır, preview + production ayarlanır.
- `vercel.ts` (@vercel/config): cache başlıkları, güvenlik başlıkları, SPA rewrite.
- İlk production deployment canlı ve sağlıklı.
- `/api/time` endpoint'i (5 satır) deploy edilir ve E2E ile doğrulanır.

### Tasks

1. Public GitHub repo oluştur (`emredogan-cloud/evolutionary-tycoon`), MIT veya uygun lisans, README.
2. `pnpm init`, Node 24 pinle (`.nvmrc`, `engines`), pnpm 10 pinle (`packageManager`).
3. TypeScript 6.0.3 + strict config.
4. Vite 8.2.1 + Svelte plugin + Phaser (henüz kullanılmıyor ama bundle bütçesi ölçülsün diye kurulur).
5. ESLint 10 + typescript-eslint 8.67 (type-aware) + Prettier + import sıralama.
6. `dependency-cruiser` + `knip` konfigürasyonu.
7. Vitest + coverage (v8) + eşikler.
8. Playwright + 3 proje (chromium, firefox, webkit-smoke) + Docker pinleme.
9. Husky + lint-staged + commitlint (Conventional Commits).
10. `size-limit` + bütçeler.
11. Dizin iskeleti + katman `index.ts` dosyaları + katman README'leri.
12. Shell uygulaması: WebGL2 yetenek tespiti, fallback ekranı, sürüm gösterimi.
13. `/health.json` üretimi (Vite plugin).
14. `api/time.ts`.
15. `.github/workflows/ci.yml`, `preview-e2e.yml`, `production-smoke.yml`, `codeql.yml`.
16. Vercel projesi + env değişkenleri + `vercel.ts`.
17. `CLAUDE.md` (ajan yönergesi: "önce docs/WORKING_DISCIPLINE.md oku").
18. `docs/DECISIONS/ADR-001..012.md` (GATE 0 kararlarının resmî kaydı).
19. `docs/PERF_LOG.md`, `docs/PLACEHOLDER_REGISTER.md`, `docs/FLAKY.md` iskeletleri.
20. Branch koruma kuralları (main korumalı, CI zorunlu).
21. İlk PR → CI yeşil → merge → production deploy → doğrula.

### Files / Modules Expected

```
package.json · pnpm-lock.yaml · .nvmrc · tsconfig.json · tsconfig.node.json
vite.config.ts · vitest.config.ts · playwright.config.ts · vercel.ts
eslint.config.js · .prettierrc · .dependency-cruiser.cjs · knip.json
.size-limit.json · commitlint.config.js · .husky/*
.github/workflows/{ci,preview-e2e,production-smoke,codeql}.yml
.github/dependabot.yml · .github/PULL_REQUEST_TEMPLATE.md
src/app/{main.ts,shell.ts,capability.ts} · src/{sim,render,ui,config,persistence,platform}/index.ts
public/index.html · public/favicon.svg · api/time.ts
tests/unit/example.test.ts · tests/e2e/{boot,health,console}.spec.ts
CLAUDE.md · README.md · LICENSE · .env.example
docs/DECISIONS/ADR-001..012.md · docs/PERF_LOG.md · docs/PLACEHOLDER_REGISTER.md · docs/FLAKY.md
```

### AI Coding Agent Execution Prompt

```
CONTEXT
You are implementing Phase 1 of Evolutionary Tycoon. Read docs/WORKING_DISCIPLINE.md
first — it is the binding operating contract. Then read docs/TECHNICAL_ARCHITECTURE.md
sections 3, 9, 11, 13, 14, 15.

SCOPE
Engineering foundation only. Write ZERO game logic. No Phaser scenes, no simulation,
no entities. If you find yourself writing gameplay, stop — that is Phase 2+.

EXACT VERSIONS (verified 2026-08-14, do not "upgrade" these)
  typescript@6.0.3          <- NOT 7.x. typescript-eslint requires <6.1.0.
  vite@8.2.1                phaser@4.2.1              svelte@5.56.9
  @sveltejs/vite-plugin-svelte@7.3.0                  vitest@4.1.10
  @playwright/test@1.62.1   eslint@10.8.1             typescript-eslint@8.67.0
  prettier@3.9.6            dependency-cruiser@18.2.0 knip@6.32.2
  zod@4.4.3                 idb@8.0.3
  Node 24.13.1, pnpm 10.33.4

REQUIREMENTS

1. TSCONFIG — strict plus:
   noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride,
   noFallthroughCasesInSwitch, verbatimModuleSyntax, isolatedModules,
   moduleResolution "bundler", target ES2022.

2. LAYER ENFORCEMENT (.dependency-cruiser.cjs) — these rules MUST fail the build:
   - src/sim/**   must not import: phaser, svelte, src/render/**, src/ui/**
   - src/ui/**    must not import: src/sim/**
   - src/config/**must not import: anything except zod and type-only files
   - no circular dependencies anywhere
   Create one placeholder file per layer so the rules are exercised in CI today,
   and add a deliberately-failing fixture test proving the rule fires.

3. ESLINT — beyond recommended + type-checked:
   - In src/sim/**: ban Math.random, Date.now, new Date(), performance.now,
     setTimeout, setInterval, requestAnimationFrame via no-restricted-globals
     and no-restricted-syntax. Include a clear error message naming the
     replacement (injected Clock / Rng).
   - Ban {@html} in Svelte.
   - Enable no-floating-promises, no-misused-promises, strict-boolean-expressions,
     no-unnecessary-condition.

4. SHELL APP (src/app):
   - Detect WebGL2. If unavailable, render a styled fallback page explaining why
     and listing supported browsers. Phaser 4 deprecated the Canvas renderer, so
     WebGL2 is mandatory — this page is a product requirement, not a nicety.
   - Show app version and buildSha (injected by Vite define from git).
   - Do NOT initialise Phaser yet.

5. /health.json — Vite plugin that emits at build time:
   { version, buildSha, builtAt, assetManifestHash: null, schemaVersion: 1 }

6. api/time.ts — Vercel Function, returns 204 with Cache-Control: no-store.
   The platform's Date response header is the payload.

7. vercel.ts using @vercel/config:
   - /assets/** -> public, max-age=31536000, immutable
   - /index.html and /health.json -> no-cache
   - CSP: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
     img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'
   - X-Content-Type-Options, Referrer-Policy, Permissions-Policy
   - SPA rewrite

8. CI (.github/workflows/ci.yml) — jobs: quality, test, build, e2e, security.
   - e2e runs in container mcr.microsoft.com/playwright:v1.62.1-noble
   - firefox job wraps the command in xvfb-run (WebGL is unstable headless otherwise)
   - webkit runs smoke only and must NOT take canvas screenshots
   - all jobs must be required for merge to main

9. preview-e2e.yml — on deployment_status success, run the boot/health/console
   E2E suite against the real Vercel preview URL, assert /health.json buildSha
   equals the commit SHA, and assert the security + Cache-Control headers.

10. TESTS to ship in this phase:
    unit:  a real test of the capability-detection module (mocked WebGL contexts)
    e2e:   page loads; /health.json matches build; zero console errors;
           WebGL2-unavailable path renders the fallback (override the context getter)

CONSTRAINTS
- Do not add dependencies beyond those listed without recording an ADR.
- Do not disable a lint rule to make code pass; fix the code.
- Every file you create must be reachable — knip must report zero unused exports.
- Commit in logical units with Conventional Commits.

DEFINITION OF DONE
Follow docs/WORKING_DISCIPLINE.md section 4 exactly. Every one of the 15 items
needs evidence in docs/phases/PHASE_1_REPORT.md. Then STOP and report.
Do not begin Phase 2.
```

### Risks

| Risk                                           | Olasılık | Etki  | Azaltma                                            |
| ---------------------------------------------- | -------- | ----- | -------------------------------------------------- |
| Vercel CLI 56.5.0 eski (59.0.0 mevcut)         | Yüksek   | Düşük | Faz başında güncelle; sürümü rapora yaz            |
| typescript-eslint tip-farkında lint yavaş      | Orta     | Düşük | Yalnızca CI'da tam tip-farkında; yerelde hızlı mod |
| Playwright Docker imajı CI'da yavaş            | Orta     | Düşük | Katman cache'i; imaj pinli                         |
| Firefox WebGL headless kararsızlığı            | Yüksek   | Orta  | `xvfb-run` ilk günden zorunlu                      |
| Branch koruma kuralları gh CLI ile kurulamıyor | Düşük    | Düşük | Elle kur, rapora yaz                               |

### Rollback

Repo yeni; herhangi bir adım geri alınabilir. Production deployment sorun çıkarırsa Vercel'den önceki deployment promote edilir (bu fazda "önceki" = yok, o hâlde proje silinip yeniden kurulur — maliyet düşük).

### Success Metrics

- CI baştan sona yeşil ve < 8 dakika (bu fazda asset/balance işleri yok)
- Preview URL canlı, `/health.json` doğru buildSha döndürüyor
- Katman ihlali fixture testi gerçekten kırıyor
- `src/sim`'e `Math.random` eklemek lint hatası veriyor (kanıtlanmış)
- Bundle boyutu raporlanıyor

### Definition of Done

[WORKING_DISCIPLINE §4](WORKING_DISCIPLINE.md#4-tamamlandi-ne-demek--definition-of-done)'ün 15 maddesi + kanıt + `docs/phases/PHASE_1_REPORT.md`.

---

## PHASE 2 — SIMULATION CORE & DETERMINISM

### Objective

Motordan tamamen bağımsız, deterministik, headless çalışan simülasyon çekirdeğini kurmak: saat, RNG stream'leri, dünya durumu, sistem hattı, command log, event bus, ve versiyonlu kalıcılık.

### Player Value

Görünür oyun yok — ama bu faz, oyunun **her** ileri özelliğinin üzerine oturacağı zemin.

### Business Value

Bu fazın kalitesi projenin tavanını belirler. Deterministik olmayan bir çekirdek; CI'da ekonomi doğrulamasını, görsel regresyonu, tekrar üretilebilir bug raporlarını ve Day Replay özelliğini **kalıcı olarak** imkânsız kılar. Sonradan eklemek pratikte yeniden yazımdır.

### Dependencies

Faz 1 (CI, lint kuralları, katman zorlaması).

### Systems

`Clock` · `Rng` (6 stream) · `World` · `SystemPipeline` · `CommandLog` · `EventBus` · `EntityStores` (iskelet) · `SaveManager` + migration.

### Game Design

Henüz oyun mekaniği yok. Ama **tick sırası** bu fazda sabitlenir ([TECHNICAL_ARCHITECTURE §5.5](TECHNICAL_ARCHITECTURE.md#55-sistem-sırası-her-tickte-sabit)) — 18 sistemin yeri baştan ayrılır, boş implementasyonlarla.

### Technical Architecture

- **Sabit adım:** 20 Hz (50 ms), `MAX_CATCHUP_TICKS = 8`, accumulator deseni, alpha interpolasyon değeri dışa verilir.
- **Rng:** sfc32 (128-bit state, serileştirilebilir). Stream'ler: `traffic`, `conversion`, `customer`, `tips`, `events`, `cosmetic`. `cosmetic` sim sonucunu etkilemez (bu bir testtir).
- **Command:** discriminated union; `apply(world, cmd)` saf fonksiyon; log halka tamponu.
- **Event:** tick sonunda toplu yayım, önceden tahsis edilmiş dizi, sıfır tahsis.
- **Store'lar:** `VehicleStore` SoA (typed arrays, serbest liste); `CustomerStore`/`EmployeeStore` nesne havuzu. Bu fazda yalnızca iskelet + havuz mekaniği.
- **Save:** IndexedDB (`idb`), `schemaVersion: 1`, CRC32, 3'lü yedek rotasyonu, localStorage fallback, dışa/içe aktarma.

### UI/UX

Dev-only debug overlay: tick sayacı, sim süresi, entity sayıları, RNG state hash, world hash. Production build'de tree-shake edilir.

### Assets / Animation / Audio

Yok.

### Data

Save şeması v1 ([TECHNICAL_ARCHITECTURE §8.1](TECHNICAL_ARCHITECTURE.md#81-save-şeması)). `tests/fixtures/saves/save-v1.json` commit edilir.

### Testing

- **Determinizm süiti** (projenin en kritik testi): aynı seed + aynı command log → 10.000 tick sonra birebir aynı world hash; 1×/2×/4× hızlarda aynı sonuç; save→yükle→devam = kesintisiz ile aynı.
- RNG: dağılım kalitesi, stream izolasyonu, state serileştirme round-trip.
- Clock: tick birikimi, catch-up sınırı, spiral-of-death koruması.
- CommandLog: halka tamponu, replay.
- Save: yazma/okuma, checksum, bozulma → yedek, tüm yedekler bozuk → temiz hata, ileri sürüm → nazik red.
- Perf bench: 1000 boş tick, tahsis ≈ 0.

### Performance

Boş sistem hattı ile 1000 tick < 5 ms. Tahsis (steady state) 0 B/tick. Bu, ileride sistemler eklendikçe referans noktası olacak.

### Security

Save checksum. Kullanıcı verisinde PII yok.

### Deployment

Preview deploy'da debug overlay `VITE_DEBUG_PANEL=1` ile görünür; production'da yok.

### Tasks

1. `src/sim/core/Clock.ts` — enjekte edilebilir, tick birikimi.
2. `src/sim/core/Rng.ts` — sfc32, stream fabrikası, state ser/deser.
3. `src/sim/core/World.ts` — durum konteyneri, `hash()` metodu (determinizm testi için).
4. `src/sim/core/SystemPipeline.ts` — 18 slot, sabit sıra, boş implementasyonlar.
5. `src/sim/core/CommandLog.ts` + `Command` union + `apply()`.
6. `src/sim/core/EventBus.ts` + `SimEvent` union + toplu yayım.
7. `src/sim/stores/*` — SoA vehicle store, nesne havuzları, serbest liste.
8. `src/sim/math/*` — vec2, easing, sabit-nokta yardımcıları.
9. `src/persistence/SaveManager.ts` + `migrations.ts` + `idbAdapter.ts` + `localStorageAdapter.ts`.
10. `src/app/GameLoop.ts` — rAF döngüsü, accumulator, alpha.
11. Debug overlay (dev-only).
12. Determinizm test süiti.
13. `tools/bench/sim-bench.ts` + CI entegrasyonu.
14. Save fixture'ları + migration test iskeleti.

### Files / Modules Expected

```
src/sim/core/{Clock,Rng,World,SystemPipeline,CommandLog,EventBus,types}.ts
src/sim/stores/{VehicleStore,CustomerStore,EmployeeStore,OrderStore,pool}.ts
src/sim/math/{vec2,easing,hash}.ts
src/persistence/{SaveManager,migrations,idbAdapter,localStorageAdapter,checksum}.ts
src/app/{GameLoop,container}.ts · src/app/debug/DebugOverlay.ts
tools/bench/sim-bench.ts
tests/unit/sim/{clock,rng,world,commandlog,eventbus,pool}.test.ts
tests/unit/persistence/{save,migration,checksum}.test.ts
tests/unit/determinism/{replay,speed,saveload,streams}.test.ts
tests/fixtures/saves/save-v1.json
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 2 of Evolutionary Tycoon. Read docs/WORKING_DISCIPLINE.md, then
docs/TECHNICAL_ARCHITECTURE.md sections 2, 5, 8, 15.

SCOPE
The deterministic simulation core. NO Phaser. NO Svelte. NO game systems
(no traffic, no customers, no economy). You are building the machine that will
run those systems later, and proving it is deterministic.

HARD CONSTRAINTS (CI enforces all of these; do not work around them)
- src/sim/** imports nothing from phaser, svelte, src/render, src/ui.
- src/sim/** must not reference Math.random, Date.now, new Date, performance.now,
  setTimeout, setInterval, or requestAnimationFrame.
- Zero allocation in steady-state tick. Preallocate, pool, reuse. No .map/.filter
  in hot paths; no string concatenation; no closures created per tick.

DELIVERABLES

1. Clock — injectable. Accumulates sim time from ticks only. Exposes simTimeMs,
   gameDay, gameHour. Never reads wall time.

2. Rng — sfc32. 128-bit state, fully serialisable. Provide next(), int(max),
   pick(array), range(min,max). Create exactly six named streams:
   traffic, conversion, customer, tips, events, cosmetic.
   Streams must be independent: consuming one must not shift any other.
   Write a test that proves this by exhausting one stream 10_000 times and
   asserting the others produce identical sequences to a control run.

3. World — the entire mutable state. Must expose hash(): string — a stable,
   order-independent-where-appropriate digest of all simulation-relevant state.
   The cosmetic RNG state must NOT be part of the hash (it does not affect
   simulation outcome; prove this with a test).

4. SystemPipeline — 18 ordered slots matching TECHNICAL_ARCHITECTURE section 5.5,
   each currently a no-op. The order is fixed and documented in code; changing it
   later is an architectural change requiring approval. Add a test asserting the
   order matches the documented list.

5. CommandLog — discriminated union of commands, each carrying its tick number.
   apply(world, cmd) is a pure function. Ring buffer of 5000. Provide
   replay(world, commands) used by tests.

6. EventBus — typed SimEvent union. Events are collected into a preallocated
   array during the tick and flushed once at the end. Subscribers cannot mutate
   world state (enforce with readonly types).

7. Stores — VehicleStore as SoA over typed arrays with a free list and a
   documented capacity; CustomerStore/EmployeeStore/OrderStore as object pools.
   All must support reset() and be allocation-free after warmup.

8. SaveManager — IndexedDB via idb, localStorage fallback, schemaVersion 1,
   CRC32 checksum, three rotating backups, export/import to JSON file.
   Migration chain infrastructure (empty for now) plus the test harness that
   will run v1 -> current on every CI run forever.

9. GameLoop — accumulator, TICK_MS 50, MAX_CATCHUP_TICKS 8, clamp frame delta
   at 250ms, expose interpolation alpha. Speed multiplier 1/2/4 multiplies tick
   count, never TICK_MS.

10. DETERMINISM TEST SUITE — this is the most important deliverable:
    - same seed + same command log -> identical world.hash() after 10_000 ticks
    - identical result at speed 1x, 2x, 4x
    - save at tick 5000, load, run to 10_000 == uninterrupted run to 10_000
    - stream isolation (see item 2)
    - AST scan asserting no forbidden globals appear anywhere under src/sim

11. tools/bench/sim-bench.ts — measures ticks/sec and allocation. Wire into CI
    with a 15% regression threshold against main. Record baseline in
    docs/PERF_LOG.md.

STYLE
Small pure functions. Explicit types at module boundaries. No classes where a
function suffices, but stores may be classes for encapsulation of typed arrays.
Comment WHY, never WHAT.

DEFINITION OF DONE
docs/WORKING_DISCIPLINE.md section 4, all 15 items with evidence, in
docs/phases/PHASE_2_REPORT.md. Then STOP.
```

### Risks

| Risk                                        | Olasılık   | Etki           | Azaltma                                                                                                                                            |
| ------------------------------------------- | ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Determinizmin sonradan sızıntıyla bozulması | **Yüksek** | **Çok yüksek** | AST taraması + determinizm süiti her CI'da; lint kuralları; katman zorlaması                                                                       |
| Float aritmetiğinde platformlar arası fark  | Düşük      | Yüksek         | IEEE 754 double tüm JS motorlarında aynı; `Math.fround`/trigonometri kullanımından kaçın veya tablo kullan; testler farklı Node sürümlerinde koşar |
| Sıfır tahsis hedefinin kodu okunmaz yapması | Orta       | Orta           | Yalnızca **ölçülen** sıcak yollarda; geri kalanı okunabilir kalır                                                                                  |
| Save şemasının erken sabitlenmesi           | Orta       | Orta           | Migration altyapısı baştan; şema değişimi ucuz                                                                                                     |

### Rollback

Bu faz izole; `src/sim` ve `src/persistence` tamamen geri alınabilir. Faz 1 shell'i etkilenmez.

### Success Metrics

- Determinizm süiti yeşil (5 test)
- 1000 boş tick < 5 ms, tahsis ≈ 0
- Save round-trip < 8 ms
- `src/sim`'e yasak global eklemek CI'ı kırıyor (kanıtlanmış)
- Coverage `src/sim` ≥ %90

### Definition of Done

WORKING_DISCIPLINE §4 + determinizm süiti yeşil + PERF_LOG referans değerleri kaydedildi.

---

## PHASE 3 — ISOMETRIC RENDERING & WORLD

### Objective

Phaser 4'ü bağlamak, izometrik projeksiyonu ve derinlik sıralamasını kurmak, katmanlı sahne mimarisini oluşturmak, kamerayı yazmak, ve sim durumunu ekrana çizen köprüyü kurmak.

### Player Value

İlk kez bir dünya görülüyor: yol, arsa, birkaç nesne. Kamera gezdirilebiliyor. Henüz oyun yok ama "yer" var.

### Business Value

Görsel yönün teknik olarak mümkün olduğunun kanıtı. Derinlik sıralaması bu türde en sık patlayan sistemdir; erken ve doğru kurulması ileride yüzlerce görsel hatayı önler.

### Dependencies

Faz 2 (sim çekirdeği — render okuyacak bir şey olmalı).

### Systems

`IsoProjection` · `DepthSorter` · `SceneGraph` (9 katman) · `CameraController` · `RenderBridge` · `ActorView` havuzu · `DevGrid`.

### Game Design

Dünya ölçeği sabitlenir: 1 dünya birimi = 1 metre. Arsa boyutu (Aşama 1: ~24×18 m), yol konumu ve açısı, kamera sınırları belirlenir. Bu ölçüler tüm ileri fazları bağlar.

### Technical Architecture

- 2:1 dimetrik: `screenX = (x−y)·32`, `screenY = (x+y)·16 − z·32` (1× ölçek).
- `depth = (x+y)·DEPTH_SCALE + z·Z_WEIGHT + stableTieBreak(id)`; painter's algorithm, ayak izi anchor'ı ([TECHNICAL_ARCHITECTURE §6.2](TECHNICAL_ARCHITECTURE.md#62-derinlik-sıralama)).
- 9 render katmanı ([TECHNICAL_ARCHITECTURE §6.3](TECHNICAL_ARCHITECTURE.md#63-render-katmanları)). Aktörler tek `Container`'da; `SpriteGPULayer` yalnızca statik dekor ve parallax için.
- **RenderBridge:** sim'i yalnızca okur; `ActorView` havuzundan görünüm alır, `depth` yazar, `alpha` ile pozisyon interpolasyonu yapar. Sim'e hiç yazmaz.
- **Görsel determinizm modu:** `?seed=&freezeAt=&noParticles=1&fixedViewport=1&dpr=1&hideHud=1`.

### UI/UX

Kamera: sürükle-pan, tekerlek/pinch zoom (0.6×–1.8×), kenar itme, WASD/ok tuşları, sınırlar. Dev: grid overlay, koordinat göstergesi, depth debug modu (nesneleri depth değerine göre renklendirir).

### Assets

Bu fazda **placeholder** kullanılır ve `PLACEHOLDER_REGISTER.md`'ye yazılır: renkli izometrik kutular, basit yol şeridi, ölçek referans figürü. Gerçek sanat Faz 4'te gelir. Placeholder'lar macenta dama desenli ve üzeri etiketli.

### Animation

Yok (Faz 17). Ama `ActorView` interpolasyon altyapısı burada kurulur.

### Audio

Yok.

### Data

Layout tanımı: `src/config/layouts/stage1.ts` — arsa boyutu, yol spline noktaları, giriş/çıkış noktaları, statik nesne konumları.

### Testing

- Unit: projeksiyon world↔screen round-trip; depth hesabı bilinen düzenlerde beklenen sıra üretiyor; kamera sınır clamp'i.
- Integration: RenderBridge sim'e yazmıyor (readonly tip + runtime proxy testi).
- **İlk visual golden'lar** (3 adet): `stage1-empty`, `iso-depth-testcard` (kasıtlı zor derinlik senaryosu), `camera-bounds`.
- E2E: canvas oluşuyor, WebGL2 context alınıyor, 60 kare sorunsuz, konsol temiz.

### Performance

Boş sahne + 100 placeholder aktör: masaüstü 60 FPS, sim+render toplam frame < 8 ms. Depth sort 260 nesne ≤ 0.15 ms (CI bench).

### Security

Değişiklik yok.

### Deployment

Preview'da gezilebilir bir dünya. Bu, projenin ilk "gösterilebilir" çıktısı.

### Tasks

1. Phaser 4 bootstrap, WebGL2 zorunlu, context loss/restore handler.
2. `IsoProjection` + ters dönüşüm (ekran→dünya, tıklama için).
3. `DepthSorter` + kararlı tie-break.
4. 9 katmanlı `SceneGraph`.
5. `CameraController` (pan/zoom/bounds/shake iskeleti/reduced-motion).
6. `RenderBridge` + `ActorView` havuzu + interpolasyon.
7. Placeholder asset seti + register kaydı.
8. `stage1` layout config'i.
9. Görsel determinizm modu (URL parametreleri).
10. Dev araçları: grid, koordinat, depth debug.
11. Visual regression altyapısını gerçek golden'larla devreye al.
12. DPR ve responsive canvas boyutlandırma.

### Files / Modules Expected

```
src/render/{PhaserBootstrap,SceneGraph,RenderBridge,ActorView,ActorPool}.ts
src/render/iso/{IsoProjection,DepthSorter,depthConstants}.ts
src/render/camera/CameraController.ts
src/render/scenes/{BootScene,WorldScene}.ts
src/render/debug/{GridOverlay,DepthDebug,CoordReadout}.ts
src/config/layouts/stage1.ts · src/config/world.ts
assets/_placeholder/*
tests/unit/render/{isoProjection,depthSorter,camera}.test.ts
tests/visual/{stage1-empty,iso-depth-testcard,camera-bounds}.spec.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 3 of Evolutionary Tycoon. Read docs/WORKING_DISCIPLINE.md, then
docs/TECHNICAL_ARCHITECTURE.md sections 6, 11, and docs/RESEARCH_NOTES.md
sections 4 and 11 (they explain constraints you must respect).

SCOPE
Rendering foundation. The simulation already exists and is deterministic — do not
modify src/sim except to add readonly view types it must expose. No gameplay.

CRITICAL CONSTRAINTS FROM RESEARCH — violating these will require a rewrite
- SpriteGPULayer CANNOT be depth-sorted and modifying members is expensive.
  Use it ONLY for: parallax background layers, static decorative scatter behind
  the actor plane, and one-shot particle bursts. NEVER for vehicles, people,
  or anything that must sort.
- TilemapGPULayer is orthographic-only. There is no isometric tilemap.
  The ground is 2-6 large hand-composed static sprites, not tiles.
- Phaser 4 deprecated the Canvas renderer. WebGL2 is mandatory.

DELIVERABLES

1. IsoProjection — 2:1 dimetric.
     TILE_W=64 TILE_H=32 TILE_Z=32 at 1x scale; art authored at 2x.
     World unit = 1 metre.
     worldToScreen(x,y,z) and screenToWorld(sx,sy,assumedZ) must round-trip
     within 1e-9. Test it with 10_000 random points.

2. DepthSorter — painter's algorithm:
     depth = (x + y) * DEPTH_SCALE + z * Z_WEIGHT + stableTieBreak(entityId)
     Objects anchor at their FOOTPRINT CENTRE, not visual centre.
     Do NOT implement topological sorting — O(n^2) risk, and the asset rule
     ("split anything taller than 160px at 2x into _lower/_upper") makes real
     cycles impossible. Write a test card scene with deliberately hard cases
     (tall object behind short, overlapping footprints, stacked props) and make
     it a visual golden.

3. SceneGraph — the nine layers from TECHNICAL_ARCHITECTURE 6.3, in order.
   Only layer 4 (actors) is depth-sorted per frame.

4. CameraController — drag pan, wheel/pinch zoom clamped to 0.6x..1.8x, edge
   push, WASD/arrows, hard bounds so the player cannot pan into the void.
   Respect prefers-reduced-motion: disable shake and smoothing.

5. RenderBridge — reads a readonly view of the simulation, leases ActorViews from
   a pool, writes depth, interpolates positions using the GameLoop alpha.
   It must be structurally impossible for the bridge to mutate sim state: use
   readonly types AND add a test that freezes the view object and runs 100 ticks.

6. VISUAL DETERMINISM MODE — first-class engine feature, not a test hack:
     ?seed=<n>&freezeAt=<tick>&noParticles=1&fixedViewport=1&dpr=1&hideHud=1
   When active: RNG seeded, clock frozen at the given tick, particles disabled,
   camera pinned to a fixed transform, devicePixelRatio forced to 1.
   Without this, WebGL visual regression is impossible. Verify by taking the same
   screenshot 10 times and asserting byte-identical output.

7. PLACEHOLDERS — deliberately ugly: magenta/black checker with a text label of
   what belongs there. Register every one in docs/PLACEHOLDER_REGISTER.md.
   A placeholder that looks "good enough" is the dangerous kind.

8. Visual goldens (3) generated INSIDE the pinned Playwright container with
   --use-gl=angle --use-angle=swiftshader --disable-gpu, so local and CI agree.

PERFORMANCE
100 placeholder actors at 60 FPS on desktop. Depth sort of 260 objects <= 0.15ms
(add to the CI bench). No per-frame allocation in RenderBridge — pool everything.

DEFINITION OF DONE
docs/WORKING_DISCIPLINE.md section 4. Record real-GPU FPS in docs/PERF_LOG.md
(CI cannot measure this — say so explicitly rather than claiming a number).
Then STOP.
```

### Risks

| Risk                                                         | Olasılık   | Etki       | Azaltma                                                            |
| ------------------------------------------------------------ | ---------- | ---------- | ------------------------------------------------------------------ |
| Derinlik sıralama hataları (nesnelerin yanlış üstte çıkması) | **Yüksek** | Orta       | Test card golden'ı + asset bölme kuralı + depth debug modu         |
| Görsel determinizmin sağlanamaması → visual regression çöker | Orta       | **Yüksek** | 10× aynı screenshot testi; sağlanamazsa faz tamamlanmaz            |
| Placeholder'ların "yeterince iyi" görünüp kalıcılaşması      | Orta       | Orta       | Kasıtlı çirkin placeholder + register + build sayacı               |
| Phaser 4 API'sinin v3 belleğinden farklı olması              | Orta       | Düşük      | Resmî v4 dokümanına referans; v3 örneklerini körü körüne kopyalama |

### Rollback

`src/render` tamamen izole; geri alınabilir. Sim ve UI etkilenmez.

### Success Metrics

Kamera gezinen, 100 nesne çizen, doğru sıralayan, 60 FPS koşan bir dünya; 3 golden yeşil; 10× özdeş screenshot kanıtı.

### Definition of Done

WORKING_DISCIPLINE §4 + görsel determinizm kanıtı + PERF_LOG (gerçek GPU).

---

## PHASE 4 — ART DIRECTION & ASSET PIPELINE v1

### Objective

Sanat yönünü kilitlemek, AI üretim protokolünü kurmak, Aşama 1–2'nin gerçek sanatını üretmek, ve asset build pipeline'ını (validate → process → atlas → manifest) CI'a bağlamak.

### Player Value

Oyun ilk kez **güzel** görünür. Placeholder kutular gider; gerçek bir yol kenarı belirir.

### Business Value

Vertical Slice Kapısı'nın (Faz 9) kriterlerinden biri "görsel olarak tür ortalamasının üstünde". Bu, placeholder'larla değerlendirilemez. Ayrıca tutarlılık protokolü şimdi kurulmazsa, Faz 16'da 300 asset'i yeniden üretmek gerekir.

### Dependencies

Faz 3 (render katmanı — asset'leri görecek yer).

### ⛔ START CONDITIONS — AI ASSET LİSANS KAPISI (zorunlu, onaylı düzeltme 2026-08-14)

> Seçilen üretim araçları (God Mode AI, Scenario, PixelLab) **araştırmada geçtikleri için
> ticari olarak doğrulanmış sayılmazlar.** GATE 0 araştırması ikincil kaynaklara dayanıyordu.
> **Üretim asset'i üretilmeden önce**, her aday araç için **birincil/resmî kaynaktan**
> aşağıdakiler doğrulanmalı ve kanıt kaydedilmelidir:

| #   | Doğrulanacak                          | Kabul kriteri                                                                    |
| --- | ------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Ticari kullanım hakkı                 | Ücretli/ücretsiz plan ticari kullanıma izin veriyor mu, açık metinle             |
| 2   | Üretilen asset'in mülkiyeti / lisansı | Çıktının sahibi kim; hangi lisansla kullanılabilir                               |
| 3   | Yeniden dağıtım hakkı                 | Asset'in bir oyun içinde dağıtılması açıkça izinli mi                            |
| 4   | Çıktı üzerindeki kısıtlamalar         | Model eğitimi, türev iş, NFT vb. yasakları bizi etkiliyor mu                     |
| 5   | Referans görsel kısıtlamaları         | Kendi referanslarımızı yüklemek hak devrine yol açıyor mu                        |
| 6   | Model / eğitim şartları               | Girdilerimiz sağlayıcının modelini eğitmekte kullanılıyor mu; opt-out var mı     |
| 7   | Abonelik / hesap gereksinimi          | Hangi plan gerekli, maliyeti ne                                                  |
| 8   | **Abonelik bittikten sonraki haklar** | Abonelik iptalinden sonra üretilmiş asset'leri kullanmaya devam edebiliyor muyuz |
| 9   | Atıf (attribution) gereksinimi        | Varsa nerede ve nasıl                                                            |

**Kanıt kaydı üç yere yazılır:**
`docs/RESEARCH_NOTES.md` (§7'ye birincil-kaynak alt bölümü) · `assets/LICENSES.md` (pipeline oluştuğunda) · `docs/PROJECT_MEMORY.md §17`.

**Kanıt biçimi:** resmî ToS/lisans sayfasının URL'i + erişim tarihi + ilgili maddenin alıntısı. "Sitede yazıyor" yeterli değildir.

**Başarısızlık durumunda:** Bir sağlayıcı ticari kullanım kriterlerini karşılamıyorsa **sessizce başka bir araca geçilmez.** Dokümante edilmiş bir değişiklik talebi ([WORKING_DISCIPLINE §6](WORKING_DISCIPLINE.md#6-roadmap-değişiklik-kontrolü)) açılır, onaylı alternatif değerlendirilir, ve karar bir ADR'ye yazılır.

**Bu kapı geçilmeden Faz 4'te tek bir üretim asset'i üretilmez.** Altın referans üretimi de buna dahildir.

### Systems

Asset build pipeline · doğrulama · atlas paketleme · manifest · contact sheet üretimi · **lisans doğrulama kaydı**.

### Game Design

Yok — ama görsel dil oyunun okunabilirliğini doğrudan etkiler. Siluet testi bir gameplay gereksinimidir, estetik değil.

### Technical Architecture

`tools/asset-pipeline/`: `validate.ts` (9 kontrol), `process.ts` (sharp: trim, anchor, sRGB), `atlas.ts` (free-tex-packer-core), `audio.ts` (ffmpeg, Faz 17'de kullanılacak), `manifest.ts` (içerik hash), `report.ts` (bütçe kontrolü). Deterministik çıktı zorunlu (aynı girdi → aynı hash).

### UI/UX

Yükleme ekranı gerçek asset'lerle: logo, gerçek ilerleme çubuğu.

### Assets

**Üretilecekler (Aşama 1–2 seti):**

- Karakter parçaları: 4 gövde, 5 kafa, 4 saç, kol/bacak setleri × 4 yön (~60 sprite)
- Araçlar: 4 arketip (`SEDAN_COMMUTER`, `PICKUP_WORKER`, `FAMILY_VAN`, `MOTORCYCLE`) × 8 yön + fren varyantı (~40)
- Yapılar: tezgâh, tente, kamyon, pencere, tabela (bölünmüş) (~18)
- Ekipman: ızgara, fritöz, içecek makinesi, pass (~10)
- Yemek ikonları: 6 ürün (~6)
- Zemin bake'leri: `stage1`, `stage2` + yol segmenti (~4 dilim)
- Doğa/dekor: ağaç ×3, çalı ×3, direk, çöp kutusu, bariyer (~12)
- Parallax: 3 katman
- UI ikonları: ~30
- FX: buhar, duman, toz, parıltı (~8)

**Altın referans seti (6–10) önce onaylanır**, sonra üretim başlar.

### Animation

Rig formatı (`rig.json`) tanımlanır ve karakter parçaları buna göre üretilir. Runtime Faz 17'de.

### Audio

Pipeline hazırlanır, ses üretimi Faz 17'de.

### Data

`assets/MANIFEST.md` (provenance), `assets/LICENSES.md`, `docs/assets/palette.json` (48 renk).

### Testing

- `assets:validate` CI'da; herhangi bir asset kuralı ihlali build'i kırar.
- Atlas doluluk oranı ≥ %70.
- Bütçe kontrolü ([ASSET_PIPELINE §13](ASSET_PIPELINE.md#13-asset-bütçeleri)).
- Visual golden'lar gerçek sanatla güncellenir.
- **Dört tutarlılık kapısı:** yan yana testi, contact sheet, gri tonlama siluet, %50 ölçek okunabilirlik.

### Performance

Kritik yol asset'i ≤ 4 MB. Aşama 1 toplam ≤ 8 MB. Texture memory hesaplanır ve PERF_LOG'a yazılır.

### Security

Lisans doğrulaması. Belirsiz lisanslı asset repoya girmez.

### Deployment

Asset'ler immutable cache başlıklarıyla; preview'da yükleme süresi ölçülür.

### Tasks

1. `docs/assets/palette.json` (48 renk) ve stil bible'ının prompt bloğu.
2. 6–10 altın referans üret → **insan onayı** → kilitle.
3. Kategori bazında batch üretim (§ASSET_PIPELINE 4.3).
4. `tools/asset-pipeline/validate.ts` — 9 kontrol.
5. `process.ts` (sharp), `atlas.ts`, `manifest.ts`, `report.ts`.
6. Contact sheet üreteci.
7. Asset yükleme sistemi (kritik yol / lazy / talep üzerine).
8. Yükleme ekranı (gerçek ilerleme).
9. Placeholder'ları gerçek asset'lerle değiştir, register'ı temizle.
10. Visual golden'ları güncelle.
11. Dört tutarlılık kapısını çalıştır ve raporla.

### Files / Modules Expected

```
tools/asset-pipeline/{validate,process,atlas,audio,manifest,report,contactSheet}.ts
docs/assets/palette.json · assets/MANIFEST.md · assets/LICENSES.md
assets/source/** · src/render/AssetLoader.ts · src/render/scenes/LoadScene.ts
src/config/assets.ts
tests/unit/tools/{validate,manifest}.test.ts
tests/visual/* (güncellenmiş golden'lar)
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 4. Read docs/WORKING_DISCIPLINE.md and docs/ASSET_PIPELINE.md in full.
docs/RESEARCH_NOTES.md section 7 explains why the workflow is shaped this way.

SCOPE
Art direction lock, AI asset production for stages 1-2, and the build pipeline.

NON-NEGOTIABLE RULES
- AI generates STATIC art only. It does not generate animation frames (current
  tools drift frame-to-frame) and it does not generate tilesets (we don't use them).
- Consistency comes from a CONTRACT, not from good luck: fixed 2:1 dimetric camera,
  fixed light from upper-left at 35 degrees, locked 48-colour palette, 2px derived
  outline, transparent background, footprint-centre anchor.
- Anything taller than 160px at 2x scale MUST be split into _lower/_upper.
  The validator fails the build otherwise. This is what makes depth sorting
  tractable — it is not optional.

ORDER OF WORK (do not reorder)
1. Write docs/assets/palette.json (48 colours) and the immutable prompt block.
2. Produce 6-10 GOLDEN REFERENCE images: one character, one vehicle, one table,
   one appliance, one ground fragment, one tree. STOP and get human approval on
   these before producing anything else. They define the style for the whole project.
3. Only then, generate each category as a COMPLETE BATCH in one session with the
   same references — all bodies together, all heads together. Never one-off.
4. Run the validator. Fix or regenerate failures. Never lower a threshold to pass.
5. Build a contact sheet per category (all assets on the real game ground, at
   100% and 50%) and review as a group. Consistency is only visible side by side.
6. Record every accepted asset in assets/MANIFEST.md with tool, prompt hash, date,
   licence, and which golden reference it derives from.

VALIDATOR — implement all nine checks:
  transparent background; alpha bbox >= 60% of canvas; >= 92% of pixels within
  delta 8 of the palette; size within +/-15% of the category reference height;
  light gradient runs upper-left to lower-right; height <= 160px OR name contains
  _lower/_upper; filename matches the naming regex; anchor metadata present and
  inside bounds; file size within category budget.

FOUR CONSISTENCY GATES (all must pass, report results):
  side-by-side scene · contact sheet review · greyscale silhouette test ·
  50% scale readability test

PIPELINE
sharp for processing, free-tex-packer-core for atlases (MaxRects-BSSF, 2px padding
+ extrude, power-of-two, trim on, rotate OFF). Output must be deterministic:
same input produces the same hash, or CDN caching breaks.

BUDGETS (CI enforces; see ASSET_PIPELINE section 13)
critical path <= 4 MB, stage-1 total <= 8 MB, atlas fill >= 70%.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus: placeholder register reduced to zero for
stages 1-2, all four consistency gates reported, texture memory recorded in
PERF_LOG.md. Then STOP.
```

### Risks

| Risk                                  | Olasılık   | Etki       | Azaltma                                                                                                                                                |
| ------------------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AI çıktısının tutarsız olması**     | **Yüksek** | **Yüksek** | Altın referans + değişmez prompt + batch üretim + 9 doğrulama + 4 tutarlılık kapısı. Yine de tutmazsa: kategori yeniden üretilir; bütçede pay ayrıldı. |
| AI aracı lisans belirsizliği          | Orta       | **Yüksek** | Üretim öncesi lisans doğrulaması; belirsizse araç kullanılmaz                                                                                          |
| Asset iş yükünün fazı şişirmesi       | **Yüksek** | Orta       | Yalnızca Aşama 1–2 kapsamda; Aşama 3–4 Faz 16'da                                                                                                       |
| Bütçe aşımı                           | Orta       | Orta       | CI'da zorlanıyor; aşımda ya asset azalır ya sıkıştırma artar                                                                                           |
| Uzun nesne bölme kuralının unutulması | Orta       | Orta       | Validator zorluyor                                                                                                                                     |

### Rollback

Asset'ler versiyonlu; placeholder'lara dönüş mümkün (register korunur).

### Success Metrics

- Dört tutarlılık kapısı geçildi
- Placeholder sayısı (Aşama 1–2 için) sıfır
- Bütçeler içinde
- Yan yana konulduğunda "aynı dünyaya ait" görünüyor (insan değerlendirmesi, raporlanır)

### Definition of Done

WORKING_DISCIPLINE §4 + 4 tutarlılık kapısı raporu + MANIFEST + LICENSES güncel.

---

## PHASE 5 — TRAFFIC SIMULATION

### Objective

Oyunun kalbini kurmak: şerit grafiği, deterministik spawn, IDM araç-takip modeli, gün eğrisi, araç arketipleri. Yol **canlanır**.

### Player Value

İlk kez oyun gibi bir şey görülür: yoldan gerçek araçlar geçer, birbirine göre yavaşlar, tıkanma dalgaları oluşur. Sadece izlemek bile keyifli olmalı.

### Business Value

Bu, oyunun ana farklılaştırıcısı. Trafik ikna edici değilse tüm konsept çöker. Ayrıca burada bir tasarım sorusu kesinleşir: 1 oyun günü kaç gerçek dakika ([GAME_DESIGN_DOCUMENT §25 S1](GAME_DESIGN_DOCUMENT.md#25-açık-tasarım-soruları)).

### Dependencies

Faz 2 (deterministik çekirdek), Faz 3 (render), Faz 4 (araç sanatı).

### Systems

`LaneGraph` · `TrafficSpawnSystem` · `VehicleMotionSystem` (IDM) · `TimeSystem` (gün eğrisi) · araç arketip tablosu.

### Game Design

- Gün eğrisi (24 nokta): kahvaltı/öğle/akşam tepeleri, gece dibi.
- 4 arketip bu fazda (kalan 6 Faz 15'te): sedan, pickup, van, motosiklet.
- Zaman ölçeği kararı: aday 1 gün = 12 dk; **oynanarak** doğrulanır ve karara bağlanır.

### Technical Architecture

- Şerit = arc-length parametrize polyline spline; `sample(s) → {pos, tangent}`.
- Araç = 1B ajan: `laneS`, `speed`, `archetype`, `state`. SoA typed array.
- IDM-lite: `a = a_max[1 − (v/v0)^4 − (s*/gap)²]`, `s* = s_min + max(0, vT + vΔv/(2√(a_max·b)))`.
- Spawn: deterministik Poisson, `rng.traffic` stream'inden; oran gün eğrisinden.
- Despawn: yolun sonunda; havuza iade.

### UI/UX

Dev overlay: araç sayısı, ortalama hız, spawn oranı, gün saati. Oyuncu HUD'ında yalnızca saat.

### Assets

Araç sprite'ları (Faz 4'ten), fren ışığı varyantları.

### Animation

Süspansiyon salınımı (prosedürel), fren burun daldırması, fren ışığı sprite değişimi, yön blend'i (8 açı).

### Audio

Yok (Faz 17). Ama `SimEvent` tipleri (`VEHICLE_SPAWNED`, `VEHICLE_BRAKED`) şimdi tanımlanır ki ses sonradan kolayca bağlansın.

### Data

`src/config/traffic.ts`: gün eğrisi, spawn parametreleri, arketip tablosu, IDM sabitleri. `src/config/layouts/stage1.ts`: şerit spline noktaları.

### Testing

- Poisson determinizmi: aynı seed → aynı zaman damgaları (10.000 örnek).
- IDM: çarpışma yok, negatif hız yok, ani frende dalga yukarı yayılıyor.
- Gün eğrisi interpolasyonu saat sınırlarında sürekli.
- Arketip dağılımı 10.000 spawn'da beklenen oranlar ±%2.
- Perf bench: 120 araç @ p95 ≤ 2.0 ms.
- Visual golden: `traffic-flowing` (freezeAt ile).
- E2E: 30 saniyede en az N araç geçiyor.

### Performance

120 araç masaüstünde 60 FPS. Sim tick p95 ≤ 2.0 ms (120 araç + 0 yaya).

### Security

Değişiklik yok.

### Deployment

Preview'da izlenebilir bir yol. Bu, konseptin ilk gerçek gösterimi.

### Tasks

1. `LaneGraph` + spline örnekleme + arc-length tablosu.
2. `TrafficSpawnSystem` (deterministik Poisson).
3. `VehicleMotionSystem` (IDM-lite).
4. `TimeSystem` (gün/saat, gün eğrisi).
5. Arketip config'i + görsel eşleme.
6. Araç `ActorView` (yön seçimi, fren, süspansiyon).
7. Despawn + havuz iadesi.
8. Dev overlay genişletme.
9. Testler + bench + golden.
10. **Zaman ölçeği kararını oynayarak ver ve dokümante et.**

### Files / Modules Expected

```
src/sim/nav/{LaneGraph,spline,arcLength}.ts
src/sim/systems/{TimeSystem,TrafficSpawnSystem,VehicleMotionSystem}.ts
src/sim/math/idm.ts · src/config/traffic.ts · src/config/archetypes.ts
src/render/views/VehicleView.ts
tests/unit/sim/traffic/{spawn,idm,dayCurve,lane,archetypeDist}.test.ts
tests/perf/traffic.bench.ts · tests/visual/traffic-flowing.spec.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 5. Read docs/WORKING_DISCIPLINE.md, docs/GAME_DESIGN_DOCUMENT.md section 9,
docs/ECONOMY_DESIGN.md sections 2-3.

SCOPE
Traffic only. No conversion decision, no customers, no restaurant. Vehicles spawn,
drive past realistically, and despawn. That is the whole phase.

ALL CODE GOES IN src/sim — pure, deterministic, no Phaser. The renderer only
reads vehicle positions. Remember: Math.random and Date.now are banned there and
CI enforces it.

DELIVERABLES

1. LaneGraph — two lanes as polyline splines with an arc-length table so that
   advancing by distance produces constant visual speed. sample(s) returns
   position and tangent. Precompute the table; do not integrate per frame.

2. TrafficSpawnSystem — deterministic Poisson process driven by rng.traffic.
     rate(t) = base * dayCurve(hour) * dayOfWeek * weather * event * stageMultiplier
   Stage 1 average is 24 vehicles per REAL minute (ECONOMY_DESIGN section 3).
   Same seed must produce byte-identical spawn timestamps; test with 10_000 samples.

3. VehicleMotionSystem — IDM-lite car following:
     a = a_max * (1 - (v/v0)^4 - (s_star/gap)^2)
     s_star = s_min + max(0, v*T + v*dv / (2*sqrt(a_max*b)))
   Tune constants so a sudden brake propagates backwards as a visible accordion
   wave — that emergent behaviour is a large part of why the road will feel alive.
   Assert in tests: no overlaps, no negative speed, wave propagates upstream.

4. TimeSystem — game day/hour from sim time. 24-point hand-authored day curve with
   interpolation that is continuous at hour boundaries (test this explicitly).
   Candidate scale: 1 game day = 12 real minutes.

5. Four archetypes this phase: SEDAN_COMMUTER, PICKUP_WORKER, FAMILY_VAN,
   MOTORCYCLE. Distribution varies by hour. Test the distribution over 10_000
   spawns is within 2 percentage points of the configured mix.

6. VehicleView — picks one of 8 direction sprites, blends heading, applies
   procedural suspension bob, swaps to the brake-light frame under deceleration,
   and dips the nose. Zero allocation per frame.

OPEN DESIGN QUESTION YOU MUST CLOSE
Is 1 game day = 12 real minutes right? Play it. Try 8, 12, and 18. Judge against:
does a peak hour feel like a peak, and is a 6-minute session long enough to see
the rhythm change? Record the decision and reasoning in
GAME_DESIGN_DOCUMENT.md section 25 and note it in the phase report.

PERFORMANCE
120 vehicles: sim tick p95 <= 2.0 ms, zero steady-state allocation. Add to CI bench.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus: watch the road for two full game days and
confirm it reads as alive rather than mechanical. Report that judgement honestly —
if it looks like conveyor belts, say so and fix it before claiming done. Then STOP.
```

### Risks

| Risk                                      | Olasılık   | Etki       | Azaltma                                                                                                                           |
| ----------------------------------------- | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Trafiğin "taşıma bandı" gibi görünmesi    | **Yüksek** | **Yüksek** | IDM emergent dalgalar + hız varyansı + arketip çeşitliliği + şerit değiştirme (Faz 15). Faz DoD'sinde açık bir yargı maddesi var. |
| IDM parametrelerinin kararsızlık üretmesi | Orta       | Orta       | Sınır testleri; hız clamp'i; `MAX_ACCEL` sınırı                                                                                   |
| Zaman ölçeği kararının yanlış olması      | Orta       | Orta       | Bu fazda oynayarak veriliyor, tahminle değil                                                                                      |
| 120 araçta perf bütçesinin aşılması       | Orta       | Orta       | SoA + typed array baştan; bench CI'da                                                                                             |

### Rollback

Trafik sistemleri izole; boş no-op'lara döndürülebilir.

### Success Metrics

- Yol "canlı" görünüyor (raporlanmış insan yargısı)
- Determinizm testleri yeşil
- 120 araç @ 60 FPS, tick p95 ≤ 2.0 ms
- Zaman ölçeği kararı verilmiş ve dokümante

### Definition of Done

WORKING_DISCIPLINE §4 + trafik canlılığı yargısı + zaman ölçeği kararı.

---

## PHASE 6 — CUSTOMER SYSTEM

### Objective

Geçen aracı müşteriye çeviren mekanizmayı kurmak: karar noktası, 10 çarpanlı dönüşüm modeli, müşteri durum makinesi, giriş/park manevraları, ve sabır.

### Player Value

**Döngü ilk kez kapanmaya başlar.** Bir araç frene basar, sinyal verir, sana döner. Bu, oyunun en önemli tek anı.

### Business Value

Core fantasy tam olarak burada doğar. Bu faz ikna edici değilse oyun ikna edici değildir.

### Dependencies

Faz 5 (trafik), Faz 4 (karakter/araç sanatı).

### Systems

`ConversionSystem` · `CustomerFsmSystem` · `VehicleManeuverSystem` · `QueueSystem` (temel) · park yeri tahsisi.

### Game Design

- Karar noktası restorandan ~40 m önce.
- Dönüşüm formülü ([GAME_DESIGN_DOCUMENT §9.5](GAME_DESIGN_DOCUMENT.md#95-dönüşüm-modeli)) — bu fazda çarpanların bir kısmı sabit 1.0 (menü, fiyat henüz yok).
- `MAX_CONVERSION[stage]` sert tavanı baştan.
- Sabır: her bekleme durumunda azalır; sıfırlanınca `ABANDONING`.
- Park yeri yoksa `LEAVING_ANGRY` — ve bu **görülür**.

### Technical Architecture

- Dönüşüm testi `rng.conversion` stream'inden; her araç için **bir kez** (tekrar test yok — deterministik ve adil).
- `CONVERSION_FAILED` event'i **sebep koduyla** yayılır → Faz 18'deki Analiz paneli için veri baştan toplanır.
- Manevra: giriş, park slotu, çıkış Bézier spline'ları; layout config'inde tanımlı.
- Park slotu tahsisi: en yakın boş slot, deterministik tie-break.

### UI/UX

Dev overlay: dönüşüm oranı, sebep dağılımı, park doluluğu. Dünyada: sinyal lambası, fren ışığı, sabır halkası (basit).

### Assets

Yaya karakter parçaları (Faz 4'ten), sabır halkası, öfke/mutluluk balonları.

### Animation

Araç: yavaşlama, sinyal, dönüş, park manevrası. Karakter: henüz statik (yürüme Faz 7'de navigasyonla birlikte).

### Audio

`SimEvent` tipleri tanımlı; ses Faz 17'de.

### Data

`src/config/conversion.ts`, park slot tanımları layout'ta.

### Testing

- Dönüşüm formülünün her çarpanı izole test edilir.
- Sert tavan aşılmıyor.
- Sabır: her bekleme durumundan `ABANDONING` çıkışı var (FSM tam kapsama testi).
- Park yoksa `LEAVING_ANGRY`, sonsuz döngü yok.
- Manevra spline'ları: başlangıç/bitiş pozisyon ve açısı doğru.
- FSM: ulaşılamaz durum yok, terminal durumdan çıkış yok.
- Visual golden: `stage1-first-customer`, `stage1-queue`.
- E2E: 15 saniyede en az bir müşteri dönüşüyor.

### Performance

120 araç + 20 müşteri: tick p95 ≤ 2.2 ms.

### Security

Değişiklik yok.

### Deployment

Preview'da: araçlar duruyor, park ediyor, bekliyor, sıkılıp gidiyor.

### Tasks

1. `ConversionSystem` + sebep kodlu event.
2. `CustomerFsmSystem` (dine-in dalı; drive-thru Faz 11'de).
3. `VehicleManeuverSystem` (giriş, park, çıkış).
4. Park slotu tahsisi + doluluk.
5. Sabır modeli.
6. `QueueSystem` temel (kuyruk slotları).
7. Müşteri `ActorView` (statik, yön).
8. Dev overlay genişletme.
9. Testler + golden'lar.

### Files / Modules Expected

```
src/sim/systems/{ConversionSystem,CustomerFsmSystem,VehicleManeuverSystem,QueueSystem}.ts
src/sim/ai/fsm/customerFsm.ts · src/sim/nav/maneuvers.ts
src/config/conversion.ts
src/render/views/CustomerView.ts
tests/unit/sim/customer/{conversion,fsm,patience,parking,maneuver}.test.ts
tests/visual/{stage1-first-customer,stage1-queue}.spec.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 6. Read docs/WORKING_DISCIPLINE.md and docs/GAME_DESIGN_DOCUMENT.md
sections 8.1 and 9.5.

SCOPE
Turning passing vehicles into customers, up to the point where they are waiting
to order. No ordering, no food, no money yet.

DELIVERABLES

1. ConversionSystem — evaluate P(convert) ONCE per vehicle at a decision point
   roughly 40 metres upstream of the entrance. One roll per vehicle, ever.
   Re-rolling would be both non-deterministic in spirit and unfair.

   P = clamp(archetype.baseAffinity * visibility * menuAppeal * priceFit
             * queuePenalty * spilloverPenalty * reputationFactor * timeOfDayFit
             * weatherFactor * noveltyDecay, 0, MAX_CONVERSION[stage])

   Factors not yet implemented (menuAppeal, priceFit) are literal 1.0 constants
   in config with a TODO naming the phase that fills them in — never hidden
   magic numbers in code.

2. CONVERSION_FAILED events MUST carry a reason code:
   QUEUE_TOO_LONG | NOT_VISIBLE | NO_DESIRED_ITEM | PRICE_TOO_HIGH |
   JUST_PASSING | REPUTATION_LOW | WRONG_TIME | WEATHER
   The Analytics panel in Phase 18 is built entirely from this stream, so
   collecting it correctly now costs nothing and saves a refactor later.

3. CustomerFsmSystem — the dine-in branch of the state machine in
   GAME_DESIGN_DOCUMENT 8.1. Drive-thru comes in Phase 11.
   Every waiting state must have a patience countdown and an exit to ABANDONING.
   Write a test that walks the FSM graph and asserts: no unreachable states,
   no state without an exit, no terminal state with an outgoing transition.

4. VehicleManeuverSystem — authored Bezier splines for entry, parking, and exit.
   No search. Parking slot assignment picks the nearest free slot with a
   deterministic tie-break on slot index.

5. When no parking is free: the customer must leave visibly angry, not vanish.
   This is a designed moment — the player has to see the cost of under-building.

6. Patience — decreases per tick while waiting, modulated by archetype.
   Drive-thru patience (Phase 11) will be far lower than seated patience.

WHAT MAKES THIS PHASE SUCCEED
The single most important moment in the game is a car braking and turning in
because of something the player built. Give it weight: the indicator, the
brake lights, the deceleration curve, a small dust puff. Spend effort here.

PERFORMANCE
120 vehicles + 20 customers: tick p95 <= 2.2 ms, zero steady-state allocation.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus: watch 20 conversions and confirm the moment
lands. Report that judgement honestly. Then STOP.
```

### Risks

| Risk                                   | Olasılık | Etki       | Azaltma                                                                        |
| -------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------ |
| Dönüşüm anının "tatmin edici" olmaması | Orta     | **Yüksek** | Faz DoD'sinde açık yargı maddesi; sinyal/fren/toz efektlerine bilinçli yatırım |
| Park manevralarının garip görünmesi    | Orta     | Orta       | Elle yazılmış spline'lar; görsel inceleme                                      |
| FSM'de deadlock                        | Orta     | Yüksek     | Tam kapsama FSM testi + rastgele başlangıç durumu testi                        |
| Dönüşüm oranının ayarsız olması        | Yüksek   | Düşük      | Faz 12'de ayarlanacak; şimdilik zarf içinde olması yeterli                     |

### Rollback

Dönüşüm sistemi kapatılırsa Faz 5 durumuna dönülür.

### Success Metrics

- Araç dönüşü anı ikna edici (raporlanmış yargı)
- FSM testleri tam kapsama
- Sebep kodlu event akışı çalışıyor
- Perf bütçesi içinde

### Definition of Done

WORKING_DISCIPLINE §4 + dönüşüm anı yargısı.

---

## PHASE 7 — NAVIGATION & PATHFINDING

### Objective

Yayaların (müşteri ve ileride çalışan) dünyada gerçekten yürümesini sağlamak: grid, hedef başına flow field, yerel steering, kuyruk slotları, A* fallback.

### Player Value

Karakterler ışınlanmıyor; park yerinden kapıya yürüyorlar, birbirlerinin etrafından dolaşıyorlar, kapıda sıraya giriyorlar. Dünya bir adım daha inandırıcı.

### Business Value

Faz 8 (servis) ve Faz 10 (çalışan AI) bunun üstüne kuruluyor. Şimdi yapılmazsa her ikisinde de atılacak geçici yürüme kodu yazılır — bu, faz sırası değişikliği D2'nin gerekçesi.

### Dependencies

Faz 6 (yürüyecek müşteriler), Faz 3 (layout).

### Systems

`NavGrid` · `FlowFieldCache` · `SteeringSystem` · `QueueSlotSystem` · `AStarFallback`.

### Game Design

Yürüme hızı ~1.35 m/s (insan yürüyüş hızı). Kapı, tezgâh ve masa önlerinde adlandırılmış kuyruk slotları. Kalabalık, itişme değil sıra üretir.

### Technical Architecture

- Grid: 0.5 m hücre, layout'tan üretilir (statik engeller + yerleştirilmiş nesneler).
- Flow field: hedeften geriye Dijkstra → integration field → vektör alanı. **Yalnızca layout değişiminde** hesaplanır, oyun döngüsünde değil.
- Hedefler adlandırılmış: `counter`, `kitchen_pass`, `table_<n>`, `exit`, `bin_<n>`, `dt_window`, `parking_<n>`.
- Steering: flow field yönü + ayrım (separation) + hedefe varışta yavaşlama. Tam RVO yok — gereksiz karmaşıklık.
- A*: yalnızca dinamik tek seferlik hedefler.
- Bellek: 64×64 × 20 hedef × 2 float ≈ 650 KB.

### UI/UX

Dev overlay: flow field vektör görselleştirme, grid engelleri, ajan yolları.

### Assets

Yürüme için karakter parçaları zaten var. Yeni asset yok.

### Animation

İlk prosedürel yürüyüş: sinüs tabanlı bacak/kol salınımı + gövde bob'u. Doll rig'in ilk gerçek kullanımı (tam rig Faz 17'de).

### Audio

Ayak sesi event'i tanımlanır.

### Data

Grid ve hedefler layout config'inden türetilir; kaydedilmez (yeniden hesaplanabilir).

### Testing

- Flow field: her ulaşılabilir hücreden hedefe ulaşılıyor; ulaşılamaz hücreler işaretli.
- Engel eklenince yeniden hesaplama doğru.
- A* açık grid'de flow field ile aynı optimal yolu buluyor.
- Steering: ajanlar birbirinin içinden geçmiyor (min mesafe).
- Kuyruk slotları: sıra korunuyor, atlama yok.
- **Deadlock testi:** 500 rastgele başlangıç durumu × 2000 tick → her koşuda en az bir ajan hedefe ulaşmalı.
- Bench: 64×64 grid, 20 hedef, tam yeniden hesaplama ≤ 12 ms.

### Performance

60 yaya + 120 araç: tick p95 ≤ 2.5 ms. Flow field yeniden hesaplaması bir frame'i bloklamamalı (gerekirse hedef başına parçalı).

### Security

Değişiklik yok.

### Deployment

Preview'da yürüyen insanlar.

### Tasks

1. `NavGrid` (layout → grid, engel işaretleme).
2. `FlowFieldCache` (Dijkstra + integration + vektör alanı, invalidation).
3. `SteeringSystem` (flow + separation + arrival).
4. `QueueSlotSystem` (adlandırılmış slot listeleri, sıra).
5. `AStarFallback`.
6. Prosedürel yürüme animasyonu (rig'in ilk kullanımı).
7. Dev görselleştirme.
8. Deadlock test harness'ı.

### Files / Modules Expected

```
src/sim/nav/{NavGrid,FlowField,FlowFieldCache,aStar,steering,queueSlots}.ts
src/sim/systems/NavigationSystem.ts
src/render/rig/{DollRig,proceduralWalk}.ts
src/render/debug/NavDebug.ts
tests/unit/sim/nav/{flowField,aStar,steering,queueSlots,grid}.test.ts
tests/integration/nav/deadlock.test.ts · tests/perf/nav.bench.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 7. Read docs/WORKING_DISCIPLINE.md, docs/GAME_DESIGN_DOCUMENT.md section 10,
and docs/RESEARCH_NOTES.md section 8 (it explains why flow fields, not A*).

SCOPE
Pedestrian navigation. Vehicles already move on lane splines — do not touch them.

WHY FLOW FIELDS HERE
Few goals, many agents, small fixed map, layout changes rarely. That is the exact
case where one field serves every agent at O(1) lookup, versus A* re-searching the
same corridor 40 times. The usual flow-field weakness (huge maps, heavy memory) does
not apply: 64x64 x 20 goals x 2 floats is about 650 KB.

DELIVERABLES

1. NavGrid — 0.5 m cells derived from the layout config. Static obstacles plus
   placed objects. Must expose an invalidation hook for when the player builds.

2. FlowFieldCache — per named goal: Dijkstra from the goal producing an
   integration field, then a vector field. Recompute ONLY on layout change.
   If a full recompute would exceed one frame, chunk it across frames per goal —
   but measure first; 12 ms for all 20 goals is the budget.
   Named goals: counter, kitchen_pass, table_<n>, exit, bin_<n>, dt_window,
   parking_<n>.

3. SteeringSystem — flow direction + separation + arrival damping. Do NOT
   implement RVO. Agents should not interpenetrate, but they also should not
   shove each other; in doorways and at counters they should QUEUE.

4. QueueSlotSystem — ordered named slots in front of each service point.
   An agent claims a slot, advances as the queue moves, and never jumps.
   Deterministic ordering.

5. AStarFallback — only for rare one-off dynamic targets. Test that on an open
   grid it produces the same optimal path as the flow field.

6. Procedural walk — first real use of the Doll rig: sine-driven legs and arms,
   torso bob, frequency proportional to speed. Pure maths, unit tested
   (given clip + t, expected transform). This is in src/render, not src/sim.

7. DEADLOCK TEST — the nastiest failure mode in agent systems is a state where
   nobody can move. Run 500 randomised initial configurations for 2000 ticks each
   and assert at least one agent reaches its goal in every run. Make this part of
   the integration suite permanently.

PERFORMANCE
60 pedestrians + 120 vehicles: tick p95 <= 2.5 ms, zero steady-state allocation.
Full flow-field recompute <= 12 ms.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus: watch 30 pedestrians navigate a crowded
entrance and confirm they look like people, not particles. Then STOP.
```

### Risks

| Risk                                              | Olasılık | Etki       | Azaltma                                                  |
| ------------------------------------------------- | -------- | ---------- | -------------------------------------------------------- |
| Kalabalıkta deadlock                              | Orta     | **Yüksek** | 500 senaryo × 2000 tick deadlock testi kalıcı süitte     |
| Ajanların "parçacık" gibi görünmesi               | Orta     | Orta       | Kuyruk slotları + varış yavaşlaması + prosedürel yürüyüş |
| Flow field yeniden hesaplamasının frame düşürmesi | Düşük    | Orta       | Ölçüm; gerekirse parçalı hesaplama                       |
| Layout değişimi invalidation'ının kaçırılması     | Orta     | Orta       | Tek giriş noktası + test                                 |

### Rollback

Navigasyon kapatılırsa müşteriler park yerinde bekler (bozuk ama çökmez). Faz 6 durumuna dönüş mümkün.

### Success Metrics

Kalabalık girişte 30 yaya doğal görünüyor; deadlock testi yeşil; perf bütçesi içinde.

### Definition of Done

WORKING_DISCIPLINE §4 + deadlock testi + yaya doğallığı yargısı.

---

## PHASE 8 — FOOD / ORDER / SERVICE LOOP

### Objective

Döngüyü kapatmak: menü, sipariş, istasyon rezervasyonu, hazırlık, pass, teslim, yeme, ödeme, memnuniyet.

### Player Value

**Oyun ilk kez oynanabilir.** Müşteri gelir, sipariş verir, oyuncu hazırlar, teslim eder, para kazanır.

### Business Value

Core loop'un ilk tam kapanışı. Buradan sonra her şey bu döngünün üstüne inşa edilir.

### Dependencies

Faz 6 (müşteri), Faz 7 (navigasyon), Faz 4 (yemek ikonları).

### Systems

`KitchenSystem` · `ServiceSystem` · `SatisfactionSystem` · `OrderStore` · manuel hazırlık girdisi.

### Game Design

- Aşama 1 menüsü: limonata, sosisli, cips ([ECONOMY_DESIGN §4](ECONOMY_DESIGN.md#4-menü--fiyat-maliyet-süre)).
- Oyuncu manuel hazırlar (tıkla-başlat; tıklama süreyi kısaltmaz — E9 sömürüsü kapalı).
- Sıcaklık/tazelik: pass'te bekleyen yemek kalite kaybeder.
- Memnuniyet modeli ([GAME_DESIGN_DOCUMENT §12](GAME_DESIGN_DOCUMENT.md#12-müşteri-memnuniyeti-modeli)) — bu fazda bekleme + kalite + fiyat girdileri aktif; temizlik/atmosfer sonraki fazlarda.

### Technical Architecture

- `Order` = müşteri + kalemler + durum + zaman damgaları. Havuzlanmış.
- İstasyon rezervasyonu: bir istasyon aynı anda tek sipariş; kuyruk FIFO + kanal önceliği.
- Pass: hazır yemek nesnesi + `readyAtTick`; sıcaklık düşüşü tick'te hesaplanır.
- Ödeme: `PAYMENT` event'i (tutar, bahşiş, memnuniyet) → ekonomi.

### UI/UX

- Müşteri üstünde sipariş balonu (ne istediği).
- Hazırlık istasyonunda ilerleme göstergesi.
- Pass'te hazır yemek + sıcaklık göstergesi.
- Ödeme anında `+₡` popup.
- HUD'da nakit (Svelte, ilk gerçek bağlantı).

### Assets

Yemek ikonları, sipariş balonu, ilerleme göstergesi, sikke popup'ı.

### Animation

Hazırlık: ekipman shake/glow. Yeme: rig klibi (basit). Ödeme: sikke uçuşu.

### Audio

Event'ler tanımlı; ses Faz 17'de.

### Data

`src/config/economy/menu.ts` (Aşama 1 kalemleri), `stations.ts`.

### Testing

- **Uçtan uca integration:** spawn → dönüşüm → park → yürü → sipariş → hazırlık → teslim → ödeme → çıkış.
- İstasyon rezervasyonu: çakışma yok.
- Sıcaklık düşüşü kaliteyi doğru azaltıyor.
- Memnuniyet: her girdi izole; `∈[0,1]`.
- Manuel hazırlık: hızlı tıklama süreyi kısaltmıyor (E9).
- Deadlock: tüm istasyonlar meşgul + kuyruk dolu → kilitlenme yok.
- Visual golden: `stage1-serving`.
- E2E: 60 saniyede en az 3 müşteri servis ediliyor ve nakit artıyor.

### Performance

Tick p95 ≤ 2.8 ms (120 araç + 40 yaya + 20 sipariş).

### Security

Değişiklik yok.

### Deployment

Preview'da oynanabilir bir oyun (ilk kez).

### Tasks

1. `OrderStore` + `Order` yaşam döngüsü.
2. `KitchenSystem` (istasyon rezervasyonu, hazırlık, pass).
3. `ServiceSystem` (teslim, yeme, ödeme).
4. `SatisfactionSystem` (bekleme + kalita + fiyat).
5. Manuel hazırlık girdisi (`MANUAL_PREP` command).
6. Sipariş balonu, ilerleme göstergesi, sikke popup'ı.
7. HUD'da nakit (ilk Svelte↔sim köprüsü).
8. Sıcaklık/tazelik.
9. Testler + golden.

### Files / Modules Expected

```
src/sim/systems/{KitchenSystem,ServiceSystem,SatisfactionSystem}.ts
src/sim/stores/OrderStore.ts · src/config/economy/{menu,stations}.ts
src/config/satisfaction.ts
src/ui/components/{HudCash,OrderBubble,ProgressRing,CoinPopup}.svelte
src/app/bridge/UiBridge.ts
tests/unit/sim/service/{kitchen,order,satisfaction,holdTemperature}.test.ts
tests/integration/serviceLoop.test.ts · tests/visual/stage1-serving.spec.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 8. Read docs/WORKING_DISCIPLINE.md, docs/GAME_DESIGN_DOCUMENT.md sections
11-12, docs/ECONOMY_DESIGN.md section 4.

SCOPE
Close the core loop. Stage 1 menu only (lemonade, hot dog, chips). Manual prep by
the player. No employees, no upgrades, no drive-thru.

DELIVERABLES

1. OrderStore — pooled Order objects: customer id, items, state, timestamps.
   Zero allocation in steady state.

2. KitchenSystem — one order per station at a time. Queue is FIFO within channel
   priority. Cooking time comes from config, never a literal.

3. Hold temperature — food sitting on the pass loses quality:
     quality = qualityBase * (1 - max(0, (heldMs - holdTolerance) / holdDecayMs) * 0.6)
   This is what will later punish "many cooks, too few waiters". Get it right now.

4. ServiceSystem — delivery, eating duration, payment. Emit PAYMENT with amount,
   tip, and satisfaction.

5. SatisfactionSystem — the weighted model from GAME_DESIGN_DOCUMENT 12. Only
   wait, quality, and price inputs are live this phase; the others read from
   config constants set to neutral, with a TODO naming their phase.

6. MANUAL_PREP command — clicking STARTS preparation. Clicking faster must NOT
   shorten it (exploit E9 in ECONOMY_DESIGN section 14). Write the test that
   proves this.

7. FIRST UI BRIDGE — cash in the HUD, via src/app/bridge/UiBridge.ts.
   src/ui must NOT import src/sim; dependency-cruiser enforces this.
   The bridge throttles to 10 Hz. The UI never runs per frame.

8. WORLD-SPACE FEEDBACK — order bubble above the customer, progress ring on the
   station, coin popup on payment. These are how the player reads the system
   without looking at the HUD; treat them as gameplay, not decoration.

9. END-TO-END INTEGRATION TEST — spawn to despawn, asserting each stage transition
   and that cash increased by the expected amount.

10. DEADLOCK TEST — all stations busy, queue full, pass full: the system must
    still make progress. Add to the permanent suite.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus: play for 10 minutes. Is the loop satisfying
on its own, before any upgrades exist? Report that judgement honestly. Then STOP.
```

### Risks

| Risk                                        | Olasılık | Etki       | Azaltma                                                                         |
| ------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------- |
| Döngünün yükseltmeler olmadan sıkıcı olması | Orta     | **Yüksek** | Bu bir sinyal — Faz 9'daki slice kapısı için erken uyarı. Sıkıcıysa raporlanır. |
| Mutfak deadlock'u                           | Orta     | Yüksek     | Kalıcı deadlock testi                                                           |
| UI↔sim köprüsünün per-frame çalışması       | Orta     | Orta       | 10 Hz throttle + katman zorlaması + perf testi                                  |

### Rollback

Servis sistemleri kapatılırsa Faz 7 durumuna dönülür.

### Success Metrics

Uçtan uca döngü çalışıyor; 60 sn'de ≥3 müşteri; nakit artıyor; döngü tatmin yargısı raporlandı.

### Definition of Done

WORKING_DISCIPLINE §4 + döngü tatmin yargısı.

---

## PHASE 9 — ECONOMY v1 & UPGRADE SYSTEM v1 · ★ VERTICAL SLICE GATE

### Objective

Döngüyü kapatan minimum ekonomiyi ve ilk anlamlı yükseltmeleri eklemek — ve ardından **vertical slice'ı resmî olarak değerlendirmek**.

### Player Value

İlk kez bir **karar** verilir: parayı neye yatıracağım? Ve kararın sonucu dünyada görülür.

### Business Value

Bu faz, projenin en önemli kapısını içerir. Buradan sonra üretim yatırımı hızla artıyor; bu yüzden konseptin çalıştığı **burada** kanıtlanmalı.

### Dependencies

Faz 8 (servis döngüsü).

### Systems

`EconomySystem` · `UpgradeSystem` (v1) · dünya-içi yükseltme UI'ı · nakit/gelir takibi.

### Game Design

**İlk 6 yükseltme** — her biri farklı bir aile ve farklı bir darboğaz:

| #   | Yükseltme                       | Etki                             | Görsel         |
| --- | ------------------------------- | -------------------------------- | -------------- |
| 1   | Elle boyanmış tabela (₡12)      | `visibility` 1.0→1.30            | Tabela belirir |
| 2   | Menü panosu (₡28)               | `menuAppeal` ↑, sipariş süresi ↓ | Pano belirir   |
| 3   | İkinci hazırlık istasyonu (₡45) | Paralel hazırlık                 | Yeni ekipman   |
| 4   | Daha büyük tezgâh (₡40)         | Kuyruk kapasitesi +2             | Tezgâh büyür   |
| 5   | Yol kenarı işaret levhası (₡60) | Karar noktası +15 m              | Yolda obje     |
| 6   | Soğutucu (₡35)                  | `holdTolerance` ↑                | Buzdolabı      |

Fiyat ayarı (±%50) da bu fazda gelir — tek düğmeyle stratejik derinlik.

### Technical Architecture

- `EconomySystem`: gelir/gider birikimi, nakit, gelir/dk hesabı (kayan pencere).
- `UpgradeSystem`: `BUY_UPGRADE` command → config'ten etki uygula → `UPGRADE_APPLIED` event → render görsel değişikliği yapar.
- Yükseltme etkileri **config'te tanımlı veri**, kodda `if` zinciri değil.
- `combineDiminishing()` baştan — çarpan istifleme sömürüsü (E4) hiç oluşmaz.

### UI/UX

- **Dünya-içi yükseltme kartı**: nesneye tıkla → yanında kart açılır ([GAME_DESIGN_DOCUMENT §14.3](GAME_DESIGN_DOCUMENT.md#143-dünya-içi-yükseltme-modal-spame-karşı)). Modal yok.
- HUD: nakit + gelir/dk trendi.
- Fiyat ayarı paneli (basit).
- Tek aktif hedef göstergesi.

### Assets

Yükseltme sonrası görselleri (tabela, pano, ekipman, tezgâh, levha, soğutucu) — Faz 4'te üretildi.

### Animation

Yükseltme anı: kısa inşaat efekti + parıltı + kamera nudge.

### Audio

Event'ler tanımlı.

### Data

`src/config/economy/upgrades.ts`, `stages.ts` (Aşama 1 zarfı).

### Testing

- Yükseltme maliyet formülü, her aile/seviye.
- `combineDiminishing()` çarpan istiflemeyi engelliyor.
- Yükseltme → sim parametresi değişiyor → çıktı ölçülebilir değişiyor (integration).
- Nakit negatife inmiyor.
- İlk balance koşusu (tam kapı Faz 12'de).
- E2E: yükseltme satın al → nakit düş → görsel değiş → dönüşüm oranı ölçülebilir artsın.
- Visual golden'lar: yükseltme öncesi/sonrası.

### Performance

Değişiklik yok; bütçeler korunur.

### Security

`BUY_UPGRADE` command'ı sim'de doğrulanır (yetersiz nakit → reddedilir, UI'a güvenilmez).

### Deployment

**Vertical slice preview URL'i** — değerlendirme bu URL üzerinden yapılır.

### Tasks

1. `EconomySystem` (nakit, gelir/dk, gider).
2. `UpgradeSystem` + config-driven etkiler + `combineDiminishing()`.
3. 6 yükseltme + görsel değişiklikleri.
4. Fiyat ayarı (±%50).
5. Dünya-içi yükseltme kartı UI'ı.
6. HUD: nakit, gelir trendi, hedef.
7. Yükseltme VFX'i.
8. Testler + golden'lar.
9. **Vertical slice değerlendirmesi** (aşağıda).

### Files / Modules Expected

```
src/sim/systems/{EconomySystem,UpgradeSystem}.ts
src/sim/math/combineDiminishing.ts
src/config/economy/{upgrades,stages,tuning}.ts
src/ui/components/{UpgradeCard,HudIncome,ObjectivePanel,PricePanel}.svelte
src/render/fx/UpgradeBurst.ts
tests/unit/sim/economy/{cash,income,upgradeCost,diminishing}.test.ts
tests/integration/upgradeEffect.test.ts
tests/e2e/upgradeFlow.spec.ts · tests/visual/upgrade-before-after.spec.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 9. Read docs/WORKING_DISCIPLINE.md and docs/ECONOMY_DESIGN.md in full
(especially sections 6, 7, 8, 14).

SCOPE
Minimum economy to close the loop, plus exactly six upgrades. Not the full tree —
that is Phase 13. Not final balance — that is Phase 12.

HARD RULES
- No economic number may appear as a literal in gameplay code. All of it lives in
  src/config/economy/**, typed, readonly, validated by Zod in dev builds.
- Every upgrade must have all four of: cost, measurable simulation effect,
  visible world change, and a gameplay consequence. An upgrade missing any one of
  these does not ship. "+3% efficiency" upgrades are banned.
- Implement combineDiminishing() from day one:
    combined = 1 - product(1 - effect_i * categoryWeight)
  This structurally prevents multiplier stacking (exploit E4). Add its test now,
  before there are enough upgrades for the exploit to exist.
- BUY_UPGRADE is validated in the simulation. Never trust the UI: insufficient
  funds must be rejected in src/sim, and there must be a test that dispatches an
  unaffordable purchase directly and asserts it is refused.

THE SIX UPGRADES — one per family, each unblocking a different bottleneck:
  hand-painted sign 12    -> visibility 1.0 -> 1.30, sign appears
  menu board 28           -> menuAppeal up, order time down, board appears
  second prep station 45  -> parallel prep, equipment appears
  bigger counter 40       -> queue capacity +2, counter grows
  roadside marker 60      -> decision point +15 m, object appears on road
  cooler 35               -> holdTolerance up, fridge appears

WORLD-IN-PLACE UPGRADE UI (GAME_DESIGN_DOCUMENT 14.3)
Click an object in the world; a compact contextual card opens beside it showing
current level, the exact before/after numbers, and the cost. No modal. The game
must never be covered. This is the UX decision that keeps the game visually
dominant — implement it properly, not as a stopgap.

VISUAL FEEDBACK IS NOT OPTIONAL
Every purchase changes the world visibly within one second. If you cannot make an
upgrade visible, it is the wrong upgrade — say so rather than shipping an
invisible one.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, then run the VERTICAL SLICE REVIEW below and report
all eight criteria with evidence. Do NOT start Phase 10 regardless of the result.
```

### ★ VERTICAL SLICE GATE

Faz 9 tamamlandığında, genişlemeden **önce** zorunlu değerlendirme. Kriterler [GAME_DESIGN_DOCUMENT §23](GAME_DESIGN_DOCUMENT.md#23-vertical-slice-tanımı--gate-kriteri)'ten:

| #   | Kriter                                                         | Ölçüm                  |
| --- | -------------------------------------------------------------- | ---------------------- |
| 1   | 10 dakikalık oturum kesintisiz ve anlaşılır                    | 3 kişi, sesli düşünme  |
| 2   | Oyuncu ilk 60 saniyede ne yapacağını **anlatılmadan** anlıyor  | Müdahalesiz gözlem     |
| 3   | En az 2 anlamlı yükseltme kararı verildi, etkisi görüldü       | Gözlem                 |
| 4   | Ekran görüntüsü tür ortalamasının görsel olarak üstünde        | Yan yana karşılaştırma |
| 5   | Masaüstü 60 FPS, mobil ≥40 FPS, gerçek cihazda                 | PERF_LOG               |
| 6   | 30 dakikada sıfır kritik konsol hatası, sıfır bellek sızıntısı | DevTools               |
| 7   | Kaydet → yenile → tam geri yükleme                             | E2E                    |
| 8   | "Tekrar oynar mıyım?" → 3/3 evet                               | Test notları           |

**GEÇERSE:** Faz 10'a onay istenir.
**GEÇMEZSE:** **Genişleme durur.** Faz 10+ başlamaz. Bulgular raporlanır, düzeltme planı sunulur, slice yeniden değerlendirilir. Bu, projenin en önemli koruma mekanizması ve pazarlığa kapalıdır.

### Risks

| Risk                               | Olasılık | Etki           | Azaltma                                                                         |
| ---------------------------------- | -------- | -------------- | ------------------------------------------------------------------------------- |
| **Slice kapısından geçilememesi**  | Orta     | **Çok yüksek** | Kapının amacı zaten bu. Erken uyarılar Faz 5, 6, 8 DoD yargılarında toplanıyor. |
| Yükseltme etkisinin hissedilmemesi | Orta     | Yüksek         | Minimum anlamlılık eşiği (≥%12 / ≥1 birim / ≥2 puan)                            |
| Ekonominin dengesiz olması         | Yüksek   | Düşük          | Faz 12'de ayarlanacak; şu an zarf içinde olması yeterli                         |

### Rollback

Yükseltme sistemi kapatılırsa Faz 8 durumuna dönülür.

### Success Metrics

Sekiz slice kriterinin hepsi + WORKING_DISCIPLINE §4.

### Definition of Done

WORKING_DISCIPLINE §4 + **8 slice kriterinin kanıtlı raporu** + geçti/kaldı kararı.

---

## PHASE 10 — EMPLOYEE AI

### Objective

Çalışanları getirmek: ortak FSM iskeleti, rol görev tabloları, merkezi `TaskBoard`, işe alım/çıkarma, maaş, skill.

### Player Value

Oyuncu manuel hazırlıktan kurtulur ve **yönetici** olur. Darboğaz "tıklama hızı"ndan "sistem tasarımı"na kayar. Dünyada çalışan insanlar belirir.

### Business Value

Aşama 2 ve 3'ün ön koşulu. Ayrıca oyunun "yönetim" kimliği burada doğar.

### Dependencies

Faz 7 (navigasyon), Faz 8 (servis döngüsü), Faz 9 (ekonomi — maaş).

### Systems

`EmployeeBrain` (ortak FSM) · `TaskBoardSystem` · `EmployeeFsmSystem` · rol görev tabloları (Aşçı, Garson, Temizlikçi) · maaş tahakkuku.

### Game Design

- **Aşçı** (Aşama 2): sipariş alır, istasyona gider, pişirir, pass'e koyar.
- **Garson** (Aşama 3 hazırlığı): sipariş alır, mutfağa iletir, hazır yemeği masaya götürür, masa temizler.
- **Temizlikçi** (Aşama 3 hazırlığı): kirlilik puanına göre hedef seçer.
- Skill seviyeleri: hız, hata oranı, multitasking kapasitesi.
- Maaş sürekli bir sink — aşırı personel cezalandırılır.

### Technical Architecture

- Tek `EmployeeBrain`: `IDLE | MOVING | PERFORMING | BLOCKED`. Rol farkı görev tablosunda, FSM'de değil. Bu, dört FSM yerine bir iskeletin test edilmesini sağlar.
- `TaskBoard`: açık görevler puanlanır (`aciliyet × ödül − mesafe × maliyet`), boştaki en uygun çalışana atanır. Eşitlikte entity ID sıralaması → deterministik.
- Görev iptali: aktif görev güvenli iptal edilebilir (çalışan işten çıkarılırsa, masa kaybolursa).

### UI/UX

Personel paneli: liste, rol, skill, maaş, işe al/çıkar, eğitim. Dünyada: çalışanın üstünde küçük görev ikonu (ne yapıyor).

### Assets

Çalışan karakter varyantları (üniforma) — parça takası ile.

### Animation

Rig klipleri: `take_order`, `cook`, `serve`, `clean`, `walk_carry`.

### Audio

Ayak sesi, mutfak sesleri (event'ler).

### Data

`src/config/economy/wages.ts`, `src/config/employees.ts` (rol yetenekleri, görev tabloları). Save'e `staff` bölümü eklenir → **schema v2 + migration**.

### Testing

- Her rolün görev tablosu: tüm görevler erişilebilir.
- `TaskBoard`: iki çalışan aynı göreve atanamıyor; puanlama deterministik.
- **Işınlanma yok testi:** her pozisyon değişimi `speed × dt` ile sınırlı.
- Görev iptali temiz.
- Maaş tahakkuku, kısmi dakika dahil.
- Maaş ödenemezse ayrılma sırası deterministik.
- Deadlock: tüm çalışanlar bloke → sistem ilerliyor.
- Migration v1→v2.

### Performance

8 çalışan + 60 yaya + 120 araç: tick p95 ≤ 3.0 ms.

### Security

`HIRE`/`FIRE` command'ları sim'de doğrulanır.

### Deployment

Preview'da çalışan restoran.

### Tasks

1. `EmployeeBrain` ortak FSM.
2. Rol görev tabloları (Aşçı, Garson, Temizlikçi).
3. `TaskBoardSystem` (puanlama, atama, iptal).
4. İşe alım/çıkarma command'ları + ücret.
5. Skill sistemi (hız, hata, multitask).
6. Maaş tahakkuku + ödenememe → ayrılma.
7. Personel paneli (Svelte).
8. Rig klipleri (5 adet).
9. Save schema v2 + migration + fixture.
10. Testler.

### Files / Modules Expected

```
src/sim/ai/{EmployeeBrain,taskTables/{cook,waiter,cleaner}}.ts
src/sim/systems/{TaskBoardSystem,EmployeeFsmSystem}.ts
src/config/{employees,economy/wages}.ts
src/ui/screens/StaffPanel.svelte · src/render/views/EmployeeView.ts
src/persistence/migrations/v1_to_v2.ts · tests/fixtures/saves/save-v2.json
tests/unit/sim/employees/{brain,taskboard,wages,skill,noTeleport}.test.ts
tests/integration/employeeLifecycle.test.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 10. Read docs/WORKING_DISCIPLINE.md and docs/GAME_DESIGN_DOCUMENT.md
sections 8.2 - 8.7.

SCOPE
Employees. Cook is fully used now; Waiter and Cleaner are implemented and tested
but only become active in Phase 11 when Stage 3 exists.

ARCHITECTURE — ONE BRAIN, MANY TASK TABLES
Do not write four state machines. Write one EmployeeBrain with states
IDLE / MOVING / PERFORMING / BLOCKED, and express each role as a data-driven task
table. This means the state machine is tested once and every role inherits that
guarantee. Adding a role later is data, not code.

TASKBOARD
Central. Open tasks are scored: urgency * reward - distance * cost. The best idle
employee claims the best task. Ties break on entity id so it is deterministic.
This structurally prevents the classic bug where two waiters run to the same table.
Task cancellation must be safe: firing an employee mid-task, or removing a table
that is the target of a task, must not corrupt state. Test both.

NO TELEPORTING — HARD REQUIREMENT
Write a test that records every employee position each tick and asserts the delta
never exceeds speed * dt * tolerance. Employees walking through walls or blinking
between stations is the single most immersion-breaking bug in this genre, and it
is easy to introduce accidentally when adding a shortcut later. Lock it now.

WAGES
Continuous drain, accrued per tick including partial minutes. If cash cannot cover
wages for 3 real minutes, one employee leaves with warning, highest-paid first,
deterministically. Cash never goes below zero, and there is no debt or game over.

SAVE SCHEMA v2
Add the staff section. Write the v1 -> v2 migration, commit
tests/fixtures/saves/save-v2.json, and confirm the v1 -> current chain still
passes. Backward compatibility is WORKING_DISCIPLINE rule 13 and it is tested.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus: watch employees for 5 minutes. Do they look
like workers with intent, or like tokens sliding on a board? Report honestly.
Then STOP.
```

### Risks

| Risk                                                      | Olasılık | Etki   | Azaltma                                                           |
| --------------------------------------------------------- | -------- | ------ | ----------------------------------------------------------------- |
| Çalışanların "jeton gibi kayması"                         | Orta     | Yüksek | Işınlanma testi + rig klipleri + görev ikonu + varış yavaşlaması  |
| TaskBoard'ın kötü kararlar vermesi (garson yanlış masaya) | Orta     | Orta   | Puanlama fonksiyonu config'te ayarlanabilir; integration testleri |
| Aktif görev iptalinde durum bozulması                     | Orta     | Yüksek | Açık iptal protokolü + test                                       |
| Maaşın oyunu erken boğması                                | Orta     | Orta   | Faz 12'de ayarlanır; zarf var                                     |

### Rollback

Çalışan sistemi kapatılırsa manuel hazırlığa dönülür (Faz 9 durumu).

### Success Metrics

Çalışanlar niyetli görünüyor; ışınlanma testi yeşil; TaskBoard deterministik; migration v1→v2 çalışıyor.

### Definition of Done

WORKING_DISCIPLINE §4 + çalışan doğallığı yargısı + migration kanıtı.

---

## PHASE 11 — RESTAURANT EVOLUTION

### Objective

Dört aşamalı evrimi kurmak: aşama geçiş sistemi, maskeli inşaat, layout sistemi, ve Aşama 2–4'ün yapısal içeriği (drive-thru dahil).

### Player Value

Oyunun en güçlü ödül anı: dünyanın fiziksel olarak büyümesi. Tezgâh → kamyon → lokanta → restoran, aynı arsada, kamera sabit.

### Business Value

Uzun vadeli ilerleme çerçevesi. Retention'ın en büyük tek kaldıracı.

### Dependencies

Faz 10 (çalışan AI — Aşama 3 garsonları gerektiriyor), Faz 4 (Aşama 1–2 sanatı; Aşama 3–4 placeholder, Faz 16'da gelecek).

### Systems

`ProgressionSystem` (evrim koşulları) · `LayoutSystem` (nesne yerleştirme) · `ConstructionSystem` (maskeli inşaat) · drive-thru kanalı · çoklu kasa.

### Game Design

- Evrim koşulu: nakit eşiği + kilometre taşı (sadece para değil — oyuncunun sistemi anlamış olması).
- Aşama geçişi: onaylı mı otomatik mi? **Bu fazda karara bağlanır** ([GAME_DESIGN_DOCUMENT §25 S5](GAME_DESIGN_DOCUMENT.md#25-açık-tasarım-soruları)).
- Layout: masa/ekipman yerleştirme — serbest mi grid mi? **Bu fazda karara bağlanır** (S4).
- Drive-thru: sipariş direği → şerit → pencere. Çok düşük sabır, yüksek throughput.
- Eski aşamanın izleri korunur (ilk tezgâh dekoratif obje olarak kalır).

### Technical Architecture

- Layout config'i aşama başına; yerleştirilen nesneler save'de (`layout.placed`).
- İnşaat: Phaser stencil rendering ile maske genişlemesi — sahne değişimi yok.
- Nesne yerleştirme navigasyon grid'ini invalidate eder → flow field yeniden hesabı.
- Save schema v3 (layout + stage).

### UI/UX

- Evrim kutlama ekranı (nadir, büyük, atlanabilir).
- İnşa modu: nesne seç → yerleştir → geçerlilik göstergesi (navigasyon bloke ediyor mu).
- Aşama ilerleme göstergesi.

### Assets

Aşama 3–4 yapıları **placeholder** (register'a yazılır), Faz 16'da gerçekleşir. Aşama 2 gerçek.

### Animation

İnşaat: maske genişlemesi + toz + iskele + tamamlanma parıltısı. Kamera yumuşak odak.

### Audio

İnşaat sesleri, evrim fanfarı (event'ler).

### Data

Save v3. `src/config/layouts/{stage1..stage4}.ts`.

### Testing

- Aşama geçişi: durum korunuyor, yeni sistemler aktif, eskiler bozulmuyor.
- Layout değişimi → flow field invalidation → ajanlar yeni yolu buluyor.
- Geçersiz yerleştirme (navigasyonu bloke eden) reddediliyor.
- Drive-thru uçtan uca (Aşama 4 fixture'ından).
- Save v2→v3 migration.
- Her aşamada 10 dakikalık integration koşusu, hata yok.
- Visual golden'lar: her aşama.

### Performance

Aşama 4 tam yük: 120 araç + 60 yaya + 12 çalışan → tick p95 ≤ 3.2 ms.

### Security

`EVOLVE` ve `PLACE` command'ları sim'de doğrulanır.

### Deployment

Preview'da dört aşama gezilebilir (debug ile atlama).

### Tasks

1. `ProgressionSystem` + evrim koşulları.
2. `LayoutSystem` (yerleştirme, geçerlilik, invalidation).
3. `ConstructionSystem` (maskeli inşaat, VFX).
4. Aşama 2/3/4 layout config'leri.
5. Drive-thru kanalı (müşteri FSM dalı, kuyruk, pencere).
6. Çoklu kasa.
7. Evrim kutlama ekranı.
8. İnşa modu UI'ı.
9. Save v3 + migration + fixture.
10. **Açık tasarım soruları S4 ve S5'i karara bağla.**
11. Testler + golden'lar.

### Files / Modules Expected

```
src/sim/systems/{ProgressionSystem,LayoutSystem,ConstructionSystem}.ts
src/sim/ai/fsm/driveThruFsm.ts
src/config/layouts/{stage2,stage3,stage4}.ts · src/config/progression.ts
src/ui/screens/{BuildMode,EvolutionCelebration}.svelte
src/render/fx/ConstructionMask.ts
src/persistence/migrations/v2_to_v3.ts · tests/fixtures/saves/save-v3.json
tests/integration/{evolution,driveThru,layoutChange}.test.ts
tests/visual/stage{2,3,4}-*.spec.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 11. Read docs/WORKING_DISCIPLINE.md and docs/GAME_DESIGN_DOCUMENT.md
section 7.

SCOPE
The four-stage evolution, the layout/build system, and the drive-thru channel.
Stage 3-4 art is placeholder in this phase (Phase 16 replaces it) — register
every placeholder.

THE CENTRAL DESIGN CONSTRAINT
Evolution is NOT a scene change. The camera stays put and the building grows in
place, revealed by an expanding stencil mask with construction VFX. The player's
first lemonade stand survives in a corner as a decorative object. This continuity
is what makes the progression feel like ownership rather than unlocking a level.

DELIVERABLES

1. ProgressionSystem — evolution requires BOTH a cash threshold AND a milestone.
   Money alone is not enough; the player should have demonstrated they understand
   the current stage before the next one opens.

2. LayoutSystem — placing objects. A placement that would block navigation must be
   rejected with clear visual feedback, not silently accepted and then break
   pathfinding. Placement invalidates the flow field cache — wire that explicitly
   and test that agents re-route.

3. ConstructionSystem — stencil-masked reveal (Phaser 4.2 stencil rendering),
   dust, scaffolding, completion flourish, gentle camera focus that the player can
   skip. Respect prefers-reduced-motion.

4. Drive-thru channel — order post, lane, window. Patience here is far lower than
   seated: the customer is in a car with an engine running. This asymmetry is the
   source of the game's central strategic tension, so tune it to actually bite.

5. Save schema v3, migration from v2, fixture committed, full v1 -> current chain
   still green.

TWO OPEN DESIGN QUESTIONS YOU MUST CLOSE (GAME_DESIGN_DOCUMENT section 25)
  S4: is furniture placement free-form or grid-snapped? Build both cheaply, try
      both, decide, and record why.
  S5: is stage transition automatic or player-confirmed? Decide from pacing data,
      record why.
Update GAME_DESIGN_DOCUMENT.md section 25 with the answers and the reasoning.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus: trigger an evolution and judge whether it
lands as a genuine reward moment. Report honestly. Then STOP.
```

### Risks

| Risk                                                            | Olasılık   | Etki           | Azaltma                                                                                                              |
| --------------------------------------------------------------- | ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Bu fazın kapsamının şişmesi** (4 aşama + layout + drive-thru) | **Yüksek** | Yüksek         | Aşama 3–4 sanatı kapsam dışı (Faz 16); yalnızca yapısal sistemler. Gerekirse Faz 11a/11b'ye bölünmesi teklif edilir. |
| Layout değişiminin navigasyonu bozması                          | Orta       | Yüksek         | Invalidation testi + geçersiz yerleştirme reddi                                                                      |
| Evrim anının yeterince büyük hissettirmemesi                    | Orta       | Orta           | Faz DoD yargısı; VFX yatırımı                                                                                        |
| Save v3 migration'ının veri kaybetmesi                          | Düşük      | **Çok yüksek** | Fixture testi + premigration yedeği                                                                                  |

### Rollback

Aşama kilitleme ile Aşama 1–2'ye geri dönülebilir (feature flag).

### Success Metrics

Dört aşama oynanabilir; evrim ödül gibi hissediyor; layout değişimi navigasyonu bozmuyor; migration temiz.

### Definition of Done

WORKING_DISCIPLINE §4 + evrim anı yargısı + S4/S5 kararları.

---

## PHASE 12 — ECONOMY BALANCING & BALANCE SIMULATOR

### Objective

Headless balance simülatörünü yazmak, CI kapısına bağlamak, ve ekonomiyi tasarlanan zarfa gerçekten oturtmak.

### Player Value

Oyun **adil ve tatmin edici** ilerler. Çıkmaz yok, anlamsız grind yok, tek doğru strateji yok.

### Business Value

Ekonomi dengesi bu türde oyunu öldüren en yaygın sorundur. Bunu bir CI testine dönüştürmek, projenin en özgün teknik farklılaştırıcılarından biri ve sonsuza kadar koruyucu bir güvence.

### Dependencies

Faz 11 (tüm aşamalar var olmalı — denge ancak tam sistemle ölçülebilir).

### Systems

`tools/balance-sim` · 5 oyuncu politikası · assertion seti · CI entegrasyonu.

### Game Design

[ECONOMY_DESIGN §3](ECONOMY_DESIGN.md#3-aşama-zarfları--sistemin-iskeleti)'teki zarflar hedef. Sapma varsa **config ayarlanır**, zarf değil (zarfı değiştirmek onay gerektirir).

### Technical Architecture

Node'da, gerçek `src/sim` çekirdeğini kullanarak, renderer olmadan. Politikalar `Command` üreten saf fonksiyonlar. 12 saatlik oynanış saniyeler içinde.

### UI/UX

Rapor çıktısı: aşama süreleri, gelir eğrileri, en ucuz yükseltme mesafesi, politika farkları. Markdown + CSV.

### Assets / Animation / Audio

Yok.

### Data

`docs/BALANCE_REPORT.md` (her koşuda güncellenir), zarf sabitleri config'te.

### Testing

Bu fazın çıktısı **testin kendisi**. [ECONOMY_DESIGN §13](ECONOMY_DESIGN.md#13-balance-simülatörü--ci-kapısı)'teki 10 assertion.

### Performance

Balance koşusu CI'da < 90 saniye. Aşarsa politika sayısı veya sim uzunluğu değil, **sim hızı** optimize edilir.

### Security

Yok.

### Deployment

CI kapısı aktif.

### Tasks

1. `tools/balance-sim` runner.
2. 5 politika (`greedy-cheapest`, `roi-optimal`, `throughput-first`, `margin-first`, `idle-player`).
3. 10 assertion.
4. Rapor üreteci.
5. CI entegrasyonu (merge kapısı).
6. **Gerçek denge ayarı** — config iterasyonları, her biri simülatörle doğrulanır.
7. 3 gerçek oyuncu ile 1 saatlik oturum, geri bildirim.
8. Nihai denge kontrol listesi ([ECONOMY_DESIGN §15](ECONOMY_DESIGN.md#15-nihai-denge-kontrol-listesi-faz-12-çıkış-kriteri)).

### Files / Modules Expected

```
tools/balance-sim/{runner,policies/*,assertions,report}.ts
docs/BALANCE_REPORT.md · .github/workflows/ci.yml (balance job)
src/config/economy/** (ayarlanmış değerler)
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 12. Read docs/ECONOMY_DESIGN.md in full, especially sections 3, 7, 8, 13, 15.

SCOPE
Build the balance simulator, wire it as a CI gate, then actually balance the game.
Building the tool is the easy half; using it to reach the designed envelope is the
work.

THE SIMULATOR
Runs in Node against the real src/sim core with no renderer. Five policies, each a
pure function producing Commands:
  greedy-cheapest, roi-optimal, throughput-first, margin-first, idle-player
Twelve simulated hours must complete in seconds.

TEN ASSERTIONS — all must pass or CI is red (ECONOMY_DESIGN section 13):
  stage 2 reached in 10-22 min; stage 3 in 28-70 min; stage 4 in 140-320 min;
  net income per minute within +/-25% of the designed envelope at each stage;
  cheapest meaningful upgrade never exceeds 90 s of income (no dead ends, MERGE-BLOCKING);
  no upgrade purchase ever reduces net income (no regressions);
  best vs worst policy spread <= 2.5x (no single dominant strategy);
  income per minute stays under 600 after 12 hours (no exponential escape);
  cash never goes negative;
  unbought upgrades still exist after 6 hours in stage 4 (content not exhausted).

BALANCING DISCIPLINE
When an assertion fails, adjust the CONFIG, not the envelope. The envelope in
ECONOMY_DESIGN section 3 is the design contract; changing it requires approval and
a roadmap change request. If you become convinced the envelope itself is wrong,
stop and raise that as a change request with evidence — do not quietly widen it.

HUMAN VALIDATION
Automated assertions cannot tell you whether progression FEELS right. Get three
people to play for an hour. Watch for: "I don't know what to buy", "nothing is
happening", "I'm just waiting". Record what you observed, not what you hoped.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus every item in ECONOMY_DESIGN section 15,
plus docs/BALANCE_REPORT.md committed. Then STOP.
```

### Risks

| Risk                                        | Olasılık   | Etki   | Azaltma                                                                            |
| ------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------- |
| Simülatörün gerçek oynanışı temsil etmemesi | Orta       | Yüksek | Politikalar gerçek kayıtlı command log'larıyla kalibre edilir; insan testi zorunlu |
| Zarfın gerçekte yanlış olması               | Orta       | Orta   | Değişiklik talebi mekanizması var; sessizce genişletme yasak                       |
| Denge ayarının uzun sürmesi                 | **Yüksek** | Orta   | Simülatör iterasyonu saniyeler alıyor — bu tam olarak simülatörün varlık sebebi    |

### Rollback

Balance kapısı bilgilendirici moda alınabilir (blocking değil) — ama bu bir onay gerektirir.

### Success Metrics

10 assertion yeşil; 3/3 oyuncu "adil ilerliyor" diyor; BALANCE_REPORT yayımlandı.

### Definition of Done

WORKING_DISCIPLINE §4 + ECONOMY_DESIGN §15 kontrol listesi.

---

## PHASE 13 — UPGRADE SYSTEM v2 (TAM AĞAÇ)

### Objective

Beş yükseltme ailesinin tamamını (~30 yükseltme) uygulamak, her birine görsel geri bildirim vermek, ve dünya-içi yükseltme UI'ını olgunlaştırmak.

### Player Value

Gerçek stratejik derinlik: her aşamada en az iki geçerli yatırım yolu.

### Business Value

Uzun vadeli oynanış içeriği. Faz 12'nin "6 saat sonra hâlâ alınmamış yükseltme var" assertion'ını karşılar.

### Dependencies

Faz 12 (denge zemini), Faz 11 (tüm aşamalar).

### Systems

Tam `UpgradeSystem` · yükseltme ağacı config'i · ön koşullar · görsel varyant sistemi.

### Game Design

[GAME_DESIGN_DOCUMENT §13.2](GAME_DESIGN_DOCUMENT.md#132-yükseltme-aileleri)'deki beş aile: Görünürlük & Çekicilik, Mutfak, Kapasite & Alan, Drive-thru, Personel. Her yükseltme dört zorunlu özelliği taşır. Minimum anlamlılık eşiği zorlanır.

### Technical Architecture

Yükseltme tanımı tamamen veri: `{ id, family, level, stage, cost, prereqs, effects[], visual }`. `effects[]` sim parametrelerine tipli referanslar. Kodda `switch` yok.

### UI/UX

Yükseltme kartı olgunlaşır: mevcut/sonraki seviye karşılaştırması, ön koşul göstergesi, karşılanamayan maliyet için "ne kadar eksik". İnşa menüsü tam liste (keşif için) ama karar hâlâ dünyada.

### Assets

Her yükseltmenin görsel varyantı. Aşama 3–4 için placeholder (Faz 16).

### Animation

Yükseltme burst'ü aile bazında farklılaşır.

### Audio

Aile bazında farklı yükseltme sesi.

### Data

`src/config/economy/upgrades.ts` tam ağaç.

### Testing

- Her yükseltmenin dört özelliği var (otomatik kontrol: cost > 0, en az bir effect, visual tanımlı, açıklama var).
- Minimum anlamlılık eşiği testi.
- Ön koşul zinciri döngüsüz.
- Azalan getiri tüm ailelerde.
- Balance simülatörü tam ağaçla yeşil.
- E2E: her ailenin bir yükseltmesi.

### Performance

Yükseltme uygulaması O(1); parametre yeniden hesabı yalnızca değişimde.

### Security

Ön koşul ve maliyet doğrulaması sim'de.

### Deployment

Preview'da tam ağaç.

### Tasks

1. Tam ağaç config'i (~30 yükseltme).
2. Ön koşul sistemi + döngü kontrolü.
3. Görsel varyant eşlemeleri.
4. Yükseltme kartı v2.
5. İnşa menüsü (tam liste).
6. Aile bazında VFX/SFX.
7. Otomatik "dört özellik" kontrolü (CI).
8. Balance yeniden koşusu.

### Files / Modules Expected

```
src/config/economy/upgrades.ts (tam) · src/sim/systems/UpgradeSystem.ts (v2)
src/ui/components/UpgradeCard.svelte (v2) · src/ui/screens/BuildMenu.svelte
src/render/fx/upgradeBursts/*.ts
tests/unit/sim/upgrades/{tree,prereq,fourProperties,significance}.test.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 13. Read docs/GAME_DESIGN_DOCUMENT.md section 13 and docs/ECONOMY_DESIGN.md
section 6.

SCOPE
The full upgrade tree, roughly 30 upgrades across five families.

THE FOUR-PROPERTY RULE IS ENFORCED BY A TEST
Every upgrade must have: a cost, a measurable simulation effect, a visible world
change, and a gameplay consequence. Write a CI check that fails the build if any
upgrade definition is missing an effect, a visual, or a description. This is what
prevents the tree filling up with "+3% efficiency" filler.

MINIMUM SIGNIFICANCE — also tested
speed upgrades >= 12% time reduction; capacity >= 1 unit; conversion >= 2 points.
Anything smaller is noise the player cannot perceive and does not ship.

DATA, NOT CODE
An upgrade is { id, family, level, stage, cost, prereqs, effects[], visual }.
effects[] are typed references to simulation parameters. There must be no switch
statement over upgrade ids anywhere in src/sim.

TWO VALID PATHS PER STAGE
For each stage, verify with the balance simulator that at least two distinct
investment strategies reach the next stage within the designed window. If only one
does, the tree is a corridor, not a decision — fix it.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4 plus a green balance run with the full tree. Then STOP.
```

### Risks

| Risk                                      | Olasılık   | Etki   | Azaltma                                             |
| ----------------------------------------- | ---------- | ------ | --------------------------------------------------- |
| Dolgu yükseltmelerin sızması              | **Yüksek** | Orta   | Dört özellik CI kontrolü + anlamlılık eşiği         |
| Ağacın koridora dönüşmesi (tek doğru yol) | Orta       | Yüksek | Balance simülatörü politika farkı ≤2.5× assertion'ı |
| Görsel varyant iş yükü                    | Orta       | Orta   | Aşama 3–4 placeholder; Faz 16'da                    |

### Rollback

Yükseltmeler feature flag ile kısıtlanabilir.

### Success Metrics

~30 yükseltme, hepsi dört özellikli; her aşamada ≥2 geçerli strateji; balance yeşil.

### Definition of Done

WORKING_DISCIPLINE §4 + dört özellik kontrolü + balance yeşil.

---

## PHASE 14 — OFFLINE PROGRESSION

### Objective

Offline ilerleme sistemini, "Uzaktayken" raporunu ve saat suistimali korumalarını kurmak. PWA/service worker devreye alınır.

### Player Value

Geri dönmek ödüllendirici ve **bilgilendirici**: ne kazandın ve **seni ne sınırladı**.

### Business Value

Retention'ın ikinci en büyük kaldıracı. Ama yanlış yapılırsa ekonomiyi öldürür — bu yüzden Faz 12'den (denge) sonra geliyor.

### Dependencies

Faz 12 (denge — offline ölçülen throughput'a dayanıyor).

### Systems

`OfflineSystem` · sunucu zaman senkronizasyonu · sınırlayıcı analizi · service worker.

### Game Design

[ECONOMY_DESIGN §10](ECONOMY_DESIGN.md#10-offline-ekonomisi): 8 saat tavan, %40 verim, giderler işler, net negatif olabilir, fiziksel kapasite tavanı uygulanır, rapor sınırlayıcıyı gösterir.

### Technical Architecture

- `lastSeen` + `lastSeenServerAt` save'de.
- `/api/time` `Date` header'ı; sapma >5 dk → sunucu kazanır; erişilemezse kazanç `CAP/2` ile sınırlı; saat geriye giderse 0 kazanç (ceza yok).
- `visibilitychange` + `pagehide` ile `lastSeen` yazımı.
- Service worker (vite-plugin-pwa): asset cache, offline boot.

### UI/UX

"Uzaktayken" raporu ([GAME_DESIGN_DOCUMENT §14.5](GAME_DESIGN_DOCUMENT.md#145-uzaktayken-raporu)) — kazanç + gider + net + **sınırlayıcı analizi**. Tek buton: Topla. İkincil: Detay.

### Assets

Rapor ekranı görselleri.

### Animation

Sayı sayma animasyonu (reduced-motion'da anlık).

### Audio

Rapor açılış sesi.

### Data

Save v4 (`lastSeenServerAt`, offline istatistikleri).

### Testing

- Offline hesabı: tavan, verim, gider, fiziksel tavan.
- Saat ileri alma → sunucu zamanı kazanıyor.
- Saat geri alma → 0 kazanç, exception yok.
- Sunucu erişilemez → CAP/2.
- Aynı pencere iki kez claim edilemiyor.
- Görünmeyen sekme offline sayılıyor.
- Sınırlayıcı doğru hesaplanıyor.
- E2E: manipüle edilmiş save'lerle 4 senaryo.
- Service worker: ikinci ziyaret ~0 bant genişliği.

### Performance

Offline hesabı < 5 ms. Service worker ile sıcak boot ≤ 2 s.

### Security

Tüm §17.3 senaryoları ([GAME_DESIGN_DOCUMENT](GAME_DESIGN_DOCUMENT.md#173-suistimal-karşıtı-kurallar)).

### Deployment

PWA manifest, service worker, asset versiyonlama.

### Tasks

1. `OfflineSystem` + hesaplama.
2. Sunucu zaman senkronizasyonu + fallback'ler.
3. Sınırlayıcı analizi (`argmax(utilization)`).
4. "Uzaktayken" rapor ekranı.
5. `visibilitychange`/`pagehide` kancaları.
6. Service worker + PWA manifest.
7. Save v4 + migration.
8. Suistimal senaryo testleri.

### Files / Modules Expected

```
src/sim/systems/OfflineSystem.ts · src/platform/timeSync.ts
src/ui/screens/OfflineReport.svelte
src/persistence/migrations/v3_to_v4.ts · tests/fixtures/saves/save-v4.json
public/manifest.webmanifest · vite.config.ts (PWA)
tests/unit/sim/offline/*.test.ts · tests/e2e/offlineScenarios.spec.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 14. Read docs/GAME_DESIGN_DOCUMENT.md section 17 and docs/ECONOMY_DESIGN.md
section 10.

SCOPE
Offline progression, the return report, clock-abuse defences, and PWA/service worker.

THE MODEL — do not "improve" these constants without approval
  offlineMs   = clamp(now - lastSeen, 0, 8 hours)
  effective   = min(measuredThroughput * 0.40, physicalCapacityCeiling)
  net         = effective * minutes * avgTicket - (wages + maintenance) * minutes
  cash        = max(0, cash + net)
Costs accrue offline. Net can be negative. Cash never goes below zero.
Do NOT simulate offline time — use the throughput measured over the last five
minutes of active play. Simulating hours of gameplay on load is slow, and worse,
it lets the player "discover" outcomes they never played.

CLOCK DEFENCES (all four, all tested)
  clock forward   -> server time via /api/time Date header wins if drift > 5 min
  server down     -> local monotonic only, reward capped at CAP/2
  clock backward  -> zero reward, no penalty, silent log. Never punish the player
                     for a timezone change or a corrected system clock.
  double claim    -> lastSeen written at claim time; a window can never pay twice

THE REPORT IS THE POINT
It must show what LIMITED the player, computed as argmax of utilisation across
parking, kitchen, tables, staff, and queue:
  "Parking was full for 6 hours - 180 customers turned around."
This converts a reward screen into an investment-decision screen and is one of the
five UX differentiators. Do not ship it as a plain earnings list.

SERVICE WORKER
vite-plugin-pwa, content-hashed asset caching. Second visit should use near-zero
bandwidth — this is a cost requirement, not only a performance one
(Vercel Hobby is 100 GB/month). Verify with a network-panel measurement and
record it.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4 plus all four clock scenarios green in E2E. Then STOP.
```

### Risks

| Risk                                               | Olasılık | Etki       | Azaltma                                                                               |
| -------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------- |
| Offline'ın aktif oyunu değersizleştirmesi          | Orta     | **Yüksek** | %40 verim + 8 saat tavan; balance simülatöründe `idle-player` politikası bunu ölçüyor |
| Saat manipülasyonu                                 | Orta     | Orta       | Dört savunma, dördü de test edilmiş                                                   |
| Service worker'ın eski asset servis etmesi         | Orta     | Yüksek     | İçerik hash'i + `skipWaiting` stratejisi + sürüm kontrolü                             |
| Saat geri alma cezasının masum kullanıcıyı vurması | Orta     | Orta       | Ceza yok, sadece 0 kazanç                                                             |

### Rollback

Offline sistemi feature flag ile kapatılabilir (kazanç 0, oyun çalışır).

### Success Metrics

Dört saat senaryosu yeşil; rapor sınırlayıcıyı doğru gösteriyor; ikinci ziyaret ~0 bant genişliği.

### Definition of Done

WORKING_DISCIPLINE §4 + 4 senaryo + bant genişliği ölçümü.

---

## PHASE 15 — ADVANCED TRAFFIC / EVENTS / WEATHER / TIME-OF-DAY

### Objective

Trafiği zenginleştirmek: kalan 6 arketip, şerit değiştirme, sola dönüş, tıkanma, olaylar, hava durumu ve gün döngüsünün oynanış etkileri.

### Player Value

Aynı gün asla iki kez aynı olmaz. Festival, yol çalışması, kar, gece kamyoncu akını — her biri farklı bir strateji ister.

### Business Value

Retention: tekrar hissini kıran ana mekanik. Ayrıca gece aydınlatması en güçlü görsel anlardan biri.

### Dependencies

Faz 12 (denge — olaylar dengeyi bozmamalı), Faz 5 (trafik temeli).

### Systems

`EventSystem` · `WeatherSystem` · genişletilmiş trafik (şerit değiştirme, dönüş, tıkanma) · gün döngüsü aydınlatması.

### Game Design

- Kalan arketipler: `SPORTS_CAR`, `TRUCK_LONGHAUL`, `BUS_TOUR`, `EV_MODERN`, `VIP_LIMO`, `EMERGENCY`.
- Olaylar: yol çalışması, kaza, festival, gece akını, hava, yakıt zammı.
- Hava: yağmur/kar → trafik ↓, oturarak talebi ↑, temizlik ihtiyacı ↑.
- Gece: dönüşüm aydınlatmaya çok daha bağımlı → tabela yükseltmelerinin değeri artar.
- **Açık soru S6 karara bağlanır:** gece ayrı bir mekanik mi, yalnızca görsel mi?

### Technical Architecture

Olaylar deterministik takvim + `rng.events`. Her olayın süresi, etkisi ve görsel/işitsel imzası config'te. Şerit değiştirme IDM'e ek bir karar katmanı (boşluk kontrolü).

### UI/UX

Olay bildirimi (ince şerit, modal değil), hava göstergesi, gün saati göstergesi.

### Assets

Hava efektleri (yağmur, kar), gece aydınlatma, olay nesneleri (koni, bariyer, festival süsü), yeni araçlar.

### Animation

Yağmur/kar partikülleri, ıslak zemin yansıması (basit shader), far ışıkları (Phaser cone lights), tabela neon flicker.

### Audio

Yağmur, rüzgâr, gece ambiyansı, olay sesleri, siren.

### Data

`src/config/events.ts`, `weather.ts`, genişletilmiş `archetypes.ts`.

### Testing

- Olay determinizmi: aynı seed → aynı takvim.
- Hava çarpanlarının dönüşüme etkisi.
- Şerit değiştirme: çarpışma yok, kilitlenme yok.
- Sola dönüş: karşı şeridi kesme, tıkanma oluşuyor ama çözülüyor.
- Balance: olaylarla birlikte zarf korunuyor.
- Visual golden: gece, yağmur, festival.

### Performance

Hava partikülleri bütçe içinde (Low kademede kapalı). Gece aydınlatma draw call artışı ≤ 8.

### Security

Yok.

### Deployment

Preview'da tam gün döngüsü gezilebilir (debug zaman atlama).

### Tasks

1. 6 yeni arketip + davranışları.
2. Şerit değiştirme ve sola dönüş.
3. `EventSystem` + 6 olay.
4. `WeatherSystem` + 4 hava durumu.
5. Gün döngüsü aydınlatma (tint + cone lights + far).
6. Olay/hava bildirimleri.
7. **S6 kararı.**
8. Balance yeniden koşusu.
9. Testler + golden'lar.

### Files / Modules Expected

```
src/sim/systems/{EventSystem,WeatherSystem}.ts
src/sim/systems/VehicleMotionSystem.ts (şerit değiştirme)
src/config/{events,weather,archetypes}.ts
src/render/lighting/{DayNightCycle,ConeLights,HeadLights}.ts
src/render/fx/{Rain,Snow,WetGround}.ts
tests/unit/sim/{events,weather,laneChange}.test.ts
tests/visual/{night,rain,festival}.spec.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 15. Read docs/GAME_DESIGN_DOCUMENT.md sections 9.4 and 9.6.

SCOPE
Traffic richness, events, weather, and the day/night lighting pass.

DETERMINISM STILL APPLIES
Events come from a deterministic calendar plus rng.events. Same seed, same day,
same events. Do not reach for Math.random — CI will reject it, and Day Replay
depends on this.

SIX NEW ARCHETYPES with genuinely different behaviour, not just different sprites:
  SPORTS_CAR (low conversion, high tip, high expectations)
  TRUCK_LONGHAUL (needs large parking, high night conversion)
  BUS_TOUR (rare, huge group, feels like an event)
  EV_MODERN (conversion spikes if a charger exists — a stage 4 upgrade hook)
  VIP_LIMO (appears only above a reputation threshold, large reward)
  EMERGENCY (never converts; cuts through traffic and creates a moment)

LANE CHANGING AND LEFT TURNS
Add a gap-acceptance decision layer on top of IDM. Left turns cross the opposing
lane and are a genuine congestion source — that is the point, not a bug. Test that
congestion forms AND clears; a permanent jam is a deadlock.

DAY/NIGHT IS A FULL LIGHTING PASS, NOT A COLOUR FILTER
Headlights (Phaser 4.2 cone lights), lit signage, light spilling from windows,
lengthening shadows, ambient tint. At night, conversion depends far more on
lighting upgrades — this makes the sign/neon family suddenly valuable and gives
the day a rhythm.

OPEN DESIGN QUESTION S6
Is night a distinct mechanic or purely visual? A distinct mechanic is a large
scope increase. Decide with evidence, record it in GAME_DESIGN_DOCUMENT section 25,
and if you propose "distinct mechanic", raise it as a roadmap change request
rather than absorbing it silently.

BALANCE
Re-run the balance simulator with events and weather active. The envelope must
still hold. If events push income outside it, tune the events, not the envelope.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4 plus a green balance run. Then STOP.
```

### Risks

| Risk                                       | Olasılık | Etki   | Azaltma                                        |
| ------------------------------------------ | -------- | ------ | ---------------------------------------------- |
| Olayların dengeyi bozması                  | Orta     | Yüksek | Balance yeniden koşusu zorunlu                 |
| Sola dönüşün kalıcı tıkanma yaratması      | Orta     | Orta   | Tıkanma oluşup çözülmeli — test                |
| Gece mekaniğinin kapsamı patlatması        | Orta     | Yüksek | S6 kararı bir değişiklik talebi gerektirebilir |
| Hava partiküllerinin mobilde FPS düşürmesi | Orta     | Orta   | Kademe sisteminde Low'da kapalı                |

### Rollback

Olaylar ve hava feature flag ile kapatılabilir.

### Success Metrics

Aynı gün iki kez aynı hissettirmiyor; gece görsel olarak çarpıcı; balance korunuyor.

### Definition of Done

WORKING_DISCIPLINE §4 + balance yeşil + S6 kararı.

---

## PHASE 16 — ASSET PIPELINE v2 (AŞAMA 3–4 TAM ÜRETİM)

### Objective

Aşama 3 ve 4'ün tüm sanatını üretmek, placeholder'ları sıfırlamak, ve tutarlılığı tüm asset havuzunda doğrulamak.

### Player Value

Oyunun tamamı — sadece ilk yarısı değil — görsel olarak bitmiş görünür.

### Business Value

Placeholder'la launch edilemez. Ayrıca Aşama 3–4 oyunun en uzun oynanan kısmı; görsel kalite burada en çok değer üretir.

### Dependencies

Faz 4 (pipeline + altın referanslar), Faz 11 (hangi yapıların gerektiğinin kesinleşmesi).

### Systems

Faz 4'ün pipeline'ı; yeni sistem yok.

### Game Design

Yok.

### Technical Architecture

Yok — mevcut pipeline kullanılır. Atlas bölünmesi aşama başına gözden geçirilir (bellek bütçesi).

### UI/UX

Aşama 3–4 UI ekranları gerçek ikonlarla.

### Assets

- Aşama 3: bina dış cephe, iç mekân, masa/sandalye çeşitleri, mutfak arkası, tuvalet, tezgâh, asfalt park, peyzaj (~90 sprite)
- Aşama 4: genişletilmiş bina, drive-thru şeridi/direği/penceresi, endüstriyel mutfak, 2 kasa, geniş park, teras (~110 sprite)
- Kalan karakter varyantları (üniformalar, müşteri çeşitliliği) (~40)
- Aşama 3–4 zemin bake'leri (~6 dilim)
- Kalan yemek ikonları (~8)
- Yükseltme görsel varyantları (~40)

### Animation

Rig parçaları tüm yeni karakterler için tutarlı.

### Audio

Faz 17'de.

### Data

MANIFEST ve LICENSES güncellenir.

### Testing

- `assets:validate` tüm havuzda.
- Dört tutarlılık kapısı **tüm havuzda** (yalnızca yeni asset'lerde değil — Aşama 1 ile Aşama 4 yan yana tutarlı mı?).
- Bütçeler: toplam ≤ 28 MB.
- Atlas doluluk ≥ %70.
- Texture memory ≤ 192 MB desktop / 96 MB mobil.
- Tüm visual golden'lar güncellenir.
- `PLACEHOLDER_REGISTER.md` **boş**.

### Performance

Aşama bazlı lazy loading; aşama geçişinde takılma yok (arka planda önyükleme).

### Security

Lisans doğrulaması tüm havuzda.

### Deployment

Bant genişliği ölçümü: tam oyun kaç MB, service worker ile ikinci ziyaret kaç MB.

### Tasks

1. Aşama 3 asset üretimi (batch).
2. Aşama 4 asset üretimi (batch).
3. Karakter varyantları.
4. Zemin bake'leri.
5. Yükseltme görsel varyantları.
6. Atlas yeniden düzenleme (bellek bütçesi).
7. Lazy loading + önyükleme.
8. Dört tutarlılık kapısı (tüm havuz).
9. Placeholder register'ı sıfırla.
10. Golden'ları güncelle.

### Files / Modules Expected

```
assets/source/** (yeni) · assets/MANIFEST.md · assets/LICENSES.md
public/atlas/** (yeniden düzenlenmiş) · src/config/assets.ts
tests/visual/** (güncellenmiş)
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 16. Read docs/ASSET_PIPELINE.md in full. Re-read the golden references from
Phase 4 before generating anything.

SCOPE
All remaining art: stages 3 and 4, character variants, ground bakes, upgrade
visual variants. Roughly 290 sprites.

THE HARD PART IS NOT VOLUME, IT IS DRIFT
These assets are being produced months after the stage 1-2 set. The risk is that
stage 4 quietly looks like a different game from stage 1. Defend against it:
- Regenerate from the SAME golden references, not from stage 2 output.
- Run the four consistency gates across the ENTIRE pool, not just new assets.
  Specifically: put a stage 1 object and a stage 4 object side by side and judge.
- If drift is detected, regenerate the drifting category. Do not "fix it in
  post" with a tint.

ATLAS REORGANISATION
The pool roughly triples. Re-plan atlas splits against the texture memory budget
(192 MB desktop / 96 MB mobile). Stage-specific atlases load lazily; preload the
next stage in the background so evolution never stalls.

PLACEHOLDER REGISTER MUST REACH ZERO
docs/PLACEHOLDER_REGISTER.md is empty at the end of this phase. From here on, a
production build with any placeholder is a hard error, per WORKING_DISCIPLINE
section 7.

BUDGETS
Total <= 28 MB. Atlas fill >= 70%. Measure and record actual bandwidth for a cold
first visit and a warm second visit — this is a Vercel cost constraint, not just
a performance one.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, four consistency gates across the whole pool,
placeholder register empty, all budgets green. Then STOP.
```

### Risks

| Risk                                                  | Olasılık   | Etki           | Azaltma                                                                  |
| ----------------------------------------------------- | ---------- | -------------- | ------------------------------------------------------------------------ |
| **Stil sürüklenmesi** (Aşama 4, Aşama 1'e benzemiyor) | **Yüksek** | **Yüksek**     | Altın referanslardan yeniden üretim + tüm havuzda yan yana kapı          |
| Asset iş yükü (~290 sprite)                           | **Yüksek** | Orta           | Batch üretim + otomatik doğrulama; gerekirse faz bölünmesi teklif edilir |
| Bellek bütçesi aşımı                                  | Orta       | Yüksek         | Atlas yeniden düzenleme + lazy loading                                   |
| Lisans sorunu                                         | Düşük      | **Çok yüksek** | Üretim öncesi doğrulama                                                  |

### Rollback

Aşama 3–4 placeholder'a döndürülebilir (oyun oynanır, çirkin).

### Success Metrics

Placeholder sıfır; dört kapı tüm havuzda geçti; bütçeler içinde; Aşama 1 ve 4 yan yana tutarlı.

### Definition of Done

WORKING_DISCIPLINE §4 + placeholder sıfır + tutarlılık raporu.

---

## PHASE 17 — ANIMATION / VFX / AUDIO

### Objective

Doll rig runtime'ını tamamlamak, tüm animasyon kliplerini üretmek, VFX kütüphanesini kurmak, ve tüm ses tasarımını uygulamak.

### Player Value

Dünya **canlanır**. Karakterler niyetli hareket eder, mutfak cızırdar, arabalar gürler, ödüller duyulur.

### Business Value

"Polished commercial game" hissinin en büyük tek katkısı. Aynı oyun, ses ve animasyonla kat kat daha pahalı görünür.

### Dependencies

Faz 16 (tüm asset'ler), Faz 7 (rig temeli).

### Systems

`DollRigRuntime` (tam) · klip kütüphanesi · `ParticleLibrary` · `AudioDirector` · `rig-editor` aracı.

### Game Design

Animasyon iletişim içindir: durum değişimi, geri bildirim, dikkat yönlendirme. Süsleme animasyonu eklenmez.

### Technical Architecture

- Rig runtime: parça hiyerarşisi, keyframe interpolasyonu, klip harmanlama (blend), prosedürel katman.
- Partikül: Phaser emitter + `SpriteGPULayer` non-looping mod (tek seferlik patlamalar).
- `AudioDirector`: kategori ducking, mesafe bazlı ses/pan, aynı SFX 400 ms throttle, ±%6 pitch varyasyonu, kategori bazlı ses seviyeleri.

### UI/UX

Ayarlar: master/müzik/SFX/ambiyans slider'ları; reduced-motion; animasyon kalitesi.

### Assets

Tüm ses dosyaları (OGG + M4A), partikül texture'ları, klip JSON'ları.

### Animation

8 keyframe klibi + 3 prosedürel klip ([ASSET_PIPELINE §6.2](ASSET_PIPELINE.md#62-klipler)). VFX: buhar, duman, ateş, toz, sikke, parıltı, inşaat, hava.

### Audio

Yedi katman ([GAME_DESIGN_DOCUMENT §16](GAME_DESIGN_DOCUMENT.md#16-ses-stratejisi)). Toplam ≤ 5 MB.

### Data

`src/render/rig/clips/*.json`, `src/config/audio.ts`.

### Testing

- Rig unit testleri: klip + t → beklenen transform; hiyerarşi zincirleme; ayna yönü.
- Klip harmanlama süreksizlik üretmiyor.
- Ses throttle: aynı SFX 400 ms içinde tekrar çalmıyor.
- Partikül bütçesi: 400 aktif partikül aşılmıyor.
- Reduced-motion: animasyon azalıyor, **sim hızı değişmiyor** (test).
- Ses tamamen kapalıyken oyun tam oynanabilir (E2E).
- Visual golden'lar `noParticles=1` ile korunuyor.

### Performance

Rig güncellemesi 60 karakter için ≤ 1.2 ms. Partikül 400 adet ≤ 1.5 ms. Ses: eşzamanlı ≤ 24 kaynak.

### Security

Yok.

### Deployment

Ses dosyaları lazy; ilk oynanabilir kareyi geciktirmiyor.

### Tasks

1. `DollRigRuntime` tam (hiyerarşi, blend, prosedürel katman).
2. `tools/rig-editor/`.
3. 8 keyframe klibi.
4. `ParticleLibrary` (12 efekt).
5. `AudioDirector` (ducking, throttle, mesafe, pitch).
6. Tüm ses üretimi + normalizasyon + çift format.
7. Ses ayarları UI'ı.
8. Reduced-motion entegrasyonu.
9. Testler.

### Files / Modules Expected

```
src/render/rig/{DollRigRuntime,ClipPlayer,blend,proceduralLayer}.ts
src/render/rig/clips/*.json · tools/rig-editor/**
src/render/fx/ParticleLibrary.ts · src/render/audio/AudioDirector.ts
src/config/audio.ts · public/audio/**
src/ui/screens/AudioSettings.svelte
tests/unit/render/rig/*.test.ts · tests/unit/render/audio/throttle.test.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 17. Read docs/GAME_DESIGN_DOCUMENT.md sections 15-16, docs/ASSET_PIPELINE.md
section 6 and 11, docs/RESEARCH_NOTES.md sections 6 and 13.

SCOPE
Complete the Doll rig runtime, author all clips, build the VFX library, and
implement all audio.

WHY WE BUILT OUR OWN RIG (do not swap in Spine mid-project)
Spine requires every user of your software to hold a Spine licence. DragonBones is
abandoned. And AI cannot produce frame-consistent animation. Our part-based rig
solves all three: zero licence cost, tiny assets, unit-testable, and one walk clip
drives 1920 visually distinct customers via part swapping.

RIG RUNTIME
Part hierarchy with parent transform chaining, keyframe interpolation, clip
blending, and a procedural layer composited on top (breathing, walk cycle,
squash-stretch). Pure maths — it lives in src/render but has no Phaser dependency
in the maths core, so it is unit tested directly: given clip and t, assert the
exact transform.

CLIPS: 8 authored (take_order, cook, serve, clean, eat, pay, wait_impatient,
happy/angry) + 3 procedural (idle, walk, walk_carry). That is the entire
animation budget for every character in the game.

AUDIO DIRECTOR — the difference between "has sound" and "sounds good"
  category ducking (progression sounds duck ambience and music)
  distance-based volume and pan
  same SFX cannot retrigger within 400 ms
  +/-6% pitch variation so repetition is not fatiguing
  max 24 concurrent sources
Use Phaser's built-in WebAudio manager. Do not add Howler — Phaser already solves
mobile audio unlock and a second audio graph is pure cost.

TWO NON-NEGOTIABLES
1. prefers-reduced-motion reduces animation and particles but MUST NOT change
   simulation speed. Write the test.
2. The game must be fully playable with all audio at zero. No information may exist
   only in sound.

VISUAL GOLDENS
They were captured with noParticles=1, so they should not move. If any golden
changes in this phase, that indicates particles are leaking into the frozen render
path — investigate rather than accepting the diff.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4 plus a real-device pass confirming audio mix is not
fatiguing over a 20-minute session. Then STOP.
```

### Risks

| Risk                                | Olasılık   | Etki   | Azaltma                                               |
| ----------------------------------- | ---------- | ------ | ----------------------------------------------------- |
| Rig runtime karmaşıklığı            | Orta       | Orta   | Saf matematik + unit test; kapsam 11 klip ile sınırlı |
| Ses yorgunluğu                      | **Yüksek** | Orta   | Throttle + pitch varyasyonu + 20 dk gerçek test       |
| Partiküllerin mobilde FPS düşürmesi | Orta       | Yüksek | Kademe sistemi + bütçe testi                          |
| iOS ses unlock sorunları            | Orta       | Orta   | Gerçek cihaz testi zorunlu                            |
| Golden'ların kayması                | Orta       | Düşük  | `noParticles=1` — kayarsa sızıntı var, araştırılır    |

### Rollback

VFX ve ses feature flag ile kapatılabilir.

### Success Metrics

Dünya canlı; 20 dk'da ses yorucu değil; rig testleri yeşil; perf bütçeleri içinde.

### Definition of Done

WORKING_DISCIPLINE §4 + gerçek cihaz ses testi + rig testleri.

---

## PHASE 18 — PREMIUM UI/UX + ACCESSIBILITY + RESPONSIVE

### Objective

UI'ı prototipten ürüne taşımak: tam ekran seti, Dönüşüm Analizi paneli, tasarım sistemi, erişilebilirlik, responsive matrisi, onboarding.

### Player Value

Oyun profesyonel hissettirir. Her cihazda çalışır. Herkes oynayabilir.

### Business Value

UI kalitesi, "ciddi ürün" algısının en görünür göstergesi. Erişilebilirlik hem doğru olan hem de pazarı genişleten şey.

### Dependencies

Faz 17 (tüm görsel/işitsel), Faz 13 (tam yükseltme ağacı).

### Systems

Tasarım sistemi (tokens) · tüm ekranlar · bildirim sistemi · onboarding · a11y katmanı · responsive layout.

### Game Design

Onboarding: **tutorial metni değil, tasarım yoluyla öğretme** ([GAME_DESIGN_DOCUMENT §7 Aşama 1](GAME_DESIGN_DOCUMENT.md#aşama-1--roadside-stand-yol-kenarı-tezgâhı)). İlk araç 8 saniyede gelir; sistemler sırayla ve kendiliğinden keşfedilir.

### Technical Architecture

`src/ui/theme/tokens.css` (renk, tipografi, aralık, motion, katman). Container queries ile responsive. `aria-live` bölgeleri. Focus yönetimi. UI 10 Hz throttle korunur.

### UI/UX

**Tüm ekranlar:** HUD · Build/Upgrade · Staff · Menu&Price · **Analytics (Dönüşüm Analizi)** · Evolution · Offline · Settings · Pause · Onboarding · Diagnostics.
Bildirim sistemi: sağ kenar, kendiliğinden kaybolan, yığılabilir, modal asla.

### Assets

UI ikonları (tamamlandı Faz 16), tipografi (WOFF2 subset), dyslexia-friendly alternatif font.

### Animation

CSS geçişleri; reduced-motion ile kapanır.

### Audio

UI sesleri (Faz 17'den) bağlanır.

### Data

`settings` save bölümü genişler (a11y tercihleri).

### Testing

- **axe-core** tüm ana ekranlarda: kritik/ciddi ihlal yok.
- Klavye navigasyonu: tüm UI, focus görünür, tuzak yok.
- Kontrast: metin ≥4.5:1, bileşen ≥3:1.
- 7 viewport'ta responsive matrisi ([TESTING_STRATEGY §7.5](TESTING_STRATEGY.md#75-responsive)).
- Dokunma hedefleri ≥44×44 px.
- `aria-live` duyuruları.
- HUD dünyanın ≤%22/%28'ini kaplıyor (ölçülür).
- Tüm visual golden'lar (HUD ve paneller).
- Onboarding: 3 yeni oyuncu, 60 saniyede ne yapacağını anlıyor mu.

### Performance

UI 10 Hz; per-frame DOM güncellemesi yok. UI bundle ≤ 60 KB gzip.

### Security

`{@html}` yasağı korunur; kullanıcı girdisi yok (isim alanı eklenirse escape edilir).

### Deployment

Preview'da tam UI.

### Tasks

1. Tasarım sistemi (tokens, tipografi ölçeği, spacing, motion).
2. Tüm ekranlar (11 adet).
3. **Dönüşüm Analizi paneli** (imza özellik).
4. Bildirim sistemi.
5. Onboarding akışı.
6. A11y katmanı (focus, live region, klavye, kontrast).
7. Responsive matrisi (7 viewport).
8. Ayarlar (ses, a11y, kalite, dil).
9. Teşhis bilgisi kopyalama.
10. Tüm UI golden'ları.
11. 3 yeni oyuncu ile onboarding testi.

### Files / Modules Expected

```
src/ui/theme/{tokens.css,typography.css,motion.css}
src/ui/screens/{Hud,Build,Staff,MenuPrice,Analytics,Evolution,Offline,Settings,Pause,Onboarding,Diagnostics}.svelte
src/ui/components/** · src/ui/a11y/{focusTrap,liveRegion,reducedMotion}.ts
tests/e2e/{a11y,responsive,onboarding}.spec.ts · tests/visual/panel-*.spec.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 18. Read docs/GAME_DESIGN_DOCUMENT.md section 14 in full.

SCOPE
Production-quality UI, full accessibility, the responsive matrix, and onboarding.

THE GOVERNING CONSTRAINT
The game stays visually dominant. UI chrome must occupy at most 22% of the
viewport on desktop and 28% on mobile. Measure it in a test — it is a constraint,
not an aspiration. If a panel cannot fit, the panel is wrong, not the constraint.

NO MODALS. Upgrades happen on world objects (already built in Phase 9). Panels
slide in from an edge and leave the world visible. Notifications are thin
self-dismissing strips at the right edge.

THE SIGNATURE FEATURE — CONVERSION ANALYTICS PANEL
Built entirely from the CONVERSION_FAILED reason stream you started collecting in
Phase 6. Show the last 100 vehicles broken down by why they did not stop, as a
ranked bar list. Then one line: "Biggest available gain: queue capacity".
It states what happened; it does not tell the player what to do. This directly
attacks the genre's biggest frustration — invisible systems — and it is one of the
five UX differentiators. Give it real design attention.

ONBOARDING IS DESIGN, NOT TEXT
No tutorial popups. The first car arrives within 8 seconds. Then a second car
arrives before the first is served, so the player discovers queues. Then one gets
impatient and leaves, so they discover patience. Then the sign upgrade unlocks, so
they discover conversion. Validate with three people who have never seen the game:
if they need to be told anything in the first 60 seconds, the design failed —
report that rather than adding a tooltip.

ACCESSIBILITY IS NOT A CHECKLIST ITEM
  every state encoded by colour AND icon AND shape AND text
  prefers-reduced-motion reduces animation but never simulation speed
  full keyboard navigation, visible focus, no traps
  WCAG AA contrast
  aria-live for important changes, throttled so it is not a firehose
  the game is fully playable with audio off
  dyslexia-friendly font option, UI scale 0.9x-1.3x
Run axe-core on every screen in CI. Critical and serious violations fail the build.

RESPONSIVE
Seven viewports (TESTING_STRATEGY 7.5), one codebase, one layout system. There is
no separate cut-down mobile build. Touch targets >= 44x44 CSS px. Every primary
action reachable one-handed.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus the three-player onboarding test with results
reported honestly. Then STOP.
```

### Risks

| Risk                                 | Olasılık | Etki       | Azaltma                                                           |
| ------------------------------------ | -------- | ---------- | ----------------------------------------------------------------- |
| UI'ın oyunu örtmesi                  | Orta     | Yüksek     | %22/%28 ölçülen kısıt + testte zorlanıyor                         |
| Onboarding'in çalışmaması            | Orta     | **Yüksek** | 3 yeni oyuncu testi; başarısızsa tooltip değil tasarım düzeltilir |
| Mobil layout'un kırılması            | Orta     | Yüksek     | 7 viewport E2E matrisi                                            |
| A11y'nin sonradan eklenmiş görünmesi | Orta     | Orta       | Tokens ve bileşenlerde baştan; axe CI'da                          |

### Rollback

Eski UI bileşenleri feature flag ile korunur.

### Success Metrics

axe temiz; 7 viewport yeşil; onboarding 3/3; HUD %22/%28 içinde; Analiz paneli çalışıyor.

### Definition of Done

WORKING_DISCIPLINE §4 + a11y raporu + onboarding testi.

---

## PHASE 19 — SAVE / ACCOUNT / CLOUD SYNC (KOŞULLU)

### Objective

Bulut kayıt ve hesap sistemini — **yalnızca gerçek talep varsa** — eklemek.

> ⚠ **Bu faz koşulludur.** Başlangıç koşulu: gerçek kullanıcılardan gelen cihazlar-arası kayıt talebi (varsayım değil, kanıt). Koşul sağlanmazsa faz **atlanır** ve bu açıkça raporlanır. Yerel kayıt + dışa/içe aktarma çoğu oyuncu için yeterlidir; premature backend, WORKING_DISCIPLINE kural 5 ve 12'nin doğrudan ihlali olurdu.

### Objective (koşul sağlanırsa)

Hesap, bulut kayıt, senkronizasyon, çakışma çözümü.

### Player Value

Cihaz değiştirince ilerleme kaybolmaz.

### Business Value

Retention artışı — ama backend maliyeti, bakımı ve güvenlik yüzeyi getirir. Bu takas kanıtla yapılır.

### Dependencies

Faz 14 (offline), gerçek kullanıcı talebi kanıtı.

### Systems

Auth (anonim + opsiyonel e-posta/OAuth) · bulut kayıt · senkronizasyon · çakışma çözümü.

### Game Design

Hesap **zorunlu değil**. Oyun kayıtsız tam oynanır. Hesap yalnızca bulut kayıt için.

### Technical Architecture

Değerlendirilecek: Supabase (Postgres + Auth) vs Vercel Blob + basit token. Karar bir ADR gerektirir.
Çakışma: last-write-wins **değil** — `playtimeMs` ve `lifetimeRevenue` karşılaştırılıp kullanıcıya seçim sunulur.

### UI/UX

Hesap ekranı (opsiyonel), senkronizasyon durumu, çakışma çözüm diyaloğu.

### Assets / Animation / Audio

Minimal.

### Data

Sunucu tarafı save şeması = istemci şeması + metadata. Migration sunucuda da çalışmalı.

### Testing

- Senkronizasyon: yükle/indir, çakışma senaryoları.
- Ağ kesintisi: yerel kayıt bozulmuyor.
- Hesapsız oyun tam çalışıyor.
- Auth güvenlik testleri.

### Performance

Senkronizasyon arka planda; oyunu bloklamıyor.

### Security

Auth, rate limiting, save boyut sınırı, sunucu tarafı şema doğrulama, kişisel veri minimizasyonu, GDPR silme akışı.

### Deployment

Backend ilk kez devreye giriyor — Vercel Function + seçilen veritabanı. İzleme ve maliyet takibi.

### Tasks

1. **Önce: talep kanıtını doğrula.** Yoksa fazı atla ve raporla.
2. ADR: Supabase vs Blob+token.
3. Auth (anonim + opsiyonel yükseltme).
4. Bulut kayıt API'si.
5. Senkronizasyon + çakışma çözümü.
6. Hesap UI'ı.
7. GDPR silme akışı.
8. Güvenlik testleri.

### Files / Modules Expected

```
api/{save,load,auth}.ts · src/platform/cloudSave.ts
src/ui/screens/Account.svelte · docs/DECISIONS/ADR-013-cloud-backend.md
tests/e2e/cloudSync.spec.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 19 is CONDITIONAL. Read docs/WORKING_DISCIPLINE.md rules 5 and 12 first.

BEFORE WRITING ANY CODE
Verify the entry condition: is there evidence of real cross-device demand from
real users? Analytics, feedback, support requests. Not a hunch, not "users
probably want this".

If the evidence does not exist, DO NOT BUILD THIS. Write the phase report
explaining that the condition was not met, what you looked at, and recommend
skipping. Skipping a phase for a documented reason is a successful outcome here;
building an unneeded backend is a failure that costs money and attack surface
forever.

IF THE CONDITION IS MET
1. Write ADR-013 comparing Supabase (Postgres + Auth) against Vercel Blob plus a
   minimal token scheme. Weigh: cost at expected scale, operational burden,
   security surface, migration story, vendor lock-in, and how much of it we
   actually use. Recommend one; get approval before implementing.
2. Accounts are OPTIONAL. The game must remain fully playable with no account,
   forever. Anonymous-first, with optional upgrade to email/OAuth.
3. Conflict resolution is NOT last-write-wins. Compare playtimeMs and
   lifetimeRevenue and let the player choose, showing both saves' key stats.
   Silently destroying someone's progress is the worst bug this project can ship.
4. Server-side schema validation and the same migration chain as the client.
5. GDPR deletion flow, data minimisation, rate limiting, save size cap.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, or a documented skip decision. Then STOP.
```

### Risks

| Risk                            | Olasılık   | Etki           | Azaltma                                          |
| ------------------------------- | ---------- | -------------- | ------------------------------------------------ |
| **Gereksiz backend inşa etmek** | **Yüksek** | Yüksek         | Koşullu faz; atlama meşru ve tercih edilen sonuç |
| Çakışmada ilerleme kaybı        | Orta       | **Çok yüksek** | Last-write-wins yasak; kullanıcı seçimi          |
| Backend maliyeti                | Orta       | Orta           | ADR'de maliyet analizi                           |
| Güvenlik yüzeyi                 | Orta       | Yüksek         | Rate limit, şema doğrulama, veri minimizasyonu   |

### Rollback

Bulut kayıt feature flag ile kapatılır; yerel kayıt her zaman çalışır.

### Success Metrics

Faz atlandıysa: gerekçe raporlandı. Yapıldıysa: senkronizasyon güvenilir, hesapsız oyun tam çalışıyor, çakışmada veri kaybı yok.

### Definition of Done

WORKING_DISCIPLINE §4 **veya** dokümante edilmiş atlama kararı.

---

## PHASE 20 — PERFORMANCE OPTIMIZATION

### Objective

Tüm performans bütçelerini gerçek cihazlarda karşılamak; degradasyon kademelerini uygulamak ve doğrulamak.

### Player Value

Oyun her cihazda akıcı. Zayıf telefonda bile oynanabilir, güçlü makinede çarpıcı.

### Business Value

Performans, tarayıcı oyunlarında en büyük tek terk (churn) sebebi. Ayrıca asset boyutu doğrudan bant genişliği maliyeti.

### Dependencies

Faz 18 (tüm sistemler var — optimizasyon son yapılır, erken değil).

### Systems

Degradasyon kademeleri · profilleme araçları · `?bench=1` modu · opsiyonel Web Worker (sim'i ayırma).

### Game Design

Yok — ama Low kademesi oyunu **oynanabilir** tutmalı, sadece daha az güzel.

### Technical Architecture

- Kademe tespiti: GPU string, `deviceMemory`, `hardwareConcurrency`, ilk 60 karenin frame time'ı.
- Otomatik düşürme: 5 sn p05 < hedefin %70'i → bir kademe aşağı + diskret bildirim. Otomatik yükseltme yok.
- **Değerlendirilecek:** simülasyonu Web Worker'a taşımak (Comlink). Sim zaten saf ve deterministik olduğu için bu mimari olarak mümkün. **Ölçüm gösterirse yapılır, önceden değil.** Yapılırsa bir ADR gerektirir.
- Object pooling denetimi, atlas boşaltma, draw call birleştirme.

### UI/UX

Ayarlar: kalite kademesi seçimi + "otomatik". Performans göstergesi (opsiyonel, dev/oyuncu tercihi).

### Assets

Gerekirse mobil için düşük çözünürlüklü atlas varyantı (yalnızca ölçüm gerektirirse — ek bant genişliği maliyeti var).

### Animation / Audio

Kademe bazlı azaltma.

### Data

`docs/PERF_LOG.md` tam matris.

### Testing

- Tüm CI perf bench'leri yeşil.
- 4 kademede E2E.
- Otomatik düşürme testi (yapay yavaşlatma).
- Bellek: 30 dk'da artış < %5.
- Gerçek cihaz matrisi: masaüstü, orta Android, iPhone.
- Bundle ve asset bütçeleri.

### Performance

[TECHNICAL_ARCHITECTURE §11](TECHNICAL_ARCHITECTURE.md#11-performans-bütçeleri)'in **tamamı** karşılanmalı.

### Security

Yok.

### Deployment

Lighthouse skorları; CDN cache doğrulaması.

### Tasks

1. Gerçek cihazlarda tam profilleme (masaüstü + 2 mobil).
2. Darboğazları tespit et ve önceliklendir (tahminle değil, profille).
3. Sim optimizasyonu (SoA genişletme, pooling, gereksiz iş eleme).
4. Render optimizasyonu (draw call, batch, culling, atlas).
5. Degradasyon kademeleri (4 adet) + otomatik seçim + otomatik düşürme.
6. `?bench=1` modu.
7. Bellek sızıntısı avı (heap snapshot karşılaştırmaları).
8. Web Worker değerlendirmesi (ölçüm → karar → gerekirse ADR).
9. Bundle analizi ve küçültme.
10. PERF_LOG tam matris.

### Files / Modules Expected

```
src/platform/{capabilityDetect,qualityTier,autoDegrade}.ts
src/app/BenchMode.ts · src/ui/screens/QualitySettings.svelte
docs/PERF_LOG.md (tam) · docs/DECISIONS/ADR-014-web-worker.md (yapılırsa)
tests/perf/** · tests/e2e/qualityTiers.spec.ts
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 20. Read docs/TECHNICAL_ARCHITECTURE.md section 11 and
docs/WORKING_DISCIPLINE.md section 8.

SCOPE
Meet every performance budget on real devices. Implement and verify the four
quality tiers.

MEASURE FIRST, ALWAYS
Do not optimise anything you have not profiled. Start by producing a real profile
on three devices: a desktop with a real GPU, a mid-range Android phone, and an
iPhone. Record the numbers in docs/PERF_LOG.md BEFORE changing any code. Then
optimise the top bottleneck, re-measure, repeat.

CI CANNOT MEASURE FPS
GitHub Actions runs Chromium on SwiftShader — software rasterisation. Any FPS
number from CI is meaningless. CI enforces simulation tick time, allocation count,
bundle size, and asset size. Real-GPU FPS is measured manually with ?bench=1 and
recorded in PERF_LOG. Never write a CI assertion about FPS, and never claim an
FPS figure you did not measure on hardware.

FOUR QUALITY TIERS (TECHNICAL_ARCHITECTURE 11.4)
Ultra / High / Medium / Low. Low must remain PLAYABLE, not merely running: the
player on a weak phone gets a worse-looking game, never a broken one. Selected at
boot from GPU string, deviceMemory, hardwareConcurrency, and the first 60 frames.
Auto-downgrade when p05 FPS sits below 70% of target for 5 seconds, with a discreet
notification. Never auto-upgrade — that causes oscillation.

WEB WORKER — EVALUATE, DO NOT ASSUME
The simulation is pure and deterministic, so moving it to a worker is
architecturally possible and would free the main thread. But it adds a
serialisation boundary and latency. Measure whether the main thread is actually
the bottleneck first. If yes, write ADR-014 and get approval. If no, document
that you evaluated it and rejected it — that is a valid and valuable outcome.

MEMORY
Hunt leaks with heap snapshots at 0, 15, and 30 minutes. Growth must stay under
5%. Common culprits here: event listeners not released on scene teardown,
ActorViews not returned to the pool, atlases never unloaded after stage change.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus every budget in TECHNICAL_ARCHITECTURE 11 met
on real hardware and recorded. Then STOP.
```

### Risks

| Risk                               | Olasılık | Etki   | Azaltma                                                |
| ---------------------------------- | -------- | ------ | ------------------------------------------------------ |
| Mobilde bütçelerin karşılanamaması | Orta     | Yüksek | Kademe sistemi; gerekirse mobil entity cap'i düşürülür |
| Optimizasyonun kodu bozması        | Orta     | Yüksek | Determinizm süiti + tüm testler her adımda             |
| Web Worker'ın karmaşıklık eklemesi | Orta     | Orta   | Ölçüm olmadan yapılmıyor; ADR gerekli                  |
| Bellek sızıntısı bulunamaması      | Orta     | Yüksek | Sistematik snapshot karşılaştırması                    |

### Rollback

Optimizasyonlar ayrı commit'ler; regresyon durumunda geri alınabilir.

### Success Metrics

Tüm bütçeler gerçek cihazlarda karşılandı ve PERF_LOG'a yazıldı; 4 kademe çalışıyor.

### Definition of Done

WORKING_DISCIPLINE §4 + tam PERF_LOG matrisi.

---

## PHASE 21 — SECURITY / ANTI-CHEAT / TRUST

### Objective

Orantılı güvenlik stratejisini tamamlamak: CSP sertleştirme, bağımlılık hijyeni, save bütünlüğü, offline korumaları, hata raporlama, gizlilik.

### Player Value

Verisi güvende, ilerlemesi kaybolmuyor, gizliliğine saygı duyuluyor.

### Business Value

Bir save bozulması dalgası veya bir güvenlik olayı, oyuncu güvenini kalıcı olarak yakar.

### Dependencies

Faz 20.

### Systems

CSP · save bütünlüğü v2 · offline korumaları (doğrulama) · hata raporlama · gizlilik akışları.

### Game Design

Hile karşıtı **bilinçli olarak minimal** ([GAME_DESIGN_DOCUMENT §18](GAME_DESIGN_DOCUMENT.md#18-güven-ve-anti-cheat--orantılı-strateji)). Save düzenleyen oyuncu cezalandırılmaz, tespit edilmez, uyarılmaz.

### Technical Architecture

- CSP nonce/hash tabanlı, `unsafe-inline` yalnızca style için (Svelte gereksinimi) ve mümkünse kaldırılır.
- SRI (varsa harici kaynak — şu an yok).
- Save: CRC32 + yedek rotasyonu + kurtarma akışı (Faz 2'den) doğrulanır ve sertleştirilir.
- Hata raporlama: env-gated. Sentry değerlendirilir; alternatif hafif beacon. PII temizliği zorunlu.

### UI/UX

Gizlilik ayarları: analitik opt-out, hata raporlama opt-out, veri silme, teşhis bilgisi kopyalama.

### Assets / Animation / Audio

Yok.

### Data

Gizlilik politikası sayfası. Toplanan veri listesi (şeffaf).

### Testing

- CSP ihlali → E2E'de yakalanıyor.
- Güvenlik başlıkları preview ve production'da doğrulanıyor.
- `pnpm audit` high/critical yok.
- CodeQL temiz.
- Save bozulma senaryoları (checksum, kesik, ileri sürüm, tüm yedekler bozuk).
- Offline saat senaryoları (Faz 14'ten) yeniden doğrulanıyor.
- PII temizliği: hata raporunda kişisel veri yok.
- Opt-out gerçekten çalışıyor (ağ isteği yok).

### Performance

Güvenlik önlemleri ölçülebilir performans maliyeti getirmemeli.

### Security

Bu fazın tamamı.

### Deployment

Production başlıkları doğrulanır. Gizlilik politikası yayınlanır.

### Tasks

1. CSP sertleştirme + doğrulama.
2. Bağımlılık denetimi + güncelleme + Dependabot ayarı.
3. Save bütünlüğü sertleştirme + kurtarma akışı UX'i.
4. Offline korumalarının yeniden doğrulanması.
5. Hata raporlama (env-gated) + PII temizliği.
6. Gizlilik ayarları + veri silme.
7. Gizlilik politikası ve toplanan veri şeffaflığı.
8. Teşhis bilgisi kopyalama.
9. Güvenlik test süiti.

### Files / Modules Expected

```
vercel.ts (CSP) · src/platform/{errorReporting,privacy}.ts
src/ui/screens/PrivacySettings.svelte · public/privacy.html
tests/e2e/{securityHeaders,csp,saveRecovery,privacy}.spec.ts
docs/SECURITY.md
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 21. Read docs/GAME_DESIGN_DOCUMENT.md section 18 and
docs/TECHNICAL_ARCHITECTURE.md section 9.

SCOPE
Complete the proportional security strategy. Note the word proportional.

WHAT WE DO NOT DO — and why saying no here matters
No code obfuscation. No anti-debug. No save encryption. No memory integrity checks.
This is a single-player game; a player who edits their save harms only their own
experience. Those measures would be hostility toward players dressed up as
security, and they cost real engineering time. If you feel tempted to add
detection for save editing, do not — it is explicitly out of scope and adding it
would be a silent scope expansion (WORKING_DISCIPLINE rule 5).

WHAT WE DO PROTECT

1. SAVE CORRUPTION — the real and frequent risk. CRC32, schema version, three
   rotating backups, and a recovery flow the player can actually understand:
   "Your save was damaged. We restored a backup from 4 minutes ago." Test all four
   corruption scenarios including "every backup is bad".

2. OFFLINE ABUSE — re-verify the four clock defences from Phase 14 still hold
   after all the intervening changes.

3. WEB SECURITY HYGIENE — strict CSP (drop unsafe-inline for style if Svelte
   allows it by this point), the full header set, pnpm audit with high/critical
   failing the build, CodeQL, Dependabot. No third-party scripts.

4. PRIVACY — analytics is cookieless and opt-out. Error reporting is opt-out and
   strips PII before sending. Publish exactly what is collected in plain language.
   Provide a working data-deletion path. Verify opt-out by asserting zero network
   requests, not by trusting a flag.

DIAGNOSTICS FOR PLAYERS
Settings -> "Copy diagnostic info": browser, GPU, FPS, save version, last 20 log
lines. The player pastes it into a bug report. Nothing is sent automatically.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4 plus docs/SECURITY.md and a published privacy page.
Then STOP.
```

### Risks

| Risk                                    | Olasılık | Etki       | Azaltma                           |
| --------------------------------------- | -------- | ---------- | --------------------------------- |
| CSP'nin oyunu bozması                   | Orta     | Orta       | Preview'da E2E ile doğrulama      |
| Aşırı mühendislik (gereksiz anti-cheat) | Orta     | Orta       | Kapsam açıkça yasaklıyor          |
| PII sızıntısı hata raporunda            | Orta     | **Yüksek** | Temizlik testi + opt-out          |
| Save kurtarma akışının anlaşılmaması    | Orta     | Yüksek     | Açık dil + gerçek kullanıcı testi |

### Rollback

Hata raporlama env ile kapatılabilir.

### Success Metrics

CSP aktif ve oyun çalışıyor; audit/CodeQL temiz; 4 bozulma senaryosu kurtarılıyor; opt-out gerçekten sessiz.

### Definition of Done

WORKING_DISCIPLINE §4 + SECURITY.md + gizlilik sayfası.

---

## PHASE 22 — FULL QA / CROSS-BROWSER VALIDATION

### Objective

Tarayıcı uyumluluk matrisinin tamamını gerçek cihazlarda doğrulamak, uzun oturum testleri yapmak, tüm bilinen sorunları kapatmak.

### Player Value

Oyun, oynandığı her yerde çalışır.

### Business Value

Launch'tan önceki son güvenlik ağı. Buradaki bir kaçak, launch günü toplu geri bildirime dönüşür.

### Dependencies

Faz 21.

### Systems

Yeni sistem yok — doğrulama ve düzeltme.

### Game Design

Tam oyun dengesinin son gözden geçirmesi.

### Technical Architecture

Değişiklik yok (düzeltmeler hariç).

### UI/UX

Tespit edilen sorunların düzeltilmesi.

### Assets

Placeholder sayısı **sıfır** doğrulanır; production build'de sıfır değilse **hata**.

### Animation / Audio

Tüm cihazlarda doğrulama (özellikle iOS ses).

### Data

Migration zinciri v1→current tam doğrulama.

### Testing

- **Tam tarayıcı matrisi** ([TECHNICAL_ARCHITECTURE §12](TECHNICAL_ARCHITECTURE.md#12-tarayıcı-uyumluluk-matrisi)) gerçek cihazlarda.
- **Uzun oturum:** 2 saat kesintisiz, bellek/FPS/hata takibi.
- **Tam oyun geçişi:** sıfırdan Aşama 4'e, tüm sistemler.
- Manuel checklist ([TESTING_STRATEGY §9](TESTING_STRATEGY.md#9-manuel-test-checklist-her-faz-sonu)) tam.
- Erişilebilirlik: gerçek ekran okuyucu ile.
- Ağ koşulları: yavaş 3G, kesinti, yeniden bağlanma.
- Depolama: kota dolu, IndexedDB engelli, private mode.
- Tüm E2E + visual + balance + perf yeşil.
- Quarantine'deki test sayısı **sıfır**.

### Performance

Tüm bütçeler tüm cihazlarda.

### Security

Son güvenlik gözden geçirmesi.

### Deployment

Production'a yakın bir preview'da tam doğrulama.

### Tasks

1. Gerçek cihaz matrisi (min: 1 masaüstü Chrome, 1 Firefox, 1 Safari macOS, 2 Android, 1 iPhone).
2. 2 saatlik uzun oturum × 3.
3. Tam oyun geçişi (sıfırdan Aşama 4'e).
4. Manuel checklist tam.
5. Ekran okuyucu testi.
6. Ağ ve depolama senaryoları.
7. Bilinen sorunları düzelt veya bilinçli olarak kabul et ve dokümante et.
8. Quarantine'deki testleri sıfırla.
9. `docs/KNOWN_ISSUES.md`.

### Files / Modules Expected

```
docs/{KNOWN_ISSUES,QA_REPORT}.md · docs/PERF_LOG.md (tam matris)
düzeltme commit'leri
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 22. Read docs/TESTING_STRATEGY.md sections 9 and 12, and
docs/TECHNICAL_ARCHITECTURE.md section 12.

SCOPE
Validation, not new features. If you find yourself designing something, stop.

THE MATRIX MUST BE REAL DEVICES
Emulation is not validation. Minimum: desktop Chrome, desktop Firefox, Safari on
macOS, two Android phones (one mid-range, one weak), one iPhone. Record the exact
device, OS, and browser version for every result. "Tested on mobile" is not a
result; "Pixel 6a, Android 15, Chrome 133, tier Medium, p50 47 FPS" is.

WHAT LONG SESSIONS CATCH THAT NOTHING ELSE DOES
Run three uninterrupted two-hour sessions. Watch for memory growth, FPS decay,
entity leaks, audio voice exhaustion, save file growth, and slow drift in the
economy. These bugs are invisible in a five-minute test and brutal in production.

FULL PLAYTHROUGH
Zero to stage 4 without debug shortcuts. This is the only test that exercises the
real pacing, the real save migrations across a long timeline, and the real
progression.

KNOWN ISSUES ARE ALLOWED — HIDDEN ISSUES ARE NOT
Anything you cannot fix goes in docs/KNOWN_ISSUES.md with severity, affected
platforms, reproduction steps, and workaround. A documented known issue is
professional. An undocumented one discovered by a player is not.

QUARANTINE MUST REACH ZERO
Every skipped or flaky test is fixed or deleted with justification before this
phase closes. Shipping with quarantined tests means shipping with no signal.

PLACEHOLDERS MUST BE ZERO
A production build containing any placeholder is now a hard build error.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus docs/QA_REPORT.md with the full device matrix
and every result recorded honestly — including the ones that are not good. Then STOP.
```

### Risks

| Risk                                                  | Olasılık | Etki   | Azaltma                                                    |
| ----------------------------------------------------- | -------- | ------ | ---------------------------------------------------------- |
| Geç keşfedilen platform sorunu                        | Orta     | Yüksek | Matris erken fazlarda da kısmen koşuluyor                  |
| Uzun oturum sorunlarının düzeltilmesinin uzun sürmesi | Orta     | Orta   | Faz bütçesinde pay; kritik olmayanlar KNOWN_ISSUES'a       |
| Gerçek cihaz erişimi                                  | Orta     | Orta   | Erişilemeyen cihaz açıkça raporlanır, "test edildi" denmez |

### Rollback

Yok (doğrulama fazı).

### Success Metrics

Matris tam; 2 saatlik oturumlar temiz; quarantine sıfır; placeholder sıfır; KNOWN_ISSUES dürüst.

### Definition of Done

WORKING_DISCIPLINE §4 + QA_REPORT + KNOWN_ISSUES.

---

## PHASE 23 — LAUNCH PREPARATION

### Objective

Oyunu yayına hazır hâle getirmek: production deployment, domain, meta, analitik doğrulama, rollback provası, launch materyalleri.

### Player Value

Oyunu bulabilir ve paylaşabilir.

### Business Value

Launch, teknik bir olay olduğu kadar operasyonel bir olay. Prova edilmemiş rollback, rollback değildir.

### Dependencies

Faz 22.

### Systems

Yok — operasyon.

### Game Design

Son denge gözden geçirmesi (launch sonrası değiştirmek daha zor).

### Technical Architecture

Production konfigürasyonu kesinleşir. Feature flag'ler production değerlerine ayarlanır.

### UI/UX

Meta: başlık, açıklama, OG görselleri, favicon seti, PWA ikonları, sosyal paylaşım kartı.

### Assets

Launch görselleri: OG kartı, ekran görüntüleri, kısa GIF/video.

### Animation / Audio

Değişiklik yok.

### Data

Analitik olaylarının uçtan uca doğrulanması.

### Testing

- Production smoke suite.
- **Rollback provası:** gerçekten bir deployment yap, geri al, doğrula. Prova edilmemiş rollback güvenilmez.
- Lighthouse: performance, a11y, best-practices, SEO.
- Sosyal paylaşım önizlemesi (Twitter/X, Discord, Slack).
- PWA yükleme akışı.
- İlk ziyaret akışı (temiz tarayıcı profili).

### Performance

Production'da son ölçüm.

### Security

Son başlık ve bağımlılık kontrolü. Secret taraması.

### Deployment

- **Vercel plan kararı:** Monetizasyon yoksa Hobby yeterli. **Monetizasyon eklenecekse Pro'ya geçiş burada yapılır** ([RESEARCH_NOTES §9](RESEARCH_NOTES.md#9-deployment-vercel-vs-flyio)).
- Domain bağlama (varsa), SSL, redirect'ler.
- Bant genişliği izleme ve uyarı eşiği (100 GB'ın %70'inde uyarı).

### Tasks

1. Production konfigürasyonu ve feature flag'ler.
2. Domain + SSL + redirect'ler.
3. Meta, OG, favicon, PWA ikonları.
4. Launch görselleri.
5. Analitik uçtan uca doğrulama.
6. **Rollback provası.**
7. Lighthouse ve düzeltmeler.
8. Bant genişliği izleme + uyarı.
9. **Vercel plan kararı ve gerekirse yükseltme.**
10. `docs/RUNBOOK.md` (olay müdahale, rollback, izleme).
11. README ve public dokümantasyon.
12. Son güvenlik ve bağımlılık taraması.

### Files / Modules Expected

```
public/{og-image.png,icons/*,manifest.webmanifest,robots.txt}
docs/{RUNBOOK,LAUNCH_CHECKLIST}.md · README.md (public)
vercel.ts (production) · .github/workflows/production-smoke.yml
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 23. Read docs/WORKING_DISCIPLINE.md and docs/RESEARCH_NOTES.md section 9.

SCOPE
Launch readiness. Operations, not features.

REHEARSE THE ROLLBACK — this is the most important task in the phase
Deploy a deliberately marked build to production, then roll it back by promoting
the previous deployment, and verify the site is correct afterwards. Time it.
Write the exact steps in docs/RUNBOOK.md. A rollback procedure that has never been
executed is not a procedure, it is a hope.

VERCEL PLAN DECISION — do not let this slip
Vercel's Hobby plan prohibits commercial use, and that explicitly includes ads,
donations, affiliate links, and payments. If any monetisation is planned, the
upgrade to Pro happens NOW, before launch, not after the first revenue. Also set
a bandwidth alert at 70% of the 100 GB monthly cap: 8 MB per cold visit means the
cap is roughly 12,500 first-time visitors.

ANALYTICS END TO END
Every one of the 17 events must be verified as actually arriving, with correct
payloads, from a real production build. An analytics event that silently fails is
worse than none — it produces confident wrong decisions.

FIRST-VISIT EXPERIENCE
Test in a completely clean browser profile: no cache, no service worker, no
storage. Measure real time to first playable frame on a throttled connection.
That number is the one that decides whether a new player stays.

RUNBOOK
docs/RUNBOOK.md must let someone who is not you handle: a broken deploy, a save
corruption report, a bandwidth spike, an error-rate spike, and a rollback.

DEFINITION OF DONE
WORKING_DISCIPLINE section 4, plus a rehearsed rollback with recorded timing, plus
docs/LAUNCH_CHECKLIST.md fully ticked. Then STOP and report launch readiness.
```

### Risks

| Risk                                           | Olasılık | Etki           | Azaltma                                                 |
| ---------------------------------------------- | -------- | -------------- | ------------------------------------------------------- |
| **Hobby planı ihlali** (monetizasyon varsa)    | Orta     | **Yüksek**     | Faz görevi olarak duruyor; atlanamaz                    |
| Bant genişliği tavanı                          | Orta     | Yüksek         | %70 uyarı + service worker + asset CDN çıkış yolu hazır |
| Rollback'in çalışmaması                        | Düşük    | **Çok yüksek** | Prova zorunlu                                           |
| Analitik olaylarının sessizce başarısız olması | Orta     | Orta           | Uçtan uca doğrulama                                     |

### Rollback

Bu fazın konusu.

### Success Metrics

Rollback prova edildi ve süresi kayıtlı; Lighthouse hedefleri; analitik doğrulandı; plan kararı verildi.

### Definition of Done

WORKING_DISCIPLINE §4 + RUNBOOK + LAUNCH_CHECKLIST + rollback provası.

---

## PHASE 24 — POST-LAUNCH GROWTH

### Objective

Gerçek oyuncu verisiyle oyunu iyileştirmek; monetizasyonu (gerekirse) değerlendirmek; içerik genişletmesini planlamak.

### Player Value

Oyun yaşamaya devam eder ve geri bildirimlerine göre gelişir.

### Business Value

Launch bir bitiş değil başlangıç. En değerli tasarım verisi buradan gelir.

### Dependencies

Faz 23.

### Systems

Analitik gözden geçirme döngüsü · A/B altyapısı (gerekirse) · içerik pipeline'ı.

### Game Design

Veri odaklı ayarlamalar. Ama: **analitik tasarımı yönetmez, bilgilendirir.** Bir metriği yükseltmek için oyunu kötüleştirmek yasak (WORKING_DISCIPLINE kural 12 ruhu).

### Technical Architecture

Değişiklik yok. Yeni içerik mevcut sistemlere veri olarak eklenir.

### UI/UX

Geri bildirim odaklı iyileştirmeler.

### Assets

Yeni kozmetikler, mevsimlik içerik.

### Animation / Audio

Yeni içeriğe göre.

### Data

Analitik panoları, cohort analizi.

### Testing

Tüm mevcut süitler + yeni içerik testleri. Regresyon koruması sürüyor.

### Performance

İzleme sürüyor; bütçeler korunuyor.

### Security

Bağımlılık güncellemeleri, düzenli denetim.

### Deployment

Sürekli. Rolling release / kademeli yayın değerlendirilir.

### Tasks

1. İlk 2 hafta: günlük analitik ve hata izleme, hızlı düzeltmeler.
2. Retention analizi (D1/D7/D30) — hedeflere göre.
3. `bottleneck_detected` ve `offline_limiter` dağılımlarından denge ayarı.
4. Onboarding hunisi analizi (`first_customer_served`).
5. Oyuncu geri bildirimi toplama ve önceliklendirme.
6. **Monetizasyon değerlendirmesi** (§28 sırasıyla; MVP'de yoktu).
7. İçerik genişletmesi planı (yeni harita? yeni mutfak? mevsimlik?).
8. Faz 19 (cloud save) koşulunun yeniden değerlendirilmesi.
9. Teknik borç ödemesi.

### Files / Modules Expected

```
docs/{POSTLAUNCH_LOG,RETENTION_ANALYSIS}.md
içerik ve düzeltme commit'leri
```

### AI Coding Agent Execution Prompt

```
CONTEXT
Phase 24. Ongoing. Read docs/GAME_DESIGN_DOCUMENT.md sections 19-21.

SCOPE
Improve the game using real data. This phase has no end date and no single
deliverable; work in small approved increments.

THE DISCIPLINE THAT MATTERS HERE
Analytics informs design; it does not govern it. It is easy to raise D1 with a
daily-login penalty or a FOMO timer, and doing so makes the game worse. The
mechanics we explicitly refused in GAME_DESIGN_DOCUMENT section 19 stay refused
even if a metric would improve. If you believe one of them is now justified,
raise it as a change request with reasoning — do not add it quietly.

FIRST TWO WEEKS
Daily error and analytics review. Fix crashes and save corruption immediately;
everything else queues.

THE FOUR METRICS THAT ACTUALLY TEACH YOU SOMETHING
  first_customer_served duration  -> is onboarding working
  bottleneck_detected distribution-> is the balance right
  offline limiter distribution    -> which constraint binds players most
  playtime per evolution          -> is pacing right
Use these to tune, and re-run the balance simulator after every economy change so
the envelope still holds.

MONETISATION
Only now, and only in the priority order in section 28: cosmetics first, then a
one-time supporter purchase, then optional rewarded video for things the player
would earn anyway, then expansion content. Never pay-to-win. And remember: turning
on any monetisation requires the Vercel Pro upgrade first.

RE-EVALUATE PHASE 19
Now there is real data on whether players want cross-device saves. Decide with
evidence.

DEFINITION OF DONE
Not applicable — this phase is continuous. Each increment follows
WORKING_DISCIPLINE section 4 individually.
```

### Risks

| Risk                                        | Olasılık | Etki       | Azaltma                                                            |
| ------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------ |
| Metrik peşinde oyunu bozmak                 | Orta     | **Yüksek** | Reddedilen mekanikler listesi bağlayıcı; değişiklik talebi gerekli |
| Denge değişikliklerinin regresyon yaratması | Orta     | Orta       | Balance simülatörü her değişiklikte                                |
| Teknik borcun birikmesi                     | Orta     | Orta       | Her sprint'te pay ayrılır                                          |
| Monetizasyonun erken/agresif eklenmesi      | Orta     | Yüksek     | §28 sırası bağlayıcı                                               |

### Rollback

Her artım ayrı; rolling release ile kademeli yayın.

### Success Metrics

D1 ≥ %35, D7 ≥ %14, D30 ≥ %6; kritik hata oranı < %0.5 oturum; oyuncu geri bildirimi olumlu eğilimde.

### Definition of Done

Sürekli faz — her artım kendi DoD'sini karşılar.

---

## 33. Phase Dependencies

```
P0 Research
 └─► P1 Foundation (CI, deploy, lint, test)
      └─► P2 Sim Core  ◄── her şeyin temeli
           ├─► P3 Iso Render
           │    └─► P4 Assets v1
           │         └─► P5 Traffic ◄──────┐
           │              └─► P6 Customer  │
           │                   └─► P7 Nav  │
           │                        └─► P8 Service Loop
           │                             └─► P9 Economy v1 + Upgrade v1
           │                                  ★ VERTICAL SLICE GATE
           │                                  └─► P10 Employee AI
           │                                       └─► P11 Evolution
           │                                            └─► P12 Balance
           │                                                 ├─► P13 Upgrades v2
           │                                                 ├─► P14 Offline
           │                                                 └─► P15 Events/Weather
           │                                                      └─► P16 Assets v2
           │                                                           └─► P17 Anim/VFX/Audio
           │                                                                └─► P18 UI/UX/A11y
           │                                                                     ├─► P19 Cloud (koşullu)
           │                                                                     └─► P20 Performance
           │                                                                          └─► P21 Security
           │                                                                               └─► P22 QA
           │                                                                                    └─► P23 Launch
           │                                                                                         └─► P24 Growth
           └─(P2 ayrıca doğrudan)─► P14 (save/offline altyapısı)
```

**Kritik yol:** P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 (Vertical Slice) → P10 → P11 → P12 → P16 → P17 → P18 → P20 → P21 → P22 → P23

**Paralelleştirilebilir (kritik yolda değil):** P13, P14, P15 — P12 sonrası birbirinden bağımsız. P19 koşullu ve tamamen ayrılabilir.

**Döngüsel bağımlılık kontrolü:** Yok. Her fazın bağımlılıkları yalnızca daha düşük numaralı fazlara. Tek dikkat noktası: P12 (denge) P11'e (evrim) bağlı, P13/P14/P15 P12'ye bağlı — bu doğrusal ve doğru, çünkü denge tüm sistemler var olmadan yapılamaz.

**En riskli bağımlılık:** P9'daki Vertical Slice Kapısı. Kapıdan geçilemezse P10–P24'ün tamamı bloke olur. Bu kasıtlı.

---

## 34. Risk Register

| #   | Risk                                                              | Faz           | Ola.   | Etki   | Skor | Azaltma                                                                                                    | Erken uyarı sinyali                                           |
| --- | ----------------------------------------------------------------- | ------------- | ------ | ------ | ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| R1  | **Vertical slice kapısından geçilememesi**                        | P9            | Orta   | Kritik | 🔴   | Kapının kendisi azaltmadır; P5/P6/P8 DoD'lerinde erken yargı maddeleri                                     | P5'te "yol taşıma bandı gibi", P8'de "döngü sıkıcı" yargıları |
| R2  | **Determinizmin sızıntıyla bozulması**                            | P2+           | Yüksek | Kritik | 🔴   | AST taraması + lint + determinizm süiti her CI'da; katman zorlaması                                        | Determinizm testinde tek bir flake                            |
| R3  | **AI asset tutarsızlığı / stil sürüklenmesi**                     | P4, P16       | Yüksek | Yüksek | 🔴   | Altın referanslar + değişmez prompt + batch üretim + 9 doğrulama + 4 tutarlılık kapısı                     | Contact sheet'te bir kategorinin sırıtması                    |
| R4  | **Faz 11 kapsam patlaması** (4 aşama + layout + drive-thru)       | P11           | Yüksek | Yüksek | 🔴   | Aşama 3–4 sanatı P16'ya alındı; gerekirse P11a/P11b bölünmesi teklif edilir                                | P11 görev listesinin büyümesi                                 |
| R5  | Mobil performans bütçelerinin karşılanamaması                     | P20           | Orta   | Yüksek | 🟠   | 4 kademeli degradasyon; mobil entity cap'i; erken gerçek cihaz ölçümü                                      | P5/P8'de mobilde FPS düşüşü                                   |
| R6  | **Vercel Hobby ticari kullanım ihlali**                           | P23, P24      | Orta   | Yüksek | 🟠   | P23'te açık görev; monetizasyon öncesi Pro                                                                 | Monetizasyon tartışmasının başlaması                          |
| R7  | Vercel bant genişliği tavanı (100 GB/ay)                          | P23+          | Orta   | Yüksek | 🟠   | Asset bütçesi + service worker + `VITE_ASSET_BASE_URL` çıkış yolu + %70 uyarı                              | Kullanımın %50'yi geçmesi                                     |
| R8  | TypeScript 7'ye geçememe (typescript-eslint gecikmesi)            | sürekli       | Orta   | Düşük  | 🟡   | TS6 tamamen yeterli; tetikleyici dokümante; issue takibi                                                   | typescript-eslint#12518 hareketsizliği                        |
| R9  | Kalabalıkta NPC deadlock'u                                        | P7, P10       | Orta   | Yüksek | 🟠   | 500 senaryo × 2000 tick kalıcı deadlock testi                                                              | Tek bir "ajan takıldı" gözlemi                                |
| R10 | Save migration'ında ilerleme kaybı                                | P10, P11, P14 | Düşük  | Kritik | 🟠   | Her sürüm için fixture + v1→current CI testi + premigration yedeği                                         | Migration testinin atlanması                                  |
| R11 | Ekonomi dengesizliği / çıkmaz                                     | P12           | Yüksek | Orta   | 🟠   | Balance simülatörü CI kapısı, 10 assertion                                                                 | Assertion'lardan birinin sınırda olması                       |
| R12 | Visual regression'ın gürültülü olması (kullanılamaz hâle gelmesi) | P3+           | Orta   | Orta   | 🟡   | Görsel determinizm modu + pinlenmiş container + zorunlu SwiftShader + 10× özdeş screenshot kanıtı          | İlk açıklanamayan diff                                        |
| R13 | CI süresinin kontrolden çıkması (>20 dk)                          | P12+          | Orta   | Orta   | 🟡   | Süre bütçesi izleniyor; paralelleştirme; aşarsa mimari sorun olarak ele alınır                             | 15 dakikayı geçmesi                                           |
| R14 | Flaky test birikimi                                               | sürekli       | Orta   | Orta   | 🟡   | Quarantine politikası; 5'i geçerse geliştirme durur                                                        | FLAKY.md'nin büyümesi                                         |
| R15 | iOS Safari bellek baskısı → sekme kill                            | P20, P22      | Orta   | Yüksek | 🟠   | Mobil texture bütçesi 96 MB, düşük DPR, atlas boşaltma                                                     | iPhone'da 20 dk sonra çökme                                   |
| R16 | Onboarding'in çalışmaması                                         | P18           | Orta   | Yüksek | 🟠   | 3 yeni oyuncu testi; tooltip değil tasarım düzeltmesi                                                      | İlk oyuncunun "ne yapacağım" demesi                           |
| R17 | Ses yorgunluğu                                                    | P17           | Yüksek | Orta   | 🟡   | Throttle + pitch varyasyonu + 20 dk gerçek test                                                            | Kendi testinde sesi kısma isteği                              |
| R18 | Gereksiz backend (P19) inşa etmek                                 | P19           | Orta   | Orta   | 🟡   | Koşullu faz; atlama meşru ve tercih edilen sonuç                                                           | "Nasılsa lazım olur" düşüncesi                                |
| R19 | Analitik peşinde oyunu bozmak                                     | P24           | Orta   | Yüksek | 🟠   | Reddedilen mekanikler listesi bağlayıcı; değişiklik talebi gerekli                                         | Retention'ın hedefin altında kalması                          |
| R20 | AI ajan bağlam kayması (uzun projede tutarlılık)                  | sürekli       | Yüksek | Orta   | 🟠   | Her faz WORKING_DISCIPLINE ile başlar; CLAUDE.md; faz raporları; ADR'ler; makine-zorlamalı mimari kurallar | Bir fazın önceki kararla çelişmesi                            |
| R21 | Phaser 4'ün beklenmedik kısıtı (henüz keşfedilmemiş)              | P3, P11, P17  | Orta   | Orta   | 🟡   | Sim/render ayrımı motor değişimini 2–3 haftaya indiriyor; her faz erken prototip                           | Bir özelliğin "Phaser'da yapılamıyor" çıkması                 |
| R22 | Asset lisans sorunu (AI aracı şartları)                           | P4, P16, P23  | Düşük  | Kritik | 🟠   | Üretim öncesi lisans doğrulaması; LICENSES.md; launch öncesi yeniden doğrulama                             | AI aracının şartlarını değiştirmesi                           |

**🔴 Kritik (4):** R1, R2, R3, R4 — bunlar projenin başarısızlık senaryolarının çoğunu oluşturuyor ve her biri için birden fazla bağımsız savunma var.

---

## 35. Definition of Done

Proje genelinde geçerli DoD: [WORKING_DISCIPLINE §4](WORKING_DISCIPLINE.md#4-tamamlandi-ne-demek--definition-of-done) — 15 madde, her biri için kanıt zorunlu.

**Özet:** implementasyon çalışıyor · lint temiz · typecheck temiz · testler yeşil + kapsam · build başarılı + bütçe · E2E yeşil (Chromium + Firefox) + WebKit smoke · visual diff yok veya bilinçli · **CI YEŞİL** · preview sağlıklı · konsol temiz · 5 dk gerçek oynanış hatasız · performans bütçede · dokümantasyon senkron · git temiz · faz raporu yazıldı.

**Proje seviyesinde "bitti" (Faz 23 sonu):**

```
[ ] Dört evrim aşaması tam oynanabilir
[ ] Vertical slice kriterlerinin hepsi hâlâ geçerli
[ ] Tarayıcı matrisi tam doğrulandı (gerçek cihazlar)
[ ] Tüm performans bütçeleri gerçek donanımda karşılandı
[ ] Placeholder sıfır
[ ] Quarantine'de test sıfır
[ ] Balance simülatörü yeşil, 10 assertion
[ ] Erişilebilirlik: axe temiz, klavye tam, ekran okuyucu doğrulandı
[ ] Güvenlik: CSP aktif, audit/CodeQL temiz, gizlilik yayında
[ ] Save migration v1→current çalışıyor, fixture'lar commit'li
[ ] Rollback prova edildi ve süresi kayıtlı
[ ] 7 doküman senkron
[ ] KNOWN_ISSUES dürüst ve tam
[ ] Production sağlıklı, analitik akıyor
```

---

## 36. AI Agent Execution Prompts

Her geliştirme fazı kendi **AI Coding Agent Execution Prompt** bölümünü içerir (§32). Bu bölüm o prompt'ların uyduğu sözleşmeyi tanımlar.

### 36.1 Prompt sözleşmesi

Her execution prompt şunları içerir ve bunlarda belirsizlik bırakmaz:

| Bölüm                    | İçerik                                                              |
| ------------------------ | ------------------------------------------------------------------- |
| **CONTEXT**              | Hangi dokümanların, hangi bölümlerinin okunacağı                    |
| **SCOPE**                | Ne yapılacak **ve açıkça ne yapılmayacak**                          |
| **HARD CONSTRAINTS**     | Makine tarafından zorlanan kurallar; etrafından dolaşma yasağı      |
| **DELIVERABLES**         | Numaralı, somut, dosya/modül seviyesinde                            |
| **Formüller / sabitler** | Kritik matematik prompt'un içinde açıkça yazılır                    |
| **TESTS**                | Hangi testlerin yazılacağı, neyi kanıtlayacağı                      |
| **PERFORMANCE**          | Sayısal bütçe                                                       |
| **OPEN QUESTIONS**       | O fazda karara bağlanacak tasarım soruları                          |
| **DEFINITION OF DONE**   | WORKING_DISCIPLINE §4 + faza özel yargı maddeleri + **"Then STOP"** |

### 36.2 Her prompt'ta zorunlu olan üç şey

1. **"Read docs/WORKING_DISCIPLINE.md first."** — İstisnasız.
2. **Açık kapsam DIŞI beyanı.** "No gameplay", "validation not features", "do not touch vehicles". Kapsam sızıntısı, AI ajanlarının en yaygın hata modu.
3. **"Then STOP."** — Faz kapısı ancak ajan gerçekten durursa çalışır.

### 36.3 Dürüstlük dayatması

Birçok prompt açık bir **insan yargısı maddesi** içerir: _"Watch the road for two full game days and confirm it reads as alive rather than mechanical. Report that judgement honestly — if it looks like conveyor belts, say so."_

Bu kasıtlı. Otomatik testler doğruluğu ölçer, kaliteyi ölçmez. Yargıyı açık bir teslim kalemi yapmak, "testler geçti = bitti" tuzağını kapatır ve WORKING_DISCIPLINE §11'i (dürüstlük) uygulanabilir hâle getirir.

### 36.4 Bağlam kayması karşıtı önlemler (R20)

Uzun bir projede AI ajanının önceki kararlarla çelişmesi en gerçek risklerden biri. Beş bağımsız savunma:

1. **Makine-zorlamalı mimari kurallar** — dependency-cruiser ve ESLint hatırlamaya güvenmez.
2. **`CLAUDE.md`** — her oturumun başında WORKING_DISCIPLINE'a yönlendirir.
3. **ADR'ler** — geri döndürülmesi pahalı her karar yazılı ve gerekçeli.
4. **Faz raporları** — ne yapıldığının kanıtlı kaydı.
5. **Determinizm ve balance süitleri** — davranışsal regresyonu yakalar; ajan bir şeyi "unutup" değiştirirse test kırılır.

### 36.5 Kapsam dışı prompt yasağı

Bir execution prompt asla şunu içeremez: _"Implement the feature."_, _"Make it better."_, _"Add polish."_ Her teslim kalemi ölçülebilir olmalıdır. Belirsiz bir talimat, ajanın kapsam uydurmasına davetiyedir.

---

## 37. Final Self-Validation

Roadmap sunulmadan önce yapılan derin denetim. **Bulunan sorunlar ve yapılan revizyonlar:**

### 37.1 Denetim sonuçları

| Kontrol                            | Sonuç              | Aksiyon                                                                                                                                                                                                                                                        |
| ---------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Eksik bağımlılık**               | ❌ 3 bulundu       | (a) Pathfinding, müşteri yürüyüşünden sonraydı → P7'ye alındı. (b) Ekonomi, servis döngüsünden sonraydı ama döngü fiyatsız kapanmıyor → P9'a minimum ekonomi eklendi. (c) Evrim (Aşama 3), çalışan AI'dan önceydi ama garson gerektiriyor → sıra değiştirildi. |
| **Döngüsel bağımlılık**            | ✅ Yok             | Bağımlılık grafiği doğrusal; her faz yalnızca daha düşük numaralılara bağlı.                                                                                                                                                                                   |
| **Erken backend karmaşıklığı**     | ❌ Bulundu         | Orijinal P16 (Save/Account/Cloud) koşulsuzdu. Yerel kayıt P2'ye alındı; bulut kayıt P19'da **koşullu** hâle getirildi (gerçek talep kanıtı gerekiyor). Supabase MVP'den çıkarıldı.                                                                             |
| **Gerçekçi olmayan asset iş yükü** | ❌ Bulundu         | Tek bir "Visual Asset Pipeline" fazı ~470 sprite anlamına geliyordu. İkiye bölündü (P4: ~180, P16: ~290) ve P4 öne alındı ki vertical slice değerlendirilebilsin.                                                                                              |
| **Performans riskleri**            | ⚠ Kısmen           | CI'da FPS ölçülemiyor (SwiftShader) → performans kapısı headless sim'e taşındı, gerçek FPS manuel ve PERF_LOG'a. `SpriteGPULayer` derinlik sıralanamıyor → aktörler için kullanılamaz, mimari buna göre yazıldı.                                               |
| **Mobil tarayıcı riskleri**        | ⚠ Ele alındı       | 4 kademeli degradasyon; mobil texture bütçesi 96 MB; iOS bellek riski R15 olarak kayıtlı; gerçek cihaz testi P20 ve P22'de zorunlu.                                                                                                                            |
| **Ekonomi sömürüleri**             | ✅ 10 senaryo      | E1–E10 tanımlandı, her birine önlem ve test atandı ([ECONOMY_DESIGN §14](ECONOMY_DESIGN.md#14-ekonomi-sömürüsü-risk-kaydı)).                                                                                                                                   |
| **Save bozulma riski**             | ❌ Yetersizdi      | Başlangıçta yalnızca checksum vardı. Eklendi: 3'lü yedek rotasyonu, kurtarma akışı UX'i, her sürüm için fixture, v1→current CI testi, premigration yedeği.                                                                                                     |
| **AI ajan bağlam kayması**         | ❌ Ele alınmamıştı | R20 olarak eklendi + §36.4'te beş savunma tanımlandı.                                                                                                                                                                                                          |
| **Test boşlukları**                | ❌ 4 bulundu       | (a) NPC deadlock testi yoktu → kalıcı süite eklendi. (b) Işınlanma yok testi yoktu → P10'a eklendi. (c) Migration zinciri testi yoktu → her faza eklendi. (d) Ekonomi regresyonu test edilmiyordu → balance simülatörü CI kapısı oldu.                         |
| **CI/CD boşlukları**               | ❌ 2 bulundu       | (a) Preview URL'ine karşı E2E yoktu — yerel build'in geçmesi CDN'in doğru davrandığını kanıtlamaz → `preview-e2e.yml` eklendi. (b) Güvenlik ve cache başlıkları test edilmiyordu → eklendi.                                                                    |
| **Deployment riskleri**            | ❌ 2 bulundu       | (a) Vercel Hobby ticari kullanıma kapalı — monetizasyon planlanıyorsa ihlal. P23'e açık görev olarak eklendi. (b) 100 GB bant genişliği ≈ 12.500 soğuk ziyaret. `VITE_ASSET_BASE_URL` çıkış yolu baştan mimariye kondu.                                        |
| **Monetizasyon sorunları**         | ✅ Ele alındı      | MVP'de yok; P24'te öncelik sıralı; pay-to-win ve karanlık desen açıkça yasaklandı.                                                                                                                                                                             |
| **Retention sorunları**            | ⚠ Ele alındı       | Hedefler benchmark'lara göre gerçekçi belirlendi (D1 %35, sektör ortalaması %26–30). Reddedilen mekanikler açıkça listelendi ki metrik baskısıyla sonradan eklenmesin.                                                                                         |
| **Erişilebilirlik sorunları**      | ❌ Yetersizdi      | Başlangıçta yalnızca P18'de bir madde vardı. Genişletildi: asset seviyesinde kontrast/siluet kuralları (P4), reduced-motion'ın sim hızını değiştirmemesi (test), axe-core CI'da, ekran okuyucu testi P22'de, sessiz oynanabilirlik zorunluluğu.                |
| **Ölçülemeyen "kalite" iddiaları** | ❌ Bulundu         | Birçok fazın DoD'sinde yalnızca otomatik test vardı. Açık **insan yargısı maddeleri** eklendi (trafik canlı mı, dönüşüm anı tatmin edici mi, çalışanlar niyetli mi, evrim ödül gibi mi) ve dürüst raporlama zorunlu kılındı.                                   |

### 37.2 Revizyon sonrası kalan bilinen zayıflıklar

Dürüstlük gereği, çözülmemiş olanlar:

1. **Faz 11 hâlâ büyük.** 4 aşama + layout sistemi + drive-thru tek fazda. Bölmek de kapsamı azaltmıyor, sadece kapıyı ikiye çıkarıyor. Karar: tek faz olarak bırakıldı, ama R4 olarak izleniyor ve gerekirse P11a/P11b bölünmesi bir değişiklik talebiyle teklif edilecek.
2. **Süre tahmini yok.** Fazlara "küçük/orta/büyük" dışında süre atanmadı. Bunun sebebi: AI ajanı ile yürütülen bir projede insan-gün tahmini yanıltıcıdır. Yerine faz kapıları ve DoD kullanılıyor. Bu bir eksiklik olarak kabul ediliyor — takvim taahhüdü gerekiyorsa ayrıca konuşulmalı.
3. **Vertical slice kapısından kalınma senaryosu için detaylı plan yok.** Kapı tanımlı ama "kalırsa ne yapılır" yalnızca "core loop düzeltilir" seviyesinde. Kapıya gelindiğinde somut plan üretilecek — şimdi üretmek spekülasyon olurdu.
4. **Çoklu dil (i18n) mimarisi tasarlanmadı.** MVP TR + EN. Metinlerin DOM'da olması i18n'i kolaylaştırıyor ama bir i18n katmanı tasarlanmadı. Faz 18'de ele alınmalı; şu an kapsam dışı olarak işaretli.
5. **AI asset araçlarının erişim/maliyet durumu doğrulanmadı.** God Mode AI, Scenario, PixelLab araştırıldı ama hesap açılmadı, fiyat ve ticari lisans şartları teyit edilmedi. **Faz 4'ün ilk görevi bu olmalı** ve sonuç değiştirirse bir değişiklik talebi gerekebilir. Bu, roadmap'teki en somut doğrulanmamış varsayım.

### 37.3 Kanıt/varsayım oranı

| Karar                     | Dayanak                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| Paket sürümleri           | ✅ npm registry canlı sorgu (2026-08-14)                                       |
| TypeScript 6 kararı       | ✅ typescript-eslint peer aralığı + resmî issue                                |
| Phaser 4 kısıtları        | ✅ Resmî Phaser dokümantasyonu ve release notları                              |
| CI WebGL kısıtları        | ✅ Playwright issue'ları + saha raporları                                      |
| WebGPU durumu             | ✅ caniuse + web.dev + Phaser resmî açıklaması                                 |
| Spine/DragonBones durumu  | ✅ Resmî lisans sayfası + proje durumu                                         |
| AI asset araç yetenekleri | ⚠ İkincil kaynaklar — **Faz 4'te birincil doğrulama gerekli**                  |
| Vercel limitleri          | ✅ Çoklu kaynak, tutarlı                                                       |
| Retention benchmark'ları  | ✅ Sektör raporları (2026)                                                     |
| Ekonomi sayıları          | ⚠ **Tasarlanmış zarflar** — Faz 12'de simülatörle doğrulanacak, şu an varsayım |
| Pathfinding seçimi        | ✅ Karşılaştırmalı çalışma + problem profili uyumu                             |
| Performans bütçeleri      | ⚠ Deneyime dayalı tahmin — Faz 3'ten itibaren ölçümle doğrulanacak             |

### 37.4 Son kontrol

```
[✓] Her mimari karar bir kanıta veya açık bir varsayıma bağlı
[✓] Her varsayım "varsayım" olarak işaretli ve doğrulama fazı atanmış
[✓] Faz yapısı değişiklikleri açıkça teklif edildi, gizlenmedi
[✓] Bağımlılık grafiği döngüsüz
[✓] 22 risk kayıtlı, 4 kritik olanın her birinde çoklu savunma
[✓] Her fazın rollback planı var
[✓] Her fazın DoD'si kanıt gerektiriyor
[✓] Kapsam dışı olanlar açıkça listelendi
[✓] Çözülmemiş zayıflıklar dürüstçe raporlandı (§37.2)
[✓] Hiçbir yerde ölçülmemiş performans veya koşulmamış test iddia edilmedi
[✓] 7 doküman birbiriyle tutarlı ve çapraz referanslı
```

---

## ⛔ DURUM: ONAY BEKLENİYOR

**Faz 1 BAŞLATILMADI. Kod yazılmadı. Repo oluşturulmadı.**

Onay için netleştirilmesi gerekenler:

1. **Faz yapısı değişikliği** (§32.0, 6 değişiklik) onaylanıyor mu?
2. **Faz 1'in başlatılması** onaylanıyor mu?

Onay belirsizse başlatılmayacak ve sorulacaktır.
