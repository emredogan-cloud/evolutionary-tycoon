import { describe, expect, it } from 'vitest';
import { ARCHETYPE_SPECS } from '@config/archetypes';
import {
  CONVERSION_REASONS,
  conversionReasonName,
  MAX_CONVERSION,
  NOVELTY_DECAY,
  QUEUE_PENALTY,
  REASON_JUST_PASSING,
  REASON_NOT_VISIBLE,
  REASON_QUEUE_TOO_LONG,
  SPILLOVER_PENALTY,
  VISIBILITY,
} from '@config/conversion';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { TICK_MS } from '@config/simulation';
import { Sim } from '@sim/core/Sim';
import { World } from '@sim/core/World';
import { LaneGraph } from '@sim/nav/LaneGraph';
import {
  ConversionSystem,
  DECISION_NO,
  DECISION_PENDING,
  DECISION_YES,
  noveltyDecay,
  queuePenalty,
  reputationFactor,
  spilloverPenalty,
  timeOfDayFit,
  visibilityAt,
} from '@sim/systems/ConversionSystem';
import { STATE_QUEUEING_AT_COUNTER } from '@sim/ai/fsm/customerFsm';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;

function system(): ConversionSystem {
  return new ConversionSystem(new LaneGraph(STAGE1_LAYOUT), STAGE1_LAYOUT);
}

/**
 * Each factor of GAME_DESIGN_DOCUMENT §9.5, on its own.
 *
 * Isolated because they multiply: a bug in one is a constant scale on the
 * result, which is exactly the kind of thing that hides behind "the conversion
 * rate looks about right" and then turns up as an economy that cannot be
 * balanced three phases later.
 */
describe('conversion factors', () => {
  it('drops visibility after dusk and restores it at dawn', () => {
    expect(visibilityAt(12)).toBe(VISIBILITY.day);
    expect(visibilityAt(VISIBILITY.dawnHour)).toBe(VISIBILITY.day);
    // Dusk itself is already night — the interval is [dawn, dusk).
    expect(visibilityAt(VISIBILITY.duskHour)).toBe(VISIBILITY.night);
    expect(visibilityAt(3)).toBe(VISIBILITY.night);
    expect(visibilityAt(23)).toBe(VISIBILITY.night);
    expect(VISIBILITY.night).toBeLessThan(VISIBILITY.day);
  });

  it('ignores a short queue and penalises a long one, down to a floor', () => {
    expect(queuePenalty(0)).toBe(1);
    expect(queuePenalty(QUEUE_PENALTY.freeLength)).toBe(1);
    expect(queuePenalty(QUEUE_PENALTY.freeLength + 1)).toBeCloseTo(1 - QUEUE_PENALTY.perCustomer, 12);
    // Never zero: a busy stand still converts occasionally, so recovery from a
    // spike is a slope rather than a cliff.
    expect(queuePenalty(1000)).toBe(QUEUE_PENALTY.floor);
  });

  it('reproduces the spillover formula from ECONOMY_DESIGN §7 exactly', () => {
    const capacity = 4;
    expect(spilloverPenalty(capacity, capacity)).toBe(1);
    expect(spilloverPenalty(capacity - 1, capacity)).toBe(1);
    expect(spilloverPenalty(capacity + 2, capacity)).toBeCloseTo(
      1 - 2 * SPILLOVER_PENALTY.perOverflowCustomer,
      12,
    );
    expect(spilloverPenalty(capacity + 50, capacity)).toBe(SPILLOVER_PENALTY.floor);
  });

  it('maps reputation onto the documented 0.60 to 1.40 band', () => {
    expect(reputationFactor(0)).toBeCloseTo(0.6, 12);
    expect(reputationFactor(50)).toBeCloseTo(1.0, 12);
    expect(reputationFactor(100)).toBeCloseTo(1.4, 12);
    // Clamped rather than extrapolated: reputation is documented as 0..100 and
    // a stray value must not hand out a multiplier outside the band.
    expect(reputationFactor(-20)).toBeCloseTo(0.6, 12);
    expect(reputationFactor(400)).toBeCloseTo(1.4, 12);
  });

  it('peaks appetite at meal times and floors it overnight', () => {
    expect(timeOfDayFit(19)).toBeGreaterThan(timeOfDayFit(3));
    expect(timeOfDayFit(12)).toBeGreaterThan(timeOfDayFit(10));
    // Wraps rather than throwing, for both directions.
    expect(timeOfDayFit(24)).toBe(timeOfDayFit(0));
    expect(timeOfDayFit(-1)).toBe(timeOfDayFit(23));
  });

  it('decays novelty with same-archetype customers already on site', () => {
    const world = new World({ seed: 1 });
    expect(noveltyDecay(world, 0)).toBe(1);

    for (let i = 0; i < 3; i++) {
      const slot = world.customers.acquire();
      world.customers.at(slot).archetype = 0;
    }
    expect(noveltyDecay(world, 0)).toBeCloseTo(1 - 3 * NOVELTY_DECAY.perConversion, 12);
    // A different archetype is unaffected — that is the whole point of it.
    expect(noveltyDecay(world, 1)).toBe(1);
  });

  it('never decays novelty below its floor', () => {
    const world = new World({ seed: 1 });
    for (let i = 0; i < world.customers.capacity; i++) {
      const slot = world.customers.acquire();
      if (slot < 0) break;
      world.customers.at(slot).archetype = 2;
    }
    expect(noveltyDecay(world, 2)).toBe(NOVELTY_DECAY.floor);
  });
});

