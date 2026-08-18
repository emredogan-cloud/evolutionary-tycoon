# ECONOMY DESIGN — Evolutionary Tycoon

**Sürüm:** 1.0 · **Tarih:** 2026-08-14 · **Durum:** GATE 0 — onay bekliyor
**İlgili:** [GAME_DESIGN_DOCUMENT](GAME_DESIGN_DOCUMENT.md) · [TECHNICAL_ARCHITECTURE](TECHNICAL_ARCHITECTURE.md)

> **Bu dokümandaki sayıların statüsü:** Buradaki değerler **tasarlanmış başlangıç değerleri ve zarflardır (envelopes)**, nihai denge değerleri değil. Nihai ayar Faz 12'de, headless balance simülatörü ile yapılır. Bu dokümanın asıl teslim ettiği şey sayılar değil, **model, zarf ve koruma mekanizmalarıdır** — bunlar değişmez; sayılar zarf içinde değişir.

---

## 1. Temel ilkeler

1. **Tek yumuşak para birimi (₡).** Premium para birimi yok. İkinci bir para birimi, ancak monetizasyon onaylanırsa ve o zaman bile yalnızca kozmetik için gelir.
2. **Hiçbir ekonomik sayı gameplay kodunda literal olarak bulunamaz.** Hepsi `src/config/economy/**` altında, tipli ve Zod ile doğrulanmış.
3. **Gelir yapısal olarak tavanlıdır.** Üstel kaçış matematiksel olarak imkânsız kılınmıştır (§7).
4. **Her aşama bir S-eğrisidir.** Hızlı başlangıç → yavaşlayan büyüme → tavan → evrim tavanı yükseltir.
5. **Oyuncu asla çıkmaza girmez.** Her an, mevcut gelirin ≤90 saniyesiyle alınabilir anlamlı bir yükseltme vardır. Bu CI'da test edilir.
6. **İflas yok.** Nakit sıfırın altına inmez. Maaş ödenemezse çalışanlar uyarıyla ayrılır. Oyun bitmez.

---

## 2. Zaman ölçeği

