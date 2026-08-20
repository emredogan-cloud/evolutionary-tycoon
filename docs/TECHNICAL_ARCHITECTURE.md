# TECHNICAL ARCHITECTURE — Evolutionary Tycoon

**Sürüm:** 1.0 · **Tarih:** 2026-08-14 · **Durum:** GATE 0 — onay bekliyor
**Kanıt tabanı:** [RESEARCH_NOTES.md](RESEARCH_NOTES.md) — buradaki her karar oraya referans verir.

---

## 1. Motor karşılaştırması ve nihai karar

### 1.1 Puanlama (0–5, ağırlıklı)

| Kriter                                         |  Ağırlık | **Phaser 4.2.1** | **PixiJS 8.19** | **Three.js 0.185** | **Custom WebGL2** |
| ---------------------------------------------- | -------: | ---------------: | --------------: | -----------------: | ----------------: |
| Tarayıcı performansı (2D)                      |        5 |                5 |               5 |                  3 |                 5 |
| 2D desteği                                     |        5 |                5 |               5 |                  2 |                 4 |
| İzometrik desteği                              |        4 |                3 |               3 |                  2 |                 4 |
| Animasyon sistemi                              |        4 |                4 |               2 |                  3 |                 1 |
| Partikül sistemi                               |        3 |                5 |               2 |                  2 |                 1 |
| Girdi (pointer/touch/klavye)                   |        4 |                5 |               2 |                  2 |                 1 |
| Kamera (pan/zoom/shake/bounds)                 |        4 |                5 |               1 |                  3 |                 1 |
| Asset yönetimi / loader                        |        4 |                5 |               4 |                  3 |                 1 |
| **AI ajan uyumluluğu** (doküman + örnek hacmi) |        5 |                5 |               4 |                  5 |                 1 |
| Ekosistem / eklenti                            |        3 |                5 |               4 |                  5 |                 0 |
| Bakılabilirlik                                 |        4 |                4 |               4 |                  3 |                 2 |
| Hata ayıklama                                  |        3 |                4 |               4 |                  4 |                 2 |
| Mobil tarayıcı desteği                         |        5 |                5 |               5 |                  3 |                 4 |
| Bundle boyutu                                  |        3 |                3 |               5 |                  2 |                 5 |
| Üretim olgunluğu                               |        5 |                5 |               5 |                  5 |                 1 |
| **Ağırlıklı toplam**                           | **/305** |       **⭐ 274** |             228 |                189 |               148 |

### 1.2 Seçim: **Phaser 4.2.1**

**Gerekçe — üç somut sebep:**

1. **Kapsam farkı, oyunun farklılaştırıcısı olmayan alanlarda.** PixiJS bir renderer'dır; Phaser bir framework. Pixi seçseydik sahne yönetimi, girdi, kamera, tween, partikül, ses ve loader'ı kendimiz yazacaktık — 4–6 haftalık iş, ve bu işlerin hiçbiri bu oyunu diğerlerinden ayırmıyor. O süre trafik simülasyonuna ve görsel yönüne harcanmalı.

