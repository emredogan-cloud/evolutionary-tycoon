import {
  OFFLINE_LIMITERS,
  OFFLINE_METER_BUCKET_COUNT,
  OFFLINE_METER_BUCKET_MS,
  OFFLINE_METER_WINDOW_MS,
} from '@config/economy/offline';
import { layoutForStage } from '@config/layouts';
import { STATIONS, station } from '@config/economy/stations';
import { ORDER_COOKING } from '../stores/OrderStore';
import { STATE_IDLE } from '../ai/EmployeeBrain';
import type { World } from '../core/World';
import { queueCapacityOf } from './capacity';
import { effectValue } from './UpgradeSystem';

/**
 * The offline measurement window — Phase 14, ECONOMY_DESIGN §10.
 *
 * Not a `SimSystem`: the eighteen slots are architecture and this earns no
 * nineteenth. `EconomySystem` advances the cursor from its own slot — the meter
 * is economic measurement, which is that slot's remit — and the payment sites
 * record sales the same way they already record revenue.
 *
 * Everything here is a pure function of `(world, deltaMs)`, so the meter is as
 * deterministic as the tick that drives it. It is deliberately not hashed and
 * not snapshotted (see `OfflineMeterState`); a fresh session measures afresh.
 */

const LIMITER_PARKING = 0;
const LIMITER_KITCHEN = 1;
const LIMITER_TABLES = 2;
const LIMITER_STAFF = 3;
const LIMITER_QUEUE = 4;

/**
 * Advance the cursor; sample utilisation once per bucket.
 *
 * Sampled at the five-second bucket boundary rather than integrated every
 * tick, and the change was bought with a measurement: the per-tick version
 * cost the empty-world benchmark **57%** — three pool scans, two upgrade-table
 * walks and a layout lookup, twenty times a second, for a statistic that a
 * 5-second cadence captures perfectly well. Sixty samples across the window is
 * what the limiter argmax actually consumes; sub-bucket wiggle is not.
 *
 * Boundaries are simulation-time-driven, so the samples land on the same ticks
 * at 1x, 2x and 4x — the meter stays exactly as deterministic as before.
 */
export function advanceOfflineMeter(world: World, deltaMs: number): void {
  if (deltaMs <= 0) return;
  const meter = world.offline;

  meter.bucketElapsedMs += deltaMs;
  while (meter.bucketElapsedMs >= OFFLINE_METER_BUCKET_MS) {
    meter.bucketElapsedMs -= OFFLINE_METER_BUCKET_MS;
    meter.bucketIndex = (meter.bucketIndex + 1) % OFFLINE_METER_BUCKET_COUNT;
    const bucket = meter.bucketIndex;
    meter.servedWindow[bucket] = 0;
    meter.salesRevenueWindow[bucket] = 0;
    meter.salesCogsWindow[bucket] = 0;
    meter.turnedAwayWindow[bucket] = 0;
    sampleUtilization(world, bucket);
  }
}

/** One pass over each pool, writing this bucket's occupancy fractions. */
function sampleUtilization(world: World, bucket: number): void {
  const layout = layoutForStage(world.progression.stage);
  const meter = world.offline;

  let parked = 0;
  let queued = 0;
  let seated = 0;
  for (let slot = 0; slot < world.customers.scanLimit; slot++) {
    if (!world.customers.isActive(slot)) continue;
    const customer = world.customers.at(slot);
    if (customer.parkingSlot >= 0) parked++;
    if (customer.queueIndex >= 0) queued++;
    if (customer.tableSlot >= 0) seated++;
  }

  let cooking = 0;
  for (let slot = 0; slot < world.orders.scanLimit; slot++) {
    if (!world.orders.isActive(slot)) continue;
    if (world.orders.at(slot).state === ORDER_COOKING) cooking++;
  }

  let staffBusy = 0;
  let staffTotal = 0;
  for (let slot = 0; slot < world.employees.scanLimit; slot++) {
    if (!world.employees.isActive(slot)) continue;
    staffTotal++;
    if (world.employees.at(slot).state !== STATE_IDLE) staffBusy++;
  }

  const unlockedStations = effectValue(world, 'prepStations');
  let stationTotal = 0;
  for (let index = 0; index < STATIONS.length; index++) {
    if (station(index).requiresPrepStations <= unlockedStations) stationTotal++;
  }

  const samples = meter.utilizationWindow;
  writeSample(samples, LIMITER_PARKING, bucket, parked, layout.parking.length);
  writeSample(samples, LIMITER_KITCHEN, bucket, cooking, stationTotal);
  writeSample(samples, LIMITER_TABLES, bucket, seated, layout.tables.length);
  writeSample(samples, LIMITER_STAFF, bucket, staffBusy, staffTotal);
  writeSample(samples, LIMITER_QUEUE, bucket, queued, queueCapacityOf(world, layout));
}

