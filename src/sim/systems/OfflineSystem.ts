import {
  OFFLINE_CAP_MS,
  OFFLINE_DRIFT_TOLERANCE_MS,
  OFFLINE_EFFICIENCY,
  OFFLINE_LIMITER_SIGNIFICANCE,
  OFFLINE_LIMITERS,
  OFFLINE_MIN_REPORT_MS,
  OFFLINE_UNSYNCED_CAP_FACTOR,
} from '@config/economy/offline';
import type { OfflineReportLimiter } from '@config/economy/offline';
import { MENU } from '@config/economy/menu';
import { STATIONS, station } from '@config/economy/stations';
import { layoutForStage } from '@config/layouts';
import type { World } from '../core/World';
import { effectValue } from './UpgradeSystem';
import type { OfflineMeterSummary } from './offlineMeter';

/**
 * Offline progression — GAME_EXECUTION_ROADMAP Phase 14, GDD §17,
 * ECONOMY_DESIGN §10.
 *
 * Pure functions only. The wall clock, the server clock and the fetch that
 * asked it live in `src/platform` and `src/app`; what arrives here is numbers,
 * and the same numbers always produce the same report. That is what lets every
 * clock-abuse scenario be a unit test instead of a hope.
 *
 * Not a `SimSystem`, deliberately: nothing happens per tick. The computation
 * runs once, at boot, on a measurement the meter took while the player was
 * actually here.
 */

// ── Time security ──────────────────────────────────────────────────────────

/** The raw clock facts, as the platform observed them. */
export interface ClockEvidence {
  /** `Date.now()` at boot. */
  readonly localNowMs: number;
  /** The server's answer, or null when it could not be asked. */
  readonly serverNowMs: number | null;
  /** `lastSeenAt` from the save — local wall clock at the last write. */
  readonly lastSeenAtMs: number;
  /** `lastSeenServerAt` from the save, when that write had a synced server clock. */
  readonly lastSeenServerAtMs: number | null;
}

/** What the evidence resolves to — GDD §17.3, all four defences. */
export interface ElapsedDecision {
  /** The window the player is credited, before the 8 h cap. Never negative. */
  readonly elapsedMs: number;
  /** False when the server could not be asked — halves the cap. */
  readonly serverVerified: boolean;
  /** True when the clock ran backwards — zero reward, no penalty. */
  readonly clockWentBackward: boolean;
  /** True when local and server disagreed past tolerance and the server won. */
  readonly serverWon: boolean;
}

/**
 * Decide how long the player was really away.
 *
 * Preference order:
 *
 * 1. Server now − server then. When both writes had a server clock, the local
 *    clock never enters the calculation at all — a player can set their system
 *    clock anywhere and this difference does not move.
 * 2. Server now − local then, when only the current boot is synced. The local
 *    clock at save time is trusted only after the *current* drift is checked
 *    against tolerance; past it, the server's answer wins by construction.
 * 3. Local only, when the server is unreachable. The caller halves the cap.
 *
 * Backwards means zero: a negative window is a timezone change or a corrected
 * clock at least as often as it is an exploit, so the answer is no reward and
 * no punishment (roadmap: "Never punish the player for a timezone change").
 */
export function decideElapsed(evidence: ClockEvidence): ElapsedDecision {
  const { localNowMs, serverNowMs, lastSeenAtMs, lastSeenServerAtMs } = evidence;

  if (serverNowMs !== null) {
    const drift = localNowMs - serverNowMs;
    const serverWon = Math.abs(drift) > OFFLINE_DRIFT_TOLERANCE_MS;

    if (lastSeenServerAtMs !== null) {
      const elapsed = serverNowMs - lastSeenServerAtMs;
      return {
        elapsedMs: Math.max(0, elapsed),
        serverVerified: true,
        clockWentBackward: elapsed < 0,
        serverWon,
      };
    }

    const reference = serverWon ? serverNowMs : localNowMs;
    const elapsed = reference - lastSeenAtMs;
    return {
      elapsedMs: Math.max(0, elapsed),
      serverVerified: true,
      clockWentBackward: elapsed < 0,
      serverWon,
    };
  }

  const elapsed = localNowMs - lastSeenAtMs;
  return {
    elapsedMs: Math.max(0, elapsed),
    serverVerified: false,
    clockWentBackward: elapsed < 0,
    serverWon: false,
  };
}

// ── Physical capacity ──────────────────────────────────────────────────────

/**
 * The most customers per minute the physical plant could conceivably move.
 *
 * ECONOMY_DESIGN §10: "6 park yeri varsa 600 araç ağırlanamaz". The bound is
 * the minimum over the plant's serial resources, each granted the most
 * charitable service time that exists in config — the fastest item on the
 * menu through the fastest station. Charitable on purpose: this ceiling exists
 * to keep an impossible *measurement* from paying out, not to model the real
 * flow, which the measured throughput already is.
 */
