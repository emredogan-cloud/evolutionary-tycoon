import { describe, expect, it } from 'vitest';
import { assignAndSort, assignDepths, computeDepth, sortByDepth } from '@render/iso/DepthSorter';
import type { DepthSortable } from '@render/iso/DepthSorter';
import {
  DEPTH_SCALE,
  MIN_MEANINGFUL_HEIGHT_METRES,
  stableTieBreak,
  TIE_BREAK_PERIOD,
  Z_WEIGHT,
} from '@render/iso/depthConstants';

function item(entityId: number, worldX: number, worldY: number, worldZ = 0): DepthSortable {
  return { entityId, worldX, worldY, worldZ, depth: 0 };
}

/** Sorted entity ids, which is what actually reaches the screen. */
function order(items: DepthSortable[]): number[] {
  assignAndSort(items);
  return items.map((entry) => entry.entityId);
}

describe('computeDepth', () => {
  it('orders by distance down the isometric axis', () => {
    expect(computeDepth(0, 0, 0, 0)).toBeLessThan(computeDepth(1, 0, 0, 0));
    expect(computeDepth(1, 0, 0, 0)).toBeLessThan(computeDepth(1, 1, 0, 0));
  });

  it('treats x and y symmetrically', () => {
    // Both axes recede from the camera at the same rate in a 2:1 dimetric view.
    expect(computeDepth(3, 1, 0, 0)).toBe(computeDepth(1, 3, 0, 0));
  });

  it('puts a raised object in front of one at the same footprint', () => {
    // A plate on a table, a sign on a post.
    expect(computeDepth(5, 5, 1, 0)).toBeGreaterThan(computeDepth(5, 5, 0, 0));
  });

  it('never lets height outvote a genuinely closer footprint', () => {
    // A two-metre-tall object one step further back must still draw behind.
    const tallFurtherBack = computeDepth(4, 4, 2.5, 0);
    const shortCloser = computeDepth(5, 4, 0, 0);
    expect(tallFurtherBack).toBeLessThan(shortCloser);
    expect(Z_WEIGHT * 2.5).toBeLessThan(DEPTH_SCALE);
  });

  it('never lets the tie-break outvote a height difference', () => {
    // The worst case: the lowest possible id raised, against the highest
    // possible tie-break on the ground. A customer standing on a counter must
    // draw in front of one on the ground no matter which ids they drew.
    const raisedLowId = computeDepth(5, 5, MIN_MEANINGFUL_HEIGHT_METRES, 1);
    const groundHighId = computeDepth(5, 5, 0, TIE_BREAK_PERIOD - 1);
    expect(groundHighId).toBeLessThan(raisedLowId);
  });

  it('never lets the tie-break outvote a real placement height', () => {
    const onCounter = computeDepth(5, 5, 0.9, 1);
    const onGround = computeDepth(5, 5, 0, TIE_BREAK_PERIOD - 1);
    expect(onGround).toBeLessThan(onCounter);
  });
});

describe('stableTieBreak', () => {
  it('is stable for the same entity', () => {
    expect(stableTieBreak(1234)).toBe(stableTieBreak(1234));
  });

  it('separates two entities at the same footprint and height', () => {
    expect(stableTieBreak(7)).not.toBe(stableTieBreak(8));
  });

  it('stays below the smallest meaningful height difference', () => {
    // Not below one whole Z_WEIGHT unit — that bound looks right and is wrong,
    // because a 0.05 m step contributes only Z_WEIGHT * 0.05.
    const ceiling = Z_WEIGHT * MIN_MEANINGFUL_HEIGHT_METRES;
    for (const id of [0, 1, 42, TIE_BREAK_PERIOD - 1, TIE_BREAK_PERIOD, 10_000, 987_654]) {
      const value = stableTieBreak(id);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(ceiling);
    }
  });

  it('stays non-negative for the negative ids that static objects use', () => {
    // Statics carry negative ids so they cannot collide with a simulation
    // entity. A raw remainder would give them a negative offset and nudge a
    // counter behind an actor standing on exactly the same spot.
    for (const id of [-1, -2, -99, -TIE_BREAK_PERIOD, -123_456]) {
      const value = stableTieBreak(id);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(Z_WEIGHT * MIN_MEANINGFUL_HEIGHT_METRES);
    }
  });
});

