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
   * Texture key, which is also the placeholder stem. Restricted to the props
   * the render catalogue already knows: a buildable naming a texture nobody
   * loaded is a `RangeError` thrown from inside a pointer handler.
   */
  objectId: z.union([z.literal('ph-prop-short'), z.literal('ph-prop-tall')]),
});

export type Buildable = z.infer<typeof buildableSchema>;

export const BUILDABLES: readonly Buildable[] = z.array(buildableSchema).parse([
  { id: 'planter', label: 'Saksı', objectId: 'ph-prop-short' },
  { id: 'bin', label: 'Çöp kutusu', objectId: 'ph-prop-short' },
  { id: 'lamp', label: 'Lamba', objectId: 'ph-prop-tall' },
]);
