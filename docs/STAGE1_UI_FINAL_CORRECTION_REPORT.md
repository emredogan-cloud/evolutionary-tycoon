# STAGE 1 UI FINAL CORRECTION SONUCU

> 2026-08-23 · dal `feat/stage1-product-expansion` · `90f178d` üzerine.
> Kullanıcının dört maddelik düzeltme yönergesi. Her madde için **ÖNCE →
> KÖK NEDEN → DÜZELTME → SONRA**, ve her "sonra" gerçek Chromium'dan.
>
> Ölçülmemiş hiçbir sayı yok. Koşulmamış hiçbir komut "geçti" diye yazılmadı.

---

## 0. Tarayıcı temeli — koddan önce

Dört sorunun dördü de **kod değiştirilmeden önce** canlı Chromium'da üretildi
(`localhost:4173`, seed 424242, üretim derlemesi). Kullanıcının 12:01–12:05
arasında aldığı dört ekran görüntüsü (`assets/Screenshot from 2026-08-23 …`)
temel kayıt; her biri kendi maddesinde tekrar üretildi.

| #   | Konu            | Temelde görülen                                                                |
| --- | --------------- | ------------------------------------------------------------------------------ |
| A   | Tezgâh + tente  | Tente tezgâhın **üstüne yatmış**; vitrin, kasa, içecekler, saksı görünmüyor    |
| B   | Ağaçlar         | Gövdenin dalları **havada kesik**, tepe ayrı bir kütle olarak yukarıda duruyor |
| C   | Hazırlık sayacı | `Limonata · Hazırlanıyor · **243 sn**`, ilerleme çubuğu **boş**                |
| D   | Aşçı            | Aşçı işe alınınca oyuncunun servis döngüsünde **hiçbir eylemi kalmıyor**       |

---

## 1. Stand + Canopy

### Kök neden

Tente **tezgâhın ne üstünde ne de yanında**; sprite'ın kendi kütlesi
_anchor'ının altında_ asılı, ve 1.75 m yükseklik 1.1 m'lik bir tezgâhın sadece
65 cm üstü. İki teslim edilen sprite'ı yerleşim koordinatlarında üst üste
bindirip **kaç pikselinin örtüldüğünü saydım** — tahmin değil, sayım:

|          Tente z | Tezgâhın örtülen alanı | **Üst bandı** (tepsi, kasa, vitrin, saksı) |
| ---------------: | ---------------------: | -----------------------------------------: |
|  **1.75** (önce) |                    %47 |                                    **%87** |
|             2.40 |                    %14 |                                        %34 |
|             2.60 |                     %6 |                                        %16 |
| **2.80** (şimdi) |                 **%2** |                                     **%5** |

Yani eski yerleşim, standın "burada yemek satılıyor" diyen her şeyinin
**neredeyse tamamını** kumaşın altına almıştı. Kullanıcının "absürt" dediği şey
buydu; 2026-08-22 pasosu tenteyi apronda yatarken kaldırmıştı ama tezgâhın
üstüne indirmişti.

### Denenen düzeltmeler (yönergenin istediği sıra)

anchor · z · derinlik · dünya yüksekliği · offset · asset ölçeği — hepsi
denendi ve **ölçüldü**, offline kompozisyonla (aynı projeksiyon matematiği) ve
sonra tarayıcıda:

- **anchor / dünya kutusu**: teslim edilen tente 4.0 × 2.5 × 0.9 m'lik kutusunu
  zaten %12 aşıyor. Kutuyu küçültmek doğrulayıcıyı kırar — bu bir **değişiklik
  talebi**, bir config düzenlemesi değil (CLAUDE.md: eşikler geçsin diye
  indirilmez).
- **mirror / flipX**: izometride yatay ayna X ve Y eksenini takas eder, 180°
  döndürmez — makara barı kuzeyden batıya geçer, tezgâhın arkasına değil.
- **y kaydırma**: kuzeye alınca bar park yuvalarının üstüne, güneye alınca
  kanopi tamamen tezgâhın arkasına düşüyor. İkisi de daha kötü.
- **z**: tek işe yarayan eksen, ve yukarıdaki tablo tam olarak bunun ölçümü.

### Karar: **TENTE KALDI** — (12, 12.6, z **2.8**)

Yönerge kaldırmayı yetkilendiriyordu; kaldırılmadı, çünkü düzeltilmiş hâli
kabul listesinin sekiz maddesinden yedisini **ölçülerek** karşılıyor:

| Kabul maddesi         | Durum | Kanıt                                              |
| --------------------- | ----- | -------------------------------------------------- |
| müşteri görünür       | ✅    | tarayıcı: dört müşteri, hepsi tam boy              |
| tezgâh görünür        | ✅    | üst bandın %95'i açık (ölçüldü)                    |
| çalışan görünür       | ✅    | tarayıcı: aşçı tezgâhın önünde baştan ayağa        |
| tenteyi kaplama yok   | ✅    | %2 örtüşme, sadece kabinin uzak köşesi             |
| yüzen nesne yok       | 🟡    | **makara barının altında dayanak yok** — aşağıda   |
| imkânsız derinlik yok | ✅    | `standComposition.test.ts` derinlik sırasını sınar |
| clipping yok          | ✅    | tarayıcı                                           |
| plan tezgâhın üstünde | ✅    | 12.45 → 12.6, tezgâhın kendi noktası               |

**Dürüst kalan kusur:** teslim edilen sanat bir **duvara monte mağaza
tentesi** — makara barı bir duvara vidalanmak için çizilmiş — ve Aşama 1'in
tezgâhında duvar yok. Hiçbir yerleştirme buna dayanak uyduramaz; bu bir
_sanat_ uyuşmazlığı, bir kompozisyon hatası değil. Kaldırmak yerine düzeltilmiş
yerleşim korundu, çünkü kaldırmak sahnenin "yol kenarı yemek standı" diyen tek
öğesini siler ve yönergenin kendi istediği kompozisyonun son satırını
(`canopy over service counter`) yok eder.

**Kapı:** `tests/unit/render/standComposition.test.ts` — örtüşmeyi teslim
edilen piksellerden her koşuda yeniden ölçer. Eski yerleşimde **%87 ile
kırmızı**; yani bir sonraki "ufak dokunuş" tenteyi tekrar vitrinin üstüne
koyamaz.

---

## 2. Trees

### Kök neden — ölçülerek, göz kararıyla değil

Devam pasosu bu çifti "sağlam" diye kaydetmişti; **yanlıştı, ve neden yanlış
olduğu öğreticidir**: tüm sprite'a bakıldığında çift makul görünüyor. Bakılması
gereken yer **birleşme satırı**.

`WorldScene.drawStatic` üst yarının alt kenarını alt yarının üst kenarına
koyar. Ölçüm: alt yarının **en üst satırındaki opak sütunların yüzde kaçının**
üstünde üst yarıdan malzeme var?

| Çift                           | Kapsama (varsayılan bindirme) | Sonuç                                       |
| ------------------------------ | ----------------------------: | ------------------------------------------- |
| `nature_pole_lamp`             |                      **1.00** | sağlam                                      |
| `struct_sign_large`            |                      **0.93** | sağlam                                      |
| `nature_tree_conifer-01`       |                      **0.85** | sınırda — kullanılmıyor, yine de düzeltildi |
| **`nature_tree_broadleaf-02`** |                      **0.40** | **dört dal ucu boşluğa kesilmiş**           |
| `nature_tree_broadleaf-01`     |                      **0.00** | zaten `lower`-only (P309/P310)              |
| **`struct_truck_lv1`**         |                      **0.00** | **her iki yarı da tam bir kamyon**          |

`broadleaf-02`'nin alt yarısının üst satırında **beş opak parça** var (gövde +
dört dal ucu); üst yarısının alt satırında **bir** (gövde). Kullanıcının
ekran görüntüsündeki "sonradan monte edilmiş" izlenimi tam olarak bu: üçte
ikisi havada biten dallar.

### Düzeltme

`WorldObjectSpec.upperOverlapMetres` — çiftin ne kadar iç içe çizileceği,
**ölçülmüş** bir kompozisyon parametresi:

- `tree-broadleaf-02` → **1.25 m** (80 sanat pikseli). Kapsama 60 px'te 0.90,
  **80 px'te 1.00**; 80'de her kesik dal yaprağın içinde kalıyor ve ağaç tek
  ağaç olarak okunuyor.
- `tree-conifer-01` → **0.5 m** (34 px, ölçülen minimum 31). Hiçbir yerleşim
  kullanmıyor; değer, kullanıldığı gün doğru olsun diye.
- `truck` → **`upperFrame` düşürüldü.** Kapsamı sıfır ve sebebi hizasızlık
  değil: her iki yarı da eksiksiz bir yemek kamyonu. `?stage=2`'de Chromium'da
  **iki kamyon üst üste** çiziliyordu. broadleaf-01'in çözümü aynen uygulandı.

