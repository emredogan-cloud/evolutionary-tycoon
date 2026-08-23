# RESTORAN EVRİM MİMARİSİ — UYGULAMA RAPORU

> 2026-08-23 · `feat/stage1-product-expansion` · kullanıcının **RESTAURANT
> EVOLUTION ARCHITECTURE** yönergesi.
>
> Çekirdek model: **tek arsa, tek restoran, tek evrilen dünya.**
>
> Bu rapor ne yapıldığını değil, **neyin ölçüldüğünü** anlatır. Her sayı bir
> komut çıktısından ya da canlı bir tarayıcı oturumundan gelir; hiçbiri
> "muhtemelen" değildir.

---

## 1. Yönergenin sorduğu ve pasonun yaptığı

| #   | Yönerge maddesi                                                                     | Durum | Kanıt                                                              |
| --- | ----------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| 1   | Seviye eksenlerini asla tek bir "level"e katlama                                    | ✅    | `PROGRESSION_DESIGN.md` §1 — beş eksen, beş ayrı saklama yeri      |
| 2   | Restoran Aşaması = Clash of Clans Belediye Binası                                   | ✅    | `maxPropertyLevel(stage) = min(4, stage+1)` + mülk tabanı          |
| 3   | Aşama geçişi için asgari tutarlı arsa durumu, **veri/konfigde**                     | ✅    | `progression.ts` `requiredProperties` — UI kodunda tek satır yok   |
| 4   | Denetim → yol haritası → envanter → mülk grafiği → görsel kütüphane → UI → uygulama | ✅    | beş doküman, sırasıyla yazıldı                                     |
| 5   | Nesne inceleme UI'ı: `[BİLGİ]` + `[İNŞA ET]`                                        | ✅    | `InspectCard.svelte`, tarayıcıda doğrulandı                        |
| 6   | §17 — önizleme asla genel yer tutucu / alakasız / mevcut varlık göstermez           | ✅    | üç yollu `nextArt`; iki yönlü hata **tarayıcıda yakalandı** (§7)   |
| 7   | Mevcut inşaat sistemini kullan, ikincisini yaratma                                  | ✅    | `pendingBuilds` + `advancePendingBuilds`, tek dal                  |
| 8   | §23 — sıfır varlık atlaması                                                         | ✅    | 18 satır, 8 / 7 / 3 / 0, teste bağlı                               |
| 9   | `ASSET_GENERATION_PROMPTS.html`'i değiştirme, ekle                                  | ✅    | üreteçten yeniden üretildi: 314 → **320** prompt                   |
| 10  | §29 — maliyetleri kör ayarlama, balance simülatörünü çalıştır                       | ✅    | kapı iki kez kırmızıya döndü, iki kez kök nedenden düzeltildi (§8) |
| 11  | §30 — determinizm + göç                                                             | ✅    | hash'e girdi, komutla yazılır, v14→v15 göçü                        |
| 12  | §37 — eşik düşürme, test silme yok                                                  | ✅    | tek eşik dokunulmadı; §10'daki liste                               |

---

## 2. Denetimin bulduğu ve mimariyi belirleyen tek şey

Yönerge yeni bir ilerleme sistemi istedi. Denetim
([`LEVEL1_WORLD_INVENTORY.md`](LEVEL1_WORLD_INVENTORY.md)) ise şunu buldu:

> **Oyundaki neredeyse her kapasite kadranının zaten bir sahibi var.**

Otuz basamaklı yükseltme ağacı sıra kapasitesini, istasyon sayısını, bekletme
toleransını, görünürlüğü, atmosferi, hazırlık hızını ve tüm drive-thru
sayılarını hareket ettiriyor; iki makine de tip başına istasyon hızını. Sahibi
olmayan **tam olarak bir tavan** vardı: **otopark yeri sayısı.**

Bu yüzden bir "mülk" ikinci bir ekonomi değil, **oyuncunun zaten sahip olduğu
şeylerin üzerine konmuş bir isim**:

| Mülk         | Seviyesi nereden gelir         | Yeni merdiven?               |
| ------------ | ------------------------------ | ---------------------------- |
| Ana bina     | `progression.stage`            | hayır — **aşamanın kendisi** |
| Otopark      | kendi merdiveni, 4 / 5 / 8 yer | **evet** — tek yeni olan     |
| Mutfak       | `1 + prepStations`             | hayır                        |
| Servis alanı | `1 + ⌊queueCapacity / 2⌋`      | hayır                        |
| Cephe        | `1 + hand-painted-sign`        | hayır                        |

Alternatif — her mülke kendi merdivenini vermek — `buildings.ts`'in Hazırlık
Tezgâhı'nı keserken reddettiği hatanın aynısı olurdu: tek bir etkiye iki kapı,
iki fiyat, ve kimsenin tasarlamadığı bir bileşik istatistik.

---

## 3. Beş eksen, asla katlanmadan

```
OYUNCU SEVİYESİ    yaşam boyu sayaçlardan türetilir      (vardı)
RESTORAN AŞAMASI   1..4  ==  ANA BİNA SEVİYESİ           (vardı)
MÜLK SEVİYESİ      mülk başına 1..N, aşamayla sınırlı    (YENİ)
BİNA SEVİYESİ      yerleştirilmiş makine başına 1..3     (vardı)
DEKOR              merdiven yok — kişiselleştirme        (karar)
```

**Ana bina seviyesi aşamanın kendisidir.** Tek bir tezgâh var; evrim onu aynı
arsada, aynı kamerayla tezgâhtan kamyona, lokantaya, restorana taşıyor. Yanına
ayrı bir "ana bina seviyesi" koymak tek bir sayıya iki isim vermek olurdu —
yönergenin kendi örneği ("Restaurant Stage 2, Main Building Lv2") da bunların
aynı olgu olduğunu söylüyor.

**Dekorun merdiveni yok, ve bu bir karar.** Aşama 1 dünyasında oyuncunun satın
almadığı beş dekoratif nesne ve satın alabildiği yedi tane var. Her birine dört
basamak vermek 48 menü satırı ekler ve simülasyonun okuduğu hiçbir sayıyı
oynatmaz. Kişiselleştirme merdiven istemeye başladığında seçim olmaktan çıkar.

---

## 4. Mülk tabanı — para tek başına yetmez

Aşama geçişinin gereksinimi tek bir madde kazandı:

```
N+1'e evrilmek için, GEREKLİ her mülk N+1 seviyesinde olmalı
```

| Nereye  |       otopark |        mutfak | servis | cephe |
| ------- | ------------: | ------------: | -----: | ----: |
| Aşama 2 |         **2** |             — |  **2** | **2** |
| Aşama 3 |         **3** |         **2** |  **3** | **3** |
| Aşama 4 | **3** (azami) | **3** (azami) |  **4** | **4** |

Sebebi bir zorluk ayarı değil: **dört araçlık otopark ve iki kişilik sırayla
açılan bir Aşama 2 binası, daha büyük görünen ve daha kötü çalışan bir
restorandır.** Nakit eşiği bunu engelleyemez, çünkü nakit boşta duran bir
tezgâhın kendiliğinden biriktirdiği tek şeydir.

İlk taslaktan iki sapma, ikisi de ölçüm:

- **Mutfak Aşama 2 tabanından çıktı.** Seviye-2 basamağı
  `second-prep-station` **oyuncu seviyesi 5** istiyor; Aşama 2 kapısına oyuncu
  seviyesi 2'de varılıyor. Canlı ölçüm: 25 servis → S2, 120 → S5, 600 → S10.
  Oyuncunun henüz satın alamayacağı bir basamağı isteyen taban, taban değil
  duvardır.
- **Aşama 2'nin `upgradesBought`'u 0'a indi.** Üç mülklük taban zaten üç satın
  alma demek; ikisini birden istemek tek fikri iki kez fiyatlandırmaktır.

---

## 5. Kullanıcı arayüzü — dünyanın kendisi arayüz

Her mülk kendi dünya çıpasında bir noktacık taşır; seçildiğinde yanına — üstüne
değil — kart açılır:

- **BİLGİ** — ne olduğu, hangi seviyede, ne sağladığı, ne kadarının kullanımda
  olduğu.
- **İNŞA ET** — sonraki seviye, fiyatı, süresi, nasıl görüneceği ve
  alınamıyorsa **hangi gereksinimin eksik olduğu.**