2. **Phaser 4 tam olarak bizim ihtiyacımız olan yerde yenilendi.** WebGL2 RenderNode mimarisi, sprite başına 4 vertex (v3'te 6), daha az batch kırılması, otomatik context restore. v4.2 ile gelen **cone lights** far ışıkları ve tabela aydınlatması için doğrudan kullanılabilir; **stencil rendering** inşaat maskeleri ve drive-thru penceresi kesiti için; **Mesh2D** yol yüzeyi deformasyonu için.

3. **AI ajan uyumluluğu ölçülebilir bir kriter.** Bu proje büyük ölçüde bir AI ajan tarafından yazılacak. Phaser'ın doküman ve örnek hacmi, custom WebGL veya Pixi-üzerine-kendi-framework'ümüz seçeneğine göre hata oranını belirgin biçimde düşürür. Bu bir konfor tercihi değil, teslim riski yönetimi.

**Reddedilenler:**

- **PixiJS 8:** Teknik olarak mükemmel, ama bize renderer değil framework lazım. Bundle avantajı (150 KB vs 310 KB) kendi yazacağımız 4–6 haftalık kodun boyutuyla zaten kapanır.
- **Three.js:** 3D motoru. 2D izometrik için yanlış araç.
- **Custom WebGL2:** Öğretici olurdu, teslim edilemezdi.

**Bu kararı geri döndürme maliyeti:** Orta. Simülasyon çekirdeği motordan tamamen bağımsız olduğu için (§2), motor değişimi yalnızca `src/render/**` katmanını etkiler — tahmini 2–3 hafta. Bu, mimarinin bilinçli olarak satın aldığı bir sigorta.

### 1.3 WebGPU: kullanılmıyor

[RESEARCH_NOTES §5](RESEARCH_NOTES.md#5-motor-karşılaştırması--kanıt-tabanı): Phaser 4 bir WebGL2 yeniden yazımıdır, WebGPU motoru değil. Firefox WebGPU'yu hâlâ varsayılanda kapalı tutuyor. Ve bizim darboğazımız GPU fill-rate değil, CPU-taraflı simülasyon. WebGPU bugün kazanç değil risk.

---

## 2. En önemli mimari karar: motordan bağımsız deterministik simülasyon

Bu projede tek bir karar diğer her şeyi belirliyor:

> **Simülasyon, renderer'dan tamamen ayrı, saf TypeScript, deterministik ve headless çalışabilir olacak.**

### Neden bu kadar önemli

| Bu karar olmadan                                   | Bu kararla                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Oyun mantığı ancak tarayıcıda ve gözle test edilir | Vitest'te milisaniyeler içinde binlerce senaryo test edilir         |
| CI'da performans ölçülemez (SwiftShader)           | CI'da sim throughput'u ölçülür ve bütçe zorlanır                    |
| Ekran görüntüsü diff'i gürültülüdür, işe yaramaz   | Frozen clock + seed ile piksel-kesin diff                           |
| Ekonomi dengesi ancak elle oynanarak anlaşılır     | Balance simülatörü CI'da 12 saatlik oynanışı saniyeler içinde koşar |
| Bug raporu "bazen oluyor" olur                     | Seed + command log ile birebir tekrar üretilir                      |
| Motor değişimi = yeniden yazım                     | Motor değişimi = tek katman değişimi                                |
| "Gün tekrarı" özelliği imkânsız                    | Ücretsiz gelir                                                      |

Bu, [RESEARCH_NOTES §3](RESEARCH_NOTES.md#3-kritik-bulgu-2--cida-webgl-testi-güvenilmez)'teki CI bulgusunun doğrudan sonucu ve aynı zamanda bir gameplay özelliğinin (Day Replay) temeli. Tek bir mimari karar, dört farklı problemi aynı anda çözüyor.

---

## 3. Nihai teknoloji yığını

| Katman                | Seçim                              | Sürüm           | Gerekçe                                                                                                                                                                       |
| --------------------- | ---------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dil                   | TypeScript                         | **6.0.3**       | TS7 GA oldu ama typescript-eslint desteklemiyor ([RESEARCH_NOTES §2](RESEARCH_NOTES.md#2-kritik-bulgu-1--typescript-7-henüz-lintlenemiyor)). Tip-farkında lint pazarlık dışı. |
| Build                 | Vite                               | 8.2.1           | Hızlı HMR, ESM, Rollup üretim build'i, mükemmel Phaser/Svelte entegrasyonu                                                                                                    |
| Render motoru         | Phaser                             | 4.2.1           | §1                                                                                                                                                                            |
| UI                    | Svelte                             | 5.56.9          | Signal tabanlı, ~3 KB runtime, VDOM yok ([RESEARCH_NOTES §12](RESEARCH_NOTES.md#12-ui-framework-kararı))                                                                      |
| Svelte-Vite           | @sveltejs/vite-plugin-svelte       | 7.3.0           | peer `vite ^8` — birebir uyumlu                                                                                                                                               |
| Simülasyon            | Saf TypeScript                     | —               | Sıfır bağımlılık, sıfır motor importu                                                                                                                                         |
| Config doğrulama      | Zod                                | 4.4.3           | Yalnızca dev; production'da tree-shake                                                                                                                                        |
| Kalıcılık             | IndexedDB (`idb`)                  | 8.0.3           | Büyük save, async, localStorage fallback                                                                                                                                      |
| Ses                   | Phaser SoundManager                | (dahili)        | Ekstra bağımlılık gereksiz ([RESEARCH_NOTES §13](RESEARCH_NOTES.md#13-ses))                                                                                                   |
| Animasyon             | Kendi "Doll rig" sistemimiz        | —               | Spine ücretli, DragonBones ölü, AI kare animasyon üretemiyor ([RESEARCH_NOTES §6](RESEARCH_NOTES.md#6-animasyon-iskelet-animasyon-araçlarının-durumu))                        |
| Unit/integration test | Vitest                             | 4.1.10          |                                                                                                                                                                               |
| E2E / visual          | Playwright                         | 1.62.1          | Docker imajı pinlenir                                                                                                                                                         |
| Lint                  | ESLint + typescript-eslint         | 10.8.1 / 8.67.0 | Tip-farkında kurallar açık                                                                                                                                                    |
| Format                | Prettier                           | 3.9.6           |                                                                                                                                                                               |
| Mimari zorlama        | dependency-cruiser                 | 18.2.0          | Katman ihlallerini CI'da kırar                                                                                                                                                |
| Ölü kod               | knip                               | 6.32.2          |                                                                                                                                                                               |
| Atlas                 | free-tex-packer-core + sharp       | 0.3.9 / 0.35.3  | Açık kaynak, lisans yok                                                                                                                                                       |
| PWA                   | vite-plugin-pwa                    | 1.3.0           | Faz 14+                                                                                                                                                                       |
| Paket yöneticisi      | pnpm                               | 10.33.4         | Disk verimli, katı node_modules                                                                                                                                               |
| Node                  | 24.x LTS                           | 24.13.1         | CI ve yerelde aynı                                                                                                                                                            |
| CI                    | GitHub Actions                     | —               |                                                                                                                                                                               |
| Hosting               | Vercel (statik)                    | —               | [RESEARCH_NOTES §9](RESEARCH_NOTES.md#9-deployment-vercel-vs-flyio)                                                                                                           |
| Analitik              | @vercel/analytics + speed-insights | 2.0.1 / 2.0.0   | Cookieless                                                                                                                                                                    |
| Hata                  | Hafif beacon → (Faz 21) Sentry     | 10.70.0         | Env ile açılır                                                                                                                                                                |

**MVP'de backend YOK.** Supabase/PostgreSQL değerlendirildi ve **reddedildi**: MVP tek oyunculu, hesap yok, liderlik tablosu yok. Backend eklemek, bakımı, maliyeti, gecikmesi ve güvenlik yüzeyi olan bir sistemi hiçbir oyuncu değeri karşılığında eklemek olurdu. Tek istisna: **tek bir statik `/api/time` endpoint'i** (Vercel Function, 5 satır) — offline ödül doğrulaması için sunucu zamanı referansı.

Cloud save Faz 19'da yeniden değerlendirilir; tetikleyici, gerçek kullanıcılardan gelen cihazlar-arası talep olacaktır, varsayım değil.

---

## 4. Mimari diyagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              BROWSER TAB                                 │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                        src/app  (composition root)                 │  │
│  │   bootstrap · DI container · GameLoop · bridge · feature flags     │  │
│  └───────┬──────────────────────┬───────────────────────┬─────────────┘  │
│          │                      │                       │                │
│          ▼                      ▼                       ▼                │
│  ┌───────────────┐    ┌──────────────────┐    ┌──────────────────────┐   │
│  │   src/sim     │    │   src/render     │    │      src/ui          │   │
│  │  PURE TS      │    │  Phaser 4        │    │   Svelte 5           │   │
│  │  ─────────    │    │  ──────────      │    │   ────────           │   │
│  │  Clock        │    │  Scenes          │    │   HUD                │   │
│  │  Rng streams  │    │  IsoProjection   │    │   Build/Upgrade      │   │
│  │  World state  │◄───┤  DepthSorter     │    │   Staff              │   │
│  │  Systems:     │read│  ActorViews      │    │   Analytics panel    │   │
│  │   traffic     │only│  DollRigRuntime  │    │   Offline report     │   │
│  │   customers   │    │  ParticleFX      │    │   Settings           │   │
│  │   kitchen     │    │  Camera          │    │   Notifications      │   │
│  │   employees   │    │  AudioDirector   │    │                      │   │
│  │   economy     │    │  Lighting        │    │   (real DOM →        │   │
│  │   navigation  │    │                  │    │    a11y + E2E)       │   │
│  │   satisfaction│    └────────▲─────────┘    └──────────▲───────────┘   │
│  │   evolution   │             │                         │               │
│  │  ─────────    │             │  SimEvent[]             │ ViewModel     │
│  │  CommandLog   │             │  (typed, batched)       │ (signals)     │
│  │  EventBus     ├─────────────┴─────────────────────────┘               │
│  └───────┬───────┘                                                       │
│          │ Command[]  (player actions, only entry point into sim)        │
│          │                                                               │
│  ┌───────▼─────────────────────────────────────────────────────────────┐ │
│  │  src/persistence   SaveManager · migrations · IndexedDB · checksum  │ │
│  └───────┬─────────────────────────────────────────────────────────────┘ │
│          │                                                               │
│  ┌───────▼─────────────────────────────────────────────────────────────┐ │
│  │  src/config   economy · traffic · upgrades · archetypes (data only) │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │ HTTPS
        ┌──────────────▼──────────────┐
        │        Vercel (static)      │
        │  CDN · immutable assets     │
        │  /health.json               │
        │  /api/time  (5-line fn)     │
        └─────────────────────────────┘
```

**Tek yönlü veri akışı:**

```
Oyuncu girdisi → Command → CommandLog → Sim.tick() → SimEvent[] → { RenderBridge, UiBridge, AudioDirector }
```

UI ve render **asla** sim state'ini doğrudan mutasyona uğratmaz. Sim'e giden tek kapı `Command`'dır.

---

## 5. Simülasyon çekirdeği

### 5.1 Sabit adımlı döngü

```ts
const TICK_MS = 50; // 20 Hz
const MAX_CATCHUP_TICKS = 8; // spiral-of-death koruması

function frame(realNowMs: number): void {
  accumulator += Math.min(realNowMs - lastFrame, 250);
  let ticks = 0;
  while (accumulator >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
    sim.tick(TICK_MS); // deterministik, saf
    accumulator -= TICK_MS;
    ticks++;
  }
  const alpha = accumulator / TICK_MS;
  renderer.draw(sim.readView(), alpha); // pozisyonlar interpolate edilir
}
```

Sim 20 Hz'de sabit, render ekranın yenileme hızında. Bu, 30/60/144 Hz ekranlarda ve throttle edilmiş sekmelerde **birebir aynı** simülasyon davranışını garanti eder.

**Hızlandırma:** `speedMultiplier ∈ {1, 2, 4}` tick sayısını çarpar, `TICK_MS`'i değil. Determinizm korunur.

### 5.2 Deterministik rastgelelik

```ts
// sfc32 — 128-bit state, hızlı, serileştirilebilir, kaliteli dağılım
class Rng {
  constructor(seed: RngState) {}
  next(): number; // [0,1)
  int(maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  saveState(): RngState; // save dosyasına yazılır
}
```

**Stream ayrımı — kritik:** Her sistem kendi bağımsız stream'ine sahiptir.

```
rng.traffic       araç spawn, arketip seçimi
rng.conversion    dönüşüm testleri
rng.customer      sipariş seçimi, sabır varyansı
rng.tips          bahşiş yuvarlaması
rng.events        olaylar, hava
rng.cosmetic      görsel varyasyon (karakter parçaları, araç rengi) — sim sonucunu ETKİLEMEZ
```

**Neden ayrı:** Tek bir global stream olsaydı, yeni bir sisteme bir `rng.next()` çağrısı eklemek diğer tüm sistemlerin sonuçlarını kaydırırdı — tüm testler ve tüm golden görüntüler kırılırdı. Stream ayrımı, sistemleri birbirinden yalıtır.

`rng.cosmetic` ayrıca simülasyon sonucunu etkilemediği için, görsel varyasyon eklemek hiçbir zaman balance testlerini kırmaz.

### 5.3 Saat

```ts
interface Clock {
  readonly simTimeMs: number; // tick'lerden birikir
  readonly gameDay: number;
  readonly gameHour: number; // 0..24 (float)
}
```

`Date.now()` yalnızca `src/app` ve `src/persistence` içinde kullanılır (offline hesabı ve save timestamp'i). `src/sim` içinde ESLint tarafından **yasaklıdır**.

### 5.4 Entity ve depolama

ECS kütüphanesi kullanılmıyor. Gereksiz soyutlama. Bunun yerine:

```ts
// Sıcak, çok sayıda, homojen → SoA (Structure of Arrays), typed arrays
class VehicleStore {
  laneS: Float32Array; // şerit üzerindeki arc-length pozisyonu
  speed: Float32Array;
  state: Uint8Array;
  archetype: Uint8Array;
  // ... capacity ile önceden tahsis, serbest liste ile geri dönüşüm
}

// Az sayıda, heterojen, karmaşık → düz nesne + havuz
class CustomerStore {
  items: Customer[];
  free: number[];
}
class EmployeeStore {
  items: Employee[];
}
```

**Karar gerekçesi:** ECS kütüphanesi (bitECS vb.) bir bağımlılık, bir öğrenme eğrisi ve bir soyutlama katmanı ekler. Bizim entity sayımız (≤300) ve arketip çeşitliliğimiz bunu haklı çıkarmıyor. Typed array'ler sadece gerçekten sıcak olan yerde (araçlar) kullanılır; ölçüm bunu gerektirdiğinde genişletilir, önceden değil.

### 5.5 Sistem sırası (her tick'te sabit)

```
 1. TimeSystem            gün/saat ilerlet, gün dönüşü olaylarını yay
 2. EventSystem           hava, olaylar, trafik modifikasyonları
 3. TrafficSpawnSystem    deterministik Poisson spawn
 4. VehicleMotionSystem   IDM araç-takip, şerit ilerleme
 5. ConversionSystem      karar noktasındaki araçlar için P(convert)
 6. VehicleManeuverSystem giriş/park/drive-thru/çıkış spline'ları
 7. NavigationSystem      flow field lookup + steering (yayalar)
 8. CustomerFsmSystem     müşteri durum makineleri
 9. QueueSystem           kuyruklar, kapasite, taşma
10. TaskBoardSystem       görev üret + puanla + ata
11. EmployeeFsmSystem     çalışan durum makineleri
12. KitchenSystem         istasyon rezervasyonu, hazırlık, pass
13. ServiceSystem         teslim, yeme, ödeme
14. SatisfactionSystem    memnuniyet hesabı, bahşiş, itibar
15. EconomySystem         gelir/gider birikimi, maaş tahakkuku
16. CleanlinessSystem     kirlilik birikimi ve azalması
17. ProgressionSystem     hedefler, kilometre taşları, evrim koşulları
18. EventFlushSystem      biriken SimEvent'leri yay
```

Sıra **sabittir ve dokümante edilmiştir**. Sıra değişikliği bir mimari değişikliktir ve onay gerektirir (davranışı değiştirir).

### 5.6 Command log

```ts
type Command =
  | { t: 'BUY_UPGRADE';  tick: number; upgradeId: string }
  | { t: 'HIRE';         tick: number; role: Role }
  | { t: 'FIRE';         tick: number; employeeId: number }
  | { t: 'SET_PRICE';    tick: number; itemId: string; price: number }
  | { t: 'PLACE';        tick: number; objectId: string; x: number; y: number }
  | { t: 'MANUAL_PREP';  tick: number; stationId: number }
  | { t: 'EVOLVE';       tick: number }
  | { t: 'SET_SPEED';    tick: number; mult: 1 | 2 | 4 }
  ...
```

Oyuncunun sim'e etki eden **her** eylemi bir command'dır ve tick numarasıyla loglanır.

**Bugün ne veriyor:** deterministik E2E, birebir tekrar üretilebilir bug raporları, "Day Replay" özelliği, balance simülatörü için oynanış politikaları.
**Yarın ne verecek:** liderlik tablosu eklenirse sunucu tarafı doğrulama — mimariyi değiştirmeden.

Log sınırlı tutulur (son 5.000 command halka tamponunda); tam log yalnızca dev modda ve teşhis dışa aktarımında.

### 5.7 Event bus

```ts
type SimEvent =
  | { t: 'VEHICLE_SPAWNED';    id: number; archetype: number }
  | { t: 'CONVERSION_FAILED';  id: number; reason: ConversionReason }  // Analiz paneli
  | { t: 'CUSTOMER_ARRIVED';   id: number; channel: Channel }
  | { t: 'ORDER_PLACED';       orderId: number; items: string[] }
  | { t: 'FOOD_READY';         orderId: number }
  | { t: 'PAYMENT';            amount: number; tip: number; satisfaction: number }
  | { t: 'CUSTOMER_LEFT_ANGRY';id: number; reason: AbandonReason }
  | { t: 'UPGRADE_APPLIED';    upgradeId: string }
  | { t: 'STAGE_EVOLVED';      from: number; to: number }
  | { t: 'BOTTLENECK';         kind: BottleneckKind }
  ...
```

Tick sonunda toplu olarak yayılır (per-event callback değil — allocation ve sıralama kontrolü için). Render, UI, ses ve analitik bağımsız abone olur.

---

## 6. Render katmanı

### 6.1 İzometrik projeksiyon

2:1 dimetrik ("klasik izometrik").

```ts
const TILE_W = 64,
  TILE_H = 32,
  TILE_Z = 32; // 1× ölçekte; sanat 2× üretilir

screenX = (worldX - worldY) * (TILE_W / 2);
screenY = (worldX + worldY) * (TILE_H / 2) - worldZ * TILE_Z;
```

**Dünya birimi = 1 metre.** Bir araç ~4.5×1.9 m, bir masa 1.2×1.2 m, bir insan 0.5 m çapında. Bu, trafik modelinin (IDM metre/saniye ile çalışır) doğrudan kullanılabilmesini sağlar — birim dönüşümü hatası riski sıfır.

Yaya navigasyon grid'i 0.5 m çözünürlükte (dünya birimi/2).

### 6.2 Derinlik sıralama

```ts
depth = (worldX + worldY) * DEPTH_SCALE + worldZ * Z_WEIGHT + stableTieBreak(entityId);
```

Painter's algorithm, ayak izi (footprint) anchor'ı. Topolojik sıralama **kullanılmıyor** — O(n²) riski var ve gerekmiyor ([RESEARCH_NOTES §11](RESEARCH_NOTES.md#11-i̇zometrik-derinlik-sıralama-teknikleri)).

**Döngü önleme bir asset kuralıdır, bir algoritma değil:** Uzun nesneler (duvar, tabela direği, ağaç) yazım sözleşmesi gereği alt/üst parçalara bölünür. Doğrulama scripti, bir sprite'ın yüksekliği eşiği aşarsa ve `_split` işareti taşımıyorsa build'i kırar. Bu, gerçek döngülerin oluşmasını en baştan engeller.

### 6.3 Render katmanları

| #   | Katman                                       | Teknik                                     | Sıralama                         |
| --- | -------------------------------------------- | ------------------------------------------ | -------------------------------- |
| 0   | Gökyüzü / parallax                           | `SpriteGPULayer` (scrollFactor varyantlı)  | Yok                              |
| 1   | Zemin bake                                   | 2–6 büyük statik sprite                    | Sabit                            |
| 2   | Yol yüzeyi + çizgiler                        | Statik sprite / Mesh2D                     | Sabit                            |
| 3   | Statik dekor saçılımı                        | `SpriteGPULayer`                           | Yok (aktör düzleminin arkasında) |
| 4   | **Aktör katmanı**                            | Phaser Container, per-frame depth          | **Depth sort**                   |
| 5   | Üst FX (buhar, duman, toz)                   | Partikül emitter                           | Sahibinin depth'i                |
| 6   | Aydınlatma                                   | Phaser lights (cone) + tam ekran tint quad | —                                |
| 7   | Dünya-uzayı UI (balon, sikke, sabır halkası) | Container                                  | Sahibinin depth'i                |
| 8   | DOM overlay                                  | Svelte                                     | CSS z-index                      |

**Kritik kısıt:** `SpriteGPULayer` derinlik sıralanamaz ve üye değiştirmek pahalıdır; `TilemapGPULayer` yalnızca ortografiktir ([RESEARCH_NOTES §4](RESEARCH_NOTES.md#4-kritik-bulgu-3--phaser-4ün-hızlı-yolları-isometrik-aktörler-için-kullanılamaz)). Bu yüzden zemin bir tilemap değil, elle kompoze edilmiş bake'lerdir ve aktörler asla GPU layer'a girmez.

### 6.4 Doll rig — animasyon runtime'ı

```ts
interface DollRig {
  parts: RigPart[]; // { atlasFrame, parentIndex, pivot, defaultTransform }
  clips: Record<string, Clip>; // keyframe kanalları: x, y, rot, scaleX, scaleY, alpha, frame
}
interface Clip {
  durationMs: number;
  loop: boolean;
  channels: Channel[];
}
```

- Karakter = 6–10 parça (gövde, kafa, saç/şapka, kol×2, bacak×2, taşınan nesne).
- 4 izometrik yön üretilir, ayna ile 8'e çıkar.
- Yürüyüş klibi **prosedürel** (sinüs tabanlı) — tek kod, tüm karakterler.
- İş klipleri (~12 adet) elle yazılmış keyframe JSON.
- Görsel çeşitlilik parça takasıyla: 8 gövde × 10 kafa × 6 saç × 5 renk = 2.400 görünür farklı müşteri, ~30 sprite'lık bir atlastan.

Runtime saf matematiktir ve **unit test edilir** (verilen klip + t → beklenen transform). Phaser sadece sonucu çizer.

### 6.5 Görsel determinizm (test için)

URL parametreleri: `?seed=<n>&freezeAt=<tick>&noParticles=1&fixedViewport=1&hideHud=1`
Bu mod aktifken: RNG sabit, saat donmuş, partikül kapalı, kamera sabit, DOM overlay gizlenebilir. Golden ekran görüntüleri bu modda alınır. Bu, WebGL canvas'ın visual regression'a tabi tutulabilmesinin **tek** yolu.

---

## 7. UI katmanı

```
src/ui/
├── stores/          Svelte 5 runes — sim event'lerinden beslenen ViewModel'ler
├── components/      HUD, kartlar, paneller, bildirimler
├── screens/         Build, Staff, Analytics, Offline, Settings
├── theme/           tokens.css (renk, tipografi, aralık, motion)
└── a11y/            focus trap, live region, reduced-motion
```

**Katı kural:** `src/ui/**` → `src/sim/**` importu **yasaktır** (dependency-cruiser zorlar). Veri yalnızca `src/app/bridge/` üzerinden gelir:

```ts
// bridge, sim event'lerini ViewModel'e çevirir ve 10 Hz'de throttle eder
class UiBridge {
  cash = $state(0);
  incomePerMin = $state(0);
  reputation = $state(0);
  notifications = $state<Notification[]>([]);
  // ...
}
```

UI hiçbir zaman per-frame çalışmaz. HUD 10 Hz'de güncellenir; animasyonlu sayı geçişleri CSS ile yapılır. Bu, UI'ın oyunun frame bütçesini yemesini yapısal olarak engeller.

**Canvas ve DOM katman düzeni:** Canvas `position: fixed; inset: 0`, DOM overlay üstünde `pointer-events: none`, etkileşimli öğelerde `pointer-events: auto`. Tıklama boşluklarında olay canvas'a geçer.

---

## 8. Veri modeli ve kalıcılık

### 8.1 Save şeması

v1 şeması, Faz 2'de implemente edildiği hâliyle (`src/persistence/schema.ts`, Zod ile doğrulanır):

```ts
interface SaveFileV1 {
  schemaVersion: 1; // migration zinciri anahtarı
  buildSha: string; // teşhis
  createdAt: number; // epoch ms — ilk kayıtta sabitlenir, sonraki kayıtlarda korunur
  lastSeenAt: number; // offline hesabı için
  lastSeenServerAt: number | null; // sunucu zaman referansı
  playtimeMs: number; // SİMÜLASYON zamanı (açık bırakılan sekme oynanmış sayılmaz)

  tick: number; // devam edilecek tick
  nextEntityId: number; // entity kimlik sayacı; geri sarılmaz
  clock: { simTimeMs: number }; // gameDay/gameHour bundan türetilir, ayrıca saklanmaz
  rng: Record<RngStreamName, RngState>; // altı stream de — cosmetic dahil
  control: { speedMultiplier: 1 | 2 | 4; paused: boolean };

  progression: { stage: 1 | 2 | 3 | 4; unlocks: string[]; milestones: string[] };
  economy: {
    cash: number;
    reputation: number;
    lifetimeRevenue: number;
    prices: [string, number][];
  }; // anahtara göre SIRALI
  layout: { placed: PlacedObject[]; upgrades: [string, number][] }; // upgradeId → level
  staff: { hired: { entityId: number; roleId: string }[] };
  stats: { customersServed: number; vehiclesSpawned: number; commandsApplied: number };
  settings: { audio: AudioSettings; a11y: A11ySettings };

  checksum: string; // CRC-32 — bozulma tespiti (güvenlik DEĞİL)
}
```

**Uygulamada netleşen üç ayrıntı:**

- **`Map` yerine sıralı çift dizisi.** JSON'da map tipi yok. Anahtara göre sıralamak, aynı içeriğe
  farklı yollardan ulaşmış iki kaydın aynı baytları — dolayısıyla aynı checksum'ı — üretmesini sağlar.
- **`cosmetic` stream'i kaydedilir ama hash'lenmez.** Hash'ten dışlanma sebebi "simülasyon sonucunu
  etkilemiyor" olması; kaydedilme sebebi ise görsel çeşitliliğin yeniden yükleyince değişmemesi.
- **`objectives`/`archetypesSeen` v1'de yok.** İlgili sistemler henüz yok; alanı boş taşımak yerine
  migration zinciriyle eklenecekler (Faz 11 ve Faz 6).

**v9 (Faz 14) — offline zarfı.** Envelope'a `offline: { meter, pending }` eklendi. `meter`,
kayıt anında canlı dünyadan okunan **beş dakikalık ölçüm özeti**dir (müşteri/dk, ortalama sepet,
ortalama malzeme maliyeti, geri dönen/dk, beş kaynağın doluluk örneklemesi) — ECONOMY_DESIGN §10'un
"son 5 dakikanın ölçülen değeri" dediği şeyin somut hâli. `pending`, fiyatlanmış ama toplanmamış
"Uzaktayken" raporudur; pencere fiyatlandığı anda tüketilir (lastSeen ileri yazılır) ve rapor
toplanana kadar her kayıtta taşınır — aynı pencere iki kez ödenemez. Sayaç penceresinin kendisi
(`world.offline`) **hash'lenmez ve snapshot'a girmez**: hiçbir sistem onu okuyarak karar vermez;
simülasyona tek girişi, açık tutarları taşıyan ve loglanan `COLLECT_OFFLINE` komutudur. Dışlama,
cosmetic stream'inkiyle aynı biçimde test altındadır.

**Transient state kaydedilmez.** Yoldaki araçlar, yarım siparişler, yürüyen müşteriler — hepsi yeniden başlangıçta temiz olarak oluşturulur. Save yalnızca **kalıcı** durumu tutar. Bu, save boyutunu ~15 KB'ta tutar ve migration'ları basitleştirir.

### 8.2 Kalıcılık stratejisi

|                  |                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Birincil         | IndexedDB (`idb` 8.0.3), DB `evotycoon`, store `saves`                                                 |
| Fallback         | localStorage (IndexedDB engelliyse — private mode vb.)                                                 |
| Otomatik kayıt   | 30 saniyede bir + önemli olaylarda (yükseltme, evrim) + `visibilitychange` (hidden) + `pagehide`       |
| Yedek            | Son 3 kayıt rotasyonlu (`save`, `save.bak1`, `save.bak2`)                                              |
| Bozulma          | Checksum tutmuyorsa → bir sonraki yedeğe düş → hepsi bozuksa kullanıcıya sor (yeni oyun / dosya yükle) |
| Dışa/içe aktarma | JSON dosyası indir/yükle — cloud save olmadan cihaz değiştirme yolu                                    |

### 8.3 Migration

```ts
const migrations: Migration[] = [
  { from: 1, to: 2, up: (s) => ({ ...s, staff: { employees: [] }, schemaVersion: 2 }) },
  // ...
];
```

Zincirleme uygulanır. **Kural:** Her migration için bir test fixture'ı (`tests/fixtures/save-v<N>.json`) commit edilir ve `v1 → current` zinciri her CI koşusunda test edilir. Bu, WORKING_DISCIPLINE kural 13'ün (geriye dönük uyumluluk) makine tarafından zorlanmış hâli.

Migration geri alınamıyorsa (yıkıcı değişiklik): migration öncesi save `save.premigration` olarak saklanır.

---

## 9. Güvenlik

Tehdit modeli ve orantılılık gerekçesi: [GAME_DESIGN_DOCUMENT §18](GAME_DESIGN_DOCUMENT.md#18-güven-ve-anti-cheat--orantılı-strateji).

| Alan                | Önlem                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSP                 | Katı: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' <analytics>; frame-ancestors 'none'` |
| Diğer başlıklar     | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (kamera/mikrofon/geolocation kapalı)                    |
| Bağımlılık          | `pnpm audit` + Dependabot + CodeQL, CI'da; high/critical build'i kırar                                                                                              |
| Secret              | Yalnızca Vercel env; `VITE_` ön ekli her şey **public** kabul edilir; ön-commit secret taraması                                                                     |
| Save bütünlüğü      | CRC32 + yedek rotasyonu (bozulmaya karşı, hileye karşı değil)                                                                                                       |
| Offline suistimal   | Sunucu zaman referansı + 8 saat tavan + monotoniklik (§10)                                                                                                          |
| XSS                 | Svelte varsayılan escaping; `{@html}` kullanımı yasak (ESLint)                                                                                                      |
| Üçüncü taraf script | Yok. Analitik `@vercel/analytics` (first-party proxy) üzerinden.                                                                                                    |

**Bilinçli olarak yapılmayanlar:** Kod obfuscation, anti-debug, save şifreleme, bellek bütünlüğü kontrolü. Tek oyunculu bir oyunda bunlar oyuncuya karşı düşmanlık, güvenlik değil.

---

## 10. `/api/time` — tek backend parçası

```ts
// api/time.ts — Vercel Function (Node.js runtime)
export function GET() {
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' }, // Date header'ı platform ekler
  });
}
```

İstemci `Date` response header'ını okur. Kullanım:

- Sapma ≤ 5 dk → yerel saat kullanılır
- Sapma > 5 dk → sunucu saati kazanır
- İstek başarısız → yalnızca yerel monotonik sayaç, offline kazanç `CAP/2` ile sınırlanır

Bu, tüm backend'imiz. Beş satır.

---

## 11. Performans bütçeleri

### 11.1 Runtime

| Metrik                | Masaüstü hedef              | Mobil hedef | Nasıl ölçülür            |
| --------------------- | --------------------------- | ----------- | ------------------------ |
| FPS (p50)             | ≥ 60                        | ≥ 45        | Gerçek cihaz, `?bench=1` |
| FPS (p05, en kötü %5) | ≥ 50                        | ≥ 30        | Aynı                     |
| Frame time (p95)      | ≤ 16.6 ms                   | ≤ 22 ms     | Aynı                     |
| **Sim tick süresi**   | ≤ 2.0 ms                    | ≤ 3.5 ms    | **CI'da headless**       |
| Render süresi         | ≤ 8 ms                      | ≤ 12 ms     | Gerçek cihaz             |
| Sıcak döngüde tahsis  | **0 B/tick** (steady state) | aynı        | **CI'da**                |
| Draw call             | ≤ 60                        | ≤ 45        | Spector.js / manuel      |
| JS heap (30 dk sonra) | ≤ 220 MB                    | ≤ 140 MB    | DevTools                 |
| Texture memory        | ≤ 192 MB                    | ≤ 96 MB     | Atlas hesabı             |
| Bellek sızıntısı      | 30 dk'da < %5 artış         | aynı        | Manuel + heap snapshot   |

### 11.2 Entity kapasitesi (bütçe içinde kalması gereken)

|                          | Masaüstü | Mobil (degrade) |
| ------------------------ | -------: | --------------: |
| Aynı anda araç           |      120 |              60 |
| Aynı anda yaya           |       60 |              30 |
| Dinamik prop             |       80 |              40 |
| Aktif partikül           |      400 |             150 |
| Toplam depth-sort edilen |      260 |             130 |

### 11.3 Yükleme

| Metrik                             | Bütçe                               | CI'da zorlanır |
| ---------------------------------- | ----------------------------------- | -------------- |
| İlk JS bundle (gzip)               | ≤ 550 KB                            | ✅             |
| — Phaser custom build              | ≤ 320 KB                            | ✅             |
| — Svelte + UI                      | ≤ 60 KB                             | ✅             |
| — App + sim + config               | ≤ 170 KB                            | ✅             |
| Kritik yol asset (ilk oynanabilir) | ≤ 4 MB                              | ✅             |
| Aşama 1 toplam asset               | ≤ 8 MB                              | ✅             |
| Tüm aşamalar toplam                | ≤ 28 MB                             | ✅             |
| TTI (hızlı 4G, orta laptop)        | ≤ 4 s                               | manuel         |
| TTI (yavaş 4G, orta telefon)       | ≤ 9 s                               | manuel         |
| İlk oynanabilir kareye             | ≤ 6 s soğuk, ≤ 2 s sıcak (SW cache) | manuel         |

**Bant genişliği notu:** Vercel Hobby 100 GB/ay. 8 MB × 12.500 soğuk ziyaret = tavan. Bu yüzden asset bütçesi sadece performans değil **maliyet** kısıtı ([RESEARCH_NOTES §9](RESEARCH_NOTES.md#9-deployment-vercel-vs-flyio)).

### 11.4 Degradasyon kademeleri

Boot'ta cihaz yeteneği ölçülür (GPU string, `deviceMemory`, `hardwareConcurrency`, ilk 60 karenin frame time'ı) ve kademe seçilir. Oyuncu ayarlardan elle değiştirebilir.

| Kademe     | Partikül | Gölge      | Aydınlatma            | Entity cap | Çözünürlük | Hedef FPS |
| ---------- | -------- | ---------- | --------------------- | ---------- | ---------- | --------- |
| **Ultra**  | %100     | Yumuşak    | Tam (cone lights)     | %100       | DPR ≤2     | 60        |
| **High**   | %70      | Yumuşak    | Tam                   | %85        | DPR ≤2     | 60        |
| **Medium** | %40      | Basit blob | Basitleştirilmiş      | %60        | DPR ≤1.5   | 60        |
| **Low**    | %15      | Yok        | Yalnızca ambient tint | %40        | DPR 1      | 30        |

**Otomatik düşürme:** 5 saniye boyunca p05 FPS hedefin %70'inin altındaysa bir kademe düşülür ve oyuncuya diskret bir bildirim gösterilir. Otomatik yükseltme yapılmaz (salınım önleme).

---

## 12. Tarayıcı uyumluluk matrisi

| Tarayıcı                | Min sürüm | Kademe | Test                                | Not                                                      |
| ----------------------- | --------- | ------ | ----------------------------------- | -------------------------------------------------------- |
| Chrome / Edge (desktop) | 120       | A      | E2E + visual + perf                 | Birincil geliştirme hedefi                               |
| Firefox (desktop)       | 128       | A      | E2E (xvfb)                          | Visual regression yok                                    |
| Safari (macOS)          | 17        | A      | Smoke (manuel + WebKit headless)    | Canvas screenshot alınamıyor                             |
| Chrome Android          | 120       | A/B    | Manuel gerçek cihaz + emülasyon E2E |                                                          |
| Safari iOS              | 17        | A/B    | Manuel gerçek cihaz                 | Ses unlock, safe-area, bellek dikkat                     |
| Samsung Internet        | 24        | B      | Manuel                              |                                                          |
| Firefox Android         | 128       | B      | Manuel                              |                                                          |
| **WebGL2 yok**          | —         | **C**  | —                                   | Nazik "desteklenmiyor" ekranı + sebep + tarayıcı önerisi |

**Kademe C zorunlu, çünkü Phaser 4'te Canvas renderer deprecated.** WebGL2 olmadan oyun çalışmaz; siyah ekran yerine açıklayıcı bir sayfa gösterilir.

**Bilinen tarayıcı riskleri ve karşılıkları:**

| Risk                                     | Karşılık                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| iOS Safari bellek baskısı → sekme kill   | Texture bütçesi mobilde 96 MB, agresif atlas boşaltma, düşük DPR                      |
| iOS ses unlock                           | İlk kullanıcı etkileşiminde AudioContext resume (Phaser yapar), ayrıca elle doğrulama |
| Firefox WebGL context loss               | Phaser 4 otomatik restore; ek olarak restore sonrası state doğrulaması                |
| Safari `visibilitychange` davranış farkı | Offline hesabı `pagehide` + `visibilitychange` ikilisiyle                             |
| Mobil safe-area (notch)                  | `env(safe-area-inset-*)` tüm HUD kenarlarında                                         |

---

## 13. Deployment mimarisi

```
git push (feature branch)
   └─► GitHub Actions CI  ──► lint · typecheck · unit · build · e2e · visual · budget
   └─► Vercel Preview Deployment  ──► https://evotycoon-<hash>.vercel.app
          └─► E2E preview URL'ine karşı tekrar koşar  (gerçek CDN, gerçek başlıklar)
          └─► /health.json doğrulanır

PR merge → main
   └─► Vercel Production  ──► https://<domain>
          └─► Smoke test + /health.json + Lighthouse
          └─► Başarısızsa: instant rollback (önceki deployment'a promote)
```

**Vercel konfigürasyonu** (`vercel.ts`, `@vercel/config` ile):

- `/assets/**` → `Cache-Control: public, max-age=31536000, immutable` (içerik hash'li dosya adları)
- `/index.html` → `no-cache`
- `/health.json` → `no-cache`
- Güvenlik başlıkları (§9)
- SPA rewrite

**`/health.json`:**

```json
{
  "version": "0.5.0",
  "buildSha": "abc1234",
  "builtAt": "2026-08-14T20:00:00Z",
  "assetManifestHash": "9f3c...",
  "schemaVersion": 3
}
```

Her E2E koşusu bunu doğrular. Deploy'un gerçekten yeni kodu sunduğunun kanıtı.

**Rollback:** Vercel'de önceki production deployment'ı promote etmek anlıktır. Her fazın rollback planı buna dayanır.

**Ortam değişkenleri:**

| Değişken                | Ortam       | Amaç                                   |
| ----------------------- | ----------- | -------------------------------------- |
| `VITE_APP_VERSION`      | tümü        | build'de enjekte                       |
| `VITE_BUILD_SHA`        | tümü        | build'de enjekte                       |
| `VITE_ASSET_BASE_URL`   | tümü        | asset CDN çıkış yolu (varsayılan: `/`) |
| `VITE_ENABLE_ANALYTICS` | prod        | analitik açık/kapalı                   |
| `VITE_SENTRY_DSN`       | prod (ops.) | boşsa Sentry hiç yüklenmez             |
| `VITE_DEBUG_PANEL`      | preview     | dev overlay                            |
| `VITE_TIME_ENDPOINT`    | tümü        | varsayılan `/api/time`                 |

`VITE_ASSET_BASE_URL`'in **baştan** var olması, bant genişliği sorunu çıkarsa asset'leri başka bir CDN'e taşımayı tek satırlık bir değişikliğe indirger.

---

## 14. Proje yapısı

```
evolutionary-tycoon/
├── .github/workflows/        ci.yml · preview-e2e.yml · production-smoke.yml · codeql.yml
├── docs/                     7 ana doküman + RESEARCH_NOTES + PERF_LOG + DECISIONS/ + phases/
├── public/                   index.html · health.json (build'de üretilir) · icons
├── assets/
│   ├── source/               AI çıktısı ham dosyalar (git-lfs değerlendirilecek)
│   ├── processed/            işlenmiş PNG'ler (build girdisi)
│   └── _placeholder/         geçici asset'ler — PLACEHOLDER_REGISTER'da kayıtlı
├── src/
│   ├── app/                  bootstrap · GameLoop · DI · bridge/ · flags
│   ├── sim/                  ⚠ saf TS — Phaser/Svelte/DOM YASAK
│   │   ├── core/             Clock · Rng · CommandLog · EventBus · World
│   │   ├── stores/           VehicleStore · CustomerStore · EmployeeStore · OrderStore
│   │   ├── systems/          §5.5'teki 18 sistem
│   │   ├── ai/               fsm/ · taskboard/ · steering/
│   │   ├── nav/              grid · flowField · aStar · laneGraph · maneuvers
│   │   └── math/             vec2 · spline · easing · idm
│   ├── render/               Phaser sahneleri, iso projeksiyon, depth sort, rig runtime, FX, audio
│   ├── ui/                   Svelte
│   ├── config/               ⚠ veri + tip; hiçbir şey import etmez (zod hariç)
│   ├── persistence/          SaveManager · migrations · idb adapter
│   └── platform/             capability detect · storage · time sync · analytics
├── tools/
│   ├── asset-pipeline/       atlas build · doğrulama · optimize · manifest
│   ├── balance-sim/          headless ekonomi simülatörü (CI kapısı)
│   └── bench/                headless sim benchmark
├── tests/
│   ├── unit/  integration/  e2e/  visual/  perf/  fixtures/
├── api/time.ts               tek Vercel Function
├── vercel.ts · vite.config.ts · vitest.config.ts · playwright.config.ts
├── eslint.config.js · .dependency-cruiser.cjs · knip.json
└── CLAUDE.md                 ajan yönergesi → "önce WORKING_DISCIPLINE.md oku"
```

---

## 15. Mimari değişmezler (CI tarafından zorlanır)

Bunlar yorum değil, testtir. İhlal = kırmızı build.

```
✓ src/sim/**  →  'phaser' importu YOK                      [dependency-cruiser]
✓ src/sim/**  →  'svelte' importu YOK                      [dependency-cruiser]
✓ src/sim/**  →  src/render/**, src/ui/** importu YOK       [dependency-cruiser]
✓ src/ui/**   →  src/sim/** importu YOK                    [dependency-cruiser]
✓ src/config/** → src/sim/** dışı import YOK               [dependency-cruiser]
✓ src/sim/**  →  Math.random / Date.now / new Date YOK     [eslint no-restricted-*]
✓ src/sim/**  →  setTimeout / setInterval / rAF YOK        [eslint no-restricted-*]
✓ Döngüsel bağımlılık YOK                                  [dependency-cruiser]
✓ Aynı seed + aynı command log → aynı sonuç                [determinism test]
✓ 1000 tick @ 200 entity → tahsis < eşik                   [perf test]
✓ v1 → current save migration zinciri çalışır              [migration test]
✓ Bundle bütçeleri aşılmadı                                [size-limit]
✓ Kullanılmayan export / bağımlılık YOK                    [knip]
```

---

## 16. Karar kaydı (ADR özeti)

Tam ADR'ler `docs/DECISIONS/` altında, Faz 1'de oluşturulur.

| #   | Karar                               | Alternatif                       | Geri dönüş maliyeti                               |
| --- | ----------------------------------- | -------------------------------- | ------------------------------------------------- |
| 001 | Phaser 4 render motoru              | Pixi 8, custom                   | Orta (2–3 hafta, yalnızca `src/render`)           |
| 002 | TypeScript 6, TS7 değil             | TS7 + lint'siz, veya hibrit      | Düşük (tek PR, tetikleyici tanımlı)               |
| 003 | Svelte 5 UI, React değil            | React 19, Preact, vanilla        | Düşük–orta                                        |
| 004 | Motordan bağımsız deterministik sim | Phaser sahnelerinde oyun mantığı | **Çok yüksek** — bu yüzden baştan doğru yapılıyor |
| 005 | Kendi Doll rig sistemimiz           | Spine (ücretli), sprite sheet    | Orta                                              |
| 006 | Flow field + spline navigasyon      | Saf A*, NavMesh                  | Düşük                                             |
| 007 | Backend yok (tek `/api/time` hariç) | Supabase baştan                  | Düşük (eklemek kolay)                             |
| 008 | Vercel statik hosting               | Fly.io, Cloudflare Pages         | Düşük                                             |
| 009 | Zemin: bake sprite, tilemap değil   | İzometrik tilemap                | Orta                                              |
| 010 | ECS kütüphanesi yok, hedefli SoA    | bitECS vb.                       | Düşük                                             |
| 011 | Command log baştan                  | Sonradan eklemek                 | Sonradan eklemek pahalı → şimdi                   |
| 012 | Visual regression yalnızca Chromium | Çok tarayıcı                     | — (teknik zorunluluk)                             |
