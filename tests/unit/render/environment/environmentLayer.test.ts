import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { WEATHER_STATES } from '@config/weather';
import { UPGRADES } from '@config/economy/upgrades';
import { ACTOR_KIND_CUSTOMER, ACTOR_KIND_VEHICLE } from '@config/actors';
import type { SimView } from '@sim/core/types';
import type { ActorView } from '@render/ActorView';
import { EnvironmentLayer } from '@render/environment/EnvironmentLayer';
import type { SceneGraph } from '@render/SceneGraph';

/**
 * The lighting-and-weather pass, against recording stand-ins — the same
 * approach constructionMask.test.ts established. What matters is not that
 * Phaser can fill a triangle; it is which triangles, at which hours, under
 * which skies.
 */

interface RectLog {
  fill: { color: number; alpha: number } | null;
  alpha: number;
  blend: number | null;
}

interface GraphicsLog {
  cleared: number;
  triangles: number;
  ellipses: number;
  lines: number;
  circles: number;
  alpha: number;
  fills: { color: number; alpha: number }[];
}

function fakeRect(): { rect: Phaser.GameObjects.Rectangle; log: RectLog } {
  const log: RectLog = { fill: null, alpha: 0, blend: null };
  const rect = {
    setOrigin: () => rect,
    setScrollFactor: () => rect,
    setDepth: () => rect,
    setBlendMode: (mode: number) => {
      log.blend = mode;
      return rect;
    },
    setFillStyle: (color: number, alpha: number) => {
      log.fill = { color, alpha };
      return rect;
    },
    setAlpha: (alpha: number) => {
      log.alpha = alpha;
      return rect;
    },
    setSize: () => rect,
  } as unknown as Phaser.GameObjects.Rectangle;
  return { rect, log };
}

function fakeGraphics(): { graphics: Phaser.GameObjects.Graphics; log: GraphicsLog } {
  const log: GraphicsLog = {
    cleared: 0,
    triangles: 0,
    ellipses: 0,
    lines: 0,
    circles: 0,
    alpha: 1,
    fills: [],
  };
  const graphics = {
    clear: () => {
      log.cleared++;
      log.triangles = 0;
      log.ellipses = 0;
      log.lines = 0;
      log.circles = 0;
      log.fills.length = 0;
      return graphics;
    },
    setBlendMode: () => graphics,
    setScrollFactor: () => graphics,
    setAlpha: (alpha: number) => {
      log.alpha = alpha;
      return graphics;
    },
    fillStyle: (color: number, alpha: number) => {
      log.fills.push({ color, alpha });
      return graphics;
    },
    lineStyle: () => graphics,
    fillTriangle: () => {
      log.triangles++;
      return graphics;
    },
    fillEllipse: () => {
      log.ellipses++;
      return graphics;
    },
    fillCircle: () => {
      log.circles++;
      return graphics;
    },
    lineBetween: () => {
      log.lines++;
      return graphics;
    },
  } as unknown as Phaser.GameObjects.Graphics;
  return { graphics, log };
}

interface Rig {
  layer: EnvironmentLayer;
  rects: RectLog[];
  graphics: GraphicsLog[];
}

function rig(options: { reducedMotion?: boolean; noParticles?: boolean } = {}): Rig {
  const rects: RectLog[] = [];
  const graphics: GraphicsLog[] = [];
  const scene = {
    add: {
      rectangle: () => {
        const { rect, log } = fakeRect();
        rects.push(log);
        return rect;
      },
      graphics: () => {
        const { graphics: g, log } = fakeGraphics();
        graphics.push(log);
        return g;
      },
    },
    scale: { width: 1280, height: 720, on: () => undefined },
  } as unknown as Phaser.Scene;

  const graph = { layer: () => ({ add: () => undefined }) } as unknown as SceneGraph;

  const layer = new EnvironmentLayer(scene, graph, {
    reducedMotion: options.reducedMotion ?? false,
    noParticles: options.noParticles ?? false,
  });
  return { layer, rects, graphics };
}

function view(overrides: Partial<SimView> = {}): SimView {
  return {
    gameHour: 12,
    simTimeMs: 30_000,
    weather: 0,
    upgradeLevels: UPGRADES.map(() => 0),
    ...overrides,
  } as SimView;
}

function vehicle(x = 100, y = 100): ActorView {
  return {
    active: true,
    kind: ACTOR_KIND_VEHICLE,
    screenX: x,
    screenY: y,
    headingX: 1,
    headingY: 0,
  } as ActorView;
}

// Creation order in the constructor: tint, wet, beams, glow, precipitation.
const TINT = 0;
const WET = 1;
const BEAMS = 0;
const GLOW = 1;
const PRECIPITATION = 2;