Karttaki hiçbir sayı bileşende hesaplanmıyor. "Bunu alabilir miyim" ve "bu neden
kilitli" dahil her şey `UiBridge`'te, simülasyonun kendi kodundan türetiliyor.
Bunu kendi hesaplayan bir bileşen, satın almanın sonra farklı uyguladığı bir
kuralın ikinci uygulaması olurdu — bir kartın reddedilen bir işlemin üstünde
yeşil görünmesi tam olarak böyle olur.

Tarayıcıda doğrulanan kilit metni örneği: Aşama 1'de ana binanın kartı
**`CEPHE SV. 2 GEREKLİ`** yazıyor — "gereksinimler karşılanmadı" değil,
`missingProperties`'in döndürdüğü ilk gerçek eksik.

---

## 6. İnşaat — ikinci bir mekanizma yok

`upgradeProperty` parayı alır ve `pendingBuilds`'e `propertyId` taşıyan bir
satır iter. `advancePendingBuilds` sayaç dolduğunda seviyeyi uygular — bir
makinenin seviyesini uyguladığı **aynı dalda**.

Bundan iki davranış bedavaya geliyor ve ikisi de tarayıcıda doğrulandı:

- Kartın geri sayımı şantiyenin kendi `remainingMs`'i, dolayısıyla 2× yarıya
  indirir ve duraklatma dondurur.
- Seviye, onu üreten binadan önce gelemez — çünkü `propertyLevels`'ı yazan tek
  yer tamamlanma dalı.

---

## 7. Bu pasonun bulduğu, yönergenin sormadığı dört kusur

Dördü de **kod doğruydu ve yanlış görünüyordu** sınıfından. Hiçbiri var olan
bir testle yakalanmadı; üçünü tarayıcı buldu, dördüncüsünü bir golden farkı.

### 7.1 🔴 Aşama 1'de satın alınan otopark hiçbir şey teslim etmiyordu

`layoutFor` yer sayısını **aşamanın kendi listesine** kırpıyordu. Aşama 1 dört
yer yazıyor, seviye 2 beş yer demek — `min(4, 5) = 4`. Yani oyuncu ₡5 ödüyor,
inşaat işliyor, seviye yükseliyor, kart "5 araç" diyor ve **arsa değişmiyor.**
Satın aldığı şeyin işe yaraması için önce evrilmesi gerekiyordu.

Simülasyonun içinden görünmez: her seviye, her fiyat ve her hash doğruydu.
`tests/e2e/inspectCard.spec.ts` bunu **hiç oynamayan bir kapasite okuması**
olarak yakaladı.

**Düzeltme:** yer koordinatları artık **yazılmış en uzun listeden** dilimleniyor
(dört liste iç içe geçmiş; `properties.test.ts` bunu kanıtlıyor). Kapı:
`stageLayouts.test.ts` — her (aşama, seviye) çifti için araçlar birbirinin
üstünde değil, masaların üstünde değil, arsanın dışında değil.

### 7.2 🔴 Otoparkın önizlemesi aynı anda iki yönde yalan söylüyordu

Sanat sınıflandırması bir boolean'dı (`artKnown`). Otoparkın hiç sprite'ı yok
(prosedürel — zemine boyanıyor) ama `artKnown: true` yazıyordu. Sonuç: kart
`data-art="real"` niteliğinin altında **"Görsel üretimde"** gösteriyordu —
kimsenin çizmediği bir resmin beklenmesini isteyen, aynı anda o resmin var
olduğunu iddia eden bir kutu.

**Düzeltme:** üç yollu tip — `sprite` / `prompted` / `procedural`. Otopark artık
önizlemede **yerlerin kendisini** çiziyor: seviyenin açtığı yeni yer vurgu
renginde. Kapı: `properties.test.ts` — bir `sprite` seviyesi atlasın taşımadığı
bir kareyi adlandıramaz, bir `procedural` seviye sprite adlandıramaz, ve bir
`sprite` seviyesi altındaki seviyenin karesini tekrarlayamaz.

### 7.3 🔴 Otoparkın noktacığı asfaltın üstünde çiziliyordu

