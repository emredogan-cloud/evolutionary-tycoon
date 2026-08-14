# WORKING DISCIPLINE — Evolutionary Tycoon

> **Bu dosya projenin kalıcı işletim sözleşmesidir.**
>
> **HER faz bu dosyayı okuyarak BAŞLAR.**
> **HER faz bu dosyaya karşı doğrulanarak BİTER.**
>
> Bu dosya oy birliğiyle yazılmış bir manifesto değil; ihlal edildiğinde projeyi
> gerçekten batıracak şeylerin listesidir. Her kural bir başarısızlık modundan türetilmiştir.

**Sürüm:** 1.0 · **Son güncelleme:** 2026-08-14 · **Durum:** GATE 0 — onay bekliyor

---

## 0. Bu dosyanın statüsü

- Bu dosya **yalnızca kullanıcı onayı ile** değiştirilebilir.
- Bir kural pratikte işlemiyorsa: kuralı sessizce esnetmek yasaktır. Değişiklik teklifi sunulur, onaylanırsa güncellenir, ve değişiklik §12'deki değişiklik günlüğüne yazılır.
- Bir kural ile bir faz görevi çelişiyorsa **kural kazanır** ve durum rapor edilir.

---

## 1. On beş temel kural

Bunlar orijinal proje sözleşmesinden gelir ve pazarlığa kapalıdır.

| #   | Kural                                                                     | Neden var (başarısızlık modu)                                                                                                      |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **CI asla bile bile kırmızı bırakılmaz.**                                 | Kırmızı CI'a alışan ekip, gerçek kırılmayı fark etmez. Bir hafta sonra hiçbir sinyal kalmaz.                                       |
| 2   | **Tarayıcı testi asla atlanmaz.**                                         | Unit testleri geçen bir WebGL oyunu tarayıcıda siyah ekran gösterebilir. Testler oyunun çalıştığını kanıtlamaz; tarayıcı kanıtlar. |
| 3   | **Test edilmemiş çekirdek gameplay eklenmez.**                            | Ekonomi ve simülasyon hataları geç fark edilir ve tüm kayıt dosyalarını zehirler.                                                  |
| 4   | **Mimari sessizce değiştirilmez.**                                        | Sessiz mimari kayması, üç faz sonra "neden hiçbir şey çalışmıyor"un tek sebebidir.                                                 |
| 5   | **Kapsam sessizce genişletilmez.**                                        | Faz kapıları, kapsam sabit olduğunda anlamlıdır.                                                                                   |
| 6   | **Gerçek bir asset, dokümante etmeden placeholder ile değiştirilmez.**    | Dokümante edilmemiş placeholder, launch günü keşfedilir.                                                                           |
| 7   | **Bakılabilirlik hız için feda edilmez — edilirse tradeoff kayda geçer.** | Kayıt altına alınmamış teknik borç, borç değil sürprizdir.                                                                         |
| 8   | **Kanıt olmadan "tamamlandı" denmez.**                                    | Bkz. §4.                                                                                                                           |
| 9   | **Test sonucu asla uydurulmaz.**                                          | Bu, projenin tek geri döndürülemez ihlali. Bkz. §11.                                                                               |
| 10  | **Secret asla commit edilmez.**                                           |                                                                                                                                    |
| 11  | **Roadmap onaysız değiştirilmez.**                                        |                                                                                                                                    |
| 12  | **Amacı tanımlanmamış büyük özellik eklenmez.**                           | "Havalı olur" ile eklenen sistem, bakımını kimsenin üstlenmediği sistemdir.                                                        |
| 13  | **Geriye dönük uyumluluk pratik olduğu sürece korunur.**                  | Kayıt dosyası kırmak, oyuncunun ilerlemesini silmektir.                                                                            |
| 14  | **Performans bütçeleri görünür tutulur.**                                 | Ölçülmeyen bütçe, bütçe değildir.                                                                                                  |
| 15  | **Oyun her anlamlı kilometre taşında oynanabilir kalır.**                 | Oynanamayan bir dal, değerlendirilemeyen bir daldır.                                                                               |

