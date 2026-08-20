/**
 * Vehicle archetypes — GAME_DESIGN_DOCUMENT §9.4.
 *
 * All ten as of Phase 15; the last six carry zero spawn share until their art
 * exists (see the block comment above them). The order is
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
   *
   * **Scaled by 0.75 in Phase 12.** Reputation used to start at zero, which
   * multiplied every conversion by 0.60 — the worst value in the published
   * 0.60..1.40 band — so the affinities had been set against a permanent
   * handicap. Starting reputation at the band's neutral point removed the
   * handicap and left the zero-upgrade conversion rate at **0.1195 against the
   * 0.09 ECONOMY_DESIGN §3 calibrates on**. These four numbers absorb that,
   * which is what puts the measured rate back on the design.
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

  // ── Phase 15 — behaviour, not just sprites ───────────────────────────────
  /**
   * Reputation floor below which this archetype is not on the road at all —
   * GDD §9.4, VIP_LIMO: "İtibar eşiği üstünde belirir". Zero for everyone
   * ordinary.
   */
  readonly minReputation: number;
  /** Multiplies the satisfaction-derived tip. Sports cars tip like it's easy. */
  readonly tipFactor: number;
  /**
   * Hourly multiplier on *affinity* (not share) — folded into §9.5's
   * `timeOfDayFit` slot. The long-haul truck's high night conversion lives
   * here; FLAT for archetypes whose appetite has no clock.
   */
  readonly hourAffinity: readonly number[];
  /**
   * Multiplies affinity while an `ev-charger` upgrade is owned — the Stage 4
   * hook GDD §9.4 gives EV_MODERN. 1 for everyone else; inert until an
   * upgrade with that id exists to be bought.
   */
  readonly chargerAffinityBoost: number;
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
    baseAffinity: 0.21,
    textureStem: 'veh_sedan',
    lengthMetres: 4.5,
    desiredSpeed: 13.9,
    speedVariance: 0.12,
    accelFactor: 1.0,
    baseShare: 0.5,
    // The default vehicle: present at every hour, so no bias.
    hourBias: FLAT,
    minReputation: 0,
    tipFactor: 1,
    hourAffinity: FLAT,
    chargerAffinityBoost: 1,
  },
  {
    id: 'PICKUP_WORKER',
    // On the road for work, and hungry for most of it.
    baseAffinity: 0.255,
    textureStem: 'veh_pickup',
    lengthMetres: 5.4,
    desiredSpeed: 12.5,
    speedVariance: 0.1,
    accelFactor: 0.85,
    baseShare: 0.22,
    // Trades start early; by evening they are already home.
    hourBias: biasAround(7, 6, 1.8, 0.45),
    minReputation: 0,
    tipFactor: 1,
    hourAffinity: FLAT,
    chargerAffinityBoost: 1,
  },
  {
    id: 'FAMILY_VAN',
    // Slow to commit, but a stop is a whole family.
    baseAffinity: 0.225,
    textureStem: 'veh_van',
    lengthMetres: 5.0,
    desiredSpeed: 12.0,
    speedVariance: 0.09,
    accelFactor: 0.8,
    baseShare: 0.2,
    // Errands and school runs cluster around the middle of the day.
    hourBias: biasAround(13, 7, 1.6, 0.5),
    minReputation: 0,
    tipFactor: 1,
    hourAffinity: FLAT,
    chargerAffinityBoost: 1,
  },
  {
    id: 'MOTORCYCLE',
    // Least likely to stop — no boot, and the weather.
    baseAffinity: 0.165,
    textureStem: 'veh_motorcycle',
    lengthMetres: 2.1,
    desiredSpeed: 15.6,
    speedVariance: 0.18,
    accelFactor: 1.35,
    baseShare: 0.08,
    // Almost nobody rides at 04:00.
    hourBias: biasAround(15, 9, 1.4, 0.25),
    minReputation: 0,
    tipFactor: 1,
    hourAffinity: FLAT,
    chargerAffinityBoost: 1,
  },

  /*
   * ── The Phase 15 six ────────────────────────────────────────────────────
   *
   * Behaviour complete, **spawn share zero**: no production art exists for any
   * of them (the delivered vehicle set covers exactly the four above —
   * ASSET_INTEGRATION_REPORT §3), and this project does not put a van on the
   * road and call it a bus. The shares flip on when their art lands (P16's
   * regeneration list owns it); every behavioural hook below is unit-tested
   * headlessly regardless, because none of it waits on a sprite.
   */
  {
    id: 'SPORTS_CAR',
    // Low conversion, high expectations, tips like the bill is a rounding error.
    baseAffinity: 0.12,
    textureStem: 'veh_sports',
    lengthMetres: 4.4,
    desiredSpeed: 16.7,
    speedVariance: 0.2,
    accelFactor: 1.6,
    baseShare: 0,
    hourBias: biasAround(19, 6, 1.5, 0.4),
    minReputation: 0,
    tipFactor: 2.2,
    hourAffinity: FLAT,
    chargerAffinityBoost: 1,
  },
  {
    id: 'TRUCK_LONGHAUL',
    // Middling by day; at night, the road is theirs and they are hungry.
    baseAffinity: 0.19,
    textureStem: 'veh_truck',
    lengthMetres: 8.5,
    desiredSpeed: 11.1,
    speedVariance: 0.06,
    accelFactor: 0.55,
    baseShare: 0,
    hourBias: biasAround(2, 5, 2.2, 0.6),
    minReputation: 0,
    tipFactor: 1,
    // Night conversion high — GDD §9.4 "gece dönüşümü yüksek".
    hourAffinity: biasAround(2, 6, 1.9, 0.7),
    chargerAffinityBoost: 1,
  },
  {
    id: 'BUS_TOUR',
    // Rare, and an event when it happens — GDD: "olay gibi hissettirir".
    baseAffinity: 0.06,
    textureStem: 'veh_bus',
    lengthMetres: 11,
    desiredSpeed: 10.5,
    speedVariance: 0.05,
    accelFactor: 0.45,
    baseShare: 0,
    hourBias: biasAround(12, 5, 1.8, 0.3),
    minReputation: 0,
    tipFactor: 1,
    hourAffinity: FLAT,
    chargerAffinityBoost: 1,
  },
  {
    id: 'EV_MODERN',
    // Ordinary until a charger exists; then the stop pays for itself.
    baseAffinity: 0.17,
    textureStem: 'veh_ev',
    lengthMetres: 4.7,
    desiredSpeed: 13.9,
    speedVariance: 0.1,
    accelFactor: 1.25,
    baseShare: 0,
    hourBias: FLAT,
    minReputation: 0,
    tipFactor: 1.2,
    hourAffinity: FLAT,
    // GDD §9.4: "Şarj istasyonu varsa çok yüksek".
    chargerAffinityBoost: 3,
  },
  {
    id: 'VIP_LIMO',
    // Appears only once the place is worth being seen at.
    baseAffinity: 0.08,
    textureStem: 'veh_limo',
    lengthMetres: 6.5,
    desiredSpeed: 12.5,
    speedVariance: 0.05,
    accelFactor: 0.7,
    baseShare: 0,
    hourBias: biasAround(20, 4, 1.6, 0.2),
    minReputation: 75,
    tipFactor: 3.5,
    hourAffinity: FLAT,
    chargerAffinityBoost: 1,
  },
  {
    id: 'EMERGENCY',
    // Never converts; exists to cut through and create a moment.
    baseAffinity: 0,
    textureStem: 'veh_emergency',
    lengthMetres: 5.8,
    desiredSpeed: 19.4,
    speedVariance: 0.04,
    accelFactor: 1.8,
    baseShare: 0,
    hourBias: FLAT,
    minReputation: 0,
    tipFactor: 1,
    hourAffinity: FLAT,
    chargerAffinityBoost: 1,
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
