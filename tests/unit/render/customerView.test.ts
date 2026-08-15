import { describe, expect, it } from 'vitest';
import {
  ANGRY_THRESHOLD,
  CUSTOMER_POSES,
  directionForCustomer,
  patienceRing,
  poseFor,
  RING_APPEARS_BELOW,
  spriteKeyFor,
} from '@render/views/CustomerView';
import { SPRITE_DIRECTIONS } from '@render/views/VehicleView';
import { Sim } from '@sim/core/Sim';
import { ACTOR_KIND_CUSTOMER } from '@config/actors';
import { TICK_MS } from '@config/simulation';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;

describe('customer sprite selection', () => {
  it('projects the heading into screen space before choosing a direction', () => {
    /*
     * The same trap `VehicleView` documents, and the reason this delegates
     * rather than reimplementing: in 2:1 dimetric, walking east in world space
     * is walking south-east on screen. A separate copy of the table here would
     * be right on the day it was written and would drift the first time either
     * moved.
     */
    expect(directionForCustomer(1, 0)).toBe('se');
    expect(directionForCustomer(0, 1)).toBe('sw');
    expect(directionForCustomer(-1, 0)).toBe('nw');
    expect(directionForCustomer(0, -1)).toBe('ne');
  });

  it('falls back to a real direction for a customer standing still', () => {
    // A stopped person still faces somewhere; a zero heading must not produce
    // an undefined sprite key.
    expect(SPRITE_DIRECTIONS).toContain(directionForCustomer(0, 0));
  });

  it('builds the texture key the pipeline will produce', () => {
    expect(spriteKeyFor('wait', 'se')).toBe('chr_customer_wait_se@2x');
    for (const pose of CUSTOMER_POSES) {
      for (const direction of SPRITE_DIRECTIONS) {
        expect(spriteKeyFor(pose, direction)).toMatch(/^chr_customer_[a-z]+_[a-z]{1,2}@2x$/);
      }
    }
  });

  it('stays inside the character batch budget', () => {
    // ASSET_PIPELINE §13 allows 40 files for the character batch. Four poses
    // times eight directions is 32; a fifth pose would be 40 and leave nothing
    // for the employee, which makes it a change request rather than an edit.
    expect(CUSTOMER_POSES.length * SPRITE_DIRECTIONS.length).toBeLessThanOrEqual(40);
  });
});

describe('pose', () => {
  it('walks when walking, whatever the patience says', () => {
    expect(poseFor(true, 0.9)).toBe('walk');
    expect(poseFor(true, 0.1)).toBe('walk');
  });

  it('waits, then looks angry as the patience runs out', () => {
    expect(poseFor(false, 0.9)).toBe('wait');
    expect(poseFor(false, ANGRY_THRESHOLD + 0.01)).toBe('wait');
    expect(poseFor(false, ANGRY_THRESHOLD - 0.01)).toBe('angry');
  });

  it('idles when there is nothing to wait for', () => {
    expect(poseFor(false, 0)).toBe('idle');
  });
});

describe('the patience ring', () => {
  it('is hidden while a wait is still going well', () => {
    /*
     * A ring over every customer from the moment they arrive is noise, and a
     * player learns to stop seeing it — which is the opposite of what a warning
     * is for.
     */
    expect(patienceRing(1).visible).toBe(false);
    expect(patienceRing(RING_APPEARS_BELOW + 0.001).visible).toBe(false);
    expect(patienceRing(RING_APPEARS_BELOW - 0.001).visible).toBe(true);
  });

  it('empties rather than filling', () => {
    // A filling ring reads as progress towards something good.
    const early = patienceRing(0.6);
    const late = patienceRing(0.2);
    expect(late.sweep).toBeLessThan(early.sweep);
  });

  it('changes band as the wait gets serious', () => {
    expect(patienceRing(0.6).band).toBe('restless');
    expect(patienceRing(0.1).band).toBe('angry');
  });

  it('draws nothing for an actor with no patience at all', () => {
    // Vehicles and scenery share the snapshot; neither has a wait to show.
    expect(patienceRing(0)).toEqual({ sweep: 0, band: 'calm', visible: false });
    expect(patienceRing(-0.5).visible).toBe(false);
  });

  it('never sweeps past a full ring, even on a corrupted fraction', () => {
    expect(patienceRing(5).sweep).toBeLessThanOrEqual(1);
  });
});

describe('what the simulation hands the renderer', () => {
  it('reports a falling patience for a queueing customer and none for a car', () => {
    const sim = new Sim({ seed: 606 });

    let sawCustomerPatience = false;
    let previous = 1;
    for (let tick = 0; tick < TICKS_PER_MINUTE * 15; tick++) {
      sim.tick();
      const view = sim.readView();
      for (let i = 0; i < view.actorCount; i++) {
        const actor = view.actors[i];
        if (actor === undefined) continue;
        if (actor.kind !== ACTOR_KIND_CUSTOMER) {
          // Only people wait. A vehicle carrying a patience fraction would draw
          // a ring over a car.
          expect(actor.patience, 'a non-customer reported patience').toBe(0);
          continue;
        }
        if (actor.patience <= 0 || actor.patience >= 1) continue;
        sawCustomerPatience = true;
        previous = Math.min(previous, actor.patience);
      }
    }

    expect(sawCustomerPatience, 'no customer ever reported a partial patience').toBe(true);
    expect(previous).toBeLessThan(1);
  }, 60_000);

  it('marks a walking customer as moving and a queueing one as not', () => {
    const sim = new Sim({ seed: 909 });
    const seen = new Set<boolean>();
    for (let tick = 0; tick < TICKS_PER_MINUTE * 15; tick++) {
      sim.tick();
      const view = sim.readView();
      for (let i = 0; i < view.actorCount; i++) {
        const actor = view.actors[i];
        if (actor?.kind !== ACTOR_KIND_CUSTOMER) continue;
        seen.add(actor.moving);
      }
    }
    expect(seen.has(true), 'no customer was ever walking').toBe(true);
    expect(seen.has(false), 'no customer was ever standing still').toBe(true);
  }, 60_000);

  it('never shows a customer who is still inside a car', () => {
    // The filter that makes `visible` mean something. A customer riding in to
    // park has a real position, and drawing it puts a person on a car roof.
    const sim = new Sim({ seed: 313 });
    for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
      sim.tick();
      const view = sim.readView();

      let drawn = 0;
      for (let i = 0; i < view.actorCount; i++) {
        if (view.actors[i]?.kind === ACTOR_KIND_CUSTOMER) drawn++;
      }

      let onFoot = 0;
      for (let slot = 0; slot < sim.world.customers.capacity; slot++) {
        if (!sim.world.customers.isActive(slot)) continue;
        if (sim.world.customers.at(slot).visible === 1) onFoot++;
      }

      expect(drawn, `tick ${tick}`).toBe(onFoot);
      expect(view.customerCount).toBeGreaterThanOrEqual(drawn);
    }
  }, 60_000);
});
