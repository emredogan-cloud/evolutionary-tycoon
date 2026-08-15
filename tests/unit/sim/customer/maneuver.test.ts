import { describe, expect, it } from 'vitest';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { LaneGraph } from '@sim/nav/LaneGraph';
import { buildManeuver, ManeuverTable } from '@sim/nav/maneuvers';
import type { LaneSample } from '@sim/nav/spline';

const out: LaneSample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };
const lanes = new LaneGraph(STAGE1_LAYOUT);
const table = new ManeuverTable(STAGE1_LAYOUT, lanes);

/**
 * The manoeuvre splines — GAME_EXECUTION_ROADMAP Phase 6: "start and end
 * position and angle are correct".
 *
 * The endpoints are the whole contract. A curve that starts a metre from the
 * lane makes a car jump sideways as it turns in; one that ends pointing the
 * wrong way makes it settle into the bay facing the shrubbery. Both are the
 * kind of thing that looks like a physics bug and is really a geometry typo.
 */
describe('a single manoeuvre', () => {
  it('starts and ends exactly where it was told to', () => {
    const maneuver = buildManeuver(0, 0, 1, 0, 10, 5, 0, 1);
    maneuver.path.sample(0, out);
    expect([out.x, out.y]).toEqual([0, 0]);
    maneuver.path.sample(maneuver.length, out);
    expect(out.x).toBeCloseTo(10, 6);
    expect(out.y).toBeCloseTo(5, 6);
  });

  it('leaves along the start tangent and arrives along the end tangent', () => {
    // Sampled just inside each end rather than at them: the flattened polyline
    // reports a segment direction, and the first and last segments are what the
    // control handles set.
    const maneuver = buildManeuver(0, 0, 1, 0, 10, 5, 0, 1);
    maneuver.path.sample(0.05, out);
    expect(out.tangentX).toBeGreaterThan(0.9);
    expect(Math.abs(out.tangentY)).toBeLessThan(0.3);

    maneuver.path.sample(maneuver.length - 0.05, out);
    expect(out.tangentY).toBeGreaterThan(0.9);
    expect(Math.abs(out.tangentX)).toBeLessThan(0.3);
  });

  it('is at least as long as the straight line between its ends', () => {
    // A curve that measured shorter than the chord would mean the arc-length
    // table is wrong, and every speed derived from it with it.
    const maneuver = buildManeuver(0, 0, 1, 0, 10, 5, 0, 1);
    expect(maneuver.length).toBeGreaterThanOrEqual(Math.hypot(10, 5));
  });

  it('advances by real distance, so a car does not speed up through the turn', () => {
    /*
     * The reason the Bézier is flattened into a `Polyline` at all. Stepping the
     * curve parameter at a constant rate moves a car quickly through the
     * straight part and slowly through the tight part, which is the opposite of
     * how anyone drives and is obvious on screen.
     */
    const maneuver = buildManeuver(0, 0, 1, 0, 12, 6, 0, 1);
    const step = maneuver.length / 30;
    maneuver.path.sample(0, out);
    let previousX = out.x;
    let previousY = out.y;

    const distances: number[] = [];
    for (let i = 1; i <= 30; i++) {
      maneuver.path.sample(i * step, out);
      distances.push(Math.hypot(out.x - previousX, out.y - previousY));
      previousX = out.x;
      previousY = out.y;
    }

    const shortest = Math.min(...distances);
    const longest = Math.max(...distances);
    // Chord versus arc over a flattened curve, so not exact — but nothing like
    // the several-fold variation raw `t` produces.
    expect(longest / shortest).toBeLessThan(1.1);
  });

  it('survives coincident endpoints instead of dividing by zero', () => {
    // `Polyline` refuses zero-length segments, and a degenerate Bézier is full
    // of them. Reachable from a layout with a bay on top of the lane.
    const maneuver = buildManeuver(4, 4, 1, 0, 4, 4, 1, 0);
    expect(Number.isFinite(maneuver.length)).toBe(true);
    maneuver.path.sample(0, out);
    expect([out.x, out.y]).toEqual([4, 4]);
  });
});

