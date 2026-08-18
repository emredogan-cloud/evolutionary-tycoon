# ADR-013 — The delivered art defines the style contract, and the checks change to match

**Status:** Accepted · **Date:** 2026-08-18 · **Phase:** consolidation batch (post P13, pre P14)

## Context

The complete production art set — 172 images, the whole of `docs/assets/productionBatches.json` —
was delivered on 2026-08-18. It is the first real art the project has ever had. Run through the
existing pipeline it failed **every one of the nine checks' most important gate**:

```
172 assets, 172 failing.
  palette-compliance     172
  light-direction         49
  reference-height        37
  file-budget             33
  transparent-background    1
  split-rule                1
```

`palette-compliance` requires 92% of an asset's opaque pixels within RGB distance 8 of one of 48
locked palette entries. The delivered set measures **3.5% to 20%** — including the seven golden
references, which are by definition the assets the style was to be judged against.

Two things had to be separated before anything could be decided:

1. **Measurement artefacts.** The generator wrote every subject's interior at **alpha 253**, not 255.
   `palette-compliance` and `light-direction` both skip any pixel below 255, so on the raw drop they
   were sampling ~0.05% of each subject and reporting noise. Nothing could be judged until that was
   fixed, and fixing it is conditioning the source, not moving a threshold.
2. **Genuine mismatch.** With the alpha snapped and the art measured properly, `palette-compliance`
   still fails at 3.5–20%. The delivered art is **continuous-tone illustration**; `palette.json`
   describes a flat-shaded 48-colour style. These are two different art directions.

Quantising the art to the locked palette was built and measured. It makes the check pass by
construction and **visibly damages the art**: false beige patches across the sedan's roof and bonnet,
the tree canopy flattened out of depth, character shading muddied. The evidence image is in
`docs/ASSET_INTEGRATION_REPORT.md` §3.

CLAUDE.md and WORKING_DISCIPLINE §6 are explicit that a threshold real art cannot meet is a change
request against ASSET_PIPELINE, never an edit to `validate.ts`. This is that change request, decided
by the user on 2026-08-18: **the delivered art is the art direction; the checks encoding the old one
change, with each change documented and evidenced.**

## Decision

### 1. `palette-compliance` is replaced by `palette-affinity`

The old check asks _is every pixel a palette swatch_, which is answerable only for flat-shaded art.
The question worth keeping is _does this asset belong to the same world as the rest_ — identity, not
conformance — and that survives the change of art direction.

`palette-affinity` measures the **mean distance from an asset's interior pixels to the nearest
palette entry**. The threshold is not chosen: uniformly random RGB sits **51.48** from this palette
(400 000 Monte Carlo samples; 48 points in a 256-cube predict 43.7 from volume alone). That is the
no-information point. An asset at or above it has no demonstrable relationship to the palette.

- **Fail** at or above `affinityBaseline`.
- **Off-family warning** between `affinityWarn` (0.75) of the baseline and the baseline.

It is not a formality. On its first run it separated the set cleanly: world art measures **12–30**,
the UI icon batch measures **40–61**, and **seven UI icons sit at or past the random baseline**. The
check found a real inconsistency the old one had drowned in noise.

### 2. Three checks were measuring the wrong quantity

Each of these is the same class of defect PHASE_4_REPORT §12 already records against
`reference-height` — the right threshold compared against the wrong number — and each is fixed by
measuring what the document names.

| Check                    | Was                                   | Now                                                                     |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------------- |
| `reference-height`       | alpha bounding box vs declared canvas | **image size** vs declared canvas, for fixed-canvas subjects            |
| `split-rule`             | applied to fixed-canvas subjects      | **exempt** — a ground bake has no footprint, so no depth cycle to split |
| `transparent-background` | applied to `ground`, `road`, `bg`     | **exempt** — a baked surface is opaque by construction                  |

§2 declares "UI ikon, 128²" — a _canvas_ size. Read as a bounding box it demanded every glyph's ink
reach all four edges, which failed a close cross at 128x58 and a coin at 128x127, both correctly
drawn. "Not lost in empty space" is `alpha-coverage`'s job and `alpha-coverage` still does it.

### 3. A directional sprite has eight sizes, not one

`isoSpriteMetrics` projects a box whose long side runs along world X. That is one of eight cases.
A 4.5 m car is **407 x 182 px seen side-on** and **336 x 317 corner-on**; sizing all eight to the
axis-aligned 410 x 301 made the side views 2.8x too many pixels. It surfaced as the vehicle atlas
landing at **216% of its §13 budget**, and would have surfaced next as a car that changes size as it
turns. `isoSpriteMetricsFacing` inverts the projection on the screen heading and projects the rotated
footprint; the validator and the importer both use it.

### 4. Sprites are fitted to the projected **width**, and the height is a ceiling

The delivered art is drawn at a **shallower camera than the world's 2:1 dimetric**: a corner-on car
projects to 336 x 317 and the illustration's own aspect is 336 x 217. Stretching to the projected
height by 1.46x turns every wheel into an ellipse.

