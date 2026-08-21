import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { ConstructionMask } from '@render/fx/ConstructionMask';
import { worldToScreen } from '@render/iso/IsoProjection';

/**
 * The building growing in place — Phase 11.
 *
 * Tested against a recording stand-in for `Phaser.GameObjects.Graphics` rather
 * than a real scene, because what is worth checking here is not that Phaser can
 * fill a polygon: it is **which polygon**, and that is a claim about the
 * isometric geometry that a screenshot would only ever tell us about after the
 * fact.
 *
 * Three properties, and each one is a way the reveal has visibly gone wrong
 * before in this kind of code: it sweeps in world space rather than screen
 * space, it is driven by the simulation's own progress figure so a paused world
 * holds a half-built building, and it draws nothing extra under
 * `prefers-reduced-motion`.
 */

interface Recorded {
  moves: { x: number; y: number }[];
  lines: { x: number; y: number }[];
  circles: number;
  cleared: number;
}

function recorder(): { graphics: Phaser.GameObjects.Graphics; log: Recorded } {
  const log: Recorded = { moves: [], lines: [], circles: 0, cleared: 0 };
  const graphics = {
    clear: () => {
      log.cleared++;
      log.moves.length = 0;
      log.lines.length = 0;
      log.circles = 0;
    },
    fillStyle: () => undefined,
    beginPath: () => undefined,
    moveTo: (x: number, y: number) => log.moves.push({ x, y }),
    lineTo: (x: number, y: number) => log.lines.push({ x, y }),
    closePath: () => undefined,
    fillPath: () => undefined,
    fillCircle: () => {
      log.circles++;
    },
    setDepth: () => undefined,
    destroy: () => undefined,
    createGeometryMask: () => ({ mask: true }),
  } as unknown as Phaser.GameObjects.Graphics;

  return { graphics, log };
}

/** A scene that hands out recorders and remembers them in order. */
function fakeScene(): { scene: Phaser.Scene; made: Recorded[]; added: Recorded[] } {
  const made: Recorded[] = [];
  const added: Recorded[] = [];
  const scene = {
    make: {
      graphics: () => {
        const { graphics, log } = recorder();
        made.push(log);
        return graphics;
      },
    },
    add: {
      graphics: () => {
        const { graphics, log } = recorder();
        added.push(log);
        return graphics;
      },
    },
  } as unknown as Phaser.Scene;

  return { scene, made, added };
}

const BOUNDS = { minX: 0, minY: 9, maxX: 24, maxY: 18 };

