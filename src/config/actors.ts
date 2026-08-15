/**
 * The render catalogue — which sprite an entity draws as.
 *
 * `ActorSnapshot.kind` is an index into `ACTOR_KIND_SPECS`. A number rather than a
 * string because it travels across the simulation/render boundary once per actor
 * per frame, and because the simulation must not hold a texture key: the
 * catalogue is a *rendering* concern, and the same entity kind will map to
 * different art per evolution stage.
 *
 * Phase 3 fills the catalogue with placeholders. Phase 4 replaces the texture
 * keys with real art; nothing outside this file changes when it does.
 */

/**
 * The canonical order is `ACTOR_KIND_SPECS` below — the `ACTOR_KIND_*` constants
 * are indices into it, so adding a kind means appending to that array and
 * nowhere else.
 */
type ActorKindName = 'customer' | 'employee' | 'vehicle' | 'propShort' | 'propTall' | 'scaleReference';

export const ACTOR_KIND_CUSTOMER = 0;
export const ACTOR_KIND_EMPLOYEE = 1;
export const ACTOR_KIND_VEHICLE = 2;
export const ACTOR_KIND_PROP_SHORT = 3;
export const ACTOR_KIND_PROP_TALL = 4;
export const ACTOR_KIND_SCALE_REFERENCE = 5;

export interface ActorKindSpec {
  readonly name: ActorKindName;
  /** Texture key, and also the placeholder file stem under `assets/_placeholder/`. */
  readonly textureKey: string;
  /** Footprint in world metres — what the depth sorter anchors to. */
  readonly footprintX: number;
  readonly footprintY: number;
  /**
   * Height in world metres.
   *
   * Drives both the placeholder's drawn size and the asset validator's split
   * rule: anything over 160 px at 2x must be authored as `_lower`/`_upper`
   * (RESEARCH_NOTES §11). At TILE_Z = 32 and 2x art, 160 px is 2.5 metres.
   */
  readonly heightMetres: number;
}

/**
 * Indexed by the `ACTOR_KIND_*` constants above; order is load-bearing.
 *
 * A person is 0.5 m across and 1.75 m tall; a sedan is 4.5 x 1.9 m. Those are
 * real dimensions, not art-driven guesses, because the traffic model in Phase 5
 * works in metres and any fudge here becomes a physics bug there.
 */
export const ACTOR_KIND_SPECS: readonly ActorKindSpec[] = [
  {
    name: 'customer',
    textureKey: 'ph-customer',
    footprintX: 0.5,
    footprintY: 0.5,
    heightMetres: 1.75,
  },
  {
    name: 'employee',
    textureKey: 'ph-employee',
    footprintX: 0.5,
    footprintY: 0.5,
    heightMetres: 1.75,
  },
  {
    name: 'vehicle',
    textureKey: 'ph-vehicle',
    footprintX: 4.5,
    footprintY: 1.9,
    heightMetres: 1.5,
  },
  {
    name: 'propShort',
    textureKey: 'ph-prop-short',
    footprintX: 1.2,
    footprintY: 1.2,
    heightMetres: 0.9,
  },
  {
    name: 'propTall',
    textureKey: 'ph-prop-tall',
    footprintX: 0.8,
    footprintY: 0.8,
    heightMetres: 2.4,
  },
  {
    name: 'scaleReference',
    textureKey: 'ph-scale-reference',
    footprintX: 1,
    footprintY: 1,
    heightMetres: 2,
  },
];

export function actorKindSpec(kind: number): ActorKindSpec {
  const spec = ACTOR_KIND_SPECS[kind];
  if (spec === undefined) {
    throw new RangeError(`Unknown actor kind ${kind}`);
  }
  return spec;
}
