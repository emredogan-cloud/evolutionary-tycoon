import { z } from 'zod';
import { STATION_TYPES } from './menu';

/**
 * Preparation stations — the capacity ceiling of the kitchen.
 *
 * ECONOMY_DESIGN §7 (Fren 3) lists stations alongside parking and tables as the
 * finite things that let capacity cut demand. **One order at a time per
 * station**: that single rule is what makes a second grill a meaningful purchase
 * in Phase 9 rather than a cosmetic one.
 *
 * `speed` multiplies the item's prep time. Stage 1's stations are all 1.0 — an
 * upgraded station is faster, and that is the number the upgrade moves.
 */

const stationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(STATION_TYPES),
  /** Footprint centre in world metres. Placed relative to the counter. */
  x: z.number(),
  y: z.number(),
  /** Multiplies prep time. Higher is faster — `prepTime / speed`. */
  speed: z.number().positive(),
  /** Multiplies the recipe's `qualityBase`. An upgrade moves this too. */
  quality: z.number().positive(),
  /**
   * How many levels of the `prepStations` effect this station needs to exist.
   *
   * Zero for the stations the stand starts with. A locked station is declared
   * here rather than created at purchase time, so its index — which an order
   * stores and the world hash includes — is fixed from the first build that
   * knows about it, whether or not anybody ever buys it.
   */
  requiresPrepStations: z.number().int().min(0),
});

export type Station = z.infer<typeof stationSchema>;

/**
 * Stage 1's three stations, one per item.
 *
 * Deliberately not two of anything. The first thing a player feels in Phase 9 is
 * buying a second prep station, and that feeling only exists if the first one is
 * a genuine bottleneck now.
 *
 * Positions sit behind the counter (y > 11) so a station is somewhere the player
 * can point at, and so Phase 10's cooks have somewhere to walk to.
 */
const STAGE1_STATIONS: Station[] = [
  { id: 'drink-1', type: 'DRINK', x: 10.4, y: 12.2, speed: 1, quality: 1, requiresPrepStations: 0 },
  { id: 'grill-1', type: 'GRILL', x: 12, y: 12.2, speed: 1, quality: 1, requiresPrepStations: 0 },
  { id: 'prep-1', type: 'PREP', x: 13.6, y: 12.2, speed: 1, quality: 1, requiresPrepStations: 0 },
  /*
   * The two benches the `second-prep-station` upgrade unlocks — Phase 9.
   *
   * Present in the array from the moment the upgrade exists, and inert until
   * bought. The alternative, pushing a station onto `STATIONS` at purchase
   * time, would make an order's station index mean different things in two
   * saves of the same build, which is precisely what "append only" forbids.
   */
  { id: 'prep-2', type: 'PREP', x: 15.2, y: 12.2, speed: 1, quality: 1, requiresPrepStations: 1 },
  { id: 'prep-3', type: 'PREP', x: 8.8, y: 12.2, speed: 1, quality: 1, requiresPrepStations: 2 },

  /*
   * The three stations the later menu needs — Phase 13.
   *
   * Appended, never inserted: a station's index is hashed into the world digest
   * and written into every save, so the order of this array is a compatibility
   * surface. Adding to the end is the only safe edit.
   *
   * They exist from the first tick and sit idle until there is something to make
   * on them, because the *menu* is what gates a stage rather than the kitchen —
   * a Stage 1 stand simply never receives an order for coffee. Gating them a
   * second time here would put the same rule in two places and let the two
   * disagree.
   */
  { id: 'fryer-1', type: 'FRYER', x: 17.0, y: 12.2, speed: 1, quality: 1, requiresPrepStations: 0 },
  { id: 'coffee-1', type: 'COFFEE', x: 7.4, y: 12.2, speed: 1, quality: 1, requiresPrepStations: 0 },
  { id: 'dessert-1', type: 'DESSERT', x: 18.6, y: 12.2, speed: 1, quality: 1, requiresPrepStations: 0 },
];

/**
 * Parsed at load. Indexed by position and hashed into the world digest, so —
 * like `MENU` — **append only**.
 */
export const STATIONS: readonly Station[] = z.array(stationSchema).parse(STAGE1_STATIONS);

export function station(index: number): Station {
  const found = STATIONS[index];
  if (found === undefined) throw new RangeError(`Unknown station ${index}`);
  return found;
}

/**
 * Where a finished plate waits for someone to carry it — the pass.
 *
 * One shared surface rather than one per station, because that is what makes
 * hold temperature a *system* rather than a per-station timer: everything ready
 * at once competes for the same waiter, and the oldest plate is the one going
 * cold. Phase 10's waiters read this; in Phase 8 the player is the waiter.
 */
export const PASS = { x: 12, y: 11.6 } as const;

/**
 * How many plates the pass holds.
 *
 * Finite on purpose. A full pass has to block the kitchen, or "cook everything
 * immediately" would be free and the whole hold-temperature model would never
 * bite. Phase 8's deadlock test drives exactly this state.
 */
export const PASS_CAPACITY = 6;