---

## 2. Kod mimarisi kuralları (makine tarafından zorlanır)

Bu kurallar yorum meselesi değil; `dependency-cruiser` ve ESLint tarafından CI'da zorlanır. İhlal = build kırmızı.

### 2.1 Katman izolasyonu

```
src/sim/**      →  saf TypeScript. Phaser, Svelte, DOM, window, document YOK.
src/render/**   →  Phaser'a bağımlı olabilir. src/sim'i sadece OKUR (read-only view + event).
src/ui/**       →  Svelte'e bağımlı olabilir. src/sim'i doğrudan IMPORT EDEMEZ.
src/app/**      →  Kompozisyon kökü. Herkesi import edebilir. Oyun mantığı içeremez.
src/config/**   →  Saf veri + tip. Hiçbir şeyi import etmez (zod hariç).
```

**Yasaklı importlar (dependency-cruiser ile zorlanır):**

- `src/sim/**` → `phaser`, `svelte`, `src/render/**`, `src/ui/**`
- `src/ui/**` → `src/sim/**` (yalnızca `src/app/bridge/**` üzerinden)
- `src/config/**` → `src/sim/**` dışında herhangi bir şey

**Neden:** Simülasyon çekirdeğinin renderer'dan bağımsız olması, (a) headless unit test edilebilmesi, (b) CI'da GPU olmadan benchmark edilebilmesi, (c) deterministik olabilmesi ve (d) gerekirse motorun değiştirilebilmesi demektir. Bu tek kural, projenin test edilebilirliğinin tamamını taşır.

### 2.2 Determinizm kuralları

`src/sim/**` içinde **yasak** (ESLint `no-restricted-globals` / `no-restricted-syntax` ile zorlanır):

- `Math.random()` → yerine enjekte edilmiş `Rng` stream'i
- `Date.now()`, `new Date()`, `performance.now()` → yerine enjekte edilmiş `Clock`
- `setTimeout`, `setInterval`, `requestAnimationFrame` → sim kendi tick'ini alır
- `Object` anahtar sırasına bağımlı iterasyon → `Map` + açık sıralama, veya sıralı dizi
- Float karşılaştırmasında `===` → `Math.abs(a-b) < EPS`

**Neden:** Deterministik olmayan bir simülasyonda ekran görüntüsü regresyon testi yazılamaz, bug raporu tekrar üretilemez, ekonomi dengesi CI'da doğrulanamaz, ve "gün tekrarı" (Day Replay) özelliği hiç var olamaz.

### 2.3 Tahsis (allocation) disiplini

Sıcak döngülerde (`tick()` içi, per-frame render güncellemesi) steady-state'te **sıfır tahsis**:

- Vektörler için object pool veya scratch buffer
- `array.map/filter/reduce` yerine önceden tahsis edilmiş dizilerde `for`
- String birleştirme yok (log dahil — log seviyeleri derleme zamanında elenir)

Bu bir kılavuz değil; `tests/perf/allocation.bench.ts` bunu ölçer ve eşiği aşarsa kırar.

### 2.4 Sihirli sayı yasağı

Hiçbir ekonomik, dengeleme veya zamanlama değeri gameplay kodunda literal olarak bulunamaz. Hepsi `src/config/**` altında, tipli ve (dev modda) Zod ile doğrulanmış olarak yaşar. ESLint kuralı `src/sim/systems/**` içinde çıplak sayısal literalleri (−1, 0, 1, 2 hariç) uyarı olarak işaretler.

---

## 2.5. Bağımlılık sürüm kilidi politikası

> Onaylanmış düzeltme, 2026-08-14. Kaynak: [ADR-002](DECISIONS/ADR-002-typescript-6.md), [ADR-012](DECISIONS/ADR-012-dependency-policy.md).

