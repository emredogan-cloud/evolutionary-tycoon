import { performance } from 'node:perf_hooks';
import { TICK_MS } from '../../src/config/simulation';
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
  readonly bytesPerTick: number;
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
export function measureAllocationPerTick(ticks = 200_000): AllocationResult {
  const sim = new Sim({ seed: 20260814 });
  // Warm up so lazily-created hidden classes and inline caches are not counted.
  sim.advance(20_000);

  const gcForced = forceGc();
  const before = process.memoryUsage().heapUsed;
  sim.advance(ticks);
  const after = process.memoryUsage().heapUsed;

  return {
    name: 'steady-state tick',
    ticks,
    bytesPerTick: Math.max(0, after - before) / ticks,
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

export function runSimBench(): BenchReport {
  return {
    timings: [
      benchEmptyTicks(),
      benchWorldHash(),
      benchCommandProcessing(),
      benchEventFlush(),
      benchStoreChurn(),
      benchSnapshot(),
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
    `allocation: ${report.allocation.bytesPerTick.toFixed(2)} B/tick over ${report.allocation.ticks} ticks` +
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
