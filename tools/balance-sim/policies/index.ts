import { STAGE_UPGRADE_BUDGET } from '@config/economy/upgrades';
import { requirementFor } from '@config/progression';
import type { CommandInput } from '@sim/core/commands';
import type { Policy, PolicySnapshot, UpgradeOption } from '../types';

/**
 * Five readings of "a reasonable player" — ECONOMY_DESIGN §13.
 *
 * They are not five difficulty settings. Each one is a *coherent theory* of how
 * to play, and the assertion that matters is the spread between them: if the
 * best is more than 2.5× the worst, the game has one correct strategy and the
 * upgrade tree is decoration.
 *
 * ## What every policy shares
 *
 * The parts that are not a strategy — hire when you need staff, say yes when the
 * next stage is offered — live in `common` below. A policy that declined to
 * evolve would not be testing an economic strategy, it would be testing a
 * refusal to play, and every stage-timing assertion would be measuring that
 * instead.
 */

/** Hiring costs — ECONOMY_DESIGN §5.1. */
const HIRE_COST: Readonly<Record<string, number>> = { cook: 20, waiter: 18, cleaner: 14 };

/**
 * Who a stage needs, **in the order it needs them**.
 *
 * A list of roles rather than a headcount, and the difference cost ten simulated
 * hours to find. The first version hired by a fixed plan order and stopped at a
 * headcount, so a Stage 3 restaurant with one cook hired a *second cook* — and
 * Stage 3 serves food to tables, which needs a waiter. Nobody was served again:
 * 414 customers, then a flat line from ninety-two minutes to the end of the run.
 *
 * The waiter comes first at Stage 3 for that reason. Stage 1 is empty because
 * ECONOMY_DESIGN §5.1 has no Stage 1 roles at all — the stand is worked by hand,
 * which is the lesson Stage 2 is built on.
 */
const STAFF_PLAN: readonly (readonly string[])[] = [
  [],
  [],
  ['cook', 'cook'],
  ['waiter', 'cook', 'cleaner', 'cook'],
  ['waiter', 'cook', 'waiter', 'cook', 'cleaner', 'cook', 'waiter', 'cleaner'],
];

/** The next role this stage is short of, or null when it is fully staffed. */
function missingRole(snapshot: PolicySnapshot): string | null {
  const plan = STAFF_PLAN[snapshot.stage] ?? [];
  const have: Record<string, number> = { ...snapshot.employeesByRole };
  for (const roleId of plan) {
    const count = have[roleId] ?? 0;
    if (count > 0) {
      have[roleId] = count - 1;
      continue;
    }
    return roleId;
  }
  return null;
}

/**
 * How many employees a stage wants.
 *
 * **Stage 1 is zero, and that is the design's own number.** ECONOMY_DESIGN §5.1
 * lists the cook as a Stage 2+ role and §3's Stage 1 column gives a full-staff
 * payroll of ₡0 per minute; the Stage 2 progression requirement asks for zero
 * employees. Stage 1 is meant to be worked by hand — that is the lesson Stage 2
 * is built on.
 *
 * Hiring a cook there anyway, which the first version of this file did, costs
 * ₡6 a minute against a stand earning about ₡9. Measured: it took a third of the
 * income of every policy and made the whole of Stage 1 slower for all of them.
 */

/**
 * A reserve kept back from the upgrade budget.
 *
 * Wages are a continuous sink that runs whether or not anybody is being served
 * (ECONOMY_DESIGN §5.1), so a policy that spent to zero would fire its own staff
 * during the first quiet minute. Expressed in minutes of payroll rather than as
 * a flat sum, because the right reserve at Stage 4 is not the right one at
 * Stage 1.
 */
const RESERVE_MINUTES = 2;

/** The dearest hire, used to size the next stage's staffing reserve. */
const MOST_EXPENSIVE_HIRE = 20;

/** Minutes of the new stage's payroll a policy opens with. */
const OPENING_WAGE_MINUTES = 4;

/** Roughly what a head costs per minute across the roles a policy hires. */
const WAGE_PER_HEAD = 5;

function payrollEstimate(snapshot: PolicySnapshot): number {
  // The published base wages average about ₡5/minute per head at the stages a
  // policy hires in; exactness is not the point, having a floor is.
  return snapshot.employees * WAGE_PER_HEAD;
}

/**
 * How much of the cash pile is actually free to spend on upgrades.
 *
 * Two deductions, and the second one was the finding that made the first
 * simulator run useless.
 *
 * A wage reserve, because wages run whether or not anybody is being served.
 *
 * And **the price of the next stage**, once everything else about it is
 * satisfied. Evolution needs the player to be *holding* the cash, not to have
 * earned it — so a policy that spends every credit the moment it has one never
 * evolves at all. The first run showed exactly that: five policies, 240
 * customers each, eleven upgrades each, and **not one of them reached Stage 2**
 * in ninety minutes, because each was permanently ₡65 short of a threshold it
 * had crossed dozens of times.
 *
 * That is not a quirk of the simulator. It is what a player does: you see
 * "₡140 to grow", and you stop buying signs.
 */