Kural **"bağımlılıkları asla yükseltme" değildir.** Kural şudur:

> **Bağımlılıklar gelişigüzel, örtük veya kanıtsız yükseltilmez.**

### 2.5.1 Uygulanan kurallar

1. Onaylanmış tam (exact) sürümler korunur. `package.json`'da caret/tilde yok — tam sürüm pinleme.
2. "Yeni sürüm çıkmış" **tek başına** yükseltme gerekçesi değildir. Fırsatçı yükseltme yapılmaz.
3. Güvenlik açığı veya bloke edici uyumluluk sorunu bir sürüm değişikliği gerektiriyorsa: **DUR**, önce değişiklik kaydı oluştur.
4. Her sürüm değişikliği şunları kaydeder:
   - eski sürüm
   - önerilen sürüm
   - gerekçe (güvenlik / bloke edici uyumluluk / onaylı özellik ihtiyacı)
   - kanıt (CVE, issue linki, hata çıktısı)
   - uyumluluk etkisi (hangi paketlerin peer aralığı etkileniyor)
   - gereken testler
5. Her fazın sonunda o fazın nihai bağımlılık sürümleri `docs/PROJECT_MEMORY.md §4`'e yazılır.
6. Yeniden üretilebilirlik gerektiren araçlar pinlenir: Node (`.nvmrc` + `engines`), pnpm (`packageManager`), Playwright Docker imajı (tam etiket), **GitHub Actions tam commit SHA'sı + sürüm yorumu** (`uses: actions/checkout@fbc6f39… # v5`). Mutable etiket (`@v5`) kullanmak bir tedarik zinciri riskidir ve CodeQL bunu bulgu olarak raporlar; Dependabot SHA'ları güncel tutar.
7. Lockfile her zaman commit edilir; CI `--frozen-lockfile` kullanır.

### 2.5.2 Değişiklik kaydı formatı

```markdown
## DEPENDENCY CHANGE #<n> — <paket>

Eski: <sürüm>
Önerilen: <sürüm>
Sınıf: SECURITY | BLOCKING-COMPAT | APPROVED-FEATURE
Gerekçe: <tek cümle>
Kanıt: <CVE / issue URL / hata çıktısı>
Uyumluluk: <etkilenen peer bağımlılıkları>
Testler: <hangi süitler koşulmalı>
Onay: <bekliyor | onaylandı — tarih>
```

`SECURITY` sınıfı acil durumlarda onay öncesi uygulanabilir, ancak kayıt aynı PR'da yazılır ve rapor edilir. Diğer iki sınıf **önceden** onay gerektirir.

### 2.5.3 Otomatik yükseltme araçları

Dependabot **açıktır ama otomatik merge yapmaz**. Açtığı her PR bir değişiklik kaydı gerektirir. Bu, güvenlik güncellemelerini görünür kılarken sessiz sürüm kaymasını engeller.

---

## 3. Git ve commit disiplini

### Branch

```
main                    korumalı; yalnızca yeşil CI ile merge
phase/<N>-<slug>        faz dalı           ör. phase/03-isometric-world
fix/<slug>              düzeltme
chore/<slug>            altyapı
```

`main`'e doğrudan push yasak. Her faz kendi PR'ı ile gelir.

### Commit (Conventional Commits, commitlint ile zorlanır)

```
feat(sim): add IDM car-following model to traffic system
fix(render): correct depth sort tie-break for stacked props
test(economy): add progression curve regression suite
docs(roadmap): record Phase 5 completion evidence
perf(sim): remove per-tick allocation in flow field lookup
chore(ci): pin playwright container to v1.62.1-noble
```

Tipler: `feat` `fix` `perf` `refactor` `test` `docs` `chore` `build` `ci` `revert`
Scope'lar: `sim` `render` `ui` `config` `assets` `ci` `deploy` `docs` `economy` `audio`

### Kurallar

