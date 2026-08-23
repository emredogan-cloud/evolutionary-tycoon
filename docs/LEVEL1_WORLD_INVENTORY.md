# LEVEL 1 WORLD INVENTORY

> **Every element the Stage-1 world actually contains**, read out of source,
> config, the runtime view and a live Chromium session on 2026-08-23 — not from
> memory and not from a previous report.
>
> Authoritative sources, in the order they were consulted:
> `src/config/layouts/stage1.ts` · `src/config/sprites.ts` (`WORLD_OBJECTS`) ·
> `src/config/economy/stations.ts` · `src/config/economy/menu.ts` ·
> `src/config/store.ts` · `src/config/buildings.ts` ·
> `src/config/economy/upgrades.ts` · `src/render/scenes/WorldScene.ts` ·
> `src/config/surfaces.ts` · `window.__EVOTYCOON__.getState()` at
> `localhost:4173/?seed=424242&e2e=1`.
>
> This file is the **authoritative list** the evolution library and the roadmap
> are built from. If something is not here, it is not in the Stage-1 world.

---

## 0. How the Stage-1 world is assembled

Three sources, and knowing which is which decides what can be levelled:

| Source                  | What it produces                                                                              | Player can change it?   |
| ----------------------- | --------------------------------------------------------------------------------------------- | ----------------------- |
| `STAGE1_LAYOUT.statics` | 9 fixed world objects                                                                         | No — layout-owned       |
| `world.layout.placed`   | everything bought from the store or an upgrade's anchor                                       | Yes — buy / move / sell |
| `WorldScene` `Graphics` | ground, road, verge, kerbs, lane markings, parking bays, drive-thru lane, night/rain/vignette | No — procedural         |

**Nothing in the Stage-1 view is an actor.** Verified at runtime: with the
world paused at tick 2, `getState().actorCount === 2` and both are vehicles
(`kind 2`). Statics are drawn by `WorldScene` straight from
`layoutForStage(stage)`, so the layout file is the authority for them and the
runtime cannot disagree with it.

---

## 1. Fixed world objects — `STAGE1_LAYOUT.statics`

Nine, and that is the whole list.

| #   | objectId            | world (x, y, z) | frame                                   | footprint (m) | h (m) | blocks nav        | classification                             |
| --- | ------------------- | --------------- | --------------------------------------- | ------------- | ----: | ----------------- | ------------------------------------------ |
| 1   | `counter-lv1`       | 12, 12.6, 0     | `struct_counter_lv1@2x.png`             | 3.0 × 0.8     |   1.1 | yes (0.4 m deep)  | **EVOLVABLE PROPERTY** — the main building |
| 2   | `awning`            | 12, 12.6, 2.8   | `struct_awning_lv1@2x.png`              | 4.0 × 2.5     |   0.9 | **no** (overhead) | **EVOLVABLE DECOR** (frontage)             |
| 3   | `sign`              | 9.5, 13.1, 0    | `struct_sign_large_lower/_upper@2x`     | 0.6 × 0.6     |   3.2 | yes (0.4 m post)  | **EVOLVABLE DECOR** (frontage)             |
| 4   | `bin`               | 21.2, 14.0, 0   | `prop_bin_default@2x.png`               | 0.6 × 0.6     |   1.1 | yes               | STATIC WORLD / optional decor              |
| 5   | `tree-broadleaf-01` | 20, 14, 0       | `nature_tree_broadleaf-01_lower@2x`     | 2.4 × 2.4     |   3.6 | yes (0.9 m trunk) | STATIC WORLD                               |
| 6   | `tree-broadleaf-02` | 4, 15, 0        | `nature_tree_broadleaf-02_lower/_upper` | 3.0 × 3.0     |   5.0 | yes (0.9 m trunk) | STATIC WORLD                               |
| 7   | `bush-round-01`     | 18.2, 15.2, 0   | `nature_bush_round-01@2x.png`           | 1.2 × 1.2     |   0.9 | yes               | STATIC WORLD / optional decor              |
| 8   | `bush-flowering-01` | 6.4, 16.4, 0    | `nature_bush_flowering-01@2x.png`       | 1.2 × 1.2     |   0.9 | yes               | **EVOLVABLE DECOR** (flower bed family)    |
| 9   | `lamp`              | 2.5, 8.2, 0     | `nature_pole_lamp_lower/_upper@2x`      | 0.3 × 0.3     |   4.5 | yes (0.3 m post)  | STATIC WORLD / optional decor              |

