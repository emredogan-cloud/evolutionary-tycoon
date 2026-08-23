# LEVEL ASSET EVOLUTION LIBRARY

> **Every evolvable object × every level, and what it looks like at that level.**
>
> Written 2026-08-23 as the visual half of
> [`RESTAURANT_EVOLUTION_ROADMAP.md`](RESTAURANT_EVOLUTION_ROADMAP.md) Phase C.
> The property model is in `src/config/properties.ts`; this document is the
> record of what each of its levels is _drawn as_, and — where nothing draws it
> yet — the prompt that will.
>
> **Zero omission is the point** (directive §23). Every row below carries one of
> four verdicts and no row is left blank:
>
> | verdict                      | meaning                                                                              |
> | ---------------------------- | ------------------------------------------------------------------------------------ |
> | **VERIFIED ASSET**           | a delivered frame of this level's own, in `assets/source`, in the atlas, drawn today |
> | **EXTERNAL PROMPT REQUIRED** | the level is real in the simulation and has no art; a numbered prompt is filed       |
> | **PROCEDURAL BY DESIGN**     | there will never be a sprite — the renderer paints it from the layout                |
> | **INTENTIONALLY NON-VISUAL** | the level changes a number and nothing on screen, deliberately                       |

---

## §0 How this document stays true

Three mechanisms, none of them "remember to update the doc":

1. **The verdicts are data.** `PROPERTY_LEVEL_ART` in `src/config/properties.ts`
   carries a `kind` of `sprite` | `prompted` | `procedural` per level. The table
   in §2 is that data, transcribed.
2. **The verdicts are tested.** `tests/unit/config/properties.test.ts` asserts
   that every `sprite` level names a real `WORLD_OBJECTS` id _and_ differs from
   the level below it, that every `procedural` level names no sprite at all, and
   that the car park's cell counts come from the bay table rather than a second
   list. A level cannot be labelled "verified art" without art.
3. **The prompts are generated.** P315–P320 are produced from
   `tools/asset-pipeline/auditPrompts.ts` into
   [`ASSET_GENERATION_PROMPTS.html`](ASSET_GENERATION_PROMPTS.html), the same
   way all 320 are. `tests/unit/tools/promptExport.test.ts` and
   `pnpm assets:prompt-coverage` hold the catalogue and
   `docs/assets/assetRequirements.json` to each other — 0 missing, 0 duplicate,
   0 orphan, measured.

### Why the full prompt text is not pasted below

Each catalogue prompt is the **hash-locked immutable block**
(`docs/assets/PROMPT_BLOCK.md`) plus four varying lines. Copying the block into
this file would create an unversioned fork of a file whose whole mechanism is
that editing it fails a test until the hash is deliberately updated. So §3
reproduces the varying lines **verbatim** — the part that is about _this asset_ —
and the copy-ready whole, block included, is one click away in the catalogue
page under the prompt id. `tests/unit/docs/levelArtLibrary.test.ts` asserts the
SUBJECT lines here are byte-identical to the generator's.

---

## §1 What is evolvable, and what is not

The audit ([`LEVEL1_WORLD_INVENTORY.md`](LEVEL1_WORLD_INVENTORY.md) §E) found
**nine static objects, eight stations, thirty upgrade rungs and two machines**
in the Stage-1 world. Five of those are properties. The rest are not, and the
reason is the directive's own: _"Do NOT make every decorative prop levelable
just because it exists."_

| world object                            | property?          | why                                                                                                                         |
| --------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| counter (`counter-lv1` / `counter-lv2`) | **yes — main**     | it _is_ the restaurant; its level is the stage                                                                              |
| parking bays                            | **yes — parking**  | the one capacity ceiling with no upgrade owner                                                                              |
| grill (`grill-lv1` / `grill-lv2`)       | **yes — kitchen**  | the bench count is the kitchen's capacity                                                                                   |
| queue area + barriers                   | **yes — service**  | queue capacity is what the front of house is for                                                                            |
| sign (`sign`)                           | **yes — frontage** | conversion from the road is a single legible dial                                                                           |
| fryer, drink, pass                      | no                 | they are _stations_, bought individually in the store; a "level" over them would be a second price for a thing already sold |
| tables, chairs                          | no                 | seating arrives with the stage that has a dining room; there is no dial                                                     |
| bin, lamp, trees, bushes                | no                 | decor. A levelable bin is a card nobody opens twice                                                                         |
| awning, window, door                    | no                 | parts of the building sprite, not objects with their own state                                                              |

