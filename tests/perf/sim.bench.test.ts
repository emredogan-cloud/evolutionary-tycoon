import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  benchCommandProcessing,
  benchDepthSort,
  benchTicksFromFresh,
  benchEventFlush,
  benchCrowdedTick,
  benchFlowFieldRebuild,
  benchPopulatedTick,
  benchSnapshot,
  buildPeakLoad,
  benchStoreChurn,
  benchWorldHash,
  formatBaselineJson,
  formatReport,
  measureAllocationPerTick,
  runSimBench,
} from '../../tools/bench/sim-bench';

/**
 * Simulation performance gate.
 *
 * Two kinds of assertion, deliberately kept apart:
 *
 * 1. **Absolute budgets** from GAME_EXECUTION_ROADMAP Phase 2 and
 *    TECHNICAL_ARCHITECTURE §11.1. These have enormous headroom on any machine
 *    that can run the toolchain, so they are safe to enforce on a shared CI
 *    runner and they catch the failure that matters: an accidental O(n²) or a
 *    per-tick allocation.
 *
 * 2. **Regression against a recorded baseline**, at the 15% threshold from
 *    TESTING_STRATEGY §6. Only compared when a baseline file exists, so the
 *    first CI run records rather than fails.
 *
 *    The comparison uses the *minimum* of 25 samples, not the median. On a
 *    shared CI runner the median swings well past 15% between runs purely from
 *    scheduler contention, and a gate that fires at random is worse than no
 *    gate at all (WORKING_DISCIPLINE §11). The minimum approximates the
 *    uncontended cost, which is the thing a code change actually moves. The
 *    threshold stays at 15%; only the statistic being compared is chosen to be
 *    measurable.
 *
 * What this suite deliberately does *not* do is claim a frame rate. CI has no
 * GPU (SwiftShader), and WORKING_DISCIPLINE §8 forbids reporting one from here.
 * Real-device FPS is measured by hand and recorded in docs/PERF_LOG.md.
 */

const BASELINE_PATH = resolve(import.meta.dirname, '../../tools/bench/baseline.json');
const REGRESSION_THRESHOLD = 1.15;

interface Baseline {
  readonly recordedAt: string;
  readonly environment: string;
  /** Which statistic `timings` holds. Only 'minMsPerCalibration' is understood. */
  readonly statistic: string;
  /** Machine speed when the baseline was recorded — see `calibrationMs`. */
  readonly calibrationMs: number;
  readonly timings: Record<string, number>;
  readonly bytesPerTick: number;
}

function readBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
}

