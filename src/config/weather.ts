import { z } from 'zod';

/**
 * Weather — GAME_EXECUTION_ROADMAP Phase 15, GAME_DESIGN_DOCUMENT §9.6.
 *
 * Four states, config-driven, deterministic. The design sentence being
 * implemented is exact: "kar/yağmur → yoğunluk ↓, oturarak talebi ↑" — weather
 * moves traffic, conversion and the seated/drive-thru split, and nothing else.
 * No hidden multipliers: every effect a state has is a named number here, and
 * the balance gate runs with the calendar active.
 *
 * The daily plan is drawn by `EventSystem` from `rng.events` in a fixed number
 * of draws per day (see WEATHER_SEGMENTS_PER_DAY), which is what makes "same
 * seed, same day, same weather" a property rather than a hope.
 */

const weatherStateSchema = z.object({
  id: z.string().min(1),
  /** Türkçe, for the HUD indicator. */
  label: z.string().min(1),
  /** Multiplies the spawn acceptance rate. ≤ 1 keeps the thinning exact. */
  trafficFactor: z.number().min(0).max(1),
  /** The §9.5 slot-8 factor while this state holds. */
  conversionFactor: z.number().min(0).max(1.2),
  /**
   * Added to the counter/tables share where a drive-thru exists — "oturarak
   * talebi ↑". Positive means more customers choose to come inside.
   */
  seatedBias: z.number().min(0).max(0.5),
  /** Which sky the renderer draws: 'none' | 'rain' | 'snow'. */
  particles: z.enum(['none', 'rain', 'snow']),
  /** Ground reads wet — the simple reflection overlay. */
  wetGround: z.boolean(),
  /** Relative weight in the daily draw. */
  weight: z.number().positive(),
});

export type WeatherState = z.infer<typeof weatherStateSchema>;

/**
 * Order is load-bearing: `world.environment.weather` stores an index into this
 * array and the index is hashed. Append only.
 */
export const WEATHER_STATES: readonly WeatherState[] = z.array(weatherStateSchema).parse([
  {
    id: 'CLEAR',
    label: 'Açık',
    trafficFactor: 1,
    conversionFactor: 1,
    seatedBias: 0,
    particles: 'none',
    wetGround: false,
    weight: 8,
  },
  {
    id: 'OVERCAST',
    label: 'Bulutlu',
    trafficFactor: 0.97,
    conversionFactor: 1,
    seatedBias: 0.05,
    particles: 'none',
    wetGround: false,
    weight: 4,
  },
  {
    id: 'RAIN',
    label: 'Yağmur',
    trafficFactor: 0.85,
    conversionFactor: 0.92,
    seatedBias: 0.15,
    particles: 'rain',
    wetGround: true,
    weight: 2.5,
  },
  {
    id: 'SNOW',
    label: 'Kar',
    trafficFactor: 0.7,
    conversionFactor: 0.85,
    seatedBias: 0.25,
    particles: 'snow',
    wetGround: true,
    weight: 1,
  },
]);

export const WEATHER_CLEAR = 0;
export const WEATHER_RAIN = 2;

/**
 * The day splits into fixed segments, one state each — four six-hour blocks.
 *
 * Fixed count, fixed draw order: the calendar's determinism rests on the
 * number of `rng.events` draws per day never depending on what was drawn.
 */
export const WEATHER_SEGMENTS_PER_DAY = 4;

/**
 * First stage at which weather moves the *simulation* — traffic, conversion,
 * the seated split. GDD §9.6 defines "kar/yağmur (yoğunluk ↓, oturarak talebi
 * ↑)" inside "Olaylar (Aşama 4)": weather's gameplay half is part of the
 * Stage 4 event package, and the sky itself is ambient at every stage.
 *
 * This is also what the calibration ledger demands, measured: with the
 * factors live from Stage 1, stage-2 arrival went 21.78 → 22.1 min against a
 * 10–22 corridor — the P12-calibrated economy priced against a sky that did
 * not exist yet. Below this stage the factors read as 1 and the bias as 0.
 */
export const WEATHER_EFFECTS_MIN_STAGE = 4;

/**
 * Persistence bias: the chance a segment simply keeps the previous state
 * rather than drawing fresh. Weather has inertia; a day that flickers
 * clear→snow→clear→rain reads as a broken sky, not a climate.
 */
export const WEATHER_PERSISTENCE = 0.45;

/**
 * The long-run mean traffic factor the weather mix implies.
 *
 * Solved from config rather than typed twice, the basket's own pattern: the
 * persistence draw keeps the previous state, and refresh draws from the
 * weights, so the stationary distribution *is* the weight distribution and
 * the expectation is the weighted mean. The spawn-rate contract test asserts
 * delivered traffic against this, so a weather tweak that silently starves
 * the economy becomes a red test with the responsible number in it.
 */
export function expectedWeatherTrafficFactor(): number {
  let weightSum = 0;
  let weighted = 0;
  for (const state of WEATHER_STATES) {
    weightSum += state.weight;
    weighted += state.weight * state.trafficFactor;
  }
  return weighted / weightSum;
}