---

## §2 The coverage matrix

Eighteen rows: five properties, every level each one has. **No level is
omitted, and none is "TBD".**

| property | Lv  | name                | verdict                      | asset / prompt                                    | source file                                | runtime consumer                                                           |
| -------- | --- | ------------------- | ---------------------------- | ------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| main     | 1   | Yol kenarı tezgâhı  | VERIFIED ASSET               | `struct_counter_lv1@2x` (P106)                    | `assets/source/struct_counter_lv1@2x.png`  | `WORLD_OBJECTS['counter-lv1']` → `WorldScene`                              |
| main     | 2   | Yemek kamyonu       | VERIFIED ASSET               | `struct_truck_lv1_lower/_upper` (P313/P314 regen) | `assets/source/struct_truck_lv1_*@2x.png`  | `WORLD_OBJECTS['truck']` → `WorldScene`                                    |
| main     | 3   | Küçük lokanta       | VERIFIED ASSET               | `struct_counter_lv2@2x` (P107)                    | `assets/source/struct_counter_lv2@2x.png`  | `WORLD_OBJECTS['counter-lv2']` → `WorldScene`                              |
| main     | 4   | Büyük restoran      | **EXTERNAL PROMPT REQUIRED** | **P315** `struct_counter_lv3@2x`                  | _not delivered_                            | `PROPERTY_LEVEL_ART.main[3]`; world draws `counter-lv2` meanwhile          |
| parking  | 1   | Yol kenarı cebi     | PROCEDURAL BY DESIGN         | 4 bays, painted                                   | —                                          | `WorldScene.drawSurfaces` from `layout.parking`                            |
| parking  | 2   | İşaretli otopark    | PROCEDURAL BY DESIGN         | 5 bays, painted                                   | —                                          | as above                                                                   |
| parking  | 3   | Geniş otopark       | PROCEDURAL BY DESIGN         | 8 bays, painted                                   | —                                          | as above                                                                   |
| kitchen  | 1   | Tek tezgâh          | VERIFIED ASSET               | `struct_grill_lv1@2x` (P004)                      | `assets/source/struct_grill_lv1@2x.png`    | `WORLD_OBJECTS['grill-lv1']`                                               |
| kitchen  | 2   | İkinci tezgâh       | VERIFIED ASSET               | `struct_grill_lv2@2x` (P115)                      | `assets/source/struct_grill_lv2@2x.png`    | `WORLD_OBJECTS['grill-lv2']`                                               |
| kitchen  | 3   | Üçüncü tezgâh       | **EXTERNAL PROMPT REQUIRED** | **P316** `struct_grill_lv3@2x`                    | _not delivered_                            | `PROPERTY_LEVEL_ART.kitchen[2]`; world draws `grill-lv2` meanwhile         |
| service  | 1   | Dar tezgâh önü      | VERIFIED ASSET               | `struct_counter_lv1@2x` (P106)                    | `assets/source/struct_counter_lv1@2x.png`  | the counter the queue forms at                                             |
| service  | 2   | Geniş tezgâh        | **EXTERNAL PROMPT REQUIRED** | **P317** `struct_counter_wide_lv1@2x`             | _not delivered_                            | `PROPERTY_LEVEL_ART.service[1]`; world draws `counter-lv1` meanwhile       |
| service  | 3   | Sıra bariyerleri    | VERIFIED ASSET               | `struct_barrier@2x` (P248)                        | `assets/source/ui_upgrade_barrier@2x.png`  | `WORLD_OBJECTS['barrier']`                                                 |
| service  | 4   | Düzenlenmiş ön alan | **EXTERNAL PROMPT REQUIRED** | **P318** `struct_forecourt_lv1@2x`                | _not delivered_                            | `PROPERTY_LEVEL_ART.service[3]`; world draws `barrier` meanwhile           |
| frontage | 1   | El yazısı tabela    | VERIFIED ASSET               | `struct_sign_large_lower/_upper` (P112/P113)      | `assets/source/struct_sign_large_*@2x.png` | `WORLD_OBJECTS['sign']`                                                    |
| frontage | 2   | Boyalı tabela       | **EXTERNAL PROMPT REQUIRED** | **P307** `struct_sign_large_painted_upper@2x`     | _not delivered_                            | filed 2026-08-22 by the UI/world correction pass; **not re-numbered here** |
| frontage | 3   | Işıklı tabela       | **EXTERNAL PROMPT REQUIRED** | **P319** `struct_sign_large_lit_upper@2x`         | _not delivered_                            | `PROPERTY_LEVEL_ART.frontage[2]`; world draws the unlit board meanwhile    |
| frontage | 4   | Aydınlatmalı cephe  | **EXTERNAL PROMPT REQUIRED** | **P320** `struct_frontage_lights@2x`              | _not delivered_                            | `PROPERTY_LEVEL_ART.frontage[3]`; world draws the sign alone meanwhile     |

