# TESTING STRATEGY — Evolutionary Tycoon

**Sürüm:** 1.0 · **Tarih:** 2026-08-14 · **Durum:** GATE 0 — onay bekliyor
**Kanıt:** [RESEARCH_NOTES §3](RESEARCH_NOTES.md#3-kritik-bulgu-2--cida-webgl-testi-güvenilmez)

---

## 1. Temel ilke: determinizm test edilebilirliğin ön koşuludur

Bir WebGL oyununu test etmek zordur. Bu projede zor değil — çünkü test edilebilirlik **mimarinin kendisine** konuldu:

| Mimari özellik                        | Hangi testi mümkün kılıyor                                               |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Motordan bağımsız saf TS simülasyon   | Tüm oyun mantığı Vitest'te, tarayıcısız, milisaniyeler içinde            |
| Sabit adımlı deterministik tick       | Aynı girdi → aynı çıktı; flake yok                                       |
| Tohumlanmış, stream'lere ayrılmış RNG | Yeni sistem eklemek eski testleri kırmaz                                 |
| Enjekte edilen saat                   | Zaman bağımlı davranış anında test edilir (12 saatlik oynanış 200 ms'de) |
| Command log                           | Tam oynanış senaryoları veri olarak saklanır ve tekrar oynatılır         |
| `?seed=&freezeAt=` render modu        | WebGL canvas'ın piksel-kesin karşılaştırılması                           |
| Config'in koddan ayrılması            | Ekonomi dengesinin CI'da doğrulanması                                    |

**Bu doküman, testlerin bu mimariden nasıl faydalandığını anlatır.**

---

## 2. Test piramidi ve hedefler

```
                    ▲
       Manuel /     │  ~15 senaryo · her faz sonu · gerçek cihaz
       keşif        │  (performans, hissiyat, mobil, ses)
                ────┼────
       Visual       │  ~25 golden · yalnızca Chromium · pinlenmiş container
       regression   │
                ────┼────
       E2E          │  ~35 senaryo · Chromium + Firefox · WebKit smoke
                ────┼────
       Integration  │  ~90 test · sistemler arası, headless sim
                ────┼────
       Unit         │  ~450 test · saf fonksiyonlar, matematik, FSM, ekonomi
                    ▼
```

| Katman      | Araç                              | Nerede             | Süre bütçesi | Kapsam hedefi                       |
| ----------- | --------------------------------- | ------------------ | ------------ | ----------------------------------- |
| Unit        | Vitest 4.1.10                     | Node               | < 15 s       | `src/sim` ≥ %90, `src/config` ≥ %95 |
| Integration | Vitest                            | Node               | < 45 s       | Sistem etkileşimleri                |
| Balance     | Özel runner (`tools/balance-sim`) | Node               | < 90 s       | Ekonomi zarfı                       |
| Perf (sim)  | Vitest bench                      | Node               | < 60 s       | Tick süresi + tahsis                |
| E2E         | Playwright 1.62.1                 | Chromium + Firefox | < 6 dk       | Kritik yollar                       |
| Visual      | Playwright screenshot             | Chromium (Docker)  | < 4 dk       | 25 golden                           |
| Smoke       | Playwright                        | WebKit             | < 90 s       | Boot + DOM                          |
| Manuel      | İnsan                             | Gerçek cihaz       | —            | Checklist                           |

**Toplam CI süresi hedefi: < 12 dakika.** Bunun üstüne çıkarsa paralelleştirilir; 20 dakikayı geçerse bu bir mimari sorundur ve ele alınır.

---

## 3. Unit testler

### 3.1 Ekonomi

```
✓ Fiyat/maliyet/marj hesabı
✓ Yükseltme maliyet formülü — her aile, her seviye
✓ Azalan getiri: combineDiminishing() çarpan istiflemeyi engelliyor
✓ Maaş tahakkuku, kısmi dakika dahil
✓ Bakım maliyeti, ekipman seviyesiyle ölçekleniyor
✓ Bahşiş eğrisi — kırılma noktaları (0.60, 0.85) doğru
✓ İtibar deltası, sınırlar [0,100] içinde kalıyor
✓ Nakit asla negatif olmuyor
✓ Maaş ödenemediğinde çalışan ayrılma sırası deterministik
✓ Offline hesabı: tavan, verim, gider, fiziksel kapasite tavanı
✓ Offline: saat geri alındığında 0 kazanç, exception yok
✓ Config Zod şeması: geçersiz config reddediliyor (fiyat<maliyet, L2<L1, vb.)
```

### 3.2 Trafik ve dönüşüm

```
✓ Poisson spawn: aynı seed → aynı zaman damgaları (10.000 örnek)
✓ Gün eğrisi interpolasyonu, saat sınırlarında sürekli
✓ IDM: sabit durumda araçlar çarpışmıyor, negatif hız yok
✓ IDM: ani fren dalgası yukarı doğru yayılıyor (akordeon)
✓ Dönüşüm formülü: her çarpan izole test ediliyor
✓ Dönüşüm sert tavanı MAX_CONVERSION[stage] aşılmıyor
✓ Spillover cezası: kuyruk kapasiteyi aştığında dönüşüm düşüyor
✓ Arketip dağılımı: 10.000 spawn'da beklenen oranlar ±%2
✓ Karar noktası, restorandan doğru mesafede
```

### 3.3 NPC durum makineleri

```
✓ Her FSM: tüm geçişler erişilebilir (ulaşılamaz durum yok)
✓ Her FSM: terminal durumdan çıkış yok
✓ Sabır tükenince her bekleme durumundan ABANDONING'e geçiş
✓ Müşteri: park yeri yoksa LEAVING_ANGRY, sonsuz döngü yok
✓ Garson: görev iptal edilirse IDLE'a temiz dönüş
✓ Aşçı: istasyon meşgulse bloke, serbest kalınca devam
✓ TaskBoard: iki çalışan aynı göreve atanamıyor
✓ TaskBoard: puanlama deterministik, eşitlikte entity ID sıralaması
✓ Işınlanma yok: her pozisyon değişimi hız × dt ile sınırlı
```

### 3.4 Navigasyon

```
✓ Flow field: her ulaşılabilir hücreden hedefe ulaşılıyor
✓ Flow field: ulaşılamaz hücreler işaretli, ajan takılmıyor
✓ Flow field: engel eklendiğinde yeniden hesaplama doğru
✓ A* fallback: optimal yol, açık grid'de flow field ile eşleşiyor
✓ Spline: arc-length parametrizasyonu, sabit hızda düzgün ilerleme
✓ Park manevrası: başlangıç ve bitiş pozisyonu/açısı doğru
✓ Steering: ajanlar birbirinin içinden geçmiyor (min mesafe korunuyor)
✓ Kapı kuyruk slotları: sıra korunuyor, atlama yok
```

### 3.5 Memnuniyet

```
✓ Her girdi bileşeni izole
✓ Arketip ağırlıkları toplamı 1.0
✓ satisfaction ∈ [0,1] her zaman
✓ Sıcaklık düşüşü kaliteyi doğru azaltıyor
✓ Fiyat beklenti cezası: pahalı ürün daha zor memnun ediyor
✓ Tekrar gelme olasılığı satisfaction² ile ölçekleniyor
```

### 3.6 Rig ve matematik

```
✓ Doll rig: klip + t → beklenen transform (keyframe interpolasyonu)
✓ Prosedürel yürüyüş: periyodik, süreksizlik yok
✓ Parça hiyerarşisi: parent transform doğru zincirleniyor
✓ Ayna yönü: sw = mirror(se) doğru
✓ İzo projeksiyon: world → screen → world round-trip
✓ Derinlik hesabı: bilinen düzenlerde beklenen sıra
✓ Vec2/spline/easing yardımcıları
```

### 3.7 Determinizm (özel süit)

```
✓ Aynı seed + aynı command log → 10.000 tick sonra birebir aynı world hash
✓ Farklı tick oranlarında (1×/2×/4×) aynı sonuç
✓ Save → yükle → devam et = kesintisiz devam ile aynı sonuç
✓ RNG stream izolasyonu: bir stream'i tüketmek diğerlerini etkilemiyor
✓ src/sim içinde Math.random/Date.now yok (AST taraması, ESLint'e ek)
```

Bu süit **projenin en önemli testidir**. Kırılırsa, tüm diğer testlerin ve golden görüntülerin güvenilirliği gider.

---

## 4. Integration testler

Gerçek sim çekirdeği, gerçek config, sahte saat. Renderer yok.

```
✓ Tam servis döngüsü: araç spawn → dönüşüm → park → sipariş → hazırlık → teslim → ödeme → çıkış
✓ Drive-thru döngüsü: uçtan uca, kuyruk dahil
✓ İki kanal aynı mutfağı paylaşırken doğru öncelik
✓ Yükseltme satın alma → sim parametresi değişiyor → çıktı ölçülebilir değişiyor
✓ Çalışan işe alma → görev alıyor → maaş tahakkuk ediyor
✓ Çalışan işten çıkarma → aktif görev güvenli iptal
✓ Aşama evrimi: durum korunuyor, yeni sistemler aktif, eskiler bozulmuyor
✓ Save/load: 100 tick çalıştır → kaydet → yükle → 100 tick daha → referansla aynı
✓ Migration zinciri: v1 fixture → current, veri kaybı yok
✓ Bozuk save → yedeğe düşüş → oyun çalışıyor
✓ Tüm yedekler bozuk → temiz hata, crash yok
✓ Offline hesabı → sim durumuna doğru uygulanıyor
✓ Kuyruk taşması → dönüşüm düşüşü → talep dengeleniyor (negatif geri besleme çalışıyor)
✓ Personelsiz oyun: throughput düşük ama sistem kilitlenmiyor
✓ Maks kapasitede 30 dk sim: memory leak yok, entity sızıntısı yok
✓ Tüm masalar kirli + tüm park dolu + kuyruk taşkın: deadlock yok
```

**Deadlock testi özellikle önemli:** Karmaşık NPC sistemlerinin en sinsi hatası, hiçbir ajanın ilerleyemediği bir durumdur. Rastgele 500 farklı başlangıç durumundan 2.000 tick koşulur; her koşuda en az bir müşterinin servis edilmiş olması beklenir.

---

## 5. Balance testleri (CI kapısı)

`tools/balance-sim` — [ECONOMY_DESIGN §13](ECONOMY_DESIGN.md#13-balance-simülatörü--ci-kapısı)'te tanımlı.

5 oyuncu politikası × hızlandırılmış 12 saatlik oynanış. Assertion'lar ekonomi dokümanında. İhlal = kırmızı build.

**Çıkmaz (dead-end) kapısı — kanonik değer 90 saniye.** `cheapestMeaningfulUpgrade.cost ≤ currentNetIncomePerMin × 1.5`. Bu merge-blocking'dir. 75–90 sn bandı yalnızca `pnpm balance:tune` çıktısında `WARN` olarak görünür ve merge'ü etkilemez. Eski 120 sn referansı 2026-08-14'te kaldırıldı ([ECONOMY_DESIGN §8](ECONOMY_DESIGN.md#8-çıkmaz-dead-end-önleme)).

**Neden bu bir test:** Ekonomi dengesi geleneksel olarak "elle oyna ve hisset" ile ayarlanır. Bu, bir config değişikliğinin dengeyi sessizce bozmasına açıktır. Simülatör, dengeyi **regresyon testine tabi** hâle getirir. Bu, projenin en özgün test kararı.

---

## 6. Performans testleri (CI'da headless)

CI'da gerçek FPS ölçülemez (SwiftShader). Bu yüzden CI **simülasyon** performansını ölçer — ki zaten CPU darboğazımız orada.

```
bench: sim.tick @ 50 vehicles  + 20 peds  → p95 ≤ 0.6 ms
bench: sim.tick @ 120 vehicles + 60 peds  → p95 ≤ 2.0 ms
bench: sim.tick @ 200 vehicles + 100 peds → p95 ≤ 3.5 ms   (stres, hedef dışı)
bench: flow field yeniden hesaplama (64×64, 20 hedef) → ≤ 12 ms
bench: 1000 tick @ 120 varlık → tahsis < 64 KB toplam (steady state ≈ 0)
bench: depth sort 260 nesne → ≤ 0.15 ms
bench: save serileştirme → ≤ 8 ms, boyut ≤ 40 KB
size:  bundle bütçeleri (TECHNICAL_ARCHITECTURE §11.3)
size:  asset bütçeleri (ASSET_PIPELINE §13)
```

**Regresyon eşiği:** Bir benchmark önceki `main` değerinden %15'ten fazla kötüleşirse build kırılır. Değerler `docs/PERF_LOG.md`'de saklanır ve trend takip edilir.

**Gerçek render performansı** manuel olarak, gerçek GPU'da, `?bench=1` modunda ölçülür ve PERF_LOG'a yazılır. CI bunu **iddia etmez**.

---

## 7. E2E testler (Playwright)

### 7.1 Yapılandırma

```
Tarayıcılar:  chromium (tam), firefox (tam, xvfb-run), webkit (yalnızca smoke)
Container:    mcr.microsoft.com/playwright:v1.62.1-noble  (pinlenmiş)
Hedef:        yerel preview build + Vercel preview URL (iki koşu)
Paralellik:   4 worker
Retry:        CI'da 1 (flake maskeleme değil, ağ dalgalanması için); 2. tekrar = başarısız
Trace:        yalnızca ilk başarısızlıkta
```

**Kritik: Firefox `xvfb-run` altında koşar** — aksi hâlde WebGL testleri kararsız ([RESEARCH_NOTES §3](RESEARCH_NOTES.md#3-kritik-bulgu-2--cida-webgl-testi-güvenilmez)).

### 7.2 Test edilebilirlik kancaları

Oyun, E2E için birinci sınıf kancalar sunar (test-only değil, teşhis için de kullanılır):

```
URL:     ?seed=42&freezeAt=600&speed=4&skipIntro=1&e2e=1
window.__EVOTYCOON__ = {          // yalnızca e2e/dev modda tanımlı
  getState(): PublicSnapshot,     // nakit, aşama, müşteri sayısı, kuyruk...
  dispatch(cmd: Command): void,   // command enjeksiyonu
  advanceTicks(n: number): void,  // zaman ilerlet
  waitFor(pred, timeoutMs),
  getEvents(): SimEvent[],
}
```

`data-testid` tüm UI etkileşim noktalarında. **Canvas'a asla tıklanmaz** — dünya etkileşimleri `dispatch()` ile yapılır; canvas tıklama davranışı ayrı ve az sayıda testte doğrulanır.

### 7.3 Kritik yol senaryoları

```
✓ Oyun yükleniyor, yükleme ekranı ilerliyor, oynanabilir kareye ulaşıyor
✓ 15 saniye içinde ilk araç görünüyor ve dönüşüyor
✓ Manuel hazırlık → teslim → nakit artıyor
✓ İlk yükseltme satın alınıyor → nakit düşüyor → etki ölçülebilir
✓ Yükseltme sonrası dünyada görsel değişiklik var (canvas hash değişti)
✓ Kaydet → sayfayı yenile → ilerleme aynen geri geliyor
✓ Aşama 2'ye evrim (hızlandırılmış) → yeni sistemler açılıyor
✓ Çalışan işe alma → çalışan görünüyor → görev yapıyor
✓ Fiyat değiştirme → dönüşüm oranı değişiyor
✓ Drive-thru kanalı çalışıyor (Aşama 4 fixture'ından başlayarak)
✓ Offline: lastSeen manipüle edilmiş save yükleniyor → rapor doğru
✓ Offline: saat geri alınmış save → 0 kazanç, crash yok
✓ Duraklat/devam et
✓ Hız değiştirme 1×/2×/4×
✓ Ayarlar: ses kapatma, reduced-motion, kademe değiştirme
✓ Analiz paneli: dönüşüm sebepleri doğru dağılım gösteriyor
✓ Bildirimler görünüyor ve kendiliğinden kayboluyor
✓ Yeni oyun başlatma (save silme onayı ile)
✓ Save dışa aktar → içe aktar → aynı durum
✓ Bozuk save → nazik kurtarma akışı
```

### 7.4 Hata ve dayanıklılık

```
✓ Asset yükleme hatası → tekrar denemeleri → nazik hata mesajı
✓ WebGL context loss (yapay olarak tetiklenir) → geri yükleme, oyun devam ediyor
✓ IndexedDB kullanılamıyor → localStorage fallback, oyun çalışıyor
✓ Depolama kotası dolu → nazik uyarı, veri kaybı yok
✓ Konsolda kritik hata (error seviyesi) YOK — tüm senaryolarda zorunlu assertion
✓ Sekme gizle/göster → sim durumu tutarlı
✓ /health.json doğru buildSha döndürüyor
```

**"Konsolda kritik hata yok" her E2E testinde otomatik çalışan bir assertion'dır**, ayrı bir test değil.

### 7.5 Responsive

| Viewport  | Cihaz profili | Kontroller                             |
| --------- | ------------- | -------------------------------------- |
| 1920×1080 | Desktop       | Tam layout, tüm paneller erişilebilir  |
| 1280×720  | Küçük laptop  | Layout bozulmuyor                      |
| 1024×768  | Tablet yatay  | Dock yerleşimi                         |
| 768×1024  | Tablet dikey  | Dikey layout                           |
| 667×375   | iPhone yatay  | Minimum HUD, safe-area                 |
| 375×667   | iPhone dikey  | Dikey layout, dokunma hedefleri ≥44 px |
| 360×640   | Küçük Android | Minimum desteklenen                    |

Her viewport'ta: yatay taşma yok, tüm birincil eylemler erişilebilir, HUD dünyanın %28'inden fazlasını kaplamıyor, dokunma hedefleri yeterli.

### 7.6 Erişilebilirlik

```
✓ axe-core taraması: kritik/ciddi ihlal yok (her ana ekranda)
✓ Klavye ile tüm UI gezilebiliyor, focus görünür, tuzak yok
✓ prefers-reduced-motion: animasyonlar azalıyor, SİMÜLASYON HIZI DEĞİŞMİYOR
✓ Kontrast: metin ≥4.5:1, UI bileşeni ≥3:1
✓ aria-live bölgeleri önemli değişimleri duyuruyor
✓ Sayfa dili ve başlık doğru
✓ Oyun ses tamamen kapalıyken tam oynanabilir
```

### 7.7 WebKit smoke (yalnızca)

```
✓ Sayfa yükleniyor
✓ Canvas oluşturuluyor ve WebGL context alınıyor (motorun açtığı bağlam WebGL 1 — ADR-017)
✓ HUD DOM'da render ediliyor, değerler görünüyor
✓ Kritik konsol hatası yok
✓ Temel etkileşim (bir butona tıklama) çalışıyor
```

**Ekran görüntüsü alınmaz** — WebKit headless'ta canvas görüntülerde görünmüyor (Playwright#586). Bu bir bizim eksiğimiz değil, bilinen bir platform kısıtı ve böyle dokümante ediliyor.

---

## 8. Visual regression

### 8.1 Neden çalışabiliyor

Determinizm olmadan bir WebGL canvas'ın ekran görüntüsü her koşuda farklıdır. Bizde çalışıyor çünkü:

```
?seed=42&freezeAt=<tick>&noParticles=1&fixedViewport=1&tier=high&dpr=1
```

RNG sabit, saat donmuş, partikül kapalı, kamera sabit, DPR sabit, kalite kademesi sabit.

### 8.2 Ortam pinleme

- **Yalnızca Chromium.** Firefox ve WebKit'te canvas görüntüleme güvenilir değil.
- **Pinlenmiş Docker imajı:** `mcr.microsoft.com/playwright:v1.62.1-noble`.
- **Zorunlu yazılım rasterizasyonu:** `--use-gl=angle --use-angle=swiftshader --disable-gpu`. Böylece yerel makinedeki GPU sürücüsü sonucu etkilemez.
- **Golden'lar aynı container'da üretilir:** `pnpm test:visual:update` da Docker içinde koşar. Yerel/CI piksel farkı olmaz.
- Eşik: `maxDiffPixelRatio: 0.002` (anti-aliasing gürültüsü için minimal tolerans).

### 8.3 Golden setleri (~25)

```
boot-loading · stage1-empty · stage1-first-customer · stage1-queue
stage2-truck-day · stage2-truck-night · stage2-busy
stage3-diner-interior · stage3-tables-full · stage3-waiter-serving
stage4-restaurant-wide · stage4-drivethru-queue · stage4-night-lights
hud-default · hud-mobile-portrait · hud-mobile-landscape
panel-build · panel-staff · panel-analytics · panel-offline · panel-settings
evolution-celebration · notification-stack · error-unsupported-webgl
reduced-motion-hud
```

### 8.4 Golden güncelleme protokolü

Bir diff çıktığında **asla otomatik kabul edilmez**:

1. Diff artifact'i incelenir.
2. Değişiklik kasıtlı mı? Değilse → bug, düzeltilir.
3. Kasıtlıysa → PR açıklamasında öncesi/sonrası eklenir, gerekçe yazılır, golden güncellenir.
4. Aynı PR'da 5'ten fazla golden değişiyorsa → ayrı bir "visual update" commit'i olarak ayrılır (inceleme kolaylığı).

---

## 9. Manuel test checklist (her faz sonu)

CI'ın yapamayacağı şeyler. Bunlar dokümante edilir ve raporlanır.

```
GERÇEK CİHAZ PERFORMANSI
[ ] Masaüstü Chrome, gerçek GPU: FPS p50/p05, frame time p95 → PERF_LOG
[ ] Orta seviye Android telefon: FPS, ısınma, pil, bellek
[ ] iPhone Safari: FPS, ses unlock, safe-area, sekme kill riski
[ ] 30 dakikalık oturum: bellek artışı < %5, FPS düşüşü yok

HİSSİYAT
[ ] Core loop tatmin edici mi? (üç geri bildirim halkası ayrı ayrı)
[ ] Yükseltmenin etkisi hissediliyor mu?
[ ] Trafik canlı görünüyor mu, mekanik mi?
[ ] Karakterler ışınlanıyor gibi mi görünüyor?
[ ] Ses karışımı yorucu mu?

GÖRSEL
[ ] Yeni asset'ler dünyaya ait görünüyor mu?
[ ] Derinlik sıralaması hatası var mı? (nesnelerin içinden geçme, yanlış üstte)
[ ] Gece/gündüz geçişi doğal mı?
[ ] %50 zoom'da okunabilir mi?

DAYANIKLILIK
[ ] Sekmeyi 10 dakika arka planda bırak → geri dön → tutarlı mı?
[ ] Ağı kes → asset yükleme → nazik hata mı?
[ ] Tarayıcı zoom %200 → UI bozuluyor mu?
[ ] Sistem saatini değiştir → offline mantığı doğru mu?
```

---

## 10. CI mimarisi

### 10.1 `ci.yml` — her push ve PR

```yaml
jobs:
  quality:        # ~3 dk
    - pnpm install --frozen-lockfile
    - pnpm lint                    # eslint + prettier check
    - pnpm typecheck               # tsc --noEmit
    - pnpm depcruise               # katman ihlalleri
    - pnpm knip                    # ölü kod
    - secret scan

  test:           # ~2 dk
    - pnpm test --coverage
    - coverage eşikleri: sim ≥90%, config ≥95%, genel ≥80%
    - pnpm test:determinism        # özel süit

  balance:        # ~2 dk
    - pnpm balance:check           # 5 politika, ekonomi zarfı

  perf:           # ~2 dk
    - pnpm bench:sim
    - regresyon karşılaştırması (main'e karşı %15 eşiği)

  build:          # ~2 dk
    - pnpm assets:validate
    - pnpm assets:build
    - pnpm build
    - pnpm size-limit              # bundle + asset bütçeleri
    - artifact: dist/

  e2e:            # ~6 dk  (matrix: chromium, firefox)
    needs: build
    container: mcr.microsoft.com/playwright:v1.62.1-noble
    - firefox için xvfb-run
    - pnpm e2e --project=${{ matrix.browser }}
    - artifact: rapor + trace (başarısızlıkta)

  webkit-smoke:   # ~1.5 dk
    needs: build
    - pnpm e2e:smoke --project=webkit

  visual:         # ~4 dk
    needs: build
    container: mcr.microsoft.com/playwright:v1.62.1-noble
    - pnpm test:visual
    - artifact: diff görüntüleri

  security:       # ~2 dk
    - pnpm audit --audit-level=high
    - CodeQL
```

### 10.2 `preview-e2e.yml` — Vercel preview hazır olduğunda

```
- Vercel preview URL'ini bekle (deployment_status webhook)
- /health.json'ı doğrula (buildSha commit ile eşleşiyor mu)
- Kritik yol E2E'sini GERÇEK preview URL'ine karşı koş
- Güvenlik başlıklarını doğrula (CSP, nosniff, vb.)
- Cache-Control başlıklarını doğrula (asset'ler immutable mı)
- Lighthouse (performance, a11y, best-practices)
```

**Bu iş kritiktir:** Yerel build'in geçmesi, CDN'in doğru başlıklarla doğru dosyaları sunduğunu kanıtlamaz. Faz kapısı, gerçek preview'a karşı doğrulanır.

### 10.3 `production-smoke.yml` — main'e merge sonrası

```
- Production deployment'ı bekle
- /health.json doğrula
- Smoke E2E (5 senaryo)
- Başarısızsa: uyarı + rollback talimatı (otomatik rollback YOK — insan kararı)
```

### 10.4 Merge kapısı

`main`'e merge için **zorunlu**: `quality`, `test`, `balance`, `perf`, `build`, `e2e (chromium)`, `e2e (firefox)`, `visual`, `security` — hepsi yeşil.
`webkit-smoke` bilgilendirici (blocking değil, çünkü platform kısıtları var).

---

## 11. Flake yönetimi

Flaky test, hiç olmayan testten kötüdür — sinyali zehirler.

**Politika:**

1. CI'da retry = 1. İkinci denemede geçen test **flaky olarak işaretlenir** ve `docs/FLAKY.md`'ye yazılır.
2. Bir test bir hafta içinde 3 kez flake ederse: **quarantine** (skip + issue). Skip edilmiş test bir borçtur ve takip edilir.
3. Quarantine'deki test sayısı 5'i geçerse, yeni özellik geliştirmesi durur ve testler düzeltilir.
4. **Flake'i retry ile gizlemek yasaktır.** Retry, ağ dalgalanması içindir; kararsız test için değil.

**En yaygın flake kaynakları ve önlemleri:**

| Kaynak            | Önlem                                                          |
| ----------------- | -------------------------------------------------------------- |
| Zamanlama / yarış | `waitFor(predicate)` kullan, asla sabit `waitForTimeout` değil |
| Animasyon         | E2E'de `reduced-motion` + `?e2e=1` (geçişler anlık)            |
| Rastgelelik       | Her testte sabit seed                                          |
| Asset yükleme     | Yükleme tamamlanma sinyalini bekle, süre değil                 |
| Canvas render     | Piksel testi yalnızca `freezeAt` modunda                       |
| Paralellik        | Testler bağımsız; her test kendi IndexedDB'sini temizler       |

---

## 12. Test verisi ve fixture'lar

```
tests/fixtures/
├── saves/
│   ├── save-v1.json ... save-v<N>.json      migration zinciri testi
│   ├── stage2-mid.json                      hızlı başlangıç noktaları
│   ├── stage3-busy.json
│   ├── stage4-full.json
│   ├── corrupt-checksum.json
│   ├── corrupt-truncated.json
│   └── future-version.json                  ileri sürüm → nazik red
├── commands/
│   ├── first-10-minutes.json                gerçek oynanış kaydı
│   ├── stage1-to-stage2.json
│   └── stress-rapid-upgrades.json
└── configs/
    ├── minimal.ts                           izole test için
    └── extreme.ts                           sınır değer testi
```

**Command fixture'ları gerçek oynanıştan kaydedilir** (`?record=1` modu). Bu, sentetik test verisinin kaçırdığı gerçek kullanım desenlerini yakalar.

---

## 13. Kapsam politikası

| Alan                 | Eşik                          | Gerekçe                                    |
| -------------------- | ----------------------------- | ------------------------------------------ |
| `src/sim/**`         | **≥ %90** satır, ≥ %85 branch | Oyunun kalbi; buradaki hata her şeyi bozar |
| `src/config/**`      | ≥ %95                         | Şema doğrulama dahil                       |
| `src/persistence/**` | ≥ %90                         | Veri kaybı riski                           |
| `src/render/**`      | ≥ %45                         | Çoğu görsel; E2E + visual ile kapsanıyor   |
| `src/ui/**`          | ≥ %55                         | E2E ile kapsanıyor                         |
| Genel                | ≥ %80                         |                                            |

**Kapsam bir hedef değil, bir tabandır.** %100 kapsam kötü test yazmanın bahanesi olabilir. Kritik olan: her davranışın **anlamlı** bir assertion'ı var mı.

---

## 14. Faz başına test gereksinimleri

Her faz kendi test setini teslim eder. Faz N'in testleri Faz N'in DoD'sinin parçasıdır.

| Faz               | Zorunlu yeni testler                                           |
| ----------------- | -------------------------------------------------------------- |
| 1 Foundation      | CI çalışıyor, örnek unit + E2E, health check, deploy doğrulama |
| 2 Sim Core        | Determinizm süiti, clock, RNG, command log, save v1, migration |
| 3 Iso Render      | Projeksiyon matematiği, depth sort, ilk golden'lar             |
| 4 Assets          | `assets:validate` CI'da, contact sheet, atlas bütçesi          |
| 5 Traffic         | Poisson determinizmi, IDM, gün eğrisi, spawn dağılımı          |
| 6 Customers       | Dönüşüm formülü, müşteri FSM, park başarısızlığı               |
| 7 Navigation      | Flow field doğruluğu, steering, deadlock testi                 |
| 8 Service Loop    | Uçtan uca integration, mutfak, sıcaklık                        |
| 9 Economy+Upgrade | Ekonomi unit'leri, ilk balance koşusu                          |
| 10 Employees      | Çalışan FSM'leri, TaskBoard, ışınlanma yok testi               |
| 11 Evolution      | Aşama geçişi integration, save uyumluluğu                      |
| 12 Balance        | **Tam balance kapısı devrede**                                 |
| 13 Upgrades v2    | Tüm yükseltme etkileri, azalan getiri                          |
| 14 Offline        | Offline hesabı, saat manipülasyonu senaryoları                 |
| 15 Events         | Olay determinizmi, hava etkileri                               |
| 16 Assets v2      | Tüm aşamaların asset kapısı                                    |
| 17 Anim/VFX/Audio | Rig unit'leri, ses throttle, partikül bütçesi                  |
| 18 UI/UX          | Tam a11y süiti, responsive matrisi, tüm golden'lar             |
| 19 Save/Cloud     | (kapsama alınırsa) senkronizasyon çakışma testleri             |
| 20 Performance    | Tüm perf bütçeleri, degradasyon kademeleri                     |
| 21 Security       | CSP doğrulama, header testleri, save bütünlüğü                 |
| 22 QA             | Tam matris, manuel checklist, uzun oturum                      |
| 23 Launch         | Production smoke, rollback provası                             |
| 24 Growth         | Analitik olay doğrulama                                        |

---

## 15. Test kalite kapısı (her faz)

```
[ ] Yeni davranışın her biri için en az bir anlamlı test var
[ ] Determinizm süiti hâlâ yeşil
[ ] Kapsam eşikleri karşılanıyor
[ ] Yeni flaky test yok (FLAKY.md büyümedi)
[ ] E2E süresi bütçe içinde (< 6 dk)
[ ] Toplam CI süresi < 12 dk
[ ] Visual diff'lerin hepsi bilinçli ve gerekçeli
[ ] Manuel checklist tamamlandı ve raporlandı
[ ] Quarantine'de 5'ten az test var
[ ] Hiçbir test sonucu doğrulanmadan rapor edilmedi
```
