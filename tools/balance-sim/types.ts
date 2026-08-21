import type { CommandInput } from '@sim/core/commands';

/**
 * The balance simulator's contract — GAME_EXECUTION_ROADMAP Phase 12,
 * ECONOMY_DESIGN §13.
 *
 * ## What this is for
 *
 * Economy balance is the thing that kills this genre, and it is normally
 * defended by somebody playing for an afternoon and saying it felt about right.
 * This turns the design's own envelope — ECONOMY_DESIGN §3 — into **ten
 * assertions that run in CI**, so a config change that breaks the pacing cannot
 * be merged.
 *
 * ## Why policies rather than a script
 *
 * A single recorded playthrough proves one path. The five policies are five
 * *different* readings of "a reasonable player" — cheapest-first, best-return,
 * capacity-first, quality-first, and somebody who checks in every five minutes —
 * and the interesting assertions are about the **spread between them**. If one
 * policy is 2.5× better than another, there is a single correct strategy and the
 * upgrade tree is decoration.
 *
 * ## Why the policy is a pure function
 *
 * It returns commands and touches nothing. That is what lets the same policy run
 * against a real `Sim` here, be replayed from a command log, and be reasoned
 * about without a world in front of you — and it is the same discipline
 * `src/sim` itself is held to.
 */

/** One upgrade, as a policy sees it. */
export interface UpgradeOption {
  readonly id: string;
  readonly family: string;
  /** The level that would be bought next, counting from 1. */
  readonly nextLevel: number;
  /** What that level costs right now, at the current stage. */
  readonly cost: number;
  /** Levels already owned. */
  readonly level: number;
  readonly maxLevel: number;
  /** Effect kinds this upgrade touches, e.g. `['visibility']`. */
  readonly effects: readonly string[];
}

/**
 * Everything a policy is allowed to know.
 *
 * A snapshot rather than the world: a policy that could reach into `World` could
 * also read a private RNG cursor and "decide" on it, and the run would stop
 * being a statement about *play*.
 */
export interface PolicySnapshot {
  readonly tick: number;
  /** Simulated minutes since the run started. */
  readonly minutes: number;
  readonly stage: number;
  readonly cash: number;
  /** Net income per simulated minute, from the same window the HUD reads. */
  readonly netIncomePerMinute: number;
  readonly customersServed: number;
  readonly reputation: number;
  readonly employees: number;
  /**
   * How many of each role are on the payroll.
   *
   * A total is not enough. Stage 3 serves food to tables and a table needs a
   * *waiter*; a policy that only knew it had "one employee" hired a second cook
   * and the restaurant stopped serving anybody. Measured: 414 customers, then a
   * flat line for ten hours.
   */
  readonly employeesByRole: Readonly<Record<string, number>>;
  readonly upgradesBought: number;
  /** Credits already spent on upgrades since entering this stage. */
  readonly spentOnUpgradesThisStage: number;
  readonly upgrades: readonly UpgradeOption[];
  /** The next stage is unlocked and waiting for the player to say yes. */
  readonly canEvolve: boolean;
  readonly constructing: boolean;
}

/**
 * Whether the player is at the controls between decisions.
 *
 * Load-bearing at Stage 1, where food is prepared by clicking: an `attentive`
 * player cooks on every tick and a `periodic` one cooks on none. That is not a
 * detail of the harness, it is the difference the `idle-player` policy exists to
 * measure.
 */
export type Presence = 'attentive' | 'periodic';

export interface Policy {
  readonly id: string;
  /** One line, for the report. */
  readonly description: string;
  /** How often the policy is consulted, in simulated milliseconds. */
  readonly decisionIntervalMs: number;
  readonly presence: Presence;
  decide(snapshot: PolicySnapshot): readonly CommandInput[];
}

/** One row of the income/pacing trace, sampled at a fixed interval. */
export interface Sample {
  readonly minutes: number;
  readonly stage: number;
  readonly cash: number;
  readonly netIncomePerMinute: number;
  /**
   * The same figure averaged over one in-game day.
   *
   * The traffic curve's period is exactly one day and its peak multiplier is
   * ×2.2 to ×2.5, so the instantaneous reading at noon is more than twice the
   * same economy's reading at dawn. ECONOMY_DESIGN §3's envelope is a per-minute
   * figure for a *stage*, not for an hour, and this is the one that means the
   * same thing. Zero until a full day has been observed.
   */
  readonly sustainedIncomePerMinute: number;
  readonly customersServed: number;
  readonly upgradesBought: number;
  readonly employees: number;
}

/** What a purchase did to the income curve — the "no regressions" assertion. */
export interface PurchaseRecord {
  readonly minutes: number;
  readonly upgradeId: string;
  readonly level: number;
  readonly cost: number;
  /** Net income per minute averaged over the window before the purchase. */
  readonly incomeBefore: number;
  /** And after it had time to take effect. */
  readonly incomeAfter: number;
}

/** The cheapest unowned upgrade, measured in seconds of current income. */
export interface DeadEndProbe {
  readonly minutes: number;
  readonly stage: number;
  readonly cheapestCost: number;
  readonly incomePerMinute: number;
  /** How many seconds of income the cheapest upgrade costs. */
  readonly secondsOfIncome: number;
}

export interface RunResult {
  readonly policy: string;
  readonly seed: number;
  readonly minutesSimulated: number;
  /** When each stage was first entered, in simulated minutes. Absent = never. */
  readonly stageEnteredAtMinute: Readonly<Record<number, number | undefined>>;
  readonly samples: readonly Sample[];
  readonly purchases: readonly PurchaseRecord[];
  readonly deadEndProbes: readonly DeadEndProbe[];
  readonly finalCash: number;
  readonly minCash: number;
  readonly finalIncomePerMinute: number;
  readonly peakIncomePerMinute: number;
  /** The highest day-long average seen, which is the envelope's own quantity. */
  readonly peakSustainedIncomePerMinute: number;
  readonly customersServed: number;
  readonly upgradesBought: number;
  /** Upgrade ids with at least one level left unbought at the end. */
  readonly unboughtUpgrades: readonly string[];
  /** Wall-clock cost of the run, for the CI budget. */
  readonly wallClockMs: number;
}