**Tally: 8 VERIFIED ASSET · 7 EXTERNAL PROMPT REQUIRED · 3 PROCEDURAL BY DESIGN · 0 INTENTIONALLY NON-VISUAL · 0 unclassified.**

Six of the seven are new (P315–P320). The seventh, frontage Lv2, **already had a
prompt** — P307, filed by the 2026-08-22 pass, for exactly this frame. Giving it
a second number would have been the same asset ordered twice.

### What the player sees at a level with no art

Nothing false. The inspect card's preview reads the verdict:

- **VERIFIED ASSET** → the frame, drawn.
- **PROCEDURAL BY DESIGN** → the bays themselves, painted at card size, with the
  ones this level adds picked out in the accent colour.
- **EXTERNAL PROMPT REQUIRED** → the words _"Görsel üretimde"_.

It never shows the current frame as the next one (§17), and it never tells the
player to wait for a picture nobody is making. Both of those were real states
of this code before `kind` replaced a boolean: the car park claimed verified art
it did not have, and the card rendered "still in production" over a
`data-art="real"`. `tests/e2e/inspectCard.spec.ts` is what found it.

---

## §3 The prompts

Copy-ready text for each new asset. **Paste the immutable block from the
catalogue page first** — these are the varying lines the block is followed by,
reproduced verbatim from `tools/asset-pipeline/auditPrompts.ts`.

Every one is a **frame swap into an existing world box**. A level that changed a
footprint would move the object's anchor, its navigation blocker and every depth
comparison it takes part in; the level would be a layout change wearing a
sprite's clothes. Same box, new picture.

### P315 — `struct_counter_lv3@2x` · main Lv4 "Büyük restoran"

**What it is.** Stage 3's small diner having its frontage finished. Same plot,
same camera, same counter point — the player has to recognise the place they
built.

```
[SUBJECT: the STAGE-4 restaurant frontage that struct_counter_lv2 grows into — same 3.0 x 0.8 m counter block and the same serving face, now a finished building front: rendered wall panel above the counter, a proper fascia band, a wide glazed section to one side and a tiled sill course, reading as a permanent premises rather than a converted stall]
[SIZE HINT: exactly the struct_counter_lv2 canvas at 2x (243 x 192 px), same anchor]
[NOTE: Stage 4 is the same plot, the same camera and the same counter point as Stage 3 — the player must recognise the place they built. This is the Stage-3 diner having its frontage finished, not a new restaurant.]
[NOTE: The counter surface must stay at the same height and the same y as struct_counter_lv2: the queue stands 0.8 m from the counter point and the serve animation targets that surface.]
[DO NOT widen the footprint — the block is 3.0 x 0.8 m at every stage and the drive-thru is a separate asset]
[DO NOT render legible signage text; the sign is its own object]
```