function spendable(snapshot: PolicySnapshot): number {
  const free = snapshot.cash - payrollEstimate(snapshot) * RESERVE_MINUTES;

  const requirement = requirementFor(snapshot.stage);
  if (requirement === null) return free;

  const otherwiseReady =
    snapshot.customersServed >= requirement.customersServed &&
    snapshot.upgradesBought >= requirement.upgradesBought &&
    snapshot.employees >= requirement.employeesHired &&
    snapshot.reputation >= requirement.reputation;

  if (!otherwiseReady) return free;

  /*
   * The next stage's wage bill, held back on top of its price.
   *
   * **Measured the hard way.** Without it, every policy evolved into Stage 3
   * with ₡0 in the till — and Stage 3 serves food to *tables*, which needs a
   * waiter, which they could not afford. The stand stopped serving anybody at
   * all: over a twelve-hour run the four strategic policies served 414 customers
   * and then flatlined at ninety-two minutes, permanently.
   *
   * That is a worse dead end than the one ECONOMY_DESIGN §8 legislates against.
   * §8's rule is about not being able to afford an *upgrade*; this is about not
   * being able to afford to *operate*, with no way back because income is zero.
   * A player would keep something back. So does this.
   */
  const nextStage = snapshot.stage + 1;
  const toHire = Math.max(0, (STAFF_PLAN[nextStage] ?? []).length - snapshot.employees);
  const hiringReserve = toHire * MOST_EXPENSIVE_HIRE;

  return free - requirement.cashRequired - hiringReserve;
}

/**
 * The things every policy does, before it does anything strategic.
 *
 * Returns the commands and whether the policy still has a decision to make —
 * hiring and evolving both spend, so a policy that also bought an upgrade in the
 * same instant would be spending money it had already committed.
 */
function common(snapshot: PolicySnapshot): { commands: CommandInput[]; busy: boolean } {
  const commands: CommandInput[] = [];

  /*
   * Say yes to the next stage — but not the instant it is offered.
   *
   * **The most expensive finding of the phase, and it is a game-design finding
   * rather than a simulator one.** Evolution *spends* the threshold: a stand
   * holding ₡804 that accepts Stage 3 is left with ₡4. Stage 3 serves food to
   * tables and cannot serve anybody without a waiter, so with ₡4 it cannot
   * operate; six minutes later its two cooks walked out unpaid and the
   * restaurant sat at **zero income, zero staff and zero customers for the
   * remaining ten hours of the run**. Cash never went negative, so nothing in
   * the game objected. There is no way back.
   *
   * A player would keep something back, and so does this: the next stage's
   * hiring bill plus a few minutes of its wages, on top of the price. The
   * underlying hazard — that the game will happily let you evolve into a stage
   * you cannot afford to run — is recorded in docs/BALANCE_REPORT.md as a design
   * risk, because a real player will do exactly what this policy did.
   */
  if (snapshot.canEvolve && !snapshot.constructing) {
    const nextStage = snapshot.stage + 1;
    const plan = STAFF_PLAN[nextStage] ?? [];
    const toHire = Math.max(0, plan.length - snapshot.employees);
    const openingFloat = toHire * MOST_EXPENSIVE_HIRE + plan.length * OPENING_WAGE_MINUTES * WAGE_PER_HEAD;
    // **On top of the price.** Evolution spends `cashRequired`; comparing the
    // float against the raw balance was the first version of this guard, and it
    // let a stand with ₡804 accept a ₡800 transition and open Stage 3 with ₡4.
    const price = requirementFor(snapshot.stage)?.cashRequired ?? 0;

    if (snapshot.cash >= price + openingFloat) {
      commands.push({ t: 'EVOLVE' });
      return { commands, busy: true };
    }
    // Not yet — and nothing else is bought either, because every credit is
    // being saved for the opening.
    return { commands, busy: true };
  }

  const needed = missingRole(snapshot);
  if (needed !== null) {
    const cost = HIRE_COST[needed] ?? 20;
    // Twice the hire cost, so a hire never takes the last credit — the first
    // wage payment falls due a minute later.
    if (snapshot.cash >= cost * 2) {
      commands.push({ t: 'HIRE', roleId: needed, skill: 0.5 });
      return { commands, busy: true };
    }
  }

  return { commands, busy: false };
}

function affordable(snapshot: PolicySnapshot): UpgradeOption[] {
  /*
   * Two budgets, and the second is the design's own.
   *
   * ECONOMY_DESIGN §3 costs each stage with an upgrade budget *and* a duration
   * in the same row — Stage 1 is twelve to eighteen minutes while spending ₡55
   * on upgrades. A policy that ignores the budget is not playing the stage the
   * table describes; measured, they spent ₡80 and took thirty minutes, and the
   * extra thirteen minutes were entirely the extra ₡25.
   */
  const stageBudget = STAGE_UPGRADE_BUDGET[snapshot.stage] ?? Number.POSITIVE_INFINITY;
  const remaining = stageBudget - snapshot.spentOnUpgradesThisStage;
  const budget = Math.min(spendable(snapshot), remaining);
  return snapshot.upgrades.filter((option) => option.cost <= budget);
}

