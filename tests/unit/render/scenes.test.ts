import { describe, expect, it } from 'vitest';
import { ENTITY_CAPACITY } from '@config/simulation';
import { SCENE_FIXTURES, sceneDemand, sceneFixture } from '@config/scenes';
import { stageScene } from '@app/devScene';
import { Sim } from '@sim/core/Sim';

/**
 * Authored scenes must fit the simulation they are staged into.
 *
 * `stageScene` drops what does not fit, which is the right behaviour at runtime
 * and a silent lie in a measurement: the stress scene claimed 100 actors and was
 * first measured on real hardware with 74, because an even customer/employee
 * split asked for 50 employees from a pool of 24.
 */
describe('scene fixtures', () => {
  it.each(Object.keys(SCENE_FIXTURES))('%s fits the entity pools', (id) => {
    const fixture = sceneFixture(id);
    expect(fixture).not.toBeNull();
    if (fixture === null) return;

    const demand = sceneDemand(fixture);
    expect(demand.customers, `${id} needs too many customers`).toBeLessThanOrEqual(ENTITY_CAPACITY.customers);
    expect(demand.employees, `${id} needs too many employees`).toBeLessThanOrEqual(ENTITY_CAPACITY.employees);
  });

  it.each(Object.keys(SCENE_FIXTURES))('%s stages every actor it declares', (id) => {
    const fixture = sceneFixture(id);
    if (fixture === null) return;

    const sim = new Sim({ seed: 1 });
    const placed = stageScene(sim, id);

    expect(placed, `${id} lost actors during staging`).toBe(fixture.actors.length);
    expect(sim.readView().actorCount).toBe(fixture.actors.length);
  });

  it('the stress scene really is 100 actors', () => {
    // The number the render performance measurement is reported against.
    const stress = sceneFixture('stress');
    expect(stress?.actors).toHaveLength(100);
  });

  it('stages deterministically', () => {
    const a = new Sim({ seed: 5 });
    const b = new Sim({ seed: 5 });
    stageScene(a, 'depth-testcard');
    stageScene(b, 'depth-testcard');
    expect(a.world.hash()).toBe(b.world.hash());
  });

  it('an unknown scene stages nothing rather than throwing', () => {
    const sim = new Sim({ seed: 1 });
    expect(stageScene(sim, 'does-not-exist')).toBe(0);
    expect(sim.readView().actorCount).toBe(0);
  });

  it('every actor kind used by a fixture exists in the catalogue', () => {
    for (const fixture of Object.values(SCENE_FIXTURES)) {
      for (const actor of fixture.actors) {
        expect(actor.kind).toBeGreaterThanOrEqual(0);
        expect(actor.kind).toBeLessThan(6);
      }
    }
  });
});