Every anchor is the **footprint centre**, never the visual centre
(`CLAUDE.md` §6). `z` is elevation in metres; only the awning has a non-zero
one.

### Visual issues carried into this pass

| Object              | Issue                                                                                                              | State                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `awning`            | Delivered art is a **wall-mounted shop awning**; the Stage-1 counter has no wall, so the roller bar is unsupported | Open — art, not placement. `STAGE1_UI_FINAL_CORRECTION_REPORT` §1 |
| `tree-broadleaf-01` | Delivered `_lower`/`_upper` are two unrelated paintings (join coverage 0.00)                                       | Worked around — lower only. Regen P309/P310                       |
| `tree-broadleaf-02` | Join coverage 0.40 — four branch ends cut into open air                                                            | Worked around — 1.25 m overlap. Regen P311/P312                   |
| `sign`              | `struct_sign_large_upper` is a deliberately blank board; the visibility upgrade should paint it                    | Open — regen P307                                                 |

---

## 2. Geometry the layout owns (no art — procedural or invisible)

| Element                        | Value at Stage 1                                               | Drawn by                               | Classification                            |
| ------------------------------ | -------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| **Lot**                        | 24 × 18 m, `minX 0 · minY 0 · maxX 24 · maxY 18`               | `drawGround` (mirror-tiled + washes)   | STATIC / CONTINUOUS WORLD                 |
| **Road**                       | 2 lanes, east y 3.5 / west y 6.5, 7 m wide, overshooting ±10 m | `drawRoad` (procedural, palette)       | STATIC / CONTINUOUS WORLD                 |
| **Verge, kerb, lane markings** | derived from the road band                                     | `drawRoad`                             | PROCEDURAL                                |
| **Parking bays**               | **4** — p1(2.5, 9.4) p2(7.5, 9.4) p3(16.5, 9.4) p4(21.5, 9.4)  | `drawSurfaces` — outlines on the layby | **EVOLVABLE PROPERTY** (parking)          |
| **Parking doors**              | y 10.75 for every bay — the walkable cell a driver steps onto  | none (navigation only)                 | derived from parking                      |
| **Pull-in point**              | (12, 8.5)                                                      | none                                   | derived                                   |
| **Queue**                      | **6** places along x ≈ 12, y 11.8 → 6.9; `queueCapacity` **4** | none                                   | **EVOLVABLE PROPERTY** (frontage/counter) |
| **Waiting area**               | **8** standing spots, two rows at y 13.0 / 14.4, x 16.2 → 18.9 | none                                   | **EVOLVABLE PROPERTY** (seating)          |
| **Tables**                     | **0** — Stage 1 has no seating at all                          | —                                      | **FUTURE CONTENT** (seating Lv3+)         |
| **Registers**                  | 1                                                              | —                                      | derived from main building                |
| **Drive-thru**                 | `null`                                                         | —                                      | FUTURE CONTENT (Stage 4)                  |
| **Camera margin**              | 4 m beyond the lot                                             | camera bounds                          | STATIC                                    |

> **The directive's §5 list, answered honestly.** Stage 1 has _no_ tables, _no_
> chairs, _no_ umbrellas, _no_ planters as distinct objects, _no_ billboard,
> _no_ directional sign, _no_ staff area object, _no_ separate prep-area object
> and _no_ dedicated pedestrian-area object. The walkway is a navigation band
> (y 10.75–12.2), not a drawn thing. Anything on that list that is not in §1 or
> §2 above **does not exist yet** and is marked FUTURE in the evolution library.

---

## 3. The kitchen — stations, not objects

Stage 1's kitchen is **six station records and a pass**, none of which is a
world object. `STATIONS` is append-only and index-hashed.

