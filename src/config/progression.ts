import { z } from 'zod';
import { EMPLOYEE_ROLES } from './employees';
import { UNPAID_GRACE_MS } from './economy/wages';

/**
 * The four-stage evolution — GAME_DESIGN_DOCUMENT §7, ECONOMY_DESIGN §3.
 *
 * ## Money is not enough
 *
 * The roadmap is explicit: _"evolution requires BOTH a cash threshold AND a
 * milestone. Money alone is not enough; the player should have demonstrated they
 * understand the current stage before the next one opens."_
 *
 * That is a real design position rather than a difficulty knob. A player who
 * reaches ₡140 by leaving the game running has not learned that a queue forms,
 * that patience runs out, or that a sign converts traffic — and dropping them
 * into Stage 2's station parallelism would be dropping them into a system they
 * have no model for. The milestone is the model check.
 *
 * ## Why the milestones are what they are
 *
 * Each one is the *lesson* of its stage, expressed as something the simulation
 * already counts:
 *
 * - **Stage 1 → 2** — serve 25 customers and buy one upgrade. The first proves
 *   the loop was operated, not watched; the second proves the player found the
 *   upgrade card at all, which is the single interaction Stage 2 is built on.
 * - **Stage 2 → 3** — hire somebody and serve 120. Stage 2's lesson is that the
 *   bottleneck moved from your clicking to your staffing.
 * - **Stage 3 → 4** — serve 600 and reach reputation 55. Stage 3 is where
 *   satisfaction starts to bite (Phase 11 turns on cleanliness), so the lesson is
 *   that *how* you serve people has become as important as how many.
 */

/**
 * Stage indices are 1-based and hashed. Never renumber.
 *
 * Written as a union rather than derived from a `const` array: the array existed
 * only to be `typeof`-ed, which is a value that is never read at runtime and
 * which lint correctly refuses to keep.
 */
export type StageNumber = 1 | 2 | 3 | 4;

const requirementSchema = z.object({
  /** The stage this unlocks. */
  stage: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  /** Cash the player must hold — ECONOMY_DESIGN §3, "sonraki aşamanın maliyeti". */
  cashRequired: z.number().positive(),
  /** Lifetime customers served. */
  customersServed: z.number().int().nonnegative(),
  /** Upgrade levels bought, across every family. */
  upgradesBought: z.number().int().nonnegative(),
  /** Employees on the payroll right now. */
  employeesHired: z.number().int().nonnegative(),
  /** Reputation, 0..100. */
  reputation: z.number().min(0).max(100),
  /**
   * How long the construction takes, in simulation milliseconds.
   *
   * Not instant, and not skippable in the simulation: the building physically
   * grows, and a stage that appeared between two ticks would be the scene change
   * the whole design exists to avoid. The *camera flourish* is skippable; the
   * construction is not.
   */
  constructionMs: z.number().int().positive(),
  /**
   * Roles the incoming stage cannot **earn** without — ADR-014.
   *
   * Not the same thing as the `employeesHired` milestone above. The milestone is
   * a lesson check on the *outgoing* stage ("you have hired somebody"); this is
   * an operating fact about the *incoming* one ("tables are served by a waiter,
   * so a diner with no waiter has zero income"). The distinction is exactly the
   * stranding found in Phase 12: a stand holding ₡804 accepted the ₡800 Stage 3,
   * opened with ₡4, could not hire the waiter its tables needed, and flatlined
   * from minute 92 to the end of a twelve-hour run.
   */
  requiredRoles: z.array(z.string()),
});

export type StageRequirement = z.infer<typeof requirementSchema>;

const REQUIREMENTS: StageRequirement[] = [
  {
    stage: 2,
    cashRequired: 140,
    customersServed: 25,
    upgradesBought: 1,
    employeesHired: 0,
    reputation: 0,
    constructionMs: 12_000,
    // The truck's counter works exactly like the stand's; nothing new is
    // mandatory to earn, so the reserve is wage runway alone.
    requiredRoles: [],
  },
  {
    stage: 3,
    cashRequired: 800,
    customersServed: 120,
    upgradesBought: 4,
    employeesHired: 1,
    reputation: 40,
    constructionMs: 20_000,
    // The diner serves at tables, and food reaches a table in a waiter's hands.
    requiredRoles: ['waiter'],
  },
  {
    stage: 4,
    cashRequired: 12_000,
    customersServed: 600,
    upgradesBought: 10,
    employeesHired: 3,
    reputation: 55,
    constructionMs: 30_000,
    // The restaurant keeps its tables; the drive-thru is worked from the
    // kitchen, so the waiter remains the one role income cannot exist without.
    requiredRoles: ['waiter'],
  },
];

