# STAGE 2–4 CALIBRATION REPORT — 2026-08-21

**Authorized by the user** ("Aşama 2–4 için ekonomi kalibrasyonunu yapmaya
yetkilisin. Süreleri GDD'ye uygun hale getir."), executed with the real balance
simulator: five approved policies (greedy-cheapest, roi-optimal,
throughput-first, margin-first, idle-player), seeds 424242 / 31337 / 9090,
720-minute deterministic runs, iterated with 40/480-minute sweeps. All changes
are **configuration only**; no mechanic was touched. The 08:00 start-hour
decision landed first, so every number here is measured on the shipped clock.

## 1. Results at a glance

| Window (arrival) | TARGET      | BEFORE (worst/best)                | AFTER (worst/best)       | Verdict                                                       |
| ---------------- | ----------- | ---------------------------------- | ------------------------ | ------------------------------------------------------------- |
| Stage 2          | 10–22 min   | 15.7 / **25.4** (7 of 12 runs out) | **16.5–19.0** (12/12 in) | ✅ asserted, `stage-2-timing` PASS                            |
| Stage 3          | 28–70 min   | 53–64                              | **51.5–59.8**            | ✅ in-window (measured; assertion chained to the §5 decision) |
| Stage 4          | 140–320 min | 358–379                            | **332–350**              | ❌ structurally blocked — §4                                  |

| Envelope (best peak-sustained net/min) | Corridor (±25%) | BEFORE | AFTER                                      |
| -------------------------------------- | --------------- | ------ | ------------------------------------------ |
| Stage 1                                | ₡6–15(×1.25)    | 15.6   | 15.6 — inside                              |
| Stage 2                                | ₡15–68.75       | 32–37  | **36.4** — inside                          |
| Stage 3                                | ₡46.5–223.75    | 66–72  | **74.9** — inside                          |
| Stage 4                                | ₡142.5–603.75   | 55–78  | 55–78 — **outside, capacity-blocked (§4)** |

Other asserted rows at the ship config (720 min): dead-end worst **68.9 s** (≤90),
policy spread **1.0×** (≤2.5), no exponential escape (peak ₡208/min ≤600 at 12 h),
cash floor ₡0.0 never crossed, stage-4 content **7 upgrades left** at 6 h,
two-valid-paths intact (4–5 distinct purchase sets per stage).

## 2. The configuration changes, each with its WHY

1. **Stage-1 ladder strengthened** — `hand-painted-sign` visibility L1/L2
   0.30/0.22 → **0.50/0.28**; `menu-board` menuAppeal L1/L2 0.18/0.13 →
   **0.25/0.15**. WHY: §3's own arithmetic requires it — the stage must fund
   ₡140 evolution + ₡55 of rungs + the modeled player's opening float (≈₡80,
   ADR-014-informed) inside a 12–18-minute stage, which needs the net to run in
   the envelope's upper half (₡11–14/min). Measured 7.4/min before, ~11.5
   after; every S2 arrival moved inside the window with both ends clear
   (no run under 14.9 against the 10 floor). The first sign being
   transformative is also the design's own teaching beat (GDD §7).
2. **Stage-2 ladder reshaped to §3's own budget** — bases now
   3/4/5/5/5.5/5.5/5.5/5.5 with the three-level rungs (`sharper-knives`,
   `illuminated-sign`, `training-programme`) trimmed to two levels. Ladder
   total ₡1,355 → **₡499** against §3's published ₡500. WHY: the ladder §8
   prices against entry income was 2.7× the budget §3 assigns the stage; the
   two tables jointly determine the shape, and this is the only shape that
   satisfies both to the credit.
3. **Stage-4 ladder repriced toward its own §3 weight** — every S4 base ×3.5
   **except** `roadside-pylon` and `tap-to-pay`, which stay at ₡220 as the two
   cheap entry rungs §8's mechanism 2 requires (unit-tested:
   `tree.test.ts` asserts the cheapest S4 rung ≤ 1.5× the ₡190 entry income).
   WHY: at ₡9,172 the full ladder was consumable in a single evening against
   §3's intended ₡150,000 of stage-4 depth, and the `content-not-exhausted`
   gate proved it (0 left at 6 h). After: ₡25k-class ladder, 7 left at 6 h.