|                        |                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------- |
| 1 oyun günü            | **12 gerçek dakika** (aday değer — Faz 5'te deneyerek kesinleşir, bkz. GDD §25 S1) |
| 1 oyun saati           | 30 gerçek saniye                                                                   |
| Simülasyon tick        | 20 Hz (50 ms)                                                                      |
| Gün eğrisi çözünürlüğü | 24 nokta (saat başı), aralarda interpolasyon                                       |

Bu ölçek, bir oyuncunun tek bir 6 dakikalık oturumda yarım oyun günü görmesini sağlar — tepe saatleri hissedecek kadar uzun, sıkılacak kadar değil.

---

## 3. Aşama zarfları — sistemin iskeleti

Tüm ekonomi bu tablodan türer. Bu tablo değişirse her şey değişir; bu yüzden tek doğruluk kaynağı burasıdır (`src/config/economy/stages.ts`).

|                                           | **Aşama 1** Stand | **Aşama 2** Truck | **Aşama 3** Diner | **Aşama 4** Restaurant |
| ----------------------------------------- | ----------------: | ----------------: | ----------------: | ---------------------: |
| Trafik (araç/gerçek dk, gün ortalaması)   |                24 |                40 |                60 |                     84 |
| Tepe saat çarpanı                         |              ×2.2 |              ×2.2 |              ×2.4 |                   ×2.5 |
| **Maks dönüşüm oranı** (tam yükseltmeli)  |              0.22 |              0.30 |              0.38 |                   0.45 |
| Başlangıç dönüşüm oranı (sıfır yükseltme) |              0.09 |              0.13 |              0.17 |                   0.21 |
| Maks müşteri/dk                           |               5.3 |              12.0 |              22.8 |                   37.8 |
| Ortalama ticket                           |              ₡4.5 |                ₡9 |               ₡18 |                    ₡30 |
| Brüt marj (malzeme sonrası)               |               %64 |               %63 |               %62 |                    %61 |
| **Maks brüt gelir/dk**                    |               ₡24 |              ₡108 |              ₡410 |                 ₡1.134 |
| Maaş yükü (tam kadro) /dk                 |                ₡0 |               ₡12 |               ₡75 |                   ₡220 |
| Bakım /dk                                 |                ₡0 |                ₡2 |               ₡14 |                    ₡48 |
| **Maks net/dk**                           |           **₡15** |           **₡55** |          **₡179** |               **₡483** |
| Başlangıç net/dk (aşamaya girişte)        |                ₡6 |               ₡20 |               ₡62 |                   ₡190 |
| Hedef aşama süresi                        |          12–18 dk |          30–45 dk |        150–240 dk |              açık uçlu |
| Aşama içi yükseltme toplamı               |               ₡55 |              ₡500 |            ₡8.000 |               ₡150.000 |
| **Sonraki aşamanın maliyeti**             |              ₡140 |              ₡800 |           ₡12.000 |                      — |

**Aşamalar arası gelir oranı:** 1 → 3.7× → 3.3× → 2.7×
**Bu azalan bir dizidir. Bu kasıtlıdır.** Üstel değil, yavaşlayan bir büyüme. Sayılar hiçbir zaman okunamaz hâle gelmez; oyunun sonunda bile dört haneli/dk gelirdeyiz, `1.2e47` değil.

> **Sepet modeli (ADR-016, 2026-08-18).** "Ortalama ticket" satırı artık mekanik olarak
> üretilebilir: sipariş bir **sepettir** — aşama menüsünden üniform seçilen ana ürün + yan ürün ve
> içecek çekilişleri (`src/config/economy/basket.ts`). Şanslar bu tablonun ticket'larına karşı
> **çözülmüştür**, ayarlanmamıştır: A2 %39/%39×1, A3 %75/%75×1, A4 %64/%64×2 çekiliş →
> E[ticket] = ₡9.01 / ₡18.01 / ₡29.98. Aşama 1 bilinçli olarak sıfır (tek kalem ticket'ı zaten
> tasarımda). Tepsi kuralı: sepet eksiksiz teslim edilir; sıcak tutma ilk pişen kalem için gerçek
> maliyete dönüşür. P12'nin §8.1 değişiklik talebi bununla kapandı; balance kapısındaki iki
> DEĞERLENDİRİLEMEZ assertion değerlendirilebilir hâle geldi (Aşama 3 zamanlaması ilk ölçümde
> 58–67 dk / pencere 28–70 ✅). Aşama 2–4 **gelir kalibrasyonu** hâlâ yapılmadı — P12 yalnız
> Aşama 1'i ayarlamıştı — bu yüzden kalibre edilmemiş aşamaların zarf/dead-end/zamanlama satırları
> kapıda _ölçülüp raporlanır, assert edilmez_ (`CALIBRATED_STAGES`, ADR-016). Bu kalibrasyon
> pasosu, kullanıcının bekleyen trafik yoğunluğu kararıyla birlikte sonraki ekonomi işinin girdisidir.

> **İşletme rezervi (ADR-014, 2026-08-18).** "Sonraki aşamanın maliyeti" satırı **harcanan** tutardır;
> evrim kapısı ise `maliyet + işletme rezervi` tutmayı şart koşar. Rezerv config'ten türetilir:
> gelecek aşamanın kazanmak için zorunlu rolleri (`requiredRoles` — Aşama 3-4'te garson) içinden
> henüz istihdam edilmeyenlerin işe alım maliyeti + maaş sisteminin kendi tolerans penceresi
> (`UNPAID_GRACE_MS`, 3 dk) boyunca tüm kadronun maaşı. P12'nin ölçtüğü mahsur kalma — ₡804 ile
> ₡800'lük Aşama 3'ü kabul edip ₡4 ile açılmak, garson tutamamak, 92. dakikadan sonra sıfır gelir —
> artık kapı tarafından reddediliyor ve `tests/integration/evolutionReserve.test.ts` bu senaryoyu
> birebir yeniden üretiyor. Bu tablodaki hiçbir sayı değişmedi; kapı, tabloya _ek olarak_ elde
> kalması gerekeni tanımlıyor.

---

## 4. Menü — fiyat, maliyet, süre

`src/config/economy/menu.ts`

| Ürün           | Aşama | İstasyon    |  Malzeme | Fiyat | Marj | Hazırlık | Sıcak kalma | Etiketler         |
| -------------- | ----: | ----------- | -------: | ----: | ---: | -------: | ----------: | ----------------- |
| Limonata       |     1 | DRINK       |     ₡0.8 |    ₡3 |  %73 |    2.5 s |        90 s | FAST, SWEET       |
| Sosisli        |     1 | GRILL       |     ₡1.8 |    ₡5 |  %64 |      5 s |        60 s | FAST, HEARTY      |
| Cips           |     1 | PREP        |     ₡0.5 |    ₡2 |  %75 |      1 s |       300 s | FAST              |
| Hamburger      |     2 | GRILL       |     ₡3.2 |    ₡9 |  %64 |      9 s |        70 s | HEARTY            |
| Patates        |     2 | FRYER       |     ₡1.1 |    ₡4 |  %73 |      6 s |        45 s | FAST, HEARTY      |
| Kola           |     2 | DRINK       |     ₡0.6 |    ₡3 |  %80 |    1.5 s |       240 s | FAST              |
| Kahvaltı seti  |     3 | GRILL+PREP  |     ₡5.5 |   ₡14 |  %61 |     14 s |        60 s | BREAKFAST, HEARTY |
| Tavuk menü     |     3 | FRYER       |     ₡6.0 |   ₡16 |  %63 |     12 s |        65 s | HEARTY            |
| Kahve          |     3 | COFFEE      |     ₡0.9 |    ₡5 |  %82 |      4 s |       120 s | FAST, BREAKFAST   |
| Tatlı          |     3 | DESSERT     |     ₡2.4 |    ₡8 |  %70 |      5 s |       200 s | SWEET, PREMIUM    |
| Salata         |     3 | PREP        |     ₡3.0 |    ₡9 |  %67 |      7 s |       150 s | VEGGIE            |
| Premium burger |     4 | GRILL       |     ₡8.5 |   ₡24 |  %65 |     16 s |        70 s | PREMIUM, HEARTY   |
| Aile menüsü    |     4 | GRILL+FRYER |      ₡18 |   ₡48 |  %63 |     26 s |        60 s | HEARTY, PREMIUM   |
| Mevsimlik      |     4 | değişken    | değişken |  +%20 |    — |        — |           — | PREMIUM           |

**Fiyat ayarı:** Oyuncu her ürünün fiyatını **±%50** bandında değiştirebilir.

```
priceFit = clamp01( 1 − max(0, (price − archetype.expectedPrice) / archetype.priceTolerance) )
expectationPenalty = 1 + 0.35 × (price / basePrice − 1)   // pahalı = daha zor memnun et
```

Yüksek fiyat marjı artırır ama hem dönüşümü düşürür hem de aynı kalitede daha düşük memnuniyet üretir. Bu iki yönlü ceza, "her şeyi maksimuma çek" stratejisini geçersiz kılar.

---

## 5. Maliyetler

### 5.1 Maaşlar (`src/config/economy/wages.ts`)

Gerçek zamanlı dakika başına, çalışan başına:

| Rol            | Aşama | Taban /dk | Eğitim I | Eğitim II | Eğitim III |
| -------------- | ----: | --------: | -------: | --------: | ---------: |
| Aşçı           |    2+ |        ₡6 |       ₡8 |       ₡11 |        ₡15 |
| Garson         |    3+ |        ₡5 |       ₡7 |      ₡9.5 |        ₡13 |
| Temizlikçi     |    3+ |        ₡4 |     ₡5.5 |        ₡7 |          — |
| Kasiyer        |     4 |        ₡5 |       ₡7 |      ₡9.5 |          — |
| Şef            |     4 |       ₡14 |      ₡19 |       ₡26 |        ₡35 |
| Park görevlisi |     4 |        ₡4 |     ₡5.5 |         — |          — |
| Kurye          |     4 |        ₡5 |       ₡7 |      ₡9.5 |          — |

**Kritik özellik:** Maaş **sürekli** bir sink'tir ve offline'da da işler. Bu, "çok fazla personel al, bırak çalışsın" stratejisini otomatik olarak cezalandırır ve geliri geriye bağlar.

**İşe alım ücreti:** İlk ay maaşının 3 katı, tek seferlik.
**Ayrılma:** 3 gerçek dakika boyunca maaş ödenemezse bir çalışan uyarıyla ayrılır (en yüksek maaşlı önce).

### 5.2 Bakım

```
maintenance/dk = Σ(kurulu ekipman.maintenanceRate) + building.baseMaintenance × stage
```

Ekipman seviyesi arttıkça bakımı da artar (seviye başına ×1.4). Bu, "her şeyi maksimuma çıkar" stratejisine sürekli bir vergi koyar.

### 5.3 Malzeme

Satış anında düşülür (`item.baseCost`). Faz 12'de opsiyonel stok sistemi: toplu alım indirimi (%12'ye kadar) vs. bozulma riski — bir karar mekaniği daha.

---

## 6. Yükseltme maliyet ve etki modeli

### 6.1 Maliyet formülü

```
cost(family, level) = round(
  family.base
  × STAGE_MULTIPLIER[stage]
  × LEVEL_GROWTH^(level − 1)
)

LEVEL_GROWTH   = 2.2
STAGE_MULTIPLIER = [1, 4, 14, 55]     // aşama 1..4
```

**Neden 2.2:** Seviye başına maliyet 2.2× artarken etki azalan getirili (§6.2). Yani her seviye, bir öncekinden belirgin biçimde daha az "verim" alır. Bu, oyuncuyu tek bir aileyi sonuna kadar yükseltmek yerine **çeşitlendirmeye** iter — yani gerçek bir karar üretir.

**Neden sonsuz seviye yok:** Her aile maksimum 4 (bazıları 5) seviyeye sahiptir. Sonsuz seviye = anlamsız sayı büyümesi.

### 6.2 Etki eğrileri — azalan getiri zorunlu

| Etki tipi                       | Formül                        |    L1 |    L2 |    L3 |     L4 |
| ------------------------------- | ----------------------------- | ----: | ----: | ----: | -----: |
| Hız (süre çarpanı)              | `0.80^(L−1)`                  |  1.00 |  0.80 |  0.64 |  0.512 |
| Kalite (toplamsal, sönümlü)     | `+0.10, +0.07, +0.05, +0.035` | +0.10 | +0.17 | +0.22 | +0.255 |
| Görünürlük (toplamsal, sönümlü) | `+0.30, +0.22, +0.16, +0.12`  |  1.30 |  1.52 |  1.68 |   1.80 |
| Kapasite (doğrusal)             | `+n`                          |    +1 |    +1 |    +2 |     +2 |
| Hareket hızı                    | `1 + 0.12×(L−1)`              |  1.00 |  1.12 |  1.24 |   1.36 |

**Kural:** Hiçbir yükseltme çarpanı bir başkasıyla serbestçe çarpılmaz. Aynı kategorideki etkiler `combineDiminishing()` ile birleştirilir:

```
combined = 1 − Π(1 − effect_i × categoryWeight)
```

Bu, "beş farklı +%20'yi çarpıp ×2.5 elde etme" sömürüsünü matematiksel olarak imkânsız kılar.

### 6.3 Minimum anlamlılık eşiği

Bir yükseltme, **60 saniye içinde oyuncu tarafından fark edilebilir** bir etki üretmiyorsa oyuna girmez. Pratik eşik:

- Hız yükseltmesi: ≥ %12 süre azalması
- Kapasite: ≥ 1 birim
- Dönüşüm: ≥ 2 puan (0.02)

`+%3 verimlilik` tarzı yükseltmeler yasaktır.

---

## 7. Üstel kaçışın yapısal olarak engellenmesi

Bu bölüm, ekonomi tasarımının en önemli kısmıdır. Idle/tycoon türünün en yaygın ölüm sebebi kontrolsüz üstel büyümedir. Burada **beş bağımsız yapısal fren** var; herhangi biri devre dışı kalsa bile diğerleri tutar.

### Fren 1 — Talep fiziksel olarak sınırlı

```
gelir/dk = min(talep, kapasite) × ticket
talep    = trafikOranı(stage) × P(convert) × ...
```

`trafikOranı` aşama başına **sabit bir sayıdır**, oyuncunun yükseltmeleriyle artmaz. Yol ne kadar araç taşıyorsa o kadar taşır.

### Fren 2 — Dönüşüm sert tavanlı

```
P(convert) = clamp(computed, 0, MAX_CONVERSION[stage])
```

Aşama 4'te bile tavan 0.45. Yani geçen araçların çoğu **hiçbir zaman** müşteri olmaz. Bu hem gerçekçi hem de matematiksel olarak zorunlu.

### Fren 3 — Kapasite tavanı

Park yeri, masa, drive-thru şerit uzunluğu, mutfak istasyonu — hepsi sonlu ve her ek birim daha pahalı. `kapasite` her zaman `talep`i kesebilir.

### Fren 4 — Kendi başarının cezası (spillover)

```
spilloverPenalty = queueLength > queueCapacity
                 ? clamp(1 − (queueLength − queueCapacity) × 0.18, 0.15, 1.0)
                 : 1.0
```

Kuyruk yola taşarsa **geçen araçların dönüşümü düşer**. Sistem kendi kendini dengeler: aşırı talep, talebi azaltır. Bu, türde nadir görülen bir negatif geri besleme halkası ve oyunun en zarif mekaniği.

### Fren 5 — Büyüyen sürekli sink'ler

Maaş ve bakım gelirle birlikte büyür. Aşama 4'te brüt gelirin ~%24'ü sürekli giderlere gider. Net gelir, brüt gelirin sabit bir oranı değil, azalan bir oranıdır.

**Sonuç:** Her aşamada gelir bir asimptota yaklaşır. Grafik dört basamaklı bir S-eğrisi zinciridir, üstel bir roket değil.

```
gelir/dk
  483 ┤                                        ╭──────────  ← Aşama 4 tavanı
      │                                    ╭───╯
  179 ┤                        ╭───────────╯                ← Aşama 3 tavanı
      │                   ╭────╯
   55 ┤         ╭─────────╯                                 ← Aşama 2 tavanı
   15 ┤   ╭─────╯                                           ← Aşama 1 tavanı
      └───┴─────┴─────────┴───────────┴───────────────► süre
        18dk   60dk      240dk        ~11 saat
```

---

## 8. Çıkmaz (dead-end) önleme

**Değişmez kural (kanonik tasarım sözleşmesi):**

```
cheapestMeaningfulUpgrade.cost ≤ currentNetIncomePerMin × 1.5      // = 90 saniyelik gelir
```

> **90 saniye tek kanonik değerdir ve CI'da merge-blocking'dir.** Roadmap, TESTING_STRATEGY
> ve balance simülatörü referanslarının hepsi bu değeri kullanır.
>
> | Değer    | Balance simülatörü sonucu                                                     | CI                            |
> | -------- | ----------------------------------------------------------------------------- | ----------------------------- |
> | ≤ 75 sn  | ✅ PASS                                                                       | yeşil                         |
> | 75–90 sn | ⚠ WARN — "sınıra yaklaşıyor", yalnızca `pnpm balance:tune` çıktısında görünür | yeşil                         |
> | > 90 sn  | ❌ FAIL                                                                       | **kırmızı, merge engellenir** |
>
> **120 saniye eşiği kaldırılmıştır.** Roadmap §32 Faz 12 assertion listesinde geçen
> eski 120 sn değeri, 2026-08-14'te kullanıcı onayıyla 90 sn'ye düzeltildi. Uyarı bandı
> kapının _altına_ (75–90 sn) yerleştirildi — kapının üstünde bir uyarı bandı anlamsız
> olurdu, çünkü orada build zaten kırmızıdır.
>
> Kaynak: [ADR-005](DECISIONS/ADR-005-economy-config-driven.md) · kullanıcı onaylı düzeltme, 2026-08-14.

Bu üç mekanizma ile sağlanır:

1. Her ailenin L1 maliyeti, o aşamanın **başlangıç** net gelirine göre kalibre edilir (aşama ortalamasına değil).
2. Her aşamada en az iki "ucuz ve etkili" giriş yükseltmesi vardır (tipik olarak görünürlük ve bir kapasite birimi).
3. **CI testi** bunu doğrular: balance simülatörü her 30 saniyede bir kontrol eder ve ihlal bulursa build kırılır.

**Ayrıca:** Sıfır yükseltmeyle bile taban dönüşüm > 0. Oyuncu hiçbir zaman "hiç gelir yok" durumuna düşemez.

---

## 9. Memnuniyet → gelir bağlantısı

```
tip        = price × tipCurve(satisfaction)
tipCurve   = s < 0.60 ? 0
           : s < 0.85 ? (s − 0.60) × 0.40
           :            0.10 + (s − 0.85) × 1.20      // 0.85 üstünde hızla artar, maks %28

repeatProb = baseRepeat[archetype] × satisfaction²     // kare: "iyi" yetmez
reputationDelta = (satisfaction − 0.60) × 0.004        // 0.60 nötr çizgi
reputation ∈ [0, 100],  yıldız = 1 + reputation/25
reputationFactor = 0.60 + reputation/100 × 0.80        // dönüşüme 0.60..1.40 çarpanı
```

**Neden `satisfaction²`:** Doğrusal olsaydı "yeterince iyi" optimal strateji olurdu. Kare alarak mükemmelliğe orantısız ödül veriyoruz — kalite yatırımı gerçek bir strateji hâline geliyor.

**İtibar yavaş hareket eder:** Müşteri başına ±0.004 → itibarı 50'den 80'e çıkarmak ~7.500 memnun müşteri gerektirir. Bu kasıtlı: itibar, hızlı manipüle edilemeyen uzun vadeli bir varlık.

---

## 10. Offline ekonomisi

```
offlineMs = clamp(now − lastSeen, 0, 8 saat)
throughput = son 5 dakikanın ölçülen müşteri/dk değeri     // simüle etmiyoruz, ölçtüğümüzü kullanıyoruz
effective  = min(throughput × 0.40, physicalCapacityCeiling)
gross      = effective × offlineMinutes × avgTicket
costs      = (wages + maintenance) × offlineMinutes + ingredients
net        = gross − costs                                  // negatif olabilir
cash       = max(0, cash + net)
```

| Parametre                   | Değer    | Gerekçe                                               |
| --------------------------- | -------- | ----------------------------------------------------- |
| `OFFLINE_CAP`               | 8 saat   | Bir gece uykusu. Daha uzun süre daha çok ödül vermez. |
| `OFFLINE_EFFICIENCY`        | 0.40     | Offline hiçbir zaman aktif oyundan iyi olmamalı       |
| Giderler işler mi           | **Evet** | Aşırı personel almanın bedeli var                     |
| Net negatif olabilir mi     | **Evet** | Ama nakit 0'ın altına inmez                           |
| Fiziksel tavan uygulanır mı | **Evet** | 6 park yeri varsa 600 araç ağırlanamaz                |

**Rapor "sınırlayıcıyı" gösterir:** `limiter = argmax(utilization)` — park, mutfak, masa, personel, kuyruk arasından en çok doluluk yaşayan. Bu, offline ekranını bir ödül ekranından bir **yatırım tavsiyesi** ekranına çevirir.

---

## 11. Kilometre taşı ve hedef ödülleri

Bunlar gelirin **küçük** bir kısmı olmalı — asıl gelir servisten gelmeli.

| Kaynak            | Toplam gelirin payı (hedef)   |
| ----------------- | ----------------------------- |
| Satış + bahşiş    | %88                           |
| Günlük hedefler   | %6                            |
| Kilometre taşları | %4                            |
| Offline           | (ayrı — oturumlar arası)      |
| Başarımlar        | %2 (çoğunlukla kozmetik ödül) |

Günlük hedef ödülü: `currentNetIncomePerMin × 3` (yani ~3 dakikalık gelir). Ölçekle birlikte büyür, hiçbir zaman baskın olmaz.

---

## 12. Konfigürasyon mimarisi

```
src/config/economy/
├── index.ts            // tüm config'i birleştirir + Zod ile doğrular (dev-only)
├── stages.ts           // §3 tablosu — tek doğruluk kaynağı
├── menu.ts             // §4
├── wages.ts            // §5.1
├── upgrades.ts         // aile tanımları + maliyet/etki formülleri
├── archetypes.ts       // araç arketipleri, affinity, fiyat toleransı, memnuniyet ağırlıkları
├── satisfaction.ts     // §9 ağırlıkları ve eğrileri
├── traffic.ts          // gün eğrisi, spawn parametreleri, hava/olay çarpanları
├── offline.ts          // §10
├── objectives.ts       // günlük hedefler, kilometre taşları
└── tuning.ts           // global çarpanlar — A/B ve hızlı denge ayarı için tek dosya
```

**Kurallar:**

- Bu dizin `src/sim` dahil hiçbir şeyi import etmez (yalnızca `zod` ve tip dosyaları).
- Her config nesnesi `readonly` ve `as const`.
- Dev build'de boot anında Zod şeması ile doğrulanır; production build'de doğrulama tree-shake edilir (sıfır runtime maliyeti).
- Şema, mantıksal tutarlılığı da kontrol eder: `price > baseCost`, `maxConversion > startConversion`, `L2.cost > L1.cost`, `stage[n+1].traffic > stage[n].traffic`, vb. Tutarsız config **dev'de boot etmez**.

---

## 13. Balance simülatörü — CI kapısı

`tools/balance-sim/` — headless, Node'da çalışır, renderer yok, gerçek `src/sim` çekirdeğini kullanır.

**Ne yapar:** Birkaç "makul oyuncu politikası" (policy) ile simüle edilmiş oynanışı hızlandırılmış olarak koşturur ve ekonominin tasarlanan zarf içinde kalıp kalmadığını doğrular.

**Politikalar:**

| Politika           | Davranış                                   |
| ------------------ | ------------------------------------------ |
| `greedy-cheapest`  | Her zaman en ucuz mevcut yükseltmeyi al    |
| `roi-optimal`      | En yüksek geri dönüş oranlı yükseltmeyi al |
| `throughput-first` | Kapasite ve hız önce                       |
| `margin-first`     | Kalite ve fiyat önce                       |
| `idle-player`      | 5 dakikada bir gir, tek yükseltme al, çık  |

**Assertion'lar (ihlal = build KIRMIZI):**

> **ADR-015 (2026-08-18):** Aşama zamanlama assertion'ları **dört stratejik politikayı** bağlar.
> `idle-player` §5.1 gereği Aşama 1'de otomatikleşemez (aşçı bir Aşama 2 rolüdür) ve hızı kendi
> ziyaret aralığıyla sınırlıdır; ölçülen dikkat merdiveni (21.7 dk dikkatli → hiç, tam idle) tasarımın
> kendisidir. Idle kitlesi P14'ün offline sistemiyle (GDD §17: %40 verim, 8 saat tavan) ödüllendirilir;
> oturum içi Aşama 1 otomasyonu bilinçli olarak yoktur. `idle-player` politikası koşulmaya ve
> raporlanmaya devam eder — assertion yerine dikkat yayılımı metriği olarak.

```
✓ Aşama 2'ye geçiş:  10 dk ≤ t ≤ 22 dk   (stratejik politikalar — ADR-015)
✓ Aşama 3'e geçiş:   28 dk ≤ t ≤ 70 dk
✓ Aşama 4'e geçiş:  140 dk ≤ t ≤ 320 dk
✓ Her aşamada net gelir/dk, tasarlanan zarfın ±%25'i içinde
✓ Hiçbir anda: en ucuz anlamlı yükseltme > 90 sn'lik gelir      (çıkmaz yok — MERGE-BLOCKING)
✓ Hiçbir yükseltme satın alımı net geliri DÜŞÜRMEZ              (regresyon yok)
✓ En iyi ve en kötü politika arasındaki fark ≤ 2.5×             (tek doğru strateji yok)
✓ 12 saatlik simülasyonda gelir/dk < ₡600                       (üstel kaçış yok)
✓ Hiçbir noktada nakit 0'ın altına inmez
✓ Aşama 4'te 6 saat sonra hâlâ alınmamış yükseltme var          (içerik tükenmiyor)
```

Bu, ekonomi tasarımını **teste tabi bir sözleşme** hâline getirir. Bir config değişikliği dengeyi bozarsa PR merge edilemez. Bu, projenin en önemli teknik farklılaştırıcılarından biri.

---

## 14. Ekonomi sömürüsü risk kaydı

| #   | Sömürü                                                     | Nasıl önleniyor                                                                      | Test        |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- |
| E1  | Offline farming (saat manipülasyonu)                       | Sunucu zaman referansı + 8 saat tavan + monotonik kontrol                            | Unit + E2E  |
| E2  | Fiyatı sıfıra çekip dönüşümü maksimuma çıkarma             | Fiyat bandı ±%50; ayrıca marj negatife düşer                                         | Balance sim |
| E3  | Tüm personeli işten çıkarıp offline'a gitme                | Personelsiz throughput çok düşük; offline ölçülen throughput'u kullanır              | Balance sim |
| E4  | Aynı kategoride çarpan istifleme                           | `combineDiminishing()`                                                               | Unit        |
| E5  | Yükseltme satın al → iade → tekrar (arbitraj)              | **İade yok.** Yıkım ise maliyetin %30'unu iade eder, kâr edilemez                    | Unit        |
| E6  | Save düzenleyip nakit ekleme                               | Bilinçli olarak engellenmiyor (tek oyunculu). Checksum yalnızca bozulma tespiti için | —           |
| E7  | Menüde tek yüksek marjlı ürün bırakıp diğerlerini kaldırma | `menuAppeal` çarpanı arketip çeşitliliğine bağlı → dönüşüm çöker                     | Balance sim |
| E8  | Sekmeyi arka planda bırakıp "aktif" gelir toplama          | Görünmeyen sekme offline sayılır; tarayıcı zaten rAF'ı throttle eder                 | E2E         |
| E9  | Hızlı tıklama ile manuel hazırlığı sömürme (Aşama 1)       | Hazırlık süresi tıklamayla kısalmaz; tıklama yalnızca _başlatır_                     | Unit        |
| E10 | Kuyruk taşmasını görmezden gelip sonsuz talep              | Spillover cezası; talep kendini keser                                                | Balance sim |

---

## 15. Nihai denge kontrol listesi (Faz 12 çıkış kriteri)

```
[x] Balance simülatörü 5 politikanın hepsinde yeşil        → docs/BALANCE_REPORT.md
[~] Aşama süreleri tasarlanan aralıkta                     → Aşama 1 ✅ 21.4 dk (10–22).
                                                             Aşama 2–4 DEĞERLENDİRİLEMEZ:
                                                             o aşamaların içeriği henüz yok.
[x] En iyi/en kötü politika farkı ≤ 2.5×                   → 1.0× (dört stratejik politika)
[x] 12 saatte gelir tavanı aşılmıyor                       → tepe ₡37.1/dk, tavan ₡600
[x] Çıkmaz yok (90 sn kuralı hiç ihlal edilmiyor)          → en kötü 68 sn (MERGE-BLOCKING)
[ ] Her aşamada en az 2 geçerli strateji var               → **HAYIR.** Aşama 1'de beş
                                                             yükseltme ve ₡55 bütçe var;
                                                             dört politikanın dördü de aynı
                                                             sırayla alıyor (fark 1.0×).
                                                             Faz 13'ün ağacı olmadan
                                                             ayrışamazlar.
[ ] Offline kazanç aktif oyunun %40'ını geçmiyor           → offline kazanç henüz yok (P14)
[ ] 3 gerçek oyuncu ile 1 saatlik oturum                   → **YAPILMADI.** PHASE_12_REPORT §10
[x] Sayılar okunamaz büyüklüğe ulaşmıyor (maks 6 hane)     → 12 saatte en yüksek nakit ₡6 677
[~] Tüm ekonomi sabitleri config'de, kodda sıfır literal   → başlangıç itibarı World.ts'de
                                                             literal `0` idi; `STARTING_REPUTATION`
                                                             olarak config'e taşındı. Kalanı
                                                             tarandı, başka literal bulunmadı.
```

**Faz 12 çıkışında dört madde açık.** İkisi içerik eksikliğinden (Aşama 2–4 menüsü ve
yükseltme ağacı), biri henüz yazılmamış bir sistemden (offline), biri insan gerektiriyor.
Hiçbiri sessizce geçilmiş sayılmadı — dördü de PHASE_12_REPORT §8 ve §11'de kayıtlı.