describe('the stage-1 manoeuvre table', () => {
  it('has one pair per lane and bay', () => {
    expect(table.laneCount).toBe(lanes.laneCount);
    expect(table.bayCount).toBe(STAGE1_LAYOUT.parking.length);
    for (let lane = 0; lane < table.laneCount; lane++) {
      for (let bay = 0; bay < table.bayCount; bay++) {
        expect(table.get(lane, bay).entry.length).toBeGreaterThan(0);
        expect(table.get(lane, bay).exit.length).toBeGreaterThan(0);
      }
    }
  });

  it('starts every entry on its own lane, at the entry point', () => {
    for (let laneIndex = 0; laneIndex < table.laneCount; laneIndex++) {
      const lane = lanes.lane(laneIndex);
      lane.path.sample(lane.entryS, out);
      const expectedX = out.x;
      const expectedY = out.y;

      for (let bay = 0; bay < table.bayCount; bay++) {
        table.get(laneIndex, bay).entry.path.sample(0, out);
        expect(out.x, `lane ${laneIndex} bay ${bay}`).toBeCloseTo(expectedX, 6);
        expect(out.y, `lane ${laneIndex} bay ${bay}`).toBeCloseTo(expectedY, 6);
      }
    }
  });

  it('ends every entry in the bay it is for', () => {
    for (let laneIndex = 0; laneIndex < table.laneCount; laneIndex++) {
      for (let bay = 0; bay < table.bayCount; bay++) {
        const slot = STAGE1_LAYOUT.parking[bay];
        if (slot === undefined) throw new Error('layout');
        const maneuver = table.get(laneIndex, bay).entry;
        maneuver.path.sample(maneuver.length, out);
        expect(out.x, `lane ${laneIndex} bay ${bay}`).toBeCloseTo(slot.x, 6);
        expect(out.y, `lane ${laneIndex} bay ${bay}`).toBeCloseTo(slot.y, 6);
      }
    }
  });

  it('rejoins every exit onto its own lane, at the rejoin point', () => {
    for (let laneIndex = 0; laneIndex < table.laneCount; laneIndex++) {
      const lane = lanes.lane(laneIndex);
      lane.path.sample(lane.rejoinS, out);
      const expectedX = out.x;
      const expectedY = out.y;

      for (let bay = 0; bay < table.bayCount; bay++) {
        const maneuver = table.get(laneIndex, bay).exit;
        maneuver.path.sample(maneuver.length, out);
        expect(out.x, `lane ${laneIndex} bay ${bay}`).toBeCloseTo(expectedX, 6);
        expect(out.y, `lane ${laneIndex} bay ${bay}`).toBeCloseTo(expectedY, 6);
      }
    }
  });

  it('parks a car facing the way it drove in', () => {
    /*
     * The bay heading is authored as an axis, not a direction, and is flipped
     * for a lane running the other way. Without that, every car arriving from
     * the east would have to swing through 180 degrees to sit in a bay pointing
     * west — which the spline would happily draw, as a car pirouetting into a
     * parking space.
     */
    for (let laneIndex = 0; laneIndex < table.laneCount; laneIndex++) {
      const lane = lanes.lane(laneIndex);
      lane.path.sample(lane.entryS, out);
      const laneDirectionX = out.tangentX;

      for (let bay = 0; bay < table.bayCount; bay++) {
        const maneuver = table.get(laneIndex, bay).entry;
        maneuver.path.sample(maneuver.length - 0.05, out);
        expect(Math.sign(out.tangentX), `lane ${laneIndex} bay ${bay} parks against the traffic`).toBe(
          Math.sign(laneDirectionX),
        );
      }
    }
  });

  it('keeps every manoeuvre inside the lot', () => {
    // A car that clips outside the plot is drawn outside the camera's world
    // bounds, which reads as it driving through the scenery.
    const { lot, cameraMarginMetres } = STAGE1_LAYOUT;
    for (let laneIndex = 0; laneIndex < table.laneCount; laneIndex++) {
      for (let bay = 0; bay < table.bayCount; bay++) {
        const set = table.get(laneIndex, bay);
        for (const maneuver of [set.entry, set.exit]) {
          for (let i = 0; i <= 20; i++) {
            maneuver.path.sample((maneuver.length * i) / 20, out);
            expect(out.x).toBeGreaterThanOrEqual(lot.minX - cameraMarginMetres);
            expect(out.x).toBeLessThanOrEqual(lot.maxX + cameraMarginMetres);
            expect(out.y).toBeGreaterThanOrEqual(lot.minY - cameraMarginMetres);
            expect(out.y).toBeLessThanOrEqual(lot.maxY + cameraMarginMetres);
          }
        }
      }
    }
  });

  it('routes a turned-away car through the apron and back out', () => {
    for (let laneIndex = 0; laneIndex < table.laneCount; laneIndex++) {
      const set = table.passThroughFor(laneIndex);
      set.entry.path.sample(set.entry.length, out);
      expect(out.x).toBeCloseTo(STAGE1_LAYOUT.pullIn.x, 6);
      expect(out.y).toBeCloseTo(STAGE1_LAYOUT.pullIn.y, 6);

      set.exit.path.sample(0, out);
      expect(out.x).toBeCloseTo(STAGE1_LAYOUT.pullIn.x, 6);
      expect(out.y).toBeCloseTo(STAGE1_LAYOUT.pullIn.y, 6);
    }
  });

  it('resolves a negative bay to the pass-through, everywhere', () => {
    // One place decides what -1 means. Two would let the entry and the exit
    // disagree about which curve a car is on, and move it sideways mid-turn.
    for (let laneIndex = 0; laneIndex < table.laneCount; laneIndex++) {
      expect(table.setFor(laneIndex, -1)).toBe(table.passThroughFor(laneIndex));
      expect(table.setFor(laneIndex, 0)).toBe(table.get(laneIndex, 0));
    }
  });

  it('refuses geometry it does not have', () => {
    expect(() => table.get(0, 99)).toThrow(/No manoeuvre/);
    expect(() => table.passThroughFor(99)).toThrow(/No pass-through/);
  });
});

describe('lane tie-in points', () => {
  it('puts the entry after the decision, in both directions', () => {
    // A driver decides, then turns. The gap between them is the braking
    // distance the whole moment is built on.
    for (const lane of lanes.lanes) {
      expect(lane.entryS, lane.id).toBeGreaterThan(lane.decisionS);
      expect(lane.rejoinS, lane.id).toBeGreaterThan(lane.entryS);
      expect(lane.rejoinS, lane.id).toBeLessThanOrEqual(lane.length);
    }
  });

  it('refuses a layout that would have a driver turn before deciding', () => {
    expect(
      () =>
        new LaneGraph({
          ...STAGE1_LAYOUT,
          entryPointMetres: STAGE1_LAYOUT.road.decisionPointMetres,
        }),
    ).toThrow(/must be smaller than/);
  });

  it('leaves room to brake between the two', () => {
    /*
     * 10 m at 13.9 m/s is about 0.7 s, which is short — but the deceleration
     * starts as soon as the decision is made and eases off, so what matters is
     * that the distance is not zero. Asserted so that moving either authored
     * number has to come past this comment.
     */
    for (const lane of lanes.lanes) {
      expect(lane.entryS - lane.decisionS, lane.id).toBeGreaterThan(5);
    }
  });
});