| index | id          | type    | world (x, y) | `requiresPrepStations` | live at Stage 1?                               |
| ----: | ----------- | ------- | ------------ | ---------------------: | ---------------------------------------------- |
|     0 | `drink-1`   | DRINK   | 10.4, 13.8   |                      0 | **yes** — lemonade                             |
|     1 | `grill-1`   | GRILL   | 12.0, 13.8   |                      0 | **yes** — hot dog                              |
|     2 | `prep-1`    | PREP    | 13.6, 13.8   |                      0 | **yes** — chips                                |
|     3 | `prep-2`    | PREP    | 15.2, 13.8   |                      1 | only with `second-prep-station` Lv1            |
|     4 | `prep-3`    | PREP    | 12.0, 15.0   |                      2 | only with `second-prep-station` Lv2            |
|     5 | `fryer-1`   | FRYER   | 17.0, 13.8   |                      0 | exists, **never used** — no Stage-1 FRYER item |
|     6 | `coffee-1`  | COFFEE  | 10.4, 15.0   |                      0 | exists, never used                             |
|     7 | `dessert-1` | DESSERT | 18.6, 13.8   |                      0 | exists, never used                             |

**The pass**: `(12, 12.0)`, capacity 6 plates. Not a world object at Stage 1;
`struct_pass_default` is only placed as a static from Stage 3.

**`prepStations` is the kitchen's real level dial** and it already has four
consumers (`KitchenSystem.freeStationOfType`, `stationsAllBusy`,
`offlineMeter`, `OfflineSystem`). This is what a Kitchen property level binds
to — no new consumer needs building.

Menu at Stage 1: **lemonade 5.0 s (DRINK) · hotdog 6.5 s (GRILL) · chips 3.0 s
(PREP)**. Everything else is Stage 2+.

---

## 4. What the player can buy at Stage 1

### 4.1 Store — `STORE_ITEMS` (placed by the player, `zone` restricted)

| id              | label               |   ₡ | zone     | objectId            | classification            |
| --------------- | ------------------- | --: | -------- | ------------------- | ------------------------- |
| `flower-bed`    | Çiçek tarhı         |   6 | lot      | `bush-flowering-01` | EVOLVABLE DECOR           |
| `shrub`         | Yuvarlak çalı       |   4 | lot      | `bush-round-01`     | NON-UPGRADABLE DECOR      |
| `shrub-wide`    | Geniş çalı          |   5 | lot      | `bush-round-02`     | NON-UPGRADABLE DECOR      |
| `sapling`       | Genç ağaç           |  14 | lot      | `tree-broadleaf-02` | NON-UPGRADABLE DECOR      |
| `roadside-sign` | Yol kenarı tabelası |  12 | roadside | `sign`              | EVOLVABLE DECOR (signage) |
| `lamp-post`     | Sokak lambası       |  18 | lot      | `lamp`              | NON-UPGRADABLE DECOR      |
| `waste-bin`     | Çöp kutusu          |   5 | lot      | `bin`               | NON-UPGRADABLE DECOR      |

Stage 2 adds `conifer` (₡16) and `queue-barrier` (₡9); Stage 3 adds
`patio-table` (₡22) and `patio-chair` (₡7). Demolition refunds **30%**
(`DEMOLISH_REFUND_FRACTION`, ECONOMY_DESIGN §8 E5).

### 4.2 Functional buildings — `BUILDINGS` (bought, placed, then levelled)

| id               | label            | max level | ₡ per level    | build ms per level      | effect                          | asset per level                       |
| ---------------- | ---------------- | --------: | -------------- | ----------------------- | ------------------------------- | ------------------------------------- |
| `cola-machine`   | İçecek Makinesi  |         3 | 24 / 72 / 210  | 6 000 / 12 000 / 20 000 | `drinkStationSpeed` 1.5/2.0/2.6 | `drink` ×3 (**one frame**)            |
| `burger-machine` | Burger İstasyonu |         3 | 36 / 105 / 300 | 8 000 / 15 000 / 24 000 | `grillStationSpeed` 1.4/1.9/2.5 | `grill-lv1`, `grill-lv2`, `grill-lv2` |

**This is the working precedent for the whole level system.** A building already
carries a level on its placed row, is upgraded in place, builds through a real
construction site, swaps its own art on completion, and is stage-gated by
`stageForLevel(level) = level`. Two of its six level-frames are real distinct
art (`grill-lv1`, `grill-lv2`); four repeat a frame and are prompt gaps.

### 4.3 Upgrade tree — `UPGRADES` available at Stage 1

Five rungs, thirteen levels:

| id                    | family            |   ₡ | levels | effect(s)                  | world anchor object |
| --------------------- | ----------------- | --: | -----: | -------------------------- | ------------------- |
| `hand-painted-sign`   | VISIBILITY_APPEAL |   6 |      4 | `visibility`               | `sign`              |
| `menu-board`          | VISIBILITY_APPEAL |   8 |      3 | `menuAppeal`, `orderSpeed` | — (no object)       |
| `second-prep-station` | KITCHEN           |  10 |      2 | `prepStations`             | `pass`              |
| `cooler`              | KITCHEN           |  12 |      3 | `holdToleranceMs`          | `drink`             |
| `bigger-counter`      | CAPACITY          |  11 |      1 | `queueCapacity` +2         | `counter-lv1`       |

The full tree is 30 upgrades / 5 families / 4 stages. Thirteen of the thirty
have `placeholder: ''` — they change a number and put nothing in the world.

---

## 5. Save state that already exists

| Field                                            | Since | Carries                                      |
| ------------------------------------------------ | ----- | -------------------------------------------- |
| `progression.stage`                              | v1    | 1–4                                          |
| `progression.pendingStage`                       | v8    | the stage whose requirements are met         |
| `construction.{targetStage, elapsedMs, totalMs}` | v8    | the stage build in flight                    |
| `layout.placed[].objectId/x/y/z`                 | v2    | every placed object                          |
| `layout.placed[].itemId`                         | v13   | which catalogue entry it was bought as       |
| `layout.placed[].level`                          | v14   | **a functional building's level**            |
| `layout.pendingBuilds[]`                         | v12   | construction sites, with `targetLevel` (v14) |
| `layout.upgrades`                                | v9    | upgrade id → level                           |

**There is no property-level state.** That is the single new field the
evolution system needs, and it is schema v15.

---

## 6. Classification summary

| Class                    | Members                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **EVOLVABLE PROPERTY**   | main building (`counter-lv1` → truck → diner → restaurant, **= the restaurant stage**), parking, seating, kitchen             |
| **EVOLVABLE FUNCTIONAL** | — (kitchen stations are the property; no separate functional building at Stage 1)                                             |
| **EVOLVABLE MACHINE**    | `cola-machine`, `burger-machine`                                                                                              |
| **EVOLVABLE DECOR**      | frontage: `sign` + `awning` (one family); `bush-flowering-01` (flower bed family)                                             |
| **STATIC WORLD**         | road, verge, kerbs, lot ground, both trees, `bush-round-01`, `lamp`, `bin`                                                    |
| **PROCEDURAL**           | ground tiling and washes, road band and markings, parking bay outlines, drive-thru asphalt, night/rain/vignette               |
| **NON-UPGRADABLE**       | every other store decor (`shrub`, `shrub-wide`, `sapling`, `lamp-post`, `waste-bin`)                                          |
| **FUTURE CONTENT**       | tables and chairs (seating Lv3+), drive-thru (Stage 4), staff facilities, billboard, directional sign, planter box, umbrellas |

**Deliberately not levelled**, and the reason is the directive's own §6 — "do
NOT make every decorative prop levelable just because it exists": the two
trees, the round bush, the lamp, the bin and the four non-upgradable store
props. They are personalisation, and personalisation that demands a ladder
stops being a choice.

---

## 7. What this inventory settles

1. **The main building is not a separate object from the stage.** There is one
   counter, it moves from `counter-lv1` to `truck` to `counter-lv2`, and the
   thing that moves it is `progression.stage`. Modelling a "main building
   level" beside the stage would be two names for one number.
2. **Parking, seating and kitchen are quantities, not art.** Bays are
   procedural outlines over layout coordinates; the waiting area and tables are
   coordinate lists; the kitchen is a station array gated by `prepStations`.
   Levelling them is levelling _how many are live_, and every one of those has
   an existing consumer.
3. **The machine level system already works** and is the template: level on the
   placed row, construction site, art swap on completion, stage gate.
4. **Real level-distinct art exists for exactly two ladders** — the counter
   (`lv1`/`lv2`) and the grill (`lv1`/`lv2`). Everything else is one frame per
   object, so every other level is an external prompt.

Related: [`RESTAURANT_EVOLUTION_ROADMAP.md`](RESTAURANT_EVOLUTION_ROADMAP.md) ·
[`LEVEL_ASSET_EVOLUTION_LIBRARY.md`](LEVEL_ASSET_EVOLUTION_LIBRARY.md) ·
[`STAGE1_DEVELOPMENT_MASTERPLAN.md`](STAGE1_DEVELOPMENT_MASTERPLAN.md)
