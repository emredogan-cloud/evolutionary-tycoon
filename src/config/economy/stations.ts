import { z } from 'zod';
import type { StationType } from './menu';
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
  { id: 'drink-1', type: 'DRINK', x: 10.4, y: 12.2, speed: 1, quality: 1 },
  { id: 'grill-1', type: 'GRILL', x: 12, y: 12.2, speed: 1, quality: 1 },
  { id: 'prep-1', type: 'PREP', x: 13.6, y: 12.2, speed: 1, quality: 1 },
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
 * The first station of a type, or -1.
 *
 * First rather than least-loaded: Stage 1 has exactly one of each, and a
 * load-balancing rule written now would be untestable until Phase 9 adds a
 * second. `KitchenSystem` scans for a *free* one, which is the behaviour that
 * matters and which generalises without this function changing.
 */
export function firstStationOfType(type: StationType): number {
  return STATIONS.findIndex((entry) => entry.type === type);
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