/**
 * The table's own rules, separated from the table so they can be tested.
 *
 * A validator that is only ever run on data known to be valid is a validator
 * nobody has checked. Exported so a test can hand it a deliberately broken table
 * and watch each rule fire — the same reasoning that put the architecture rules
 * under test in `tests/unit/architecture/enforcement.test.ts`.
 */
export const stageRequirementListSchema = z.array(requirementSchema).superRefine((list, ctx) => {
  /*
   * Strictly increasing on every axis. A later stage that asked for *less*
   * than an earlier one would be reachable out of order the moment the player
   * spent money — and "I went backwards" is the least explicable thing a
   * progression system can do.
   */
  for (let i = 1; i < list.length; i++) {
    const previous = list[i - 1];
    const current = list[i];
    if (previous === undefined || current === undefined) continue;
    if (current.cashRequired <= previous.cashRequired) {
      ctx.addIssue({
        code: 'custom',
        message: `Stage ${String(current.stage)} costs no more than the one before it`,
      });
    }
    if (current.customersServed < previous.customersServed) {
      ctx.addIssue({ code: 'custom', message: `Stage ${String(current.stage)} asks for fewer customers` });
    }
  }
});

export const STAGE_REQUIREMENTS: readonly StageRequirement[] = stageRequirementListSchema.parse(REQUIREMENTS);

/**
 * The cash a stand must still be holding **after** it pays for an evolution —
 * ADR-014, closing the Phase 12 stranding.
 *
 * Evolution *spends* the threshold, so "can afford the transition" and "can
 * operate what it buys" were two different questions and only the first was
 * asked. This is the second one, priced from config rather than chosen:
 *
 *   reserve = Σ hire costs of required roles not yet on the payroll
 *           + the unpaid-grace window's wages for the payroll the stand will
 *             actually have (everyone employed now, plus the missing hires at
 *             their base wage)
 *
 * The grace window is the wage system's own tolerance (UNPAID_GRACE_MS): a
 * stand that opens its new stage with exactly this much can hire what the
 * stage needs and keep every wage settled for as long as the wage system
 * forgives, which is the time income has to restart in. The missing hires are
 * priced at skill 0 — the reserve guarantees the *cheapest viable* path, and a
 * player who hires above it is making a choice with money they can see.
 *
 * Callers pass what the payroll currently is, because config cannot see the
 * world: `employedOfRole` counts staff in a role, `payrollPerMinute` is the sum
 * of live wages.
 */
export function operatingReserve(
  requirement: StageRequirement,
  employedOfRole: (roleId: string) => number,
  payrollPerMinute: number,
): number {
  let hires = 0;
  let addedWagePerMinute = 0;
  for (const roleId of requirement.requiredRoles) {
    if (employedOfRole(roleId) > 0) continue;
    const spec = EMPLOYEE_ROLES.find((role) => role.id === roleId);
    if (spec === undefined) continue;
    hires += spec.hireCost;
    addedWagePerMinute += spec.baseWagePerMinute;
  }
  const graceMinutes = UNPAID_GRACE_MS / 60_000;
  return hires + (payrollPerMinute + addedWagePerMinute) * graceMinutes;
}

/** What the next stage needs, or null at Stage 4. */
export function requirementFor(stage: number): StageRequirement | null {
  return STAGE_REQUIREMENTS.find((entry) => entry.stage === stage + 1) ?? null;
}

/**
 * Whether a stage transition happens on its own — GAME_DESIGN_DOCUMENT §25, S5.
 *
 * **Decided in Phase 11: player-confirmed.** The reasoning and the pacing data
 * are in GAME_DESIGN_DOCUMENT §25 and PHASE_11_REPORT §5.
 *
 * The short version: the requirements are met *during* service, and construction
 * takes twelve to thirty seconds during which the stand is disrupted. Firing
 * that automatically means it fires at the moment the player is busiest, which
 * is exactly when they least want their counter demolished. A confirmation turns
 * the same event into a decision they chose the timing of.
 */
export type StageTransitionMode = 'confirmed' | 'automatic';

/**
 * A union rather than a boolean, and that is not cosmetic: a `const` boolean is
 * inferred as the literal `true`, the compiler then proves the automatic branch
 * unreachable, and lint deletes the condition. The branch has to survive —
 * the decision came from pacing data and the data could change.
 */
export const STAGE_TRANSITION_MODE: StageTransitionMode = 'confirmed';
