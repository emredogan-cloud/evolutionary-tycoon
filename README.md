# Evolutionary Tycoon

> Yol kenarındaki minicik bir limonata tezgâhını, önünden akan gerçek trafiği müşteriye
> çevirerek bir restoran imparatorluğuna dönüştürdüğün, 2D izometrik tarayıcı yönetim oyunu.

**Durum:** 🔴 **GATE 0 — Araştırma & Tasarım tamamlandı, kullanıcı onayı bekleniyor.**
Henüz kod yazılmadı, repo oluşturulmadı, Faz 1 başlatılmadı.

---

## Dokümantasyon

Bu depo şu an yalnızca planlama dokümanlarından oluşuyor. Okuma sırası:

| #   | Doküman                                                  | Ne anlatıyor                                                          |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | **[WORKING_DISCIPLINE](docs/WORKING_DISCIPLINE.md)**     | Projenin kalıcı işletim sözleşmesi. **Her faz bunu okuyarak başlar.** |
| 2   | [GAME_EXECUTION_ROADMAP](docs/GAME_EXECUTION_ROADMAP.md) | 37 bölüm, 25 faz, risk kaydı, AI ajan yürütme prompt'ları             |
| 3   | [GAME_DESIGN_DOCUMENT](docs/GAME_DESIGN_DOCUMENT.md)     | Oyun ne: döngü, evrim, NPC, trafik, memnuniyet, retention             |
| 4   | [TECHNICAL_ARCHITECTURE](docs/TECHNICAL_ARCHITECTURE.md) | Nasıl inşa edilecek: motor kararı, katmanlar, veri modeli, bütçeler   |
| 5   | [ECONOMY_DESIGN](docs/ECONOMY_DESIGN.md)                 | Sayılar, eğriler, sömürü önleme, balance simülatörü                   |
| 6   | [ASSET_PIPELINE](docs/ASSET_PIPELINE.md)                 | Görsel yön, AI üretim protokolü, atlas, animasyon                     |
| 7   | [TESTING_STRATEGY](docs/TESTING_STRATEGY.md)             | Unit → integration → E2E → visual → performans → manuel               |
| 8   | [RESEARCH_NOTES](docs/RESEARCH_NOTES.md)                 | Her kararın kanıtı ve kaynağı                                         |

---

## Özet

**Farklılaştırıcı fikir:** Tür oyunlarında talep bir spawn timer'dan gelir. Burada talep,
ekranın içinden geçen, izlenebilen ve etkilenebilen fiziksel bir araç akışıdır.

**Merkezi mimari karar:** Motordan tamamen bağımsız, deterministik, saf TypeScript
simülasyon çekirdeği. Phaser yalnızca çizer. Bu tek karar; headless testi, CI'da ekonomi
doğrulamasını, piksel-kesin görsel regresyonu, tekrar üretilebilir bug raporlarını ve
"gün tekrarı" oyun özelliğini aynı anda mümkün kılıyor.

**Yığın:** TypeScript 6.0.3 · Vite 8.2.1 · Phaser 4.2.1 (WebGL2) · Svelte 5.56 ·
Vitest 4.1 · Playwright 1.62 · Vercel (statik). Backend yok.

**Kritik kapı:** Faz 9 sonunda Vertical Slice değerlendirmesi. Oyun o noktada eğlenceli,
görsel olarak ikna edici ve teknik olarak stabil değilse genişleme durur.
