import { performance } from 'node:perf_hooks';
import { TICK_MS } from '../../src/config/simulation';
import { assignAndSort } from '../../src/render/iso/DepthSorter';
import type { DepthSortable } from '../../src/render/iso/DepthSorter';
import { Sim } from '../../src/sim/core/Sim';
import { snapshotWorld } from '../../src/sim/core/snapshot';
import { World } from '../../src/sim/core/World';

/**
 * Headless simulation benchmark.
 *
 * CI has no GPU — GitHub Actions runs Chromium on SwiftShader — so a frame rate
 * measured there is meaningless and this project never claims one
 * (WORKING_DISCIPLINE §8). What CI *can* measure is the simulation, which is
 * where the CPU bottleneck actually is, and which is engine-independent by
 * construction. That is the whole point of the pure-TypeScript core.
 *
 * Everything here is a plain function returning data. The assertions and the
 * regression comparison live in tests/perf/sim.bench.test.ts so the harness can
 * be reused by a future profiling run without dragging the thresholds along.
 */

export interface TimingResult {
  readonly name: string;
  /** Operations per sample — e.g. 1000 ticks. */
  readonly opsPerSample: number;
  readonly samples: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly minMs: number;
  readonly perOpUs: number;
}

export interface AllocationResult {
  readonly name: string;
  readonly ticks: number;
  /** The minimum across `samples` runs — see `measureAllocationPerTick`. */
  readonly bytesPerTick: number;
  /** The worst sample, so the spread is visible rather than hidden by the min. */
  readonly worstBytesPerTick: number;
  readonly samples: number;
  /**
   * False when the runtime did not expose `gc`, in which case the figure
   * includes whatever the collector had not yet reclaimed and is an upper bound
   * rather than a measurement. Reported instead of quietly presented as fact.
   */
  readonly gcForced: boolean;
}

export interface BenchReport {
  readonly timings: readonly TimingResult[];
  readonly allocation: AllocationResult;
}

/** Default sample count: enough for a stable median on a noisy CI runner. */
const SAMPLES = 25;
const WARMUP_SAMPLES = 5;

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? Number.NaN;
}

/**
 * Time `run` repeatedly and report the distribution.
 *
 * The median rather than the mean, because a CI runner's scheduler produces
 * occasional multi-millisecond outliers that say nothing about the code.
 */
export function timeIt(
  name: string,
  opsPerSample: number,
  run: () => void,
  samples: number = SAMPLES,
): TimingResult {
  for (let i = 0; i < WARMUP_SAMPLES; i++) run();

  const durations: number[] = [];
  for (let i = 0; i < samples; i++) {
    /*
     * No forced collection between samples, though it looks like it should
     * help. Tried and rejected: forcing a full GC before each sample empties
     * the young generation, so the timed region then pays for fresh nursery
     * pages that a warm heap would not. It moved `world snapshot + JSON
     * serialise` from 0.331 ms to 0.440 ms — a measurement of the collector's
     * state rather than of the code, and 3% *above* the recorded baseline.
     * Warm-up samples plus the minimum statistic handle this better.
     */
    const start = performance.now();
    run();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);

  const p50 = percentile(durations, 0.5);
  return {
    name,
    opsPerSample,
    samples,
    p50Ms: p50,
    p95Ms: percentile(durations, 0.95),
    minMs: durations[0] ?? Number.NaN,
    perOpUs: (p50 * 1000) / opsPerSample,
  };
}

interface GcCapableGlobal {
  gc?: () => void;
}

function forceGc(): boolean {
  const maybeGc = (globalThis as GcCapableGlobal).gc;
  if (typeof maybeGc !== 'function') return false;
  // Twice: the first pass frees, the second collects what the first made unreachable.
  maybeGc();
  maybeGc();
  return true;
}

/**
 * Bytes allocated per tick in steady state.
 *
 * The budget is 0 B/tick (TECHNICAL_ARCHITECTURE §11.1). A simulation that
 * allocates per tick produces GC pauses that show up as frame stutter at exactly
 * the moments the game is busiest, and no amount of render optimisation fixes it.
 */
