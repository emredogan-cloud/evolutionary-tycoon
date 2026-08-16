import { SURFACE_COLORS } from '@config/surfaces';

/**
 * What a purchase looks like, per family — GAME_EXECUTION_ROADMAP Phase 13.
 *
 * _"Yükseltme burst'ü aile bazında farklılaşır."_ Five families, five different
 * bursts, so that a player who buys something while looking somewhere else still
 * knows **what kind of thing** just happened.
 *
 * ## Data, like the upgrades themselves
 *
 * A burst is a description — colour, count, speed, shape — not a class per
 * family. The renderer reads it and draws; adding a family means adding a row
 * here and nothing else, which is the same rule the tree itself follows
 * (`src/config/economy/upgrades.ts`: no `switch` over ids, anywhere).
 *
 * ## Why the shapes differ rather than only the colours
 *
 * Colour alone fails for the eight per cent of players who cannot separate red
 * from green, and it fails again on a placeholder-magenta scene where everything
 * is already the wrong colour. Shape and direction survive both: kitchen bursts
 * rise like steam, capacity bursts push outward, staff bursts orbit.
 */

/** How a burst's particles move. */
type BurstShape = 'rise' | 'expand' | 'sparkle' | 'sweep' | 'orbit';

export interface BurstSpec {
  /** Particle colour, `0xRRGGBB`. Every value is on the locked palette. */
  readonly colour: number;
  readonly particles: number;
  /** Metres per second, before the shape's own curve. */
  readonly speed: number;
  readonly shape: BurstShape;
  /** Milliseconds from spawn to gone. */
  readonly lifetimeMs: number;
}

/**
 * One per family — GAME_DESIGN_DOCUMENT §13.2.
 *
 * The mapping is deliberately literal, because a burst that has to be explained
 * is a burst that failed: visibility flashes outward like a light coming on,
 * the kitchen rises like steam, capacity pushes the ground outward, the
 * drive-thru sweeps along the lane, and staff orbits the person it improved.
 */
export const BURST_BY_FAMILY: Readonly<Record<string, BurstSpec>> = {
  VISIBILITY_APPEAL: {
    colour: SURFACE_COLORS.roadMarking,
    particles: 14,
    speed: 3.2,
    shape: 'sparkle',
    lifetimeMs: 900,
  },
  KITCHEN: {
    colour: SURFACE_COLORS.roadMarking,
    particles: 10,
    speed: 1.6,
    shape: 'rise',
    lifetimeMs: 1200,
  },
  CAPACITY: {
    colour: SURFACE_COLORS.groundGrid,
    particles: 12,
    speed: 2.4,
    shape: 'expand',
    lifetimeMs: 800,
  },
  DRIVE_THRU: {
    colour: SURFACE_COLORS.road,
    particles: 8,
    speed: 4.5,
    shape: 'sweep',
    lifetimeMs: 700,
  },
  STAFF: {
    colour: SURFACE_COLORS.ground,
    particles: 9,
    speed: 2.0,
    shape: 'orbit',
    lifetimeMs: 1100,
  },
};

/**
 * The burst for a family, or the capacity one as a fallback.
 *
 * A fallback rather than a throw: this runs from a purchase event on a render
 * frame, and a family nobody has drawn yet should cost the player a slightly
 * wrong sparkle rather than a black screen. The *test* is where an unmapped
 * family fails.
 */
export function burstFor(family: string): BurstSpec {
  return BURST_BY_FAMILY[family] ?? BURST_BY_FAMILY['CAPACITY'] ?? FALLBACK;
}

const FALLBACK: BurstSpec = {
  colour: SURFACE_COLORS.roadMarking,
  particles: 8,
  speed: 2,
  shape: 'expand',
  lifetimeMs: 800,
};

/**
 * Where one particle is, `0 <= t <= 1` through the burst's life.
 *
 * Pure: given the same index and the same `t` it returns the same offset, which
 * is what lets a frozen scene photograph identically and what keeps the effect
 * out of the simulation's way entirely. Offsets are in metres from the anchor.
 */
export function burstOffset(spec: BurstSpec, index: number, t: number, out: { x: number; y: number }): void {
  const share = spec.particles <= 0 ? 0 : index / spec.particles;
  const angle = share * Math.PI * 2;
  // Ease out: fast at the start, drifting at the end. A linear burst reads as a
  // sprite being dragged rather than as something being released.
  const eased = 1 - (1 - t) * (1 - t);
  const distance = spec.speed * eased;

  switch (spec.shape) {
    case 'rise':
      // Steam: mostly upward, with a slight lateral wander that grows.
      out.x = Math.sin(angle + t * 2) * 0.35 * eased;
      out.y = -distance;
      break;
    case 'expand':
      out.x = Math.cos(angle) * distance;
      out.y = Math.sin(angle) * distance * 0.5;
      break;
    case 'sparkle':
      // Outward, but each particle at its own pace, so the ring breaks up.
      out.x = Math.cos(angle) * distance * (0.6 + share * 0.8);
      out.y = Math.sin(angle) * distance * (0.6 + share * 0.8) * 0.5 - eased * 0.6;
      break;
    case 'sweep':
      /*
       * Along the lane rather than around a point: a drive-thru upgrade is about
       * a direction of travel. The lateral spread is scaled by the eased
       * progress like everything else — a burst whose particles start apart is
       * a burst that appears already half-finished.
       */
      out.x = distance * (0.4 + share * 0.6);
      out.y = (share - 0.5) * 0.8 * eased;
      break;
    case 'orbit':
      /*
       * A ring that opens out from the anchor rather than one that exists at
       * full radius from the first frame — the radius is scaled by the eased
       * progress like every other shape, so the staff burst starts on the person
       * it is about instead of appearing already around them.
       */
      out.x = Math.cos(angle + eased * Math.PI) * spec.speed * 0.4 * eased;
      out.y = Math.sin(angle + eased * Math.PI) * spec.speed * 0.2 * eased - eased * 0.8;
      break;
  }
}
