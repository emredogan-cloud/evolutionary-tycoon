# STAGE 1 — THE BUILDING SYSTEM

> Decision B of the stage-1 continuation directive: functional buildings the
> player buys, places, and upgrades. Written 2026-08-23 from measurement.
>
> The directive's condition is the whole design constraint:
>
> > They MUST NOT be meaningless. Do NOT invent fake consumers. Do NOT create
> > new effect kinds that nobody reads.

## 1. What shipped, and what did not

Four buildings were authorised. **Two shipped.**

| Building         | Status       | Why                                                           |
| ---------------- | ------------ | ------------------------------------------------------------- |
| İçecek Makinesi  | **shipped**  | `drinkStationSpeed`, consumed by `KitchenSystem.stationSpeed` |
| Burger İstasyonu | **shipped**  | `grillStationSpeed`, same consumer                            |
| Prep Counter     | **deferred** | duplicates the `second-prep-station` upgrade, already ₡10     |
| Small Storage    | **deferred** | no consumer exists to bind to                                 |

`src/config/buildings.ts` carries the reasoning in full. In short:

- **Prep Counter** would add a concurrent preparation stream, which is real and
  consumed — by `prepStations`, which `second-prep-station` already sells at
  Stage 1, using the same bench art. Two doors to one effect is not a second
  mechanic; it is two prices for the same thing, and the two would compound
  into a stat nobody designed.
- **Small Storage** maps to GAME_DESIGN_DOCUMENT §13's "malzeme kesintisi
  riski ↓". There is no ingredient system to interrupt. The nearest real
  consumer is the pass's six-plate ceiling, and the balance matrix measures the
  kitchen at **2.1–10.0% occupancy** across every stage, policy and seed — a
  bigger pass would change no number at Stage 1.

Deferring these two was a measurement, not a preference, and the measurement is
reproducible: `MATRIX_MINUTES=420 npx vitest run --config vitest.balance.config.ts tests/balance/matrix.test.ts`.

## 2. The ladder

Levels are stage-gated: level 1 at Stage 1, level 2 at Stage 2, level 3 at
Stage 3. `stageForLevel` is the single place that rule lives.

| Building         | L1 cost / effect | L2 cost / effect | L3 cost / effect |
| ---------------- | ---------------- | ---------------- | ---------------- |
| İçecek Makinesi  | ₡24 · ×1.5       | ₡72 · ×2.0       | ₡210 · ×2.6      |
| Burger İstasyonu | ₡36 · ×1.4       | ₡105 · ×1.9      | ₡300 · ×2.5      |

Build times are 6/12/20 and 8/15/24 game-minutes — the same shape as an upgrade
of the same price, so a building does not feel like a different clock.

`parseBuildings` asserts at load that every ladder is exactly `maxLevel` long.
A definition whose price list is shorter than its level count would otherwise
fail silently at whatever level ran off the end — an upgrade the player pays
for and does not receive.

## 3. What the effects actually do

```ts
export function stationSpeed(world: World, index: number): number {
  const spec = station(index);
  if (spec.type === 'DRINK') return spec.speed * effectValue(world, 'drinkStationSpeed');
  if (spec.type === 'GRILL') return spec.speed * effectValue(world, 'grillStationSpeed');
  return spec.speed;
}
```

Both kinds are spelled as literals so the inertness test — which matches the
string `effectValue(world, '<kind>')` inside `src/sim` — can see them. An
effect nothing reads fails that test by construction.

At the calibrated preparation times:

|                 | Without | Cola Machine L1 | Burger Machine L1 |
| --------------- | ------- | --------------- | ----------------- |
| lemonade / cola | 5.0 s   | **3.33 s**      | —                 |
| hotdog          | 6.5 s   | —               | **4.64 s**        |
| hamburger       | 30.0 s  | —               | **21.4 s**        |

## 4. What a machine is worth, by stage

This is the part that took measuring, and the answer is not a constant.