`heightMetres` değişmedi: o, derinlik sıralayıcısının ve navigasyon ızgarasının
kullandığı dünya kutusu, ve `blockFootprint` ızgaraya zaten "bu 0.9 m'lik bir
gövde" diyor.

### Kapsam dışı ama düzeltildi — ve neden

Kamyon Aşama 2. Yönerge kapsamı genişletmeyi yasaklıyor; burada
**doğrudan ilişkili bir kök-neden düzeltmesi** gerekliydi: aynı kusur sınıfı,
aynı bir satırlık çözüm, ve yeni kapı (`splitComposition.test.ts`) onun
üzerinde kırmızıydı. Alternatif, çözümünü bildiğim bir kusur için muafiyet
yazmaktı.

### Tarayıcı sonucu

- `tree-broadleaf-02` (4, 15): kesik dal yok, boşluk yok, dikiş yok, kayan taç
  yok — tek ağaç.
- `tree-broadleaf-01` (20, 14): zaten doğruydu, değişmedi.
- `?stage=2`: tek kamyon.

**Kapı:** `tests/unit/config/splitComposition.test.ts` — `WORLD_OBJECTS`'teki
her bölünmüş çifti teslim edilen PNG'lerden, ilan edilen bindirmeye karşı
ölçer, %90'ın altında kırılır.

### Dış sanat

Yeni teslim **yok** — `docs/assets/sources` son olarak 2026-08-23 04:07'de
değişti (üç UI referansı). P309/P310 regenerasyonları **gelmedi**; durum açık
kaldı. Bu paso dört yeni prompt ekledi: **P311/P312** (broadleaf-02 çifti),
**P313/P314** (kamyon çifti). Katalog kaynaktan yeniden üretildi; kapsama
**0 eksik / 0 çift / 0 yetim**.

---

## 3. Preparation Timer

### Önceki birim → doğru birim

**Kök neden tek satır**, ve iki saat arasında bir epoch farkı:

```ts
// src/app/bridge/UiBridge.ts, refillOrders()
const nowMs = world.tick * TICK_MS; // 0'dan başlar
// ama her sipariş damgası:
order.startedAtMs = world.clock.simTimeMs; // 240 000'den başlar
```

`World` saati `DEFAULT_GAME_START_HOUR = 8` ile açılır:
`(8 / 24) × MS_PER_GAME_DAY(720 000)` = **240 000 ms**. Tarayıcıda doğrulandı:
tick 42'de `simTimeMs = 242 100` = `240 000 + 42 × 50`. Tam olarak.

Sonuç, üç ayrı yerde aynı hata:

| Alan              | Hesap                            | Ekranda                          |
| ----------------- | -------------------------------- | -------------------------------- |
| `cookRemainingMs` | `süre − (0 − 240 000)`           | 5 sn'lik limonata → **245 000**  |
| `cook01`          | `(0 − 240 000) / süre` → clamp 0 | **çubuk hiç dolmuyor**           |
| `ageMs`           | `max(0, 0 − 240 000)`            | her sipariş **sonsuza dek 0 sn** |

Kullanıcının 12:05 görüntüsü bu aritmetiğin ekrandaki hâli: `243 sn` + boş
çubuk. 243 = 240 (epoch) + kalan ~3.

### Düzeltme

`world.clock.simTimeMs` — **sihirli bölen değil**, siparişlerin damgalandığı
saatin ta kendisi. Sabit hiçbir sayı eklenmedi/çıkarılmadı.

### Nihai gösterim

`X sn`, tam saniye, yukarı yuvarlanmış; 60 sn üstü `m:ss`. Ondalık yok.

Yönergenin iki kuralı burada çatışıyor — "5 4 3 2 1 görsün" ve "kalan süreden
uzun bir sayı gösterme". Aşağı yuvarlamak ikinciyi karşılar, birincisini kırar:
5.0 sn'lik bir içecek `4`'ten başlar ve son tam saniyeyi hâlâ pişerken `0 sn`
göstererek geçirir. Yukarı yuvarlama tam olarak ilan edilen hazırlık süresinden
başlar, onu asla aşmaz, ve fazlalık her zaman **bitmemiş bir saniyenin
içinde** kalır. Seçim burada kayda geçiriliyor.

### 1× / 2× / 4× / duraklat

`tests/e2e/prepTimer.spec.ts`, gerçek Chromium, **DOM'dan okunarak** (test
kancasından değil — kanca zaten hep doğru cevabı veriyordu):

