# RESTAURANT EVOLUTION ROADMAP

> The dependency plan for the core evolution model: **one property, one
> restaurant, one evolving world**.
>
> Written 2026-08-23, **before any implementation**, from the audit in
> [`LEVEL1_WORLD_INVENTORY.md`](LEVEL1_WORLD_INVENTORY.md). Every claim about
> the current game in Phase A was read out of source or measured at runtime.
>
> Phases are ordered by dependency, not by preference. A phase names what it
> needs from the ones before it.

---

## Phase A — Current state audit

Full detail in [`LEVEL1_WORLD_INVENTORY.md`](LEVEL1_WORLD_INVENTORY.md). The
five findings that decide the architecture:

### A.1 The main building is already the stage

There is one counter. `progression.stage` moves it from `counter-lv1` to
`truck` to `counter-lv2`, the camera never moves, the lot never changes, and
the original stand survives as a decorative object from Stage 2 on
(`stage2.ts` keeps `counter-lv1` at 6.5, 11.2 for exactly that reason).

**A separate "main building level" beside the stage would be two names for one
number.** The directive's example — _"Restaurant Stage 2, Main Building Lv2"_ —
is consistent with this: they are the same fact.

### A.2 A working level system already exists, for machines

`cola-machine` and `burger-machine` each carry a level on their placed row, are
upgraded in place, build through a real construction site with a countdown,
swap their own art on completion, and are stage-gated by
`stageForLevel(level) = level`. Save v14 already persists
`placed[].level` and `pendingBuilds[].targetLevel`.

**This is the template.** Nothing about the level mechanic needs inventing; it
needs extending to things the player did not place.

### A.3 The four stage layouts are nested, except one list

| List            | Stage 1 | Stage 2 | Stage 3 | Stage 4 | nested?                                               |
| --------------- | ------: | ------: | ------: | ------: | ----------------------------------------------------- |
| `parking`       |       4 |       5 |       8 |       8 | **yes** — each is a prefix of the next                |
| `queue`         |       6 |      12 |      16 |      20 | **yes**                                               |
| `queueCapacity` |       4 |       6 |       8 |      10 | yes                                                   |
| `tables`        |       0 |       0 |       6 |      10 | **yes**                                               |
| `waitingArea`   |       8 |      12 |      12 |      12 | **no** — Stage 3 reflows the rows around the building |

Three of the four capacity lists are _literally_ prefixes of the Stage-4 list.
That is what makes a level system cheap and safe here: a property level can say
**how much of the existing list is live** without inventing a single new
coordinate, and therefore without a single new navigation risk.

### A.4 Every capacity dial already has an owner — except one

Cross-referencing the 30-rung upgrade tree against the effect kinds the
simulation consumes:

| Dial                  | Owned by                                                                   |
| --------------------- | -------------------------------------------------------------------------- |
| queue capacity        | `bigger-counter`, `queue-barriers`, `widened-forecourt`, `second-register` |
| station count         | `second-prep-station`, `drink-dispenser`, `pastry-oven`                    |
| hold tolerance        | `cooler`, `pass-heat-lamp`                                                 |
| visibility            | `hand-painted-sign`, `roadside-pylon`                                      |
| atmosphere / patience | `planter-boxes`, `shade-canopy`, `padded-benches`, `covered-terrace`       |
| prep speed            | `sharper-knives`, `drink-dispenser`, `prep-automation`                     |
| station speed by type | `cola-machine`, `burger-machine`                                           |
| drive-thru            | `lane-extension`, `second-order-post`, `express-window`, `tap-to-pay`      |
| **parking bays**      | **nobody**                                                                 |

**Parking is the only major capacity ceiling the player cannot buy.** It is
also one of the three ECONOMY_DESIGN §7 "Fren 3" ceilings, and
`turnedAwayNoParking` is already a counted stat. That gap is the one place this
system must add a new ladder rather than name an existing one.

### A.5 Stage 1 has no seating, and no drawn kitchen

Stage 1's `tables` is empty and its kitchen is six station _records_ plus a
pass point — no world object. The directive's "Seating Lv1: 1–2 basic outdoor
tables" and "Kitchen Lv1: basic prep station" describe content that does not
exist. Both are recorded as FUTURE in the evolution library rather than
invented here, because putting tables at Stage 1 would switch
`ServiceSystem` to waiter-carried delivery and undo the counter-handover model
shipped on 2026-08-23.

---

## Phase B — Progression architecture

### B.1 Five levels, never collapsed

```
PLAYER LEVEL       derived from customersServed          (exists, playerLevel.ts)
RESTAURANT STAGE   1..4  ==  MAIN BUILDING LEVEL         (exists, progression.stage)
PROPERTY LEVEL     1..4 per property, capped by stage    (NEW)
MACHINE LEVEL      1..3 per placed machine               (exists, placed[].level)
DECOR              no ladder — personalisation           (decision, §B.5)
```

