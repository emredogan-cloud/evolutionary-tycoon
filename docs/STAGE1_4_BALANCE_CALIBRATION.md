# STAGE 1–4 BALANCE CALIBRATION — preparation times

> 2026-08-23, `feat/stage1-product-expansion`. Decision C: the directive's
> preparation-time targets are **UX goals**, tuned against the balance matrix
> rather than typed in. Every number below was measured, not estimated.

## 1. How this was measured

`tests/balance/matrix.test.ts` — a reporter, not a gate, skipped unless
`MATRIX_MINUTES` asks for it. Five policies × three seeds × 420 simulated
minutes, reporting stage timings, throughput, ticket, parking turnaways and
the kitchen's own occupancy per run.

The gate is unchanged and untouched: `tools/balance-sim/assertions.ts`, run by
`pnpm balance:check` (120 min) and `pnpm balance` (720 min).

**The policies can now buy the functional buildings.** Without that, raising
preparation times would have been measured with the equipment that exists to
bring them down invisible to the measurement.

## 2. What the baseline actually said

| Measurement       | Baseline reading                                  |
| ----------------- | ------------------------------------------------- |
| Kitchen occupancy | **2.1–10.0%** across every stage, policy and seed |
| Parking turnaways | **894–1656** against 1097–1593 served             |
| Stage 2           | 15.3–23.6 min (window 10–22)                      |
| Stage 3           | 54.9–65.9 min (window 28–70)                      |
| Stage 4           | 305.7–320.1 min (window 140–320)                  |

Two facts follow, and both shaped every decision below:

1. **Preparation is not the throughput constraint — demand and parking are.**
   A kitchen busy 2–10% of the time cannot be sped up into more revenue.
2. **Stage 4 already sits on its ceiling** (305–320 against 320), so there was
   almost no headroom to spend before this pass started.

Longer preparation therefore costs _patience_, not kitchen capacity: orders
sit longer, more customers give up, fewer are served.

## 3. Requested → tested → final

| Item           | Requested     | Baseline | Tested               | **Final**  | Reason for deviation                         |
| -------------- | ------------- | -------- | -------------------- | ---------- | -------------------------------------------- |
| lemonade       | drink ≈ 5 s   | 2.5 s    | 5.0                  | **5.0 s**  | — hits the anchor exactly                    |
| cola           | drink ≈ 5 s   | 1.5 s    | 5.0                  | **5.0 s**  | — hits the anchor exactly                    |
| hamburger      | burger ≈ 30 s | 9.0 s    | 18 / 30              | **30.0 s** | — hits the anchor exactly                    |
| hotdog         | (no anchor)   | 5.0 s    | 12 / 9 / 8 / 7 / 6.5 | **6.5 s**  | **the binding constraint** — see §4          |
| chips          | (no anchor)   | 1.0 s    | 2.5 / 3.0            | **3.0 s**  | measured irrelevant to pacing                |
| coffee         | (no anchor)   | 4.0 s    | 6.0                  | **6.0 s**  | scaled with the drinks                       |
| premium-burger | (no anchor)   | 16.0 s   | 24 / 35              | **35.0 s** | above the burger anchor, as its name implies |
| fries          | (no anchor)   | 6.0 s    | 9 / 12               | **12.0 s** | fryer, between side and main                 |
| salad          | (no anchor)   | 7.0 s    | 8.5 / 10             | **10.0 s** | prep bench                                   |
| dessert        | (no anchor)   | 5.0 s    | 6.5 / 8              | **8.0 s**  | —                                            |
| chicken-meal   | (no anchor)   | 12.0 s   | 18 / 25              | **25.0 s** | composite meal                               |
| breakfast-set  | (no anchor)   | 14.0 s   | 20 / 28              | **28.0 s** | composite meal                               |
| family-meal    | (no anchor)   | 26.0 s   | 34 / 45              | **45.0 s** | the largest composite                        |

**Pizza** is not on the menu, so the directive's third anchor has nothing to
apply to. It is recorded here rather than silently dropped.

## 4. Why the hot dog is 6.5 s and not 12 s

`tests/integration/stageTransitionPacing.test.ts` models a _spendthrift_ —
somebody who buys a sign every thirty seconds whether or not they are saving
for anything — and asserts they still reach Stage 2 inside 22 minutes. It is
the slow end of reasonable play, and at baseline it had **0.8 minutes of
headroom** (21.2 against 22).

Measured against that scenario, holding lemonade at 5.0 s:

| hotdog                 | chips | Stage 2          |
| ---------------------- | ----- | ---------------- |
| 8.0 s                  | 2.5 s | 23.76 min ❌     |
| 7.0 s                  | 2.0 s | 23.71 min ❌     |
| **6.5 s**              | 2.5 s | **18.01 min ✅** |
| 6.0 s                  | 2.5 s | 18.00 min ✅     |
| 6.0 s                  | 3.0 s | 17.84 min ✅     |
| 7.0 s (lemonade 4.0 s) | 2.5 s | 23.88 min ❌     |

The cliff is between 6.5 and 7.0 seconds and it is **the hot dog alone** —
chips move the figure by 0.17 min across a 0.5 s change, and shortening the
lemonade below its anchor does not help at all. So the hot dog took the
deviation and both of the directive's anchors were kept exact.

