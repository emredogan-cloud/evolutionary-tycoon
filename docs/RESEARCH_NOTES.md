# RESEARCH NOTES — Evolutionary Tycoon

> **Amaç:** Roadmap'teki her mimari kararın ardındaki kanıtı burada tutmak.
> Roadmap "ne yapacağız"ı, bu dosya "neden"i ve "kaynağı"nı söyler.
>
> **Araştırma tarihi:** 2026-08-14
> **Doğrulama yöntemi:** npm registry sorguları (canlı sürüm verisi) + web araştırması + resmî release notları.
> **Yeniden doğrulama tetikleyicisi:** Her major faz başlangıcı, veya bir bağımlılığın major sürümü değiştiğinde.

---

## 1. Doğrulanmış paket sürümleri (npm registry, 2026-08-14)

Bu değerler `npm view <pkg> version` ile canlı olarak sorgulandı, tahmin değildir.

| Paket                          | Sürüm            | Not                                                                                     |
| ------------------------------ | ---------------- | --------------------------------------------------------------------------------------- |
| `phaser`                       | **4.2.1**        | Stable. v4.0 Nisan 2026, v4.2 "Giedi" 19 Haziran 2026, 4.2.1 patch Temmuz 2026          |
| `pixi.js`                      | 8.19.0           | v8.16 Şubat 2026'da experimental Canvas renderer ekledi                                 |
| `three`                        | 0.185.1          | 3D — bu proje için kapsam dışı                                                          |
| `vite`                         | **8.2.1**        | v8.0.0 12 Mart 2026                                                                     |
| `typescript`                   | 7.0.2 (`latest`) | **GA 8 Temmuz 2026**, Go-native derleyici, 8–12× hızlı                                  |
| `typescript`                   | **6.0.3**        | Son TS6 hattı — bizim seçtiğimiz sürüm (aşağıda gerekçe)                                |
| `@typescript/typescript6`      | 6.0.2            | Microsoft'un TS6 uyumluluk paketi (lint için köprü)                                     |
| `typescript-eslint`            | **8.67.0**       | peer: `eslint ^8.57 \|\| ^9 \|\| ^10`, `typescript >=4.8.4 <6.1.0`                      |
| `eslint`                       | **10.8.1**       | typescript-eslint 8.67 ile uyumlu                                                       |
| `prettier`                     | 3.9.6            |                                                                                         |
| `vitest`                       | **4.1.10**       | Browser mode + Playwright Trace Viewer entegrasyonu                                     |
| `@playwright/test`             | **1.62.1**       |                                                                                         |
| `svelte`                       | **5.56.9**       | Runes stabil                                                                            |
| `@sveltejs/vite-plugin-svelte` | **7.3.0**        | peer: `vite ^8.0.0`, `svelte ^5.46.4` → Vite 8.2.1 ile tam uyumlu                       |
| `react` / `react-dom`          | 19.2.8           | Değerlendirildi, seçilmedi                                                              |
| `preact`                       | 10.29.8          | Değerlendirildi, seçilmedi                                                              |
| `solid-js`                     | 1.9.14           | Değerlendirildi, seçilmedi                                                              |
| `zod`                          | 4.4.3            | Config şema doğrulaması (dev-only)                                                      |
| `idb`                          | 8.0.3            | IndexedDB wrapper                                                                       |
| `comlink`                      | 4.4.2            | Worker RPC — Faz 20'de opsiyonel                                                        |
| `sharp`                        | 0.35.3           | Asset pipeline görüntü işleme (Node tarafı)                                             |
| `free-tex-packer-core`         | 0.3.9            | Açık kaynak atlas paketleyici (TexturePacker lisans gerektirmez)                        |
| `vite-plugin-pwa`              | 1.3.0            | Service worker (Faz 14+)                                                                |
| `@sentry/browser`              | 10.70.0          | Opsiyonel, env-gated (Faz 21)                                                           |
| `@vercel/analytics`            | 2.0.1            | Cookieless                                                                              |
| `@vercel/speed-insights`       | 2.0.0            | RUM                                                                                     |
| `husky`                        | 9.1.7            |                                                                                         |
| `lint-staged`                  | 17.3.0           |                                                                                         |
| `@commitlint/cli`              | 21.2.2           |                                                                                         |
| `knip`                         | 6.32.2           | Ölü kod tespiti                                                                         |
| `dependency-cruiser`           | 18.2.0           | Katman ihlali tespiti (sim → renderer import yasağı)                                    |
| `howler`                       | 2.2.4            | **Seçilmedi** — Phaser'ın kendi WebAudio yöneticisi yeterli, ekstra bağımlılık gereksiz |

### Yerel ortam (doğrulandı)

```
Node        v24.13.1
npm         11.8.0
pnpm        10.33.4
git         2.43.0
gh          2.45.0   → github.com / emredogan-cloud (scopes: gist, read:org, repo, workflow)
vercel      56.5.0   → oturum açık: emre30283-4955   ⚠ 59.0.0 mevcut, güncelleme önerilir
disk        502 GB boş
```

---

## 2. Kritik bulgu #1 — TypeScript 7 henüz lint'lenemiyor

