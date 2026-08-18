# ASSET INTEGRATION REPORT — production art, end to end

**Date:** 2026-08-18 · **Batch:** consolidation (post P13, pre P14) · **Branch:** `phase/consolidation-art`
**Source:** `docs/assets/sources/` — 172 files, 153.1 MB, delivered complete by the user
**Decision record:** [ADR-013](DECISIONS/ADR-013-delivered-art-contract.md) (art contract) ·
[DIRECTION_AUDIT.json](assets/DIRECTION_AUDIT.json) (vehicle facings) ·
[ACCEPTED_EXCEPTIONS.json](assets/ACCEPTED_EXCEPTIONS.json) (60 per-asset waivers)

---

## 1. Inventory

Full recursive inventory before anything was moved (§2 of the directive):

| Fact                          | Value                                                                      |
| ----------------------------- | -------------------------------------------------------------------------- |
| Files                         | **172** — exactly the 172 `productionBatches.json` plans, no more, no less |
| Bytes                         | 153.1 MB of RGBA PNG, sRGB, all with alpha                                 |
| Dimensions                    | ~1024–1774 px per side (generator canvases, not sprites)                   |
| Content-hash duplicates       | 0                                                                          |
| Name collisions after mapping | 0                                                                          |
| Unparseable names             | 0 after canonicalisation                                                   |

**Filename mapping.** The drop is numbered (`112- struct_sign_large_lower@2x.png`), one file is
double-suffixed (`…ne@2x.png.png`), several carry stray spaces. `assets:import` canonicalises
(strip index prefix, collapse spaces, fix the double suffix) and records the mapping — 172 renamed,
zero ambiguous. The staging directory stays gitignored (P7 decision); everything that matters
survives into `assets/source/` as processed sprites.

**Alpha finding that gated everything else:** the generator wrote every subject's interior at
**alpha 253**, not 255. The two colour checks sampled only `=== 255` pixels, so on the raw drop they
measured ~0.05% of each subject and reported noise. Import snaps the ≥250 plateau to 255 and the ≤6
haze to 0; this is what made the art measurable at all.

## 2. The pipeline it went through

`assets:import` (new stage) → `validate` → `process` → `atlas` → `manifest` → `report`, no stage
bypassed, no threshold silently lowered. Where the delivered art and the Phase-4 contract genuinely
disagreed, the contract moved **by change control** (ADR-013, decided by the user 2026-08-18):
`palette-compliance` → `palette-affinity` (identity, thresholded at the measured random-colour
baseline 51.48); canvas subjects measured on their canvas; baked surfaces exempt from the
transparent-corner and split rules; per-file budget split into an absolute cap and a bytes-per-pixel
outlier test; per-direction sprite boxes (`isoSpriteMetricsFacing`); width-authoritative fitting with
the height as a ceiling.

**Final validation state: `172 assets, 0 failing, 60 accepted exceptions, 17 off-family warnings.`**
Every waiver names its asset, check, measured value, date and reason; `warn` is printed, never `ok`.

## 3. The matrix (§3 of the directive)

Category-level rollup of EXPECTED → SOURCE → PROCESSED → RUNTIME → CONSUMER → BROWSER-VERIFIED.
Every one of the 172 rows ends **VERIFIED**; the per-file listing is reproducible from
`pnpm assets:validate` and the atlas JSONs, and the browser column is enforced by
`tests/e2e/productionArt.spec.ts` (171 atlas frames loaded + the ground bake, 0 placeholder quads,
0 failed atlas requests, on all four stages).

| Category (n)  | Atlas        | Runtime consumer                                                                 | Verified in browser             |
| ------------- | ------------ | -------------------------------------------------------------------------------- | ------------------------------- |
| char (68)     | `chars`      | `WorldScene.drawPerson` — 5-part rig, 80 appearances                             | ✅ zoomed captures              |
| veh (32)      | `vehicles`   | `drawVehicle` via `DIRECTION_AUDIT` assignment                                   | ✅ labelled sheets + world      |
| struct (14)   | `structures` | layout statics + owned-upgrade objects                                           | ✅ all stages                   |
| prop (6)      | `props`      | statics + `layout.tables`-driven furniture                                       | ✅ stage 3/4                    |
| nature (11)   | `nature`     | statics (split pairs stack lower/upper)                                          | ✅ all stages                   |
| ground (1)    | single file  | stretched bake masked to the lot diamond                                         | ✅ all stages                   |
| food (6)      | `ui`         | order bubbles (DOM, CSS-sprite from the same atlas)                              | ✅ live bubble                  |
| ui icons (30) | `ui`         | loaded; DOM HUD remains text-first by design                                     | ✅ loaded, 7 flagged off-family |
| fx (4)        | `fx`         | **loaded, no emitter consumes them yet** (bursts are procedural by P13 decision) | ✅ loaded, unused recorded      |

