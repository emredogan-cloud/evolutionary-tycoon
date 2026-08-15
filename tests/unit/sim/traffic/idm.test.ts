import { describe, expect, it } from 'vitest';
import { IDM, MAX_SPEED_METRES_PER_SECOND } from '@config/traffic';
import { desiredGap, idmAcceleration } from '@sim/math/idm';

/**
 * The car-following model.
 *
 * Two properties are asserted here that the road's whole character depends on:
 * a follower never overlaps its leader, and a sudden brake propagates
 * **upstream** as a wave. The second is the emergent behaviour the model was
 * chosen for — it is what stops traffic reading as a conveyor belt — and it is
 * exactly the kind of thing that gets tuned away by someone making the
 * simulation "smoother" without knowing it was load-bearing.
 */

const V0 = 13.9;

describe('desired gap', () => {
  it('is the standstill minimum when stopped', () => {
    expect(desiredGap(0, 0)).toBeCloseTo(IDM.minGap, 10);
  });

  it('grows with speed, by the time headway', () => {
    // A driver at 14 m/s wants roughly 1.4 s of road ahead, plus the standstill
    // gap — that is what `timeHeadway` means.
    expect(desiredGap(14, 0)).toBeCloseTo(IDM.minGap + 14 * IDM.timeHeadway, 6);
  });

  it('grows further when closing on the leader', () => {
    expect(desiredGap(14, 4)).toBeGreaterThan(desiredGap(14, 0));
  });

  it('never shrinks below the standstill gap when pulling away', () => {
    // Opening a gap must not make the model want to be closer than a car length.
    expect(desiredGap(14, -20)).toBeGreaterThanOrEqual(IDM.minGap);
  });
});

describe('acceleration', () => {
  it('accelerates towards the desired speed on a clear road', () => {
    expect(idmAcceleration(0, V0, Infinity, 0)).toBeCloseTo(IDM.maxAccel, 6);
    expect(idmAcceleration(V0 / 2, V0, Infinity, 0)).toBeGreaterThan(0);
  });

  it('stops accelerating at the desired speed and pushes back above it', () => {
    expect(idmAcceleration(V0, V0, Infinity, 0)).toBeCloseTo(0, 9);
    expect(idmAcceleration(V0 * 1.2, V0, Infinity, 0)).toBeLessThan(0);
  });

  it('brakes when closer than it wants to be', () => {
    expect(idmAcceleration(14, V0, 5, 14)).toBeLessThan(0);
  });

  it('brakes harder the smaller the gap', () => {
    const wide = idmAcceleration(14, V0, 40, 14);
    const tight = idmAcceleration(14, V0, 10, 14);
    const tighter = idmAcceleration(14, V0, 4, 14);
    expect(tight).toBeLessThan(wide);
    expect(tighter).toBeLessThan(tight);
  });

  it('never exceeds the physical braking limit', () => {
    // Without the clamp the interaction term is unbounded as the gap tends to
    // zero: one enormous negative value throws a vehicle backwards through the
    // one behind it and the lane order never recovers.
    for (const gap of [2, 1, 0.1, 0.001]) {
      expect(idmAcceleration(20, V0, gap, 0)).toBeGreaterThanOrEqual(-IDM.maxBrake);
    }
  });

  it('returns full braking rather than nonsense for an impossible gap', () => {
    expect(idmAcceleration(10, V0, 0, 5)).toBe(-IDM.maxBrake);
    expect(idmAcceleration(10, V0, -3, 5)).toBe(-IDM.maxBrake);
  });

  it('is finite everywhere it could plausibly be called', () => {
    for (const speed of [0, 1, V0, MAX_SPEED_METRES_PER_SECOND]) {
      for (const gap of [0.001, 1, 30, 1e6, Infinity]) {
        for (const leader of [0, 5, 30]) {
          expect(Number.isFinite(idmAcceleration(speed, V0, gap, leader)), `${speed}/${gap}/${leader}`).toBe(
            true,
          );
        }
      }
    }
  });
});

/**
 * A one-dimensional platoon, integrated by hand.
 *
 * Deliberately not the real system: this isolates the model from spawning,
 * despawning and lane bookkeeping, so a failure here is unambiguously the maths.
 */
function simulatePlatoon(options: {
  count: number;
  spacing: number;
  speed: number;
  ticks: number;
  brakeLeader?: boolean;
  onTick?: (positions: readonly number[], speeds: readonly number[], tick: number) => void;
}): { positions: number[]; speeds: number[] } {
  const dt = 0.05;
  const length = 4.5;
  const positions = Array.from(
    { length: options.count },
    (_, i) => (options.count - 1 - i) * options.spacing,
  );
  const speeds = Array.from({ length: options.count }, () => options.speed);

  for (let tick = 0; tick < options.ticks; tick++) {
    const accels = positions.map((position, i) => {
      if (i === 0) {
        // The leader brakes hard for the first second, then drives normally.
        if (options.brakeLeader === true && tick < 20) return -IDM.comfortBrake * 2;
        return idmAcceleration(speeds[i] ?? 0, V0, Infinity, 0);
      }
      const gap = (positions[i - 1] ?? 0) - position - length;
      return idmAcceleration(speeds[i] ?? 0, V0, gap, speeds[i - 1] ?? 0);
    });

    for (let i = 0; i < positions.length; i++) {
      const next = (speeds[i] ?? 0) + (accels[i] ?? 0) * dt;
      speeds[i] = Math.max(0, next);
      positions[i] = (positions[i] ?? 0) + (speeds[i] ?? 0) * dt;
    }
    options.onTick?.(positions, speeds, tick);
  }
  return { positions, speeds };
}