/** Pick one by a score, highest wins; ties break on id so runs stay reproducible. */
function pick(
  options: readonly UpgradeOption[],
  score: (option: UpgradeOption) => number,
): UpgradeOption | null {
  let best: UpgradeOption | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const option of options) {
    const value = score(option);
    if (value > bestScore || (value === bestScore && best !== null && option.id < best.id)) {
      best = option;
      bestScore = value;
    }
  }
  return best;
}

function buying(option: UpgradeOption | null): CommandInput[] {
  return option === null ? [] : [{ t: 'BUY_UPGRADE', upgradeId: option.id }];
}

/**
 * The families each policy leans on.
 *
 * `throughput-first` buys the ability to serve more people; `margin-first` buys
 * the reasons they want to come. Both are real strategies and ECONOMY_DESIGN
 * §13 names both — the point of running them side by side is that neither
 * should be able to run away from the other.
 */
const THROUGHPUT_FAMILIES = new Set(['KITCHEN', 'CAPACITY', 'DRIVE_THRU']);
const MARGIN_FAMILIES = new Set(['VISIBILITY_APPEAL', 'STAFF']);

export const greedyCheapest: Policy = {
  id: 'greedy-cheapest',
  description: 'Always buys the cheapest upgrade it can afford.',
  decisionIntervalMs: 5_000,
  presence: 'attentive',
  decide(snapshot) {
    const base = common(snapshot);
    if (base.busy) return base.commands;
    return buying(pick(affordable(snapshot), (option) => -option.cost));
  },
};

export const roiOptimal: Policy = {
  id: 'roi-optimal',
  description: 'Buys the upgrade with the best effect-per-credit.',
  decisionIntervalMs: 5_000,
  presence: 'attentive',
  decide(snapshot) {
    const base = common(snapshot);
    if (base.busy) return base.commands;

    /*
     * Return is scored as **first-level effects per credit**, and levels beyond
     * the first are discounted because every family diminishes
     * (`combineDiminishing`, ECONOMY_DESIGN §6). Scoring by raw effect size
     * would make this policy identical to whichever family happens to publish
     * the largest numbers, which is a units artefact rather than a strategy.
     */
    return buying(
      pick(affordable(snapshot), (option) => {
        const diminishing = 1 / option.nextLevel;
        return diminishing / Math.max(1, option.cost);
      }),
    );
  },
};

export const throughputFirst: Policy = {
  id: 'throughput-first',
  description: 'Capacity and speed before anything else.',
  decisionIntervalMs: 5_000,
  presence: 'attentive',
  decide(snapshot) {
    const base = common(snapshot);
    if (base.busy) return base.commands;

    const options = affordable(snapshot);
    const preferred = options.filter((option) => THROUGHPUT_FAMILIES.has(option.family));
    // Falls back to anything rather than sitting on money it will never spend —
    // a policy that hoards is testing hoarding, not throughput.
    return buying(pick(preferred.length > 0 ? preferred : options, (option) => -option.cost));
  },
};

export const marginFirst: Policy = {
  id: 'margin-first',
  description: 'Demand and quality before capacity.',
  decisionIntervalMs: 5_000,
  presence: 'attentive',
  decide(snapshot) {
    const base = common(snapshot);
    if (base.busy) return base.commands;

    const options = affordable(snapshot);
    const preferred = options.filter((option) => MARGIN_FAMILIES.has(option.family));
    return buying(pick(preferred.length > 0 ? preferred : options, (option) => -option.cost));
  },
};

export const idlePlayer: Policy = {
  id: 'idle-player',
  description: 'Checks in every five minutes, buys one thing, leaves.',
  decisionIntervalMs: 300_000,
  presence: 'periodic',
  decide(snapshot) {
    const base = common(snapshot);
    if (base.busy) return base.commands;

    /*
     * Hires earlier than the others, relative to how much it plays. An idle
     * player's whole relationship with the game is that the kitchen runs while
     * they are not there, so staff is not one purchase among many for them — it
     * is the only thing that makes the next five minutes worth anything.
     */
    /*
     * Hires the moment the game allows it, which is Stage 2. An idle player's
     * whole relationship with the game is that the kitchen runs while they are
     * not there, so staff is not one purchase among many for them — it is the
     * only thing that makes the next five minutes worth anything. At Stage 1
     * there is nobody to hire, and that is the point of Stage 1.
     */
    if (snapshot.stage >= 2 && snapshot.employees === 0 && snapshot.cash >= 40) {
      return [{ t: 'HIRE', roleId: 'cook', skill: 0.5 }];
    }
    return buying(pick(affordable(snapshot), (option) => -option.cost));
  },
};

export const POLICIES: readonly Policy[] = [
  greedyCheapest,
  roiOptimal,
  throughputFirst,
  marginFirst,
  idlePlayer,
];