## 5. Final matrix — 420 min, 5 policies, 3 seeds

| policy           | seed     | S2   | S3    | S4    | served | revenue | ticket | turned away | cook busy |
| ---------------- | -------- | ---- | ----- | ----- | ------ | ------- | ------ | ----------- | --------- |
| greedy-cheapest  | 424242   | 17.3 | 72.6  | 361.2 | 1470   | 31007   | 21.09  | 1554        | 6.9%      |
| greedy-cheapest  | 777      | 18.4 | 73.9  | 376.8 | 1401   | 28676   | 20.47  | 1676        | 6.7%      |
| greedy-cheapest  | 20260815 | 15.5 | 72.0  | 360.6 | 1445   | 31423   | 21.75  | 1559        | 5.7%      |
| roi-optimal      | 424242   | 17.3 | 72.8  | 365.9 | 1425   | 29506   | 20.71  | 1569        | 9.0%      |
| roi-optimal      | 777      | 18.4 | 73.3  | 376.8 | 1374   | 27638   | 20.12  | 1616        | 9.7%      |
| roi-optimal      | 20260815 | 15.5 | 72.8  | 355.0 | 1382   | 28875   | 20.89  | 1478        | 10.6%     |
| throughput-first | 424242   | 17.3 | 72.5  | 352.9 | 1491   | 31852   | 21.36  | 1548        | 5.9%      |
| throughput-first | 777      | 18.4 | 74.5  | 365.4 | 1402   | 28608   | 20.40  | 1526        | 9.1%      |
| throughput-first | 20260815 | 15.5 | 66.3  | 363.4 | 1401   | 29394   | 20.98  | 1579        | 10.4%     |
| margin-first     | 424242   | 18.3 | 66.8  | 363.2 | 1439   | 29636   | 20.59  | 1735        | 7.6%      |
| margin-first     | 777      | 19.2 | 68.2  | 350.9 | 1410   | 29361   | 20.82  | 1710        | 7.1%      |
| margin-first     | 20260815 | 17.0 | 64.3  | 359.9 | 1472   | 31814   | 21.61  | 1732        | 7.0%      |
| idle-player      | 424242   | 90.2 | 140.3 | —     | 1100   | 21039   | 19.13  | 1073        | 8.1%      |
| idle-player      | 777      | 80.2 | 130.3 | —     | 1089   | 21372   | 19.63  | 1099        | 8.0%      |
| idle-player      | 20260815 | 65.2 | 115.3 | 405.5 | 1139   | 23004   | 20.20  | 1155        | 8.3%      |

## 6. Verdict, by window

| Window  | Design      | Final                     | Status                                   |
| ------- | ----------- | ------------------------- | ---------------------------------------- |
| Stage 2 | 10–22 min   | **15.5–19.2** (strategic) | ✅ **asserted and passing**, with margin |
| Stage 3 | 28–70 min   | 64.3–74.5                 | ⊘ not asserted — see below               |
| Stage 4 | 140–320 min | 350.9–376.8               | ⊘ not asserted — see below               |

`pnpm balance` (720 min): **every evaluable assertion passed**, two not
evaluable. `pnpm balance:check`: 5 passed. No threshold was moved.

### The honest deviation

Stages 3 and 4 are **worse than the baseline** — S3 from ~60–66 to ~64–75,
S4 from ~306–320 to ~351–377. Both are outside their design windows, and both
were _already_ outside or on the line before this pass (S4 baseline 305.7–320.1
against a 320 ceiling).

They are `⊘ not evaluable` in the gate, and have been since ADR-016: the gate
reports rather than asserts them because **stages 2–4's income has never been
through a calibration pass** (`CALIBRATED_STAGES = [1]`). That is a
pre-existing, documented boundary, not something this pass introduced — but
this pass did move the numbers further out, and that is the cost of the
directive's preparation-time targets, stated plainly rather than buried.

Recovering them is a stage-2/3/4 income calibration, which is the work
`CALIBRATED_STAGES` exists to schedule.

## 7. What the buildings are worth

Preparation time is what the functional buildings act on, so their value rises
with it. At the final numbers, one level-1 machine gives:

|                 | Without | Cola Machine L1 (×1.5) | Burger Machine L1 (×1.4) |
| --------------- | ------- | ---------------------- | ------------------------ |
| lemonade / cola | 5.0 s   | **3.33 s**             | —                        |
| hotdog          | 6.5 s   | —                      | **4.64 s**               |
| hamburger       | 30.0 s  | —                      | **21.4 s**               |

At the baseline preparation times the same machine saved 0.8 s on a drink;
the balance runs showed the policies were right to skip it, and buying it
eagerly pushed Stage 2 from 17 minutes to 25. The policies now keep the next
stage's price back before spending on equipment — a change to the _harness_,
matching what a player does, not to the economy.

## 8. Reproducing

```bash
MATRIX_MINUTES=420 MATRIX_SEEDS=424242,777,20260815 \
  npx vitest run --config vitest.balance.config.ts tests/balance/matrix.test.ts
pnpm balance        # 720 min, writes docs/BALANCE_REPORT.md
pnpm balance:check  # the gate
```