### P316 — `struct_grill_lv3@2x` · kitchen Lv3 "Üçüncü tezgâh"

**What it is.** The third bench in a family of three that are seen side by side,
so the progression has to read at a glance from the silhouette alone.

```
[SUBJECT: the THIRD kitchen bench in the struct_grill_lv1 / struct_grill_lv2 family — same 1.2 x 0.7 m box and the same stainless language, now clearly the top of the line: a double burner section, a raised salamander shelf over the back edge, and a small utensil rail]
[SIZE HINT: exactly the struct_grill_lv2 canvas at 2x, same anchor]
[NOTE: The three benches are read side by side in the kitchen, so the progression must be legible at a glance: lv1 plain, lv2 with the extended top, lv3 with the shelf above it.]
[NOTE: Silhouette carries the difference — the shelf is what a player sees from the isometric camera.]
[DO NOT add food, flames or steam — the renderer emits those as FX]
```

### P317 — `struct_counter_wide_lv1@2x` · service Lv2 "Geniş tezgâh"

**What it is.** The visible half of the `bigger-counter` rung, which today
changes queue capacity and nothing on screen.

```
[SUBJECT: the WIDENED service counter the bigger-counter rung installs — the struct_counter_lv1 cabinet extended along its long axis with a second serving position: two till stations on the surface, a longer sneeze-guard rail, one continuous cabinet front]
[SIZE HINT: exactly the struct_counter_lv1 canvas at 2x, same anchor]
[NOTE: Drawn at the same counter point as struct_counter_lv1; the extra width is what tells the player their queue got shorter.]
[NOTE: The overhang stays over the same 0.4 m blocked band — customers walk under the lip, and moving it changes where the queue can stand.]
[DO NOT draw staff or customers; DO NOT bake a ground shadow]
```

### P318 — `struct_forecourt_lv1@2x` · service Lv4 "Düzenlenmiş ön alan"

**What it is.** Dressing for the space the queue stands in. It must not read as
an obstacle, because it is not one — nothing blocks in the walking lane.

```
[SUBJECT: front-of-house dressing for a tidied forecourt: a low planter run, two rope-and-post stanchions and a small paved apron, as ONE cluster on transparent ground, arranged along the isometric x axis so it reads as an edge rather than a blob]
[SIZE HINT: 320 x 200 px at 2x, footprint 3.0 x 1.0 m]
[NOTE: Sits in front of the counter where the queue forms; it must not read as an obstacle in the walking lane, because it is not one — nothing blocks here.]
[NOTE: Joins struct_barrier and struct_planter in language: same stone, same rope, same value range.]
[DO NOT enclose the space — an open front is what makes it a forecourt and not a fence]
```

### P319 — `struct_sign_large_lit_upper@2x` · frontage Lv3 "Işıklı tabela"

**What it is.** The painted board of P307 with its lamps on. **Upper half only**
— the sign is a split pair and the lower half is unchanged.

```
[SUBJECT: the UPPER HALF ONLY of the delivered struct_sign_large signboard, now ILLUMINATED: same board, same posts, same twin lamps, with the lamps LIT — warm pool of light across the board face, the painted menu illustration clearly visible inside it, and a soft glow falloff at the board edges]
[SIZE HINT: same canvas as struct_sign_large_upper at 2x]
[NOTE: Anchor, proportions and palette identical to struct_sign_large_upper and to struct_sign_large_painted_upper (P307) — the runtime swaps the frame as the sign rung is bought, and the three must line up to the pixel.]
[NOTE: This is the painted board with its lamps on. Draw the painted board first, then light it.]
[NOTE: The lower half is unchanged and is NOT regenerated; only the board above the cut is lit.]
[DO NOT render legible text — squiggles that read as writing, never actual letters]
[DO NOT let the glow cross the bottom edge of the canvas; the join row must stay identical to the unlit upper half]
```