## 4. Findings — what the audit actually caught

Found by opening the game, not by reading the code. Fixed unless marked as debt:

1. **The vehicle set has six viewpoints, not eight, and three of the four archetypes have no rear
   view at all.** The receding slots were near-duplicates of forward views; half the road drew cars
   driving backwards. `DIRECTION_AUDIT.json` assigns each file to the facing it truly shows, mirrors
   where a mirror is truthful (cars are laterally symmetric), and names the **10 missing views**.
2. **The character art is not the doll rig that was ordered.** `char_body_*` is a complete headless
   figure (torso + legs + boots) and `char_leg-l/r` are a second pair of arms — drawn as specified,
   people had four arms and knee-length legs. Five parts are drawn; the 8 leg files are imported,
   validated, and consumed by nothing, asserted so in `sprites.test.ts`.
3. **Split halves are complementary, not overlapping** — the prompt's own wording. The shared-diamond
   subtraction made every tree 37.5% too tall (a roadside tree five times the stand's height).
4. **The drive-thru lane was authored at 1.5 m centres for 4.5 m cars** — Phase 11's car-park defect,
   one lane over. Respaced at the car park's own 5.5 m pitch: the lot holds two in-lane cars, the
   tail is the designed on-road spill, the lane furniture moved to the driver's-side flank (the
   serving hatch had been drawn on the window car's bonnet).
5. **Buying an upgrade spawned the one placeholder the zero-count couldn't see** — the upgrade
   config's owned-object markers still named `ph-*`. All 30 now name a truthful world object or
   deliberately nothing (14 are processes: sharper knives do not stand in the forecourt).
6. **The brake tint read as paint** on near-white bodies (a rose-pink sedan in the golden). Removed;
   deceleration reads through the nose-dip; `_brake` frames are regeneration work.
7. **The old palette-era checks misread the art wholesale** (172/172 failing) — resolved as ADR-013.
8. **The drive-thru ordered from the whole menu**, ignoring `MenuItem.stage` — Phase 13's fix had
   missed it. Fixed inside the ADR-016 basket work.
9. **The nav grid blocked by placeholder texture keys**, so the real layouts initially blocked
   nothing — then blocked _too much_ (tree canopies as walls). Block footprints are now the trunk,
   not the canopy, the same principle CLAUDE.md states for depth.
10. Sundry composition: ground bake seams (now one masked stretch), table pads at parking-bay
    brightness (quartered), the square two-top arriving with chairs painted on (chair placement is
    round-table only), the fastest sedan physically unable to brake for the entrance
    (decision point 14 m → 20 m, lanes extended to keep it off the spawn edge).

## 5. Art gaps — regeneration work this batch could not do

An agent cannot generate images. Named, not hidden:

| Gap                                             | Count | Where recorded                                         |
| ----------------------------------------------- | ----: | ------------------------------------------------------ |
| Vehicle rear / rear-¾ views                     |    10 | `DIRECTION_AUDIT.json` `gaps`                          |
| True leg art for the rig                        |     8 | `sprites.ts` `UNUSED_RIG_SUBJECTS`                     |
| `_brake` frames                                 |     8 | this report §4.6                                       |
| Food icons for 5 menu items                     |     5 | `sprites.ts` `FOOD_ICONS` note                         |
| UI icons drawn off-family (saturated primaries) |     7 | `ACCEPTED_EXCEPTIONS.json`                             |
| Road surface bake                               |     1 | `PLACEHOLDER_REGISTER.md` (procedural, palette-locked) |
| Stage 2/3/4-specific ground bakes               |     3 | `GROUND_FRAMES` reuses stage 1's                       |

## 6. Placeholder state

**Production screens: 0**, asserted two ways as the directive requires — machine
(`data-asset-placeholders` counted per frame, `productionArt.spec.ts` across all stages, busy and
idle, plus the owned-upgrade path) and human (every capture in this batch). The six generated
sprites remain on disk as the degraded-network fallback and say so on screen when they fire;
`PLACEHOLDER_REGISTER.md` records the new state row by row.

## 7. Performance impact

`docs/PERF_LOG.md`, consolidation entry — first real-GPU, real-assets measurement: **5.05 ms mean
frame** (GTX 1660 Ti, every atlas resident), 1.2 s navigation-to-ready on localhost, 29 MB JS heap.
Shipped assets 3.36 MB of the 27.3 MB budget; decoded texture **21.13 MB of 96 MB**; bundle
456.35 kB of 550 kB. No pre-existing budget regressed; the atlas fill ratio is reported rather than
enforced (ADR-013 §7) and the enforced texture-memory gate stands at 22%.
