import { describe, expect, it } from 'vitest';
import { MENU, menuIndexOf, menuItem, PRICE_BAND } from '@config/economy/menu';
import { PASS, PASS_CAPACITY, station, STATIONS } from '@config/economy/stations';

/**
 * The menu and the stations as *data* — ECONOMY_DESIGN §4.
 *
 * Both modules are indexed by position from inside the simulation, and both
 * indices are hashed into the world digest. So the interesting tests here are
 * not "does lemonade cost 3" — a change to that is a balance decision and the
 * test would only make it annoying — but the two structural properties that a
 * balance pass could break by accident: the arrays are append-only, and an index
 * that is not in them fails loudly rather than returning `undefined` and
 * poisoning the arithmetic downstream.
 */
describe('looking things up', () => {
  it('refuses an index that is not on the menu', () => {
    /*
     * `MENU[index]` returns `undefined` for an out-of-range index, and
     * `undefined.basePrice` is a crash three systems away from the cause. This
     * throws at the lookup, naming the index.
     */
    expect(() => menuItem(MENU.length)).toThrow(RangeError);
    expect(() => menuItem(-1)).toThrow(/Unknown menu item/);
  });

  it('refuses an id that is not on the menu', () => {
    expect(() => menuIndexOf('caviar')).toThrow(/Unknown menu item "caviar"/);
  });

  it('round-trips every item between its id and its index', () => {
    for (let index = 0; index < MENU.length; index++) {
      const item = menuItem(index);
      expect(menuIndexOf(item.id)).toBe(index);
    }
  });

  it('refuses a station that does not exist', () => {
    expect(() => station(STATIONS.length)).toThrow(RangeError);
    expect(() => station(-1)).toThrow(/Unknown station/);
  });
});

describe('the shape the simulation depends on', () => {
  it('gives every item a distinct id', () => {
    // Two items sharing an id would make `menuIndexOf` return the first and the
    // second unreachable — a menu item that exists, is priced, and can never be
    // ordered.
    expect(new Set(MENU.map((item) => item.id)).size).toBe(MENU.length);
  });

  it('prices every item above what it costs to make', () => {
    /*
     * Even at the bottom of the price band. A player who discounts to the floor
     * should earn less, not lose money on every sale — that is a difficulty
     * cliff hidden inside a slider, and ECONOMY_DESIGN §4 puts Stage 1 margins
     * at 64-75% precisely so the floor stays profitable.
     */
    for (const item of MENU) {
      const floor = item.basePrice * PRICE_BAND.min;
      expect(floor, `${item.id} at the price floor`).toBeGreaterThan(item.baseCost);
    }
  });

  it('has a station for everything on the menu', () => {
    // An item whose station type is not built is an order that can be placed and
    // never started: the customer waits forever and the pool leaks.
    const built = new Set(STATIONS.map((s) => s.type));
    for (const item of MENU) {
      expect(built, `nothing prepares ${item.id}`).toContain(item.station);
    }
  });

  it('puts the pass within reach of the counter and gives it a real limit', () => {
    // A pass with unlimited space is not a constraint, and the back-pressure
    // that makes hold temperature bite depends on it filling up.
    expect(PASS_CAPACITY).toBeGreaterThan(0);
    expect(PASS_CAPACITY).toBeLessThan(STATIONS.length * 10);
    expect(Number.isFinite(PASS.x) && Number.isFinite(PASS.y)).toBe(true);
  });
});
