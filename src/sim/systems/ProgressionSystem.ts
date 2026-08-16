import { STAGE_TRANSITION_MODE, requirementFor } from '@config/progression';
import type { StageRequirement } from '@config/progression';
import type { Stage } from '../core/types';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import { totalUpgradeLevels } from './UpgradeSystem';

/**
 * Evolution — GAME_EXECUTION_ROADMAP Phase 11, GAME_DESIGN_DOCUMENT §7.
 *
 * Three things happen here and they are deliberately one system:
 *
 * 1. **Watching** — are the next stage's requirements met?
 * 2. **Waiting** — they are, and the player has not said go yet.
 * 3. **Building** — they said go, and the building is physically growing.
 *
 * Splitting those across a `ProgressionSystem` and a `ConstructionSystem` was
 * the roadmap's file list, and it would have needed a nineteenth slot in
 * `SYSTEM_ORDER` — which is architecture (WORKING_DISCIPLINE §6). Construction
 * *is* progression taking time, so it lives here and `ConstructionSystem.ts`
 * holds the free functions that describe it.
 *
 * ## Money is not enough
 *
 * The requirement is cash **and** a milestone, and the milestone is the lesson
 * of the stage expressed as something already counted: customers served,
 * upgrades bought, employees hired, reputation earned. A player who reached the
 * cash threshold by leaving the game running has not learned that a queue forms
 * or that a sign converts traffic, and Stage 2's station parallelism would be a
 * system they have no model for.
 */
export class ProgressionSystem implements SimSystem {
  readonly name = 'ProgressionSystem' as const;

  run(world: World, deltaMs: number): void {
    if (deltaMs <= 0) return;

    this.advanceConstruction(world, deltaMs);
    this.checkRequirements(world);
  }

  /**
   * Move the building along, and finish it when it is done.
   *
   * The stage changes at the *end*, not the start. That ordering is the whole
   * reason construction is simulation state: for twelve to thirty seconds the
   * player is still in the old stage, still serving, with the new building going
   * up around them. Flipping the stage first would make construction a cosmetic
   * delay after an instant change.
   */
  private advanceConstruction(world: World, deltaMs: number): void {
    const construction = world.construction;
    if (construction.targetStage === 0) return;

    construction.elapsedMs += deltaMs;
    if (construction.elapsedMs < construction.totalMs) return;

    const from = world.progression.stage;
    const to = construction.targetStage;

    world.progression.stage = to as Stage;
    world.progression.pendingStage = 0;
    construction.targetStage = 0;
    construction.elapsedMs = 0;
    construction.totalMs = 0;

    /*
     * The layout changed, so every navigation field is stale — new parking, new
     * queue slots, a new building footprint. Bumping the revision is what makes
     * the cache rebuild; without it, agents would route around Stage 1's world
     * inside Stage 3's.
     */
    world.layout.revision++;
    world.progression.milestones.push(`stage_${String(to)}`);
    world.eventQueue.emitStageChanged(from, to);
  }

  /**
   * Is the next stage available?
   *
   * Checked every tick and announced once. `pendingStage` is the latch: the
   * event fires on the transition from "not ready" to "ready", so a player who
   * spends their cash back down does not get a second fanfare when they earn it
   * again — the stage stays unlocked once its requirements have been met.
   */
  private checkRequirements(world: World): void {
    if (world.construction.targetStage !== 0) return;

    const requirement = requirementFor(world.progression.stage);
    if (requirement === null) return; // Stage 4 is the end of the road.
    if (world.progression.pendingStage === requirement.stage) return;

    if (!meetsRequirement(world, requirement)) return;

    world.progression.pendingStage = requirement.stage;
    world.eventQueue.emitStageUnlocked(requirement.stage);

    /*
     * Automatic transitions are a config switch and are currently **off** —
     * GAME_DESIGN_DOCUMENT §25.2, decided in Phase 11 from pacing data.
     *
     * A union-typed mode rather than a boolean, so this branch survives type
     * narrowing — see the constant's own note. Keeping it is the point: the
     * decision came from data, and the data could change.
     */
    if (STAGE_TRANSITION_MODE === 'automatic') beginConstruction(world);
  }
}

/** Every requirement, checked. Exported so the UI can explain what is missing. */
export function meetsRequirement(world: World, requirement: StageRequirement): boolean {
  return (
    world.economy.cash >= requirement.cashRequired &&
    world.stats.customersServed >= requirement.customersServed &&
    totalUpgradeLevels(world) >= requirement.upgradesBought &&
    world.employees.activeCount >= requirement.employeesHired &&
    world.economy.reputation >= requirement.reputation
  );
}

/**
 * Start building — what `EVOLVE` means.
 *
 * Validated here rather than trusted from the command, for the reason every
 * other command is: this path is reached by replayed logs and by saves written
 * by builds this one has never seen.
 *
 * The cash is **spent**. Evolution is a purchase, not a threshold you merely
 * touch — otherwise a player could hover at ₡140 forever and evolve for free.
 */
export function beginConstruction(world: World): 'ok' | 'not-ready' | 'already-building' {
  if (world.construction.targetStage !== 0) return 'already-building';

  const requirement = requirementFor(world.progression.stage);
  if (requirement === null) return 'not-ready';
  if (!meetsRequirement(world, requirement)) return 'not-ready';

  world.economy.cash -= requirement.cashRequired;
  world.economy.lifetimeSpend += requirement.cashRequired;

  world.construction.targetStage = requirement.stage;
  world.construction.elapsedMs = 0;
  world.construction.totalMs = requirement.constructionMs;

  world.eventQueue.emitConstructionStarted(requirement.stage, requirement.constructionMs);
  return 'ok';
}