### B.2 A property is a _named view_ over what the player owns

This is the architecture decision Phase A forces, and it is the difference
between a system and a second economy.

> **A property's level is derived from the ladders that already move it.**
> Where the audit found a real gap — parking — one new ladder is added. Nowhere
> else is a second purchase path created for an effect that already has one.

| Property      | id         | Level 1..N derived from                  | max | New ladder?            |
| ------------- | ---------- | ---------------------------------------- | --: | ---------------------- |
| Main building | `main`     | `progression.stage`                      |   4 | no — it _is_ the stage |
| Parking       | `parking`  | **its own ladder** — bay count 4 / 5 / 8 |   3 | **yes**                |
| Kitchen       | `kitchen`  | `1 + effectValue('prepStations')`        |   3 | no                     |
| Service area  | `service`  | `1 + ⌊effectValue('queueCapacity') / 2⌋` |   4 | no                     |
| Frontage      | `frontage` | `1 + upgradeLevel('hand-painted-sign')`  |   4 | no                     |

Every one of those effect kinds already has consumers listed in Phase A.4, so
**no property can report a benefit the simulation does not produce** — which is
§39's rule, satisfied by construction rather than by discipline.

**Two ladders stop at 3, and both ceilings are measurements.** Parking's is
`stage4.ts` (the answer to more cars is the drive-thru, not more tarmac — the
east half of the lot is the dining room). The kitchen's is `STATIONS`: exactly
two benches sit behind the `prepStations` effect, `prep-2` at 1 and `prep-3` at
2, so a fourth kitchen level would be a card whose number goes up and whose
kitchen does not. `properties.test.ts` re-derives both from the data rather
than trusting the numbers here.

### B.3 The stage ceiling

```
maxPropertyLevel(stage) = min(4, stage + 1)
```

One tier of headroom, which is what makes the requirement reachable: Stage 2
asks for level 2, and level 2 has to be buyable _during_ Stage 1. At Stage 4
the ceiling clamps to 4.

### B.4 Stage requirements gain a property floor

Today's requirement is cash + customers + upgrades + employees + reputation.
It gains one clause:

```
to evolve to stage N+1, every REQUIRED property must be at level >= N+1
```

**The shipped set**, after Phase H measured it against the balance gate:

| To reach |     parking |     kitchen | service | frontage |
| -------- | ----------: | ----------: | ------: | -------: |
| Stage 2  |       **2** |           — |   **2** |    **2** |
| Stage 3  |       **3** |       **2** |   **3** |    **3** |
| Stage 4  | **3** (max) | **3** (max) |   **4** |    **4** |

Two changes from the first draft of this table, and both are measurements
rather than preferences:

- **The kitchen left the Stage-2 floor.** Its level-2 rung,
  `second-prep-station`, requires **player level 5**, and the Stage-2 gate is
  reached at player level 2. Measured on a live run: 25 served → L2, 120 → L5,
  600 → L10. A floor that needs a rung the player cannot yet buy is not a floor,
  it is a wall.
- **`upgradesBought` for Stage 2 went to 0.** The three-property floor already
  implies three purchases; asking for both would be charging twice for one idea.
  Counting purchases said "buy anything", which is the vagueness this clause
  exists to replace.

Everything remaining is purchasable at the stage below: `bigger-counter` ₡11
(service 2) · `hand-painted-sign` ₡6 (frontage 2) · parking Lv2 ₡5 (new). The
whole floor costs about **₡22**, which is why the Stage-2 cash threshold moved
₡140 → ₡125 in the same pass — see Phase H.

### B.5 Decor is not a ladder — recorded decision

The directive's §14 permits it and §6 warns against it. Measured: the Stage-1
world has five decorative objects the player did not buy (`bin`,
`bush-round-01`, both trees, `lamp`) and seven buyable ones. Giving each a
four-rung ladder adds 48 menu rows and moves no number the simulation reads.

**Decor stays personalisation.** The one exception is the _frontage_ family
(sign + awning), which is already a real upgrade chain and is what makes the
property read as maintained — so it is a property, not decor.

---

## Phase C — Visual evolution

Full specification in
[`LEVEL_ASSET_EVOLUTION_LIBRARY.md`](LEVEL_ASSET_EVOLUTION_LIBRARY.md), with a
copy-ready prompt per level and the §23 coverage matrix. What ships today, per
ladder, with the prompt id where art is owed:

