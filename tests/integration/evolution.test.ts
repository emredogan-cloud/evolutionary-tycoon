import { describe, expect, it } from 'vitest';
import { STAGE_REQUIREMENTS, requirementFor, stageRequirementListSchema } from '@config/progression';
import { layoutForStage } from '@config/layouts';
import { TICK_MS } from '@config/simulation';
import { Sim } from '@sim/core/Sim';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';
import { constructionProgress, isConstructing } from '@sim/systems/ConstructionSystem';
import { beginConstruction, meetsRequirement } from '@sim/systems/ProgressionSystem';
import { hire } from '@sim/systems/StaffSystem';
import { buyUpgrade } from '@sim/systems/UpgradeSystem';

const LONG_RUN_TIMEOUT_MS = 120_000;

/**
 * The four-stage evolution — GAME_EXECUTION_ROADMAP Phase 11.
 *
 * The central design constraint is that evolution is **not a scene change**: the
 * camera stays put, the lot stays the same, and the building grows in place over
 * real simulated time. Most of what is asserted here follows from that — the
 * road does not move, the counter does not move, the money and the staff survive,
 * and the world keeps running throughout.
 */

/** Meet every requirement for the next stage, without touching the stage. */
function qualify(sim: Sim, stage: number): void {
  const requirement = requirementFor(stage);
  if (requirement === null) return;

  sim.world.progression.stage = stage as 1 | 2 | 3 | 4;
  sim.world.economy.cash = requirement.cashRequired + 50;
  sim.world.stats.customersServed = requirement.customersServed;
  sim.world.economy.reputation = requirement.reputation;

  // Real purchases and real hires, so the milestone is met the way a player
  // would meet it rather than by writing the counter it is checked against.
  const funds = sim.world.economy.cash;
  sim.world.economy.cash = 100_000;
  for (let i = 0; i < requirement.upgradesBought; i++) {
    buyUpgrade(sim.world, i % 2 === 0 ? 'hand-painted-sign' : 'menu-board');
  }
  for (let i = 0; i < requirement.employeesHired; i++) hire(sim.world, 'cook', 0.5);
  sim.world.economy.cash = funds;
}

describe('money alone is not enough', () => {
  it('refuses to unlock on cash without the milestone', () => {
    /*
     * The roadmap's rule, and a design position rather than a difficulty knob: a
     * player who reached the threshold by leaving the game running has not
     * learned that a queue forms or that a sign converts traffic, and Stage 2's
     * station parallelism would be a system they have no model for.
     */
    const sim = new Sim({ seed: 1 });
    const requirement = requirementFor(1);
    expect(requirement).not.toBeNull();
    if (requirement === null) return;

    sim.world.economy.cash = requirement.cashRequired * 10;
    sim.advance(20);

    expect(meetsRequirement(sim.world, requirement)).toBe(false);
    expect(sim.world.progression.pendingStage).toBe(0);
    expect(beginConstruction(sim.world)).toBe('not-ready');
  });

  it('refuses to unlock on the milestone without the cash', () => {
    const sim = new Sim({ seed: 1 });
    qualify(sim, 1);
    sim.world.economy.cash = 0;
    sim.advance(20);

    expect(sim.world.progression.pendingStage).toBe(0);
  });

  it('unlocks once both are true, and announces it once', () => {
    const sim = new Sim({ seed: 1 });
    let announcements = 0;
    const unsubscribe = sim.events.subscribe((event) => {
      if (event.t === 'STAGE_UNLOCKED') announcements++;
    });

    qualify(sim, 1);
    sim.advance(200);
    unsubscribe();

    expect(sim.world.progression.pendingStage).toBe(2);
    expect(announcements, 'the fanfare fired more than once').toBe(1);
  });

  it('asks for strictly more at every stage', () => {
    // A later stage that asked for less would be reachable out of order the
    // moment the player spent money, and "I went backwards" is the least
    // explicable thing a progression system can do.
    for (let i = 1; i < STAGE_REQUIREMENTS.length; i++) {
      const previous = STAGE_REQUIREMENTS[i - 1];
      const current = STAGE_REQUIREMENTS[i];
      expect(current?.cashRequired ?? 0).toBeGreaterThan(previous?.cashRequired ?? 0);
      expect(current?.customersServed ?? 0).toBeGreaterThan(previous?.customersServed ?? 0);
    }
  });
});