The footprint is the authoritative quantity — it is what parks in a bay, fits a lane, and anchors the
depth sort — so `assets:import` fits to the projected width. A sprite shorter than its box is a lower
camera angle and is fine; a taller one overflows its own footprint and will overlap its neighbours.
`reference-height` therefore asserts the **ceiling**, which is the half that can actually go wrong.

### 5. `file-budget` splits into an absolute rule and an outlier test

The old per-file cap compared a **lossless source PNG** against a budget §13 states for _shipped_
bytes — the vehicle set is 3.04 MB of PNG and 1.38 MB of the WebP that reaches a player. It failed 33
correctly sized sprites on a unit mismatch.

- **Absolute:** no single file may exceed its whole category's budget. True in any unit.
- **Outlier:** no file may cost more than 3x its category's **median bytes per pixel**. Bytes alone
  fire on every large object — a 6.5 m food truck is legitimately eight times a serving hatch —
  while bytes-per-pixel catches what "hiding inside a category" actually looks like.

### 6. Category budgets are measured on shipped bytes

`report.ts` measured processed PNGs because "a page mixes several categories, so an atlas cannot be
attributed back". In this atlas layout that is false: every atlas holds exactly one budget group,
except `ui`, which holds `ui` and `food` — and `SHARED_BUDGETS` already folds `food` into `ui`. The
map is computed, not written down, so an atlas that later mixes two groups falls back to processed
bytes rather than silently under-counting.

### 7. Texture memory is enforced; atlas fill is reported

Pages are power-of-two. A set whose content needs 862 kpx cannot use a 1.05 Mpx page — MaxRects will
not reach 82% occupancy — and lands on 2.1 Mpx, which is 41% fill with no packing that does better.
An exhaustive search over every power-of-two page confirmed the sizes are already minimal. Mandatory
2px padding plus 2px extrude adds more area than the sprite itself on a 22px character head.

A floor no correct build can reach is not a floor. So the **96 MB mobile texture budget** that
ASSET_PIPELINE §17 and TECHNICAL_ARCHITECTURE §11 both state is what fails a build, and the fill
percentage is printed beside it as the first thing to look at when that total climbs. Measured after
integration: **25.13 MB / 96 MB**.

The packer also now shrinks each page to the smallest power-of-two that holds it, which took the
character atlas from 9.5% fill on a 256 x 2048 strip to 38% on 512 kB.

### 8. Failures that remain are waived per asset, never switched off

`docs/assets/ACCEPTED_EXCEPTIONS.json` holds **58 entries**, each naming one asset, one check, the
measured value, a date and a reason. The check still runs and still measures; `assets:validate`
prints the asset as `warn`, never `ok`, and the count is carried in PROJECT_MEMORY §17. A new asset
failing the same check is still a failure until somebody writes it down.

- **49 × `light-direction`.** The check splits the alpha bounding box on its anti-diagonal, which
  biases against light-bodied and diagonally-massed silhouettes — the same rig part passes facing
  se/nw and fails facing ne/sw, and every failing vehicle is a near-white body whose windscreen and
  headlights fall in the lower-right half. Visual review of the worst eight found no relit asset.
- **7 × `palette-affinity`.** Genuinely off-family UI icons, drawn in saturated primaries. The check
  is right; the art ships unchanged by this decision, and the fix is a regenerated icon set drawn
  against the `neutral`, `foliage` and `amber` ramps.
- **2 × `reference-height`.** The round table and the drinks cabinet overflow their boxes by under
  40% for the shallow-camera reason in §4.

## Alternatives rejected

**Quantise every asset to the locked palette.** Passes `palette-compliance` by construction. Rejected
on measured visual damage — see §Context. It would also have left `light-direction` failing, so it
bought one check and no others.

**Lower `tolerance` or `coverage` in `palette.json`.** Explicitly forbidden by CLAUDE.md, and it
would have produced a number that means nothing: there is no tolerance at which continuous-tone art
"conforms" to a 48-colour list short of one that admits any image at all.

**Reject the art and regenerate.** The agent cannot generate images, and the user's instruction was
that this is the complete planned set.

**Hybrid — quantise UI and fx, change-control the world art.** Offered and not chosen. It would have
put two art standards in one world for the sake of seven icons that the exception register now names
explicitly.

## Consequences

- The style contract is now: **the delivered illustration set**, with the palette as a colour
  _identity_ rather than a colour _list_. `docs/ASSET_PIPELINE.md` §1.1 and §4.3 need updating to say
  so; that is tracked as part of this consolidation.
- `assets:validate` is green on the full set with 58 named waivers and 17 off-family warnings.
- Every budget in `assets:report` is within limits, on shipped bytes.
- The waivers are debt with a name. The 7 UI icons and the 10 missing vehicle views
  (`docs/assets/DIRECTION_AUDIT.json`) are the art tasks this consolidation could not do for itself.
- Reversal cost is low: the exception register can be emptied and `palette.json`'s original pair is
  untouched, so restoring the old contract is deleting one file and swapping one function back.
