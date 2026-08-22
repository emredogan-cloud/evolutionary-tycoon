# PROGRESSION DESIGN — the three axes, the whole unlock inventory, and the pacing proof

> Consolidation pass, 2026-08-22. Everything in this document is read out of
> the shipped config (`upgrades.ts`, `playerLevel.ts`, `menu.ts`,
> `employees.ts`, `progression.ts`) — the tables are generated, not
> remembered — and every pacing claim cites a measured run.

## 1. Three axes, deliberately distinct (§21 of the directive)

| Axis                 | What it is                                                 | Where it lives                                                   | Where the player reads it                           |
| -------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| **Player level**     | XP over lifetime counters — the _presentation_ of progress | Derived, never stored: `playerLevel(world)` over hashed counters | The economy pill: `Seviye N` + XP bar               |
| **Restaurant stage** | The venue itself, 1→4                                      | `world.progression.stage`, hashed, save-carried                  | Objective card headline, evolution flow             |
| **Upgrade rung**     | One purchase ladder's depth                                | `world.layout.upgrades`, hashed                                  | Build cards (`Sv.`) and the detail's `Kademe n / m` |

A Level 7 player can run a Stage 2 truck with a Kademe 3 sign; no UI string
uses one word for two of these.

## 2. The player level

**XP = served × 4 + ⌊lifetimeRevenue⌋ × 1 + upgradeLevels × 25 + (stage−1) × 150.**
Pure function of counters the world already hashes — no new state, no schema
bump, replay-identical by construction (`levelGate` tests + determinism 61/61).

Cumulative thresholds (level 1 → 20):
`0, 60, 150, 280, 450, 660, 920, 1240, 1620, 2070, 2600, 3220, 3940, 4770, 5720, 6800, 8020, 9390, 10920, 12620,`

Measured points (seed-424242 browser sessions, this pass):

- Day 1 07:00, 21 served, ₡85 lifetime → **Level 3** (48/130 into it).
- A stage-3 jump start reads **Level 4** immediately (the stage bonus).

## 3. Upgrade level-gates — visible, and provably non-binding