| Ladder        | Lv1                      | Lv2                     | Lv3                     | Lv4                  |
| ------------- | ------------------------ | ----------------------- | ----------------------- | -------------------- |
| Main building | ✅ `struct_counter_lv1`  | ✅ `struct_truck_lv1_*` | ✅ `struct_counter_lv2` | ❌ **P315**          |
| Parking       | ⚙️ 4 bays                | ⚙️ 5 bays               | ⚙️ 8 bays               | — (ladder ends at 3) |
| Kitchen       | ✅ `struct_grill_lv1`    | ✅ `struct_grill_lv2`   | ❌ **P316**             | — (ladder ends at 3) |
| Service area  | ✅ `struct_counter_lv1`  | ❌ **P317**             | ✅ `struct_barrier`     | ❌ **P318**          |
| Frontage      | ✅ `struct_sign_large_*` | ❌ **P307** (filed)     | ❌ **P319**             | ❌ **P320**          |

✅ real distinct art · ❌ external prompt required · ⚙️ procedural by design

Eighteen levels: **8 verified, 7 prompted, 3 procedural, 0 unclassified.** The
tally is asserted against the config by
`tests/unit/tools/levelArtLibrary.test.ts`, so §23's zero-omission rule is a
gate rather than a claim.

Machines keep their own ladder and are **not** properties: `cola-machine` and
`burger-machine` are bought, placed and levelled through `buildings.ts`, which
already does all of this. Folding them into properties would be the second door
to one effect that B.2 exists to refuse.

**Parking is procedural by design at every level** — bay outlines are drawn by
`WorldScene.drawSurfaces` from the layout in palette colours. Its levels are
therefore _geometry_, not art, and need no prompt. The inspect card draws them
as bays rather than saying "art in production", because nobody is producing
any; a boolean flag got that exact case wrong and the browser test caught it
(see the evolution library §2).

---

## Phase D — Interaction UX

```
click a world object
   ↓
InspectCard opens beside it (never over it)
   ↓
[BİLGİ]                     [İNŞA ET]
 name, level, what it does   next level, cost, duration,
 real capacity + usage       required stage, missing prerequisites,
 read from the simulation    next-level visual, effect delta
   ↓                            ↓
 close                       YÜKSELT  → construction site → completion → new art + new effect
```

Depends on: B.2 (there is a property to inspect), B.3/B.4 (there is a lock
reason to explain), and a **world picker** — screen point → property — which
does not exist today. Build mode has `previewPlacement` (screen → world →
legality) and that is the pattern to follow: the query lives in `src/app`,
answers from the simulation, and never re-implements geometry in a component.

**Locked states must name the reason**, not grey out: `AŞAMA 2 GEREKLİ`,
`PARK LV2 GEREKLİ`, `₡12 EKSİK`. The existing `BuildingPanel` already does this
(`data-testid="building-lock"`) and its wording is the precedent.

---

## Phase E — Construction

**No second construction mechanism.** `pendingBuilds` already carries
`{objectId, x, y, remainingMs, totalMs, targetLevel}`, survives reload (save
v12), obeys pause and the speed multiplier, renders as a tinted silhouette with
a progress bar, and completes inside `advancePendingBuilds`. A property upgrade
pushes exactly that record with a `propertyId`, and the completion branch writes
the new level.

Offline follows the established policy: `advancePendingBuilds` is already
exported for the offline path.

---

## Phase F — Asset pipeline

Depends on Phase C. Every level in the evolution library resolves to exactly one
of `VERIFIED ASSET` / `EXTERNAL PROMPT REQUIRED` / `PROCEDURAL BY DESIGN` /
`INTENTIONALLY NON-VISUAL`. New prompts are appended through
`tools/asset-pipeline/auditPrompts.ts` and regenerated into
`docs/ASSET_GENERATION_PROMPTS.html` — **never hand-edited**, because
`promptExport.test.ts` compares the committed page against a fresh render and a
hand edit fails it (learned the hard way on 2026-08-23).

`pnpm assets:prompt-coverage` must stay 0 missing / 0 duplicate / 0 orphan.

---

## Phase G — Browser QA

The directive's A–W matrix, run in real Chromium against the production build.
Depends on D and E. The flows that must be shown working end to end:

1. click the stand → Bilgi → level, capacity, effect
2. click the stand → İnşa Et → next stage, cost, duration, missing requirements
3. click the parking → Bilgi → `Kapasite: 4 araç`, `Kullanım: n / 4`
4. click the parking → İnşa Et → Lv2 preview, cost, duration → YÜKSELT
5. construction site appears · pause holds it · 2×/4× speed it · reload preserves it
6. completion → the fifth bay is live and a car parks in it
7. attempt Stage 2 before the property floor → the exact missing property named
8. meet the floor → evolve → the building transforms

### G.1 Known local constraint

