import type Phaser from 'phaser';
import { UPGRADES } from '@config/economy/upgrades';
import { WEATHER_STATES } from '@config/weather';
import { ACTOR_KIND_VEHICLE } from '@config/actors';
import type { SimView } from '@sim/core/types';
import type { ActorView } from '../ActorView';
import type { SceneGraph } from '../SceneGraph';
import { worldToScreen } from '../iso/IsoProjection';
import { WEATHER_TINT, ambientAt, nightIntensityAt } from './ambient';

/*
 * Phaser.BlendModes values, spelled locally so this module can be imported by
 * node unit tests without dragging the engine (whose module init touches
 * `window`). The numbering is Phaser's stable public enum.
 */
const BLEND_ADD = 1;
const BLEND_MULTIPLY = 2;

/**
 * Day, night and the sky — Phase 15's lighting-and-weather pass.
 *
 * The roadmap's sentence is the contract: "a full lighting pass, not a colour
 * filter" — an ambient tint that follows the hour, headlight cones on every
 * vehicle after dark, glow on the lighting upgrades the player owns (with the
 * neon's flicker), and rain or snow that visibly falls. And one hard
 * constraint beside it: **≤ 8 extra draw calls**. Spent as: one tint quad,
 * one wet-ground quad, one Graphics holding every cone, one holding every
 * glow, one holding the whole sky's precipitation — five worst case.
 *
 * Everything is drawn with `Graphics`, the same primitive every existing
 * effect uses (construction dust, upgrade bursts). Runtime `CanvasTexture`s
 * were tried first and rendered nothing on this Phaser 4 build; a probe
 * confirmed the objects existed at the right coordinates with the texture key
 * registered, and the pivot to Graphics is the fix, not a preference.
 *
 * ## Determinism
 *
 * Pure function of the sampled view: the hour drives the tint, `simTimeMs`
 * drives the precipitation offsets and the neon flicker, the weather index
 * comes from the simulation's own calendar. No `Math.random`, no wall clock,
 * no emitter with a private timer — which is what lets the weather goldens
 * exist (`?freezeAt=` freezes the sky with the world).
 *
 * Under `prefers-reduced-motion` the precipitation and flicker hold still;
 * under `noParticles` the precipitation layer is not created at all.
 */

/** Owned lighting upgrades that glow after dark, with the neon flagged. */
const GLOWING_UPGRADES: readonly { id: string; flicker: boolean; radius: number }[] = [
  { id: 'illuminated-sign', flicker: false, radius: 34 },
  { id: 'neon-facade', flicker: true, radius: 48 },
  { id: 'roadside-pylon', flicker: false, radius: 42 },
];

/** Headlight geometry, in iso-screen pixels. */
const CONE_LENGTH = 92;
const CONE_HALF_SPREAD = 22;
const HEADLIGHT_COLOR = 0xffe6a6;
const GLOW_COLOR = 0xffb648;

/** Deterministic hash for the precipitation scatter. */
function scatter(i: number, salt: number): number {
  const n = Math.imul(i + 1, 2654435761) ^ Math.imul(salt, 40503);
  return ((n >>> 8) & 0xffff) / 0x10000;
}

export interface EnvironmentOptions {
  readonly reducedMotion: boolean;
  readonly noParticles: boolean;
}

export class EnvironmentLayer {
  private readonly options: EnvironmentOptions;

  private readonly tint: Phaser.GameObjects.Rectangle;
  private readonly wetGround: Phaser.GameObjects.Rectangle;
  private readonly beams: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly precipitation: Phaser.GameObjects.Graphics | null;
  private readonly scene: Phaser.Scene;
  /** Indices into UPGRADES for the glow set, resolved once. */
  private readonly glowUpgradeIndexes: { index: number; flicker: boolean; radius: number }[] = [];