| Senaryo                       |   Beklenen | Ölçülen |
| ----------------------------- | ---------: | ------: |
| kart açılışı (Aşama 1)        |      1..30 |      ✅ |
| 3 simüle saniye               |         −3 |      ✅ |
| duraklat + 1.2 sn gerçek süre |          0 |      ✅ |
| 1× (20 tick)                  |         −1 |      ✅ |
| 2× (40 tick)                  |         −2 |      ✅ |
| 4× (80 tick)                  |         −4 |      ✅ |
| Hazır → Servis et → ödeme     | kasa artar |      ✅ |

Hız testi Aşama 2'de koşuyor ve nedeni kayıtta: Aşama 1'in en uzun hazırlığı
6.5 sn'lik sosisli, 1+2+4 = 7 sn'yi taşımıyor. Hamburgerin 30 sn'si Aşama
2'de. Kartın altındaki saat aynı saat.

### Regresyon kapıları

`tests/unit/app/orderCards.test.ts` — dört yeni/düzeltilmiş iddia, hepsi
**eski kodda kırmızı**, kanıtı alındı:

```
× marks exactly the kitchen-startable order   expected +0 to be 200
× reports cook progress while COOKING         expected 0 to be greater than 0
× counts the preparation down …               expected 245000 to be <= 5000
× never reports more time left …              expected 245000 to be <= 5000
```

Fikstürün kendisi de düzeltildi: `stageOrder` damgaları artık dünya saatinden
alıyor. Eskisi `startedAtMs: -500` gibi **hiçbir dünyada var olamayacak**
negatif zaman damgaları kullanıyordu — köprü bir tick sayacından bir saat
okumasını çıkarırken yeşil kalmasının sebebi buydu.

---

## 4. Cook

Tam tasarım: [`COOK_PLAYER_INTERACTION_DESIGN.md`](COOK_PLAYER_INTERACTION_DESIGN.md).
Beş aday (A–E) orada **ölçülerek** karşılaştırıldı.

### Eski davranış

Aşama 1'in servis döngüsünde oyuncunun **tek** eylemi vardı — `MANUAL_PREP` —
ve teslim, yemek pass'e ulaştığı tick'te kendiliğinden oluyordu
(`ServiceSystem.deliver`). ₡20'lik aşçı `PREP_ORDER`'ı tahtadan alınca geriye
hiçbir şey kalmıyordu. Aynı satırın iki kaydı daha vardı ve kimse bağlantıyı
kurmamıştı: PHASE_8_REPORT §6 "24 000 tick'in **sıfırında** pass'te tabak" ve
STAGE1_STAFF_SYSTEM §2 "oyuncu da pişirirken aşçı **%2'nin altında**".

### Ölçülen problem

Aşama 1, dört simüle saat, seed 424242, aşçı **her satırda** işe alınmış:

| Senaryo                    | Servis | Gelir | Aşçı meşgul |         Oyuncu komutu |
| -------------------------- | -----: | ----: | ----------: | --------------------: |
| oyuncu yok (eski davranış) |    487 | ₡2526 |         ~%4 |                     0 |
| oyuncu **servis yapıyor**  |      — |     — |           — | fark edecek eylem yok |

Presence'ın değeri **tam olarak sıfırdı**.

### Seçilen sorumluluk bölüşümü

```
AŞÇI    → mutfak. Siparişi alır, tezgâha koyar.
OYUNCU  → pass. Hazır tepsiyi kime önce vereceğine karar verir ve verir.
GARSON  → salon. Aşama 3'ten itibaren masaya taşır (görür görmez).
```

Hazır tepsi pass'te **`COUNTER_HANDOVER_MS` = 4 000 ms** oyuncuyu bekler.
İçinde: oyuncunun (`SERVE_ORDER`). Sonrasında: uygun herhangi bir personel
devralır — yani **stand oyuncusuz da çalışmaya devam eder**. Tezgâh
devralmasında **her rol** pencereyi bekler; garson dâhil, ki Aşama 1'de garson
almak döngüyü değil yedeği satın alsın.

### Ölçümler

