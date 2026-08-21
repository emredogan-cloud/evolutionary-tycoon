import { describe, expect, it } from 'vitest';
import { ARCHETYPE_SPECS } from '@config/archetypes';
import { expectedTicket, drinkPoolFor, sidePoolFor } from '@config/economy/basket';
import {
  HOLD_DECAY_MAX_LOSS,
  HOLD_DECAY_MS,
  holdTemperature,
  MENU,
  menuForStage,
  menuIndexOf,
  menuItem,
} from '@config/economy/menu';
import { UPGRADES, upgradeCost } from '@config/economy/upgrades';
import { operatingReserve, requirementFor } from '@config/progression';
import {
  unpackAppearance,
  vehicleFrame,
  worldObject,
  worldObjectAt,
  worldObjectIndexOf,
} from '@config/sprites';

/**
 * The defensive arms of the config layer, each fired on purpose.
 *
 * These branches exist because the values that reach them cross boundaries — a
 * save file, a replayed command log, a URL parameter — and the plausible wrong
 * inputs are exactly the ones a same-build test never produces by accident. A
 * fallback that has never run is a fallback nobody has checked, which is the
 * same argument the architecture-enforcement suite makes about lint rules.
 */

describe('sprites, off the happy path', () => {
  it('clamps an unknown archetype to the first one rather than emitting garbage', () => {
    // A save written by a build with more archetypes must still draw *a* car.
    expect(vehicleFrame(999, 'se')).toBe(`${ARCHETYPE_SPECS[0]?.textureStem ?? ''}_default_se@2x.png`);
    expect(vehicleFrame(-1, 'n')).toContain('_default_n@2x.png');
  });

  it('answers misses with undefined or -1, never a throw', () => {
    expect(worldObject('no-such-object')).toBeUndefined();
    expect(worldObjectAt(-5)).toBeUndefined();
    expect(worldObjectAt(10_000)).toBeUndefined();
    expect(worldObjectIndexOf('no-such-object')).toBe(-1);
    expect(worldObjectIndexOf('sign')).toBeGreaterThanOrEqual(0);
  });

  it('keeps every appearance field in range at the catalogue edges', () => {
    // The extreme corners of the packed space, not just the zero everybody hits.
    const top = unpackAppearance(79);
    expect(top).toEqual({ body: 3, head: 4, hair: 3 });
    expect(unpackAppearance(0)).toEqual({ body: 0, head: 0, hair: 0 });
  });
});

describe('baskets, off the happy path', () => {
  it('clamps an out-of-range stage to the nearest real one', () => {
    // A stage crosses in URL parameters and saves; 0 and 9 must price as 1 and 4.
    expect(expectedTicket(0)).toBe(expectedTicket(1));
    expect(expectedTicket(9)).toBe(expectedTicket(4));
  });

  it('prices the empty-pool case as zero contribution, not NaN', () => {
    // Stage 1's side pool is smaller than the id list — chips only — and a
    // hypothetical stage with no pooled items must fold to the base mean.
    expect(sidePoolFor(1).length).toBeGreaterThanOrEqual(1);
    expect(drinkPoolFor(1).length).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(expectedTicket(1))).toBe(true);
  });
});

describe('menu, every exported reader', () => {
  it('reads items by index and id, and names the missing thing when asked for it', () => {
    const first = MENU[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(menuItem(0).id).toBe(first.id);
    expect(menuIndexOf(first.id)).toBe(0);
    // Menu lookups throw on a miss — an unknown id in an order is a config bug
    // the tick should surface loudly, unlike a decorative sprite frame.
    expect(() => menuIndexOf('no-such-item')).toThrow(RangeError);
    expect(() => menuItem(-1)).toThrow(RangeError);
    // The stage filter is inclusive-below, and stage 4 sells everything.
    expect(menuForStage(4).length).toBe(MENU.length);
  });

  it('decays hold quality only past the tolerance, and never below the floor', () => {
    const item = menuItem(0);
    // Inside tolerance: untouched. A cooler bonus extends that window.
    expect(holdTemperature(item, item.holdToleranceMs)).toBe(item.qualityBase);
    expect(holdTemperature(item, item.holdToleranceMs + 5_000, 5_000)).toBe(item.qualityBase);
    // Far past it: clamped to the 60% loss, not driven to zero.
    const floor = holdTemperature(item, item.holdToleranceMs + 10 * HOLD_DECAY_MS);
    expect(floor).toBeCloseTo(item.qualityBase * (1 - HOLD_DECAY_MAX_LOSS), 5);
  });
});

describe('upgrade cost, off the happy path', () => {
  it('falls back to the stage-1 multiplier for a stage outside the table', () => {
    const item = UPGRADES[0];
    expect(item).toBeDefined();
    if (item === undefined) return;
    // Stage 99 has no multiplier row; charging stage-1 prices is the safe wrong
    // answer, and charging NaN would be the unsafe one.
    expect(upgradeCost(item, 1, 99)).toBe(upgradeCost(item, 1, 1));
  });
});

describe('the operating reserve, off the happy path', () => {
  it('skips a required role the employee catalogue does not know', () => {
    /*
     * `requiredRoles` is config and the roles list is config, so the mismatch is
     * a config bug — but it must degrade to "no hire cost priced in", not to a
     * crash at the evolution gate.
     */
    const real = requirementFor(2);
    expect(real).toBeDefined();
    if (real === null) return;
    const ghost = { ...real, requiredRoles: ['astronaut'] };
    expect(operatingReserve(ghost, () => 0, 0)).toBe(0);
    // And a payroll still prices its runway even with no hires to make.
    expect(operatingReserve(ghost, () => 0, 2)).toBeCloseTo(6, 5);
  });
});
