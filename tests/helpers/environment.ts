import { WEATHER_CLEAR } from '@config/weather';
import type { World } from '@sim/core/World';

/**
 * Pin day 0 to clear skies and an empty schedule — Phase 15 test helper.
 *
 * Several fixtures predate the calendar and encode income arithmetic that a
 * rainy seed legitimately moves. Their subject is not weather, so they pin it:
 * `plannedDay = 0` makes the first tick skip planning (nothing is drawn from
 * `rng.events`), every segment is CLEAR, and no event is scheduled — which is
 * bit-for-bit the pre-P15 world for the streams those tests measure.
 *
 * Only meaningful before the first tick, and only for runs inside day 0; a
 * test long enough to cross midnight replans there and knows it.
 */
export function forceClearDay(world: World): void {
  world.environment.plannedDay = 0;
  world.environment.weatherSegments.fill(WEATHER_CLEAR);
  world.environment.eventTypes.fill(-1);
  world.environment.eventStartMs.fill(0);
  world.environment.eventEndMs.fill(0);
}