describe('the construction reveal', () => {
  let harness: ReturnType<typeof fakeScene>;

  beforeEach(() => {
    harness = fakeScene();
  });

  it('draws nothing at all before construction starts', () => {
    const mask = new ConstructionMask(harness.scene, BOUNDS, false);
    mask.update(0);

    expect(harness.made, 'a mask was created for a build that is not happening').toHaveLength(0);
    expect(mask.geometryMask).toBeNull();
  });

  it('sweeps upward in world space, not across the screen', () => {
    /*
     * **The property the whole shape of this class rests on.** An isometric
     * projection turns a horizontal world plane into a diamond, so a
     * screen-space wipe would cut the building along a line corresponding to
     * nothing — it reads as a wipe rather than as a building going up.
     *
     * Checked by comparing the drawn quadrilateral against the projection of the
     * world rectangle it claims to be. The two southern corners move as progress
     * grows; the two northern ones never do.
     */
    const mask = new ConstructionMask(harness.scene, BOUNDS, true);
    mask.update(0.5);

    const log = harness.made[0];
    expect(log).toBeDefined();
    if (log === undefined) return;

    const halfway = BOUNDS.minY + (BOUNDS.maxY - BOUNDS.minY) * 0.5;
    const corners = [
      worldToScreen(BOUNDS.minX, BOUNDS.minY, 0, { x: 0, y: 0 }),
      worldToScreen(BOUNDS.maxX, BOUNDS.minY, 0, { x: 0, y: 0 }),
      worldToScreen(BOUNDS.maxX, halfway, 0, { x: 0, y: 0 }),
      worldToScreen(BOUNDS.minX, halfway, 0, { x: 0, y: 0 }),
    ];

    expect(log.moves).toHaveLength(1);
    expect(log.moves[0]?.x).toBeCloseTo(corners[0]?.x ?? NaN, 6);
    expect(log.moves[0]?.y).toBeCloseTo(corners[0]?.y ?? NaN, 6);
    expect(log.lines).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(log.lines[i]?.x).toBeCloseTo(corners[i + 1]?.x ?? NaN, 6);
      expect(log.lines[i]?.y).toBeCloseTo(corners[i + 1]?.y ?? NaN, 6);
    }
  });

  it('is a pure function of progress, so a paused world holds still', () => {
    // Idempotence is what makes a frozen scene photograph identically — the
    // visual goldens depend on it directly.
    const first = fakeScene();
    const second = fakeScene();
    new ConstructionMask(first.scene, BOUNDS, true).update(0.37);

    const later = new ConstructionMask(second.scene, BOUNDS, true);
    later.update(0.9);
    later.update(0.37);

    expect(second.made[0]?.lines).toEqual(first.made[0]?.lines);
    expect(second.made[0]?.moves).toEqual(first.made[0]?.moves);
  });

  it('skips the dust entirely under reduced motion', () => {
    /*
     * GAME_DESIGN_DOCUMENT §14.7: a player who asks for less motion is often
     * asking because motion makes them ill, so the answer is *no dust*, not
     * faster dust.
     */
    const reduced = fakeScene();
    new ConstructionMask(reduced.scene, BOUNDS, true).update(0.4);
    expect(reduced.added, 'reduced motion still created a dust layer').toHaveLength(0);

    const full = fakeScene();
    new ConstructionMask(full.scene, BOUNDS, false).update(0.4);
    expect(full.added[0]?.circles ?? 0).toBeGreaterThan(0);
  });

  it('lets the dust settle as the build finishes', () => {
    // The last few per cent is a finished building, not a building site.
    const nearlyDone = fakeScene();
    new ConstructionMask(nearlyDone.scene, BOUNDS, false).update(0.99);
    expect(nearlyDone.added[0]?.circles).toBe(0);
  });

  it('hands out a mask once there is something to mask, and cleans up', () => {
    const mask = new ConstructionMask(harness.scene, BOUNDS, false);
    mask.update(0.5);
    expect(mask.geometryMask).not.toBeNull();

    mask.update(0);
    expect(harness.made[0]?.cleared ?? 0).toBeGreaterThan(0);

    mask.destroy();
    expect(mask.geometryMask, 'destroy left a mask behind').toBeNull();
  });

  it('does not leak a second graphics object per frame', () => {
    // `ensure()` is called on every update; a version that created rather than
    // reused would allocate sixty Graphics a second for the length of the build.
    const mask = new ConstructionMask(harness.scene, BOUNDS, false);
    for (let i = 1; i <= 20; i++) mask.update(i / 20);

    expect(harness.made).toHaveLength(1);
    expect(harness.added).toHaveLength(1);
  });
});

describe('the reveal is not wired to wall-clock time', () => {
  it('never reads a clock', () => {
    /*
     * Belt and braces on the class's central claim. The mask is driven by
     * `constructionProgress(world)`; if it ever started timing itself, a paused
     * or 4x world would drift from the building the player is watching.
     */
    const now = vi.spyOn(performance, 'now');
    const dateNow = vi.spyOn(Date, 'now');

    const harness = fakeScene();
    const mask = new ConstructionMask(harness.scene, BOUNDS, false);
    mask.update(0.25);
    mask.update(0.75);

    expect(now).not.toHaveBeenCalled();
    expect(dateNow).not.toHaveBeenCalled();
    now.mockRestore();
    dateNow.mockRestore();
  });
});
