# UI / WORLD CORRECTION SONUCU

> 2026-08-22 · dal `fix/ui-world-correction` · seed 424242 · tüm gözlemler
> gerçek Chromium oturumunda (taze dev sunucu :5174; kullanıcının :5173
> süreci 504'e takılıydı, dokunulmadı). Temel durum: kullanıcının altı ekran
> görüntüsü (`assets/Screenshot from 2026-08-22 *.png`, artık commit'li).

## 1. Viewport / World Fill

- **Kök neden (üç katman):** (a) zemin bake'i yalnız lot dikdörtgenine
  geriliyordu ve onu elmasa kırpması gereken geometry mask bu Phaser 4
  yapısında sessizce çalışmıyor; (b) çevresi düz renk "etek" — yani boşluk
  hissi veren şey gerçekten boyasız dünyaydı; (c) gece/hava/vinyet katmanları
  viewport boyutlu, scrollFactor-0 dikdörtgenlerdi — scroll'dan muaf ama
  **zoom'dan muaf değil**: 0.6×'te ekranın %60'ına büzülüp dünyanın üstünde
  sert kenarlı karanlık çerçeve olarak yüzüyordu (6. görüntüdeki dikdörtgenler).
- **Düzeltme:** `WorldScene.groundCoverRect` — kamera sınır kutusu, minimum
  zoom'da 3840×2160 viewport'u kapsayacak şekilde büyütülür; bake bu
  dikdörtgenin TAMAMINA ayna-döşenir (kenarlar inşaat gereği dikişsiz),
  simetriyi deterministik ton yıkamaları kırar. Gece/ıslak/yağış/vinyet artık
  her karede kameranın **görünür dünya dikdörtgenine** oturur
  (`EnvironmentLayer.viewRect`, `layoutVignette`). Kamera kuralı
  UI_SYSTEM §7'de.
- **Viewport matrisi:** 1920×1080 ve 1280×720'de canlı doğrulandı (pencere
  yöneticisi tam boyut dayatmayı yok saydı; 1568×771 gerçek viewport'ta üç
  kamera zoom'u — 0.6/1.0/1.8 — tam kaplama ekran görüntülü). Diğer boyutlar
  geometrik olarak kapsanır: kaplama dikdörtgeni ≥ 3840×2160 ÷ 0.6 ve E2E'nin
  yedi-viewport matrisi (P18) aynı build üstünde yeşil. Hiçbir boyutta CSS,
  siyah bant, boyasız kanvas veya dünya kenarı görünmez.
- **Kanıt:** zoom 0.6 tam-dünya karesi; 23:00 gece karesi (perde tam, dikdörtgen yok);
  yağmur karesi (yağış tüm kareyi kaplar); goldenlar `camera-bounds.png` dahil yenilendi.

## 2. Stage 1 Stand

- **Kök neden:** tente ayrı bir statikti — tezgâhın 0.8 m kuzeyinde, **zeminde**
  (z 0). Duvara monte tente sanatı yer bezine dönüşüyordu.
- **Düzeltme:** `(12, 10.85, z 1.75)` — bar tezgâh sırtının üstünde, saçak servis
  yönüne sarkıyor; derinlik sırası doğru (tezgâh önde). Sayaç, işaret, ışıklar
  yerli yerinde; müşteri yaklaşımı temiz.
- **Kanıt:** 1.8× gece ve gündüz zoom kareleri; `stage1-serving.png` goldeni.

## 3. Parking

- **Uygulama:** taşıt yoluna oyulmuş işaretli layby: 5×2.6 m boyalı kutular
  (beyaz kontur, iç beton yıkaması, tekerlek takozu), kutu çizgisi asla taşıt
  yoluna taşmaz; yuva çiftleri tezgâhı iki yandan sarar, aradaki yaya ağzında
  arka bordür düşürülür. Derin sıralar (S2+) kendi asfalt pedlerini alır.
  Araç gövdesi (8.45–10.35) taşıt yolundan (≤8.5) tamamen dışarıda.
- **Sim geometrisi:** yuva merkezleri 2.5/7.5/16.5/21.5 × y 9.4; kapılar
  y 10.75 serbest yürüme satırında. Dört aşamada da `navigationIntact=true`
  (flood-fill probu — varsayım değil ölçüm; S2 kamyonu yürüme bandını
  mühürlediği için güneye taşındı).
- **Araç sınıfları:** uzunluk-farkındalıklı atama (`baySpanFits`): 11 m otobüs
  çiftin ortasını alır ve komşuları bloklar — üstlerine binmez. Sedan+pickup
  yan yana sığar (4.95 ≤ 5). Geometri testi arketip tablosunun tamamını
  kapsıyor (`noOverlap.test.ts`).
- **Kanıt:** park hâlinde pickup/sedan kutu içinde kareleri; S3 lunch karesi
  (4 dolu kutu); goldenlar.

## 4. Vehicle Motion

- **Zeminleme:** park hâlindeki araçlarda bayat `accel` fren durumu bırakıyordu →
  kalıcı burun dalışı; artık fren yalnız hareketliyken (`Sim.copyVehicles`).
  Süspansiyon bob'u mesafe-tahrikli (mevcut), gölge sanatın kendi yumuşak gölgesi.
- **Yön:** sim başlıkları her zaman gerçek teğetlerdi; "yan giden araçlar"ın
  kökü SANATTI — dokuz 2026-08-21 karesi adının vaadettiği yönü göstermiyor
  (tam boy yeşil-zemin okuması; DIRECTION_AUDIT v3). `VEHICLE_FACING_FIXES`
  çalışma anında doğru arka görünümleri ikame eder (kamyonet/van gibi hiç
  arka karesi olmayanlarda fren-farlı arkalar — giden araç fren lambası
  yakabilir, geri geri gidemez). Kalıcı çözüm: NEW_VEHICLE_01–09 regen promptları.
- **Frenleme:** IDM yavaşlaması + fren-farlı kareler + burun dalışı (mevcut model, artık
  yalnız gerçekten frenlerken).
- **Çakışma:** şerit-içi IDM+kelepçe zaten kanıtlıydı; eksik olan deterministik
  kanıttı — `noOverlap.test.ts`: 10 araç, tek şerit, sürünen lider, karışık
  gövdeler; 1200 tick boyunca her tik çift-çift tampon aralığı ≥ 0.
  Park çakışması span-atamasıyla bitti (madde 3).
- **Bilinen sınır (kayıtlı):** Aşama 4 öncesi karşı-şeritten dönüş halen
  boşluk kabulü olmadan keser (saniye-altı transient). Erken-aşama disiplini
  UYGULANDI ve ÖLÇÜLDÜ: ortalama hız 13.9→3.1 m/s, spawn −%5.6, birleşmede
  gerçek çakışma — yol çöküyor. Geri alındı; `LEFT_TURN` config notu +
  açık yol/arsa kullanıcı kararına dosyalandı (§11).

## 5. Road

- **Kök neden:** teslim edilen `road_segment_tile-a` kendi içine kapalı
  diyorama dilimi — çimi kendi uçlarına sarılı, yanlarında boyalı toprak
  falezler; kopyaları uç uca eklemek her ekte yolu kesen çim şeridi ve
  merdivenlenmiş "yüzen platform" üretir (görüntülerle bire bir). Yerleştirme
  bunu düzeltemez; sanatın özelliği.
- **Düzeltme:** yol artık kilitli paletten dünya-uzayında SÜREKLİ kompozisyon:
  banket dokusu (üç ton + çiçek noktaları), bordür taşı dikişleri, sarı kenar
  çizgileri, kesikli beyaz orta, tekerlek aşınma bantları, asfalt ton yamaları,
  drenaj ızgaraları — hepsi tek geometriden, dikişsiz, projeksiyona tam uyumlu,
  kaplama dikdörtgeninin ucundan ucuna. Dilim `NEW_UI_WORLD_FIX_01` (P304)
  dikişsiz şerit olarak yeniden promptlandı; indiğinde bantla yer değiştirir.
- **Kanıt:** tüm kareler; `stage1-*.png`/`stage4-layout.png` goldenleri.

## 6. Characters

- **Kök neden(ler):** tarihsel dört-kol sorunu zaten çözülmüştü
  (UNUSED_RIG_SUBJECTS); bu pasoda 1.8×'e kadar canlı denetim siluetleri
  tutarlı buldu — gövde/kafa/saç/kol hizalı, ayaklar zeminde, yürüyüş adımı
  okunur. Kalan gerçek borç SANAT: yeniden teslim edilen "bacak" dosyaları tam
  boyda hâlâ kol (ten rengi, uçta el) — adım artikülasyonu bacaksız gövde
  regeni olmadan mümkün değil.
- **Roller:** aşçı/garson/temizlikçi üniforma tintiyle + StaffIcons rozetiyle
  ayrışıyor (mevcut sistem); üniforma sanatı ayrı bir üretim kalemi olarak
  kayıtlı.
- **Çıktı:** NEW_CHARACTER_01–08 regen satırları (P233–P240 statüleri
  NEEDS REGEN'e döndü, notlar tam-boy kanıtla).

## 7. Build Visibility

- **Kök neden (iki yarım):** `world.layout.placed` render katmanına hiç
  bağlanmamıştı — SimView'de yoktu, sahne hiç çizmiyordu (grep: src/render'da
  0 kullanım) — ve BUILDABLES `ph-prop-short/tall` placeholder stem'lerini
  adresliyordu.
- **Düzeltme:** SimView `placed/pendingBuilds/layoutRevision` satırları;
  WorldScene yerleşikleri derinlik-sıralı statik olarak kaydeder; buildable'lar
  üretim objeleri (Saksı→`bush-flowering-01`, Çöp→`bin`, Lamba→`lamp`);
  v11 kayıtlarındaki eski stem'ler v12 migrasyonunda gerçek id'lere taşınır.
- **Kanıt (satın alma→yerleştirme→onay→kaydet→yeniden yükle):** çöp kutusu
  yerleştirildi → sahnede gerçek sanat; lamba şantiyesi kaydedildi → tam sayfa
  reload → `remainingMs 2500→2200` ile devam, iki yerleşik obje yerinde
  (IndexedDB, checksum `10eb51f3`).

## 8. Construction

- **Süre modeli:** `buildDurationMs(cost) = clamp(1000+cost·400, 3000, 12000)`
  sim-ms. Bir oyun dakikası 500 sim-ms olduğundan: bedava dekor 6 oyun-dk,
  ₡6 tabela 7 dk, ₡12 cooler 12 dk, tavan 24 dk — hep aşama evrimlerinin
  (24–60 dk) altında. Yönergedeki "5–10 dk" bandı oyun-dakikası olarak
  okunmuştur; gerekçe ve tablo BUILD_CONSTRUCTION_DESIGN.md'de. Balance gate
  bu modelle 5/5 yeşil — kalibrasyon bozulmadı.
- **Görsel durumlar:** hedef objenin koyu yarı saydam silüeti + `worldUi`
  katmanında amber ilerleme çubuğu + kartta «İnşa ediliyor · N dk»;
  tamamlanınca tintlenmemiş sanat + mevcut UPGRADE_APPLIED patlaması.
  Boyalı iskele `NEW_CONSTRUCTION_01` (P308) — inene kadar silüet taşır
  (AWAITING EXTERNAL ASSET; placeholder değil, mekanizmanın kendisi).
- **Pause/speed/reload/offline:** duraklatma 40 tick boyunca süreyi sabit
  tuttu; 4× şantiyeyi tamamladı; reload kaldığı yerden sürdü; offline
  `COLLECT_OFFLINE.creditedMs` ile canlı tick'in kodundan ilerler (tahsilât
  anında tamamlanan şantiye seviyesini o an uygular).

## 9. New Assets

- **Sayım:** 5 yeni prompt (P304–P308) + 17 satır regen'e döndü = 22 açık
  görsel kalem. Katalog 303→**308** prompt, 23 batch; kapsama kapısı
  `22/22 · 0 kayıp · 0 çift · 0 yetim`. Mevcut promptlar korunarak (append-only);
  eski kartların metni bayt-sabit.
- **Kimlikler:** NEW_UI_WORLD_FIX_01 `road_strip_seamless-a` (P304) ·
  02 `ground_stage1_tile-b` (P305) · 03 `ground_stage1_tile-c` (P306) ·
  04 `struct_sign_large_painted_upper` (P307) · NEW_CONSTRUCTION_01
  `struct_scaffold_site` (P308) · NEW_VEHICLE_01–09 (P213, P208–210, P230–232,
  P203, P220 regen) · NEW_CHARACTER_01–08 (P233–240 regen).
- **Nihai kaynak durumu:** kullanıcı üretecek; hiçbir yeni üretim placeholder'ı
  eklenmedi (çalışma anı ikameleri gerçek teslim edilmiş karelerdir).

## 10. Verification

- Birim+entegrasyon: **1576 test / 120 dosya yeşil** (yeni: noOverlap ×2,
  viewSurface ×2, constructionFlow ×5, correctionPass ×5, v12 fixture ×2;
  güncellenen migrasyon/yerleşim/çevre/köprü süitleri).
- Determinizm: **61/61**. Balance gate: **5/5** (inşaat gecikmesi dahil).
- `pnpm verify` zinciri tek çağrıda **exit 0**: lint · format · typecheck
  ×3+svelte (0 hata) · depcruise (0 ihlal) · knip (temiz) · assets:validate
  (0 başarısız) · prompt-coverage (22/22 · 0/0/0) · assets:build (kritik yol
  **3.58/4.00 MB**) · coverage (branşlar %85.06 ≥ %85) · balance 5/5 ·
  bench 22/22 · build · size (**487.98/550 kB** gz).
  Not: bench "vehicle spawn+despawn" bir koşuda %22 sapma gösterdi, yalnız
  koşuda 22/22 geçti — karışık kalibrasyon gürültüsü (perf-gate hafıza notu);
  temiz zincir koşusu uçtan uca yeşil.
- Goldenlar: pinli konteynerde yenilendi — **24/24**, 15 görüntü bilinçli
  değişti, temsilciler göz'den geçti; ana makinede `pnpm test:visual`
  **18 geçti / 6 atlandı** (chromium-dışı projeler) — bayt-uyum korunuyor.
- E2E: **chromium 99 geçti / 6 atlandı (yerel, exit 0)** · **firefox 99
  geçti / 6 atlandı (pinli konteyner + xvfb — yerel makinede xvfb yok, CI
  şeridi konteynerde birebir koşuldu)** · **webkit smoke 3/3 (pinli
  konteyner — yerel WebKit host kitaplığı eksik, sudo gerektirir)**.
  Düzeltilen e2e beklentileri: inşaat üzerinden seviye iddiaları
  (upgradeFlow/upgradeTree/verticalSlice) + onuncu hash yenilemesi
  (simulation.spec REFERENCE, provenance yorumuyla).
- Gerçek GPU: bu istasyonun Chrome'u **NVIDIA GTX 1660 Ti** açıyor
  (SwiftShader değil); kare süresi ölçümü ön-plan sekmesi gerektirir ve
  arka-plan MCP sekmesinde 0 örnek verdi — PERF_LOG'da tek-adım talimatla
  ÖLÇÜLMEDİ olarak kayıtlı (uydurma sayı yok).
- Tarayıcı senaryoları: A (viewport) ✓ · B (stand) ✓ · C (park) ✓ ·
  D (takip/fren — deterministik test + canlı) ✓ · E (insanlar) ✓ ·
  F (satın al) ✓ · G (inşaat) ✓ · H (reload) ✓ · I (çoklu obje: cooler+çöp+lamba
  birlikte, istif yok) ✓.

## 11. Remaining Issues

Yalnız doğrulanmış olanlar:

1. **S1–S3 karşı-şerit geçiş transienti** — ölçümle geri alınmış disiplin;
   açık yol/arsa kullanıcı kararının parçası (LEFT_TURN notu, GDD §9.1).
2. **22 dış görsel kalem** — 17 regen + 5 yeni (FINAL_ASSET_REQUIREMENTS).
   İnene kadar: yol/iskele prosedürel, yön ikameleri devrede, bacaklar çizilmiyor.
3. **Zemin döşeme simetrisi** — min zoom'da hafif motif; ton yıkamaları
   yumuşatıyor, kalıcı çözüm P305/P306 varyasyon dilimleri.
4. **S3+ bina kabuğu sanatı yok** (önceden mevcut, bu pasonun kapsamı dışı;
   mutfak hattı açıkta duruyor — FINAL_ASSET_REQUIREMENTS'ta kayıtlı değilse
   bir sonraki sanat turunda ele alınmalı).
5. **Kullanıcının 5173 dev sunucusu** hâlâ takılı süreç (dokunulmadı;
   `pnpm dev` yeniden başlatması yeterli).

## 12. FINAL STATE

    ✅ UI / WORLD CORRECTION COMPLETE

    P19 NOT STARTED
    STOP — WAITING FOR USER REVIEW