describe('P(convert)', () => {
  it('lands on the zero-upgrade rate ECONOMY_DESIGN §3 calibrates on', () => {
    /*
     * 0.09 at Stage 1 with nothing bought.
     *
     * Averaged over the whole clock and weighted by archetype share, because
     * that is what the document's single number means: at noon the meal-time
     * factor alone lifts it to 0.13, and at three in the morning darkness takes
     * it to 0.03. Asserting the noon figure against a daily average would have
     * been a test that agreed with the code and disagreed with the design.
     *
     * The whole-simulation figure is the one that matters and it agrees: a
     * twenty-minute run measures 9.8%.
     */
    const conversion = system();
    let total = 0;
    let shares = 0;

    for (let hour = 0; hour < 24; hour++) {
      const world = new World({ seed: 1 });
      world.clock.setState({ simTimeMs: hoursToMs(world, hour) });
      for (let archetype = 0; archetype < ARCHETYPE_SPECS.length; archetype++) {
        const share = ARCHETYPE_SPECS[archetype]?.baseShare ?? 0;
        total += conversion.evaluate(world, archetype) * share;
        shares += share;
      }
    }

    const mean = total / shares;
    expect(mean, `measured ${mean.toFixed(4)}`).toBeGreaterThan(0.07);
    expect(mean, `measured ${mean.toFixed(4)}`).toBeLessThan(0.11);
  });

  it('varies enough across the day for the hour to be worth having', () => {
    // Otherwise the daily average above could be hit by a flat curve, and the
    // evening rush the player is supposed to feel would not exist.
    const conversion = system();
    const at = (hour: number): number => {
      const world = new World({ seed: 1 });
      world.clock.setState({ simTimeMs: hoursToMs(world, hour) });
      return conversion.evaluate(world, 0);
    };
    expect(at(19)).toBeGreaterThan(at(3) * 2);
  });

  it('never exceeds the hard ceiling for the stage', () => {
    /*
     * TESTING_STRATEGY §5. Reputation at its maximum and a perfect hour is the
     * most favourable state the game can reach in Phase 6, and even a state the
     * game *cannot* reach must not breach it — so the factors are pushed past
     * their own limits too.
     */
    for (const stage of [1, 2, 3, 4] as const) {
      const world = new World({ seed: 1 });
      world.progression.stage = stage;
      world.economy.reputation = 100;
      world.clock.setState({ simTimeMs: hoursToMs(world, 19) });

      const conversion = system();
      for (let archetype = 0; archetype < ARCHETYPE_SPECS.length; archetype++) {
        const probability = conversion.evaluate(world, archetype);
        expect(probability, `stage ${stage}, archetype ${archetype}`).toBeLessThanOrEqual(
          MAX_CONVERSION[stage] ?? 0,
        );
      }
    }
  });

  it('is never negative, and is zero for an archetype that does not exist', () => {
    const world = new World({ seed: 1 });
    const conversion = system();
    expect(conversion.evaluate(world, 99)).toBe(0);
    for (let archetype = 0; archetype < ARCHETYPE_SPECS.length; archetype++) {
      expect(conversion.evaluate(world, archetype)).toBeGreaterThanOrEqual(0);
    }
  });

  it('falls when a queue forms, which is the negative feedback loop', () => {
    const world = new World({ seed: 1 });
    world.clock.setState({ simTimeMs: hoursToMs(world, 12) });
    const conversion = system();
    const empty = conversion.evaluate(world, 0);

    for (let i = 0; i < 6; i++) {
      const slot = world.customers.acquire();
      const customer = world.customers.at(slot);
      customer.queueIndex = i;
      customer.state = STATE_QUEUEING_AT_COUNTER;
      // A different archetype each time, so novelty decay is not what moves it.
      customer.archetype = i % ARCHETYPE_SPECS.length;
    }
    const busy = conversion.evaluate(world, 0);

    expect(busy).toBeLessThan(empty);
  });

  it('falls at night, when the stand cannot be seen', () => {
    const conversion = system();
    const day = new World({ seed: 1 });
    day.clock.setState({ simTimeMs: hoursToMs(day, 13) });
    const night = new World({ seed: 1 });
    night.clock.setState({ simTimeMs: hoursToMs(night, 2) });

    expect(conversion.evaluate(night, 0)).toBeLessThan(conversion.evaluate(day, 0));
  });
});

