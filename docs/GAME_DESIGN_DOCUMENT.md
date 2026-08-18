# GAME DESIGN DOCUMENT — Evolutionary Tycoon

**Sürüm:** 1.0 · **Tarih:** 2026-08-14 · **Durum:** GATE 0 — onay bekliyor
**İlgili:** [WORKING_DISCIPLINE](WORKING_DISCIPLINE.md) · [TECHNICAL_ARCHITECTURE](TECHNICAL_ARCHITECTURE.md) · [ECONOMY_DESIGN](ECONOMY_DESIGN.md) · [ASSET_PIPELINE](ASSET_PIPELINE.md)

---

## 1. Tek cümlelik vizyon

**Yol kenarındaki minicik bir limonata tezgâhını, önünden akan gerçek trafiği müşteriye çevirerek bir restoran imparatorluğuna dönüştürdüğün, canlı bir izometrik minyatür dünya.**

## 2. Core fantasy — oyuncunun hissetmesi gereken şey

> "Şu yoldan geçen arabalar var ya — onları **ben** durduruyorum."

Bu oyunun duygusal merkezi bir tablo değil, bir **pencere**. Oyuncu yol kenarında oturuyor ve önünden bir araç akışı geçiyor. Her araç, kaçırılmış veya kazanılmış bir fırsat. Tabelayı büyüttüğünde daha çok araç yavaşlıyor. Sıra uzadığında arabalar frene basıp vazgeçiyor ve devam ediyor — ve oyuncu bunu **görüyor**.

Tycoon oyunlarının çoğunda talep bir sayıdır. Burada talep, ekranın içinden geçen ve izlenebilen fiziksel bir şeydir. Bütün tasarım bu tek farkın etrafında kurulur.

## 3. Hedef oyuncu

|              |                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Birincil** | 18–40 yaş, tarayıcıda kısa oturumlar oynayan casual/mid-core; tycoon ve yönetim oyunlarına aşina; "optimize etmek" hoşuna gidiyor |
| **İkincil**  | Idle/incremental oyuncuları — uzun vadeli birikim ve offline ilerleme bekliyorlar                                                 |
| **Üçüncül**  | Şehir/trafik simülasyonu izlemeyi seven "ambient" oyuncular                                                                       |
| **Cihaz**    | %55 masaüstü/laptop, %45 mobil tarayıcı (hedef karma)                                                                             |
| **Oturum**   | 3–8 dakika tipik, 20+ dakika "derin" oturum, günde 2–4 oturum                                                                     |
| **Beklenti** | İndirme yok, kayıt yok, 5 saniyede oyunda                                                                                         |

## 4. Tür konumu ve farklılaşma

**Tür:** Real-time management + light idle, izometrik 2D.
**Konum:** "Idle Restaurant Tycoon"un erişilebilirliği ile bir trafik simülasyonunun somutluğu arasında.

