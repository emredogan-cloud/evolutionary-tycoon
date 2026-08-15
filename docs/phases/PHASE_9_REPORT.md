# PHASE 9 REPORT — Economy v1 & Upgrade System v1 · ★ Vertical Slice Gate

**Phase:** 9 — the first decision
**Date:** 2026-08-15
**Result:** ✅ **PASS (mechanical)** — 1 076 tests, 90 E2E, 11 goldens, all budgets met
**Vertical Slice Gate:** 2 of 8 **evidenced**, 5 **PENDING HUMAN REVIEW**, 1 **not measured**
**Branch:** `phase/8-service-loop` (batch branch — P8 and P9 ship together)

---

## 1. Result, stated plainly

There is a decision in the game now. The player earns money, and can spend ₡12 on
a sign, ₡28 on a menu board, ₡35 on a cooler, ₡40 on a wider counter, ₡45 on a
second prep bench or ₡60 on a roadside marker — and each one changes a number the
simulation reads, puts an object in the world, and changes how the next twenty
minutes go.

1 076 tests pass. 90 E2E across Chromium and Firefox. Eleven visual goldens,
including a before/after pair whose only difference is three purchases. `pnpm
verify` is clean end to end and no threshold was moved.

**What is not settled:**

- The **Vertical Slice Gate** is the most important gate in the project and
  **five of its eight criteria are human judgements that were not made**. They
  need three people, a screen and twenty minutes each. §9.
- Two ECONOMY_DESIGN §6.2 effect-curve rows **cannot both be read literally**;
  one reading was chosen and the discrepancy is recorded. §5.
- The **cooler is inert** — a correct upgrade with a real effect that no Stage 1
  player can feel, for the reason Phase 8 measured. §6.
- Phase 8's **throughput conflict is unresolved** and Phase 9 is the first phase
  that could have resolved it. It did not, and §7 explains what it did instead.

---

## 2. What was built

| Piece                    | Where                               | What it does                                            |
| ------------------------ | ----------------------------------- | ------------------------------------------------------- |
| Six upgrades             | `src/config/economy/upgrades.ts`    | Data. Families, levels, effect curves, costs, anchors   |
| `combineDiminishing`     | `src/sim/math/`                     | Exploit E4, closed before it is reachable               |
| `UpgradeSystem`          | `src/sim/systems/`                  | Effect lookup, purchase validation, next-level preview  |
| `EconomySystem`          | `src/sim/systems/`                  | The sixty-second income window, in its declared slot    |
| `BUY_UPGRADE`            | `src/sim/core/commands.ts`          | Validated in the simulation, not in the UI              |
| `SET_PRICE`              | `src/sim/core/commands.ts`          | ±50%, clamped twice                                     |
| Save schema **v6**       | `src/persistence/migrations.ts`     | Spend total and income window, with a v5→v6 migration   |
| World-in-place card      | `src/ui/components/UpgradeCard`     | Beside the object, no modal, exact before/after numbers |
| Hotspots                 | `src/ui/components/UpgradeHotspots` | Click the object, not a menu                            |
| Income, objective, price | `src/ui/components/`                | Rate on the HUD, one target, ±50% sliders               |

No `if` chain anywhere in `src/sim` switches on an upgrade id. Effects are
`{kind, perLevel}` data and the simulation knows about _kinds_, which is what
lets Phase 13 grow this into a tree without touching gameplay code.

---

## 3. The four-property rule, made mechanical

The roadmap: _"Every upgrade must have all four of: cost, measurable simulation
effect, visible world change, and a gameplay consequence. An upgrade missing any
one of these does not ship. '+3% efficiency' upgrades are banned."_

A ban that is only written down is not a ban, so it is four tests:

| Property       | Where it is enforced                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Cost           | Zod rejects a non-positive `baseCost` at module load                                                                           |
| **Measurable** | `upgradeEffect.test.ts` buys every level of every upgrade and asserts the value moved                                          |
| Visible        | `placeholder` is a required field; `upgradeFlow.spec.ts` screenshots the canvas before and after and asserts the pixels differ |
| Consequence    | A required non-empty string, shown on the card                                                                                 |
| Significance   | Every level checked against ECONOMY_DESIGN §6.3's thresholds by kind                                                           |

The validator itself is tested with bad input — a duplicate id, a `maxLevel` that
outruns its effect curve, an empty `worldChange`, a free upgrade, an unknown
effect kind. A schema only ever run on correct data would pass just as happily
with every refinement deleted.

### 3.1 One upgrade was cut down to fit the world

`bigger-counter` is **one level**, not three. `stage1.ts` authors six queue
positions and starts with a capacity of four, so +2 uses the last of them. A
second level would cost ₡88 and change nothing — precisely the banned upgrade —
and `queueCapacityOf` clamps to the authored slots regardless, because capacity
past the last position would tell the spillover penalty the queue is fine while
there is physically nowhere for the next person to stand. That would silently
disable ECONOMY_DESIGN §7's only negative feedback loop.

More levels arrive when the layout authors somewhere to stand.

---

## 4. `combineDiminishing`, written before it can matter

Today no two of the six upgrades share a category, so every production call has
one term and returns its input unchanged. It is here because the roadmap says to
put it here — _"add its test now, before there are enough upgrades for the
exploit to exist"_ — and because by Phase 13 nobody will remember why it matters.

What it prevents, measured:

```
five separate +20% effects
  multiplied      1.2^5   = 2.4883   ← exploit E4
  combined        1 − 0.8^5 = 1.6723
  fifty of them             < 2.0    ← never doubles, structurally
```

Not a clamp. A clamp would make the sixth upgrade in a saturated category do
nothing at all — the player pays and no number moves — where this leaves every
purchase worth something and each one worth less than the last.

---

## 5. A document that cannot be read literally

**ECONOMY_DESIGN §6.2's effect-curve table indexes its rows inconsistently, and
the two readings disagree about whether a level-1 speed upgrade does anything.**

| Row        | Formula         | L1 in the table | Reading if `L` counts purchases                           |
| ---------- | --------------- | --------------- | --------------------------------------------------------- |
| Visibility | additive-damped | **1.30**        | one purchase → 1.30 ✅ matches the roadmap's "1.0 → 1.30" |
| Speed      | `0.80^(L−1)`    | **1.00**        | one purchase → **1.00, no effect** ❌                     |

Under one reading the visibility row is right and the speed row describes an
upgrade that does nothing when bought — which §6.3 forbids outright and which
would make the menu board fail the four-property rule.

**Resolved as `0.80^level`**, so one purchase removes 20% of the ordering beat,
clearing §6.3's 12% threshold. The alternative — reading `L` as "level including
the unbought state" — makes the speed row consistent and the visibility row wrong
by a whole level.

Recorded here rather than treated as a silent fix: the two rows cannot both be
read literally and **which one moves is a design decision**, not an
implementation one. Carried to PROJECT_MEMORY.

---

## 6. The cooler is correct, and inert

`holdToleranceMs` +30 s, +22 s, +16 s. The effect is real and tested: the same
plate, sat for the same time, is worth measurably more with a cooler.

It changes nothing a Stage 1 player can feel, because of what Phase 8 measured:
**food sits on the pass for zero ticks out of 24 000**. Delivery is automatic and
runs in the same tick as the food becoming ready, so nothing is ever held and the
tolerance is never approached.

So the cooler has a cost, a measurable effect and a visible world change, and its
fourth property — a gameplay consequence — is **dormant until Phase 10**. That is
stated rather than smoothed over, and it is stated in a test:

```ts
expect(
  ticksWithPlate,
  'food now waits on the pass — the cooler has become a real upgrade, delete this test',
).toBe(0);
```

When Phase 10's waiters put a delay between ready and delivered, that test fails,
and the failure is the signal. Deleting it then is the correct fix.

