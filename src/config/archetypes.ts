/**
 * Vehicle archetypes — GAME_DESIGN_DOCUMENT §9.4.
 *
 * Four this phase; the remaining six arrive in Phase 15. The order is
 * load-bearing: `VehicleStore.archetype` stores an index into this array, and
 * that index is hashed into the world digest, so inserting one in the middle
 * changes every existing replay. Append only.
 *
 * Dimensions are real: a sedan is 4.5 m long because the car-following model
 * works in metres and a fudge here becomes a spacing that looks wrong on screen.
 * They agree with `src/config/actors.ts` and `docs/assets/subjectDimensions.json`.
 */

export interface ArchetypeSpec {
  readonly id: string;
  /** Index into `ACTOR_KIND_SPECS`-style art; the texture stem for Phase 4 art. */
  readonly textureStem: string;
  /** Bumper-to-bumper length in metres — the gap model subtracts this. */
  readonly lengthMetres: number;
  /** Free-road desired speed in m/s. 13.9 m/s is 50 km/h. */
  readonly desiredSpeed: number;
  /**
   * Per-vehicle speed spread, as a fraction of `desiredSpeed`.
   *
   * The single most important number for making the road look unplanned. With
   * zero spread every vehicle converges to the same speed and the traffic turns
   * into a conveyor belt — the exact failure the Phase 5 risk table names.
   */
  readonly speedVariance: number;
  /** Multiplies the model's comfortable acceleration. */
  readonly accelFactor: number;
  /** Relative share of spawns, before the hourly bias below. */
  readonly baseShare: number;
  /**
   * How inclined this archetype is to stop at all — the first factor of
   * GAME_DESIGN_DOCUMENT §9.5's product, and the only one that is a property of
   * the driver rather than of the stand.
   *
   * Calibrated against ECONOMY_DESIGN §3's zero-upgrade Stage 1 conversion rate
   * of 0.09: the share-weighted mean of these is 0.292, and 0.292 x 0.55
   * (unlit-sign visibility) x 0.60 (reputation at zero) = 0.096.
   */
  readonly baseAffinity: number;
  /**
   * Hourly multiplier on `baseShare`, 24 entries.
   *
   * Pickups skew to the early morning, vans to the middle of the day,
   * motorcycles away from the small hours. Phase 6 reads none of this — it is
   * purely who is on the road, not who converts.
   */
  readonly hourBias: readonly number[];
}

const FLAT: readonly number[] = Array.from({ length: 24 }, () => 1);

/** Peaks at `centre`, falling to `floor` at the far side of the clock. */
function biasAround(centre: number, width: number, peak: number, floor = 0.5): readonly number[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const distance = Math.min(Math.abs(hour - centre), 24 - Math.abs(hour - centre));
    const t = Math.min(1, distance / width);
    return peak + (floor - peak) * t;
  });
}

export const ARCHETYPE_SPECS: readonly ArchetypeSpec[] = [
  {
    id: 'SEDAN_COMMUTER',
    // The baseline driver.
    baseAffinity: 0.28,
    textureStem: 'veh_sedan',
    lengthMetres: 4.5,
    desiredSpeed: 13.9,
    speedVariance: 0.12,
    accelFactor: 1.0,
    baseShare: 0.5,
    // The default vehicle: present at every hour, so no bias.
    hourBias: FLAT,
  },
  {
    id: 'PICKUP_WORKER',
    // On the road for work, and hungry for most of it.
    baseAffinity: 0.34,
    textureStem: 'veh_pickup',
    lengthMetres: 5.4,
    desiredSpeed: 12.5,
    speedVariance: 0.1,
    accelFactor: 0.85,
    baseShare: 0.22,
    // Trades start early; by evening they are already home.
    hourBias: biasAround(7, 6, 1.8, 0.45),
  },
  {
    id: 'FAMILY_VAN',
    // Slow to commit, but a stop is a whole family.
    baseAffinity: 0.3,
    textureStem: 'veh_van',
    lengthMetres: 5.0,
    desiredSpeed: 12.0,
    speedVariance: 0.09,
    accelFactor: 0.8,
    baseShare: 0.2,
    // Errands and school runs cluster around the middle of the day.
    hourBias: biasAround(13, 7, 1.6, 0.5),
  },
  {
    id: 'MOTORCYCLE',
    // Least likely to stop — no boot, and the weather.
    baseAffinity: 0.22,
    textureStem: 'veh_motorcycle',
    lengthMetres: 2.1,
    desiredSpeed: 15.6,
    speedVariance: 0.18,
    accelFactor: 1.35,
    baseShare: 0.08,
    // Almost nobody rides at 04:00.
    hourBias: biasAround(15, 9, 1.4, 0.25),
  },
];

/*
 * No per-archetype index constants and no lookup helper.
 *
 * Both existed briefly and neither had a caller: the systems index
 * `ARCHETYPE_SPECS` directly with the value already in the store, and a named
 * constant for each would be a second place to keep the order correct. The order
 * is asserted in `tests/unit/sim/traffic/archetypes.test.ts` instead.
 */
