import { describe, expect, it } from 'vitest';
import { menuIndexOf, menuItem } from '@config/economy/menu';
import { PASS_CAPACITY, station, STATIONS } from '@config/economy/stations';
import { TICK_MS } from '@config/simulation';
import { Sim } from '@sim/core/Sim';
import { nextStartable, passLoad, startPrep, stationsAllBusy } from '@sim/systems/KitchenSystem';
import { ORDER_COOKING, ORDER_ON_PASS, ORDER_PLACED, orderStateName } from '@sim/stores/OrderStore';

/** An order sitting in the pool, placed now, ready to be started. */
function placeOrder(sim: Sim, itemId: string, customerSlot = -1): number {
  const slot = sim.world.orders.acquire();
  if (slot < 0) throw new Error('order pool exhausted');
  const order = sim.world.orders.at(slot);
  order.entityId = sim.world.allocateEntityId();
  order.customerSlot = customerSlot;
  order.item = menuIndexOf(itemId);
  order.state = ORDER_PLACED;
  order.orderedAtMs = sim.world.clock.simTimeMs;
  order.price = menuItem(order.item).basePrice;
  return slot;
}

describe('station reservation', () => {
  it('gives an order a station of the right type', () => {
    const sim = new Sim({ seed: 1 });
    const slot = placeOrder(sim, 'hotdog');

    expect(startPrep(sim.world, slot)).toBe(true);
    const order = sim.world.orders.at(slot);
    expect(orderStateName(order.state)).toBe('COOKING');
    expect(station(order.station).type).toBe('GRILL');
  });

  it('refuses a second order at the same station', () => {
    /*
     * ECONOMY_DESIGN §7 (Fren 3): stations are one of the finite things that let
     * capacity cut demand. It is also what makes a second prep station a real
     * purchase in Phase 9 rather than a cosmetic one, so the refusal is the
     * feature.
     */
    const sim = new Sim({ seed: 1 });
    const first = placeOrder(sim, 'hotdog');
    const second = placeOrder(sim, 'hotdog');

    expect(startPrep(sim.world, first)).toBe(true);
    expect(startPrep(sim.world, second)).toBe(false);
    expect(orderStateName(sim.world.orders.at(second).state)).toBe('PLACED');
  });

  it('lets a different station work at the same time', () => {
    // The grill being busy must not stop the drinks. Otherwise "one order at a
    // time" would mean one order in the whole kitchen.
    const sim = new Sim({ seed: 1 });
    expect(startPrep(sim.world, placeOrder(sim, 'hotdog'))).toBe(true);
    expect(startPrep(sim.world, placeOrder(sim, 'lemonade'))).toBe(true);
    expect(startPrep(sim.world, placeOrder(sim, 'chips'))).toBe(true);
    expect(stationsAllBusy(sim.world)).toBe(true);
  });

  it('frees the station when the plate reaches the pass', () => {
    const sim = new Sim({ seed: 1 });
    const first = placeOrder(sim, 'chips');
    const second = placeOrder(sim, 'chips');
    startPrep(sim.world, first);

    // Chips take a second; run long enough for it to finish.
    sim.advance(Math.ceil(menuItem(menuIndexOf('chips')).prepTimeMs / TICK_MS) + 2);

    expect(orderStateName(sim.world.orders.at(first).state)).toBe('ON_PASS');
    expect(startPrep(sim.world, second), 'the station stayed reserved').toBe(true);
  });

  it('takes the oldest startable order first', () => {
    /*
     * FIFO. Anything cleverer — shortest job first, highest margin first —
     * optimises throughput and makes the player's experience worse: they would
     * watch a customer be skipped with no way to see why.
     */
    const sim = new Sim({ seed: 1 });
    const early = placeOrder(sim, 'hotdog');
    sim.advance(20);
    const late = placeOrder(sim, 'hotdog');

    expect(nextStartable(sim.world)).toBe(early);
    startPrep(sim.world, early);
    // The grill is busy now, so the later hot dog is not startable at all.
    expect(nextStartable(sim.world)).toBe(-1);
    void late;
  });

  it('skips an order whose station is busy in favour of one whose is not', () => {
    const sim = new Sim({ seed: 1 });
    const grillOne = placeOrder(sim, 'hotdog');
    sim.advance(5);
    const grillTwo = placeOrder(sim, 'hotdog');
    sim.advance(5);
    const drink = placeOrder(sim, 'lemonade');

    startPrep(sim.world, grillOne);
    // `grillTwo` is older but has nowhere to go; the drink does.
    expect(nextStartable(sim.world)).toBe(drink);
    void grillTwo;
  });
});

