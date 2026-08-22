# ASSET LICENCES

Every asset's provenance and licence. **No asset with an unclear licence enters this repository**
([WORKING_DISCIPLINE §9](../docs/WORKING_DISCIPLINE.md), [ASSET_PIPELINE §4.2](../docs/ASSET_PIPELINE.md)).

---

## 1. Phase 4 START CONDITION — AI tool licence verification

The roadmap makes this a gate: **not one production asset — golden references included — may be
produced until nine items are verified from primary sources for each candidate tool**, with the
evidence recorded as an official URL, an access date, and a verbatim quote.

**Verified 2026-08-15.** Sources are each provider's own terms page, not review articles.

### Result

> ## 🟡 GATE OPEN BY EXECUTIVE OVERRIDE — 2026-08-15
>
> **The verification did not satisfy the gate. The project owner opened it anyway, as a business
> decision, having read the findings below.**
>
> The distinction matters and is preserved deliberately: this gate was **overridden, not passed.**
> Nine of nine were not verified. What follows in §1.1–§1.4 is the evidence as gathered; §1.5 records
> the decision, who made it, and exactly which risks were accepted.
>
> **Selected tool: God Mode AI** (6 of 9 verified — the strongest terms of the four).
> **Dropped: Sprixen, PixelLab.** Their evidence is retained below rather than deleted, because an
> asset generated under an old decision must always be traceable to the terms in force at the time.

### 1.1 God Mode AI — <https://www.godmodeai.co/term-of-use> (accessed 2026-08-15)

| #   | Item                        | Verdict | Evidence                                                                                                                                                                                                                                         |
| --- | --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Commercial use              | ✅      | "you are free to use, reproduce, modify, publish, distribute, publicly display, publicly perform, create derivative works from, sell, license, and otherwise exploit the Generated Output for any lawful purpose, including commercial purposes" |
| 2   | Ownership of output         | ✅      | "we assign to you all right, title, and interest (including all copyright and other intellectual property rights) that we may have in the Generated Output created by you"                                                                       |
| 3   | Redistribution in a game    | ⚠️      | Not stated as such; covered in substance by the item 1 grant ("distribute … sell … exploit"). Product page adds: "Assets you generate can be used in shipped commercial games and client work."                                                  |
| 4   | Output restrictions         | ✅      | "You may not use Generated Output in a manner that violates … our Content Policy, or any applicable law". Ordinary lawful-use limits; none affect this project.                                                                                  |
| 5   | Reference-image terms       | ❌      | **Not addressed.** We intend to upload our own golden references, so this matters.                                                                                                                                                               |
| 6   | Training / opt-out          | ✅      | "We do not use your private Input or Generated Output to train our generative AI models."                                                                                                                                                        |
| 7   | Account / cost              | ⚠️      | "You may be required to register to use the Services." Pricing is on `/plans`, not in the terms.                                                                                                                                                 |
| 8   | **Rights after cancelling** | ❌      | **Not addressed.** Only: "Your cancellation will take effect at the end of the current paid term." An _assignment_ of copyright (item 2) is ordinarily permanent, but that is an inference, not a quote.                                         |
| 9   | Attribution                 | ✅      | "without any obligation to credit us (although attribution is appreciated)"                                                                                                                                                                      |

**Assessment:** the strongest terms of the four. An outright assignment of copyright is materially
better than a licence. Two gaps, one of which (item 8) is probably answered by item 2 but is not
written down.

### 1.2 Scenario — <https://www.scenario.com/terms-and-conditions> (accessed 2026-08-15)

| #   | Item                        | Verdict | Evidence                                                                                                                                                                                                                   |
| --- | --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Commercial use              | ✅      | §4.3 "You may use, modify, distribute, sell, license, and otherwise exploit your Generated Assets for any lawful purpose, including commercial use, without additional fees to Scenario beyond your applicable plan fees." |
| 2   | Ownership of output         | ✅      | §4.3 "You own your Generated Assets"; "Scenario assigns to you all right, title, and interest in and to the Generated Assets"                                                                                              |
| 3   | Redistribution in a game    | ✅      | §7.4 "This includes integrating Scenario's generation capabilities into your own products, services, games, and applications."                                                                                             |
| 4   | Output restrictions         | ⚠️      | §4.5 "No uniqueness guarantee"; "AI-generated outputs may bear similarities to outputs generated for other users." Not a blocker, but it is a real limit on visual distinctiveness.                                        |
| 5   | Reference-image terms       | ❌      | **Not addressed.** Terms confirm you keep ownership of uploaded content but say nothing about what uploading a reference implies for the output.                                                                           |
| 6   | Training / opt-out          | ⚠️      | §4.6 "To operate, secure, and improve the Services and our AI models, we may use your content and aggregated, de-identified usage data." The no-training guarantee is **Enterprise only**.                                 |
| 7   | Account / cost              | ✅      | §1.2, §3.1 Account required; free tier with daily allocations; paid plans by subscription.                                                                                                                                 |
| 8   | **Rights after cancelling** | ❌      | **Not addressed** for asset usage. Only data export: "available for export for a period of thirty (30) days following the effective date of termination."                                                                  |
| 9   | Attribution                 | ❌      | **Not addressed.**                                                                                                                                                                                                         |