function writeSample(
  samples: Float64Array,
  limiter: number,
  bucket: number,
  occupied: number,
  capacity: number,
): void {
  const index = limiter * OFFLINE_METER_BUCKET_COUNT + bucket;
  // A resource that does not exist at this stage cannot be the limiter.
  if (capacity <= 0) {
    samples[index] = 0;
    return;
  }
  samples[index] = occupied >= capacity ? 1 : occupied / capacity;
}

/** A sale, at the moment it is paid — called beside `recordRevenue`. */
export function recordOfflineSale(world: World, revenue: number, cogs: number): void {
  const meter = world.offline;
  const bucket = meter.bucketIndex;
  meter.servedWindow[bucket] = (meter.servedWindow[bucket] ?? 0) + 1;
  meter.salesRevenueWindow[bucket] = (meter.salesRevenueWindow[bucket] ?? 0) + revenue;
  meter.salesCogsWindow[bucket] = (meter.salesCogsWindow[bucket] ?? 0) + cogs;
}

/** A customer turned away by a full resource — feeds the report's second line. */
export function recordOfflineTurnaway(world: World): void {
  const meter = world.offline;
  meter.turnedAwayWindow[meter.bucketIndex] = (meter.turnedAwayWindow[meter.bucketIndex] ?? 0) + 1;
}

/**
 * What a save carries instead of the window — the measurement, reduced.
 *
 * Rates are normalised over the FULL five-minute span rather than over however
 * much of it has been filled. That is a deliberate bias: a session saved forty
 * seconds after boot has measured forty seconds of service, and dividing by
 * five minutes under-reports it. The alternative — dividing by elapsed time —
 * turns one lucky burst into a claimable rate, which is exactly the class of
 * inflation the offline model must not have. Under-measurement costs cents;
 * over-measurement is an exploit.
 */
export interface OfflineMeterSummary {
  /** Customers per minute over the window. */
  readonly throughputPerMin: number;
  /** Gross revenue per served customer, tips included. Zero when none served. */
  readonly avgTicket: number;
  /** Ingredient cost per served customer. Zero when none served. */
  readonly avgCogs: number;
  /** Customers turned away per minute over the window. */
  readonly turnedAwayPerMin: number;
  /** Average utilisation per limiter, 0..1, `OFFLINE_LIMITERS` order. */
  readonly utilization: readonly number[];
}

export function offlineMeterSummary(world: World): OfflineMeterSummary {
  const meter = world.offline;
  const served = sum(meter.servedWindow);
  const revenue = sum(meter.salesRevenueWindow);
  const cogs = sum(meter.salesCogsWindow);
  const turnedAway = sum(meter.turnedAwayWindow);
  const minutes = OFFLINE_METER_WINDOW_MS / 60_000;

  const utilization: number[] = [];
  for (let limiter = 0; limiter < OFFLINE_LIMITERS.length; limiter++) {
    let total = 0;
    for (let bucket = 0; bucket < OFFLINE_METER_BUCKET_COUNT; bucket++) {
      total += meter.utilizationWindow[limiter * OFFLINE_METER_BUCKET_COUNT + bucket] ?? 0;
    }
    // Mean over ALL sixty slots, filled or not — the same conservative
    // denominator the rates use, and for the same reason.
    utilization.push(total / OFFLINE_METER_BUCKET_COUNT);
  }

  return {
    throughputPerMin: served / minutes,
    avgTicket: served > 0 ? revenue / served : 0,
    avgCogs: served > 0 ? cogs / served : 0,
    turnedAwayPerMin: turnedAway / minutes,
    utilization,
  };
}

function sum(values: Float64Array): number {
  let total = 0;
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < values.length; i++) total += values[i] ?? 0;
  return total;
}
