import { describe, expect, it } from 'vitest';
import {
  OFFLINE_CAP_MS,
  OFFLINE_DRIFT_TOLERANCE_MS,
  OFFLINE_EFFICIENCY,
  OFFLINE_MIN_REPORT_MS,
  OFFLINE_UNSYNCED_CAP_FACTOR,
} from '@config/economy/offline';
import { Sim } from '@sim/core/Sim';
import { computeOffline, decideElapsed, physicalCapacityPerMin } from '@sim/systems/OfflineSystem';
import type { ClockEvidence, OfflineInputs } from '@sim/systems/OfflineSystem';
import type { OfflineMeterSummary } from '@sim/systems/offlineMeter';

/**
 * The offline model and its clock defences — GAME_EXECUTION_ROADMAP Phase 14.
 *
 * Everything here is a pure function of numbers, which is the design working
 * as intended: the roadmap's fourteen abuse scenarios become table rows, and
 * "the server is down" is an argument rather than an environment.
 */

const T0 = 1_776_000_000_000;
const HOUR = 3_600_000;

/** A healthy stand: 2 customers/min, ₡5 ticket, ₡1.2 COGS, parking busiest. */
const METER: OfflineMeterSummary = {
  throughputPerMin: 2,
  avgTicket: 5,
  avgCogs: 1.2,
  turnedAwayPerMin: 0.5,
  utilization: [0.82, 0.4, 0, 0.3, 0.5],
};

function inputs(overrides: Partial<OfflineInputs> = {}): OfflineInputs {
  return {
    decision: {
      elapsedMs: 2 * HOUR,
      serverVerified: true,
      clockWentBackward: false,
      serverWon: false,
    },
    meter: METER,
    wagesPerMin: 2,
    capacityPerMin: 60,
    ...overrides,
  };
}

function evidence(overrides: Partial<ClockEvidence> = {}): ClockEvidence {
  return {
    localNowMs: T0,
    serverNowMs: T0,
    lastSeenAtMs: T0 - 2 * HOUR,
    lastSeenServerAtMs: T0 - 2 * HOUR,
    ...overrides,
  };
}

describe('decideElapsed — the four clock defences', () => {
  it('1. normal elapsed time: both clocks agree, the window is the absence', () => {
    const decision = decideElapsed(evidence());
    expect(decision.elapsedMs).toBe(2 * HOUR);
    expect(decision.serverVerified).toBe(true);
    expect(decision.clockWentBackward).toBe(false);
    expect(decision.serverWon).toBe(false);
  });

  it('4. clock moved forward: the server measures the real absence', () => {
    // The player set their clock 10 hours ahead. Local claims 12h away;
    // the server-to-server difference says 2h, and that is what pays.
    const decision = decideElapsed(evidence({ localNowMs: T0 + 10 * HOUR }));
    expect(decision.elapsedMs).toBe(2 * HOUR);
    expect(decision.serverWon).toBe(true);
  });

  it('4b. clock moved forward with no server reference at save time', () => {
    // The save predates a sync (lastSeenServerAt null). The current boot has
    // the server; drift past tolerance means the server's now wins.
    const decision = decideElapsed(
      evidence({
        localNowMs: T0 + 10 * HOUR,
        lastSeenServerAtMs: null,
        lastSeenAtMs: T0 - 2 * HOUR,
      }),
    );
    expect(decision.elapsedMs).toBe(2 * HOUR);
    expect(decision.serverWon).toBe(true);
  });

  it('5. clock moved backward: zero window, flagged, never a penalty', () => {
    const decision = decideElapsed(
      evidence({ serverNowMs: T0 - 3 * HOUR, lastSeenServerAtMs: T0 - 2 * HOUR }),
    );
    expect(decision.elapsedMs).toBe(0);
    expect(decision.clockWentBackward).toBe(true);
  });

  it('6. divergence beyond five minutes: the server wins; inside it, local is forgiven', () => {
    const inside = decideElapsed(
      evidence({
        localNowMs: T0 + OFFLINE_DRIFT_TOLERANCE_MS - 1000,
        lastSeenServerAtMs: null,
      }),
    );
    expect(inside.serverWon).toBe(false);
    expect(inside.elapsedMs).toBe(2 * HOUR + OFFLINE_DRIFT_TOLERANCE_MS - 1000);

    const outside = decideElapsed(
      evidence({
        localNowMs: T0 + OFFLINE_DRIFT_TOLERANCE_MS + 1000,
        lastSeenServerAtMs: null,
      }),
    );
    expect(outside.serverWon).toBe(true);
    expect(outside.elapsedMs).toBe(2 * HOUR);
  });

  it('7. server unavailable: local only, and the caller knows it is unverified', () => {
    const decision = decideElapsed(evidence({ serverNowMs: null }));
    expect(decision.serverVerified).toBe(false);
    expect(decision.elapsedMs).toBe(2 * HOUR);
  });

  it('7b. server unavailable AND clock rolled back: still zero, still no penalty', () => {
    const decision = decideElapsed(evidence({ serverNowMs: null, localNowMs: T0 - 3 * HOUR }));
    expect(decision.elapsedMs).toBe(0);
    expect(decision.clockWentBackward).toBe(true);
  });
});