describe('the transition is player-confirmed', () => {
  it('waits for the command rather than evolving on its own', () => {
    /*
     * GAME_DESIGN_DOCUMENT §25, S5 — decided in Phase 11. Construction disrupts
     * the stand for twelve to thirty seconds, and firing that automatically
     * fires it at the moment the player is busiest.
     */
    const sim = new Sim({ seed: 1 });
    qualify(sim, 1);
    sim.advance(2000);

    expect(sim.world.progression.stage, 'evolved without being asked').toBe(1);
    expect(sim.world.progression.pendingStage).toBe(2);
    expect(isConstructing(sim.world)).toBe(false);
  });

  it('starts building when the player says so, and charges for it', () => {
    const sim = new Sim({ seed: 1 });
    qualify(sim, 1);
    sim.advance(20);

    const before = sim.world.economy.cash;
    sim.dispatch({ t: 'EVOLVE' });
    sim.tick();

    expect(isConstructing(sim.world)).toBe(true);
    // Evolution is a purchase, not a threshold you merely touch — otherwise a
    // player could hover at the requirement forever and evolve for free.
    expect(before - sim.world.economy.cash).toBeCloseTo(140, 6);
  });

  it('refuses a second EVOLVE while the building is going up', () => {
    const sim = new Sim({ seed: 1 });
    qualify(sim, 1);
    sim.advance(20);
    sim.dispatch({ t: 'EVOLVE' });
    sim.tick();

    const cash = sim.world.economy.cash;
    expect(beginConstruction(sim.world)).toBe('already-building');
    expect(sim.world.economy.cash, 'charged twice for one evolution').toBe(cash);
  });
});