| Senaryo                      | Servis | Gelir | Terk | Zayi | Aşçı meşgul |   Komut |
| ---------------------------- | -----: | ----: | ---: | ---: | ----------: | ------: |
| **A1** aşçı, oyuncu yok      |    467 | ₡2426 |    0 |    0 |       %4.09 |       0 |
| **A1** aşçı, oyuncu servis   |    489 | ₡2548 |    0 |    0 |       %2.41 | 288 000 |
| **A1** aşçı, oyuncu her şeyi |    492 | ₡2555 |    0 |    0 |       %0.03 | 576 000 |
| **A2** aşçı, oyuncu yok      |    370 | ₡3864 |    3 |    4 |      %10.06 |       0 |
| **A2** aşçı, oyuncu servis   |    542 | ₡5690 |    4 |    4 |      %13.01 | 288 000 |
| **A2** aşçı, oyuncu her şeyi |    537 | ₡5635 |    3 |    2 |       %2.11 | 576 000 |

**Oyuncu eylemleri/dk:** servis yapan oyuncu için tepsi başına 1 tıklama —
Aşama 2'de dört saatte ~542, yani **~2.3 anlamlı tıklama/dk**. (Tablodaki
288 000 rakamı harness'ın her tick'te komut yollaması; oyuncu tepsi başına bir
kez basar.)

**Oyuncu varken / yokken:**
Aşama 1 **+%4.7 servis**, Aşama 2 **+%46 servis, +%47 gelir**.
Eğim doğru yönde: stand büyüdükçe oyuncunun değeri **artıyor**.

**Aşçı kullanımı:** ~%4 → **%10–13** (Aşama 2). Aşçının artık iki tür işi var.

### Neden bu daha ilgi çekici

Üç ölçülmüş sebep:

1. **Presence bir şey ediyor, ve büyüdükçe daha çok ediyor.** Oyuncunun her
   geçen dakika daha az önemli olduğu bir idle oyunu, biten bir oyundur.
2. **Sahipsiz stand durmuyor.** ₡2426 / ₡3864 kimse oynamazken. Attended
   olandan düşük — asıl mesele bu.
3. **Delege etmek her şeye tıklamaktan iyi.** Aşama 2'de yalnız-servis 542,
   her-şeyi-tıkla 537; ve aşçı **altı kat** daha meşgul (%13.0 / %2.1). En iyi
   oyun, mutfağı aşçıya bırakıp tezgâhı kendin tutmak — bunu UI söylemiyor,
   simülasyon üretiyor.

### Dürüst maliyet

**Pişirip servis etmeyen oyuncu artık hiç kazanmıyor**: dört saatte 0 servis,
267 terk, 268 zayi. Önceden pişirmek tek başına döngüydü. Bu, birinci dakikada
gerçek bir öğrenme eşiği; hafifletme "güvenlik ağı" değil **görünürlük**: hazır
kart, `Hazırla`'nın durduğu yerde ve aynı biçimde **yeşil `Servis et · +₡x,xx`**
düğmesi gösteriyor. Kayda geçiriliyor, süpürülmüyor.

### Aşama 3 sızıntısı — tarayıcıda yakalandı

İlk sürüm oyuncunun her aşamada servis yapmasına izin veriyordu.
`tableService.spec.ts` kırmızıya döndü: Aşama 3'te oyuncunun teslimi
müşterileri **tezgâhta** yakalıyor, kimse masasına yürümüyordu — oturma
mekaniği sessizce hiç çalışmıyordu. `SERVE_ORDER` artık yalnız masasız
aşamada; salon taşınır, uzatılmaz.

### Personel paneli

```
AŞÇI                                            ₡20
Siparişleri kendi hazırlar. Sen tezgâhta
değilken servisi de ayakta tutar.
✓ Mutfağı yönetir, siparişleri hazırlar
✓ Sen yokken tezgâhı da devralır (4 sn sonra)
✕ Servisi senin yerine üstlenmez
✕ Fiyat, satın alma ve yerleşim kararı vermez
```

`tests/unit/ui/roleDuties.test.ts` bu satırların her birini rol tablosuna ve
pencere sabitine karşı sınar — panel, simülasyonun yapmadığı bir otomasyonu
satamaz.

---

## Verification

Tüm çıktılar bu makinede, bu dalda alındı.

