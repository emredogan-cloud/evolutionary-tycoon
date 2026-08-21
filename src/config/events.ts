import { z } from 'zod';
import { WEATHER_RAIN } from './weather';

/**
 * Events — GAME_EXECUTION_ROADMAP Phase 15, GAME_DESIGN_DOCUMENT §9.6.
 *
 * The six approved types, each fully described by config: how often, how long,
 * what it multiplies, and what identity the renderer and the notification
 * strip give it. Determinism is structural: `EventSystem` draws each day's
 * schedule from `rng.events` in a **fixed number of draws per event type**, so
 * the calendar for (seed, day) is one answer, replayable forever.
 *
 * §9.6 titles the feature "(Aşama 4)": events begin when the restaurant is a
 * restaurant. `minStage` carries that; earlier stages have quiet roads and a
 * working weather system, which is the design's own pacing.
 */

const eventSpecSchema = z.object({
  id: z.string().min(1),
  /** Türkçe, for the notification strip. */
  label: z.string().min(1),
  /** Chance this event occurs at all on a given day, 0..1. */
  dailyChance: z.number().min(0).max(1),
  /** Earliest and latest start, in game hours. */
  startHourMin: z.number().min(0).max(24),
  startHourMax: z.number().min(0).max(24),
  /** Duration bounds, in game hours. */
  durationHoursMin: z.number().positive(),
  durationHoursMax: z.number().positive(),
  /** Multiplies spawn intensity while active. May exceed 1 (festival). */
  trafficFactor: z.number().min(0).max(4),
  /** Multiplies the §9.5 product's slot-8 factor while active. */
  conversionFactor: z.number().min(0).max(1.5),
  /**
   * Caps every road vehicle's desired speed to this fraction while active —
   * the congestion an accident or road work actually consists of. 1 = no cap.
   */
  speedCapFactor: z.number().min(0.2).max(1),
  /**
   * Multiplies TRUCK_LONGHAUL's spawn share while active — the night rush and
   * the fuel spike are truck stories. Inert until the truck art exists and its
   * share rises above zero (see archetypes.ts).
   */
  truckShareFactor: z.number().min(0).max(10),
  /** Forces a weather state while active (index into WEATHER_STATES), or -1. */
  forcesWeather: z.number().int().min(-1).max(3),
  /** First stage the event can occur at — §9.6 says the fourth. */
  minStage: z.number().int().min(1).max(4),
});

export type EventSpec = z.infer<typeof eventSpecSchema>;

/**
 * Order is load-bearing: the schedule stores indices into this array and they
 * are hashed and saved. Append only.
 */
export const EVENT_SPECS: readonly EventSpec[] = z.array(eventSpecSchema).parse([
  {
    id: 'ROAD_WORK',
    label: 'Yol çalışması',
    dailyChance: 0.18,
    startHourMin: 9,
    startHourMax: 15,
    durationHoursMin: 2,
    durationHoursMax: 4,
    trafficFactor: 0.8,
    conversionFactor: 1,
    speedCapFactor: 0.5,
    truckShareFactor: 1,
    forcesWeather: -1,
    minStage: 4,
  },
  {
    id: 'ACCIDENT',
    label: 'Kaza',
    dailyChance: 0.12,
    startHourMin: 7,
    startHourMax: 20,
    durationHoursMin: 0.4,
    durationHoursMax: 0.9,
    trafficFactor: 0.9,
    conversionFactor: 0.95,
    speedCapFactor: 0.35,
    truckShareFactor: 1,
    forcesWeather: -1,
    minStage: 4,
  },
  {
    id: 'FESTIVAL',
    label: 'Festival',
    dailyChance: 0.1,
    startHourMin: 15,
    startHourMax: 18,
    durationHoursMin: 4,
    durationHoursMax: 6,
    trafficFactor: 3,
    conversionFactor: 1.1,
    speedCapFactor: 0.8,
    truckShareFactor: 1,
    forcesWeather: -1,
    minStage: 4,
  },
  {
    id: 'NIGHT_RUSH',
    label: 'Gece kamyoncu akını',
    dailyChance: 0.15,
    startHourMin: 0,
    startHourMax: 2,
    durationHoursMin: 2,
    durationHoursMax: 3.5,
    trafficFactor: 1.3,
    conversionFactor: 1,
    speedCapFactor: 1,
    truckShareFactor: 5,
    forcesWeather: -1,
    minStage: 4,
  },
  {
    id: 'WEATHER_FRONT',
    label: 'Hava cephesi',
    dailyChance: 0.14,
    startHourMin: 6,
    startHourMax: 18,
    durationHoursMin: 3,
    durationHoursMax: 6,
    trafficFactor: 1,
    conversionFactor: 1,
    speedCapFactor: 1,
    truckShareFactor: 1,
    // The front is how a downpour arrives on the calendar rather than only
    // through the daily segment draw.
    forcesWeather: WEATHER_RAIN,
    minStage: 4,
  },
  {
    id: 'FUEL_SPIKE',
    label: 'Yakıt zammı',
    dailyChance: 0.08,
    startHourMin: 6,
    startHourMax: 10,
    durationHoursMin: 6,
    durationHoursMax: 10,
    trafficFactor: 0.85,
    conversionFactor: 1,
    speedCapFactor: 1,
    truckShareFactor: 2,
    forcesWeather: -1,
    minStage: 4,
  },
]);

/**
 * The spawn-thinning envelope must cover the largest boost any event can
 * apply, or the Lewis–Shedler acceptance test stops being a probability.
 * Asserted against the specs by test, not trusted.
 */
export const MAX_EVENT_TRAFFIC_FACTOR = 3;

/** Draws consumed per event type per day: occur? + start + duration. */
export const EVENT_DRAWS_PER_TYPE = 3;
