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

> ## 🔴 GATE NOT CLOSED
>
> **Two providers substantially pass. No provider addresses all nine items in public documentation,
> and item 8 — rights after a subscription ends — is unaddressed by every one of them.**
>
> That is the item the Phase 1 correction added on purpose, because it is the one that bites later:
> a studio that cancels a subscription and discovers its shipped art was licensed only while paying
> has a problem no amount of engineering fixes. It cannot be closed by reading public pages; it needs
> written confirmation from the provider.
>
> **No production asset has been generated.** The gate is respected, not worked around.

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

---

## 2. What this means for Phase 4

Per [ASSET_PIPELINE §4.2](../docs/ASSET_PIPELINE.md): _"Bir sağlayıcı kriterleri karşılamıyorsa
sessizce başka araca geçilmez"_ — no silent substitution. So no substitution has been made, and no
asset has been generated.

**To close the gate, the project owner needs to:**

1. Ask God Mode AI, in writing, whether the copyright assignment survives cancellation of the
   subscription, and whether uploading reference images grants them any rights. Two questions.
2. Decide on Scenario's item 6 — whether it is acceptable for the art-direction references to
   improve a third party's models on a self-serve plan, or whether that argues for Enterprise.
3. Either obtain a real terms document for Sprixen or drop it from the candidate list.

**Recommendation on the evidence gathered:** God Mode AI as primary — an outright assignment of
copyright with no attribution requirement and no training on private content is materially stronger
than the alternatives — subject to (1). Scenario stays as the style-lock candidate subject to (2).

---

## 3. Asset register

No production asset exists yet. The only images in the repository are placeholders.

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

| Date       | Phase | Action                                                                                                |
| ---------- | ----- | ----------------------------------------------------------------------------------------------------- |
| 2026-08-15 | 4     | First verification. Four providers checked from primary sources; gate **not closed** — see §1 and §2. |