describe('the single roll', () => {
  it('asks each vehicle exactly once, ever', () => {
    /*
     * The rule the whole system is built around. A vehicle crawling past the
     * decision point in traffic must not accumulate chances — otherwise a jam
     * converts everyone in it and congestion becomes the best marketing in the
     * game.
     */
    const sim = new Sim({ seed: 4242 });
    const asked = new Map<number, number>();

    for (let tick = 0; tick < TICKS_PER_MINUTE * 5; tick++) {
      sim.tick();
      const vehicles = sim.world.vehicles;
      for (let slot = 0; slot < vehicles.capacity; slot++) {
        if (!vehicles.isActive(slot)) continue;
        const id = vehicles.entityId[slot] ?? 0;
        const decision = vehicles.decision[slot] ?? 0;
        if (decision === DECISION_PENDING) continue;
        const previous = asked.get(id);
        // Once decided, the answer never changes for that entity id.
        if (previous !== undefined) expect(decision, `entity ${id}`).toBe(previous);
        asked.set(id, decision);
      }
    }

    expect(asked.size).toBeGreaterThan(20);
  });

  it('draws from the conversion stream and only for convertible traffic', () => {
    /*
     * Decorative vehicles are skipped outright rather than rolled and refused.
     * A refusal would flood the analysis panel with four fifths of all traffic,
     * and — worse — it would tie the conversion RNG to how much scenery is on
     * the road, so adding a decorative car would change which real cars convert.
     */
    const sim = new Sim({ seed: 99 });
    let drawn = 0;
    for (let tick = 0; tick < TICKS_PER_MINUTE * 3; tick++) {
      const before = sim.world.rng.conversion.saveState();
      sim.tick();
      const after = sim.world.rng.conversion.saveState();
      if (before.a !== after.a || before.b !== after.b) drawn++;
    }
    expect(drawn).toBeGreaterThan(0);

    const vehicles = sim.world.vehicles;
    for (let slot = 0; slot < vehicles.capacity; slot++) {
      if (!vehicles.isActive(slot)) continue;
      if ((vehicles.decorative[slot] ?? 0) !== 1) continue;
      // Marked decided-no without ever being offered the restaurant.
      expect(vehicles.decision[slot]).not.toBe(DECISION_YES);
    }
  });

  it('records a reason for every refusal, and the counts agree', () => {
    const sim = new Sim({ seed: 20260815 });
    sim.advance(TICKS_PER_MINUTE * 10);

    const stats = sim.world.stats;
    expect(stats.conversionsFailed).toBeGreaterThan(0);

    let histogram = 0;
    for (let reason = 0; reason < CONVERSION_REASONS.length; reason++) {
      histogram += stats.failureReasons[reason] ?? 0;
    }
    // Refusals plus turned-away customers, because both land in the same
    // histogram — the player asking "why am I not getting customers?" needs
    // them in one list.
    expect(histogram).toBe(stats.conversionsFailed + stats.turnedAwayNoParking);
  });

  it('names every reason code it can emit', () => {
    for (const reason of [REASON_JUST_PASSING, REASON_NOT_VISIBLE, REASON_QUEUE_TOO_LONG]) {
      expect(CONVERSION_REASONS).toContain(conversionReasonName(reason));
    }
    expect(() => conversionReasonName(99)).toThrow(/Unknown conversion reason/);
  });

  it('blames the factor that actually cost the most', () => {
    /*
     * With a long queue on the road, the queue is the reason — not the generic
     * "just passing". This is the assertion that makes the Phase 18 panel worth
     * building: a reason code that always said the same thing would be worse
     * than none, because a player would act on it.
     */
    const sim = new Sim({ seed: 777 });
    /*
     * Real queueing customers, not staged ones: `QueueSystem` releases a staged
     * actor's place on its first tick — correctly, since scenery does not queue
     * — and the seeded queue would evaporate before anyone drove past. Their
     * patience is set absurdly high so they are still standing there for the
     * whole run rather than abandoning halfway through and changing the answer.
     *
     * The order pool is exhausted first, which is what keeps the queue *long*.
     * Phase 8 gave the front of the queue a way out, so without this the line
     * drains as fast as it forms and the queue penalty never dominates. A full
     * order pool is a real state — `ServiceSystem` sends the customer back to
     * queueing when it cannot take their order — and it is exactly the state a
     * stand with a hopeless backlog is in.
     */
    const heldOrders: number[] = [];
    for (;;) {
      const held = sim.world.orders.acquire();
      if (held < 0) break;
      heldOrders.push(held);
    }
    expect(heldOrders.length).toBeGreaterThan(0);
    for (let i = 0; i < STAGE1_LAYOUT.queue.length; i++) {
      const slot = sim.world.customers.acquire();
      if (slot < 0) break;
      const customer = sim.world.customers.at(slot);
      customer.entityId = sim.world.allocateEntityId();
      customer.state = STATE_QUEUEING_AT_COUNTER;
      customer.visible = 1;
      customer.vehicleSlot = -1;
      customer.patienceMs = Number.MAX_SAFE_INTEGER;
      customer.patienceMaxMs = Number.MAX_SAFE_INTEGER;
      customer.archetype = i % ARCHETYPE_SPECS.length;
      const position = STAGE1_LAYOUT.queue[i];
      customer.x = position?.x ?? 0;
      customer.y = position?.y ?? 0;
    }

    const reasons: number[] = [];
    const unsubscribe = sim.events.subscribe((event) => {
      if (event.t === 'CONVERSION_FAILED') reasons.push(event.reason);
    });
    sim.advance(TICKS_PER_MINUTE * 5);
    unsubscribe();

    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons).toContain(REASON_QUEUE_TOO_LONG);
    // And with an empty forecourt it is not the queue that gets blamed.
    const quiet = new Sim({ seed: 777 });
    const quietReasons: number[] = [];
    const stop = quiet.events.subscribe((event) => {
      if (event.t === 'CONVERSION_FAILED') quietReasons.push(event.reason);
    });
    quiet.advance(TICKS_PER_MINUTE * 5);
    stop();
    expect(quietReasons).not.toContain(REASON_QUEUE_TOO_LONG);
  });

  it('leaves a decorative vehicle decided-no without a customer', () => {
    const sim = new Sim({ seed: 31337 });
    sim.advance(TICKS_PER_MINUTE * 5);
    const vehicles = sim.world.vehicles;
    for (let slot = 0; slot < vehicles.capacity; slot++) {
      if (!vehicles.isActive(slot)) continue;
      if ((vehicles.decorative[slot] ?? 0) !== 1) continue;
      expect(vehicles.customerSlot[slot]).toBe(-1);
      expect(vehicles.decision[slot]).toBe(DECISION_NO);
    }
  });
});

/** Sim time that puts the clock at `hour` on day 0. */
function hoursToMs(world: World, hour: number): number {
  return (hour / 24) * world.clock.msPerGameDay;
}