Over four simulated hours, seed 424242, one cook, player absent
(`tests/integration/cookAutomation.test.ts`):

| Stage | Setup       | Served | Revenue | Abandoned | Wasted |
| ----- | ----------- | -----: | ------: | --------: | -----: |
| 1     | bare        |    487 |   ₡2526 |         0 |      1 |
| 1     | machines L1 |    490 |   ₡2545 |         0 |      1 |
| 2     | bare        |    527 |   ₡5511 |         4 |     10 |
| 2     | machines L1 |    545 |   ₡5780 |         2 |      5 |
| 2     | machines L2 |    554 |   ₡5890 |     **0** |  **0** |

**Stage 1 has no queue.** Nobody abandons, so shortening preparation cannot
convert into many more customers — what it converts into is the wait itself,
which is measured directly at the kitchen in `buildingEffect.test.ts`.

**Stage 2 is where the equipment pays**, and it pays by removing the
abandonment and the waste entirely. A building's worth is whatever the
constraint it relieves is currently costing, which is why the ladder is
stage-gated the way it is.

### A trap worth recording

Measured over **thirty** minutes instead of four hours, the equipped stand
serves _two fewer_ customers — deterministically, and identically from four
different placements on the lot, so neither noise nor obstruction. It is the
cut-off: faster preparation puts the pipeline in a different phase at the last
tick, and with turnaways at zero the whole difference is who happened to be
mid-service when the clock stopped. A short window measures the phase, not the
equipment.

## 5. Buying, building and upgrading

One command, one transaction — `buyPlace` dispatches to `buyBuilding` when the
id names a building, so equipment and decor come through the same door with the
same identity chain (`itemId` carried, never re-derived).

A bought building is **real from the click**: it holds its cell and blocks
navigation exactly as a placed prop does. Its **level is zero until the site
completes**, so it contributes no effect and draws no upgraded art in the
meantime. That is what makes "no build success without a visible object" and
"no effect without the thing that produces it" the same statement rather than
two hopeful ones.

`upgradeBuilding` raises a placed building one level in place. The object keeps
its identity, its position and its cell; only its level moves, and only when
the new site completes. A level already on the queue counts as owned for the
purpose of refusing a second purchase — otherwise a player could buy level 3
three times at level 1's price while the scaffolding was up.

A move carries the level with it. That was a real bug, caught by
`buildingEffect.test.ts` before it shipped: `moveObject` reset `level` to
undefined, so relocating a level-3 machine silently demoted it to level 1
art and no effect.

## 6. Art

| Level | Cola Machine | Burger Machine |
| ----- | ------------ | -------------- |
| 1     | `drink`      | `grill-lv1`    |
| 2     | `drink`      | `grill-lv2`    |
| 3     | `drink`      | `grill-lv2`    |

Where a level has no distinct frame the previous one repeats, and the gap is a
prompt rather than a placeholder. **The level badge on the card always shows
the true level**, so the interface never claims art it lacks.

## 7. Tests

`tests/unit/sim/buildings/buildingEffect.test.ts` — 20 tests. These do not
check that an effect _exists_; they check that the number the kitchen divides
by moved, that it moved only when the site finished, and that it moved by the
amount the definition promises. A building whose effect nothing consumed would
pass a "the config has an effects array" test and fail every one of these.

`tests/integration/cookAutomation.test.ts` — the stage-by-stage worth above,
asserted as a relationship against the bare run rather than against literals,
so the economy can be tuned without rewriting the test.

## 8. Related

- [`STAGE1_PRODUCT_SYSTEM.md`](STAGE1_PRODUCT_SYSTEM.md) — the preparation
  times these buildings act on.
- [`STAGE1_4_BALANCE_CALIBRATION.md`](STAGE1_4_BALANCE_CALIBRATION.md) — the
  matrix the deferral decisions were measured against.
- [`STAGE1_STORE_SYSTEM.md`](STAGE1_STORE_SYSTEM.md) — the identity chain
  buildings share with decor.