**Bulgu:** TypeScript 7.0 8 Temmuz 2026'da GA oldu ve full build'lerde 8–12× hız kazandırıyor. Ancak TS 7.0 **stabil bir programatik API ile gelmiyor**; bu API 7.1'e bırakıldı. `typescript-eslint`, tip-farkında (type-aware) lint kuralları için bu API'ye ihtiyaç duyduğundan TS7 desteğini şu an sunmuyor — peer aralığı hâlâ `>=4.8.4 <6.1.0`. ESLint core da aynı nedenle bekliyor.

**Karar:** Proje **TypeScript 6.0.3** kullanır.

**Gerekçe:** Bu projede tip-farkında lint kuralları (`no-floating-promises`, `no-misused-promises`, `strict-boolean-expressions`, `no-unnecessary-condition`) _pazarlık konusu değil_ — deterministik simülasyon çekirdeğinde yutulmuş bir promise veya sessiz bir truthiness hatası, tekrar üretilemeyen bug demektir. 10 saniyelik derleme farkı bu güvenceye değmez.

**Yükseltme tetikleyicisi (dokümante edilmiş, otomatik değil):**

1. `typescript-eslint` bir sürümde `typescript >=7` peer aralığını yayınlar (takip: typescript-eslint#12518),
2. VE o sürüm en az 2 hafta yayında kalmış olur,
3. → ayrı bir PR'da TS7'ye geçilir, tüm test paketi yeşil olmalıdır.

**Reddedilen alternatif:** "TS7'yi `tsc` için, TS6'yı sadece ESLint için pinle" hibriti. İki derleyici sürümünü aynı repoda tutmak, iki farklı tip-çözümleme davranışı demektir; CI'da geçen bir şeyin editörde patlaması (veya tersi) riskini yaratır. MVP aşamasında bu karmaşıklık haklı değil.

---

## 3. Kritik bulgu #2 — CI'da WebGL testi güvenilmez

**Bulgu:**

- GitHub Actions'ta headless Chromium WebGL renderer olarak **SwiftShader** (yazılımsal rasterizasyon) döner. Çalışır ama yavaştır ve GPU'yu temsil etmez.
- Headless **Firefox** WebGL için `xvfb-run` gerektirir; aksi hâlde testler kararsızdır.
- Headless **WebKit** donanım hızlandırma desteklemez ve **canvas elemanı ekran görüntülerinde görünmez** (Playwright#586). Chromium ve Firefox'ta sorun yok.

**Bunun üç doğrudan sonucu var ve mimariyi şekillendiriyor:**

1. **Performans, CI'da render üzerinden ölçülemez.** → Performans kapısı (gate) CI'da _headless simülasyon throughput_ testi olur (saniyede kaç sim tick, kaç ajan, allocation sayısı). Gerçek FPS ölçümü, gerçek GPU üzerinde `?bench=1` modu ile ve dokümante edilmiş bir prosedürle, lokal/manuel yapılır ve `docs/PERF_LOG.md`'ye işlenir.

2. **Visual regression yalnızca Chromium'da yapılır**, pinlenmiş Playwright Docker imajı içinde (`mcr.microsoft.com/playwright:v1.62.1-noble`), zorunlu SwiftShader ile. Golden görüntüler aynı imajda üretilir; yerelde farklı GPU sürücüsü nedeniyle piksel kayması olmaz.

3. **WebKit yalnızca smoke test alır**: oyun boot ediyor mu, kritik konsol hatası var mı, DOM/HUD doğru mu. Canvas ekran görüntüsü alınmaz.

**Ve en önemlisi:** Ekran görüntüsü diff'inin anlamlı olması için render'ın _deterministik_ olması gerekir. Bu, "test için ek özellik" değil, motorun birinci sınıf yeteneği olmalıdır: enjekte edilebilir saat, tohumlanmış (seeded) PRNG, sabit tick, `?seed=&freezeAt=` URL parametreleri. → **Bu, projenin en önemli tek tasarım kararını dayatıyor: simülasyon headless ve deterministik olmalı** (bkz. TECHNICAL_ARCHITECTURE.md §2).

---

## 4. Kritik bulgu #3 — Phaser 4'ün hızlı yolları isometrik aktörler için kullanılamaz

Phaser 4'ün en çok tanıtılan iki performans özelliği bizim ana sahnemiz için **uygun değil**. Bunu şimdi bilmek, Faz 3'te yanlış mimari kurmayı önlüyor.

### `SpriteGPULayer`

- Tüm üye verisini **statik** GPU buffer'da tutar, tek draw call'da çizer; milyon sprite, ~100× hız.
- **Üye başına 168 byte** (CPU + GPU).
- **Kısıtlar:** "üyeleri değiştirmek pahalıdır"; üye silmek için `scaleX/scaleY/alpha = 0` yapılır; **derinlik sıralaması (depth sort) yoktur**; **tek texture** kullanır, multi-atlas desteklemez.
- Resmî tavsiye: "Çalışma zamanında davranışı değişen karakterler, karmaşık per-frame mantık gerektiren nesneler veya sadece birkaç düzine sprite için kullanmayın."

→ **Araçlar, müşteriler, çalışanlar bu katmana giremez.** Onlar dinamik ve derinlik sıralanmalı.
→ **Girebilecekler:** parallax arka plan katmanları, uzak şehir silueti, yol kenarı statik saçılım (çim, çakıl, direkler — aktör düzleminin arkasında), ve tek seferlik partikül patlamaları (non-looping mod).

### `TilemapGPULayer`

- Tüm tilemap katmanını tek quad + özel shader ile çizer, maliyeti görünen tile sayısından bağımsız. Maks 4096×4096 tile.
- **Yalnızca ortografik haritalar.** Isometrik desteklenmiyor.

→ **Zemin bir tilemap olmayacak.**

### Bunun yerine benimsenen yaklaşım

Arsa (lot), evrim aşaması başına **elle kompoze edilmiş, birkaç büyük statik "bake" sprite'ı** olarak render edilir; tile tekrarı yok. Bu hem daha hızlıdır (draw call sayısı bir avuç), hem de görsel olarak istediğimiz "illüstrasyon kalitesi"ni verir — tile tekrarının yarattığı desen tekrarını tamamen ortadan kaldırır. Dinamik ve yerleştirilebilir nesneler (masa, sandalye, araç, insan, tabela) ayrı, derinlik sıralanan sprite'lardır.

### Kullanılabilir Phaser 4 özellikleri

- **RenderNode mimarisi** (v3'ün pipeline sistemi yerine): her node tek iş yapar, `run` + opsiyonel `batch`. Phaser'ın "WebGL rewrite" ifadesi **mimari** yeniden yazımdır; açılan bağlam ölçümle **WebGL 1**'dir (ADR-017).
- Sprite başına **6 yerine 4 vertex** (index buffer ile) → %33 daha az vertex.
- Shader seviyesinde vertex yuvarlama kaldırıldı → daha az batch kırılması.
- Sekme değişiminde otomatik **WebGL context restore**.
- **Mesh2D** (v4.2): dokulu üçgenler, normal sprite'larla aynı batch'te — kare sprite kısıtından çıkış (yol yüzeyi, deforme olabilen yüzeyler için aday).
- **Stencil rendering** (v4.2): kanvasın bölgelerini maskeleme (drive-thru penceresi kesiti, inşaat maskesi).
- **Cone lights** (v4.2, topluluk katkısı): far ışıkları ve tabela aydınlatması için doğrudan kullanılabilir.

### Breaking change'ler (v3 → v4), bilinmesi gerekenler

- Canvas renderer **deprecated** (2026 itibarıyla resmî). → WebGL yoksa oyun çalışmaz; Tier C fallback ekranı zorunlu. Taban **WebGL 1** — motorun gerçekten açtığı bağlam (ADR-017).
- `roundPixels` varsayılanı artık `false`.
- Texture yönelimi WebGL standardına geçti (v3'ün ters framebuffer davranışı düzeltildi).

---

## 5. Motor karşılaştırması — kanıt tabanı

### Bundle boyutu

|                                                         | gzip    |
| ------------------------------------------------------- | ------- |
| Phaser 4 default build                                  | ~310 KB |
| Phaser custom build (kullanılmayan modüller çıkarılmış) | ~110 KB |
| PixiJS v8 core (tree-shakeable)                         | ~150 KB |
| Svelte 5 minimal app                                    | ~2–5 KB |
| React 19 + ReactDOM                                     | ~42 KB  |

### Kapsam farkı

PixiJS bir **renderer**'dır; Phaser bir **oyun framework**'üdür. Pixi seçilirse şunları kendimiz yazarız: sahne yönetimi, girdi (pointer/touch/klavye), kamera (pan/zoom/shake/follow), tween sistemi, partikül sistemi, ses yöneticisi, asset loader + atlas parser, animasyon zamanlayıcı. Bu ~4–6 haftalık ek iştir ve hiçbiri bu oyunun farklılaştırıcısı değildir.

### WebGPU durumu (2026 ortası)

- Global destek ~%82–85 (caniuse).
- Safari 26.0 ile geldi (macOS Tahoe 26, iOS 26, iPadOS 26).
- **Firefox hâlâ varsayılanda kapalı** — Windows'ta Fx 141'den, macOS ARM64'te Fx 145'ten itibaren mevcut ama default-off. Gerekçe: fingerprinting ve sürücü kararlılığı.
- **Phaser 4 bir WebGL yeniden yazımıdır (açılan bağlam WebGL 1 — ADR-017), WebGPU motoru değildir.** WebGPU altyapı hazırlığı olarak duruyor, sevk edilen bir özellik değil.
- PixiJS v8 WebGPU destekliyor, ancak resmî not: "WebGPU her senaryoda WebGL'den otomatik olarak hızlı değildir; Pixi genelde GPU tarafında değil CPU tarafında sınırlanır."

→ **WebGPU bu proje için bugün bir kazanç değil, bir risk.** Bizim darboğazımız 2D sprite sayısı ve CPU-taraflı simülasyon; GPU'da fill-rate sınırlı değiliz. WebGL'de kalıyoruz (bağlam: WebGL 1, ADR-017).

---

## 6. Animasyon: iskelet animasyon araçlarının durumu

**Bulgu:**

- **Spine** (Esoteric Software): runtime'ı ücretsiz entegre edilebilir, ancak **yazılımınızın kullanıcılarının kendi Spine lisansına sahip olması gerekir**; editör tier'ları tek seferlik ücretli (mesh deformation gibi özellikler üst tier'da).
- **DragonBones**: ücretsiz/açık kaynak alternatifti, ancak **projeyi geliştiren kayboldu, indirme linki ölü**; LoongBones olarak yeniden markalandı. Üretim bağımlılığı olarak güvenli değil.
- **Phaser'ın yerleşik iskelet animasyon desteği yok**; Spine-Phaser / pixi-spine gibi eklentiler gerekiyor.

**Ve AI asset üretimi tarafında (bkz. §7):** AI araçları _tek bir karakter için kare-kare tutarlı animasyon_ üretmekte hâlâ zayıf; çıktı sürükleniyor (drift).

**Karar:** Kendi **parça tabanlı rig sistemimizi** ("Doll rig") yazıyoruz — ~300–400 satırlık, JSON rig formatı + keyframe klipleri + prosedürel jeneratörler (sinüs tabanlı yürüyüş, squash-stretch).

**Gerekçe:** Bu üç kısıt aynı çözüme işaret ediyor. AI _statik parçaları_ tutarlı üretebiliyor (gövde, kafa, kol, bacak, şapka, tabak); kare-kare animasyon üretemiyor. İskelet animasyon araçları ya ücretli ya ölü. Kendi rig'imiz: lisans maliyeti sıfır, asset boyutu çok küçük (sprite sheet yerine parça atlası + JSON), deterministik ve **unit test edilebilir**, ve tek bir yürüyüş klibi yüzlerce görsel olarak farklı müşteriye uygulanabilir (parça takası ile). Sprite sheet yaklaşımında her müşteri varyantı ayrı bir sheet demek olurdu.

---

## 7. AI asset üretimi — 2026 durumu ve tutarlılık sorunu

**Araç manzarası:**

- **God Mode AI** — izometrik ve 8 yönlü sprite'larda güçlü; her kamera açısı (side-scroll, izometrik 8-yön, top-down); ticari lisanslı üretim çıktısı.
- **PixelLab** — karakterlerin 4 veya 8 yönlü görünümünü üretir; referans görsele adapte olarak tutarlılık korur.
- **Sprixen** — "Style Lock": palet, çözünürlük, oran ve sanat yönünü proje genelinde zorlar.
- **Scenario** — kendi "art bible"ınız üzerinde model eğitip stil-içi asset üretme.

**En önemli sınırlama (birden fazla kaynak aynı şeyi söylüyor):**

> AI araçları tek bir karakterin tutarlı animasyon kareleri ve dikişsiz (seamless) tileset üretmekte hâlâ zayıf; çoğu araç sürüklenen veya tile olmayan sanat üretiyor. Kare-kare tutarlılık çoğu oyun için üretim kalitesinde değil.

### ⚠ 7.1 Lisans doğrulama durumu — DOĞRULANMAMIŞ

> **Onaylı düzeltme, 2026-08-14.** Yukarıdaki araç yetenekleri **ikincil kaynaklardan** derlendi.
> Ticari kullanım şartları **birincil/resmî kaynaktan doğrulanmadı**. Hesap açılmadı, ToS okunmadı,
> fiyat teyit edilmedi.
>
> Bu, GATE 0'daki en somut doğrulanmamış varsayımdır ve **Faz 4'ün açık bir START CONDITION'ı**
> hâline getirildi ([GAME_EXECUTION_ROADMAP Faz 4](GAME_EXECUTION_ROADMAP.md#phase-4--art-direction--asset-pipeline-v1)).

| Araç        | Yetenek kanıtı              | Ticari lisans kanıtı | Durum                 |
| ----------- | --------------------------- | -------------------- | --------------------- |
| God Mode AI | İkincil (inceleme yazıları) | ❌ Yok               | Faz 4'te doğrulanacak |
| Scenario    | İkincil                     | ❌ Yok               | Faz 4'te doğrulanacak |
| PixelLab    | İkincil                     | ❌ Yok               | Faz 4'te doğrulanacak |
| Sprixen     | İkincil                     | ❌ Yok               | Yedek aday            |

**Doğrulanacak 9 madde:** ticari kullanım · çıktı mülkiyeti · yeniden dağıtım · çıktı kısıtlamaları ·
referans görsel kısıtlamaları · model/eğitim şartları ve opt-out · abonelik gereksinimi ve maliyeti ·
**abonelik sonrası haklar** · atıf gereksinimi.

**Kanıt biçimi:** resmî URL + erişim tarihi + birebir alıntı. Bu tablo Faz 4'te doldurulacak.

**Bunun pipeline'a yansıması (ASSET_PIPELINE.md'de detaylı):**

1. AI **statik** asset üretir: karakter parçaları, mobilya, araç gövdeleri, yemek ikonları, arsa kompozisyonları.
2. AI **animasyon üretmez**. Animasyon runtime'da rig ile yapılır.
3. AI **tileset üretmez**. Zemin elle kompoze edilmiş büyük bake'ler olduğu için buna ihtiyacımız zaten yok.
4. Tutarlılık, "güzel tek görsel" değil **sözleşme** ile sağlanır: sabit kamera açısı (2:1 dimetrik), sabit ışık yönü, kilitli palet, sabit outline kalınlığı, referans-görsel zorunluluğu, ve her asset'in otomatik doğrulamadan geçmesi (boyut, alpha bounds, palet uyumu, anchor noktası).

---

## 8. Pathfinding: kanıt ve karar

**Bulgu:** Flow field'lar aynı hedefe giden çok sayıda ajanda A*'ı yener — tek bir vektör alanı tüm haritayı kaplar, her ajan O(1) lookup yapar. A* ise her ajan için ayrı arama yapar ve yollar büyük ölçüde çakışır. Tower defense karşılaştırmalı çalışmasında flow field test edilen her senaryoda hedefe daha hızlı ulaştı. Flow field'ın zayıflığı **çok büyük haritalar**: yüksek bellek ayak izi ve A*'tan yavaş güncelleme.

**Bizim profilimiz:**

- Harita **küçük ve sabit** (tek bir arsa + yol kenarı), ~64×64 hücre.
- Hedefler **az ve çoğunlukla statik**: tezgâh, mutfak geçiş penceresi, her masa, çıkış, çöp kutusu, park yeri, drive-thru penceresi.
- Ajan sayısı orta (onlarca–yüzlerce).
- Layout **nadiren** değişir (sadece oyuncu bir şey inşa/taşıdığında).

→ Bu, flow field için ders kitabı senaryosu. Büyük harita dezavantajı bizi hiç ilgilendirmiyor.

**Karar (üç katmanlı, her katman farklı bir problemi çözüyor):**

1. **Araçlar:** arama yok. Şerit (lane) spline'ları üzerinde 1B ajanlar (arc-length parametrize), araç-takip modeli (IDM-lite), ve park manevraları için önceden yazılmış spline'lar. Araçlar labirentte gezmez; şeritte ilerler.
2. **Yayalar (müşteri + çalışan):** 0.5 m çözünürlüklü uniform grid üzerinde, **hedef başına önceden hesaplanmış flow field** (hedeften geriye BFS/Dijkstra). Yalnızca layout değiştiğinde yeniden hesaplanır. Yerel çarpışma için ayrım (separation) steering.
3. _*A*:_* yalnızca nadir, dinamik, tek seferlik hedefler için (ör. yere dökülen bir içeceği temizlemeye giden görevli). Fallback yolu, ana yol değil.

**Reddedilenler:** NavMesh (küçük grid'de aşırı mühendislik, mesh üretimi ekstra araç zinciri), saf A* (aynı hedefe giden 40 müşteride gereksiz tekrar arama), saf waypoint grafiği (mobilya yeniden düzenlendiğinde elle bakım gerektirir).

---

## 9. Deployment: Vercel vs Fly.io

| Kriter                           | Vercel                                                                                                                                | Fly.io                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Mimari                           | Statik varlıklar global CDN'e, dinamik hesaplama serverless'a ayrılır                                                                 | Uygulama container olarak 18 bölgeye dağıtılır                 |
| Statik oyun için                 | Doğal uyum, sıfır konfigürasyon                                                                                                       | Statik dosya sunmak için container (nginx) çalıştırmak gerekir |
| PR başına preview URL            | Yerleşik, sıfır iş                                                                                                                    | Elle kurulum                                                   |
| Ops yükü                         | Yok                                                                                                                                   | Container, sağlık kontrolü, ölçekleme sizde                    |
| WebSocket / uzun ömürlü bağlantı | Fluid Compute ile destekleniyor ama container kadar doğal değil                                                                       | Güçlü tarafı                                                   |
| Bant genişliği                   | Hobby: **100 GB/ay**, aşımda proje durur (faturalanmaz). Pro: 1 TB dahil, sonra $0.15/GB                                              | Kullandıkça öde; shared-CPU 256MB VM ~$1.94/ay                 |
| **Ticari kullanım**              | **Hobby ticari kullanıma kapalı** — ödeme alma, reklam, bağış isteme, affiliate, ücretli geliştirici tarafından yazılmış olması dahil | Kısıt yok                                                      |
| Gözlemlenebilirlik               | Web Analytics (cookieless), Speed Insights yerleşik                                                                                   | Kendiniz kurarsınız                                            |

**Karar: Vercel (birincil).**

**Gerekçe:** Bu oyun, MVP boyunca **tamamen istemci taraflı statik bir uygulama**. Sunucusu yok. Fly.io'nun tek gerçek avantajı (container kontrolü, uzun ömürlü bağlantı) Faz 24'e kadar hiç kullanılmıyor. Buna karşılık Vercel'in PR-başına preview deployment'ı bu projenin **faz kapısı (phase gate) iş akışının doğrudan bir parçası**: her fazın Playwright E2E'si gerçek bir preview URL'ine karşı koşacak. Fly.io'da bunu kurmak ek iştir ve hiçbir oyun değeri üretmez. CLI zaten oturum açmış durumda.

**Dokümante edilmiş uyarılar ve çıkış yolları:**

- ⚠ **Para kazanmaya başlandığı gün Hobby ihlal edilir.** Monetizasyon (Faz 24) öncesinde Pro'ya (~$20/ay) geçilmelidir. Bu, roadmap'te bir görev olarak duruyor, sonradan hatırlanacak bir şey değil.
- ⚠ **100 GB/ay** ≈ 8 MB'lık ilk yükleme için ~12.500 soğuk ziyaret. Bu az. Bu yüzden agresif immutable caching + service worker + küçük kritik yol payload'ı sadece "performans" değil **maliyet** gereksinimi.
- 🚪 Çıkış yolu: bant genişliği bağlayıcı olursa `/assets/**` bir object store + CDN'e (Cloudflare R2 / Bunny) taşınır. Asset URL'leri zaten `ASSET_BASE_URL` env değişkeni üzerinden çözülür, bu yüzden bu tek satırlık bir değişiklik olacak — mimariye baştan konuluyor.
- 🚪 Fly.io yeniden değerlendirme tetikleyicisi: gerçek zamanlı çok oyunculu veya kalıcı WebSocket gerektiren bir özellik onaylanırsa.

---

## 10. Rakip / tür analizi

**İncelenen örnekler:** Idle Restaurant Tycoon (HTML5/WebGL, CrazyGames & benzeri portallar), Idle Hotel Empire Tycoon (Hako Games, Nisan 2026, 9.1 puan), AdVenture Capitalist (türün tanımlayıcısı), çeşitli "aşçı + garson + masa" optimizasyon oyunları.

**İyi yaptıkları:**

- Anında oynanabilirlik: indirme, kurulum, kayıt yok; PC/Mac/Chromebook/tablet/telefon, Chrome/Firefox/Edge/Safari.
- Net ve okunabilir yükseltme merdiveni; "hangi istasyonu önce yükseltmeliyim" kararı türün kalbi.
- Kısa oturumda tatmin + uzun vadede birikim.

**Aşırı kullandıkları / zayıflıkları:**

- Talep bir **spawn timer**'dan gelir. Müşteri yoktan var olur. Oyuncunun dünyayla ilişkisi soyuttur.
- Görsel dil neredeyse evrensel olarak düz, tekrarlayan tile'lar ve şablon UI; oyunlar birbirinden ayırt edilemiyor.
- Modal spam: her yükseltme bir pencere, oyun alanı sürekli kapanıyor.
- Sayı büyümesi anlamsızlaşana kadar üstel; "number formatting'i kıracak kadar sermaye biriktirmek" bir şaka olarak anılıyor — ama bu gerçek bir tasarım kusuru.
- Reklam, oyuncunun zaman algısını manipüle etme aracı olarak agresif kullanılıyor.

**Retention gerçekleri (2026 benchmark'ları):**

- Sektör ortalaması D1 ~%26, D7 ~%10, D30 <%4.
- Top-20 arcade idle: D1 %48–52, D7 %7–13.
- Casual: D1 ~%30, D7 ~%14–15, D30 ~%7–8.
- Rewarded ad ile etkileşen kullanıcılar 3.5× daha yüksek retention gösteriyor (korelasyon, nedensellik değil — bu kullanıcılar zaten daha bağlı).
- 2026'da UA performans standardı CPI değil, **cost per retained user ve cohort LTV**.

→ **Sonuç:** MVP'de monetizasyon yok. Retention önce oyunun kendisiyle kazanılır. Reklam sadece Faz 24'te, yalnızca **opsiyonel rewarded** biçiminde ve zaman algısı manipülasyonu olarak değil, oyuncunun zaten kazanacağı bir şeyi hızlandırma olarak değerlendirilir. Pay-to-win yok.

---

## 11. İzometrik derinlik sıralama teknikleri

**Seçenekler:**

1. **Topolojik sıralama** — sprite'ları düğüm, "arkasında" ilişkilerini kenar kabul eden bir graf üzerinde. Yarı saydamlıkta doğru sonuç verir (depth buffer yarı saydamlığı çözemez). Döngüler için Tarjan SCC ile tespit + nesneyi bölme veya clipping. **Maliyet: en kötü O(n²), sprite sayısıyla hızla bozulur.**
2. **GPU depth buffer** — hızlı, ama yarı saydam kenarlarda (bizim tüm karakterlerimizde anti-aliased alpha var) yanlış sonuç verir.
3. **Painter's algorithm + ayak izi (footprint) anchor'ı + uzun nesneleri bölme** — O(n log n), pratik.

**Karar:** 3 numara.
`depth = (worldX + worldY) * DEPTH_SCALE + worldZ * Z_WEIGHT + stableTieBreak`
Nesneler **ayak izi merkezinden** anchor'lanır. Uzun nesneler (duvar, tabela direği, ağaç) yazma kuralı gereği alt/üst parçalara bölünür — bu, gerçek döngülerin oluşmasını en baştan engeller. Bu bir "hack" değil, asset yazım sözleşmesidir ve ASSET_PIPELINE.md'de zorunlu kural olarak yer alır; doğrulama scripti bir sprite'ın bounding box'ı eşik yüksekliğini aşarsa build'i kırar.

Phaser tarafında: aktörler tek bir `Container` içinde tutulur, `depth` alanı sim'den her frame yazılır, Phaser child sıralamasını yapar.

---

## 12. UI framework kararı

**Neden DOM overlay, canvas-içi UI değil:**

- **E2E testi:** Playwright canvas'ın içini sorgulayamaz. HUD ve menüler DOM ise `getByRole`, `getByTestId` ile sağlam testler yazılır. Canvas UI, test edilebilmek için ayrı bir debug köprüsü gerektirir — sürekli bakım yükü.
- **Erişilebilirlik:** ekran okuyucu, klavye navigasyonu, tarayıcı zoom'u, `prefers-reduced-motion` — hepsi DOM'da bedava, canvas'ta sıfırdan yazılır.
- **Responsive:** CSS grid/flex + container queries, canvas layout kodundan kat kat ucuz.

**Neden Svelte 5, React 19 değil:**

|                      | Svelte 5                                      | React 19                                                         |
| -------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| Runtime              | ~2–5 KB gzip                                  | ~42 KB gzip                                                      |
| Reaktivite           | Signal (runes), VDOM yok, derlenip yok oluyor | VDOM + reconciliation                                            |
| HUD 10 Hz güncelleme | Yalnızca değişen DOM node'u dokunulur         | Memoization disiplini gerektirir, aksi hâlde re-render fırtınası |
| Bellek               | ~%50 daha az (benchmark)                      |                                                                  |

HUD'umuz saniyede ~10 kez güncellenen bir dizi sayaç (nakit, sıra uzunluğu, memnuniyet, saat). React'te bunu doğru yapmak mümkün ama `memo`/`useMemo` disiplini gerektirir ve bu disiplini CI'da zorlamak zordur. Svelte'de doğru davranış varsayılandır.

**Karşı argüman ve yanıtı:** React'in eğitim verisi daha bol, dolayısıyla AI ajan uyumu daha yüksek. Kabul ediyoruz — ama Svelte 5 runes yeterince olgun ve dokümante, ve toplam UI kod hacmi React'e göre belirgin biçimde küçük olacağı için net etki pozitif. `@sveltejs/vite-plugin-svelte` 7.3.0 peer aralığı `vite ^8.0.0` — mevcut Vite 8.2.1 ile birebir uyumlu, sürüm riski yok.

**Kritik kural:** Svelte katmanı simülasyona **asla** doğrudan erişmez. Sim → typed event bus → ince bir store adaptörü → Svelte. Bu, UI'ın per-frame sim state'i okumasını (ve dolayısıyla sim'i yavaşlatmasını) yapısal olarak imkânsız kılar.

---

## 13. Ses

Ayrı bir ses kütüphanesi (Howler 2.2.4) **alınmıyor**. Phaser 4 zaten WebAudio tabanlı bir ses yöneticisi ile geliyor: ses havuzu, spatial pan, marker'lar, mobil unlock. Howler'ın çözdüğü ana problem (mobilde AudioContext'in kullanıcı etkileşimine kadar kilitli olması, ilk `touchend`'de boş buffer çalarak sessizce açma) Phaser'da da çözülmüş durumda.

Ekstra 20 KB ve ikinci bir ses grafiği yönetmek, kazandıracağı hiçbir şeye değmez. Karar: **Phaser SoundManager**, üstüne ince bir `AudioDirector` katmanı (kategori bazlı ducking, mesafeye göre ses seviyesi, aynı anda çok fazla aynı sesin çalmasını engelleyen throttle).

---

## 14. Kaynaklar

**Motor / render**

- [Phaser 4 Renderer: Faster, Cleaner, and Built for Modern Games](https://phaser.io/news/2026/04/phaser-4-renderer-faster-cleaner-and-built-for-modern-games)
- [Phaser v4.2.0 "Giedi": Mesh2D, Stencil Rendering and AlphaStrategy](https://phaser.io/news/2026/06/phaser-v4-2-0-released)
- [How to Render Thousands of Sprites in Phaser 4 Without Killing Performance (SpriteGPULayer)](https://phaser.io/news/2026/05/phaser4-spritegpulayer-performance)
- [Phaser 4 Rendering Concepts](https://phaser.io/tutorials/phaser-4-rendering-concepts)
- [phaserjs/custom-build](https://github.com/phaserjs/custom-build)
- [PixiJS v8.16.0 release](https://pixijs.com/blog/8.16.0)
- [PixiJS v8 Launch](https://pixijs.com/blog/pixi-v8-launches)
- [Phaser vs PixiJS (2026)](https://generalistprogrammer.com/comparisons/phaser-vs-pixijs)

**WebGPU**

- [WebGPU is now supported in major browsers — web.dev](https://web.dev/blog/webgpu-supported-major-browsers)
- [WebGPU Hits Critical Mass: All Major Browsers Now Ship It](https://www.webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers/)
- [WebGPU Browser Support in 2026](https://webo360solutions.com/blog/webgpu-browser-support/)

**Toolchain**

- [Announcing TypeScript 7.0 — Microsoft DevBlogs](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [Microsoft Releases TypeScript 7.0 with a Native Go Compiler — InfoQ](https://www.infoq.com/news/2026/08/typescript-7-released/)
- [typescript-eslint — TypeScript 7.0.2 Support (issue #12518)](https://github.com/typescript-eslint/typescript-eslint/issues/12518)
- [typescript-eslint — Dependency Versions](https://typescript-eslint.io/users/dependency-versions/)
- [eslint — Change Request: Update to TypeScript 7 (issue #21070)](https://github.com/eslint/eslint/issues/21070)
- [Vite Releases](https://vite.dev/releases)
- [Vitest 4.1 is out!](https://vitest.dev/blog/vitest-4-1.html)

**Test / CI**

- [Playwright — Support WebGL with Firefox Headless (issue #21783)](https://github.com/microsoft/playwright/issues/21783)
- [Playwright — WebKit Canvas element invisible on screenshot (issue #586)](https://github.com/microsoft/playwright/issues/586)
- [Testing 3D applications with Playwright on GPU — Promaton](https://blog.promaton.com/testing-3d-applications-with-playwright-on-gpu-1e9cfc8b54a9)
- [Running Playwright with GPU powered Actions — Dave Snider](https://davesnider.com/gputests)

**UI**

- [Svelte vs React in 2026: Performance & DX Compared — Strapi](https://strapi.io/blog/svelte-vs-react-comparison)
- [Svelte vs. React: How to pick the right frontend framework — Vercel](https://vercel.com/i/svelte-vs-react)
- [SolidJS vs Svelte 5 vs React: Reactivity 2026](https://www.pkgpulse.com/guides/solidjs-vs-svelte-5-vs-react-reactivity-2026)

**Animasyon**

- [Spine: Purchase / licensing](https://esotericsoftware.com/spine-purchase)
- [EsotericSoftware/spine-runtimes](https://github.com/EsotericSoftware/spine-runtimes)
- [DragonBones — open-source animation tool (durum)](https://nixieundmina.com/dragonbones-open-source-animation-tool-bone-rigging-2d-characters/)
- [Phaser spritesheet vs skeletal animation](https://charios.com/blog/phaser-spritesheet-vs-skeleton-2d)

**AI asset üretimi**

- [7 Best AI Sprite Generators in 2026 (Compared) — Sprixen](https://sprixen.com/blog/best-ai-sprite-generators-2026)
- [God Mode AI — AI Game Asset Tools](https://www.godmodeai.co/)
- [PixelLab — AI Generator for Pixel Art Game Assets](https://www.pixellab.ai/)
- [AI 2D Game Asset Generator: What Works in 2026 (Honest Guide)](https://www.summerengine.com/blog/ai-2d-game-asset-generator)
- [AI Game Asset Generation Guide — Spritesheets.ai](https://www.spritesheets.ai/blog/ai-game-asset-generation-guide)

**Pathfinding / izometrik**

- [Comparison of Flow Field and A-Star Algorithm for Pathfinding in Tower Defense Game](https://www.academia.edu/110008960/Comparison_of_Flow_Field_and_A_Star_Algorithm_for_Pathfinding_in_Tower_Defense_Game)
- [RTS Pathfinding 1 – Flowfields — jdxdev](https://www.jdxdev.com/blog/2020/05/03/flowfields/)
- [Variants of graph search — Amit Patel / Stanford](https://theory.stanford.edu/~amitp/GameProgramming/Variations.html)
- [Drawing isometric boxes in the correct order — Shaun LeBron](https://shaunlebron.github.io/IsometricBlocks/)
- [Isometric depth sorting — Mazebert](https://mazebert.com/forum/news/isometric-depth-sorting--id775/)

**Deployment**

- [Vercel free tier limits in 2026: what you actually get on Hobby](https://www.promptstoproduct.com/vercel-free-tier-limits)
- [Vercel Pricing Plans and Hidden Costs Explained (2026) — Schematic](https://schematichq.com/blog/vercel-pricing)
- [Vercel vs Fly.io (2026): Serverless vs Container Edge Hosting](https://www.buildmvpfast.com/compare/vercel-vs-fly-io)
- [Fly.io vs Vercel: Container Hosting vs Frontend Platform](https://www.13labs.au/compare/fly-io-vs-vercel)

**Tür / pazar / retention**

- [Best Tycoon Browser Games: 10 Picks for Idle Builders](https://dinogame.gg/blog/best-browser-tycoon-games/)
- [Idle Hotel Empire Tycoon — CrazyGames](https://www.crazygames.com/game/idle-hotel-empire-tycoon)
- [Mobile Game Retention Benchmarks 2026: Is Your D1 Above 27%? — Segwise](https://segwise.ai/blog/mobile-gaming-app-user-retention-strategies)
- [Rewarded Ad Benchmarks for 2026 — Playio](https://blog.playio.co/rewarded-ad-benchmarks-2026)
- [Sensor Tower & Homa Games: Arcade Idle downloads +2050%](https://gamedevreports.substack.com/p/sensor-tower-and-homa-games-arcade)
- [How To Increase Engagement and Monetization in Idle Games — Gamigion](https://www.gamigion.com/idle/)

**Anti-cheat**

- [Countering the ever-evolving scourge of cheating in games — i3D.net](https://www.i3d.net/countering-scourge-of-cheating-in-games/)