describe('computeOffline — the approved model', () => {
  it('2. the model: gross, expenses and net for a normal window', () => {
    const result = computeOffline(inputs());
    // 2 cust/min × 0.40 = 0.8/min × 120 min = 96 customers.
    expect(result.customersServed).toBe(96);
    expect(result.gross).toBeCloseTo(96 * 5, 6);
    // wages 2/min × 120 + 96 × 1.2 COGS
    expect(result.expenses).toBeCloseTo(240 + 115.2, 6);
    expect(result.net).toBeCloseTo(480 - 355.2, 6);
    expect(result.worthReporting).toBe(true);
  });

  it('3. an absence beyond eight hours clamps to eight paid hours', () => {
    const result = computeOffline(
      inputs({
        decision: { elapsedMs: 30 * HOUR, serverVerified: true, clockWentBackward: false, serverWon: false },
      }),
    );
    expect(result.creditedMs).toBe(OFFLINE_CAP_MS);
    expect(result.awayMs).toBe(30 * HOUR);
    expect(result.customersServed).toBe(2 * OFFLINE_EFFICIENCY * 8 * 60);
  });

  it('7c. unverified windows pay at most half the cap', () => {
    const result = computeOffline(
      inputs({
        decision: { elapsedMs: 30 * HOUR, serverVerified: false, clockWentBackward: false, serverWon: false },
      }),
    );
    expect(result.creditedMs).toBe(OFFLINE_CAP_MS * OFFLINE_UNSYNCED_CAP_FACTOR);
    expect(result.capHalved).toBe(true);
  });

  it('5b. a backward clock pays zero and is not worth a report', () => {
    const result = computeOffline(
      inputs({
        decision: { elapsedMs: 5 * HOUR, serverVerified: true, clockWentBackward: true, serverWon: false },
      }),
    );
    expect(result.creditedMs).toBe(0);
    expect(result.customersServed).toBe(0);
    expect(result.net).toBe(0);
    expect(result.zeroedByClock).toBe(true);
    expect(result.worthReporting).toBe(false);
  });

  it('10. expenses can exceed gross: the net is honestly negative', () => {
    const result = computeOffline(inputs({ wagesPerMin: 50 }));
    expect(result.net).toBeLessThan(0);
    expect(result.worthReporting).toBe(true);
  });

  it('11. the physical capacity ceiling binds an implausible measurement', () => {
    // A tampered meter claims 10 000 customers/min. The plant says 3/min.
    const result = computeOffline(
      inputs({
        meter: { ...METER, throughputPerMin: 10_000 },
        capacityPerMin: 3,
      }),
    );
    expect(result.customersServed).toBe(3 * 120);
  });

  it('names the limiting factor as the argmax of measured utilisation', () => {
    const result = computeOffline(inputs());
    expect(result.limiter).toBe('parking');
    expect(result.limiterUtilization).toBeCloseTo(0.82, 6);
    // 0.5 turnaways/min × 0.4 × 120 min = 24 customers turned around.
    expect(result.turnedAway).toBe(24);
  });

  it('ties in utilisation resolve to the earlier resource, deterministically', () => {
    const result = computeOffline(inputs({ meter: { ...METER, utilization: [0.5, 0.5, 0.5, 0.5, 0.5] } }));
    expect(result.limiter).toBe('parking');
  });

  it('a window under five minutes is not worth a report', () => {
    const result = computeOffline(
      inputs({
        decision: {
          elapsedMs: OFFLINE_MIN_REPORT_MS - 1,
          serverVerified: true,
          clockWentBackward: false,
          serverWon: false,
        },
      }),
    );
    expect(result.worthReporting).toBe(false);
  });

  it('an idle stand with no staff and no throughput reports nothing', () => {
    const result = computeOffline(
      inputs({
        meter: { ...METER, throughputPerMin: 0, avgTicket: 0, avgCogs: 0 },
        wagesPerMin: 0,
      }),
    );
    expect(result.gross).toBe(0);
    expect(result.expenses).toBe(0);
    expect(result.worthReporting).toBe(false);
  });
});

describe('physicalCapacityPerMin', () => {
  it('derives a finite, positive ceiling from the Stage 1 plant', () => {
    const sim = new Sim({ seed: 1 });
    const capacity = physicalCapacityPerMin(sim.world);
    // Stage 1: one register, fastest item 1000 ms → 60/min is the register
    // bound, which is the binding one (3 stations → 180, 4 bays → 240).
    expect(capacity).toBeGreaterThan(0);
    expect(Number.isFinite(capacity)).toBe(true);
    expect(capacity).toBeLessThanOrEqual(240);
  });
});
