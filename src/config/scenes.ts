import {
  ACTOR_KIND_CUSTOMER,
  ACTOR_KIND_EMPLOYEE,
  ACTOR_KIND_PROP_SHORT,
  ACTOR_KIND_PROP_TALL,
  ACTOR_KIND_SCALE_REFERENCE,
} from './actors';

/**
 * Authored scenes for visual regression and performance measurement.
 *
 * Not gameplay. No system spawns anything until Phase 5, so the arrangements a
 * golden screenshot needs have to be *written down* rather than waited for —
 * and a depth test card is something you author on purpose anyway: the whole
 * point is to construct the cases that break naive sorting, which random play
 * would produce rarely and never reproducibly.
 *
 * Data here, seeding in `src/app/devScene.ts`, selection by `?scene=`.
 */

interface SceneActor {
  readonly kind: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SceneFixture {
  readonly id: string;
  readonly description: string;
  readonly actors: readonly SceneActor[];
  /** Camera centre in world metres, so a golden always frames the same thing. */
  readonly cameraFocus: { readonly x: number; readonly y: number };
  readonly cameraZoom: number;
}

/**
 * The depth test card — deliberately the hardest cases, all in one frame.
 *
 * Every group below is a way painter's-algorithm sorting goes wrong when the
 * anchor or the ordering key is chosen carelessly. If the card renders
 * correctly, the ordinary cases are not in doubt.
 */
const DEPTH_TEST_CARD: readonly SceneActor[] = [
  // 1. Tall behind short. The tall object's *sprite* overlaps the short one from
  //    above, but its footprint is further back, so it must draw behind. This is
  //    the case that fails when anchoring at the visual centre instead of the feet.
  { kind: ACTOR_KIND_PROP_TALL, x: 4, y: 10, z: 0 },
  { kind: ACTOR_KIND_PROP_SHORT, x: 5, y: 11, z: 0 },

  // 2. The same pair, reversed: short behind, tall in front.
  { kind: ACTOR_KIND_PROP_SHORT, x: 9, y: 10, z: 0 },
  { kind: ACTOR_KIND_PROP_TALL, x: 10, y: 11, z: 0 },

  // 3. Overlapping footprints at the same depth line (x + y equal). Only the
  //    stable tie-break decides these, and it must decide the same way every frame.
  { kind: ACTOR_KIND_CUSTOMER, x: 15, y: 10, z: 0 },
  { kind: ACTOR_KIND_CUSTOMER, x: 14.6, y: 10.4, z: 0 },
  { kind: ACTOR_KIND_CUSTOMER, x: 14.2, y: 10.8, z: 0 },

  // 4. Stacked: same footprint, different heights. Height alone separates them,
  //    and the higher one must draw in front.
  { kind: ACTOR_KIND_PROP_SHORT, x: 20, y: 10, z: 0 },
  { kind: ACTOR_KIND_CUSTOMER, x: 20, y: 10, z: 0.9 },
  { kind: ACTOR_KIND_EMPLOYEE, x: 20, y: 10, z: 1.8 },

  // 5. A diagonal file at even spacing — the ordinary case, as a control. If this
  //    is wrong, the projection is wrong rather than the sort.
  { kind: ACTOR_KIND_CUSTOMER, x: 4, y: 15, z: 0 },
  { kind: ACTOR_KIND_CUSTOMER, x: 7, y: 15, z: 0 },
  { kind: ACTOR_KIND_CUSTOMER, x: 10, y: 15, z: 0 },
  { kind: ACTOR_KIND_CUSTOMER, x: 13, y: 15, z: 0 },

  // 6. A scale reference at a known height, so a golden diff catches a change in
  //    the projection's vertical scale that would otherwise look like "art moved".
  { kind: ACTOR_KIND_SCALE_REFERENCE, x: 18, y: 15, z: 0 },
];

/**
 * 100 actors on a deterministic grid — the render performance scene.
 *
 * The customer/employee split is not cosmetic: they live in separate pools with
 * separate capacities (96 and 24). An even split asks for 50 employees, the
 * pool holds 24, and 26 actors are silently dropped — which is exactly what
 * happened the first time this scene was measured on real hardware, producing a
 * "100 actor" reading taken on 74 actors.
 *
 * One in five is an employee, so both pools stay inside their bounds.
 * `sceneFitsPools` asserts it rather than leaving it to arithmetic in a comment.
 */
function stressActors(count: number): SceneActor[] {
  const actors: SceneActor[] = [];
  const columns = 10;
  for (let i = 0; i < count; i++) {
    const column = i % columns;
    const row = Math.floor(i / columns);
    actors.push({
      kind: i % 5 === 4 ? ACTOR_KIND_EMPLOYEE : ACTOR_KIND_CUSTOMER,
      x: 2 + column * 2,
      y: 9.5 + row * 0.85,
      z: 0,
    });
  }
  return actors;
}

export const SCENE_FIXTURES: Readonly<Record<string, SceneFixture>> = {
  empty: {
    id: 'empty',
    description: 'The bare stage-1 lot. Ground, road and statics only.',
    actors: [],
    cameraFocus: { x: 12, y: 9 },
    cameraZoom: 1,
  },
  'depth-testcard': {
    id: 'depth-testcard',
    description: 'Six deliberately hard depth-sorting cases in one frame.',
    actors: DEPTH_TEST_CARD,
    cameraFocus: { x: 12, y: 12.5 },
    cameraZoom: 1,
  },
  stress: {
    id: 'stress',
    description: '100 actors for the render performance measurement.',
    actors: stressActors(100),
    cameraFocus: { x: 12, y: 9 },
    cameraZoom: 0.8,
  },
};

export function sceneFixture(id: string): SceneFixture | null {
  return SCENE_FIXTURES[id] ?? null;
}

/**
 * How many actors of each pool a fixture needs.
 *
 * Staging silently drops anything that does not fit, so a fixture that
 * overflows a pool produces a measurement of fewer actors than it claims. This
 * is what makes that a test failure instead of a footnote.
 */
export function sceneDemand(fixture: SceneFixture): { customers: number; employees: number } {
  let employees = 0;
  for (const actor of fixture.actors) {
    if (actor.kind === ACTOR_KIND_EMPLOYEE) employees++;
  }
  return { customers: fixture.actors.length - employees, employees };
}
