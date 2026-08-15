# IMMUTABLE PROMPT BLOCK

**Version:** 1 · **Locked:** 2026-08-15 · **Contract:** [ASSET_PIPELINE §1.1](../ASSET_PIPELINE.md) + [§4.3 step 2](../ASSET_PIPELINE.md)

> This file is the **body** of every asset-generation prompt. Only the `SUBJECT` and `SIZE HINT`
> lines change between assets. Nothing else may be edited per-asset, per-batch, or "just this once" —
> that is what "immutable" means here, and it is the single mechanism that makes 160 sprites
> generated over weeks look like they belong to one world.
>
> **Enforced, not trusted.** The block between the `<!-- PROMPT-BLOCK:BEGIN -->` and
> `<!-- PROMPT-BLOCK:END -->` markers is hashed by `tools/asset-pipeline/promptBlock.ts`, and
> `tests/unit/tools/promptBlock.test.ts` asserts that hash against the value recorded below. Editing
> the block fails the build until the recorded hash is deliberately updated, at which point every
> asset in `assets/MANIFEST.md` still carries the hash it was actually generated under. An asset can
> therefore always be traced to the exact contract in force when it was made.

**Recorded hash (SHA-256 of the block, LF line endings, no trailing newline):**

```
1c4f4b4ee2e3dd33f54a3921b2be34c9f948c0bd51b347fa38f5588c434466d7
```

---

## The block

<!-- PROMPT-BLOCK:BEGIN -->

```
STYLE
Clean, warm, lightly stylised isometric illustration.
NOT photorealistic. NOT pixel art. NOT heavy cartoon.
Reference feel: the upper segment of modern mobile tycoon games —
readable silhouettes, soft volume, calm colour.

CAMERA
2:1 dimetric isometric. Fixed. No exceptions.
Approximately 30 degrees elevation, 45 degrees yaw.
Orthographic — NO perspective convergence.

LIGHT
A single key light from the north-west (upper-left on screen), 35 degree pitch.
Shadow falls to the lower-right: soft, 30% opacity, cool and bluish.
Ambient is warm daylight. This NEVER changes — day/night is a runtime shader
tint, never baked into an asset.

OUTLINE
2px outer contour at 2x scale. Dark and colour-derived — the dark saturated
form of the object's own colour, NOT black.
NO interior line work. Volume is described by shading, not by lines.

DETAIL
Medium. Silhouette first. Must still be recognisable at 1x (half size).
Small details do not read at game size; they only add noise.

PALETTE
Locked 48-colour palette, attached. No colour outside it.
Twelve four-step ramps; step 900 is the shadow side and supplies the outline,
step 300 is the lit side.

BACKGROUND
Fully transparent RGBA. The ground shadow is a separate file, never baked in.

ANCHOR
Composed so the footprint centre — not the visual centre — sits on the ground
plane: between the feet for a character, the centre of the four wheels for a
vehicle, the centre of the base rectangle for furniture and buildings.

HEIGHT LIMIT
Nothing may exceed 160px tall at 2x scale as a single sprite. Taller subjects
are produced as two separate images, a lower and an upper part, each complete
and independently croppable.

TEXT
No text baked into the artwork. Signage lettering is decorative shape only.
```

<!-- PROMPT-BLOCK:END -->

---

## The per-asset template

Only these two lines vary. The block above is prepended unchanged.

```
[PROMPT BLOCK — verbatim, above]
[REFERENCE IMAGES: <the approved golden references for this category>]
---
[SUBJECT: <specific asset description>]
[SIZE HINT: <reference height from ASSET_PIPELINE §1.2>]
```

Reference heights at 2x scale, from [ASSET_PIPELINE §1.2](../ASSET_PIPELINE.md):

| Subject     | Height                            |
| ----------- | --------------------------------- |
| Adult human | 128 px                            |
| Child       | 92 px                             |
| Sedan car   | 90 px (288 px long)               |
| Table       | 50 px                             |
| Chair       | 60 px                             |
| Door        | 145 px                            |
| Sign post   | 200 px → **must be split** (§1.4) |

---

## Fidelity to the Turkish source

[ASSET_PIPELINE §1.1](../ASSET_PIPELINE.md) is written in Turkish and is the source of truth. The
block above is its English rendering, because the prompt is sent to English-language image models —
sending the Turkish original would degrade the output while changing nothing about the contract.
The two are kept in step by hand; §1.1 wins in any dispute.

Three sections of the block are **not** translations of §1.1 but restatements of rules that live
elsewhere in the same document, pulled into the prompt because the generator needs them at
generation time rather than at validation time:

- `ANCHOR` — [§1.3](../ASSET_PIPELINE.md), the footprint-centre rule.
- `HEIGHT LIMIT` — [§1.4](../ASSET_PIPELINE.md), the mandatory 160px split rule.
- `TEXT` — [§12](../ASSET_PIPELINE.md), no baked text (accessibility: all readable text is DOM).

## Change record

| Date       | Version | Hash prefix | Change                                                |
| ---------- | ------- | ----------- | ----------------------------------------------------- |
| 2026-08-15 | 1       | `1c4f4b4e`  | First lock. No asset has yet been generated under it. |
