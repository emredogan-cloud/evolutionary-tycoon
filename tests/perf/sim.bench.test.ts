import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  benchCommandProcessing,
  benchEmptyTicks,
  benchEventFlush,
  benchSnapshot,
  benchStoreChurn,
  benchWorldHash,
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
 * What this suite deliberately does *not* do is claim a frame rate. CI has no
 * GPU (SwiftShader), and WORKING_DISCIPLINE §8 forbids reporting one from here.
 * Real-device FPS is measured by hand and recorded in docs/PERF_LOG.md.
 */

const BASELINE_PATH = resolve(import.meta.dirname, '../../tools/bench/baseline.json');
const REGRESSION_THRESHOLD = 1.15;

interface Baseline {
  readonly recordedAt: string;
  readonly environment: string;
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
    // Budget is 0 B/tick. The tolerance absorbs V8 bookkeeping that is not the
    // simulation's doing; a real per-tick allocation is orders of magnitude
    // above it — a single object literal per tick is ~50 B.
    const result = measureAllocationPerTick();
    expect(result.gcForced, 'run this suite with --expose-gc (see vitest.bench.config.ts)').toBe(true);
    expect(
      result.bytesPerTick,
      `measured ${result.bytesPerTick.toFixed(2)} B/tick over ${result.ticks} ticks`,
    ).toBeLessThan(8);
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

  it('serialises a save in under 8 ms', () => {
    // ECONOMY/TECHNICAL_ARCHITECTURE §8: autosave runs every 30 s and on
    // pagehide. Anything slower than a frame there is a visible hitch.
    const result = benchSnapshot();
    expect(result.perOpUs / 1000, `measured ${(result.perOpUs / 1000).toFixed(3)} ms`).toBeLessThan(8);
  });
});

describe('regression against the recorded baseline', () => {
  const baseline = readBaseline();

  it('reports the current numbers', () => {
    const report = runSimBench();
    // Printed so the CI log carries the measurement, not just a pass/fail.
    console.log(`\n${formatReport(report)}\n`);
    expect(report.timings.length).toBeGreaterThan(0);
  });

  it.runIf(baseline !== null)('has not regressed by more than 15%', () => {
    if (baseline === null) return;

    const report = runSimBench();
    const regressions: string[] = [];

    for (const timing of report.timings) {
      const recorded = baseline.timings[timing.name];
      if (recorded === undefined) continue;
      const ratio = timing.p50Ms / recorded;
      if (ratio > REGRESSION_THRESHOLD) {
        regressions.push(
          `${timing.name}: ${timing.p50Ms.toFixed(3)} ms vs baseline ${recorded.toFixed(3)} ms (${((ratio - 1) * 100).toFixed(0)}% slower)`,
        );
      }
    }

    expect(
      regressions,
      `Baseline recorded ${baseline.recordedAt} on ${baseline.environment}.\n${regressions.join('\n')}`,
    ).toEqual([]);
  });
});