/**
 * Steady-state allocation per tick, as the **minimum of several samples**.
 *
 * A single `heapUsed` delta is not a measurement of what the simulation
 * allocates; it is that plus whatever else the runtime did in the same window —
 * incremental marking, background compilation, the harness's own bookkeeping.
 * Phase 2 took one sample and the gate was consequently flaky: against a budget
 * of 8 B/tick it usually read ~2 but landed at 8.87 and 9.84 in two of seven
 * consecutive runs, on an unchanged simulation. A gate that fails one run in
 * four teaches people to re-run it, which is worse than not having it.
 *
 * The minimum is the right statistic because the noise is one-sided: runtime
 * bookkeeping can only *add* to the heap delta, never subtract. So the smallest
 * sample is the closest estimate of the simulation's own allocation, and the
 * budget it is compared against is unchanged. A genuine regression is not hidden
 * by this — one object literal per tick is ~50 B, six times the budget, and it
 * would appear in every sample including the smallest.
 *
 * `worstBytesPerTick` is reported alongside so the spread stays visible.
 */
export function measureAllocationPerTick(ticks = 200_000, samples = 5): AllocationResult {
  const sim = new Sim({ seed: 20260814 });
  // Warm up so lazily-created hidden classes and inline caches are not counted.
  sim.advance(20_000);

  let gcForced = true;
  let best = Number.POSITIVE_INFINITY;
  let worst = 0;

  for (let sample = 0; sample < samples; sample++) {
    gcForced = forceGc() && gcForced;
    const before = process.memoryUsage().heapUsed;
    sim.advance(ticks);
    const after = process.memoryUsage().heapUsed;

    const perTick = Math.max(0, after - before) / ticks;
    if (perTick < best) best = perTick;
    if (perTick > worst) worst = perTick;
  }

  return {
    name: 'steady-state tick',
    ticks,
    bytesPerTick: best,
    worstBytesPerTick: worst,
    samples,
    gcForced,
  };
}

export function benchEmptyTicks(): TimingResult {
  const sim = new Sim({ seed: 1 });
  return timeIt('1000 empty ticks', 1000, () => {
    sim.advance(1000);
  });
}

export function benchWorldHash(): TimingResult {
  const sim = new Sim({ seed: 1 });
  sim.advance(1000);
  // A populated world: hashing an empty one would measure the wrong thing.
  for (let i = 0; i < 120; i++) sim.world.vehicles.spawn(sim.world.allocateEntityId());
  for (let i = 0; i < 60; i++) sim.world.customers.acquire();

  return timeIt('world hash (120 vehicles, 60 customers)', 100, () => {
    for (let i = 0; i < 100; i++) sim.world.hash();
  });
}

export function benchCommandProcessing(): TimingResult {
  const sim = new Sim({ seed: 1 });
  return timeIt('1000 ticks, one command each', 1000, () => {
    for (let i = 0; i < 1000; i++) {
      sim.dispatch({ t: 'SET_SPEED', mult: i % 2 === 0 ? 2 : 4 });
      sim.tick();
    }
  });
}

export function benchEventFlush(): TimingResult {
  const sim = new Sim({ seed: 1 });
  // Three subscribers is what the running game has: renderer, UI bridge, audio.
  for (let i = 0; i < 3; i++) {
    sim.events.subscribe(() => undefined);
  }

  return timeIt('1000 ticks, 8 events per tick, 3 subscribers', 8000, () => {
    for (let i = 0; i < 1000; i++) {
      for (let e = 0; e < 8; e++) sim.world.eventQueue.emitDayStarted(e);
      sim.tick();
    }
  });
}

export function benchStoreChurn(): TimingResult {
  const world = new World({ seed: 1 });
  const capacity = world.vehicles.capacity;

  return timeIt('vehicle spawn + despawn cycles', capacity * 10, () => {
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < capacity; i++) world.vehicles.spawn(i + 1);
      for (let i = 0; i < capacity; i++) world.vehicles.despawn(i);
    }
  });
}

