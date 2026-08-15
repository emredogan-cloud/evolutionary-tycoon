import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  benchCommandProcessing,
  benchDepthSort,
  benchEmptyTicks,
  benchEventFlush,
  benchSnapshot,
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
  /** Which statistic `timings` holds. Only 'minMs' is understood. */
  readonly statistic: string;
  readonly timings: Record<string, number>;
  readonly bytesPerTick: number;
}

function readBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
}

describe('simulation performance budgets', () => {
  it('runs 1000 empty ticks in under 5 ms', () => {
    // The Phase 2 reference point. Every later phase adds work on top of this
    // number, so it is measured now while the pipeline is still empty.
    const result = benchEmptyTicks();
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
    const result = benchDepthSort();
    expect(result.p50Ms, `measured ${result.p50Ms.toFixed(4)} ms`).toBeLessThan(0.15);
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
    // Printed so the CI log carries the measurement, not just a pass/fail, and
    // so a baseline can be recorded from a CI run rather than a local one.
    console.log(`\n${formatReport(report)}\n`);
    console.log(
      `--- tools/bench/baseline.json candidate ---\n${formatBaselineJson(
        report,
        process.env['BENCH_RECORDED_AT'] ?? 'unrecorded',
        process.env['BENCH_ENVIRONMENT'] ?? 'unrecorded',
      )}\n--- end candidate ---\n`,
    );
    expect(report.timings.length).toBeGreaterThan(0);
  });

  /**
   * The comparison is only valid on the machine family the baseline came from.
   *
   * A recorded baseline is a set of wall-clock timings from one environment.
   * Comparing a developer laptop against a GitHub runner is not a regression
   * test, it is a hardware comparison — after the Phase 5 baseline was recorded
   * on CI, the same unchanged commit reported "17% slower" locally purely
   * because the laptop is slower than the runner.
   *
   * So the gate runs where the baseline was recorded and reports its numbers
   * everywhere else. That is not a weaker gate: it is the only place the gate
   * ever meant anything, and CI is where it blocks a merge.
   */
  const comparable = baseline !== null && process.env['CI'] === 'true';

  it.runIf(baseline !== null && !comparable)('reports, but does not gate, off the baseline machine', () => {
    // Visible rather than silent: a developer still sees the numbers, and sees
    // why they are not being asserted on.
    expect(baseline?.environment).toContain('github-actions');
  });

  it.runIf(comparable)('has not regressed by more than 15%', () => {
    if (baseline === null) return;
    expect(baseline.statistic, 'baseline.json records an unknown statistic').toBe('minMs');

    const report = benchOnce();
    const regressions: string[] = [];

    for (const timing of report.timings) {
      const recorded = baseline.timings[timing.name];
      if (recorded === undefined) continue;
      const ratio = timing.minMs / recorded;
      if (ratio > REGRESSION_THRESHOLD) {
        regressions.push(
          `${timing.name}: ${timing.minMs.toFixed(3)} ms vs baseline ${recorded.toFixed(3)} ms (${((ratio - 1) * 100).toFixed(0)}% slower)`,
        );
      }
    }

    expect(
      regressions,
      `Baseline recorded ${baseline.recordedAt} on ${baseline.environment}.\n${regressions.join('\n')}`,
    ).toEqual([]);
  });
});