Gates exist to _say what is coming_ (the reference's `Seviye N` locks), not to
re-pace the calibrated economy. The proof is structural: the balance suite's
asserted rows (stage-2 timing among them) ran green in the same commits that
added the gates and activated the fleet — under every shipped policy the
counters outrun the gate before the cash does. `UPGRADE_LEVEL_REQUIREMENTS`
covers twelve showcase rungs (2→9); everything else gates by stage,
prerequisite and price alone.

## 4. The unlock inventory — every rung (30)

| id                    | family            | stage | player level | prereqs             | base cost | max |
| --------------------- | ----------------- | ----- | ------------ | ------------------- | --------- | --- |
| `hand-painted-sign`   | VISIBILITY_APPEAL | 1     | 1            | —                   | ₡6        | 4   |
| `menu-board`          | VISIBILITY_APPEAL | 1     | 2            | —                   | ₡8        | 3   |
| `planter-boxes`       | VISIBILITY_APPEAL | 2     | 2            | —                   | ₡3        | 2   |
| `illuminated-sign`    | VISIBILITY_APPEAL | 2     | 4            | hand-painted-sign   | ₡5.5      | 2   |
| `neon-facade`         | VISIBILITY_APPEAL | 3     | 7            | illuminated-sign    | ₡6        | 2   |
| `roadside-pylon`      | VISIBILITY_APPEAL | 4     | 9            | neon-facade         | ₡4        | 2   |
| `second-prep-station` | KITCHEN           | 1     | 5            | —                   | ₡10       | 2   |
| `cooler`              | KITCHEN           | 1     | 1            | —                   | ₡12       | 3   |
| `sharper-knives`      | KITCHEN           | 2     | 3            | —                   | ₡5        | 2   |
| `pass-heat-lamp`      | KITCHEN           | 2     | 4            | cooler              | ₡5        | 2   |
| `better-ingredients`  | KITCHEN           | 3     | 5            | sharper-knives      | ₡5        | 3   |
| `drink-dispenser`     | KITCHEN           | 3     | 6            | second-prep-station | ₡7        | 2   |
| `prep-automation`     | KITCHEN           | 4     | 8            | drink-dispenser     | ₡21.0     | 2   |
| `pastry-oven`         | KITCHEN           | 4     | 1            | better-ingredients  | ₡21.0     | 2   |
| `bigger-counter`      | CAPACITY          | 1     | 1            | —                   | ₡11       | 1   |
| `queue-barriers`      | CAPACITY          | 2     | 1            | bigger-counter      | ₡5.5      | 2   |
| `shade-canopy`        | CAPACITY          | 2     | 1            | —                   | ₡5.5      | 2   |
| `padded-benches`      | CAPACITY          | 3     | 1            | shade-canopy        | ₡4        | 2   |
| `widened-forecourt`   | CAPACITY          | 3     | 1            | queue-barriers      | ₡7        | 1   |
| `covered-terrace`     | CAPACITY          | 4     | 1            | padded-benches      | ₡21.0     | 2   |
| `second-register`     | CAPACITY          | 4     | 1            | widened-forecourt   | ₡24.5     | 1   |
| `lane-extension`      | DRIVE_THRU        | 4     | 1            | —                   | ₡17.5     | 2   |
| `second-order-post`   | DRIVE_THRU        | 4     | 1            | lane-extension      | ₡21.0     | 1   |
| `express-window`      | DRIVE_THRU        | 4     | 1            | —                   | ₡14.0     | 3   |
| `tap-to-pay`          | DRIVE_THRU        | 4     | 1            | express-window      | ₡4        | 2   |
| `non-slip-shoes`      | STAFF             | 2     | 1            | —                   | ₡4        | 2   |
| `training-programme`  | STAFF             | 2     | 1            | —                   | ₡5.5      | 2   |
| `headsets`            | STAFF             | 3     | 1            | non-slip-shoes      | ₡5        | 2   |
| `staff-room`          | STAFF             | 3     | 1            | training-programme  | ₡8        | 2   |
| `shift-supervisor`    | STAFF             | 4     | 1            | staff-room          | ₡24.5     | 2   |

Soundness: prerequisite acyclicity and same-stage reachability are asserted by
`tests/unit/sim/upgrades/prereq.test.ts` and the tree tests; a rung can never
require its own stage's future.

## 5. Menu by stage (13 items)

| id               | stage | base price |
| ---------------- | ----- | ---------- |
| `lemonade`       | 1     | ₡4.05      |
| `hotdog`         | 1     | ₡6.75      |
| `chips`          | 1     | ₡2.7       |
| `hamburger`      | 2     | ₡12.15     |
| `fries`          | 2     | ₡5.4       |
| `cola`           | 2     | ₡4.05      |
| `breakfast-set`  | 3     | ₡18.9      |
| `chicken-meal`   | 3     | ₡21.6      |
| `coffee`         | 3     | ₡6.75      |
| `dessert`        | 3     | ₡10.8      |
| `salad`          | 3     | ₡12.15     |
| `premium-burger` | 4     | ₡32.4      |
| `family-meal`    | 4     | ₡64.8      |

## 6. Staff roles

| id        | min stage | hire | tasks                      |
| --------- | --------- | ---- | -------------------------- |
| `cook`    | 1         | ₡20  | PREP_ORDER                 |
| `waiter`  | 1         | ₡18  | DELIVER_ORDER, CLEAN_TABLE |
| `cleaner` | 1         | ₡14  | CLEAN_TABLE                |

## 7. Stage transitions (the spine)

| to  | cash    | served | upgrades | staff            | reputation | build time |
| --- | ------- | ------ | -------- | ---------------- | ---------- | ---------- |
| 2   | ₡140    | 25     | 1        | 0                | —          | 12 s       |
| 3   | ₡800    | 120    | 4        | 1                | 40         | 20 s       |
| 4   | ₡12.000 | 600    | 10       | 3 (waiter dahil) | 55         | 30 s       |

The offer always waits for the player (GDD §25.2); construction runs on sim
time and the reveal is the mask, the dust and the celebration burst
(scenario F, green).

## 8. Pacing — why this does not finish in a day or two (§17/§24)

Measured, not asserted (STAGE_2_4_CALIBRATION_REPORT + this pass's balance
runs, all gates green):

- Stage 2 arrival: **16.5–19.0 min** (window 10–22, asserted).
- Stage 3 arrival: **51.5–59.8 min** (window 28–70, measured).
- Stage 4 arrival: **332–350 min best-policy** against a ≤320 window —
  **structurally capacity-blocked** on the single lane (max conceivable
  ₡98/min vs the ₡190/min corridor entry). The road/lot decision that
  unblocks it is the user's (calibration report §4).
- Stage 4 content: at six hours the best policy still holds **7 unbought
  rungs**; the full tree is beyond any single-day horizon even before the
  block.
- Policy spread 1.0× ≤ 2.5 — no degenerate strategy shortcut exists, and the
  two-valid-paths row (≥2 distinct purchase sets per stage) held with the
  ten-archetype fleet.

So "finish everything in 1–2 days of normal play" is not merely discouraged —
the endgame is gated behind a decision that has not been made yet, and the
measured curve above it is hours deep.

## 9. Future slack

Levels 10–20 exist with no gate attached: they are the runway for post-MVP
content (P19+) to hook into without moving anyone's current level.

## 8. Construction time (2026-08-22 correction pass)

Purchases stopped being instantaneous: every upgrade rung and every placed
decor object goes up over `buildDurationMs(cost)` of **simulation** time —
6 game minutes at the floor, 24 at the cap, always inside the stage
evolutions' own 24–60. The derivation, the semantics (speed/pause/reload/
offline), the queue rules and the balance-gate evidence live in
[BUILD_CONSTRUCTION_DESIGN.md](BUILD_CONSTRUCTION_DESIGN.md). Pacing impact
on the measured curves: none the gate can detect (5/5 green on the exact
shipped model) — the delay defers an effect by seconds inside windows
measured in minutes.