| Kapı                   | Sonuç                                   | Komut                         |
| ---------------------- | --------------------------------------- | ----------------------------- |
| ESLint                 | **temiz**                               | `pnpm lint`                   |
| Prettier               | **temiz**                               | `pnpm format:check`           |
| tsc ×3 + svelte-check  | **0 hata, 0 uyarı** (352 dosya)         | `pnpm typecheck`              |
| dependency-cruiser     | **0 ihlal** (204 modül, 780 bağımlılık) | `pnpm depcruise`              |
| knip                   | **temiz**                               | `pnpm knip`                   |
| Birim + entegrasyon    | **1684 geçti / 130 dosya**              | `pnpm test`                   |
| Determinizm            | **61/61**                               | `pnpm test:determinism`       |
| Balance kapısı         | **5 geçti, 1 atlandı · 68.1 s / 90 s**  | `pnpm balance:check`          |
| Asset doğrulama        | **279 asset, 0 failing**                | `pnpm assets:validate`        |
| Prompt kapsama         | **0 eksik / 0 çift / 0 yetim** (314)    | `pnpm assets:prompt-coverage` |
| E2E Chromium + Firefox | **234 geçti, 12 atlandı · exit 0**      | `pnpm e2e`                    |
| Görsel goldenlar       | 15 bilinçli fark, konteynerde yenilendi | `pnpm test:visual:update`     |

### Yeni testler

| Dosya                                        | Ne kanıtlıyor                                     |
| -------------------------------------------- | ------------------------------------------------- |
| `tests/unit/config/splitComposition.test.ts` | her bölünmüş çift birleşme satırında ≥ %90        |
| `tests/unit/render/standComposition.test.ts` | tente tezgâhın üst bandının ≤ %10'unu örter       |
| `tests/unit/ui/roleDuties.test.ts`           | panelin her iddiası rol tablosuyla uyuşur         |
| `tests/e2e/prepTimer.spec.ts`                | sayaç birimi, 1×/2×/4×/pause, servis → ödeme      |
| `cookAutomation.test.ts` (+5 test)           | pencere, presence değeri, delege etme, rol sınırı |

### Görsel golden farkları — bilinçli

15 golden değişti. Fark görüntüleri **tek tek incelendi**; her karede yalnız
üç şey değişiyor ve üçü de bu pasonun kendisi:

1. tentenin yeni yüksekliği,
2. broadleaf-02'nin inen tacı,
3. Aşama 2+'da tek kamyon.

`stage1-empty` farkında kırmızı olan **sadece** o iki nesne; yol, zemin, lamba,
tabela, çalılar bit-özdeş. Goldenlar pinli konteynerde (`playwright:v1.62.1-noble`)
yenilendi.

---

## Remaining Issues

Gerçek olanlar, ve hiçbiri gizlenmiyor:

1. 🟠 **Tentenin makara barının dayanağı yok.** Teslim edilen sanat duvara
   monte bir mağaza tentesi; Aşama 1 tezgâhında duvar yok. Yerleştirmeyle
   çözülemez. Kaldırma yetkisi kullanılmadı (§1'deki gerekçe); direkli bir pazar
   kanopisi bir sonraki sanat turunun konusu.
2. 🟠 **P309–P314 dış üretimde.** broadleaf-01 çifti (P309/P310) hâlâ gelmedi;
   bu paso broadleaf-02 (P311/P312) ve kamyon (P313/P314) çiftlerini ekledi.
   Dördü de `PRESENT + NEEDS REGEN`, runtime geçici çözümlerle çalışıyor.
3. 🟠 **P291–P293 rol ikonları** hâlâ NEEDS REGEN (bu paso değiştirmedi).
4. 🟡 **Pişirip servis etmeyen oyuncu sıfır kazanır.** Tasarımın kabul edilmiş
   maliyeti (§4). İlk dakikada öğrenilmesi gereken bir şey; düğme bunun için
   `Hazırla` ile aynı yerde ve aynı biçimde.
5. 🔴 **Kullanıcı kararları hâlâ açık** — yol/arsa yapısı (S4 kapasite bloğu),
   GDD §8 ⊗ §6.1 (`CALIBRATED_STAGES`), S7 i18n, perf yedeği 5→8 ms, dış
   üretim (23 ses + 1 font + görsel kalemler). Bu paso hiçbirini kapatmadı ve
   hiçbirini kötüleştirmedi.
6. ⚪ **WebKit smoke** bu makinede kurulamıyor (`libevent-2.1-7t64` eksik) —
   önceki pasodan devralınan ortam kısıtı.

---

## Final State

✅ STAGE 1 UI FINAL CORRECTION COMPLETE

```
1  Stand + Canopy   ✅  %87 → %5 örtüşme, ölçülerek; kalan kusur sanatın, kayıtta
2  Trees            ✅  0.40 → 1.00 birleşme kapsaması; kamyon da düzeldi
3  Prep Timer       ✅  240 000 ms'lik epoch hatası kökten; 243 sn → 6 sn
4  Cook             ✅  sorumluluk bölüşümü; presence A2'de +%46 servis
```

P19 NOT STARTED
STOP — WAITING FOR USER REVIEW