---

## 7. Phase 8's throughput conflict, one phase on

Phase 8 recorded that the roadmap's "3 customers in 60 seconds" is unreachable
against ECONOMY_DESIGN's 0.09 Stage 1 conversion — a ceiling of 1.8/minute, with
the road rather than the kitchen as the constraint.

Phase 9 is the first phase that could move it, and the sign is exactly the lever:
visibility ×1.30 at level 1, ×1.80 at level 4.

**Measured**, twenty minutes, seed 20260816, identical commands:

| Run           | Conversions | Cash after 20 min          |
| ------------- | ----------- | -------------------------- |
| No sign       | baseline    | baseline                   |
| Sign, level 1 | **higher**  | **higher, net of the ₡12** |

Both are asserted as tests (`upgradeEffect.test.ts`) rather than quoted as
figures, because the absolute numbers move with any balance change and the
_direction_ is the claim: the cheapest upgrade pays for itself inside twenty
minutes, and it does so by lifting the constraint Phase 8 identified.

**The conflict is still open.** A ×1.30 sign lifts a 1.8/minute ceiling to
roughly 2.3, and a fully-upgraded sign to about 3.2 — so three a minute becomes
reachable, but only after ₡12 + ₡26 + ₡58 + ₡128 of sign. Whether the roadmap
means "3/min from the first minute" or "3/min once the player has invested" is
the decision, and it is still a decision. → PROJECT_MEMORY §12, conflict #7.

---

## 8. Performance

| Load                                                   | Budget | Measured p95 |
| ------------------------------------------------------ | -----: | -----------: |
| service tick — 120 vehicles, 40 pedestrians, 20 orders | 2.8 ms | **0.238 ms** |
| world snapshot + JSON serialise                        |   8 ms | **0.008 ms** |

Bundle **434.73 kB** gzip against 550 kB. Eighteen budget tests green.

### 8.1 A 36% save regression, found and mostly removed

Saving the income window made the snapshot benchmark **36% slower**. Twenty-four
numbers should not cost that, and they did not — `[...typedArray]` goes through
the iterator protocol. A plain loop took it to **17%**, which is the honest
remaining cost of putting twenty-four more numbers through `JSON.stringify`.

The baseline was re-recorded at that figure. No absolute budget was near its
ceiling at any point.

---

## 9. ★ THE VERTICAL SLICE GATE

GAME_DESIGN_DOCUMENT §23. **This is the project's most important gate and it is
not closed here.**

| #   | Criterion                                                | Verdict                             | Evidence                                                                                      |
| --- | -------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | A 10-minute session is uninterrupted and comprehensible  | ⚠️ **PENDING HUMAN REVIEW**         | Needs 3 people thinking aloud                                                                 |
| 2   | The player knows what to do in 60 s without being told   | ⚠️ **PENDING HUMAN REVIEW**         | Needs unassisted observation                                                                  |
| 3   | Two meaningful upgrade decisions made, effect seen       | ⚠️ **PENDING HUMAN REVIEW**         | Mechanically possible (§3), but "meaningful" is observed                                      |
| 4   | The screenshot beats the genre average                   | ⚠️ **PENDING HUMAN REVIEW**         | **Impossible today** — the world is magenta placeholders                                      |
| 5   | 60 FPS desktop, ≥40 FPS mobile, on real devices          | ⚠️ **NOT MEASURED**                 | CI cannot measure FPS (SwiftShader, ADR-011). No real-device run was made and none is claimed |
| 6   | 30 minutes, zero critical console errors, no memory leak | ✅ **EVIDENCED**                    | 30 simulated minutes in Chromium: **0 console errors**, heap **21.7 MB → 21.7 MB (0.0%)**     |
| 7   | Save → refresh → full restore                            | ✅ **EVIDENCED, with a scope note** | `verticalSlice.spec.ts` — see below                                                           |
| 8   | "Would I play again?" → 3/3 yes                          | ⚠️ **PENDING HUMAN REVIEW**         | Needs 3 people                                                                                |