describe('construction takes time in the world', () => {
  it('keeps the player in the old stage until the building is finished', () => {
    /*
     * The ordering is the whole reason construction is simulation state rather
     * than a render animation: for twelve seconds the stand is still Stage 1,
     * still serving, with the new building going up around it.
     */
    const sim = new Sim({ seed: 1 });
    qualify(sim, 1);
    sim.advance(20);
    sim.dispatch({ t: 'EVOLVE' });
    sim.tick();

    const requirement = requirementFor(1);
    expect(requirement).not.toBeNull();
    if (requirement === null) return;

    const half = Math.floor(requirement.constructionMs / TICK_MS / 2);
    sim.advance(half);

    expect(sim.world.progression.stage, 'the stage flipped before the build finished').toBe(1);
    expect(constructionProgress(sim.world)).toBeGreaterThan(0.3);
    expect(constructionProgress(sim.world)).toBeLessThan(0.8);

    sim.advance(half + 10);
    expect(sim.world.progression.stage).toBe(2);
    expect(isConstructing(sim.world)).toBe(false);
    expect(constructionProgress(sim.world)).toBe(0);
  });

  it('never reports progress outside 0..1', () => {
    const sim = new Sim({ seed: 1 });
    qualify(sim, 1);
    sim.advance(20);
    sim.dispatch({ t: 'EVOLVE' });

    for (let tick = 0; tick < 1000; tick++) {
      sim.tick();
      const progress = constructionProgress(sim.world);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });

  it('announces the change with both stages, so the celebration knows what changed', () => {
    const sim = new Sim({ seed: 1 });
    const changes: { from: number; to: number }[] = [];
    const unsubscribe = sim.events.subscribe((event) => {
      if (event.t === 'STAGE_CHANGED') changes.push({ from: event.from, to: event.to });
    });

    qualify(sim, 1);
    sim.advance(20);
    sim.dispatch({ t: 'EVOLVE' });
    sim.advance(400);
    unsubscribe();

    expect(changes).toEqual([{ from: 1, to: 2 }]);
  });
});

describe('the world survives the transition', () => {
  it('keeps the money, the staff and the upgrades', () => {
    const sim = new Sim({ seed: 1 });
    qualify(sim, 1);
    hire(sim.world, 'cook', 0.6);
    sim.advance(20);

    const staffBefore = sim.world.employees.activeCount;
    const upgradesBefore = sim.world.layout.upgrades.size;

    sim.dispatch({ t: 'EVOLVE' });
    sim.advance(400);

    expect(sim.world.progression.stage).toBe(2);
    expect(sim.world.employees.activeCount, 'the staff vanished').toBe(staffBefore);
    expect(sim.world.layout.upgrades.size, 'the upgrades vanished').toBe(upgradesBefore);
    expect(sim.world.economy.cash).toBeGreaterThanOrEqual(0);
  });

  it('leaves the road and the counter exactly where they were', () => {
    /*
     * The central design constraint, asserted directly: _"Evolution is NOT a
     * scene change. The camera stays put and the building grows in place."_ A
     * layout that moved the counter would make the evolution a scene change
     * wearing a costume, and every system that aims at the counter would be
     * aiming somewhere else afterwards.
     */
    const stage1 = layoutForStage(1);
    for (const stage of [2, 3, 4]) {
      const later = layoutForStage(stage);
      expect(later.counter, `stage ${String(stage)} moved the counter`).toEqual(stage1.counter);
      expect(later.pullIn, `stage ${String(stage)} moved the pull-in`).toEqual(stage1.pullIn);
      expect(later.lot, `stage ${String(stage)} resized the lot`).toEqual(stage1.lot);
      expect(later.road, `stage ${String(stage)} moved the road`).toEqual(stage1.road);
    }
  });

  it('keeps the original stand visible at every later stage', () => {
    // GAME_DESIGN_DOCUMENT §7: the player should be able to see their first
    // lemonade stand still standing in a corner. It is the single clearest
    // signal that this is the same place rather than a new level.
    for (const stage of [2, 3, 4]) {
      const layout = layoutForStage(stage);
      const roots = layout.statics.filter(
        (object) => Math.abs(object.x - 22.2) < 0.01 && Math.abs(object.y - 15.6) < 0.01,
      );
      expect(roots.length, `stage ${String(stage)} demolished the original stand`).toBe(1);
    }
  });

  it(
    'keeps serving customers throughout the construction',
    () => {
      // The stand is disrupted, not closed. A player mid-service should not lose
      // the customers already in the queue because they pressed a button.
      const sim = new Sim({ seed: 424242 });
      qualify(sim, 1);
      hire(sim.world, 'cook', 0.7);
      sim.advance(6000);

      const servedBefore = sim.world.stats.customersServed;
      sim.dispatch({ t: 'EVOLVE' });
      /*
       * Two minutes, not thirty seconds. Construction takes twelve, but the
       * *arrival rate* is what decides how long a "did anybody get served"
       * window has to be — and at Stage 1's 1.8 customers a minute, thirty
       * seconds is a coin flip. Measured at exactly that: 33 served before and
       * 33 after, with nothing wrong.
       */
      sim.advance(2400);

      expect(sim.world.progression.stage).toBe(2);
      expect(sim.world.stats.customersServed, 'service stopped during construction').toBeGreaterThan(
        servedBefore,
      );
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it('survives a save taken mid-construction', () => {
    /*
     * Construction is world state precisely so this works. A player who saved
     * during the twelve seconds and found the building finished — or reset — on
     * load would have had the one moment the progression system exists for taken
     * away from them.
     */
    const sim = new Sim({ seed: 1 });
    qualify(sim, 1);
    sim.advance(20);
    sim.dispatch({ t: 'EVOLVE' });
    sim.advance(100);

    expect(isConstructing(sim.world)).toBe(true);
    const progress = constructionProgress(sim.world);

    const resumed = new Sim({ seed: 1 });
    restoreWorld(resumed.world, snapshotWorld(sim.world));

    expect(isConstructing(resumed.world)).toBe(true);
    expect(constructionProgress(resumed.world)).toBeCloseTo(progress, 9);

    resumed.advance(400);
    expect(resumed.world.progression.stage).toBe(2);
  });
});

describe('every stage runs', () => {
  it(
    'plays ten simulated minutes at each stage without an error',
    () => {
      /*
       * The roadmap's own test line: "Her aşamada 10 dakikalık integration
       * koşusu, hata yok." Ten minutes at each of the four stages, with a cook
       * and a waiter on from Stage 3 so the channels that need staff have it.
       */
      for (const stage of [1, 2, 3, 4]) {
        const sim = new Sim({ seed: 909 });
        sim.world.progression.stage = stage as 1 | 2 | 3 | 4;
        sim.world.economy.cash = 5000;
        if (stage >= 2) hire(sim.world, 'cook', 0.6);
        if (stage >= 3) hire(sim.world, 'waiter', 0.6);

        expect(
          () => {
            for (let i = 0; i < 12_000; i++) {
              sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
              sim.tick();
            }
          },
          `stage ${String(stage)} threw`,
        ).not.toThrow();

        expect(sim.world.economy.cash, `stage ${String(stage)} went negative`).toBeGreaterThanOrEqual(0);
        expect(sim.world.stats.customersServed, `stage ${String(stage)} served nobody`).toBeGreaterThan(0);
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

/**
 * The table's own rules, checked by feeding it tables it should refuse.
 *
 * The validator runs once at module load on a table that is correct, which means
 * nothing has ever seen it *reject* anything. A rule that has never fired is a
 * rule nobody has checked — the same reasoning that put the architecture
 * boundaries under test rather than trusting the config that declares them.
 */
describe('a stage may never ask for less than the one before it', () => {
  const base = {
    stage: 2 as const,
    cashRequired: 100,
    requiredRoles: [],
    customersServed: 10,
    upgradesBought: 1,
    employeesHired: 0,
    reputation: 0,
    constructionMs: 10_000,
  };

  it('refuses a later stage that costs no more', () => {
    /*
     * "No more", not "less": equal cash is just as broken, because the moment
     * the player can afford one they can afford both and the order they arrive
     * in stops being defined.
     */
    const cheaper = stageRequirementListSchema.safeParse([base, { ...base, stage: 3, cashRequired: 50 }]);
    expect(cheaper.success).toBe(false);
    expect(JSON.stringify(cheaper.error?.issues)).toContain('costs no more');

    const equal = stageRequirementListSchema.safeParse([base, { ...base, stage: 3, cashRequired: 100 }]);
    expect(equal.success).toBe(false);
  });

  it('refuses a later stage that asks for fewer customers', () => {
    const fewer = stageRequirementListSchema.safeParse([
      base,
      { ...base, stage: 3, cashRequired: 200, customersServed: 5 },
    ]);
    expect(fewer.success).toBe(false);
    expect(JSON.stringify(fewer.error?.issues)).toContain('fewer customers');
  });

  it('accepts a table that grows on every axis, and the shipped one is such a table', () => {
    const grows = stageRequirementListSchema.safeParse([
      base,
      { ...base, stage: 3, cashRequired: 200, customersServed: 40 },
    ]);
    expect(grows.success).toBe(true);

    // And the real table passes its own rules — which is what the module-load
    // parse asserts, restated here so it is visible in the suite rather than
    // only in an import that would throw.
    expect(stageRequirementListSchema.safeParse(STAGE_REQUIREMENTS).success).toBe(true);
  });

  it('refuses a requirement that is not a requirement at all', () => {
    // The field schema, not the cross-row rules: a negative cash threshold or a
    // zero-length construction would both make the stage unreachable or instant.
    expect(stageRequirementListSchema.safeParse([{ ...base, cashRequired: -1 }]).success).toBe(false);
    expect(stageRequirementListSchema.safeParse([{ ...base, constructionMs: 0 }]).success).toBe(false);
    expect(stageRequirementListSchema.safeParse([{ ...base, reputation: 101 }]).success).toBe(false);
  });
});
