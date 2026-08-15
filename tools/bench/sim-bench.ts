import { performance } from 'node:perf_hooks';
import { TICK_MS } from '../../src/config/simulation';
import { assignAndSort } from '../../src/render/iso/DepthSorter';
import type { DepthSortable } from '../../src/render/iso/DepthSorter';
import { Sim } from '../../src/sim/core/Sim';
import { snapshotWorld } from '../../src/sim/core/snapshot';
import { World } from '../../src/sim/core/World';
import { STAGE1_LAYOUT } from '../../src/config/layouts/stage1';
import { STATE_QUEUEING_AT_COUNTER as CUSTOMER_QUEUEING_STATE } from '../../src/sim/ai/fsm/customerFsm';

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

/**
 * A fixed workload used to measure how fast *this machine* is right now.
 *
 * The regression gate compares wall-clock timings against a recorded baseline,
 * and on GitHub's shared runners that comparison was worthless: a baseline
 * recorded on CI was 47-68% "slower" when the identical commit re-ran on CI six
 * minutes later. The runner fleet is heterogeneous and noisy, and taking the
 * minimum of 25 samples removes scheduler contention but not a different CPU.
 *
 * Dividing every measurement by this one turns absolute milliseconds into a
 * ratio, and machine speed cancels. It is deliberately dull arithmetic with no
 * allocation and no I/O, so it measures processor throughput and nothing else.
 */
export function calibrationMs(): number {
  return timeIt('calibration', 1, () => {
    let total = 0;
    for (let i = 1; i < 400_000; i++) {
      total += Math.sqrt(i) / (i % 97 === 0 ? 3 : 7);
    }
    // Consumed so the loop cannot be optimised away entirely.
    if (total < 0) throw new Error('unreachable');
  }).minMs;
}

export interface BenchReport {
  readonly timings: readonly TimingResult[];
  readonly allocation: AllocationResult;
  /** Machine speed at the time of the run — see `calibrationMs`. */
  readonly calibrationMs: number;
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

/**
 * A tick under the Phase 6 stress target — GAME_EXECUTION_ROADMAP Phase 6.
 *
 * 120 vehicles and 20 customers is the desktop cap from
 * TECHNICAL_ARCHITECTURE §11.2, and **Stage 1's road cannot hold it at realistic
 * spacing**: two 36 m lanes are 72 m of tarmac against 540 m of car. So the
 * vehicles are packed far tighter than any real run produces. That is deliberate
 * and it is what the budget is written against — the figure is a ceiling for a
 * later stage's longer road, and the work it is measuring (ordering 120 slots,
 * 120 follower solves, 120 integrations) is the same work either way.
 *
 * Packing them also makes the load *persist*. An earlier version spawned 120 and
 * let them drive: at 13.9 m/s a lane empties in 52 ticks, so by the time the
 * measurement started the world was back to a dozen cars and the benchmark was
 * quietly reporting the cost of an ordinary tick. `tests/perf` asserts the
 * population is still there, because that is the failure mode of every
 * performance test that builds its own fixture.
 */
export function buildPeakLoad(seed = 20260815): Sim {
  const sim = new Sim({ seed });
  const vehicles = sim.world.vehicles;

  const perLane = 60;
  for (let i = 0; i < 120; i++) {
    const slot = vehicles.spawn(sim.world.allocateEntityId());
    if (slot < 0) break;
    vehicles.lane[slot] = i % 2;
    // Denser than the road can hold; see above.
    vehicles.laneS[slot] = (Math.floor(i / 2) * 34) / perLane;
    vehicles.desiredSpeed[slot] = 13.9;
    vehicles.speed[slot] = 4;
    vehicles.decision[slot] = 1;
  }

  /*
   * Twenty customers standing in the queue with a patience that will not run
   * out inside the measurement, so the state machine and the queue both do
   * their full per-tick work for every sample rather than draining halfway
   * through and flattering the result.
   */
  for (let i = 0; i < 20; i++) {
    const slot = sim.world.customers.acquire();
    if (slot < 0) break;
    const customer = sim.world.customers.at(slot);
    customer.entityId = sim.world.allocateEntityId();
    customer.state = CUSTOMER_QUEUEING_STATE;
    customer.visible = 1;
    customer.vehicleSlot = -1;
    customer.patienceMs = Number.MAX_SAFE_INTEGER;
    customer.patienceMaxMs = Number.MAX_SAFE_INTEGER;
    customer.x = STAGE1_LAYOUT.counter.x;
    customer.y = STAGE1_LAYOUT.counter.y - 1 - i * 0.1;
  }

  return sim;
}

export function benchPopulatedTick(): TimingResult {
  const sim = buildPeakLoad();
  const ticks = 200;

  return timeIt(
    `populated tick (${String(sim.world.vehicles.activeCount)} vehicles, 20 customers)`,
    ticks,
    () => {
      for (let i = 0; i < ticks; i++) sim.tick();
    },
  );
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

/**
 * Spawn/despawn churn through the store's free list.
 *
 * 250 rounds rather than the obvious 10, for measurement reasons only — see
 * `MIN_STABLE_CALIBRATION_UNITS` in `tests/perf/sim.bench.test.ts`. At 10 rounds
 * the timed region was ~60 µs and the normalised ratio swung between 0.043 and
 * 0.085 across CI runs of near-identical code, which is a 2x false regression on
 * a gate whose threshold is 15%.
 */
const CHURN_ROUNDS = 250;

export function benchStoreChurn(): TimingResult {
  const world = new World({ seed: 1 });
  const capacity = world.vehicles.capacity;

  return timeIt('vehicle spawn + despawn cycles', capacity * CHURN_ROUNDS, () => {
    for (let round = 0; round < CHURN_ROUNDS; round++) {
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

  /*
   * A hundred sorts per sample, not one.
   *
   * One sort takes about 12 microseconds, which is close enough to timer
   * resolution that the *ratio* used by the regression gate swings ~28% between
   * runs on identical code — measured on CI, and it was the only benchmark still
   * failing after the timings were normalised. Everything else in this file
   * already samples a thousand ticks or a hundred hashes for the same reason.
   *
   * `perOpUs` still divides by the sort count, so the reported per-sort figure
   * and the 0.15 ms budget are unchanged.
   */
  const SORTS_PER_SAMPLE = 100;

  return timeIt('depth sort, 260 objects', SORTS_PER_SAMPLE, () => {
    for (let pass = 0; pass < SORTS_PER_SAMPLE; pass++) {
      assignAndSort(items);
      // Re-shuffle cheaply so the next pass is not sorting an already-sorted
      // array, which is the best case and not the one the budget is about.
      const first = items[0];
      const last = items[items.length - 1];
      if (first !== undefined && last !== undefined) {
        items[0] = last;
        items[items.length - 1] = first;
      }
    }
  });
}

export function runSimBench(): BenchReport {
  return {
    calibrationMs: calibrationMs(),
    timings: [
      benchEmptyTicks(),
      benchWorldHash(),
      benchPopulatedTick(),
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
  /*
   * Recorded as a ratio to the calibration run, not as milliseconds. The raw
   * millisecond figures are meaningless across machines — see `calibrationMs`.
   */
  for (const timing of report.timings) {
    timings[timing.name] = Number((timing.minMs / report.calibrationMs).toFixed(5));
  }
  return JSON.stringify(
    {
      recordedAt,
      environment,
      statistic: 'minMsPerCalibration',
      calibrationMs: Number(report.calibrationMs.toFixed(4)),
      timings,
      bytesPerTick: Number(report.allocation.bytesPerTick.toFixed(3)),
    },
    null,
    2,
  );
}