describe('preparation timing', () => {
  it('takes exactly the configured time', () => {
    const sim = new Sim({ seed: 1 });
    const slot = placeOrder(sim, 'hotdog');
    startPrep(sim.world, slot);

    const ticks = Math.floor(menuItem(menuIndexOf('hotdog')).prepTimeMs / TICK_MS);
    sim.advance(ticks - 1);
    expect(orderStateName(sim.world.orders.at(slot).state)).toBe('COOKING');
    sim.advance(2);
    expect(orderStateName(sim.world.orders.at(slot).state)).toBe('ON_PASS');
  });

  it('reads the duration from config rather than a literal', () => {
    // Two items with different prep times must take different amounts of time.
    // A hard-coded duration passes every other test in this file.
    const fast = new Sim({ seed: 1 });
    const slow = new Sim({ seed: 1 });
    const fastSlot = placeOrder(fast, 'chips');
    const slowSlot = placeOrder(slow, 'hotdog');
    startPrep(fast.world, fastSlot);
    startPrep(slow.world, slowSlot);

    const ticks = Math.ceil(menuItem(menuIndexOf('chips')).prepTimeMs / TICK_MS) + 1;
    fast.advance(ticks);
    slow.advance(ticks);

    expect(orderStateName(fast.world.orders.at(fastSlot).state)).toBe('ON_PASS');
    expect(orderStateName(slow.world.orders.at(slowSlot).state)).toBe('COOKING');
  });

  it('finishes at the same simulated moment whatever the tick size', () => {
    /*
     * The finish time is derived from `startedAtMs`, not counted down by
     * `deltaMs`. A countdown makes the result depend on how the tick was
     * subdivided, and the game runs at 1x, 2x and 4x.
     */
    const sim = new Sim({ seed: 1 });
    const slot = placeOrder(sim, 'lemonade');
    startPrep(sim.world, slot);
    const started = sim.world.orders.at(slot).startedAtMs;

    sim.advance(Math.ceil(menuItem(menuIndexOf('lemonade')).prepTimeMs / TICK_MS) + 1);
    const order = sim.world.orders.at(slot);
    expect(order.readyAtMs - started).toBeCloseTo(menuItem(order.item).prepTimeMs, 6);
  });
});

describe('the E9 exploit — clicking faster', () => {
  it('does not shorten preparation, however many times it is clicked', () => {
    /*
     * ECONOMY_DESIGN §14, exploit E9. The command *starts* preparation and
     * nothing else; the finish time comes from the start time and the config, so
     * a second click on a cooking order is a no-op.
     *
     * This is the test the roadmap asks for by name, and it is written as a race
     * between two identical worlds rather than as an assertion about the shape
     * of the code — a future implementation that decremented a counter would
     * pass a structural check and fail this.
     */
    const patient = new Sim({ seed: 1 });
    const impatient = new Sim({ seed: 1 });
    const patientSlot = placeOrder(patient, 'hotdog');
    const impatientSlot = placeOrder(impatient, 'hotdog');

    patient.dispatch({ t: 'MANUAL_PREP', orderSlot: patientSlot });
    patient.tick();

    impatient.dispatch({ t: 'MANUAL_PREP', orderSlot: impatientSlot });
    impatient.tick();

    const ticks = Math.ceil(menuItem(menuIndexOf('hotdog')).prepTimeMs / TICK_MS);
    for (let i = 0; i < ticks + 2; i++) {
      // Twenty clicks a tick, which is faster than any human and faster than an
      // autoclicker at 60 Hz.
      for (let click = 0; click < 20; click++) {
        impatient.dispatch({ t: 'MANUAL_PREP', orderSlot: impatientSlot });
      }
      impatient.tick();
      patient.tick();
    }

    const spammed = impatient.world.orders.at(impatientSlot);
    const calm = patient.world.orders.at(patientSlot);
    expect(orderStateName(spammed.state)).toBe('ON_PASS');
    expect(spammed.readyAtMs, 'clicking faster made it ready sooner').toBe(calm.readyAtMs);
  });

  it('does not restart a cooking order and lose its progress', () => {
    // The other direction of the same bug: a second click that *reset* the timer
    // would make clicking actively harmful, which is just as wrong.
    const sim = new Sim({ seed: 1 });
    const slot = placeOrder(sim, 'hotdog');
    sim.dispatch({ t: 'MANUAL_PREP', orderSlot: slot });
    sim.tick();
    const startedAt = sim.world.orders.at(slot).startedAtMs;
    const station0 = sim.world.orders.at(slot).station;

    sim.advance(40);
    sim.dispatch({ t: 'MANUAL_PREP', orderSlot: slot });
    sim.tick();

    expect(sim.world.orders.at(slot).startedAtMs).toBe(startedAt);
    expect(sim.world.orders.at(slot).station).toBe(station0);
  });

  it('starts the next order when clicked without naming one', () => {
    // What a click on the station means. It must still refuse when there is
    // nothing startable, rather than throwing on a mistimed click.
    const sim = new Sim({ seed: 1 });
    const slot = placeOrder(sim, 'chips');

    sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
    sim.tick();
    expect(sim.world.orders.at(slot).state).toBe(ORDER_COOKING);

    expect(() => {
      sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      sim.tick();
    }).not.toThrow();
  });

  it('ignores a click on an order that does not exist', () => {
    const sim = new Sim({ seed: 1 });
    expect(() => {
      sim.dispatch({ t: 'MANUAL_PREP', orderSlot: 99 });
      sim.tick();
    }).not.toThrow();
  });
});

