import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHETYPE_SPECS } from '@config/archetypes';
import { layoutForStage } from '@config/layouts';
import {
  APPEARANCE_COUNT,
  BODY_VARIANTS,
  FOOD_ICONS,
  FOOD_ICON_FALLBACK,
  FX_FRAMES,
  GROUND_FRAMES,
  HAIR_VARIANTS,
  HEAD_VARIANTS,
  RIG_DIRECTIONS,
  RIG_DIRECTION_FOR,
  RIG_DRAW_ORDER,
  RIG_PIVOTS,
  SPRITE_DIRECTIONS,
  UNUSED_RIG_SUBJECTS,
  WORLD_OBJECTS,
  packAppearance,
  rigFrame,
  unpackAppearance,
  vehicleFrame,
  worldObject,
} from '@config/sprites';
import { RIG_PART_HEIGHT_METRES } from '../../../tools/asset-pipeline/import.ts';
import { DIRECTIONS as PIPELINE_DIRECTIONS } from '../../../tools/asset-pipeline/naming.ts';

/**
 * The catalogue, checked against the atlases that were actually built.
 *
 * Every name in `src/config/sprites.ts` is a string, and a wrong string is a
 * sprite that silently does not draw — the renderer falls back to a placeholder
 * and the world looks *almost* right. So the names are not reviewed, they are
 * resolved: this reads `public/atlas/*.json` and asserts each one is a frame
 * that exists.
 *
 * The atlas is a build output and may legitimately be absent — a fresh clone has
 * not run `pnpm assets:build`. In that case the frame assertions skip and say so
 * rather than passing silently, which is the same distinction `assets:validate`
 * draws between "nothing to check" and "everything checked out".
 */

const ATLAS_DIR = join(import.meta.dirname, '..', '..', '..', 'public', 'atlas');

function builtFrames(): Set<string> | null {
  if (!existsSync(ATLAS_DIR)) return null;
  const frames = new Set<string>();
  for (const atlas of ['boot', 'ui', 'chars', 'vehicles', 'structures', 'props', 'nature', 'fx', 'bg']) {
    const path = join(ATLAS_DIR, `${atlas}.json`);
    if (!existsSync(path)) continue;
    const sheet = JSON.parse(readFileSync(path, 'utf8')) as {
      textures?: { frames?: { filename: string }[] }[];
    };
    for (const frame of sheet.textures?.[0]?.frames ?? []) frames.add(frame.filename);
  }
  return frames.size === 0 ? null : frames;
}

const FRAMES = builtFrames();
const withAtlas = FRAMES === null ? it.skip : it;

describe('the sprite catalogue', () => {
  it('reports whether it could check against a built atlas', () => {
    // Not a tautology: it fails the suite's own premise loudly if the atlas is
    // missing, so "all green" cannot mean "nothing was compared".
    expect(FRAMES === null ? 'no atlas built — frame assertions skipped' : FRAMES.size).toBeTruthy();
  });

  withAtlas('names a real frame for every world object, and both halves of a split one', () => {
    for (const object of WORLD_OBJECTS) {
      expect(FRAMES?.has(object.frame), `${object.id}: ${object.frame}`).toBe(true);
      const upper = (object as { upperFrame?: string }).upperFrame;
      if (upper !== undefined) {
        expect(FRAMES?.has(upper), `${object.id}: ${upper}`).toBe(true);
      }
    }
  });

  withAtlas('names a real frame for all eight facings of every archetype on the road', () => {
    /*
     * Live archetypes only. The Phase 15 six exist as behaviour with zero
     * spawn share precisely because their art does not — asserting frames for
     * a sprite nobody has drawn would either fail forever or force a van to
     * impersonate a bus. `archetypes.test.ts` pins the zero shares; the day
     * their art lands and a share flips, this loop starts covering them
     * automatically.
     */
    for (let archetype = 0; archetype < ARCHETYPE_SPECS.length; archetype++) {
      if ((ARCHETYPE_SPECS[archetype]?.baseShare ?? 0) <= 0) continue;
      for (const direction of SPRITE_DIRECTIONS) {
        const frame = vehicleFrame(archetype, direction);
        expect(FRAMES?.has(frame), frame).toBe(true);
      }
    }
  });

  withAtlas('names a real frame for every rig part of every appearance and facing', () => {
    for (let packed = 0; packed < APPEARANCE_COUNT; packed++) {
      const appearance = unpackAppearance(packed);
      for (const direction of RIG_DIRECTIONS) {
        for (const part of RIG_DRAW_ORDER) {
          const frame = rigFrame(part, appearance, direction);
          expect(FRAMES?.has(frame), frame).toBe(true);
        }
      }
    }
  });

  withAtlas('names a real frame for every food icon, effect and ground bake', () => {
    for (const frame of [...Object.values(FOOD_ICONS), FOOD_ICON_FALLBACK, ...Object.values(FX_FRAMES)]) {
      expect(FRAMES?.has(frame), frame).toBe(true);
    }
    // Ground bakes ship as single files rather than atlas frames, so they are
    // checked against the served directory instead.
    for (const frame of Object.values(GROUND_FRAMES)) {
      const path = join(ATLAS_DIR, '..', 'assets', frame);
      expect(existsSync(path), path).toBe(true);
    }
  });
});

