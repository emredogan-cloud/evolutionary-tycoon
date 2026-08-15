# ASSET MANIFEST — provenance

Every accepted production asset, with the tool that made it, the contract it was made under, and
the golden reference it derives from ([ASSET_PIPELINE §4.3 step 6](../docs/ASSET_PIPELINE.md)).

The purpose is a question that gets asked three months later: _"generate a matching hat for this
character."_ Answering it needs the tool, the prompt contract and the reference — not a memory of
which afternoon the sprite was made.

---

## Status

> ## No production asset exists.
>
> The Phase 4 START CONDITION — nine-item licence verification from primary sources — **did not
> close**. See [LICENSES.md §1](LICENSES.md). The roadmap's own rule for that state is explicit:
> _"Bu kapı geçilmeden Faz 4'te tek bir üretim asset'i üretilmez. Altın referans üretimi de buna
> dâhil."_ No asset was generated, and no provider was silently substituted.
>
> The pipeline that would record rows here is built, tested and running in CI. It has never seen a
> production asset — only the synthetic fixtures in `tools/asset-pipeline/testFixtures.ts`, which
> exist to prove the nine validation checks fail on the right input and never ship.

## Contract in force

| Field                | Value                                                                          |
| -------------------- | ------------------------------------------------------------------------------ |
| Prompt block         | [`docs/assets/PROMPT_BLOCK.md`](../docs/assets/PROMPT_BLOCK.md) v1             |
| Prompt block SHA-256 | `1c4f4b4ee2e3dd33f54a3921b2be34c9f948c0bd51b347fa38f5588c434466d7`             |
| Palette              | [`docs/assets/palette.json`](../docs/assets/palette.json) v1, 48 colours       |
| Reference heights    | [`docs/assets/referenceHeights.json`](../docs/assets/referenceHeights.json) v1 |
| Production scale     | 2x                                                                             |

The prompt block hash is asserted against the document by
`tests/unit/tools/assetNaming.test.ts`, and stamped into `public/asset-manifest.json` by
`tools/asset-pipeline/manifest.ts`. Every row below will carry the hash **in force when it was
generated**, not the current one — that is what makes an asset traceable across a contract change.

---

## Accepted assets

| Asset    | Tool | Content SHA-256 | Date | Licence | Golden reference |
| -------- | ---- | --------------- | ---- | ------- | ---------------- |
| _(none)_ |      |                 |      |         |                  |

---

## Golden references

The 6–10 approved images that define the style for the whole project
([ASSET_PIPELINE §4.3 step 1](../docs/ASSET_PIPELINE.md)): one character, one vehicle, one table,
one appliance, one ground fragment, one tree.

| Reference                                         | Tool | Approved by | Date | Notes |
| ------------------------------------------------- | ---- | ----------- | ---- | ----- |
| _(none — production blocked on the licence gate)_ |      |             |      |       |

Approval of these is a **human gate**, not an automated one. The roadmap wording is
_"STOP and get human approval on these before producing anything else."_

---

## Not production assets

Listed so nothing here is ever mistaken for art.

| Path                        | What it is                                      | Where it is registered                                  |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| `assets/_placeholder/*.png` | Magenta/black checkers at the real sprite sizes | [PLACEHOLDER_REGISTER](../docs/PLACEHOLDER_REGISTER.md) |
| `public/favicon.svg`        | Written for this project                        | [LICENSES §3](LICENSES.md)                              |