> **Split-pair discipline.** `tests/unit/config/splitComposition.test.ts`
> measures join-row coverage for every `_lower`/`_upper` pair and fails below
> 0.90. This asset shares a lower half with two other uppers, so its join row is
> not merely _a_ constraint — it is the same row three files have to agree on.

### P320 — `struct_frontage_lights@2x` · frontage Lv4 "Aydınlatmalı cephe"

**What it is.** The only property level that _adds_ an object rather than
swapping one. It composites over whatever building it hangs on.

```
[SUBJECT: a run of warm festoon lights for the building frontage — a gentle catenary of small bulbs on a dark cable, lit, with a short bracket at each end, on transparent ground]
[SIZE HINT: 384 x 96 px at 2x, footprint 3.0 x 0.2 m]
[NOTE: Drawn across the front of the building at Stage-4 frontage level; the cable sags below the fascia and the bulbs are the only light source in the sprite.]
[NOTE: Must read at dusk and at noon — the bulbs carry a lit core plus a small warm halo rather than a full-sprite bloom.]
[DO NOT bake the wall behind it — this composites over whatever building it hangs on]
[DO NOT animate; the renderer handles any flicker]
```

### P307 — `struct_sign_large_painted_upper@2x` · frontage Lv2 "Boyalı tabela"

Already filed, 2026-08-22, by the UI/world correction pass. Its text is in the
catalogue under P307 and is **not restated here** — a second copy is a second
thing to keep in step, and the id is the reference.

---

## §4 What is still not delivered, said plainly

Seven of eighteen property levels have no art. That is **39% of the visual
ladder**, and it is the honest number rather than a rounded one.

Nothing about that is hidden from the player: those seven levels are buyable,
their effects are real, their cards say what they cost and what they do, and
their previews say the picture is still being made. What they do **not** do is
show the current frame and let the player believe they are buying a new one.

The seven are ordered by when they are first reachable:

| order | property × level | first reachable     | prompt |
| ----- | ---------------- | ------------------- | ------ |
| 1     | frontage Lv2     | Stage 1             | P307   |
| 2     | service Lv2      | Stage 1             | P317   |
| 3     | kitchen Lv3      | Stage 2, player Lv5 | P316   |
| 4     | frontage Lv3     | Stage 2             | P319   |
| 5     | service Lv4      | Stage 3             | P318   |
| 6     | main Lv4         | Stage 4             | P315   |
| 7     | frontage Lv4     | Stage 4             | P320   |

The first two are reachable in the opening session, which makes them the two
that matter most. They are `P317` and `P307`, and both are frame swaps against
already-delivered art — the cheapest possible generation, because the reference
is in the repository.

### Licence position

Unchanged and **not restated as passed**. `assets/LICENSES.md` §1.5 records the
2026-08-21 executive override: God Mode AI selected, items 5 and 8 knowingly
accepted unverified, scoped to the MVP, reopen before monetisation and at Phases
16 and 23. These six new prompts are scoped inside that same override and add no
new supplier.

---

## §5 Cross-references

- Property model and ladders — `src/config/properties.ts`
- Which level a property is at — `src/sim/systems/properties.ts`
- The card that shows all of this — `src/ui/components/InspectCard.svelte`
- Design and dependency order — [`RESTAURANT_EVOLUTION_ROADMAP.md`](RESTAURANT_EVOLUTION_ROADMAP.md)
- What the Stage-1 world contains — [`LEVEL1_WORLD_INVENTORY.md`](LEVEL1_WORLD_INVENTORY.md)
- Prompt catalogue — [`ASSET_GENERATION_PROMPTS.html`](ASSET_GENERATION_PROMPTS.html) (P315–P320)
- Requirements matrix — `docs/assets/assetRequirements.json`
- Pipeline rules and thresholds — [`ASSET_PIPELINE.md`](ASSET_PIPELINE.md)