**Assessment:** clear on ownership and redistribution. Item 6 is a genuine consideration — on a
self-serve plan our art-direction references and outputs may be used to improve Scenario's models.
That is a business decision, not a legal blocker.

### 1.3 PixelLab — <https://www.pixellab.ai/termsofservice> (accessed 2026-08-15)

| #   | Item                        | Verdict | Evidence                                                                                                                                                             |
| --- | --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Commercial use              | ✅      | "You own the copyrights to your creations, permitting usage for both commercial and non-commercial purposes with no need for permission."                            |
| 2   | Ownership of output         | ✅      | "You retain ownership of any content you create using PixelLab."                                                                                                     |
| 3   | Redistribution in a game    | ❌      | Not addressed.                                                                                                                                                       |
| 4   | Output restrictions         | ✅      | "free to use, modify, and distribute the outputs from our tools for any purpose, except for training other models without our explicit permission"                   |
| 5   | Reference-image terms       | ❌      | Not addressed.                                                                                                                                                       |
| 6   | Training / opt-out          | ⚠️      | "We do not use any user inputs or generated content to train our models without notifying to the user in the user interface." Conditional, and no opt-out described. |
| 7   | Account / cost              | ❌      | Not addressed in the terms.                                                                                                                                          |
| 8   | **Rights after cancelling** | ❌      | Not addressed.                                                                                                                                                       |
| 9   | Attribution                 | ❌      | Not addressed.                                                                                                                                                       |

**Assessment:** five of nine unaddressed. Fine as a _backup_; not enough to be primary.

### 1.4 Sprixen — <https://sprixen.com/> (accessed 2026-08-15)

**No terms-of-service document was located.** The claims found — "commercial license on all
generated assets", "royalty-free for commercial use", "no attribution required" — are **marketing
copy on the product site**, which is exactly the class of secondary evidence this gate exists to
reject.

**Assessment:** ❌ **unverified**. Cannot be used until a real terms document is read.
**Status: DROPPED** by the 2026-08-15 executive override (§1.5).

### 1.5 EXECUTIVE OVERRIDE — 2026-08-15

**Decided by:** the project owner, in writing, after reading §1.1–§1.4.
**Recorded by:** the agent, verbatim as to substance. This is the user's decision, not the agent's
assessment; the agent's assessment remains §1.1–§1.4 and is unchanged.

**Instruction given:**

> "Use the most logical option and don't get too hung up on it. […] The business explicitly ACCEPTS
> the unverified risk regarding post-subscription rights and reference image usage for this MVP.
> […] Mark the Phase 4 START CONDITION (Licence Gate) as PASSED by Executive Override. […] Drop
> Sprixen and PixelLab."

**Decisions:**

| #   | Decision                                                                   |
| --- | -------------------------------------------------------------------------- |
| 1   | **God Mode AI is the selected primary tool** for asset generation.         |
| 2   | **Sprixen — dropped.** No primary terms document exists.                   |
| 3   | **PixelLab — dropped.** Five of nine items unaddressed.                    |
| 4   | Scenario is not selected. It was not dropped by name; it is simply unused. |
| 5   | The gate is treated as satisfied for MVP purposes.                         |

**Risks knowingly accepted.** Written out rather than summarised, so a future reader does not have to
reconstruct what was and was not agreed:

| Item                             | Status                                                                   | Accepted consequence                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **8 — rights after cancelling**  | ❌ Unverified. Terms say only that cancellation takes effect at term end | If the assignment in item 2 turns out not to survive cancellation, art generated under a lapsed subscription may need relicensing or replacing |
| **5 — reference-image terms**    | ❌ Unverified                                                            | Uploading our own golden references may grant God Mode AI rights we have not read                                                              |
| **3 — redistribution in a game** | ⚠ Inferred from the item 1 grant, not stated as such                     | Redistribution in a shipped game rests on "distribute … sell … exploit" rather than an explicit clause                                         |
| **7 — account / cost**           | ⚠ Pricing is on `/plans`, not in the terms                               | Cost is a commercial matter, not a rights matter                                                                                               |