The MCP Chrome tab reports `document.hidden === true` while it is not the
foreground tab, so `requestAnimationFrame` never fires, the Svelte HUD never
republishes, and any in-page `await rAF` hangs to the CDP timeout. Screenshots
force a paint. **Behavioural flows therefore run under Playwright** (a
Playwright page is never hidden) and the MCP tab is used for visual judgement.
Both are real Chromium.

---

## Phase H — Balance

Depends on B.4. The property floor replaces `upgradesBought` as the Stage-2
milestone, so Stage-1→2 pacing moves and must be re-measured, not asserted:

- `pnpm balance:check` — 5 policies × 3 seeds, stage-2 timing window 10–22 min
- parking level costs tuned **against that gate**, not chosen
- `CALIBRATED_STAGES = [1]` is unchanged; stages 3–4 remain `⊘ not evaluable`
  and this pass does not claim otherwise

No threshold is moved. If the window cannot be met, the requirement set changes,
not the window.

### H.1 What the gate actually said

Two failures, in order, and neither was fixed by moving a threshold.

**1. Every policy reported `stage-2-timing: never`.** Not a pacing problem — a
blindness problem. The balance policies buy upgrades and hire staff; none of
them had ever heard of a property, so all four archetypes ran forever with the
floor unmet and the gate correctly refused to evaluate a window nothing reached.
Fixed where the fault was: `PolicySnapshot` gained `missingProperties`, and
`common()` buys the cheapest unmet gap before it considers hiring. The policies
now play the game the player plays.

**2. Stage-2 arrival came out at 25.0 min against a 22 min ceiling.** The floor
costs ≈₡22 that the old requirement did not, on top of an unchanged ₡140
threshold. Two numbers moved together — parking Lv2 ₡9 → **₡5** and the Stage-2
threshold ₡140 → **₡125** — so the player's total outlay is roughly where it
was and the arrival is back inside the window. Recorded in
[`ECONOMY_DESIGN.md`](ECONOMY_DESIGN.md) §3 and asserted by
`tests/integration/stageTransitionPacing.test.ts`.

Final: **5 passed, 1 skipped, exit 0**, no `⊘` on any Stage-1 row.

---

## Phase I — Save / migration

| Field                        | Version | Migration                                 |
| ---------------------------- | ------: | ----------------------------------------- |
| `progression.propertyLevels` | **v15** | absent → `{ parking: min(3, stage) }`     |
| `pendingBuilds[].propertyId` | **v15** | absent → `''` (a machine or upgrade site) |

Defaulting parking to the stage's own value is what keeps every existing save
and every existing balance number **exactly** where it is: a Stage-2 save
migrates to parking Lv2, which is the five bays it already had.

Determinism: `propertyLevels` enters `World.hash()` (it changes outcomes), is
written by a logged command, and never derives from wall-clock. Same seed +
same command log ⇒ same levels, same construction state, same hash.

---

## What this pass delivers

| Phase | Scope                                    | This pass |
| ----- | ---------------------------------------- | --------- |
| A     | audit                                    | ✅ done   |
| B     | progression architecture                 | ✅ done   |
| C     | visual evolution specification + prompts | ✅ done   |
| D     | object inspection UI                     | ✅ built  |
| E     | construction reuse                       | ✅ built  |
| F     | asset coverage                           | ✅ done   |
| G     | browser QA                               | ✅ run    |
| H     | balance                                  | ✅ gated  |
| I     | save + determinism                       | ✅ built  |

Explicitly **not** in this pass, and each is recorded with its reason in the
evolution library rather than left as a TODO:

- **Level art that does not exist.** Every ❌ in Phase C is an external prompt.
  I cannot generate images (PROJECT_MEMORY checkpoint N), so those levels ship
  with the previous level's frame and a truthful level badge — the pattern
  `buildings.ts` already established — and the preview says so out loud rather
  than showing the current art as if it were the next one (§17, §39).
- **Stage-1 outdoor seating.** New content that would switch Stage 1 to
  waiter-carried delivery; a design change, not a correction.
- **Stage 3/4 income calibration.** The pre-existing ADR-016 boundary.

Related: [`LEVEL1_WORLD_INVENTORY.md`](LEVEL1_WORLD_INVENTORY.md) ·
[`LEVEL_ASSET_EVOLUTION_LIBRARY.md`](LEVEL_ASSET_EVOLUTION_LIBRARY.md) ·
[`STAGE1_DEVELOPMENT_MASTERPLAN.md`](STAGE1_DEVELOPMENT_MASTERPLAN.md) ·
[`RESTAURANT_EVOLUTION_IMPLEMENTATION_REPORT.md`](RESTAURANT_EVOLUTION_IMPLEMENTATION_REPORT.md)
