import { describe, expect, it } from 'vitest';
import { STAGE_TRANSITION_MODE, requirementFor } from '@config/progression';
import { TICK_MS } from '@config/simulation';
import { STATE_GONE } from '@sim/ai/fsm/customerFsm';
import { Sim } from '@sim/core/Sim';
import { meetsRequirement } from '@sim/systems/ProgressionSystem';
import { buyUpgrade } from '@sim/systems/UpgradeSystem';

const LONG_RUN_TIMEOUT_MS = 180_000;

/**
 * **S5 — automatic or player-confirmed?** GAME_DESIGN_DOCUMENT §25.
 *
 * The roadmap: _"Decide from pacing data, record why."_ This is the pacing data,
 * kept as a test so the decision keeps being checked rather than being an
 * assertion somebody made once.
 *
 * **The finding**: across five seeds, the Stage 1 requirements were met with
 * **1 to 6 customers mid-transaction and 3 to 10 cars on the lot — every single
 * time.** There is no quiet moment to evolve in, because the requirements are
 * met by *serving people*, so the instant they are met is by construction an
 * instant when people are being served.
 *
 * Construction then disrupts the stand for twelve to thirty seconds. Firing that
 * automatically fires it at the moment the player is busiest, which is exactly
 * when they least want their counter demolished. A confirmation turns the same
 * event into a decision they chose the timing of — and the requirements stay
 * met, so nothing is lost by waiting.
 */
describe('what is happening when a stage unlocks', () => {
  it(
    'is always the middle of service, on every seed',
    () => {
      const requirement = requirementFor(1);
      expect(requirement).not.toBeNull();
      if (requirement === null) return;

      const observations: { busy: number; cars: number }[] = [];

      for (const seed of [424242, 909, 4242, 777, 20260816]) {
        const sim = new Sim({ seed });

        for (let tick = 0; tick < 200_000; tick++) {
          sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
          // A player spending as they go, which is how the milestone is reached.
          if (tick % 600 === 0) buyUpgrade(sim.world, 'hand-painted-sign');
          sim.tick();
          if (meetsRequirement(sim.world, requirement)) break;
        }

        let busy = 0;
        for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
          if (!sim.world.customers.isActive(slot)) continue;
          if (sim.world.customers.at(slot).state !== STATE_GONE) busy++;
        }
        observations.push({ busy, cars: sim.world.vehicles.activeCount });
      }

      expect(observations).toHaveLength(5);
      for (const observation of observations) {
        expect(
          observation.busy + observation.cars,
          'a seed reached the requirements with an empty lot',
        ).toBeGreaterThan(0);
      }

      // And the confirmation is what the config actually does.
      expect(STAGE_TRANSITION_MODE).toBe('confirmed');
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'reaches Stage 2 inside the window the design asks for',
    () => {
      /*
       * **This test was written to fail, and Phase 12 is what fixed it.**
       *
       * Phase 11 measured Stage 1 at **46.7 to 55.2 minutes** against
       * ECONOMY_DESIGN §3's designed 12 to 18, and asserted the wrong bound
       * (`> 25`) on purpose so that the balancing phase would have a number to
       * move rather than an impression. It now reaches Stage 2 in **21.2
       * minutes**, inside §13's 10-to-22 assertion window.
       *
       * The player modelled here is deliberately *not* the balance simulator's:
       * they buy a sign every thirty seconds whether or not they are saving for
       * anything, which is a spendthrift rather than a strategy. The budgeted
       * policies reach Stage 2 at 18.5 minutes (`docs/BALANCE_REPORT.md`), so
       * this is the slow end of reasonable play and the window has to hold for
       * it too.
       *
       * What actually moved: reputation now starts at the neutral point of its
       * own published band instead of at the worst value in the game, the Stage
       * 1 upgrade ladder was rescaled to satisfy the ninety-second dead-end
       * rule, and Stage 1 prices carry the ₡4.50 average ticket §3 is built on.
       * All config; no mechanic changed. PHASE_12_REPORT §4.
       */
      const requirement = requirementFor(1);
      expect(requirement).not.toBeNull();
      if (requirement === null) return;

      const sim = new Sim({ seed: 424242 });
      let tick = 0;
      for (; tick < 200_000; tick++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        if (tick % 600 === 0) buyUpgrade(sim.world, 'hand-painted-sign');
        sim.tick();
        if (meetsRequirement(sim.world, requirement)) break;
      }

      const minutes = (tick * TICK_MS) / 60_000;
      // ECONOMY_DESIGN §13's own window. The design *target* in §3 is 12 to 18;
      // the assertion band is wider on purpose, because a player who spends
      // carelessly should still arrive, just later.
      expect(minutes, `reached in ${minutes.toFixed(1)} minutes`).toBeGreaterThan(10);
      expect(minutes, `reached in ${minutes.toFixed(1)} minutes`).toBeLessThanOrEqual(22);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});
