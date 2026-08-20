import { EVENT_SPECS } from '@config/events';
import { MS_PER_GAME_DAY } from '@config/simulation';
import {
  WEATHER_CLEAR,
  WEATHER_EFFECTS_MIN_STAGE,
  WEATHER_PERSISTENCE,
  WEATHER_SEGMENTS_PER_DAY,
  WEATHER_STATES,
} from '@config/weather';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import type { EnvironmentDerived } from '../core/types';
import { at } from '../math/typedArray';

/**
 * The deterministic calendar — GAME_EXECUTION_ROADMAP Phase 15, GDD §9.6.
 *
 * Slot 2 of the eighteen, reserved for exactly this since Phase 2. Once per
 * game day it draws the day's weather segments and event schedule from
 * `rng.events`; every tick after that it only *derives*: which weather holds,
 * which event is active, what they multiply. Deriving rather than storing is
 * what makes the current state impossible to desynchronise from the plan —
 * there is nothing to update, so nothing can be stale.
 *
 * ## The determinism argument, in one paragraph
 *
 * Planning consumes a **fixed number of draws** per day: two per weather
 * segment (persist? which?) and three per event type (occur? start, duration),
 * drawn in declaration order, unconditionally — a skipped event still consumes
 * its three, exactly like the spawn system's unconditional five. So the stream
 * position after planning day N is a function of N alone, and the calendar for
 * (seed, day) is one answer wherever and whenever it is computed. The suite
 * pins this.
 *
 * Stage gating happens at *activation*, not planning: §9.6 scopes events to
 * Stage 4, but a plan that depended on the stage would consume differently per
 * playthrough. The schedule always exists; whether the world qualifies is
 * checked the moment it would begin.
 */

/** Segment length in sim ms. */
const SEGMENT_MS = MS_PER_GAME_DAY / WEATHER_SEGMENTS_PER_DAY;

/*
 * Per-tick derivation cache — measured into existence. The helpers below are
 * pure derivations, and the first wiring recomputed them at every consumer:
 * per spawn candidate (which the widened festival envelope tripled), per
 * conversion decision, per motion tick — priced by the bench gate at +47% on
 * an empty-world tick. The cache lives on the world (EnvironmentDerived's
 * comment carries the exclusion argument); tests that mutate the schedule
 * mid-tick bypass it with `invalidateEnvironmentCache`.
 */
function derive(world: World): EnvironmentDerived {
  const cache = world.environmentDerived;
  if (cache.tick === world.tick) return cache;

  const activeSlot = computeActiveEventSlot(world);
  const weather = computeCurrentWeather(world, activeSlot);
  const event = activeSlot >= 0 ? EVENT_SPECS[at(world.environment.eventTypes, activeSlot)] : undefined;
  const bites = world.progression.stage >= WEATHER_EFFECTS_MIN_STAGE;
  const weatherState = bites ? WEATHER_STATES[weather] : undefined;

  cache.tick = world.tick;
  cache.activeSlot = activeSlot;
  cache.weather = weather;
  cache.trafficFactor = (weatherState?.trafficFactor ?? 1) * (event?.trafficFactor ?? 1);
  cache.conversionFactor = (weatherState?.conversionFactor ?? 1) * (event?.conversionFactor ?? 1);
  cache.speedCap = event?.speedCapFactor ?? 1;
  cache.seatedBias = bites ? (WEATHER_STATES[weather]?.seatedBias ?? 0) : 0;
  cache.truckShareFactor = event?.truckShareFactor ?? 1;
  return cache;
}

/** Tests that edit the schedule mid-tick call this before re-reading. */
export function invalidateEnvironmentCache(world: World): void {
  world.environmentDerived.tick = -1;
}

export class EventSystem implements SimSystem {
  readonly name = 'EventSystem' as const;

  run(world: World): void {
    const day = world.clock.gameDay;
    if (world.environment.plannedDay !== day) planDay(world, day);

    // One derivation, shared by both transition checks — this slot is on the
    // per-tick hot path and each helper call walks the cache lookup.
    const now = derive(world);

    if (now.weather !== world.environment.lastWeather) {
      world.environment.lastWeather = now.weather;
      world.eventQueue.emitWeatherChanged(now.weather);
    }

    const last = world.environment.lastActiveEvent;
    if (now.activeSlot !== last) {
      if (last >= 0) {
        world.eventQueue.emitRoadEventEnded(at(world.environment.eventTypes, last));
      }
      if (now.activeSlot >= 0) {
        world.eventQueue.emitRoadEventStarted(
          at(world.environment.eventTypes, now.activeSlot),
          at(world.environment.eventEndMs, now.activeSlot),
        );
      }
      world.environment.lastActiveEvent = now.activeSlot;
    }
  }
}