- Bir commit tek bir mantıksal değişiklik içerir.
- Çalışmayan ara commit `main`'e girmez (faz dalında serbest).
- Her commit mesajı **neden** sorusuna cevap verir; **ne** zaten diff'te yazıyor.
- Otomatik üretilmiş asset'ler ve build çıktıları commit edilmez (`dist/`, `.vercel/`, üretilmiş atlaslar hariç — bkz. ASSET_PIPELINE.md §9).

---

## 4. "TAMAMLANDI" ne demek — Definition of Done

Bir faz, **kod var diye** tamamlanmaz. Aşağıdakilerin **hepsi** doğru olmalıdır ve her biri için **kanıt** (komut çıktısı, URL, ekran görüntüsü, artifact linki) faz tamamlama raporunda yer almalıdır.

| #   | Kriter                                                         | Kanıt biçimi                                                |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | İmplementasyon çalışıyor                                       | Faz'ın kendi başarı metriklerinin karşılandığının gösterimi |
| 2   | `pnpm lint` temiz                                              | Komut çıktısı                                               |
| 3   | `pnpm typecheck` temiz                                         | Komut çıktısı                                               |
| 4   | `pnpm test` yeşil, kapsam eşiği tutuyor                        | Komut çıktısı + coverage özeti                              |
| 5   | `pnpm build` başarılı, bundle bütçesi içinde                   | Boyut raporu                                                |
| 6   | `pnpm e2e` yeşil (Chromium + Firefox), WebKit smoke geçti      | Playwright raporu                                           |
| 7   | Visual regression diff'i yok, veya her diff bilinçli ve onaylı | Golden diff artifact'i                                      |
| 8   | CI **YEŞİL**                                                   | Workflow run URL'i                                          |
| 9   | Preview deployment sağlıklı                                    | Preview URL + `/health.json` çıktısı                        |
| 10  | Preview URL'de konsolda kritik hata yok                        | Konsol dökümü                                               |
| 11  | Runtime hata yok (5 dakikalık gerçek oynanış)                  | Not + konsol dökümü                                         |
| 12  | Performans bütçe içinde                                        | `docs/PERF_LOG.md` girdisi                                  |
| 13  | Dokümantasyon güncel ve senkron                                | Değişen doküman listesi                                     |
| 14  | Git commit var, repo temiz (`git status` boş)                  | Komut çıktısı                                               |
| 15  | Faz tamamlama raporu yazıldı                                   | `docs/phases/PHASE_<N>_REPORT.md`                           |

**Bunlardan biri bile eksikse faz tamamlanmamıştır ve öyle rapor edilir.**
Kısmi tamamlanma tamamen meşrudur — sahte tamamlanma değildir.

---

## 5. Faz kapıları (Phase Gates)

```
FAZ N BAŞLA
  ├─ 1. Bu dosyayı oku
  ├─ 2. Faz'ın START CONDITIONS'ını doğrula → sağlanmıyorsa DUR ve rapor et
  ├─ 3. Faz dalını aç
  ├─ 4. Görevleri yürüt
  ├─ 5. §4'teki 15 maddeyi tek tek doğrula
  ├─ 6. Faz tamamlama raporu yaz
  ├─ 7. PR aç, CI yeşile dönsün
  └─ 8. DUR. Rapor et. ONAY BEKLE.
FAZ N+1 otomatik olarak BAŞLAMAZ.
```

**Bir sonraki faza geçmek için açık kullanıcı onayı şarttır.**
"tamam", "güzel", "iyi görünüyor" ifadeleri, bir sonraki fazı başlatma izni olarak yorumlanmaz. Onay belirsizse **sorulur**.

---

## 6. Roadmap değişiklik kontrolü

Uygulama sırasında büyük bir mimari değişikliğin gerekli olduğu keşfedilirse:

**DUR.** Sessizce değiştirme. Şu formatta rapor et:

```markdown
## ROADMAP DEĞİŞİKLİK TALEBİ #<n>

**Keşfedilen:** <ne bulundu, hangi kanıtla>
**Neden mevcut roadmap yetersiz:** <somut>
**Önerilen değişiklik:** <somut>
**Etkilenen fazlar:** <liste>
**Maliyet:** <ek iş>
**Risk:** <değişmezsek ne olur / değiştirirsek ne olur>
**Fayda:** <somut>
**Alternatifler ve neden reddedildiler:**
```

Onaylanan faz kapsamı **içinde** kalan küçük implementasyon düzeltmeleri onay gerektirmez.

**Sınır nerede?** Şunlar onay gerektirir: bir bağımlılığın eklenmesi/çıkarılması, bir katman kuralının değişmesi, veri modelinin/save formatının kırılması, bir fazın hedefinin değişmesi, faz sırasının değişmesi, performans bütçesinin gevşetilmesi.

---

## 7. Placeholder politikası

Placeholder kullanmak yasak değildir — **saklamak** yasaktır.

- Her placeholder asset `assets/_placeholder/` altında yaşar ve dosya adı `__PLACEHOLDER__` içerir.
- Her placeholder `docs/PLACEHOLDER_REGISTER.md`'ye tek satırla yazılır: dosya, neyin yerine, hangi fazda gerçeğiyle değişecek.
- Build, placeholder sayısını sayar ve konsola yazar; **production build'de sayı sıfır değilse uyarı** (Faz 22'den sonra: hata).
- Placeholder olan bir ekran, "görsel olarak tamamlandı" diye rapor edilemez.

---

## 8. Performans bütçesi — görünür ve zorlayıcı

Bütçeler `docs/TECHNICAL_ARCHITECTURE.md §11`'de tanımlıdır ve her fazda ölçülür.

- **CI'da zorlanan:** bundle boyutu, sim tick throughput, sim tahsis sayısı, asset toplam boyutu. Aşım = build kırmızı.
- **Manuel ölçülen:** gerçek GPU'da FPS ve frame time. CI'da headless Chromium SwiftShader (yazılım rasterizasyonu) kullandığı için CI'daki FPS sayısı anlamsızdır — bu yüzden CI'da FPS _iddia edilmez_.
- Her ölçüm `docs/PERF_LOG.md`'ye tarih, cihaz, tarayıcı ve sürüm ile yazılır.

Bütçe aşıldığında iki meşru seçenek vardır: (a) optimize et, (b) bütçe değişikliğini gerekçesiyle onaya sun. Üçüncü bir seçenek — görmezden gelmek — yoktur.

---

## 9. Güvenlik ve gizlilik