  constructor(scene: Phaser.Scene, graph: SceneGraph, options: EnvironmentOptions) {
    this.scene = scene;
    this.options = options;

    const layer = graph.layer('lighting');
    const { width, height } = scene.scale;

    /*
     * Creation order is paint order, and it is the whole point: the dark
     * ambient goes down FIRST and the light sources cut through it from
     * above — a beam under the night quad was measured at ~5% effective
     * alpha, which is how the first night capture had headlights that were
     * provably drawn and visibly absent. Precipitation rides on top of
     * everything: rain falls in front of the lights.
     */
    /*
     * The full-cover quads live in **world space** and are re-fitted to the
     * camera's visible world rect every update. They used to be viewport-sized
     * rectangles at scroll factor zero, and that is the Phaser trap this pass
     * closes wherever it appears: scroll factor exempts an object from scroll,
     * not from zoom, so at 0.6x the "full-screen" night tint shrank to 60% of
     * the frame and drew as a hard-edged dark rectangle floating over the
     * world — plainly visible in the user's zoomed-out capture.
     */
    this.tint = scene.add.rectangle(0, 0, width, height, 0x000000, 0);
    this.tint.setOrigin(0, 0);
    layer.add(this.tint);

    this.wetGround = scene.add.rectangle(0, 0, width, height, 0x10141c, 0);
    this.wetGround.setOrigin(0, 0).setBlendMode(BLEND_MULTIPLY);
    layer.add(this.wetGround);

    // World-space light: beams and glows live at iso coordinates and scroll
    // with the world.
    this.beams = scene.add.graphics();
    this.beams.setBlendMode(BLEND_ADD);
    layer.add(this.beams);

    this.glow = scene.add.graphics();
    this.glow.setBlendMode(BLEND_ADD);
    layer.add(this.glow);

    if (options.noParticles) {
      this.precipitation = null;
    } else {
      // World-space too — the sky must cover the frame at every zoom.
      this.precipitation = scene.add.graphics();
      layer.add(this.precipitation);
    }

    for (const glow of GLOWING_UPGRADES) {
      const index = UPGRADES.findIndex((upgrade) => upgrade.id === glow.id);
      if (index >= 0) {
        this.glowUpgradeIndexes.push({ index, flicker: glow.flicker, radius: glow.radius });
      }
    }
  }

  /** The camera's visible world rect — scroll and zoom arithmetic, no cache. */
  private viewRect(): { left: number; top: number; width: number; height: number } {
    const camera = this.scene.cameras.main;
    const width = camera.width / camera.zoom;
    const height = camera.height / camera.zoom;
    return {
      left: camera.scrollX + (camera.width - width) / 2,
      top: camera.scrollY + (camera.height - height) / 2,
      width,
      height,
    };
  }