Rakip analizi ve bu oyunun ne yapacağı için bkz. [RESEARCH_NOTES §10](RESEARCH_NOTES.md#10-rakip--tür-analizi) ve [GAME_EXECUTION_ROADMAP §31](GAME_EXECUTION_ROADMAP.md).

---

## 5. Core gameplay loop

### 5.1 Mikro döngü (saniyeler)

```
Yol                    Araç akışı sürekli devam eder
 ↓
DECIDE noktası         Araç, restoranın ~40 m öncesindeki karar noktasına gelir
 ↓
Dönüşüm testi          P(convert) hesaplanır → dönmezse geçip gider (ve bu görülür)
 ↓
Sinyal + yavaşlama     Sinyal lambası yanar, araç frenler   ← oyuncuya görsel ödül
 ↓
Giriş                  Yola sapar
 ↓
Park / Drive-thru      İki farklı hizmet kanalı, farklı kısıtlar
 ↓
Sipariş                Müşteri menüden seçer (fiyat + kalite + hız tercihine göre)
 ↓
Hazırlık               İstasyonlar çalışır, kuyruk oluşur
 ↓
Teslim                 Drive-thru penceresi veya garson
 ↓
Ödeme + bahşiş         Memnuniyete göre
 ↓
Ayrılış                Araç yola geri döner, akışa karışır
 ↓
Gelir + itibar
```

### 5.2 Makro döngü (dakikalar–saatler)

```
Gelir → Yatırım kararı → Fiziksel inşa (görünür) → Kapasite/çekicilik artar
  → Daha fazla dönüşüm → Yeni darboğaz ortaya çıkar → Yeni yatırım kararı
  → ... → Yeterli sermaye + koşullar → EVRİM (yeni aşama) → döngü yeni sistemlerle tekrar
```

### 5.3 Meta döngü (günler)

```
Günlük hedefler → Kilometre taşları → Yeni menü/mekanik açılımı
  → Offline dönüş raporu → Yeni oturum
```

### 5.4 Neden tatmin edici — üç kapalı geri bildirim halkası

1. **Anlık (0–2 sn):** Bir araç frene basıp sana döndüğünde: sinyal sesi, fren ışığı, toz. Her müşteri kazanımı görsel/işitsel olarak ödüllendirilir.
2. **Kısa (30 sn–2 dk):** Sipariş → hazırlık → teslim → para. Somut, tamamlanabilir.
3. **Orta (5–20 dk):** Darboğazı görürsün, yatırım yaparsın, dünya fiziksel olarak değişir, akış hızlanır.

Bir tycoon oyunu bu üç halkadan biri kırıldığında sıkıcılaşır. Tasarım incelemelerinde her üçü ayrı ayrı sorgulanır.

---

## 6. Ana gerilim: iki kanal, tek darboğaz

Oyunun stratejik derinliği tek bir yükseltme merdiveninden değil, **birbiriyle yarışan iki hizmet kanalından** gelir:

|              | **Drive-thru**                                         | **Dine-in (oturarak)**                       |
| ------------ | ------------------------------------------------------ | -------------------------------------------- |
| Güçlü yanı   | Yüksek throughput, düşük alan                          | Yüksek ticket (sepet) değeri, bahşiş, itibar |
| Zayıf yanı   | Düşük ticket, bahşiş yok, hata affı yok                | Yavaş, çok alan ve personel ister            |
| Darboğaz     | Pencere hizmet süresi, kuyruk uzunluğu                 | Masa sayısı, garson sayısı, mutfak           |
| Sabır        | Çok düşük (araçta bekliyor)                            | Yüksek (oturmuş)                             |
| Başarısızlık | Kuyruk yola taşar → **geçen araçların dönüşümü düşer** | Masa dolar → müşteri girmez                  |

**Ve ikisi aynı mutfağı paylaşır.** Mutfak kapasitesi, iki kanal arasında bölünmesi gereken tek kaynaktır. Oyuncu her an "throughput mu, marj mı" sorusuna cevap verir. Bu, tek bir doğru cevabı olmayan, oyun tarzına göre değişen bir karardır — ve türde nadirdir.

**Kritik ve türde neredeyse hiç görülmeyen mekanik:** Kendi kuyruğunuz yola taşarsa, geçen araçların dönüşüm olasılığı **düşer**. Başarı kendi darboğazını yaratır. Bu, sonsuz üstel büyümeyi mekanik olarak sınırlar (bkz. [ECONOMY_DESIGN §7](ECONOMY_DESIGN.md)).

---

## 7. Evrim sistemi — dört aşama

Evrim bir sahne değişimi değildir. **Aynı arsa üzerinde fiziksel inşaat** olarak gerçekleşir; kamera aynı yerde kalır, yapı büyür. Oyuncu, ilk günkü limonata tezgâhının hâlâ bir köşede durduğunu görebilmelidir (dekoratif "kökler" objesi olarak korunur).

### Aşama 1 — ROADSIDE STAND (Yol Kenarı Tezgâhı)

**Süre:** ~10–15 dk · **Amaç:** Core loop'u öğret

|                |                                                                             |
| -------------- | --------------------------------------------------------------------------- |
| Yapı           | Tek tezgâh, tente, el yazısı tabela                                         |
| Menü           | Limonata, sosisli, cips                                                     |
| Kapasite       | 1 hazırlık istasyonu, 1 bekleme noktası, park yok (araç yol kenarına çeker) |
| Personel       | Yok — oyuncu tıklayarak hazırlar                                            |
| Trafik         | Düşük yoğunluk, çoğunlukla sedan                                            |
| Yeni sistemler | Trafik, dönüşüm, sipariş, hazırlık, ödeme, temel yükseltme                  |
| Oyuncu eylemi  | Manuel: tıkla-hazırla, tıkla-ver                                            |

**Öğretme sırası (tutorial değil, tasarım yoluyla):** Önce sadece bir araç gelir ve tek şey yapılır. Sonra ikinci araç ilki hazır olmadan gelir → oyuncu kuyruğu keşfeder. Sonra bir araç sabırsızlanıp gider → oyuncu sabır sistemini keşfeder. Sonra tabela yükseltmesi açılır → oyuncu dönüşümü keşfeder. **Hiçbir açıklama metni gerekmez.**

### Aşama 2 — FOOD TRUCK (Yemek Kamyonu)

**Süre:** ~30–45 dk · **Amaç:** Otomasyon ve kuyruk yönetimi

|                |                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Yapı           | Kamyon, açılır pencere, çakıl park alanı (3–5 yer), aydınlatmalı tabela                                   |
| Menü           | + Hamburger, patates kızartması, kola                                                                     |
| Kapasite       | 2–3 istasyon (ızgara, fritöz, içecek), gerçek hazırlık süreleri                                           |
| Personel       | İlk çalışan: **Aşçı** (oyuncuyu manuel hazırlıktan kurtarır)                                              |
| Trafik         | Orta yoğunluk, araç tipleri çeşitlenir (kamyonet, minibüs = grup müşteri)                                 |
| Yeni sistemler | İstasyon paralelliği, çalışan, ücret, park yeri, sipariş kuyruğu, yemek "hazır bekleme" süresi (sıcaklık) |

**Aşama geçişi:** Aşama 1'in darboğazı "oyuncunun tıklama hızı"dır. Aşçı bunu çözer ve yeni darboğaz "istasyon sayısı" olur. Her aşama geçişi eski darboğazı çözüp yenisini ortaya çıkarır — bu, evrim tasarımının değişmez kuralıdır.

### Aşama 3 — SMALL DINER (Küçük Lokanta)

**Süre:** ~2–4 saat · **Amaç:** Mekânsal yönetim ve NPC koreografisi

|                |                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Yapı           | Kapalı bina, giriş kapısı, 4–8 masa, tezgâh, mutfak arkası, tuvalet, asfalt park                                                            |
| Menü           | + Kahvaltı seti, tavuk, tatlı, kahve                                                                                                        |
| Kapasite       | Masa sayısı yeni birincil kısıt                                                                                                             |
| Personel       | Aşçı ×N, **Garson** ×N, **Temizlikçi**                                                                                                      |
| Trafik         | Yoğunluk dalgaları, gün içi tepe saatler belirginleşir                                                                                      |
| Yeni sistemler | Yürüyen müşteri, masa döngüsü, garson state machine, temizlik/kirlilik, atmosfer, sabır (oturarak), grup müşteri, iç mekân layout düzenleme |

Bu aşamada oyun bir **koreografi** oyununa dönüşür: garsonun kat ettiği yol, masa yerleşimi, mutfak-tezgâh mesafesi ölçülebilir biçimde önemli hâle gelir. Layout artık dekorasyon değil, performans.

### Aşama 4 — LARGE RESTAURANT (Büyük Restoran)

**Süre:** açık uçlu · **Amaç:** Sistem ustalığı ve ölçek

|                |                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Yapı           | Genişletilmiş bina, ayrı **drive-thru şeridi** (sipariş direği + pencere), 2 kasa, endüstriyel mutfak, geniş park (12–20 yer), bahçe/teras |
| Menü           | Tam menü, kampanyalar, mevsimlik ürünler                                                                                                   |
| Personel       | Şef, aşçı, garson, kasiyer, temizlikçi, park görevlisi, kurye                                                                              |
| Trafik         | Karmaşık: sağa/sola dönüş, otobüs, kamyon, VIP, acil durum araçları                                                                        |
| Yeni sistemler | Drive-thru kanalı, çoklu kasa, personel vardiyası ve yorgunluk, kurye/paket servis, kampanya, olaylar, hava durumu                         |

---

## 8. NPC mimarisi — durum makineleri

Tüm NPC'ler açık, test edilebilir sonlu durum makineleridir. **Işınlanma yasak** — her geçiş fiziksel hareket veya süre gerektirir. Her durum makinesi `src/sim/ai/` altında saf fonksiyon olarak yaşar ve unit test edilir.

### 8.1 Müşteri (araçlı)

```
DRIVING ──────► DECIDING ──┬──► PASSING_BY (dönüşüm başarısız → akışa devam)
                           │
                           └──► ENTERING ──► CHOOSING_CHANNEL
                                                  │
              ┌───────────────────────────────────┴─────────────────────┐
              ▼ (drive-thru)                                            ▼ (dine-in)
      DT_QUEUEING                                                  SEEKING_PARKING
              ▼                                                          ▼
      DT_ORDERING                                          PARKING ──► NO_SPACE ──► LEAVING_ANGRY
              ▼                                                          ▼
      DT_WAITING_AT_WINDOW                                      WALKING_TO_DOOR
              ▼                                                          ▼
      DT_RECEIVING                                              QUEUEING_AT_COUNTER / WAITING_FOR_TABLE
              ▼                                                          ▼
      PAYING                                                        SEATED ──► ORDERING
              ▼                                                          ▼
      DT_EXITING                                                    WAITING_FOR_FOOD
              ▼                                                          ▼
      REJOINING_ROAD ──► (despawn)                                    EATING
                                                                         ▼
                                                                      PAYING
                                                                         ▼
                                                              WALKING_TO_CAR ──► EXITING ──► REJOINING_ROAD
```

**Her bekleme durumundan çıkış:** `patience` sıfırlanırsa → `ABANDONING` → `LEAVING_ANGRY`. Terk eden müşteri **itibarı düşürür** ve bunu görünür şekilde yapar (öfke balonu, kapıyı çarpma, lastik sesi).

### 8.2 Garson (Waiter)

```
IDLE
 └─► RECEIVE_TASK        (görev dağıtıcıdan; öncelik: bekleyen sipariş > hazır yemek > kirli masa)
      └─► WALK_TO_TABLE
           └─► TAKE_ORDER          (süre: skill'e bağlı)
                └─► WALK_TO_KITCHEN
                     └─► SUBMIT_ORDER
                          └─► (IDLE'a dön veya taşınabilir görev al)
IDLE
 └─► PICKUP_TASK
      └─► WALK_TO_PASS              (mutfak geçiş penceresi)
           └─► PICK_UP_FOOD         (kapasite: skill'e göre 1–3 tabak)
                └─► WALK_TO_TABLE
                     └─► SERVE
                          └─► IDLE
IDLE
 └─► CLEAN_TASK
      └─► WALK_TO_TABLE
           └─► CLEAN_TABLE
                └─► IDLE
```

**Multitasking:** Yüksek skill'li garson, aynı yönde birden fazla görevi zincirleyebilir (siparişi al + geçerken hazır tabağı da götür). Bu, yükseltmenin **görünür** bir sonucudur.

### 8.3 Aşçı (Cook)

```
IDLE ─► CLAIM_ORDER (kuyruktan, FIFO + öncelik) ─► WALK_TO_STATION
     ─► PREP (süre = recipe.baseTime / (station.speed × cook.skill))
     ─► PLATE ─► PLACE_ON_PASS ─► IDLE
```

İstasyon meşgulse `WAITING_FOR_STATION`. Malzeme yoksa `BLOCKED_NO_STOCK` (Faz 12+).

### 8.4 Temizlikçi (Cleaner)

```
IDLE ─► SCAN (en yüksek kirlilik puanlı hedef) ─► WALK_TO_TARGET ─► CLEAN ─► IDLE
```

Hedefler: kirli masa, yerdeki çöp, dökülme, tuvalet, park alanı. Kirlilik zamanla ve trafikle birikir; atmosfer puanını düşürür.

### 8.5 Kasiyer / Park görevlisi / Kurye

Aşama 4'te açılır. Aynı `Task → Walk → Perform → Return` iskeleti; farklı görev havuzları.

### 8.6 Ortak iskelet

Tüm çalışanlar tek bir `EmployeeBrain` üzerinde çalışır:

```ts
type EmployeeState = 'IDLE' | 'MOVING' | 'PERFORMING' | 'BLOCKED';
// Görev tipleri role'e göre değişir; state machine aynıdır.
```

Bu, dört ayrı state machine'i test etmek yerine bir iskeleti + rol başına görev tablosunu test etmemizi sağlar.

### 8.7 Görev dağıtımı

Merkezi `TaskBoard`: açık görevler puanlanır (`aciliyet × ödül − mesafe × maliyet`), boşta olan en uygun çalışana atanır. Deterministik: eşitlikte entity ID'ye göre kararlı sıralama. Bu, "iki garson aynı masaya koşuyor" saçmalığını yapısal olarak engeller.

---

## 9. Trafik simülasyonu

Trafik rastgele değildir. **Tohumlanmış (seeded), deterministik, katmanlı** bir sistemdir.

### 9.1 Yol topolojisi

- İki şeritli yol, sahneden çapraz geçer (izometrik).
- Her şerit bir **polyline spline**, arc-length parametrize (`s` = yol boyunca mesafe).
- Restorana giriş/çıkış: şeritten ayrılan ve birleşen kısa bağlantı spline'ları.
- Aşama 4'te: sola dönüş (karşı şeridi kesme) → gerçek bir tıkanma kaynağı.

### 9.2 Araç hareketi

1B araç-takip modeli (IDM-lite): her araç önündeki araca göre ivmelenir/yavaşlar.

```
a = a_max × [ 1 − (v/v_desired)^4 − (s*/gap)² ]
s* = s_min + max(0, v×T + v×Δv / (2√(a_max×b)))
```

Ucuz, kararlı, gerçekçi görünen dalga-halinde tıkanma üretir (arkadan gelen araçların "akordeon" etkisi). Tam çarpışma fiziği yok — gerek de yok.

### 9.3 Spawn ve yoğunluk

```
spawnRate(t) = baseRate
             × dayCurve(hour)        // 24 noktalı, elle çizilmiş eğri
             × dayOfWeek(day)
             × weather(state)
             × eventModifier
             × stageTrafficMultiplier   // restoran büyüdükçe yol da canlanır
```

Spawn zamanları deterministik bir Poisson süreci ile üretilir (`traffic` RNG stream'inden). Aynı seed + aynı gün = aynı trafik. Bu, "Day Replay" özelliğinin temeli.

**Gün eğrisi (tepe saatler):**

```
06 ▁  07 ▃  08 ▆  09 ▄  10 ▃  11 ▅  12 █  13 █  14 ▅  15 ▃
16 ▄  17 ▆  18 █  19 ▇  20 ▅  21 ▃  22 ▂  23 ▁  00-05 ▁
```

Sabah kahvaltı tepesi, öğle tepesi, akşam tepesi. Her tepenin farklı müşteri arketip karışımı var.

### 9.4 Araç arketipleri

| Arketip          | Yolcu | Dönüşüm eğilimi                 | Tercih              | Not                                         |
| ---------------- | ----- | ------------------------------- | ------------------- | ------------------------------------------- |
| `SEDAN_COMMUTER` | 1     | Orta                            | Hız > fiyat         | En yaygın; sabah/akşam tepesi               |
| `FAMILY_VAN`     | 3–5   | Yüksek (öğle)                   | Oturarak, kalite    | Yüksek ticket, çok masa ister               |
| `PICKUP_WORKER`  | 1–2   | Yüksek (sabah)                  | Hız, ucuz, doyurucu | Drive-thru sever                            |
| `SPORTS_CAR`     | 1–2   | Düşük                           | Kalite, atmosfer    | Yüksek bahşiş, yüksek beklenti              |
| `TRUCK_LONGHAUL` | 1     | Orta (gece)                     | Park kolaylığı      | Büyük park yeri ister; gece dönüşümü yüksek |
| `BUS_TOUR`       | 8–15  | Çok düşük ama devasa            | Kapasite            | Nadir; "olay" gibi hissettirir              |
| `MOTORCYCLE`     | 1     | Orta                            | Hız                 | Park yeri gerektirmez                       |
| `EV_MODERN`      | 1–2   | Şarj istasyonu varsa çok yüksek | Modern atmosfer     | Aşama 4 yükseltme kancası                   |
| `VIP_LIMO`       | 2     | Nadir, koşullu                  | En yüksek kalite    | İtibar eşiği üstünde belirir; büyük ödül    |
| `EMERGENCY`      | —     | Dönüşmez                        | —                   | Trafiği keser, olay yaratır                 |

### 9.5 Dönüşüm modeli

Karar noktası restoranın ~40 m öncesinde. Tek bir olasılık hesabı:

```
P(convert) = clamp01(
    archetype.baseAffinity
  × visibility          // tabela boyutu/ışık, bina yüksekliği, gece çarpanı
  × menuAppeal          // menüde arketipin istediği ürün var mı
  × priceFit            // fiyat / arketipin fiyat toleransı
  × queuePenalty        // görünür kuyruk uzunluğu → 1.0 … 0.15
  × spilloverPenalty    // kuyruk YOLA taştıysa sert ceza
  × reputationFactor    // 0.6 … 1.4
  × timeOfDayFit        // kahvaltı menüsü sabah, vb.
  × weatherFactor
  × noveltyDecay        // aynı arketip çok sık dönüştüyse hafif azalır
) × globalDifficultyCurve
```

**Tasarım kuralı:** Her çarpan, oyuncunun **görebildiği** ve **etkileyebildiği** bir şeye karşılık gelir. Görünmez bir çarpan yoktur. Oyun içi "Dönüşüm Analizi" paneli, son 100 aracın neden dönmediğini çarpan bazında gösterir — bu, oyunun en önemli UX farklılaştırıcısı (bkz. §14.4).

### 9.6 Olaylar (Aşama 4)

Yol çalışması (şerit kapanır), kaza (tıkanma + kalabalık), festival (yoğunluk ×3), gece kamyoncu akını, kar/yağmur (yoğunluk ↓, oturarak talebi ↑), yakıt zammı (trafik ↓ ama uzun mesafeliler artar). Olaylar deterministik takvimden gelir + tohumlanmış rastgelelik; her olayın görsel/işitsel imzası vardır.

---

## 10. Navigasyon ve pathfinding

Üç katmanlı; her katman farklı bir problemi çözer. Gerekçe ve kanıt: [RESEARCH_NOTES §8](RESEARCH_NOTES.md#8-pathfinding-kanıt-ve-karar).

| Katman            | Kim                         | Yöntem                                                                     | Neden                                                                                    |
| ----------------- | --------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **1. Şerit**      | Araçlar (yolda)             | Spline üzerinde 1B ilerleme + IDM                                          | Araçlar labirentte gezmez, şeritte ilerler. Arama gereksiz.                              |
| **2. Manevra**    | Araçlar (park, drive-thru)  | Önceden yazılmış Bézier manevra spline'ları                                | Park etme bir arama problemi değil, bir animasyon problemi.                              |
| **3. Flow field** | Yayalar (müşteri + çalışan) | 0.5 m grid, hedef başına önceden hesaplanmış vektör alanı + ayrım steering | Az hedef, çok ajan, küçük harita, nadir layout değişimi = flow field'ın ideal senaryosu. |
| **Fallback**      | Nadir dinamik hedefler      | A*                                                                         | Tek seferlik hedefler (dökülme temizliği) için.                                          |

**Flow field detayı:** Her adlandırılmış hedef (`counter`, `kitchen_pass`, `table_3`, `exit`, `bin_1`, `dt_window`, `parking_slot_7`) için hedeften geriye Dijkstra ile bir integration field, ondan bir vektör alanı üretilir. Hesaplama yalnızca layout değiştiğinde (oyuncu inşa/taşıma yaptığında) tetiklenir, oyun döngüsünde değil. 64×64 grid × 20 hedef × 2 float ≈ 650 KB — sorun değil.

**Yerel çakışma:** Ajanlar birbirinin içinden geçmez ama itmez de — hafif ayrım (separation) kuvveti + kapı/koridor gibi dar geçitlerde sıra (queue slot) sistemi. Tam RVO gereksiz karmaşıklık; kapı önünde "kuyruk noktası" listesi çok daha okunaklı davranış üretir.

---

## 11. Yemek, sipariş ve servis

### 11.1 Menü öğesi veri modeli

```ts
interface MenuItem {
  id: string;
  stage: 1 | 2 | 3 | 4; // hangi aşamada açılır
  station: StationType; // GRILL | FRYER | DRINK | PREP | COFFEE | DESSERT
  baseCost: number; // malzeme maliyeti
  basePrice: number; // varsayılan satış fiyatı (oyuncu ayarlayabilir)
  prepTimeMs: number;
  qualityBase: number; // 0..1
  holdToleranceMs: number; // ne kadar süre sıcak/taze kalır
  appealTags: AppealTag[]; // FAST | HEARTY | PREMIUM | BREAKFAST | SWEET | VEGGIE
  satiety: number; // grup siparişinde kaç kişiyi doyurur
}
```

### 11.2 Sipariş akışı

```
Order oluştur (müşteri tercihine göre 1..N MenuItem)
  → Kitchen kuyruğuna gir (öncelik: drive-thru > oturan > paket, sonra FIFO)
  → Aşçı claim eder → istasyon rezerve → PREP → PLATE → pass'e koy
  → Pass'te bekleme başlar (sıcaklık düşer → kalite düşer)
  → Garson/pencere alır → teslim
  → Yeme süresi (oturarak) → Ödeme
```

### 11.3 Sıcaklık / tazelik

Pass'te bekleyen yemek `holdToleranceMs` sonrasında kalite kaybeder:

```
quality = qualityBase × (1 − max(0, (heldMs − holdTolerance) / holdDecayMs) × 0.6)
```

Bu, "çok fazla aşçı, çok az garson" konfigürasyonunu cezalandırır — sistemler arası gerçek bir bağ.

### 11.4 Fiyatlandırma

Oyuncu ürün başına fiyatı ayarlayabilir (±%50 bant). Yüksek fiyat → marj ↑, dönüşüm ↓, beklenti ↑ (aynı kalite daha az memnun eder). Düşük fiyat → tersi. Bu, tek düğmeyle stratejik derinlik ekleyen en ucuz mekanik.

---

## 12. Müşteri memnuniyeti modeli

```
satisfaction = clamp01(
    w_wait     × waitScore          // gerçek bekleme / beklenen bekleme
  + w_quality  × foodQuality        // tarif kalitesi × istasyon × aşçı skill × tazelik
  + w_price    × priceValueScore    // (algılanan değer − fiyat) / tolerans
  + w_service  × serviceScore       // garson hızı, hata, dikkat
  + w_clean    × cleanliness        // masa, zemin, tuvalet
  + w_atmos    × atmosphere         // dekor, müzik, kalabalık, ışık
  + w_access   × accessibility      // park kolaylığı, giriş, kuyruk deneyimi
) × archetypeWeighting
```

Ağırlıklar arketipe göre değişir: `PICKUP_WORKER` için `w_wait` yüksek, `w_atmos` neredeyse sıfır; `SPORTS_CAR` için tersi.

**Çıktılar:**

| Çıktı          | Formül                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------- |
| Yıldız (1–5)   | `round(1 + satisfaction × 4)`                                                            |
| Bahşiş         | `price × tipCurve(satisfaction)` — 0.6 altında sıfır, 0.9 üstünde hızla artar            |
| Tekrar gelme   | `P(repeat) = baseRepeat × satisfaction²` — kare, çünkü "iyi" yetmez, "çok iyi" gerekir   |
| İtibar deltası | `(satisfaction − 0.6) × reputationSensitivity` — 0.6 nötr çizgi                          |
| Ağızdan ağıza  | Yüksek memnuniyet, o arketipin gelecekteki `baseAffinity`'sini hafifçe artırır (sönümlü) |

**Görünürlük kuralı:** Memnuniyet sadece bir sayı değildir. Müşterinin beden dilinde okunur — kollarını kavuşturma, saate bakma, ayak sallama, gülümseme, arkadaşına yemeği gösterme. Oyuncu HUD'a bakmadan da salonun havasını hissedebilmelidir.

---

## 13. Yükseltme sistemi

### 13.1 Tasarım kuralları

Her yükseltme **dört** şeye sahip olmak zorunda:

1. **Maliyet** (ve gerekirse ön koşul)
2. **Ölçülebilir etki** (bir simülasyon parametresi)
3. **Görsel geri bildirim** (dünyada gözle görülür değişiklik — istisnasız)
4. **Oynanış sonucu** (yeni karar veya çözülen darboğaz)

Bu dördünden birini sağlayamayan yükseltme **oyuna girmez**. Bu kural, "+%5 hız" tarzı anlamsız yükseltme yığınlarını en baştan keser.

### 13.2 Yükseltme aileleri

**Görünürlük & Çekicilik** _(dönüşüm ↑)_

| Yükseltme             | Etki                                                   | Görsel                       |
| --------------------- | ------------------------------------------------------ | ---------------------------- |
| Tabela boyutu I–IV    | `visibility` ↑                                         | Tabela fiziksel olarak büyür |
| Neon / LED aydınlatma | Gece `visibility` ↑↑                                   | Gece sahnesi tamamen değişir |
| Yol kenarı bilboard   | Karar noktası daha erkeye taşınır → yavaşlama süresi ↑ | Yolda yeni obje              |
| Menü panosu           | `menuAppeal` ↑, sipariş süresi ↓                       | Okunabilir pano              |
| Peyzaj / cephe        | `atmosphere` ↑, `SPORTS_CAR`/`FAMILY_VAN` affinity ↑   | Bitki, boya, aydınlatma      |

**Mutfak** _(throughput ↑)_

| Yükseltme                                   | Etki                      | Görsel                 |
| ------------------------------------------- | ------------------------- | ---------------------- |
| İstasyon ekle                               | Paralel hazırlık ↑        | Yeni ekipman görünür   |
| İstasyon seviyesi I–III                     | `prepTime` ↓, `quality` ↑ | Ekipman modeli değişir |
| Otomasyon (fritöz timer, içecek dispenseri) | Aşçı meşguliyeti ↓        | Otomatik animasyon     |
| Pass ısıtıcısı                              | `holdTolerance` ↑         | Pass'te ısı lambası    |
| Depo / stok                                 | Malzeme kesintisi riski ↓ | Arka oda dolar         |

**Kapasite & Alan**

| Yükseltme                | Etki                              | Görsel                    |
| ------------------------ | --------------------------------- | ------------------------- |
| Park yeri ekle/genişlet  | `SEEKING_PARKING` başarısızlığı ↓ | Asfalt genişler, çizgiler |
| Masa ekle / masa tipi    | Oturma kapasitesi ↑               | Masalar belirir           |
| Sıra düzenleme (bariyer) | Kuyruk yola taşma eşiği ↑         | Bariyerler                |
| Bina genişletme          | Alan ↑                            | İnşaat → yeni duvarlar    |

**Drive-thru** _(Aşama 4)_

| Yükseltme             | Etki                         | Görsel                       |
| --------------------- | ---------------------------- | ---------------------------- |
| Şerit uzunluğu        | Kuyruk kapasitesi ↑, taşma ↓ | Şerit uzar                   |
| İkinci sipariş direği | Sipariş alma paralel         | Yeni direk                   |
| Pencere hizmet hızı   | `serviceTime` ↓              | Personel animasyonu hızlanır |
| Ön ödeme sistemi      | Pencerede bekleme ↓          | Kart okuyucu                 |

**Personel**

| Yükseltme        | Etki                               | Görsel          |
| ---------------- | ---------------------------------- | --------------- |
| İşe alım         | Yeni ajan                          | Yeni NPC        |
| Eğitim I–III     | `skill` ↑ (hız, hata ↓, multitask) | Üniforma rozeti |
| Ayakkabı/ekipman | `moveSpeed` ↑                      | Görünür ekipman |
| Dinlenme odası   | Yorgunluk ↓                        | Yeni oda        |

### 13.3 Anti-pattern koruması

- **Dead-end yok:** Her yükseltme, bir sonraki darboğazı görünür kılar. Yükseltme ağacı, oyuncuyu asla "yapacak bir şey yok" durumuna sokmaz.
- **Anlamsız artış yok:** `+%3 hız` tarzı yükseltme yasak. Minimum algılanabilir etki: oyuncunun 60 saniye içinde fark edebileceği kadar.
- **Zorunlu yol yok:** Her aşamada en az iki geçerli yatırım stratejisi olmalı (throughput odaklı vs. marj odaklı).

---

## 14. UI / UX yönü

### 14.1 Temel ilke

**Oyun görsel olarak baskın kalır. UI oyunu destekler, örtmez.**
Ekranın en fazla %22'si (masaüstü) / %28'i (mobil) UI kromu olabilir. Bu bir hedef değil, tasarım incelemesinde ölçülen bir kısıt.

### 14.2 HUD (kalıcı)

```
┌──────────────────────────────────────────────────────────────┐
│ ₡ 1.240  ▲+18/dk   ⭐3.8   👥 4/8   🕐 12:40 Sal   ⚙        │  ← üst şerit (kompakt)
│                                                              │
│                                                              │
│                     [ OYUN DÜNYASI ]                         │
│                                                              │
│                                                              │
│  ┌─ Hedef ─────────────┐                    ┌──────────────┐│
│  │ 50 müşteri ağırla   │                    │ 🔨  📋  📊  ││  ← eylem dock'u
│  │ ████████░░ 38/50    │                    └──────────────┘│
│  └─────────────────────┘                                     │
└──────────────────────────────────────────────────────────────┘
```

- Üst şerit: nakit, dakikalık gelir trendi, itibar, doluluk, oyun saati/günü, ayarlar.
- Sol alt: tek aktif hedef (birden fazla hedef aynı anda gösterilmez).
- Sağ alt: 3 birincil eylem — İnşa/Yükselt, Personel, Analiz.
- **Bildirimler:** ekranın sağ kenarında, kendiliğinden kaybolan ince şeritler. Modal asla.

### 14.3 Dünya içi yükseltme (modal-spam'e karşı)

Yükseltmeler bir menüde listelenmez. Oyuncu **dünyadaki nesneye** tıklar; nesnenin yanında küçük, bağlamsal bir kart açılır:

```
        ┌─────────────────────────┐
   🔥   │ Izgara İstasyonu  Lv.2  │
   ▓▓   │ Hazırlık: 8.0s → 6.4s   │
        │ Kalite:   0.72 → 0.80   │
        │ ────────────────────    │
        │ Lv.3 yükselt      ₡ 850 │
        └─────────────────────────┘
```

Tam yükseltme listesi (İnşa menüsü) hâlâ var — ama keşif ve karar dünyada gerçekleşir. Bu, oyunun görsel olarak baskın kalmasını sağlayan tek en önemli UX kararı.

### 14.4 Dönüşüm Analizi paneli — imza özellik

Türde eşi olmayan ekran. Son 100 aracın dönüşüm testini çarpan bazında gösterir:

```
Son 100 araç · 23 dönüştü (%23)

Neden dönmediler?
  Kuyruk çok uzun          ████████████████░░░░  34
  Tabela görünmedi         ██████████░░░░░░░░░░  21
  Menüde istedikleri yok   ██████░░░░░░░░░░░░░░  13
  Fiyat yüksek             ████░░░░░░░░░░░░░░░░   6
  Sadece geçiyorlardı      ██░░░░░░░░░░░░░░░░░░   3

→ En büyük kazanç: kuyruk kapasitesi
```

Bu panel oyuncuya **ne yapacağını söylemez**, ne olduğunu söyler. Karar hâlâ oyuncunun. Bu, tycoon türündeki en yaygın frustrasyonu (görünmez sistemler) doğrudan çözer.

### 14.5 "Uzaktayken" raporu

```
7 saat 12 dakika uzaktaydın

  Servis edilen müşteri      412
  Gelir                    ₡ 8.240
  Gider (maaş + malzeme)   ₡ 3.180
  ────────────────────────────────
  Net                      ₡ 5.060

  ⚠ Seni ne sınırladı:
     Park alanı 6 saat boyunca doluydu — 180 müşteri geri döndü.
     Mutfak kapasiten %94 doluluktaydı.

  [ Topla ]     [ Detay ]
```

Sadece kazancı değil, **neyin sınırladığını** söylemesi bu ekranı bir ödül ekranından bir karar ekranına çevirir.

### 14.6 Ekranlar listesi

Boot/Loading · Ana Oyun (HUD) · İnşa & Yükselt · Personel · Menü & Fiyat · Analiz (dönüşüm, gelir, memnuniyet) · Evrim (aşama geçişi kutlaması) · Uzaktayken raporu · Ayarlar · Duraklat · İlk oturum onboarding

### 14.7 Kamera

- Pan: sürükle / kenar itme / WASD-ok tuşları
- Zoom: tekerlek / pinch, 3 kademe arası serbest (0.6× – 1.8×)
- Sınırlar: arsa + yolun görünür kısmı; oyuncu boşluğa kaybolamaz
- Otomatik odak: evrim, olay, ilk VIP gibi anlarda yumuşak kamera hareketi (atlanabilir)
- Kamera shake: yalnızca anlamlı anlarda (inşaat tamamlanma, kaza) — hiçbir zaman tekrarlayan olaylarda

### 14.8 Responsive

| Cihaz       | Min çözünürlük | Uyarlama                                               |
| ----------- | -------------- | ------------------------------------------------------ |
| Masaüstü    | 1280×720       | Tam layout                                             |
| Laptop      | 1024×640       | Kompakt üst şerit                                      |
| Tablet      | 768×1024       | Dock alta taşınır, kartlar büyür                       |
| Mobil yatay | 667×375        | Minimum HUD, dock alt kenar, safe-area                 |
| Mobil dikey | 375×667        | Dünya üstte, kontrol altta; kamera zoom sınırı daralır |

Tek kod tabanı, tek layout sistemi. **Ayrı mobil sürüm yok.** Dokunma hedefleri ≥44×44 CSS px. Tüm etkileşimler tek parmakla yapılabilir.

### 14.9 Erişilebilirlik

- Tipografi: taban 16px, minimum 14px; oyun içi ölçek 0.9×–1.3×
- **Renkten bağımsız durum:** her durum renk + ikon + şekil + metin ile kodlanır (sabır halkası hem renk hem dolgu hem ikon değiştirir)
- `prefers-reduced-motion`: kamera shake kapalı, partikül azaltılmış, geçişler kısaltılmış — **simülasyon hızı değişmez**
- Ses: master / müzik / SFX / ambiyans ayrı sliderlar; hepsi sıfıra inebilir ve oyun tam oynanabilir kalır
- Klavye: tüm UI klavye ile gezilebilir; oyun içi kısayollar (1-9 hızlı eylem, Space duraklat, Esc geri)
- Kontrast: WCAG AA (metin 4.5:1, UI bileşeni 3:1)
- Dyslexia-friendly font seçeneği
- Ekran okuyucu: HUD değerleri `aria-live="polite"` ile duyurulur (throttled)

---

## 15. Animasyon stratejisi

Detaylı üretim akışı: [ASSET_PIPELINE.md §6](ASSET_PIPELINE.md).

**Temel karar:** Kare-kare sprite sheet **kullanılmıyor**. Karakterler **parça tabanlı rig** ile animasyonlanıyor (gerekçe: [RESEARCH_NOTES §6](RESEARCH_NOTES.md#6-animasyon-iskelet-animasyon-araçlarının-durumu)).

| Kategori          | Yöntem                                        | Notlar                          |
| ----------------- | --------------------------------------------- | ------------------------------- |
| Araç sürüş        | Transform + süspansiyon salınımı (prosedürel) | Tek sprite, eğim/yaylanma kodla |
| Araç fren         | Fren ışığı sprite değişimi + burun daldırma   | 2 frame + transform             |
| Araç dönüş        | Yön sprite'ı (8 açı) + smooth blend           | 8 statik açı yeterli            |
| Karakter yürüme   | Doll rig, prosedürel yürüyüş (sinüs)          | Tek klip, tüm karakterler       |
| Karakter iş yapma | Doll rig, elle yazılmış keyframe klipleri     | ~12 klip toplam                 |
| Karakter tepki    | Doll rig pose + emoji balonu                  | Beden dili birincil             |
| Pişirme efekti    | Partikül + shader (buhar, ateş)               | SpriteGPULayer non-looping      |
| Duman / buhar     | Partikül emitter                              |                                 |
| Işıklar / tabela  | Shader tint + Phaser cone light               | Gece belirginleşir              |
| Kapı              | 3 frame transform                             |                                 |
| UI hover/click    | CSS transition                                | Svelte katmanında, ücretsiz     |
| UI ödül/level-up  | CSS keyframe + partikül overlay               |                                 |

**Kural:** Performansa zarar veren gösteriş animasyonu yok. Her animasyonun bir iletişim görevi var: durum değişimi, geri bildirim, veya dikkat yönlendirme. Süsleme için animasyon eklenmez.

---

## 16. Ses stratejisi

Phaser'ın yerleşik WebAudio yöneticisi + ince bir `AudioDirector` katmanı (gerekçe: [RESEARCH_NOTES §13](RESEARCH_NOTES.md#13-ses)).

| Katman        | İçerik                                            | Davranış                                                                 |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| **Ambiyans**  | Trafik uğultusu, kuş, rüzgâr, gece cırcır böceği  | Sürekli, trafik yoğunluğuna göre karışım; gün saatine göre değişir       |
| **Dünya SFX** | Motor, fren, kapı, korna, ayak sesi               | Mesafeye göre ses ve pan; aynı sesin eşzamanlı sayısı sınırlı (throttle) |
| **Mutfak**    | Cızırtı, fritöz, zil, tabak                       | Aktiviteye bağlı; "restoran doluluk" hissi buradan gelir                 |
| **Müşteri**   | Memnuniyet/hayal kırıklığı vokalizasyonu (dilsiz) | Kısa, tekrar etmeyen varyantlar                                          |
| **UI**        | Tık, onay, hata, para                             | Kısa, düşük ses, asla yorucu değil                                       |
| **İlerleme**  | Yükseltme, evrim, kilometre taşı                  | Nadir ve büyük — değerini korumak için az kullanılır                     |
| **Müzik**     | Hafif, döngüsel, gün saatine göre 3 varyant       | Varsayılan ses seviyesi düşük; kapatılabilir                             |

**Ducking:** İlerleme sesi çalarken ambiyans ve müzik kısılır. **Yorgunluk önleme:** Aynı SFX 400 ms içinde tekrar çalmaz; pitch varyasyonu (±%6) uygulanır.

---

## 17. Offline / idle sistemi

### 17.1 Amaç

Oyuncunun dönüşünü ödüllendirmek — ama oyunu kendi kendine oynayan bir tabloya çevirmemek. Offline kazanç, aktif oyunun **yerine geçmez**, onu **korur**.

### 17.2 Model

```
offlineMs   = clamp(now − lastSeen, 0, OFFLINE_CAP_MS)     // OFFLINE_CAP = 8 saat
effRate     = lastMeasuredThroughput × OFFLINE_EFFICIENCY   // OFFLINE_EFFICIENCY = 0.40
kapasite    = min(effRate, hardCapacityCeiling)             // fiziksel kapasiteyi aşamaz
gelir       = kapasite × offlineMs × avgTicket
gider       = wages × offlineMs + malzeme
net         = gelir − gider                                 // NEGATİF OLABİLİR
```

**Kritik tasarım kararları:**

- **%40 verim:** Offline hiçbir zaman aktif oyundan iyi değil.
- **8 saat tavan:** Bir hafta yok kalmak, bir gece yok kalmaktan daha fazla ödül vermez. Bu, hem sömürüyü hem de "geri dönmek anlamsız" hissini önler.
- **Gider de işler:** Personel maaşı offline'da da ödenir. Aşırı personel alıp gitmek cezalandırılır. Net negatif olabilir (ama nakit sıfırın altına inmez; borç sistemi yok).
- **Fiziksel tavan:** Park alanı 6 yerse offline'da 600 araç ağırlanamaz. Simülasyon değil ama simülasyonun kapasite kısıtları uygulanır.
- **Rapor sınırı gösterir:** Neyin sınırladığı raporda yazar → offline sistem bir **yatırım tavsiyesi motoru**na dönüşür.

### 17.3 Suistimal karşıtı kurallar

| Saldırı                   | Savunma                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Sistem saatini ileri alma | Sunucu zamanı referansı (`HEAD /api/time` → `Date` header). Sapma > 5 dk ise sunucu zamanı kazanır.                       |
| Sunucu erişilemiyor       | Yalnızca yerel monotonik sayaç kullanılır; kazanç `OFFLINE_CAP`'in yarısıyla sınırlanır                                   |
| Saati geri alma           | `lastSeen` monotonik olmayan şekilde geriye giderse: kazanç 0, ceza yok, sessiz log                                       |
| Sekme açık bırakıp AFK    | Görünmeyen sekme (`visibilitychange`) offline sayılmaz; oyun gerçekten simüle eder ama throttled (tarayıcı zaten yapıyor) |
| Tekrar tekrar claim       | `lastSeen` claim anında yazılır; aynı pencere iki kez ödenemez                                                            |
| Save dosyası düzenleme    | Bkz. §18                                                                                                                  |

---

## 18. Güven ve anti-cheat — orantılı strateji

**Tehdit modeli:** MVP tek oyunculu, sunucusuz. Hile yapan oyuncu **yalnızca kendi deneyimini** bozar. Bu, DRM veya obfuscation yatırımını haklı çıkarmaz. Ama üç şey yine de korunur:

| Risk                        | Etki                         | Önlem                                                            | Gerekçe                                                            |
| --------------------------- | ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Save bozulması              | Oyuncu ilerlemesini kaybeder | CRC32 checksum + şema versiyonu + son 3 kaydın rotasyonlu yedeği | Bu güvenlik değil, **veri bütünlüğü**. Gerçek ve sık bir risk.     |
| Offline ödül sömürüsü       | Ekonomi anlamsızlaşır        | §17.3                                                            | Kazara da olabilir (saat dilimi, sistem saati)                     |
| Save düzenleme (nakit)      | Kendi oyununu bozar          | **Önlem alınmaz.** Konsol uyarısı yok, tespit yok.               | Overengineering. Tek oyunculuda oyuncunun kendi save'i kendi malı. |
| Gelecekte: liderlik tablosu | Gerçek risk                  | Command log sunucuda yeniden oynatılarak doğrulanır              | Bkz. aşağıda                                                       |
| XSS / bağımlılık zafiyeti   | Gerçek risk                  | CSP, SRI, `pnpm audit`, CodeQL, Dependabot                       | Standart hijyen                                                    |

**Mimari kanca:** Tüm oyuncu eylemleri bir **command log**'a yazılır (bkz. [TECHNICAL_ARCHITECTURE §5](TECHNICAL_ARCHITECTURE.md)). Bu, bugün replay ve deterministik test için var. Eğer ileride liderlik tablosu eklenirse, sunucu command log'u yeniden oynatıp sonucu doğrulayabilir — **mimariyi yeniden yazmadan**. Bu, bugün maliyeti sıfır olan bir gelecek opsiyonu.

---

## 19. Retention tasarımı

Benchmark'lar: [RESEARCH_NOTES §10](RESEARCH_NOTES.md#10-rakip--tür-analizi). Hedefler: D1 ≥ %35, D7 ≥ %14, D30 ≥ %6 (casual ortalamasının üstü, top-20 idle'ın altı — dürüst hedef).

| Ölçek      | Mekanik                                        | Neden oyunu iyileştiriyor                |
| ---------- | ---------------------------------------------- | ---------------------------------------- |
| İlk 60 sn  | İlk araç 8 saniye içinde gelir ve dönüşür      | Oyunun ne olduğu anlatılmadan gösterilir |
| İlk 5 dk   | İlk yükseltme ve görünür etkisi                | Döngünün kapandığı kanıtlanır            |
| Oturum     | Tek aktif hedef, tamamlanabilir                | Bitmemişlik hissi bırakmaz               |
| Günlük     | 3 günlük hedef (biri her zaman kolay)          | Geri dönüş sebebi; grind değil           |
| Haftalık   | Kilometre taşları (100/500/2000 müşteri)       | Uzun vadeli çerçeve                      |
| Evrim      | Aşama geçişi = büyük görsel kutlama            | En güçlü retention anı; nadir tutulur    |
| Koleksiyon | Araç arketipi "albümü" — hangilerini ağırladın | Pasif, baskısız, keşif ödülü             |
| Başarımlar | ~40 adet, çoğu keşif tabanlı                   |                                          |
| Offline    | "Uzaktayken" raporu + sınır analizi            | Geri dönüşü bilgilendirici yapar         |
| Olaylar    | Hafta sonu festivali, gece kamyoncu akını      | Aynı günün tekrarını kırar               |

**Eklenmeyecek olanlar (bilinçli):** Enerji/can sistemi, zorunlu bekleme kapıları, günlük giriş serisi cezası, FOMO sayaçları, push bildirimi baskısı. Bunlar retention metriğini kısa vadede yükseltir, oyunu kötüleştirir.

---

## 20. Monetizasyon

**MVP'de monetizasyon YOK.** Gerekçe: türün retention'ı oyunun kendisinden gelir; para kazanma mekaniği, oyun kanıtlanmadan eklenirse hem oyunu bozar hem de yanlış sinyal verir. Ayrıca [Vercel Hobby planı ticari kullanıma kapalıdır](RESEARCH_NOTES.md#9-deployment-vercel-vs-flyio) — monetizasyon aynı zamanda bir altyapı kararıdır.

**Faz 24'te değerlendirilecek modeller (öncelik sırasıyla):**

1. **Kozmetik** — tabela tasarımları, bina temaları, personel üniformaları, araç renkleri. Oynanışa sıfır etki. En temiz model.
2. **Tek seferlik "Supporter" satın alımı** — reklamları kaldırır (varsa), kozmetik paketi, bulut kayıt. Pay-to-win değil.
3. **Opsiyonel rewarded video** — yalnızca "offline kazancını 2× yap" ve "bu yükseltmeyi hızlandır" gibi _zaten kazanılan_ şeyler için. Asla zorunlu, asla ilerlemeyi kilitleyen.
4. **Genişleme içeriği** — yeni harita (sahil yolu, dağ geçidi, şehir içi), yeni mutfak türleri.

**Kesin olarak yapılmayacaklar:** Pay-to-win, enerji satışı, ilerleme kilidi, rastgele kutu, agresif interstitial, çocuklara yönelik karanlık desen.

---

## 21. Analitik

Cookieless, kişisel veri yok, opt-out mevcut. Amaç oyunu iyileştirmek; kullanıcı profillemek değil.

**Olaylar:**

```
game_started            { stage, isFirstSession, device, referrer? }
session_started         { returningAfterMs }
session_ended           { durationMs, actionsCount }
tutorial_step           { step, completed }
first_customer_served   { elapsedMs }              ← onboarding sağlık metriği
customer_served         { channel, satisfaction, ticket }   (örneklenmiş, %5)
order_completed         { itemId, prepMs, waitMs }          (örneklenmiş)
upgrade_purchased       { upgradeId, cost, stage, playtimeMs }
restaurant_evolution    { fromStage, toStage, playtimeMs }
offline_reward_claimed  { offlineMs, net, limiter }
objective_completed     { objectiveId, attempts }
economy_snapshot        { cash, income, reputation, stage }  (5 dk'da bir)
bottleneck_detected     { type }                             ← tasarım sinyali
error_occurred          { kind, message }                    (PII temizlenmiş)
perf_sample             { fps_p50, fps_p05, frameMs_p95, entities }  (örneklenmiş)
return_session          { daysSinceFirst, sessionIndex }
```

**En değerli tasarım metrikleri:** `first_customer_served` süresi (onboarding), `bottleneck_detected` dağılımı (denge), `offline_reward_claimed.limiter` (hangi kısıt en çok bağlıyor), evrim başına oynanma süresi (pacing).

---

## 22. Gözlemlenebilirlik (oyuncu tarafı)

- **Hata raporlama:** Env ile açılan hafif bir beacon (MVP), Faz 21'de Sentry değerlendirilir. Kritik oyun hatası (sim exception, save hatası, WebGL context loss) her zaman raporlanır.
- **Performans:** `@vercel/speed-insights` (RUM) + oyun içi `perf_sample` olayı.
- **Deployment sağlığı:** `/health.json` — build SHA, sürüm, asset manifest hash. E2E bunu her deploy'da doğrular.
- **Oyuncu tarafı teşhis:** Ayarlar → "Teşhis bilgisi kopyala" — tarayıcı, GPU, FPS, save sürümü, son 20 log satırı. Kullanıcı bunu bir bug raporuna yapıştırabilir. Otomatik gönderim yok.

---

## 23. Vertical slice tanımı — GATE kriteri

Büyük üretim yatırımından **önce** kanıtlanması gereken dilim. Faz 9 sonunda değerlendirilir.

**İçermesi gerekenler:**
YOL + TRAFİK + RESTORAN (Aşama 1–2) + MÜŞTERİ + SİPARİŞ + YEMEK + ÖDEME + YÜKSELTME + GÖRSEL GERİ BİLDİRİM + KAYIT

**Geçme kriterleri (hepsi zorunlu):**

| #   | Kriter                                                        | Nasıl ölçülür                    |
| --- | ------------------------------------------------------------- | -------------------------------- |
| 1   | 10 dakikalık oturum, kesintisiz ve anlaşılır                  | 3 kişiyle oynatma, sesli düşünme |
| 2   | Oyuncu ilk 60 saniyede ne yapacağını **anlatılmadan** anlıyor | Aynı test, müdahalesiz           |
| 3   | En az 2 anlamlı yükseltme kararı verilmiş ve etkisi görülmüş  | Gözlem                           |
| 4   | Ekran görüntüsü, tür ortalamasının görsel olarak üstünde      | Yan yana karşılaştırma           |
| 5   | Masaüstü 60 FPS, mobilde ≥40 FPS, gerçek cihazda              | PERF_LOG                         |
| 6   | 30 dakikada sıfır kritik konsol hatası, sıfır memory leak     | DevTools                         |
| 7   | Kaydet → yenile → tam geri yükleme                            | E2E                              |
| 8   | "Tekrar oynamak ister miyim?" sorusuna 3/3 evet               | Test notları                     |

**GEÇMEZSE: genişleme durur.** Faz 10+ başlamaz. Core loop düzeltilir ve slice tekrar değerlendirilir. Bu kural, projenin en önemli koruma mekanizması.

---

## 24. Kapsam dışı (açıkça)

Bunlar iyi fikir olabilir ama **bu roadmap'te yok**. Eklenmeleri onay ve roadmap değişikliği gerektirir.

Çok oyunculu · Gerçek zamanlı rekabet · Kullanıcı üretimi içerik · 3D · Mobil native uygulama · Çoklu restoran/şube yönetimi · Tedarik zinciri simülasyonu · Personel kişilik/ilişki sistemi · Hikâye kampanyası · Modlama API'si · Çoklu dil (MVP: TR + EN)

---

## 25. Açık tasarım soruları

Bunlar GATE 0'da cevaplanmadı ve ilgili fazda karara bağlanacak. Şimdi karar vermek erken olurdu.

| #   | Soru                                                         | Ne zaman karara bağlanır         | Neden şimdi değil                                    |
| --- | ------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------- |
| 1   | Zaman ölçeği: 1 oyun günü = kaç gerçek dakika? (aday: 12 dk) | Faz 5 (trafik) — deneyerek       | Trafik yoğunluğu hissi olmadan seçilemez             |
| 2   | Oyuncu manuel müdahalesi Aşama 3+'ta kalmalı mı?             | Faz 10 (çalışan AI)              | Çalışanlar çalışmadan bilinemez                      |
| 3   | Fiyat ayarı ürün başına mı, kategori başına mı?              | Faz 9 (ekonomi)                  | UI karmaşıklığı vs. derinlik dengesi test gerektirir |
| 4   | ~~Masa yerleşimi serbest mi, ızgaraya mı oturuyor?~~         | ✅ **Faz 11'de karara bağlandı** | → §25.1                                              |
| 5   | ~~Aşama geçişi otomatik mi, oyuncu onaylı mı?~~              | ✅ **Faz 11'de karara bağlandı** | → §25.2                                              |
| 6   | Gece oynanışı ayrı bir mekanik mi, yoksa sadece görsel mi?   | Faz 15                           | Kapsam riski; ayrı mekanik olursa büyük              |

---

### 25.1 S4 — Yerleştirme **ızgaraya oturur** (Faz 11, 2026-08-16)

**Karar: grid-snapped.** Izgara adımı navigasyon hücresiyle _aynı sabittir_
(`CELL_SIZE_METRES = 0.5 m`), tercihen değil kasten.

**Ölçüm** (`tests/unit/sim/layout/placementMode.test.ts`, testte kalıyor):

Soru "yarım hücre arayla iki tıklama farklı mı davranır" değil — her iki modda da
davranmalı. Soru, oyuncunun bir hücreyi hedeflerken fiilen isabet ettiği ve gözle
bölemediği **snap havzası** (bir ızgara noktasının ±0.25 m'si) içinde ne olduğu:

| Mod             | Havza içindeki tıklamaların ürettiği farklı "bloke hücre kümesi" sayısı |
| --------------- | ----------------------------------------------------------------------: |
| Serbest         |                                                                 **> 1** |
| Izgaraya oturan |                                                                   **1** |

Yani serbest yerleştirmede, oyuncunun birbirinden ayırt edemediği iki tıklama
komşu bir hücreyi yer ya da yemez. "Bu neyi bloke edecek?" sorusu tıklamadan
**önce** cevaplanamaz hâle gelir.

**Desteklenmeyen bir iddia, düşürülmek yerine kayda geçti:** serbest
yerleştirmenin kabul/ret kararını da hücre-altı nişan hassasiyetine bağlayacağı
beklenmişti. **Bağlamıyor** — bu layout'ta bir hücre boyunca süpürüldüğünde her
ofset aynı kararı verdi. Dolayısıyla ızgara lehine argüman tamamen _hangi
hücrelerin bloke olduğuna_ dayanıyor, kararın kararsızlığına değil. Test bu
kararlılığı de iddia ediyor ki ileride bir layout bunu değiştirirse **kırılsın**.

### 25.2 S5 — Aşama geçişi **oyuncu onaylı** (Faz 11, 2026-08-16)

**Karar: player-confirmed.** `STAGE_TRANSITION_MODE = 'confirmed'`.
Otomatik geçiş kodu duruyor ve tek bir config sabitiyle açılıyor — karar zevkle
değil pacing verisiyle verildiği için, veri değişirse yeniden yazım gerekmesin.

**Ölçüm** (`tests/integration/stageTransitionPacing.test.ts`):

| Seed     | Aşama 1 koşulları karşılandığında | İşlem ortasındaki müşteri | Arsadaki araç |
| -------- | --------------------------------: | ------------------------: | ------------: |
| 424242   |                           55.1 dk |                         3 |             5 |
| 909      |                           54.6 dk |                         6 |            10 |
| 4242     |                           46.7 dk |                         3 |             6 |
| 777      |                           48.1 dk |                         1 |             3 |
| 20260816 |                           55.2 dk |                         4 |             7 |

**Beş seed'in beşinde de koşullar servis ortasında karşılandı.** Bu tesadüf
değil, yapısal: koşullar _insan servis ederek_ karşılanıyor, dolayısıyla
karşılandıkları an tanım gereği insanların servis edildiği bir an.

İnşaat ardından tezgâhı 12–30 saniye aksatıyor. Bunu otomatik tetiklemek, oyuncu
**en meşgulken** tetiklemek demek — tezgâhının yıkılmasını en az istediği an.
Onay, aynı olayı oyuncunun zamanlamasını seçtiği bir karara çeviriyor; koşullar
karşılanmış olarak kaldığı için beklemenin bir maliyeti yok.

**Ek — işletme rezervi (ADR-014, 2026-08-18).** Onay kapısı artık eşiğin üstüne
bir _işletme rezervi_ şart koşuyor: gelecek aşamanın kazanmak için zorunlu
rolleri (Aşama 3-4'te garson) içinden eksik olanların işe alım maliyeti + maaş
sisteminin 3 dakikalık tolerans penceresi boyunca tüm kadronun maaşı. Eşik yine
harcanıyor; rezerv, geçişten sonra elde kalması _garanti edilen_ tutar. Sebep
P12'nin ölçtüğü mahsur kalma: ₡804 ile ₡800'lük Aşama 3'ü kabul eden stant ₡4
ile açılıyor, garson tutamıyor ve gelir kalıcı olarak sıfırlanıyordu. Oyuncu,
normal ve geçerli bir eylemle telafisi olmayan bir duruma girmemeli — kapı artık
bunu mekanik olarak imkânsız kılıyor.

**Aynı ölçümden çıkan ikinci ve daha rahatsız edici sayı:** Aşama 1, tasarlanan
**12–18 dakika** yerine **46.7–55.2 dakika** sürüyor. Bu S5 kararını
değiştirmiyor ama Faz 12'nin düzeltmesi gereken talep kıtlığının progression
tarafındaki görüntüsü. Test bu yanlış sınırı iddia ediyor ve ekonomi ayarlandığında
**kırılacak** — kırılması sinyalin kendisi.