**Mechanically evidenced: 2 of 8** (criteria 6 and 7), plus criterion 3's
mechanical half. **Five are human judgements that were not made**, and one of
those — criterion 4 — is not merely unmade but **currently unmakeable**, because
every actor on screen is a magenta chequerboard at roughly three times its true
size.

### 9.1 Criterion 7's scope, which the gate should see

"Tam geri yükleme" is bounded by an approved decision. TECHNICAL_ARCHITECTURE
§8.1 keeps transient state out of the save deliberately: **vehicles on the road,
walking customers and half-finished orders are rebuilt clean on load.** So a
player who saves mid-service and reloads finds an empty road that refills over
the next few seconds, and a customer who was waiting for food is gone.

That is the design, not a defect. It is surfaced here because "my traffic
disappeared when I reloaded" is a thing a player will notice, and the gate is
where somebody should decide whether that is acceptable.

What is asserted instead, and passes: everything persistent returns exactly, and
the restore is **idempotent** — saving the restored world and loading it again
lands on the same digest, which a lossy field would break on the second round
trip and which a single save-and-compare could never detect.

### 9.2 The executive decision this phase ran under

The user authorised proceeding to Phase 10 once the mechanical criteria pass,
with the human criteria marked pending. **That is what has happened.** The gate is
not being declared passed — GAME_DESIGN_DOCUMENT calls it "pazarlığa kapalı", not
open to negotiation, and this report does not negotiate it. It is being _deferred_
under an explicit instruction, with the five outstanding judgements listed above
so that whoever makes them knows exactly which five.

---

## 10. Definition of done — WORKING_DISCIPLINE §4

| #   | Item                           | Status | Evidence                                                                               |
| --- | ------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| 1   | Feature complete to phase spec | ✅     | §2 — six upgrades, prices, card, HUD, objective                                        |
| 2   | Unit tests                     | ✅     | 1 076 pass                                                                             |
| 3   | Integration tests              | ✅     | `upgradeEffect.test.ts`, 14 tests                                                      |
| 4   | Determinism suite              | ✅     | Green; upgrade purchases change the digest                                             |
| 5   | Coverage thresholds            | ✅     | None moved; config branches back to 100%                                               |
| 6   | Lint / format / types          | ✅     | Clean, 274 files                                                                       |
| 7   | Architecture boundaries        | ✅     | `depcruise` clean, 126 modules                                                         |
| 8   | Dead code                      | ✅     | `knip` clean — four dead exports removed                                               |
| 9   | Performance budgets            | ✅     | §8 — 0.238 ms against 2.8 ms                                                           |
| 10  | Allocation budget              | ✅     | Within budget                                                                          |
| 11  | Visual goldens                 | ✅     | 11 pass, before/after pair added                                                       |
| 12  | E2E                            | ✅     | 90 pass, Chromium + Firefox                                                            |
| 13  | **Save migration**             | ✅     | **v5 → v6**, chained, with a committed `save-v6.json` fixture carrying a real purchase |
| 14  | Documentation                  | ✅     | This report, PROJECT_MEMORY, PERF_LOG                                                  |
| 15  | **Vertical Slice Gate**        | ⚠️     | **§9 — 2 evidenced, 5 pending human review**                                           |

Fourteen of fifteen, with the fifteenth being the gate itself.

---

## 11. What Phase 10 inherits

An economy that responds to spending, a save format at v6 that carries it, and a
UI that can express a purchase without covering the game. Three things are
waiting specifically on Phase 10:

1. **The cooler becomes real** when waiters put a delay between ready and
   delivered. The test in §6 fails on that day, deliberately.
2. **Wages** are the first entry in the expense side of the income window, which
   is built and currently always zero. `netIncomePerMinute` can already go
   negative and is not clamped, because a stand losing money should say so.
3. **The pass plate marker** built in Phase 8 becomes visible for the first time,
   for the same reason as the cooler.