describe('the pass', () => {
  it('blocks the kitchen when it is full', () => {
    /*
     * Back-pressure, and the reason it matters: without it, cooking everything
     * the instant it is ordered would be free and hold temperature — the whole
     * mechanic that punishes "many cooks, too few waiters" — would never bite.
     */
    const sim = new Sim({ seed: 1 });
    const chips = menuIndexOf('chips');

    // Fill the pass by hand, then try to finish one more.
    for (let i = 0; i < PASS_CAPACITY; i++) {
      const slot = sim.world.orders.acquire();
      const order = sim.world.orders.at(slot);
      order.entityId = sim.world.allocateEntityId();
      order.item = chips;
      order.state = ORDER_ON_PASS;
      order.readyAtMs = sim.world.clock.simTimeMs;
    }
    expect(passLoad(sim.world)).toBe(PASS_CAPACITY);

    const blocked = placeOrder(sim, 'chips');
    startPrep(sim.world, blocked);
    sim.advance(Math.ceil(menuItem(chips).prepTimeMs / TICK_MS) + 5);

    // Still cooking, and still holding its station — which is the point.
    expect(orderStateName(sim.world.orders.at(blocked).state)).toBe('COOKING');
    expect(sim.world.orders.at(blocked).station).toBeGreaterThanOrEqual(0);
  });

  it('releases the kitchen as soon as the pass clears', () => {
    const sim = new Sim({ seed: 1 });
    const chips = menuIndexOf('chips');
    const held: number[] = [];
    for (let i = 0; i < PASS_CAPACITY; i++) {
      const slot = sim.world.orders.acquire();
      const order = sim.world.orders.at(slot);
      order.entityId = sim.world.allocateEntityId();
      order.item = chips;
      order.state = ORDER_ON_PASS;
      held.push(slot);
    }

    const blocked = placeOrder(sim, 'chips');
    startPrep(sim.world, blocked);
    sim.advance(Math.ceil(menuItem(chips).prepTimeMs / TICK_MS) + 5);
    expect(orderStateName(sim.world.orders.at(blocked).state)).toBe('COOKING');

    sim.world.orders.release(held[0] ?? 0);
    sim.advance(2);
    expect(orderStateName(sim.world.orders.at(blocked).state)).toBe('ON_PASS');
  });

  it('never holds more plates than it has room for', () => {
    const sim = new Sim({ seed: 20260815 });
    for (let tick = 0; tick < 20 * 60 * 20; tick++) {
      sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      sim.tick();
      expect(passLoad(sim.world), `tick ${String(tick)}`).toBeLessThanOrEqual(PASS_CAPACITY);
    }
  }, 60_000);
});

describe('the stations themselves', () => {
  it('has one of each type the Stage 1 menu needs', () => {
    // Deliberately not two of anything: the first thing a player feels in Phase
    // 9 is buying a second prep station, and that only exists if the first one
    // is a genuine bottleneck now.
    const types = STATIONS.map((entry) => entry.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types).toContain('DRINK');
    expect(types).toContain('GRILL');
    expect(types).toContain('PREP');
  });

  it('has a station for every Stage 1 item', () => {
    // An item with nowhere to be made can be ordered and never prepared, which
    // is a deadlock that looks like a slow kitchen.
    const available = new Set(STATIONS.map((entry) => entry.type));
    for (const item of [menuIndexOf('lemonade'), menuIndexOf('hotdog'), menuIndexOf('chips')]) {
      expect(available, menuItem(item).id).toContain(menuItem(item).station);
    }
  });
});