export function benchSnapshot(): TimingResult {
  const sim = new Sim({ seed: 1 });
  sim.advance(5000);
  sim.world.economy.prices.set('burger', 4.5);
  sim.world.layout.upgrades.set('grill', 2);

  return timeIt('world snapshot + JSON serialise', 100, () => {
    for (let i = 0; i < 100; i++) JSON.stringify(snapshotWorld(sim.world));
  });
}

/**
 * Depth sort of a full frame.
 *
 * 260 objects is the depth-sorted budget from TECHNICAL_ARCHITECTURE §11.2, and
 * 0.15 ms is the Phase 3 ceiling. It benchmarks here rather than in the browser
 * because the sorter is deliberately free of Phaser — which is what makes the
 * measurement meaningful on a GPU-less CI runner.
 */
export function benchDepthSort(): TimingResult {
  const items: DepthSortable[] = [];
  for (let i = 0; i < 260; i++) {
    items.push({
      entityId: i + 1,
      // Spread across the stage-1 lot, at heights that force real comparisons
      // rather than an already-sorted input.
      worldX: ((i * 7.3) % 24) + (i % 5) * 0.11,
      worldY: ((i * 11.7) % 18) + (i % 3) * 0.17,
      worldZ: i % 4 === 0 ? 0.9 : 0,
      depth: 0,
    });
  }

  return timeIt('depth sort, 260 objects', 1, () => {
    assignAndSort(items);
    // Re-shuffle cheaply so the next pass is not sorting an already-sorted array,
    // which is the best case and not the one the budget is about.
    const first = items[0];
    const last = items[items.length - 1];
    if (first !== undefined && last !== undefined) {
      items[0] = last;
      items[items.length - 1] = first;
    }
  });
}

export function runSimBench(): BenchReport {
  return {
    timings: [
      benchEmptyTicks(),
      benchWorldHash(),
      benchCommandProcessing(),
      benchEventFlush(),
      benchStoreChurn(),
      benchSnapshot(),
      benchDepthSort(),
    ],
    allocation: measureAllocationPerTick(),
  };
}

export function formatReport(report: BenchReport): string {
  const lines = [
    `Simulation benchmark — tick = ${TICK_MS} ms (${1000 / TICK_MS} Hz)`,
    '',
    'name                                                    min ms   p50 ms   p95 ms    per-op µs',
    '------------------------------------------------------------------------------------------',
  ];
  for (const timing of report.timings) {
    lines.push(
      `${timing.name.padEnd(52)} ${timing.minMs.toFixed(3).padStart(8)} ${timing.p50Ms
        .toFixed(3)
        .padStart(8)} ${timing.p95Ms.toFixed(3).padStart(8)} ${timing.perOpUs.toFixed(3).padStart(12)}`,
    );
  }
  lines.push('');
  lines.push(
    `allocation: ${report.allocation.bytesPerTick.toFixed(2)} B/tick ` +
      `(worst sample ${report.allocation.worstBytesPerTick.toFixed(2)}) ` +
      `over ${report.allocation.ticks} ticks x ${report.allocation.samples} samples` +
      (report.allocation.gcForced ? '' : '  (gc NOT forced — upper bound only)'),
  );
  return lines.join('\n');
}

/**
 * A `tools/bench/baseline.json` body for the current run, ready to copy.
 *
 * Printed by the CI job so the recorded baseline is always a CI measurement.
 * Recording a local number would make every CI run look like a regression, or
 * hide a real one — the gate has to compare like with like.
 */
export function formatBaselineJson(report: BenchReport, recordedAt: string, environment: string): string {
  const timings: Record<string, number> = {};
  for (const timing of report.timings) timings[timing.name] = Number(timing.minMs.toFixed(4));
  return JSON.stringify(
    {
      recordedAt,
      environment,
      statistic: 'minMs',
      timings,
      bytesPerTick: Number(report.allocation.bytesPerTick.toFixed(3)),
    },
    null,
    2,
  );
}