describe('the ambient quad', () => {
  it('is invisible at a clear noon and dark at a clear midnight', () => {
    const { layer, rects } = rig();
    layer.update(view({ gameHour: 12 }), []);
    expect(rects[TINT]?.fill?.alpha).toBe(0);

    layer.update(view({ gameHour: 0 }), []);
    expect(rects[TINT]?.fill?.alpha).toBeGreaterThan(0.4);
  });

  it('darkens a noon sky when the weather is foul', () => {
    const { layer, rects } = rig();
    layer.update(view({ gameHour: 12, weather: 2 }), []);
    expect(rects[TINT]?.fill?.alpha).toBeGreaterThan(0.1);
  });
});

describe('wet ground', () => {
  it('appears exactly when the state says the ground is wet', () => {
    const { layer, rects } = rig();
    for (let weather = 0; weather < WEATHER_STATES.length; weather++) {
      layer.update(view({ weather }), []);
      const expected = WEATHER_STATES[weather]?.wetGround === true;
      expect(rects[WET]?.alpha ?? 0, WEATHER_STATES[weather]?.id).toBe(expected ? 0.16 : 0);
    }
  });
});

describe('headlights', () => {
  it('draws two triangles per vehicle after dark, and none at noon', () => {
    const { layer, graphics } = rig();
    layer.update(view({ gameHour: 23 }), [vehicle(), vehicle(300, 200)]);
    expect(graphics[BEAMS]?.triangles).toBe(4);

    layer.update(view({ gameHour: 12 }), [vehicle()]);
    expect(graphics[BEAMS]?.triangles).toBe(0);
  });

  it('ignores people and inactive slots', () => {
    const { layer, graphics } = rig();
    const person = { ...vehicle(), kind: ACTOR_KIND_CUSTOMER };
    const parked = { ...vehicle(), active: false } as ActorView;
    layer.update(view({ gameHour: 23 }), [person, parked]);
    expect(graphics[BEAMS]?.triangles).toBe(0);
  });
});

describe('sign glow', () => {
  const neonIndex = UPGRADES.findIndex((upgrade) => upgrade.id === 'neon-facade');

  it('glows only for owned lighting upgrades, only at night', () => {
    const { layer, graphics } = rig();
    const levels = UPGRADES.map(() => 0);
    levels[neonIndex] = 1;

    layer.update(view({ gameHour: 23, upgradeLevels: levels }), []);
    expect(graphics[GLOW]?.ellipses).toBe(3);

    layer.update(view({ gameHour: 12, upgradeLevels: levels }), []);
    expect(graphics[GLOW]?.ellipses).toBe(0);

    layer.update(view({ gameHour: 23 }), []);
    expect(graphics[GLOW]?.ellipses).toBe(0);
  });

  it('the neon flicker dips deterministically with sim time, and holds under reduced motion', () => {
    const still = rig({ reducedMotion: true });
    const levels = UPGRADES.map(() => 0);
    levels[neonIndex] = 1;

    const moving = rig();
    // A phase inside the dip window vs cruise: different alphas.
    moving.layer.update(view({ gameHour: 23, upgradeLevels: levels, simTimeMs: 1700 * 10 + 10 }), []);
    const dipped = moving.graphics[GLOW]?.fills[0]?.alpha ?? 0;
    moving.layer.update(view({ gameHour: 23, upgradeLevels: levels, simTimeMs: 1700 * 10 + 1000 }), []);
    const cruising = moving.graphics[GLOW]?.fills[0]?.alpha ?? 0;
    expect(dipped).toBeLessThan(cruising);

    // Reduced motion: the same two instants read identically.
    still.layer.update(view({ gameHour: 23, upgradeLevels: levels, simTimeMs: 1700 * 10 + 10 }), []);
    const a = still.graphics[GLOW]?.fills[0]?.alpha ?? 0;
    still.layer.update(view({ gameHour: 23, upgradeLevels: levels, simTimeMs: 1700 * 10 + 1000 }), []);
    const b = still.graphics[GLOW]?.fills[0]?.alpha ?? 0;
    expect(a).toBe(b);
  });
});

describe('precipitation', () => {
  it('rains lines, snows circles, and clears to nothing', () => {
    const { layer, graphics } = rig();
    layer.update(view({ weather: 2 }), []);
    expect(graphics[PRECIPITATION]?.lines).toBeGreaterThan(50);

    layer.update(view({ weather: 3 }), []);
    expect(graphics[PRECIPITATION]?.lines).toBe(0);
    expect(graphics[PRECIPITATION]?.circles).toBeGreaterThan(50);

    layer.update(view({ weather: 0 }), []);
    expect(graphics[PRECIPITATION]?.circles).toBe(0);
  });

  it('is a pure function of sim time — the golden argument', () => {
    const a = rig();
    const b = rig();
    a.layer.update(view({ weather: 2, simTimeMs: 123_450 }), []);
    b.layer.update(view({ weather: 2, simTimeMs: 123_450 }), []);
    expect(a.graphics[PRECIPITATION]?.lines).toBe(b.graphics[PRECIPITATION]?.lines);
  });

  it('does not exist under noParticles', () => {
    const { layer, graphics } = rig({ noParticles: true });
    layer.update(view({ weather: 2 }), []);
    expect(graphics[PRECIPITATION]).toBeUndefined();
  });
});