describe('simulation performance budgets', () => {
  it('runs 1000 ticks from a fresh world in under 5 ms', () => {
    /*
     * The Phase 2 reference point, and every later phase adds work on top of it.
     *
     * "From a fresh world" is load-bearing and was not always true. The world
     * fills as it runs — traffic from Phase 5, customers from Phase 6 — so
     * without a reset per sample this measured twenty minutes of an increasingly
     * busy simulation while claiming to measure an empty one, and the minimum
     * and median samples described different worlds.
     */
    const result = benchTicksFromFresh();
    expect(result.p50Ms, `measured ${result.p50Ms.toFixed(3)} ms`).toBeLessThan(5);
  });

  it('allocates essentially nothing per tick in steady state', () => {
    /*
     * **32 B/tick, raised from 8 by executive decision on 2026-08-15.**
     *
     * The original 8 was measured in Phase 2 when all eighteen system slots were
     * no-ops, so "essentially nothing" was calibrated against a pipeline that did
     * nothing. Phase 5's traffic systems measured 29 B/tick and the source could
     * not be isolated — each of the motion system's three passes measures 0.17
     * B/tick alone while the three together measure 16, and no individual
     * operation inside them allocates on its own (PHASE_5_REPORT §7.2).
     *
     * The owner accepted it for the MVP on the arithmetic: 29 B/tick at 20 Hz is
     * 580 B/s, about 2 MB an hour, which is a minor collection every few minutes
     * — far below the frame stutter this budget exists to prevent.
     *
     * **Then CI measured 7.4 B/tick on the same commit.** The 29 is a property of
     * one developer machine's V8, not of the simulation, which also explains why
     * the source could never be isolated: there was no allocation to find. The
     * raised ceiling stays because it makes the gate stop depending on whose
     * laptop runs it, but the number that describes the code is CI's 7.4, and
     * that is what `tools/bench/baseline.json` records.
     *
     * This is a ceiling raised once with a reason written down, not a number that
     * moves whenever it is inconvenient: if a later phase pushes CI past 32, the
     * answer is to find the allocation, not to raise it again.
     */
    //
    // The harness reports the minimum of several samples, because the noise it
    // is separating out is one-sided: runtime bookkeeping only ever adds to a
    // heap delta. Phase 2 took a single sample and this gate was flaky as a
    // result — see `measureAllocationPerTick`. **The 8 B budget below has not
    // moved**; only how the number is arrived at.
    const result = measureAllocationPerTick();
    expect(result.gcForced, 'run this suite with --expose-gc (see vitest.bench.config.ts)').toBe(true);
    expect(result.samples).toBeGreaterThan(1);
    expect(
      result.bytesPerTick,
      `measured ${result.bytesPerTick.toFixed(2)} B/tick (worst sample ` +
        `${result.worstBytesPerTick.toFixed(2)}) over ${result.ticks} ticks x ${result.samples} samples`,
    ).toBeLessThan(32);
  });

  it('hashes a populated world fast enough to run in a debug overlay', () => {
    const result = benchWorldHash();
    expect(result.perOpUs, `measured ${result.perOpUs.toFixed(2)} µs/hash`).toBeLessThan(500);
  });

  it('processes a command per tick without dominating the tick', () => {
    const result = benchCommandProcessing();
    expect(result.perOpUs, `measured ${result.perOpUs.toFixed(3)} µs/tick`).toBeLessThan(20);
  });

  it('flushes events to three subscribers cheaply', () => {
    const result = benchEventFlush();
    expect(result.perOpUs, `measured ${result.perOpUs.toFixed(3)} µs/event`).toBeLessThan(10);
  });

  it('spawns and despawns vehicles in constant time per entity', () => {
    const result = benchStoreChurn();
    expect(result.perOpUs, `measured ${result.perOpUs.toFixed(3)} µs/entity`).toBeLessThan(5);
  });

  it('depth-sorts a full frame of 260 objects in under 0.15 ms', () => {
    // TECHNICAL_ARCHITECTURE §11.2 caps the depth-sorted set at 260 on desktop,
    // and the Phase 3 budget gives the sort 0.15 ms of a 16.6 ms frame.
    // Per sort, not per sample: the harness batches 100 sorts so the timing is
    // large enough to measure precisely (see benchDepthSort).
    const result = benchDepthSort();
    const perSortMs = result.p50Ms / result.opsPerSample;
    expect(perSortMs, `measured ${perSortMs.toFixed(4)} ms per sort`).toBeLessThan(0.15);
  });

  it('runs a fully loaded tick inside the Phase 6 budget', () => {
    /*
     * 2.2 ms p95 at 120 vehicles and 20 customers — GAME_EXECUTION_ROADMAP
     * Phase 6. The p95 rather than the median, because the budget is about the
     * frame that stutters and not the average one, and there is one tick in
     * every twenty here that does more work than the rest: the ordering pass
     * re-sorts, a manoeuvre hands over, a customer changes state.
     *
     * A per-tick figure, so it stays comparable as later phases add systems to
     * the same eighteen slots. The measured cost is reported in the message
     * either way, which is what `docs/PERF_LOG.md` records.
     */
    const result = benchPopulatedTick();
    const perTickMs = result.p95Ms / result.opsPerSample;
    expect(perTickMs, `measured ${perTickMs.toFixed(4)} ms per tick`).toBeLessThan(2.2);
  });

  it('carries the load the budget is written against, for the whole measurement', () => {
    /*
     * The failure mode of every performance test that builds its own fixture:
     * the world drains, the benchmark reports the cost of an ordinary tick, and
     * the budget passes because nothing is happening. An earlier version of this
     * benchmark did exactly that — 120 vehicles spawned, and a 36 m lane at
     * 13.9 m/s is empty 52 ticks later.
     */
    const sim = buildPeakLoad();
    expect(sim.world.vehicles.activeCount, 'the load was never built').toBe(120);
    expect(sim.world.customers.activeCount).toBe(20);

    // 200 ticks is one timed sample; the load has to survive all of them.
    sim.advance(200);
    expect(sim.world.vehicles.activeCount, 'the road drained mid-measurement').toBeGreaterThanOrEqual(100);
    expect(sim.world.customers.activeCount).toBe(20);
  });

  it('runs a crowded tick inside the Phase 7 budget', () => {
    // 2.5 ms p95 at 60 pedestrians and 120 vehicles — GAME_EXECUTION_ROADMAP
    // Phase 7. This is the measurement that decides whether O(n²) separation
    // over the pedestrians was an acceptable choice.
    const result = benchCrowdedTick();
    const perTickMs = result.p95Ms / result.opsPerSample;
    expect(perTickMs, `measured ${perTickMs.toFixed(4)} ms per tick`).toBeLessThan(2.5);
  });

  it('recomputes every flow field in under 12 ms', () => {
    /*
     * The number the whole approach rests on. Flow fields are cheap to use and
     * expensive to build, and the trade only works because a build happens when
     * the player places something rather than in the game loop.
     *
     * Measured at the scale the budget is written for — 64×64 cells, 20 goals —
     * which Stage 1 is not: it has 48×36 cells and six goals, so measuring it
     * would answer a different and much easier question.
     *
     * It failed here first, at 42.9 ms. The roadmap's stated fallback is to
     * chunk the recompute across frames per goal, "but measure first" — and the
     * measurement said the cost was a tuple destructure in the innermost loop,
     * running about 650 000 times per rebuild. Flattening it to three typed
     * arrays brought it to 9.3 ms and no chunking was needed.
     */
    const result = benchFlowFieldRebuild();
    const perRebuildMs = result.p95Ms / result.opsPerSample;
    expect(perRebuildMs, `measured ${perRebuildMs.toFixed(3)} ms per full rebuild`).toBeLessThan(12);
  });

  it('serialises a save in under 8 ms', () => {
    // ECONOMY/TECHNICAL_ARCHITECTURE §8: autosave runs every 30 s and on
    // pagehide. Anything slower than a frame there is a visible hitch.
    const result = benchSnapshot();
    expect(result.perOpUs / 1000, `measured ${(result.perOpUs / 1000).toFixed(3)} ms`).toBeLessThan(8);
  });
});