describe('a platoon', () => {
  it('never lets a follower overlap its leader', () => {
    let minimumGap = Infinity;
    simulatePlatoon({
      count: 12,
      spacing: 12,
      speed: V0,
      ticks: 1200,
      brakeLeader: true,
      onTick: (positions) => {
        for (let i = 1; i < positions.length; i++) {
          minimumGap = Math.min(minimumGap, (positions[i - 1] ?? 0) - (positions[i] ?? 0) - 4.5);
        }
      },
    });
    expect(minimumGap).toBeGreaterThan(0);
  });

  it('never produces a negative speed', () => {
    let minimumSpeed = Infinity;
    simulatePlatoon({
      count: 12,
      spacing: 10,
      speed: V0,
      ticks: 1200,
      brakeLeader: true,
      onTick: (_positions, speeds) => {
        for (const speed of speeds) minimumSpeed = Math.min(minimumSpeed, speed);
      },
    });
    expect(minimumSpeed).toBeGreaterThanOrEqual(0);
  });

  it('propagates a brake upstream as a wave', () => {
    /*
     * The property that makes the road look alive. The leader brakes; each
     * follower reaches its own minimum speed strictly later than the one ahead
     * of it. If these all happened on the same tick the platoon would be a rigid
     * body, and the traffic would look like a conveyor belt.
     */
    const count = 8;
    const minimumAt = Array.from({ length: count }, () => -1);
    const minimumSpeed = Array.from({ length: count }, () => Infinity);

    simulatePlatoon({
      count,
      spacing: 14,
      speed: V0,
      ticks: 400,
      brakeLeader: true,
      onTick: (_positions, speeds, tick) => {
        for (let i = 0; i < count; i++) {
          const speed = speeds[i] ?? 0;
          if (speed < (minimumSpeed[i] ?? Infinity)) {
            minimumSpeed[i] = speed;
            minimumAt[i] = tick;
          }
        }
      },
    });

    for (let i = 2; i < count; i++) {
      expect(minimumAt[i], `vehicle ${i} reacted no later than ${i - 1}`).toBeGreaterThan(
        minimumAt[i - 1] ?? 0,
      );
    }
    // And every one of them actually slowed down — a "wave" nobody feels is not
    // a wave.
    for (let i = 1; i < count; i++) {
      expect(minimumSpeed[i], `vehicle ${i} never slowed`).toBeLessThan(V0 * 0.98);
    }
  });

  it('recovers to cruising once the obstruction clears', () => {
    const { speeds } = simulatePlatoon({
      count: 8,
      spacing: 14,
      speed: V0,
      ticks: 2000,
      brakeLeader: true,
    });
    for (const speed of speeds) expect(speed).toBeGreaterThan(V0 * 0.9);
  });

  it('converges rather than oscillating', () => {
    /*
     * Convergence, not a fixed point. IDM keeps a *safe* gap; it has no drive to
     * close a large one, so a leader that accelerated on clear road simply keeps
     * the ground it gained and the followers approach the desired speed
     * asymptotically. Two earlier versions of this test asserted things the
     * model does not do — a bound on the gap (measured 97 m against an expected
     * 55) and a fully static spacing (still drifting 9 m over the last 50 s).
     *
     * The property that actually matters is that the drift *shrinks*: an
     * oscillating platoon would show a change that stays constant or grows.
     */
    const windows: number[][] = [];
    simulatePlatoon({
      count: 8,
      spacing: 40,
      speed: 2,
      ticks: 12_000,
      onTick: (positions, _speeds, tick) => {
        if (tick % 2000 !== 1999) return;
        const gaps: number[] = [];
        for (let i = 1; i < positions.length; i++) {
          gaps.push((positions[i - 1] ?? 0) - (positions[i] ?? 0) - 4.5);
        }
        windows.push(gaps);
      },
    });

    expect(windows.length).toBeGreaterThanOrEqual(4);
    const drift = (a: number[] | undefined, b: number[] | undefined): number => {
      if (a === undefined || b === undefined) return Number.NaN;
      let total = 0;
      for (let i = 0; i < a.length; i++) total += Math.abs((b[i] ?? 0) - (a[i] ?? 0));
      return total;
    };

    const early = drift(windows[0], windows[1]);
    const late = drift(windows[windows.length - 2], windows[windows.length - 1]);
    expect(late, 'spacing is not settling').toBeLessThan(early);

    for (const gap of windows[windows.length - 1] ?? []) {
      expect(gap, 'closed past the safe distance').toBeGreaterThan(IDM.minGap);
    }
  });
});