  /** Once per rendered frame, from the view the frame is drawing. */
  update(view: SimView, actors: readonly ActorView[]): void {
    const hour = view.gameHour;
    const night = nightIntensityAt(hour);
    const weather = WEATHER_STATES[view.weather];
    const weatherTint = WEATHER_TINT[view.weather] ?? WEATHER_TINT[0];

    // Fit the cover quads to what the camera can actually see this frame.
    const rect = this.viewRect();
    this.tint.setPosition(rect.left, rect.top).setSize(rect.width, rect.height);
    this.wetGround.setPosition(rect.left, rect.top).setSize(rect.width, rect.height);

    // ── Ambient ───────────────────────────────────────────────────────────
    const ambient = ambientAt(hour);
    const alpha = Math.min(0.62, ambient.alpha + (weatherTint?.alpha ?? 0));
    const color = ambient.alpha >= (weatherTint?.alpha ?? 0) ? ambient.color : (weatherTint?.color ?? 0);
    this.tint.setFillStyle(color, alpha);

    // ── Wet ground ────────────────────────────────────────────────────────
    this.wetGround.setAlpha(weather?.wetGround === true ? 0.16 : 0);

    // ── Headlights ────────────────────────────────────────────────────────
    this.beams.clear();
    if (night > 0.05) {
      this.beams.setAlpha(0.9 * night);
      for (const actor of actors) {
        if (!actor.active || actor.kind !== ACTOR_KIND_VEHICLE) continue;
        // The world heading, projected the way every sprite facing is: screen
        // direction of world (dx, dy) is (dx - dy, (dx + dy) / 2). The old
        // form ignored the Y axis's screen skew, so an eastbound car threw
        // its beam due screen-right instead of down the road it was on.
        const dx = actor.headingX - actor.headingY;
        const dy = (actor.headingX + actor.headingY) * 0.5;
        const magnitude = Math.hypot(dx, dy);
        const length = magnitude > 0 ? magnitude : 1;
        const ux = dx / length;
        const uy = dy / length;
        // Perpendicular, for the cone's far edge.
        const px = -uy;
        const py = ux;
        const bx = actor.screenX + ux * 14;
        const by = actor.screenY + uy * 14;
        // Two nested triangles stand in for a gradient: wide and faint, then
        // narrow and brighter down the middle.
        this.beams.fillStyle(HEADLIGHT_COLOR, 0.2);
        this.beams.fillTriangle(
          bx,
          by,
          bx + ux * CONE_LENGTH + px * CONE_HALF_SPREAD,
          by + uy * CONE_LENGTH + py * CONE_HALF_SPREAD,
          bx + ux * CONE_LENGTH - px * CONE_HALF_SPREAD,
          by + uy * CONE_LENGTH - py * CONE_HALF_SPREAD,
        );
        this.beams.fillStyle(HEADLIGHT_COLOR, 0.3);
        this.beams.fillTriangle(
          bx,
          by,
          bx + ux * CONE_LENGTH * 0.7 + px * CONE_HALF_SPREAD * 0.45,
          by + uy * CONE_LENGTH * 0.7 + py * CONE_HALF_SPREAD * 0.45,
          bx + ux * CONE_LENGTH * 0.7 - px * CONE_HALF_SPREAD * 0.45,
          by + uy * CONE_LENGTH * 0.7 - py * CONE_HALF_SPREAD * 0.45,
        );
      }
    }

    // ── Upgrade glow + the neon flicker ───────────────────────────────────
    this.glow.clear();
    if (night > 0.05) {
      for (const entry of this.glowUpgradeIndexes) {
        if ((view.upgradeLevels[entry.index] ?? 0) <= 0) continue;
        const upgrade = UPGRADES[entry.index];
        if (upgrade === undefined) continue;
        const screen = worldToScreen(upgrade.anchor.x, upgrade.anchor.y, 0, scratch);
        /*
         * The flicker: a deterministic square-ish wave from sim time — two
         * short dips a second, the way a tired starter behaves. Reduced motion
         * holds it steady; the glow itself stays.
         */
        let strength = 0.4;
        if (entry.flicker && !this.options.reducedMotion) {
          const t = view.simTimeMs % 1700;
          strength = t < 90 ? 0.14 : t >= 700 && t < 760 ? 0.24 : 0.44;
        }
        // Three concentric ellipses stand in for a radial gradient.
        for (const [scale, share] of [
          [1, 0.28],
          [0.62, 0.4],
          [0.3, 0.6],
        ] as const) {
          this.glow.fillStyle(GLOW_COLOR, strength * share * night);
          this.glow.fillEllipse(
            screen.x,
            screen.y - 26,
            entry.radius * 2 * scale,
            entry.radius * 1.3 * scale,
          );
        }
      }
    }

    // ── Precipitation ─────────────────────────────────────────────────────
    if (this.precipitation !== null) {
      this.precipitation.clear();
      const particles = weather?.particles ?? 'none';
      if (particles !== 'none') {
        // The visible world rect, not the viewport: the sky is drawn in world
        // space so it covers the frame at every zoom (see the constructor).
        const { width, height } = rect;
        // Frozen sky under reduced motion: the offset holds at a fixed phase.
        const t = this.options.reducedMotion ? 0 : view.simTimeMs;
        if (particles === 'rain') {
          this.precipitation.lineStyle(1, 0xbed2eb, 0.4);
          for (let i = 0; i < 130; i++) {
            const x = rect.left + ((scatter(i, 3) * (width + 80) + t * 0.03) % (width + 80)) - 40;
            const fall = scatter(i, 7) * height;
            const y = rect.top + ((fall + t * (0.42 + scatter(i, 11) * 0.2)) % (height + 20)) - 10;
            this.precipitation.lineBetween(x, y, x - 3, y + 12);
          }
        } else {
          for (let i = 0; i < 90; i++) {
            const drift = Math.sin((t * 0.001 + i) * 0.9) * 14;
            const x = rect.left + ((scatter(i, 5) * (width + 60) + drift + 60) % (width + 60)) - 30;
            const fall = scatter(i, 13) * height;
            const y = rect.top + ((fall + t * (0.05 + scatter(i, 17) * 0.05)) % (height + 12)) - 6;
            this.precipitation.fillStyle(0xf0f6fc, 0.75);
            this.precipitation.fillCircle(x, y, 1 + scatter(i, 23) * 1.6);
          }
        }
      }
    }
  }
}

const scratch = { x: 0, y: 0 };
