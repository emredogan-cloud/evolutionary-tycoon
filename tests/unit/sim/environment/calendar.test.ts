import { describe, expect, it } from 'vitest';
import { Sim } from '@sim/core/Sim';
import { currentWeather } from '@sim/systems/EventSystem';

describe('the boot-frame poisoning — Phase 17 regression', () => {
  it('a pre-plan derivation cannot leak into the planning tick', () => {
    /*
     * The browser's real boot order: the UI bridge samples weather (deriving
     * on the unplanned day and caching it at tick 0), and only then does the
     * first tick plan day 0. The transition tracker must see the PLANNED
     * segment, or the world's digest depends on whether a frame painted —
     * which is exactly the Firefox-only CI mismatch that found this. planDay
     * now ends by invalidating the derivation cache; this test is the browser
     * boot order in miniature.
     */
    const clean = new Sim({ seed: 424242, startPaused: true });
    clean.tick();
    const cleanWeather = clean.world.environment.lastWeather;

    const painted = new Sim({ seed: 424242, startPaused: true });
    currentWeather(painted.world); // the boot frame's read, cache and all
    painted.tick();

    expect(painted.world.environment.lastWeather).toBe(cleanWeather);
    expect(painted.world.hash()).toBe(clean.world.hash());
  });
});