export function physicalCapacityPerMin(world: World): number {
  const layout = layoutForStage(world.progression.stage);

  let fastestPrepMs = Number.POSITIVE_INFINITY;
  for (const item of MENU) {
    if (item.prepTimeMs < fastestPrepMs) fastestPrepMs = item.prepTimeMs;
  }
  let fastestStationSpeed = 1;
  const unlocked = effectValue(world, 'prepStations');
  let stationCount = 0;
  for (let index = 0; index < STATIONS.length; index++) {
    const candidate = station(index);
    if (candidate.requiresPrepStations > unlocked) continue;
    stationCount++;
    if (candidate.speed > fastestStationSpeed) fastestStationSpeed = candidate.speed;
  }
  if (!Number.isFinite(fastestPrepMs) || stationCount === 0) return 0;

  const minServiceMs = fastestPrepMs / fastestStationSpeed;
  const perMin = 60_000 / minServiceMs;

  const kitchenFlow = stationCount * perMin;
  const registerFlow = (layout.registers + (layout.driveThru === null ? 0 : 1)) * perMin;
  const bays = layout.parking.length + (layout.driveThru === null ? 0 : 2);
  const parkingFlow = bays * perMin;

  return Math.min(kitchenFlow, registerFlow, parkingFlow);
}

// ── The model ──────────────────────────────────────────────────────────────

export interface OfflineInputs {
  readonly decision: ElapsedDecision;
  readonly meter: OfflineMeterSummary;
  /** Current wage bill per minute — accrues offline by design. */
  readonly wagesPerMin: number;
  /** `physicalCapacityPerMin(world)` at the moment of computation. */
  readonly capacityPerMin: number;
}

export interface OfflineResult {
  /** The window actually credited, after every cap. */
  readonly creditedMs: number;
  /** The window before capping — what the report's headline says. */
  readonly awayMs: number;
  /** Customers served offline, after efficiency and the physical ceiling. */
  readonly customersServed: number;
  readonly gross: number;
  readonly expenses: number;
  /** Gross − expenses. Negative is a legitimate result. */
  readonly net: number;
  /**
   * What limited the player: the busiest resource when one was genuinely
   * binding, or `demand` when every capacity sat under the significance
   * threshold — an empty car park does not limit anything.
   */
  readonly limiter: OfflineReportLimiter;
  /** That resource's average utilisation, 0..1. */
  readonly limiterUtilization: number;
  /** Customers the limiter turned away, extrapolated to the credited window. */
  readonly turnedAway: number;
  /** True when the cap was halved because the server was unreachable. */
  readonly capHalved: boolean;
  /** True when the backward-clock rule zeroed the earnings. */
  readonly zeroedByClock: boolean;
  /** False when the window is beneath OFFLINE_MIN_REPORT_MS — show nothing. */
  readonly worthReporting: boolean;
}

/**
 * The approved model, verbatim from the roadmap's execution prompt:
 *
 *   offlineMs = clamp(now − lastSeen, 0, 8 h)          — halved when unsynced
 *   effective = min(throughput × 0.40, capacity)
 *   gross     = effective × minutes × avgTicket
 *   costs     = wages × minutes + ingredients(served)
 *   net       = gross − costs                          — may be negative
 *
 * Ingredients scale with the customers actually credited rather than with
 * time: an empty stand burns wages, not stock.
 */
export function computeOffline(inputs: OfflineInputs): OfflineResult {
  const { decision, meter } = inputs;

  const capMs = decision.serverVerified ? OFFLINE_CAP_MS : OFFLINE_CAP_MS * OFFLINE_UNSYNCED_CAP_FACTOR;
  const creditedMs = decision.clockWentBackward ? 0 : Math.min(decision.elapsedMs, capMs);
  const minutes = creditedMs / 60_000;

  const effectivePerMin = Math.min(meter.throughputPerMin * OFFLINE_EFFICIENCY, inputs.capacityPerMin);
  const customersServed = Math.floor(effectivePerMin * minutes);
  const gross = customersServed * meter.avgTicket;
  const ingredients = customersServed * meter.avgCogs;
  const expenses = inputs.wagesPerMin * minutes + ingredients;
  const net = gross - expenses;

  let limiterIndex = 0;
  let best = -1;
  for (let i = 0; i < OFFLINE_LIMITERS.length; i++) {
    const value = meter.utilization[i] ?? 0;
    if (value > best) {
      best = value;
      limiterIndex = i;
    }
  }
  const limiter: OfflineReportLimiter =
    best >= OFFLINE_LIMITER_SIGNIFICANCE ? (OFFLINE_LIMITERS[limiterIndex] ?? 'demand') : 'demand';

  const turnedAway = Math.floor(meter.turnedAwayPerMin * OFFLINE_EFFICIENCY * minutes);

  return {
    creditedMs,
    awayMs: Math.max(0, decision.elapsedMs),
    customersServed,
    gross,
    expenses,
    net,
    limiter,
    limiterUtilization: Math.max(0, best),
    turnedAway,
    capHalved: !decision.serverVerified,
    zeroedByClock: decision.clockWentBackward,
    /*
     * A report with nothing in it teaches the player to dismiss reports. Under
     * five minutes away, or a window in which nothing was earned and nothing
     * was owed, shows nothing at all.
     */
    worthReporting: creditedMs >= OFFLINE_MIN_REPORT_MS && (customersServed > 0 || expenses > 0),
  };
}
