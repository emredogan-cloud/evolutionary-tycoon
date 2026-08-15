import { performance } from 'node:perf_hooks';
import { TICK_MS } from '../../src/config/simulation';
import { assignAndSort } from '../../src/render/iso/DepthSorter';
import type { DepthSortable } from '../../src/render/iso/DepthSorter';
import { Sim } from '../../src/sim/core/Sim';
import { snapshotWorld } from '../../src/sim/core/snapshot';
import { World } from '../../src/sim/core/World';
import { STAGE1_LAYOUT } from '../../src/config/layouts/stage1';
import type { StageLayout } from '../../src/config/layouts/stage1';
import {
  STATE_QUEUEING_AT_COUNTER as CUSTOMER_QUEUEING_STATE,
  STATE_WALKING_TO_DOOR as CUSTOMER_WALKING_STATE,
} from '../../src/sim/ai/fsm/customerFsm';
import { MAX_EMPLOYEES } from '../../src/config/employees';
import { hire } from '../../src/sim/systems/StaffSystem';
import { FlowFieldCache } from '../../src/sim/nav/FlowFieldCache';
import { ORDER_COOKING, ORDER_DELIVERED, ORDER_ON_PASS, ORDER_PLACED } from '../../src/sim/stores/OrderStore';

/**
 * The states a benchmark order rotates through.
 *
 * Not `PAID`: a paid order is released the same tick, so a pool full of them
 * would drain during the first sample and the benchmark would go on reporting a
 * figure for twenty orders that no longer existed.
 */
const ORDER_STATE_CYCLE = [ORDER_PLACED, ORDER_COOKING, ORDER_ON_PASS, ORDER_DELIVERED] as const;

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
 * The regression gate compares timings against a recorded baseline, and on
 * GitHub's shared runners a raw comparison was worthless: a baseline recorded on
 * CI reported the identical commit as 47-68% "slower" when it re-ran six minutes
 * later. Dividing every measurement by this one turns milliseconds into a ratio,
 * and machine speed cancels.
 *
 * ## Why it is a mixture
 *
 * It was pure floating-point arithmetic to begin with, and that cancelled a
 * uniform clock-speed difference but not a difference in the *mix* of work. A
 * benchmark that walks memory does not scale with an arithmetic loop across
 * different processors, and the gap was large enough to break the gate in both
 * directions: a baseline recorded on a developer machine failed on CI by 19%,
 * and the CI-recorded baseline that replaced it failed locally by 18%. Neither
 * machine was slower than the other. The 15% threshold was measuring the
 * difference between an FP-bound denominator and a memory-bound numerator.
 *
 * So the calibration now does both, in the same proportion the simulation does:
 * arithmetic, and a strided walk over a buffer far larger than any cache. The
 * stride is 8 doubles — one cache line — so every read misses, which is what
 * makes it measure the memory subsystem rather than the prefetcher.
 *
 * Still deliberately dull: no allocation inside the timed region, no I/O, and
 * the buffer is filled once and reused.
 */

/** 4 MB of doubles — past any L2, and past most L3 slices. */
const CALIBRATION_BUFFER_LENGTH = 1 << 19;
/** One 64-byte cache line, so consecutive reads never share one. */
const CALIBRATION_STRIDE = 8;
const CALIBRATION_PASSES = 6;
const CALIBRATION_ARITHMETIC_STEPS = 200_000;

let calibrationBuffer: Float64Array | undefined;

function calibrationData(): Float64Array {
  if (calibrationBuffer === undefined) {
    const buffer = new Float64Array(CALIBRATION_BUFFER_LENGTH);
    // Deterministic and non-constant, so nothing can be folded away.
    for (let i = 0; i < buffer.length; i++) buffer[i] = (i % 1013) * 0.5 + 1;
    calibrationBuffer = buffer;
  }
  return calibrationBuffer;
}