4. **Reverted after measuring flat**: night-appetite floor, deeper sign L3/L4,
   S3 quality/queue/speed effect bumps (each moved S4 arrival <5 min or
   nothing). Recorded so the next pass does not re-walk them.

## 3. Where each stage's income actually goes (limiter analysis, measured)

30-minute windows, greedy/424242, conversion-refusal counters:

- **Stage 2** (min 18–54): refusals dominated by NOT_VISIBLE early (sign
  ladder mid-buy) then WRONG_TIME; parking is at the GDD's own maximum
  (5 bays) and peak-sustained tops at ~₡36 against the ₡55 design max.
- **Stage 3** (min 54–340): NO_PARKING 100–150/30 min and turnedAway ~130 —
  the 8-bay lot caps service at ~3.7 customers/min against the designed 22.8;
  conversion-side boosts measured flat because peaks are bay-bound.
- **Stage 4** (min 340+): convertible arrivals **halve** relative to stage 3
  (≈17/min day-average delivered) — the single 36 m lane's ~45 veh/min
  ceiling shared with ×2 decorative traffic, plus stage-4's left-turn
  discipline; kitchen waste rises (40–65/30 min) once the drive-thru channel
  starves. Even a perfect lot cannot reach the ₡190 entry net on 17/min.

## 4. The structural conflicts — identified exactly, not resolved silently

1. **Stage-4 envelope and window are unreachable on the current road.**
   Arithmetic: envelope needs 84 veh/min day-average × 0.45 × ₡30 basket;
   the lane ceiling is ~45/min total, measured delivery ≈17/min convertible →
   maximum conceivable gross ≈ ₡600×0.61 − ₡268 ≈ ₡98/min net vs the ₡190
   design entry. No config resolves this; it is the reserved road-width ⊗
   traffic-density (#7) ⊗ lane-change ⊗ road-art decision, and stage-4
   arrival (≤320 vs measured 332–350) rides the same physics via stage 3's
   income. **Stage 4 therefore stays out of `CALIBRATED_STAGES`.**
2. **§8's every-30-s dead-end formula ⊗ §6.1's 2.2 level growth ⊗ capacity-capped
   income.** Bounded empirically from four directions (dense ₡500 ladder,
   compressed ₡352 ladder, deepened levels, cheapened tails): some strategic
   policy always faces a ₡44–70 "cheapest" at ₡20–28/min mid-stage-2 (worst
   139–147 s vs the 90 s rule) — either the stage's own L2 tail or, once the
   ladder is consumed, stage 3's ×14 rungs. §8's own mechanisms (L1 ≤ 1.5×
   entry, two cheap entries) are all satisfied; it is the every-probe form that
   cannot hold through the mid-stage gap. **Stage 2 therefore also waits**, and
   with it the assertion chain to stage 3 (whose window and envelope both
   measure green). Decision menu for the user, any one of which closes it:
   (a) scope §8's probe to rungs of the current stage while any remain
   (assertion semantics — change control), (b) lower §6.1's growth for S2
   (design-table change), (c) the road/parking capacity decision above, which
   lifts mid-stage income past the tail.
3. **Stage 3's "walking customer" arrival channel does not exist** — GDD §7
   lists it as a stage-3 system, but every customer arrives by car, so parking
   is the hard throughput cap at both S3 and S4. Building a pedestrian arrival
   channel is feature work (change request), not calibration.

## 5. Gate state shipped by this pass

`CALIBRATED_STAGES` stays `[1]` — growing it is the definition of a stage's
calibration being _done_, and §4 records exactly which user decision each
stage's membership is pending on. Everything the gate can assert today is
green at 120 min (CI) and 720 min (this report); stage 2's window is asserted
green, stage 3's window and envelope are measured green, and the full 720-min
verdict table is reproduced in §1.

Fixture: seeds 424242/31337/9090 · `pnpm balance` regenerates
`docs/BALANCE_REPORT.md` from the same runs.