/** Draw the day. Fixed draw count; see the class comment. */
export function planDay(world: World, day: number): void {
  const env = world.environment;
  const rng = world.rng.events;
  const dayStartMs = day * MS_PER_GAME_DAY;

  let previous =
    day === 0 ? WEATHER_CLEAR : (env.weatherSegments[WEATHER_SEGMENTS_PER_DAY - 1] ?? WEATHER_CLEAR);
  for (let segment = 0; segment < WEATHER_SEGMENTS_PER_DAY; segment++) {
    const persistRoll = rng.next();
    const stateRoll = rng.next();
    if (persistRoll < WEATHER_PERSISTENCE) {
      env.weatherSegments[segment] = previous;
    } else {
      env.weatherSegments[segment] = drawWeather(stateRoll);
    }
    previous = at(env.weatherSegments, segment);
  }

  for (let type = 0; type < EVENT_SPECS.length; type++) {
    const spec = EVENT_SPECS[type];
    const occurRoll = rng.next();
    const startRoll = rng.next();
    const durationRoll = rng.next();
    if (spec === undefined) continue;

    if (occurRoll < spec.dailyChance) {
      const startHour = spec.startHourMin + startRoll * (spec.startHourMax - spec.startHourMin);
      const hours = spec.durationHoursMin + durationRoll * (spec.durationHoursMax - spec.durationHoursMin);
      env.eventTypes[type] = type;
      env.eventStartMs[type] = dayStartMs + (startHour / 24) * MS_PER_GAME_DAY;
      env.eventEndMs[type] = at(env.eventStartMs, type) + (hours / 24) * MS_PER_GAME_DAY;
    } else {
      env.eventTypes[type] = -1;
      env.eventStartMs[type] = 0;
      env.eventEndMs[type] = 0;
    }
  }

  env.plannedDay = day;
}

/** Weighted pick over WEATHER_STATES. */
function drawWeather(roll: number): number {
  let total = 0;
  for (const state of WEATHER_STATES) total += state.weight;
  let cursor = roll * total;
  for (let i = 0; i < WEATHER_STATES.length; i++) {
    cursor -= WEATHER_STATES[i]?.weight ?? 0;
    if (cursor <= 0) return i;
  }
  return WEATHER_STATES.length - 1;
}

/**
 * The event in force right now, as a slot index, or -1.
 *
 * Earliest start wins when windows overlap — a deterministic tiebreak that
 * also reads correctly on screen: the thing that began first is the thing
 * that is happening.
 */
export function activeEventSlot(world: World): number {
  return derive(world).activeSlot;
}

function computeActiveEventSlot(world: World): number {
  const env = world.environment;
  const now = world.clock.simTimeMs;
  const stage = world.progression.stage;

  let best = -1;
  let bestStart = Number.POSITIVE_INFINITY;
  for (let slot = 0; slot < env.eventTypes.length; slot++) {
    const type = at(env.eventTypes, slot);
    if (type < 0) continue;
    const spec = EVENT_SPECS[type];
    if (spec === undefined || stage < spec.minStage) continue;
    const start = at(env.eventStartMs, slot);
    if (now < start || now >= at(env.eventEndMs, slot)) continue;
    if (start < bestStart) {
      bestStart = start;
      best = slot;
    }
  }
  return best;
}

/** The weather in force: a forcing event first, the segment plan otherwise. */
export function currentWeather(world: World): number {
  return derive(world).weather;
}

function computeCurrentWeather(world: World, activeSlot: number): number {
  if (activeSlot >= 0) {
    const spec = EVENT_SPECS[at(world.environment.eventTypes, activeSlot)];
    if (spec !== undefined && spec.forcesWeather >= 0) return spec.forcesWeather;
  }
  const withinDay = world.clock.simTimeMs - world.clock.gameDay * MS_PER_GAME_DAY;
  const segment = Math.min(WEATHER_SEGMENTS_PER_DAY - 1, Math.floor(withinDay / SEGMENT_MS));
  return at(world.environment.weatherSegments, segment);
}

// ── What the rest of the simulation consumes ───────────────────────────────

/*
 * Weather's simulation half applies from WEATHER_EFFECTS_MIN_STAGE — GDD §9.6
 * places it inside the Stage 4 event package (see the config's own comment
 * and the measurement in it). The sky is drawn at every stage regardless; the
 * gating itself lives in `derive`.
 */

/** Multiplies spawn intensity: weather × event. */
export function environmentTrafficFactor(world: World): number {
  return derive(world).trafficFactor;
}

/** The §9.5 slot-8 factor: weather × event. */
export function environmentConversionFactor(world: World): number {
  return derive(world).conversionFactor;
}

/** Desired-speed cap while road work or an accident holds. 1 = none. */
export function environmentSpeedCap(world: World): number {
  return derive(world).speedCap;
}

/** Extra share of arrivals that choose the counter over the drive-thru. */
export function environmentSeatedBias(world: World): number {
  return derive(world).seatedBias;
}

/** TRUCK_LONGHAUL share multiplier — the night rush and the fuel spike. */
export function environmentTruckShareFactor(world: World): number {
  return derive(world).truckShareFactor;
}