/**
 * One benchmark run, shared by the two tests below.
 *
 * They used to call `runSimBench()` each. Two runs in one process are not two
 * independent measurements: the second starts on a heap full of the first's
 * garbage, so it pays collection costs the first did not, and the gate was
 * reading that inflated second run.
 *
 * The evidence is in a single CI job's own log — the reporting run recorded
 * `world snapshot + JSON serialise` at **0.431 ms** and the gate run at
 * **0.492 ms**, 14% apart, on the same runner in the same process. The baseline
 * was recorded from the reporting output at 0.425, so the gate was effectively
 * comparing a degraded run against a clean one and firing at 16%. That is a bug
 * in the harness, not a regression in the simulation: on this machine `main` and
 * this branch measure 0.335 and 0.331 ms.
 *
 * Sharing one run removes the asymmetry and halves the job's wall clock. The 15%
 * threshold is untouched.
 */
let sharedReport: ReturnType<typeof runSimBench> | null = null;
function benchOnce(): ReturnType<typeof runSimBench> {
  sharedReport ??= runSimBench();
  return sharedReport;
}

describe('regression against the recorded baseline', () => {
  const baseline = readBaseline();

  it('reports the current numbers', () => {
    const report = benchOnce();
    const candidate = formatBaselineJson(
      report,
      process.env['BENCH_RECORDED_AT'] ?? 'unrecorded',
      process.env['BENCH_ENVIRONMENT'] ?? 'unrecorded',
    );

    // Printed so the CI log carries the measurement, not just a pass/fail, and
    // so a baseline can be recorded from a CI run rather than a local one.
    console.log(`\n${formatReport(report)}\n`);
    console.log(`--- tools/bench/baseline.json candidate ---\n${candidate}\n--- end candidate ---\n`);

    /*
     * `pnpm bench:record` writes the same block rather than asking a human to
     * find it in the log and paste it. Copying it by hand is how this file
     * ended up truncated once, and a partial baseline.json does not fail as a
     * bad baseline — `readBaseline` throws "Unexpected end of JSON input" from
     * a collection step, which reads as a broken checkout.
     *
     * Opt-in via env var, so an ordinary run can never rewrite the thing it is
     * being measured against. Same shape as `test:visual:update`.
     */
    if (process.env['BENCH_RECORD'] === '1') {
      writeFileSync(BASELINE_PATH, `${candidate}\n`, 'utf8');
      console.log(`Recorded ${BASELINE_PATH}`);
    }

    expect(report.timings.length).toBeGreaterThan(0);
  });

  /**
   * Every benchmark must be big enough for its own ratio to mean something.
   *
   * Normalising by `calibrationMs` cancels machine speed, but it cannot rescue a
   * timed region so short that scheduler jitter and cache state dominate it. Both
   * times this gate has cried wolf, that was the cause, and the numbers are
   * consistent enough to turn into a rule:
   *
   * | benchmark                       | units | observed across CI runs |
   * | ------------------------------- | ----- | ----------------------- |
   * | depth sort, 1 sort per sample   | 0.010 | 28% swing               |
   * | spawn/despawn, 10 rounds        | 0.050 | 0.043-0.085, a 2x swing |
   * | world snapshot + JSON           | 0.296 | 2.3%                    |
   * | depth sort, 100 sorts per sample| 1.219 | 0.65%                   |
   * | 1000 empty ticks                | 1.495 | 1.5%                    |
   *
   * Everything at or above a quarter of a calibration unit has held; both cases
   * that misfired were far below it. So the floor is asserted here rather than
   * left as a convention, because the failure it prevents does not look like a
   * measurement bug — it looks like a regression, and it arrives on someone
   * else's pull request.
   *
   * The fix for a benchmark that trips this is always to repeat the work inside
   * the sample and divide, never to loosen the 15% threshold.
   */
  const MIN_STABLE_CALIBRATION_UNITS = 0.25;

  it('measures each benchmark over a long enough window to be comparable', () => {
    const report = benchOnce();
    const tooSmall = report.timings
      .map((timing) => ({ name: timing.name, units: timing.minMs / report.calibrationMs }))
      .filter((entry) => entry.units < MIN_STABLE_CALIBRATION_UNITS)
      .map((entry) => `${entry.name}: ${entry.units.toFixed(4)} calibration units`);

    expect(
      tooSmall,
      'Too short to normalise stably — repeat the work inside the sample and ' +
        `divide by the repeat count, as benchDepthSort and benchStoreChurn do.\n${tooSmall.join('\n')}`,
    ).toEqual([]);
  });

  /**
   * Compared as a ratio to a calibration run, never as raw milliseconds.
   *
   * Wall-clock comparison against a recorded baseline does not work on shared
   * CI runners, and this was measured rather than assumed: a baseline recorded
   * on GitHub Actions reported the *identical commit* as 47-68% slower when it
   * re-ran on GitHub Actions six minutes later. Taking the minimum of 25 samples
   * removes scheduler contention but cannot remove a different CPU.
   *
   * Every timing is therefore divided by `calibrationMs()` — a fixed arithmetic
   * workload run in the same process — so machine speed cancels and what remains
   * is the simulation's cost relative to the processor it is on. The 15%
   * threshold from TESTING_STRATEGY §6 is unchanged; only the quantity being
   * compared is chosen to be comparable.
   *
   * ## The calibration has to resemble the work
   *
   * Normalising cancels a uniform clock-speed difference. It does **not** cancel
   * a difference in the *mix* of work, and while the calibration was pure
   * floating-point arithmetic it did not cancel enough: a benchmark that walks
   * memory does not scale with an arithmetic loop across different processors.
   * The gap broke the gate in both directions — a baseline recorded on a
   * developer machine failed on CI by 19%, and the CI-recorded baseline that
   * replaced it failed locally by 18%. Neither machine was slower.
   *
   * `calibrationMs` now mixes arithmetic with a strided walk over a buffer far
   * larger than any cache. Measured across the same two machines, before and
   * after:
   *
   * | benchmark                     | FP only | mixed  |
   * | ----------------------------- | ------- | ------ |
   * | world hash (most memory-bound)| +19%    | **-5%** |
   * | world snapshot + JSON         | +11%    | -5%    |
   * | 1000 ticks from a fresh world | +7%     | -7%    |
   * | populated tick                | +10%    | -15%   |
   * | depth sort                    | -1%     | -2%    |
   *
   * ## Which environment records it
   *
   * The developer machine, and deliberately. Under the mixed calibration CI
   * measures *faster* than local on every benchmark, so a locally recorded
   * baseline can never produce a false regression on CI — and CI is where this
   * gate is enforced. The cost is sensitivity: a few points of the 15% are spent
   * on the residual offset before a real regression starts eating into it.
   *
   * The reverse choice was tried and rejected on evidence rather than taste: a
   * CI-recorded baseline makes `pnpm bench:sim` fail on a developer machine,
   * which is worse than a gate that is slightly less sensitive.
   */
  /*
   * Not compared while recording: a baseline is being replaced in this very
   * process, so gating against the outgoing one tests nothing and would fail
   * `pnpm bench:record` whenever the number it is recording has moved — which
   * is the only reason to run it.
   */
  const recording = process.env['BENCH_RECORD'] === '1';

  it.runIf(baseline !== null && !recording)('has not regressed by more than 15%', () => {
    if (baseline === null) return;
    expect(baseline.statistic, 'baseline.json records an unknown statistic').toBe('minMsPerCalibration');

    const report = benchOnce();
    const regressions: string[] = [];

    for (const timing of report.timings) {
      const recorded = baseline.timings[timing.name];
      if (recorded === undefined) continue;
      const normalised = timing.minMs / report.calibrationMs;
      const ratio = normalised / recorded;
      if (ratio > REGRESSION_THRESHOLD) {
        regressions.push(
          `${timing.name}: ${normalised.toFixed(4)} vs baseline ${recorded.toFixed(4)} ` +
            `calibration units (${((ratio - 1) * 100).toFixed(0)}% slower)`,
        );
      }
    }

    expect(
      regressions,
      `Baseline recorded ${baseline.recordedAt} on ${baseline.environment}.\n${regressions.join('\n')}`,
    ).toEqual([]);
  });
});