Çıpa, yapılmış yerlerin **ortalamasıydı**. Aşama 1 dört yerini iki çift hâlinde
yazıyor (x 2.5/7.5 ve 16.5/21.5), dolayısıyla ortalama x = 12 — aralarındaki
boşluk, yani tezgâha giden yol ve ekranda **taşıt yolu**. Aritmetik baştan sona
doğruydu.

**Düzeltme:** her çıpa artık **bir şey**: ortaya en yakın yer, sıranın ortasındaki
yuva, çizilmişse ızgaranın kendisi. İki kural bunu tutuyor: otoparkın çıpası
canlı yerlerden biri olmalı, ve iki çıpa birbirine bir metreden yakın olamaz —
tek noktada iki 44 px dokunma hedefi, "düğme bazen çalışmıyor" demektir.

---

### 7.4 🔴 Hedef kartı, dayattığı kapının bir maddesini bilmiyordu

Mülk tabanı Aşama 2'nin `upgradesBought` basamağının yerine geçti — ve hedef
kartı bunu öğrenmedi. Sonuç: nakdi ve müşteri sayısını karşılayan oyuncu **iki
tik, üçüncü satır yok ve evrim düğmesi yok** görüyordu; tek açıklama dünyadaki
doğru nesneye tıklamanın arkasındaydı.

**Nasıl bulundu:** görsel golden farkından. `panel-settings` camının arkasından
görünen hedef kartı bir satır kaybetmişti, ve "neden bir satır eksik" sorusunun
cevabı bu kusurdu. Golden tam olarak bunun için var.

**Düzeltme:** kontrol listesi mülk satırlarını kazandı (`Otopark Sv. 1 / 2`), ve
liste uzadığı için HUD'ın ölçülü ekran payını (1024×768'de %22) aştı — %22,19.
**Bütçe gevşetilmedi:** satır ritmi sıkıştırıldı (boşluk 4→2 px, işaret
15→13 px) ve **hiçbir satır gizlenmedi**, çünkü satır gizleyen şey kontrol
listesi değildir.

---

## 8. Balance kapısı — iki kez kırmızı, iki kez kök neden

**1. Her politika `stage-2-timing: never` dedi.** Bir tempo sorunu değil, bir
körlük sorunu: politikalar yükseltme alıp personel işe alıyor, hiçbiri
mülklerden haberdar değildi, dolayısıyla dört arketip de taban karşılanmadan
sonsuza kadar koştu. Hatanın olduğu yerden düzeltildi — `PolicySnapshot`
`missingProperties` kazandı ve `common()` işe almadan önce en ucuz eksiği
kapatıyor.

**2. Aşama 2 varışı 25,0 dk çıktı, 22 dk tavanına karşı.** Taban, eski
gereksinimin istemediği ≈₡22'yi ekliyor. İki sayı birlikte oynadı — otopark Sv.2
₡9 → **₡5** ve Aşama 2 eşiği ₡140 → **₡125** — böylece oyuncunun toplam
harcaması kabaca yerinde kaldı ve varış pencereye döndü.

**Hiçbir eşik gevşetilmedi.** Pencere, bütçe ve kapsam eşikleri olduğu yerde.

---

## 9. Kayıt / determinizm

| Alan                         | Şema    | Göç                                           |
| ---------------------------- | ------- | --------------------------------------------- |
| `progression.propertyLevels` | **v15** | v14 → `parking = min(3, stage)`               |
| `pendingBuilds[].propertyId` | **v15** | yok → `''` (makine ya da yükseltme şantiyesi) |

Otoparkı aşamanın kendi değerine varsaymak, **mevcut her kaydı ve ölçülmüş her
balance sayısını tam olarak yerinde tutan** şey: Aşama 2 kaydı otopark Sv.2'ye
göç eder, ki bu zaten sahip olduğu beş yerdir.

`propertyLevels` `World.hash()`'e girer (sonucu değiştirir), günlüklenen bir
komutla yazılır ve hiçbir duvar saatinden türemez. Aynı tohum + aynı komut
günlüğü ⇒ aynı seviyeler, aynı inşaat durumu, aynı hash. Determinizm süiti
**61/61**.

---

## 10. Varlık kapsaması (§23)

18 mülk×seviye satırı, dördü de açıkça sınıflandırılmış, hiçbiri boş:

**8 DOĞRULANMIŞ VARLIK · 7 DIŞ PROMPT GEREKLİ · 3 TASARIMDA PROSEDÜREL · 0 KASITLI GÖRSELSİZ · 0 sınıflandırılmamış**

Yedi promptun **altısı yeni** (P315–P320); yedincisi cephe Sv.2 için 2026-08-22'de
zaten dosyalanmış olan **P307** — aynı varlığı iki kez sipariş etmemek için yeni
numara verilmedi.

Katalog **değiştirilmedi, yeniden üretildi**: `auditPrompts.ts`'e altı satır,
`assetRequirements.json`'a altı satır eklendi ve `pnpm assets:prompts:html`
sayfayı kaynaktan yazdı — 314 → **320 prompt, 26 batch**, kapsama **0 eksik / 0
tekrar / 0 yetim**.

Tam metin ve eşleme:
[`LEVEL_ASSET_EVOLUTION_LIBRARY.md`](LEVEL_ASSET_EVOLUTION_LIBRARY.md).

**Lisans durumu değişmedi ve "geçti" diye yazılmıyor.** `assets/LICENSES.md`
§1.5'teki 2026-08-21 yönetici geçersiz kılması yürürlükte; bu altı prompt aynı
kapsamın içinde ve yeni tedarikçi eklemiyor.

---

## 11. Doğrulama kanıtı

Her satır bir komut çıktısından. `pnpm verify` **exit 0** — ve exit kodu
borudan değil, günlüğe yazılan `$?`'den okundu (boru çıkış kodu yalan söyler,
`ui-world-correction-pass` notu).

