import type Phaser from 'phaser';
import { worldToScreen } from '../iso/IsoProjection';

/**
 * The building growing in place — GAME_EXECUTION_ROADMAP Phase 11.
 *
 * _"Evolution is NOT a scene change. The camera stays put and the building grows
 * in place, revealed by an expanding stencil mask with construction VFX."_
 *
 * ## Why a mask rather than a fade or a swap
 *
 * A cross-fade between two buildings says "this replaced that". A mask that
 * sweeps upward says "this is being built", because it is the shape a building
 * actually acquires: from the ground up. The difference is the whole design
 * intent of the phase — the player's first lemonade stand survives in a corner
 * and the restaurant grows around it, and a swap would make that a lie.
 *
 * ## The mask is driven by the simulation
 *
 * `progress` comes from `constructionProgress(world)`, not from a timer started
 * when the animation began. A locally-timed reveal drifts from the world the
 * first time the game is paused or run at 4x — and the construction genuinely
 * takes twelve to thirty seconds *of simulated time*, so at 4x the building
 * genuinely goes up four times faster and the mask must agree.
 *
 * ## Reduced motion
 *
 * With `prefers-reduced-motion`, the dust and the camera nudge are skipped
 * entirely and only the reveal remains. A player who asks for less motion is
 * often asking because motion makes them ill, and a faster sweep does not help
 * (GAME_DESIGN_DOCUMENT §14.7).
 */
export class ConstructionMask {
  private readonly scene: Phaser.Scene;
  private readonly reducedMotion: boolean;

  /** The shape that reveals the new building. Null until construction starts. */
  private mask: Phaser.GameObjects.Graphics | null = null;
  private dust: Phaser.GameObjects.Graphics | null = null;

  /** World rectangle the new building occupies, in metres. */
  private readonly bounds: { minX: number; minY: number; maxX: number; maxY: number };

  constructor(
    scene: Phaser.Scene,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    reducedMotion: boolean,
  ) {
    this.scene = scene;
    this.bounds = bounds;
    this.reducedMotion = reducedMotion;
  }

  /**
   * Draw the reveal at `progress` in 0..1, or clear it at 0.
   *
   * Called every frame with the simulation's own figure. Idempotent: passing the
   * same progress twice draws the same thing, which is what makes a frozen
   * scene photograph identically (visual regression depends on it).
   */
  update(progress: number): void {
    if (progress <= 0) {
      this.clear();
      return;
    }

    const graphics = this.ensure();
    graphics.clear();

    /*
     * The sweep is vertical in *world* space, not screen space. An isometric
     * projection turns a horizontal world plane into a diamond, so a
     * screen-space horizontal wipe would cut the building along a line that
     * corresponds to nothing — it would look like a wipe rather than like
     * construction.
     */
    const revealedTo = this.bounds.minY + (this.bounds.maxY - this.bounds.minY) * progress;

    const corners: [number, number][] = [
      [this.bounds.minX, this.bounds.minY],
      [this.bounds.maxX, this.bounds.minY],
      [this.bounds.maxX, revealedTo],
      [this.bounds.minX, revealedTo],
    ];

    graphics.fillStyle(0xffffff, 1);
    graphics.beginPath();
    corners.forEach(([x, y], index) => {
      const screen = worldToScreen(x, y, 0, { x: 0, y: 0 });
      if (index === 0) graphics.moveTo(screen.x, screen.y);
      else graphics.lineTo(screen.x, screen.y);
    });
    graphics.closePath();
    graphics.fillPath();

    if (!this.reducedMotion) this.drawDust(revealedTo, progress);
  }

  /**
   * A band of dust at the working edge.
   *
   * Drawn at the *edge of the reveal* rather than over the whole footprint,
   * because that is where work is happening — dust everywhere reads as fog and
   * hides the thing the player is meant to be watching appear.
   */
  private drawDust(edgeY: number, progress: number): void {
    const dust = this.dust ?? this.scene.add.graphics();
    this.dust = dust;
    dust.clear();
    dust.setDepth(1_000_000);

    // Fades out as the build completes: the last few per cent is a finished
    // building, not a building site.
    const alpha = 0.35 * (1 - progress);
    if (alpha <= 0.01) return;

    dust.fillStyle(0xc9bda6, alpha);
    for (let i = 0; i < 6; i++) {
      const x = this.bounds.minX + ((this.bounds.maxX - this.bounds.minX) * i) / 5;
      const screen = worldToScreen(x, edgeY, 0, { x: 0, y: 0 });
      dust.fillCircle(screen.x, screen.y, 10 + i * 2);
    }
  }

  private ensure(): Phaser.GameObjects.Graphics {
    this.mask ??= this.scene.make.graphics();
    return this.mask;
  }

  /** The Phaser mask object, for the scene to apply to the building layer. */
  get geometryMask(): Phaser.Display.Masks.GeometryMask | null {
    if (this.mask === null) return null;
    return this.mask.createGeometryMask();
  }

  clear(): void {
    this.mask?.clear();
    this.dust?.clear();
  }

  destroy(): void {
    this.mask?.destroy();
    this.dust?.destroy();
    this.mask = null;
    this.dust = null;
  }
}
