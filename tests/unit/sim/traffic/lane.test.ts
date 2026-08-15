import { describe, expect, it } from 'vitest';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { LaneGraph } from '@sim/nav/LaneGraph';
import { Polyline } from '@sim/nav/spline';
import type { LaneSample } from '@sim/nav/spline';

/**
 * Lane geometry — arc length is what makes constant speed look constant.
 *
 * Parameterising a polyline by segment index instead would make a vehicle
 * visibly speed up on short segments and slow down on long ones, because both
 * span the same parameter range. Stage 1's lanes are straight so the bug would
 * be invisible today and would arrive with the Stage 4 curved road, long after
 * anyone remembered why.
 */

const out: LaneSample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };

describe('Polyline', () => {
  it('measures length as the sum of its segments', () => {
    const line = new Polyline([
      { x: 0, y: 0 },
      { x: 3, y: 4 }, // 5
      { x: 3, y: 10 }, // 6
    ]);
    expect(line.length).toBeCloseTo(11, 10);
  });

  it('advances by real distance across a joint', () => {
    // The property the whole class exists for: equal steps of `s` move equal
    // distances, including across the corner.
    const line = new Polyline([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    let previousX = 0;
    let previousY = 0;
    const distances: number[] = [];
    for (let s = 1; s <= 20; s++) {
      line.sample(s, out);
      distances.push(Math.hypot(out.x - previousX, out.y - previousY));
      previousX = out.x;
      previousY = out.y;
    }
    for (const distance of distances) expect(distance).toBeCloseTo(1, 9);
  });

  it('reports a unit tangent that follows the segment', () => {
    const line = new Polyline([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    line.sample(5, out);
    expect([out.tangentX, out.tangentY]).toEqual([1, 0]);
    line.sample(15, out);
    expect([out.tangentX, out.tangentY]).toEqual([0, 1]);
    line.sample(2, out);
    expect(Math.hypot(out.tangentX, out.tangentY)).toBeCloseTo(1, 12);
  });

  it('clamps outside its range instead of returning NaN', () => {
    // A NaN position propagates silently into the render bridge and the world
    // hash, and is then extremely hard to trace back to here.
    const line = new Polyline([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    line.sample(-5, out);
    expect([out.x, out.y]).toEqual([0, 0]);
    line.sample(999, out);
    expect([out.x, out.y]).toEqual([10, 0]);
  });

  it('samples the exact endpoints', () => {
    const line = new Polyline([
      { x: 2, y: 3 },
      { x: 12, y: 3 },
    ]);
    line.sample(0, out);
    expect([out.x, out.y]).toEqual([2, 3]);
    line.sample(line.length, out);
    expect([out.x, out.y]).toEqual([12, 3]);
  });

  it('finds the right segment at every joint of a many-segment lane', () => {
    // Binary search, so the boundaries are where it would go wrong.
    const points = Array.from({ length: 20 }, (_, i) => ({ x: i * 3, y: 0 }));
    const line = new Polyline(points);
    for (let i = 0; i < 20; i++) {
      line.sample(i * 3, out);
      expect(out.x).toBeCloseTo(i * 3, 9);
    }
  });

  it('rejects geometry it cannot parameterise', () => {
    expect(() => new Polyline([{ x: 0, y: 0 }])).toThrow(/at least two points/);
    expect(
      () =>
        new Polyline([
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ]),
    ).toThrow(/zero-length segment/);
  });
});

describe('LaneGraph from the stage-1 layout', () => {
  const graph = new LaneGraph(STAGE1_LAYOUT);

  it('builds one lane per authored lane, in order', () => {
    expect(graph.laneCount).toBe(2);
    expect(graph.lanes.map((lane) => lane.id)).toEqual(['east', 'west']);
    expect(graph.lanes.map((lane) => lane.index)).toEqual([0, 1]);
  });

  it('takes its geometry from the layout rather than inventing it', () => {
    // Gameplay code must never hold a second copy of the road.
    const [east] = graph.lanes;
    const authored = STAGE1_LAYOUT.road.lanes[0]?.points ?? [];
    const first = authored[0];
    const last = authored[authored.length - 1];
    if (east === undefined || first === undefined || last === undefined) throw new Error('layout');
    expect(east.length).toBeCloseTo(Math.abs(last.x - first.x), 9);
    east.path.sample(0, out);
    expect([out.x, out.y]).toEqual([first.x, first.y]);
  });

  it('runs its two lanes in opposite directions', () => {
    const [east, west] = graph.lanes;
    if (east === undefined || west === undefined) throw new Error('layout');
    east.path.sample(east.length / 2, out);
    expect(out.tangentX).toBeGreaterThan(0);
    west.path.sample(west.length / 2, out);
    expect(out.tangentX).toBeLessThan(0);
  });

  it('puts the decision point the authored distance before the counter', () => {
    const { counter, road } = STAGE1_LAYOUT;
    for (const lane of graph.lanes) {
      lane.path.sample(lane.decisionS, out);
      const toCounter = Math.hypot(out.x - counter.x, out.y - counter.y);
      // Measured along the lane, so the straight-line distance is at least the
      // authored value — never less, which would mean deciding too late.
      expect(toCounter, lane.id).toBeGreaterThan(road.decisionPointMetres * 0.8);
      expect(lane.decisionS, lane.id).toBeGreaterThan(0);
      expect(lane.decisionS, lane.id).toBeLessThan(lane.length);
    }
  });

  it('reaches the decision point before the lane ends, in both directions', () => {
    // If a lane's decision point sat past its exit, no vehicle on it could ever
    // convert — and with two lanes running opposite ways, getting this right for
    // one direction and wrong for the other is the easy mistake.
    for (const lane of graph.lanes) {
      expect(lane.decisionS, lane.id).toBeLessThan(lane.length * 0.95);
    }
  });

  it('refuses an unknown lane loudly', () => {
    expect(() => graph.lane(7)).toThrow(/Unknown lane/);
  });
});