| Kapı                               | Sonuç                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm lint`                        | temiz                                                                                            |
| `pnpm format:check`                | temiz                                                                                            |
| `pnpm typecheck`                   | tsc ×3 + svelte-check **355 dosya, 0 hata, 0 uyarı**                                             |
| `pnpm depcruise`                   | **0 ihlal** (207 modül, 805 bağımlılık)                                                          |
| `pnpm knip`                        | temiz                                                                                            |
| `pnpm assets:validate`             | **279 varlık, 0 failing** (75 kabul edilmiş istisna, 20 aile-dışı uyarı)                         |
| `pnpm assets:prompt-coverage`      | **37 / 37**, eksik 0 · tekrar 0 · yetim 0 — kanonik 289, superseded 31, **toplam 320**           |
| `pnpm assets:build`                | tüm bütçeler limit içinde; ağaçta 6 yer tutucu                                                   |
| `pnpm test:coverage`               | **134 dosya / 1748 test geçti**; ifade %93.68 · dal **%85.15** · fonksiyon %94.03 · satır %95.87 |
| `pnpm balance:check`               | **5 geçti / 1 atlandı**, 79.1 s                                                                  |
| `pnpm bench:sim`                   | **22 geçti**, 70.1 s                                                                             |
| `pnpm build` + `pnpm size`         | JS **503.41 / 550 kB** gzip · CSS **9.64 / 30 kB**                                               |
| `pnpm test:determinism`            | **61 / 61**                                                                                      |
| `pnpm e2e` (Chromium + Firefox)    | **248 geçti, 12 atlandı, exit 0**                                                                |
| Görsel goldenlar (pinli konteyner) | **24 / 24**; **3 dosya değişti**, üçü de panel                                                   |
| `pnpm e2e:smoke` (WebKit)          | **KOŞULMADI** — aşağıya bakın                                                                    |

### Değişen üç golden, tek sebep

`panel-settings` · `panel-staff` · `panel-analytics-empty`. **On sekiz dünya
goldeni değişmedi** ve bu şans değil, yapısal: dünya goldenleri `hideHud=1` ile
açılıyor, yani yeni noktacık katmanı hiç mount edilmiyor.

Değişen üç panel cam yüzeyli ve **arkalarındaki hedef kartı** görünüyor. O kart
iki kez değişti: mülk tabanı satırlarını kazandı (Aşama 2'nin `upgradesBought`
satırı düşerken otopark/servis/cephe satırları geldi) ve sonra HUD'ın ekran
payına sığmak için sıkıştırıldı. Her fark tek tek açıldı ve bakıldı; ölçüm:
`panel-settings`'te farklı piksellerin **%94'ü** 133–203 satır bandında, yani
tam olarak camın arkasındaki liste. Otomatik kabul edilen tek golden yok.

### WebKit — koşulmadı, "geçti" değil

```
browserType.launch: Host system is missing dependencies to run browsers.
sudo apt-get install libevent-2.1-7t64
```

Bu makinede `libevent-2.1-7t64` yok. Önceki pasodan devralınan ortam kısıtı,
kod hatası değil, ve **geçti diye yazılmıyor**.

### Bu pasoda hiçbir eşik gevşetilmedi

Kapılar üç kez kırmızıya döndü ve üçünde de düzeltilen **kod** oldu:

1. Dal kapsaması %84.58 (eşik %85) → yeni kod için 27 test yazıldı
   (`propertyCards.test.ts`, `properties.test.ts`'in geri düşüş dalları) →
   **%85.15**. Eşik yerinde.
2. Aşama 2 varışı 25,0 dk (tavan 22) → gereksinim ve fiyat birlikte oynadı →
   pencere içinde. Pencere yerinde.
3. HUD ekran payı %22,19 (bütçe %22, 1024×768 Firefox) → hedef kartının satır
   ritmi sıkıştırıldı (boşluk 4→2 px, işaret 15→13 px), **hiçbir satır
   gizlenmeden** → geçti. Bütçe yerinde.

---

## 12. Yapılmayanlar ve kullanıcıya kalan kararlar

### Kapsam dışı bırakılanlar, sebepleriyle

- **Var olmayan seviye sanatı.** Yedi mülk seviyesi promptlu; görüntü
  üretemiyorum (PROJECT_MEMORY checkpoint N). O seviyeler alınabilir durumda,
  etkileri gerçek, ve önizlemeleri resmin henüz yapılmadığını **söylüyor** —
  mevcut kareyi yenisiymiş gibi göstermiyor.
- **Aşama 1'de dış mekân oturması.** Aşama 1'e masa koymak `ServiceSystem`'i
  garson taşımalı teslimata çevirir ve 2026-08-23'te teslim edilen tezgâh
  devralma modelini geri alır. Bu bir tasarım değişikliği; değişiklik talebi
  ister.
- **Aşama 3/4 gelir kalibrasyonu.** Önceden var olan ADR-016 sınırı.

### Kullanıcının önündeki kararlar

1. 🔴 **Yol/arsa yapısı** — S4 kapasite bloğu. Menü: `STAGE_2_4_CALIBRATION_REPORT` §4.
2. 🔴 **GDD §8 ⊗ §6.1** — S2'nin `CALIBRATED_STAGES` üyeliği.
3. 🟠 **Dış üretim** — bu paso **6 kalem ekledi** (P315–P320). Bekleyenler:
   P307–P314, P309/P310, P291–P293, 23 ses, 1 OFL font.
4. 🟠 **Cephe merdiveni üç seviye derinlikte sanatını aşıyor.** `hand-painted-sign`
   dört basamak satıyor, biri resmi değiştiriyor. Daha az basamak + her birine
   kendi resmi bir seçenek — ama bu `PROGRESSION_DESIGN`'a bir değişiklik talebi,
   burada verilecek bir karar değil.
5. 🟠 **Altı brifingsiz arayüz referansı** — `docs/assets/level-1..6-interface.png`
   çalışma ağacında duruyor, izlenmiyor, hiçbir şey tarafından kullanılmıyor ve
   ne için oldukları bilinmiyor. Sessizce kaybolmasınlar diye kayda geçti.

---

## ✅ RESTAURANT EVOLUTION DESIGN + IMPLEMENTATION COMPLETE

Tasarım, uygulama, varlık kapsaması, tarayıcı doğrulaması ve tam doğrulama
zinciri tamam. Yedi mülk seviyesinin sanatı **teslim edilmedi ve edilemez** —
görüntü üretemiyorum — ama bu bir eksik uygulama değil: o seviyeler alınabilir,
etkileri gerçek, promptları dosyalı, ve kartları resmin henüz yapılmadığını
söylüyor. Kapsam dışı bırakılan her şey §12'de sebebiyle birlikte yazılı.

**P19 NOT STARTED**

**STOP — WAITING FOR USER REVIEW**
