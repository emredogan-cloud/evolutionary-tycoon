import { z } from 'zod';

/**
 * What build mode lets the player put on the lot — Phase 11.
 *
 * ## Deliberately small, and deliberately decor
 *
 * Three items, none of which changes a number. Build mode in Phase 11 exists to
 * prove a mechanism — grid snapping, the navigation check, the ghost that goes
 * red before the click rather than after it — and the cheapest way to get that
 * mechanism wrong is to ship it alongside things the player *needs*, so that
 * "can I place this" and "should I place this" arrive in the same breath.
 *
 * The things the player needs are upgrades, and upgrades place themselves
 * (Phase 9 puts an object in the world for every purchase). Phase 13's tree is
 * where placement starts to matter economically. Until then a planter is a
 * planter.
 *
 * ## No cost field
 *
 * These are free, and there is no `cost: 0` sitting here waiting to be filled
 * in. A priced catalogue with every price at zero reads as an economy that has
 * been designed and set to nothing; an unpriced one reads as what it is —
 * decor, before the phase that gives placement a price.
 */

const buildableSchema = z.object({
  /** Stable id. Hashed through the command log; never renumber or rename. */
  id: z.string().min(1),
  /** Shown in the palette. Turkish, like the rest of the interface. */
  label: z.string().min(1),
  /**
   * A production world-object id from `WORLD_OBJECTS` — the correction pass.
   *
   * These carried `ph-prop-short`/`ph-prop-tall` placeholder stems, which is
   * half of why a placed object was invisible in the 2026-08-22 captures: the
   * renderer could not see `layout.placed` at all, and had it looked, the ids
   * named textures that resolve to nothing in a production build. Saves
   * written before v12 are migrated onto real ids (`migrations.ts`).
   */
  objectId: z.string().min(1),
});

export type Buildable = z.infer<typeof buildableSchema>;

export const BUILDABLES: readonly Buildable[] = z.array(buildableSchema).parse([
  { id: 'planter', label: 'Saksı', objectId: 'bush-flowering-01' },
  { id: 'bin', label: 'Çöp kutusu', objectId: 'bin' },
  { id: 'lamp', label: 'Lamba', objectId: 'lamp' },
]);