describe('sortByDepth — the hard cases from the test card', () => {
  it('draws a tall object behind a short one that stands closer', () => {
    // The case that fails when a sprite anchors at its visual centre: the tall
    // object's art overlaps the short one from above, but its feet are further back.
    const tall = item(1, 4, 10);
    const short = item(2, 5, 11);
    expect(order([short, tall])).toEqual([1, 2]);
  });

  it('draws a tall object in front when it stands closer', () => {
    const short = item(1, 9, 10);
    const tall = item(2, 10, 11);
    expect(order([tall, short])).toEqual([1, 2]);
  });

  it('orders a stack by height at an identical footprint', () => {
    const ground = item(1, 20, 10, 0);
    const middle = item(2, 20, 10, 0.9);
    const top = item(3, 20, 10, 1.8);
    expect(order([top, ground, middle])).toEqual([1, 2, 3]);
  });

  it('resolves overlapping footprints on the same depth line the same way every time', () => {
    // x + y is identical for all three, so only the tie-break decides. Different
    // input orders must produce the same output order, or the pair flickers.
    const build = (): DepthSortable[] => [item(11, 15, 10), item(12, 14.6, 10.4), item(13, 14.2, 10.8)];
    const forwards = order(build());
    const backwards = order(build().reverse());
    const shuffled = order([build()[1], build()[2], build()[0]].filter(Boolean) as DepthSortable[]);

    expect(backwards).toEqual(forwards);
    expect(shuffled).toEqual(forwards);
  });

  it('keeps a diagonal file in order regardless of input order', () => {
    const file = [item(1, 4, 15), item(2, 7, 15), item(3, 10, 15), item(4, 13, 15)];
    expect(order([...file].reverse())).toEqual([1, 2, 3, 4]);
  });

  it('produces a stable order across repeated sorts of the same set', () => {
    const items = [item(3, 5, 5), item(1, 5, 5), item(2, 5, 5)];
    const first = order(items);
    const second = order(items);
    const third = order(items);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });
});

describe('assignDepths', () => {
  it('only touches the first `count` entries', () => {
    const items = [item(1, 1, 1), item(2, 2, 2), item(3, 3, 3)];
    assignDepths(items, 2);
    expect(items[0]?.depth).not.toBe(0);
    expect(items[1]?.depth).not.toBe(0);
    // The pooled tail is stale by design; the renderer reads only the live prefix.
    expect(items[2]?.depth).toBe(0);
  });

  it('recomputes from the current footprint, not a cached one', () => {
    const moving = { entityId: 1, worldX: 0, worldY: 0, worldZ: 0, depth: 0 };
    assignDepths([moving], 1);
    const atOrigin = moving.depth;
    moving.worldX = 10;
    assignDepths([moving], 1);
    expect(moving.depth).toBeGreaterThan(atOrigin);
  });
});

describe('sortByDepth', () => {
  it('sorts in place rather than returning a copy', () => {
    // `sortByDepth` orders by the *already assigned* depth; assigning is a
    // separate pass so a caller that has not moved anything can skip it.
    const items = [item(2, 9, 9), item(1, 1, 1)];
    const original = items;
    assignDepths(items, items.length);
    sortByDepth(items);
    expect(items).toBe(original);
    expect(items[0]?.entityId).toBe(1);
  });

  it('skips holes rather than throwing on a sparse pooled array', () => {
    // The pool hands out a dense prefix, but a caller working out of a larger
    // reusable array can pass a count past the live entries. Throwing there
    // would take the whole frame down for a bookkeeping mistake.
    const sparse = [item(1, 1, 1), undefined, item(3, 3, 3)] as unknown as DepthSortable[];
    expect(() => {
      assignDepths(sparse, 3);
    }).not.toThrow();
    expect(sparse[0]?.depth).toBeGreaterThan(0);
    expect(sparse[2]?.depth).toBeGreaterThan(0);
  });

  it('tolerates a count larger than the array', () => {
    const items = [item(1, 1, 1)];
    expect(() => {
      assignDepths(items, 10);
    }).not.toThrow();
  });

  it('handles an empty set', () => {
    const empty: DepthSortable[] = [];
    expect(() => {
      assignAndSort(empty);
    }).not.toThrow();
  });

  it('scales to a full frame without changing its answer', () => {
    // 260 objects is the depth-sorted budget from TECHNICAL_ARCHITECTURE §11.2.
    const items: DepthSortable[] = [];
    for (let i = 0; i < 260; i++) {
      items.push(item(i + 1, (i * 7) % 24, (i * 11) % 18, i % 3 === 0 ? 0.5 : 0));
    }
    const first = order([...items]);
    const second = order([...items].reverse());
    expect(second).toEqual(first);
  });
});