export function calibrationMs(): number {
  const buffer = calibrationData();

  return timeIt('calibration', 1, () => {
    let total = 0;
    for (let i = 1; i < CALIBRATION_ARITHMETIC_STEPS; i++) {
      total += Math.sqrt(i) / (i % 97 === 0 ? 3 : 7);
    }

    for (let pass = 0; pass < CALIBRATION_PASSES; pass++) {
      for (let i = 0; i < buffer.length; i += CALIBRATION_STRIDE) {
        total += buffer[i] ?? 0;
      }
    }

    // Consumed so neither loop can be optimised away entirely.
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

/**
 * A thousand ticks from a world in a known state.
 *
 * The Phase 2 reference point, and until now it was quietly measuring something
 * else. It was called "1000 empty ticks" because in Phase 2 the pipeline was
 * eighteen no-ops and the world stayed empty. Since Phase 5 the world *fills* —
 * traffic accrues, and from Phase 6 customers do too — so across 25 samples of
 * 1000 ticks it was really measuring twenty minutes of a world getting steadily
 * busier. The minimum sample and the median sample were describing different
 * simulations, which is why one improved 44% while the other went over budget.
 *
 * Resetting per sample makes every sample the same work: the same seed, the same
 * arrivals, the same 1000 ticks. `World.reset` is a handful of typed-array fills
 * and its cost is constant, so it does not skew the comparison between samples —
 * which is the only comparison this benchmark makes.
 */
export function benchTicksFromFresh(): TimingResult {
  const sim = new Sim({ seed: 1 });
  return timeIt('1000 ticks from a fresh world', 1000, () => {
    sim.world.reset();
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
  populatePeakLoad(sim);
  return sim;
}

/**
 * Fill a world with the peak load, on a world that may already have been used.
 *
 * Separate from `buildPeakLoad` so a benchmark can rebuild the load **inside**
 * each sample. Without that the load decays: a jam of 120 vehicles clears over a
 * few hundred ticks, so twenty-five samples of two hundred ticks each measured a
 * road that was emptier every time and the figure swung 16% between runs. The
 * setup is a few hundred store writes against two hundred ticks of simulation,
 * so its cost is constant and small.
 */
export function populatePeakLoad(sim: Sim): void {
  sim.world.reset();
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

/**
 * A full flow-field recompute — GAME_EXECUTION_ROADMAP Phase 7, 12 ms for every
 * goal.
 *
 * This is the number the whole approach rests on. Flow fields are cheap to *use*
 * and expensive to *build*, and the trade only works because a build happens
 * when the player places something rather than in the game loop. If it were over
 * a frame the roadmap's fallback is to chunk it per goal across frames — "but
 * measure first", which is what this is.
 */
export function benchFlowFieldRebuild(): TimingResult {
  const cache = new FlowFieldCache(budgetScaleLayout());
  const placed = [{ objectId: 'ph-prop-tall', x: 7, y: 12, z: 0 }];
  const rebuilds = 8;

  return timeIt('flow field rebuild, 64x64 x 20 goals', rebuilds, () => {
    for (let i = 0; i < rebuilds; i++) {
      // Alternating, so no rebuild can be skipped as a repeat of the last.
      cache.rebuild(i % 2 === 0 ? placed : []);
      cache.finish();
    }
  });
}

/**
 * One goal's share of a recompute — the piece that has to fit in a frame.
 *
 * This is the number the roadmap's requirement actually turns on. "The recompute
 * must not block a frame, chunk it per goal if necessary" makes the *chunk* the
 * thing with a deadline, and the full recompute merely the thing with a
 * duration. The full figure is still measured above, because how long the whole
 * queue takes to drain is worth knowing — but it is no longer paid all at once.
 */
export function benchFlowFieldChunk(): TimingResult {
  const cache = new FlowFieldCache(budgetScaleLayout());
  const placed = [{ objectId: 'ph-prop-tall', x: 7, y: 12, z: 0 }];
  const chunks = 40;

  return timeIt('flow field, one goal', chunks, () => {
    let done = 0;
    let flip = 0;
    while (done < chunks) {
      if (!cache.rebuilding) {
        cache.rebuild(flip % 2 === 0 ? placed : []);
        flip++;
      }
      done += cache.step(1);
    }
  });
}

/**
 * A synthetic layout at the size the budget is written against.
 *
 * The roadmap's figure is "64×64 grid, 20 goals, full recompute ≤ 12 ms".
 * Stage 1 is 48×36 cells with six goals, so measuring it and reporting the
 * result against that budget would be comparing two different questions — and
 * the answer would look four times better than the requirement asked for.
 *
 * 32 by 32 metres is 64 by 64 cells at the authored resolution, and eighteen
 * bays plus the counter and the exit make twenty goals. The road is removed so
 * the whole grid is reachable, which is the worst case for a Dijkstra: nothing
 * prunes the frontier.
 */
function budgetScaleLayout(): StageLayout {
  const bays = [];
  for (let i = 0; i < 18; i++) {
    const x = 2 + (i % 6) * 5;
    const y = 4 + Math.floor(i / 6) * 9;
    bays.push({
      id: `p${String(i)}`,
      x,
      y,
      heading: { x: 1, y: 0 },
      door: { x, y: y + 1.5 },
    });
  }

  return {
    ...STAGE1_LAYOUT,
    lot: { minX: 0, minY: 0, maxX: 32, maxY: 32 },
    road: { ...STAGE1_LAYOUT.road, lanes: [] },
    statics: [],
    parking: bays,
    counter: { x: 16, y: 30 },
    pullIn: { x: 16, y: 28 },
  };
}

/**
 * A tick with the Phase 7 stress target on it — 60 pedestrians and 120 vehicles.
 *
 * Separation is O(n²) over the pedestrians, so this is the measurement that
 * decides whether that was an acceptable choice. Sixty is the roadmap's figure
 * and is far past what Stage 1 produces on its own, which is why the crowd is
 * imposed rather than waited for.
 */
export function benchCrowdedTick(): TimingResult {
  const sim = buildPeakLoad(20260816);
  const ticks = 200;

  const crowd = (): void => {
    populatePeakLoad(sim);
    // Twenty more on foot than the peak load seats, up to the roadmap's sixty.
    for (let i = sim.world.customers.activeCount; i < 60; i++) {
      const slot = sim.world.customers.acquire();
      if (slot < 0) break;
      const customer = sim.world.customers.at(slot);
      customer.entityId = sim.world.allocateEntityId();
      customer.state = CUSTOMER_WALKING_STATE;
      customer.visible = 1;
      customer.vehicleSlot = -1;
      customer.parkingSlot = -1;
      // Spread across the walkable half of the lot, all heading for the counter.
      customer.x = 2 + (i % 10) * 2;
      customer.y = 11 + Math.floor(i / 10) * 1.2;
      customer.targetX = STAGE1_LAYOUT.counter.x;
      customer.targetY = STAGE1_LAYOUT.counter.y - 1;
    }
  };

  crowd();
  const label = `crowded tick (${String(sim.world.customers.activeCount)} pedestrians, 120 vehicles)`;
  return timeIt(label, ticks, () => {
    crowd();
    for (let i = 0; i < ticks; i++) sim.tick();
  });
}

/**
 * A tick with the whole loop running — GAME_EXECUTION_ROADMAP Phase 8.
 *
 * 120 vehicles, 40 pedestrians and 20 live orders, budget 2.8 ms p95. The
 * orders are what this measures that `benchCrowdedTick` does not: three systems
 * were added to the pipeline this phase, and two of them scan the order pool.
 *
 * The orders are spread across every state deliberately. A pool of twenty
 * `PLACED` orders would leave `KitchenSystem.advanceCooking` with nothing to do
 * and `ServiceSystem` with nothing to deliver — the benchmark would report the
 * cost of *scanning* twenty orders rather than of running them, which is the
 * cheap half. Rotating the states means every branch is exercised in every
 * sample.
 */
export function benchServiceTick(): TimingResult {
  const sim = new Sim({ seed: 20260817 });
  const ticks = 200;

  const load = (): void => {
    populatePeakLoad(sim);

    // Up to forty on foot, twenty of which the peak load already queued.
    for (let i = sim.world.customers.activeCount; i < 40; i++) {
      const slot = sim.world.customers.acquire();
      if (slot < 0) break;
      const customer = sim.world.customers.at(slot);
      customer.entityId = sim.world.allocateEntityId();
      customer.state = CUSTOMER_WALKING_STATE;
      customer.visible = 1;
      customer.vehicleSlot = -1;
      customer.parkingSlot = -1;
      customer.x = 2 + (i % 10) * 2;
      customer.y = 11 + Math.floor(i / 10) * 1.2;
      customer.targetX = STAGE1_LAYOUT.counter.x;
      customer.targetY = STAGE1_LAYOUT.counter.y - 1;
    }

    for (let i = 0; i < 20; i++) {
      const orderSlot = sim.world.orders.acquire();
      if (orderSlot < 0) break;
      const order = sim.world.orders.at(orderSlot);
      order.entityId = sim.world.allocateEntityId();
      order.customerSlot = i % Math.max(1, sim.world.customers.activeCount);
      order.item = i % 3;
      order.state = ORDER_STATE_CYCLE[i % ORDER_STATE_CYCLE.length] ?? ORDER_PLACED;
      order.station = order.state === ORDER_COOKING ? i % 3 : -1;
      order.orderedAtMs = sim.world.clock.simTimeMs;
      order.startedAtMs = sim.world.clock.simTimeMs;
      order.price = 3;
      order.quality = 0.7;
    }
  };

  load();
  const label = `service tick (120 vehicles, ${String(sim.world.customers.activeCount)} pedestrians, ${String(sim.world.orders.activeCount)} orders)`;
  return timeIt(label, ticks, () => {
    load();
    for (let i = 0; i < ticks; i++) sim.tick();
  });
}

/**
 * A tick with a full staff — GAME_EXECUTION_ROADMAP Phase 10.
 *
 * 8 employees, 60 pedestrians and 120 vehicles, budget 3.0 ms p95. Two systems
 * joined the pipeline this phase and one of them — the task board — scans the
 * order pool, the task pool and the payroll every tick.
 *
 * The employees are hired rather than poked into the store, so their wages,
 * skills and starting positions are the ones the game produces. A hand-built
 * employee with a zero wage would quietly remove the settlement path from the
 * measurement, which is the part that touches the economy.
 */
export function benchStaffedTick(): TimingResult {
  const sim = buildPeakLoad(20260819);
  const ticks = 200;

  const load = (): void => {
    populatePeakLoad(sim);

    for (let i = sim.world.customers.activeCount; i < 60; i++) {
      const slot = sim.world.customers.acquire();
      if (slot < 0) break;
      const customer = sim.world.customers.at(slot);
      customer.entityId = sim.world.allocateEntityId();
      customer.state = CUSTOMER_WALKING_STATE;
      customer.visible = 1;
      customer.vehicleSlot = -1;
      customer.parkingSlot = -1;
      customer.x = 2 + (i % 10) * 2;
      customer.y = 11 + Math.floor(i / 10) * 1.2;
      customer.targetX = STAGE1_LAYOUT.counter.x;
      customer.targetY = STAGE1_LAYOUT.counter.y - 1;
    }

    // Orders for them to work on. Without these the board is empty and the
    // measurement is of eight employees standing still.
    for (let i = 0; i < 20; i++) {
      const orderSlot = sim.world.orders.acquire();
      if (orderSlot < 0) break;
      const order = sim.world.orders.at(orderSlot);
      order.entityId = sim.world.allocateEntityId();
      order.item = i % 3;
      order.state = ORDER_PLACED;
      order.station = -1;
      order.orderedAtMs = sim.world.clock.simTimeMs;
      order.customerSlot = i % Math.max(1, sim.world.customers.activeCount);
    }

    sim.world.economy.cash = 100_000;
    for (let i = sim.world.employees.activeCount; i < MAX_EMPLOYEES; i++) {
      hire(sim.world, i % 3 === 0 ? 'cook' : i % 3 === 1 ? 'waiter' : 'cleaner', (i % 5) / 4);
    }
  };

  load();
  const label = `staffed tick (${String(sim.world.employees.activeCount)} employees, ${String(sim.world.customers.activeCount)} pedestrians, 120 vehicles)`;
  return timeIt(label, ticks, () => {
    load();
    for (let i = 0; i < ticks; i++) sim.tick();
  });
}

/**
 * Reset per sample, for the same reason `benchTicksFromFresh` is: the world
 * fills as it runs, so twenty-five samples of a thousand ticks each were
 * measuring an increasingly busy simulation and the samples were describing
 * different worlds. It showed up as a 29% swing between two runs minutes apart.
 */
export function benchCommandProcessing(): TimingResult {
  const sim = new Sim({ seed: 1 });
  return timeIt('1000 ticks, one command each', 1000, () => {
    sim.world.reset();
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
    // Reset per sample — see `benchCommandProcessing`.
    sim.world.reset();
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

  /*
   * 500 rather than 100. At 100 the timed region measured 0.24 calibration units
   * on a CI runner — just under the floor `MIN_STABLE_CALIBRATION_UNITS` sets,
   * and the floor fired on its first CI run against a real case rather than
   * against the two it was written from. Which is what it is for.
   */
  const serialisations = 500;
  return timeIt('world snapshot + JSON serialise', serialisations, () => {
    for (let i = 0; i < serialisations; i++) JSON.stringify(snapshotWorld(sim.world));
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
      benchTicksFromFresh(),
      benchWorldHash(),
      benchPopulatedTick(),
      benchCrowdedTick(),
      benchServiceTick(),
      benchStaffedTick(),
      benchFlowFieldRebuild(),
      benchFlowFieldChunk(),
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