- Secret'lar yalnızca Vercel environment variable'larında ve `.env.local` (gitignore'lu) içinde yaşar.
- `.env.example` her zaman güncel tutulur; her değişkenin ne işe yaradığı yazılıdır.
- İstemci tarafına gömülen hiçbir değişken gizli değildir. `VITE_` ön ekli her şey **public** kabul edilir; bu ön ek altına asla sır konmaz.
- `pnpm audit` ve CodeQL CI'da koşar; yüksek/kritik zafiyet build'i kırar.
- Analitik cookieless ve opt-out'ludur; kişisel veri toplanmaz. Bir olay (event) kişiyi tanımlıyorsa toplanmaz.

---

## 10. Dokümantasyon senkronizasyonu

Bu yedi doküman **birlikte** doğru olmak zorundadır:

```
docs/WORKING_DISCIPLINE.md      işletim sözleşmesi (bu dosya)
docs/GAME_DESIGN_DOCUMENT.md    oyun ne
docs/TECHNICAL_ARCHITECTURE.md  nasıl inşa edildi
docs/ASSET_PIPELINE.md          görsel/işitsel üretim
docs/ECONOMY_DESIGN.md          sayılar ve eğriler
docs/TESTING_STRATEGY.md        nasıl doğrulanıyor
docs/GAME_EXECUTION_ROADMAP.md  ne zaman ve hangi sırayla
```

Destekleyiciler: `docs/RESEARCH_NOTES.md` (kanıt), `docs/PERF_LOG.md`, `docs/PLACEHOLDER_REGISTER.md`, `docs/DECISIONS/ADR-*.md`, `docs/phases/PHASE_*_REPORT.md`.

**Kural:** Bir davranış değişirse, onu tarif eden doküman **aynı PR içinde** güncellenir. Ayrı bir "dokümantasyon PR'ı" diye bir şey yoktur — doküman gecikirse yanlıştır, yanlış doküman yokluktan kötüdür.

**ADR kuralı:** Geri döndürülmesi pahalı olan her karar (bağımlılık seçimi, veri formatı, katman kuralı, hosting) kısa bir ADR alır: bağlam, karar, alternatifler, sonuçlar, geri dönüş maliyeti.

---

## 11. Dürüstlük kuralları

Bunlar teknik kural değil, bu projenin var olma koşulu.

1. **Koşmadığın testi geçti diye rapor etme.** Komut çıktısı yoksa iddia yoktur.
2. **Ölçmediğin performansı iddia etme.** "60 FPS'te akıcı çalışıyor" bir ölçüm değildir; `docs/PERF_LOG.md` girdisi ölçümdür.
3. **Görmediğin ekranı "çalışıyor" deme.** Tarayıcıda açılmadıysa çalıştığı bilinmiyordur.
4. **Kısmen bittiyse "kısmen bitti" de.** Ne bitti, ne bitmedi, neden bitmedi — üçü birlikte.
5. **Bir şeyi bozduğunu fark edersen önce söyle.** Sessizce düzeltmeye çalışıp başaramamak, en pahalı senaryodur.
6. **Bilmiyorsan "bilmiyorum" de ve nasıl öğreneceğini söyle.** Tahmini kanıt gibi sunmak yasaktır.
7. **Bir aracın/ajanın raporunu doğrulamadan aktarma.**

---

## 12. Faz başlangıç ve bitiş checklist'i (kopyala-yapıştır)

### Faz başlangıcı

```
[ ] WORKING_DISCIPLINE.md okundu
[ ] Faz'ın START CONDITIONS'ı doğrulandı
[ ] Bir önceki fazın DoD'si gerçekten karşılanmış mı — kontrol edildi
[ ] Faz dalı açıldı
[ ] Faz'ın performans/kapsam bütçesi not edildi
[ ] Bilinen riskler ve rollback planı gözden geçirildi
```

### Faz bitişi

```
[ ] pnpm lint                          → çıktı eklendi
[ ] pnpm typecheck                     → çıktı eklendi
[ ] pnpm test --coverage               → çıktı + coverage eklendi
[ ] pnpm build                         → bundle raporu eklendi
[ ] pnpm e2e (chromium, firefox)       → rapor eklendi
[ ] pnpm e2e:webkit-smoke              → rapor eklendi
[ ] pnpm test:visual                   → diff durumu eklendi
[ ] CI yeşil                           → run URL eklendi
[ ] Preview deploy sağlıklı            → URL + /health.json eklendi
[ ] Preview'da 5 dk gerçek oynanış, konsol temiz → not eklendi
[ ] PERF_LOG.md güncellendi
[ ] PLACEHOLDER_REGISTER.md güncellendi
[ ] İlgili 7 doküman senkron
[ ] git status temiz
[ ] PHASE_<N>_REPORT.md yazıldı
[ ] DURULDU, onay bekleniyor
```

---

## 13. Değişiklik günlüğü

| Tarih      | Sürüm | Değişiklik                 | Onaylayan         |
| ---------- | ----- | -------------------------- | ----------------- |
| 2026-08-14 | 1.0   | İlk sürüm (GATE 0 teslimi) | — (onay bekliyor) |