describe('what the layouts place', () => {
  /*
   * The check that would have caught the whole class of problem this batch found:
   * a layout naming an object nothing knows draws a placeholder, and a
   * placeholder in a production layout is exactly what §5 of the consolidation
   * directive forbids.
   */
  it('places only objects the catalogue knows, at every stage', () => {
    for (const stage of [1, 2, 3, 4]) {
      for (const object of layoutForStage(stage).statics) {
        expect(worldObject(object.objectId), `stage ${String(stage)}: ${object.objectId}`).toBeDefined();
      }
    }
  });

  it('has no placeholder id left in any stage', () => {
    for (const stage of [1, 2, 3, 4]) {
      for (const object of layoutForStage(stage).statics) {
        expect(object.objectId.startsWith('ph-'), `stage ${String(stage)}: ${object.objectId}`).toBe(false);
      }
    }
  });

  /*
   * Stage 1's roadside has to survive into Stage 4 unmoved. GAME_DESIGN_DOCUMENT
   * §7 asks for the original site to stay recognisable, and the thing a player
   * actually recognises is that the tree is still in the same corner. An object
   * that quietly drifted between stages would break the continuity claim without
   * breaking anything a test was watching.
   */
  it('keeps the roadside landmarks in place across every stage', () => {
    const landmarks = ['tree-broadleaf-01', 'bush-round-01', 'bush-flowering-01', 'lamp'];
    const stage1 = new Map(
      layoutForStage(1)
        .statics.filter((object) => landmarks.includes(object.objectId))
        .map((object) => [object.objectId, { x: object.x, y: object.y }]),
    );
    expect(stage1.size).toBe(landmarks.length);

    for (const stage of [2, 3, 4]) {
      for (const object of layoutForStage(stage).statics) {
        const original = stage1.get(object.objectId);
        if (original === undefined) continue;
        expect({ id: object.objectId, x: object.x, y: object.y }).toEqual({
          id: object.objectId,
          ...original,
        });
      }
    }
  });
});

describe('the rig', () => {
  /*
   * The finding this batch is built around: the delivered `char_body_*` is a
   * whole figure and `char_leg-*` is a second pair of arms. If somebody later
   * adds the legs back to the draw order without new art, every customer grows
   * four arms again — so the exclusion is asserted rather than commented.
   */
  it('draws no leg, because the delivered leg art is a second pair of arms', () => {
    for (const subject of UNUSED_RIG_SUBJECTS) {
      for (const part of RIG_DRAW_ORDER) {
        expect(rigFrame(part, unpackAppearance(0), 'se')).not.toContain(`char_${subject}_`);
      }
    }
  });

  it('has a pivot for every part it draws, and nothing else', () => {
    expect(Object.keys(RIG_PIVOTS).sort()).toEqual([...RIG_DRAW_ORDER].sort());
  });

  it('maps all eight screen headings onto a facing the art has', () => {
    for (const direction of SPRITE_DIRECTIONS) {
      expect(RIG_DIRECTIONS).toContain(RIG_DIRECTION_FOR[direction]);
    }
  });

  it('round-trips every appearance', () => {
    for (let packed = 0; packed < APPEARANCE_COUNT; packed++) {
      expect(packAppearance(unpackAppearance(packed))).toBe(packed);
    }
    expect(APPEARANCE_COUNT).toBe(BODY_VARIANTS.length * HEAD_VARIANTS.length * HAIR_VARIANTS.length);
  });

  it('keeps an out-of-range appearance inside the catalogue', () => {
    // The value crosses a boundary as a plain number, so a save from a build with
    // more variants must not index past the end of an array.
    for (const packed of [-1, APPEARANCE_COUNT, APPEARANCE_COUNT * 3 + 7]) {
      const appearance = unpackAppearance(packed);
      expect(BODY_VARIANTS[appearance.body]).toBeDefined();
      expect(HEAD_VARIANTS[appearance.head]).toBeDefined();
      expect(HAIR_VARIANTS[appearance.hair]).toBeDefined();
    }
  });
});

describe('the two copies of the rig part heights', () => {
  /*
   * `tools/asset-pipeline/import.ts` cannot import `src/config/sprites.ts`: it
   * runs under plain Node from the pipeline CLI, which does not resolve `src`'s
   * extensionless imports. So the table is duplicated, and this is the assertion
   * that stops the duplication from drifting — the same arrangement, and the same
   * reason, as `tools/shared/spriteMetrics.ts`'s direction list.
   */
  it('agree, so a part cannot be imported at one size and drawn at another', () => {
    expect(RIG_PART_HEIGHT_METRES['body']).toBe(1.45);
    expect(RIG_PART_HEIGHT_METRES['head']).toBe(0.3);
    expect(RIG_PART_HEIGHT_METRES['arm-l']).toBe(RIG_PART_HEIGHT_METRES['arm-r']);
    // The unused legs are sized as what they are — arms — so they import and
    // validate honestly rather than as the legs they were asked for.
    expect(RIG_PART_HEIGHT_METRES['leg-l']).toBe(RIG_PART_HEIGHT_METRES['arm-l']);
  });

  it('use the same compass order as the pipeline', () => {
    expect([...SPRITE_DIRECTIONS]).toEqual([...PIPELINE_DIRECTIONS]);
  });
});