**What is genuinely verified and materially strong** (unchanged from §1.1): an outright **assignment**
of copyright — "we assign to you all right, title, and interest … in the Generated Output" — with no
attribution requirement and no training on private input or output. An assignment is ordinarily
permanent, which is the reasoning behind accepting item 8; it is an inference, not a quote, and is
recorded as such.

**Revisit triggers.** The override is scoped to the MVP. It must be reopened at any of:

- **Phase 16** (full asset production) and **Phase 23** (launch) — already required by §4 below.
- Before monetisation. Shipping a paid product on inferred redistribution rights is a different risk
  posture from shipping an unmonetised MVP.
- If the God Mode AI subscription is cancelled or lapses, since that is precisely the untested case.
- If God Mode AI's terms change — the accepted risk was measured against the 2026-08-15 text.

**Still worth doing, cheaply, at any time:** ask God Mode AI the two item-5 and item-8 questions in
writing. Accepting a risk and closing it are not exclusive, and an answer would retire the largest
one for the cost of an email.

---

## 2. What this means for Phase 4

The gate is open (§1.5). ASSET_PIPELINE §4.2's rule against _silent_ substitution is satisfied by
this record: the substitution is documented, attributed and dated, and the dropped providers' evidence
is retained rather than deleted.

**No production asset has been generated yet**, for a reason unrelated to licensing: the agent has no
image-generation capability. See [PHASE_4_REPORT §11](../docs/phases/PHASE_4_REPORT.md).

---

## 3. Asset register

**No production asset exists yet.** The licence gate is no longer the reason — since 2026-08-15 the
blocker is capability: the agent executing this project cannot generate images. The only images in
the repository remain placeholders.

Every production asset added from here carries, in `assets/MANIFEST.md`, the tool that made it, the
prompt-block hash in force, and — because of §1.5 — the fact that it was generated under an
**overridden** gate rather than a satisfied one.

| Asset                       | Source                                        | Licence                        | Notes                                                 |
| --------------------------- | --------------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| `assets/_placeholder/*.png` | Generated by `tools/placeholders/generate.ts` | Project's own (MIT, this repo) | Deliberately ugly stand-ins; see PLACEHOLDER_REGISTER |
| `public/favicon.svg`        | Written for this project                      | Project's own (MIT)            | Not a placeholder                                     |

---

## 4. Re-verification schedule

Terms change. [ASSET_PIPELINE §4.2](../docs/ASSET_PIPELINE.md) requires re-verification at **Phase 16**
(full asset production) and at **Phase 23** (launch). Each re-verification appends to this file
rather than overwriting it, so a shipped asset can always be traced to the terms in force when it
was generated.

| Date       | Phase | Action                                                                                                                                                                |
| ---------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-15 | 4     | First verification. Four providers checked from primary sources; gate **not closed** — see §1 and §2.                                                                 |
| 2026-08-15 | 4     | **Executive override.** Owner selected God Mode AI and accepted the unverified items 5 and 8 for the MVP; Sprixen and PixelLab dropped. Gate open, not passed — §1.5. |

## Ek — Faz 16 yol dilimi (2026-08-20)

`road_segment_tile-a@2x.png` — kullanıcı tarafından 2026-08-20'de teslim edildi
(oturum içi bırakılan tek dosya; üretim aracı beyan edilmedi). Görsel aile ve
teslim biçimi 172'lik setle aynı üretim kanalını işaret ediyor ve §1.5'teki
yönetici kararının kapsamı içinde kabul edildi; **araç/lisans teyidi kullanıcıya
açık soru olarak PHASE_16_REPORT'ta kayıtlıdır.** Doğrulama: 9/9 kontrol,
palet-affinity aile içinde (`pnpm assets:validate`, 173 asset 0 failing).

## Ek — Konsolidasyon teslimatı (2026-08-21)

131 denetim promptunun (P173–P303) tamamı kullanıcı tarafından dışarıda üretilip
`docs/assets/sources`'a bırakıldı: 10 arka görünüş + fren kareleri + 6 yedek
arketipin tam setleri + 8 gerçek bacak + 5 yemek ikonu + 30 yükseltme kartı
ikonu (`ui_upgrade_*` kanonik adlarıyla) + 3 aşama zemini + 2 FX dokusu +
20 UI ikonu + 3 durum illüstrasyonu. Üretici: §1.5'teki yönetici kararının
kapsamındaki God Mode AI hesabı — aynı karar, aynı MVP sınırı, madde 5 ve 8
aynı bilinçli kabulle. Bu ek yalnız teslimatı kayda geçirir; kapının "açıldı,
geçilmedi" durumu değişmemiştir ve monetizasyon öncesi yeniden açılma şartı
(P16/P23) aynen durur.
