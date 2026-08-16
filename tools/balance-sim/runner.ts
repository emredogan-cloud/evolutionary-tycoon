import { TICK_MS } from '@config/simulation';
import { UPGRADES } from '@config/economy/upgrades';
import { Sim } from '@sim/core/Sim';
import type { World } from '@sim/core/World';
import { EMPLOYEE_ROLES } from '@config/employees';
import { netIncomePerMinute } from '@sim/systems/EconomySystem';
import { nextUpgradeCost, upgradeLevel, totalUpgradeLevels } from '@sim/systems/UpgradeSystem';
import type {
  DeadEndProbe,
  Policy,
  PolicySnapshot,
  PurchaseRecord,
  RunResult,
  Sample,
  UpgradeOption,
} from './types';

/**
 * Play the game, headless, as fast as the machine will go — Phase 12.
 *
 * ## The real core, not a model of it
 *
 * This drives `src/sim` itself. A separate spreadsheet model of the economy
 * would be quicker to write and would answer a different question: it would tell
 * you what the *designer* thinks happens, and the entire value of this tool is
 * that it tells you what actually happens — including the parts nobody modelled,
 * like a queue that spills onto the road and cuts its own demand off.
 *
 * Measured: **4.84 µs per tick** in a Stage 1 world, so twelve simulated hours
 * cost about four seconds. That is what makes iterating on the config a matter
 * of seconds rather than of an afternoon, which is the whole reason the roadmap
 * put this phase after every system existed rather than before.
 *
 * ## No renderer, no clock, no randomness of its own
 *
 * The runner never reads a clock to decide anything — `wallClockMs` is measured
 * and reported but never fed back in — and it introduces no randomness. Same
 * seed, same policy, same numbers, on any machine.
 */

/** Sampled every thirty simulated seconds. Fine enough to see a stage change. */
const SAMPLE_INTERVAL_MS = 30_000;

/**
 * How long a purchase is given before its effect is judged.
 *
 * The income window is one minute wide (`ECONOMY_WINDOW_MS`), so comparing the
 * minute before a purchase with the minute after it would compare two windows
 * that overlap the purchase itself. Two minutes clears it entirely.
 */
const PURCHASE_SETTLE_MS = 120_000;

/**
 * Dead-end probing does not start until the income window has filled.
 *
 * `netIncomePerMinute` averages the last sixty seconds, so before then it is
 * low for an arithmetic reason rather than an economic one — and the dead-end
 * rule is a ratio against it. The first run reported an infinite dead end at
 * t = 0 in every policy, which is a statement about division, not about balance.
 */
const WARM_UP_MS = 90_000;

/** One in-game day, and the period of the traffic curve — `MS_PER_GAME_DAY`. */
const DAY_MS = 720_000;

/**
 * How long a `periodic` player stays when they check in.
 *
 * ECONOMY_DESIGN §13 describes `idle-player` as _"log in every five minutes, buy
 * one upgrade, log out"_. Read literally as a single click, the policy served
 * **six customers in ninety minutes** against 240 for everyone else — a 40×
 * spread that says nothing about the economy and everything about the fact that
 * Stage 1 food is prepared by hand.
 *
 * Sixty seconds is the honest reading: somebody who opens the tab does serve the
 * queue while they are there. It is still a fifth of the attention the other
 * policies pay, which is the difference the policy exists to measure.
 */
const PERIODIC_SESSION_MS = 60_000;

export interface RunOptions {
  readonly policy: Policy;
  readonly seed: number;
  readonly minutes: number;
}

/**
 * The upgrades a policy could buy right now.
 *
 * **Purchasable, not merely existing** — Phase 13. The tree has thirty upgrades
 * across four stages with prerequisite chains, so most of it is locked at any
 * moment. A policy offered the whole list would spend its turn asking for things
 * the simulation refuses, which reads in the results as a policy that saves
 * money for no reason.
 */
function optionsFor(world: World): UpgradeOption[] {
  const options: UpgradeOption[] = [];
  for (const item of UPGRADES) {
    const level = upgradeLevel(world, item.id);
    if (level >= item.maxLevel) continue;
    if (item.stage > world.progression.stage) continue;
    if (item.prereqs.some((prereq) => upgradeLevel(world, prereq) <= 0)) continue;
    options.push({
      id: item.id,
      family: item.family,
      nextLevel: level + 1,
      cost: nextUpgradeCost(world, item.id),
      level,
      maxLevel: item.maxLevel,
      effects: item.effects.map((effect) => effect.kind),
    });
  }
  return options;
}

/** Heads per role id. Allocated per call; the policy runs once every hundred ticks. */
function roleCounts(world: World): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let slot = 0; slot < world.employees.scanLimit; slot++) {
    if (!world.employees.isActive(slot)) continue;
    const id = EMPLOYEE_ROLES[world.employees.at(slot).role]?.id;
    if (id === undefined) continue;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

function snapshot(world: World, tick: number, spentThisStage: number): PolicySnapshot {
  return {
    tick,
    minutes: (tick * TICK_MS) / 60_000,
    stage: world.progression.stage,
    cash: world.economy.cash,
    netIncomePerMinute: netIncomePerMinute(world),
    customersServed: world.stats.customersServed,
    reputation: world.economy.reputation,
    employees: world.employees.activeCount,
    employeesByRole: roleCounts(world),
    upgradesBought: totalUpgradeLevels(world),
    spentOnUpgradesThisStage: spentThisStage,
    upgrades: optionsFor(world),
    canEvolve: world.progression.pendingStage > 0,
    constructing: world.construction.targetStage !== 0,
  };
}

/**
 * The cheapest upgrade still available, in seconds of current income.
 *
 * ECONOMY_DESIGN §8's dead-end rule, measured rather than asserted: _"at no
 * point may the cheapest meaningful upgrade cost more than ninety seconds of
 * income"_. Returns null when there is nothing left to buy, which is a different
 * situation entirely — content exhaustion, covered by its own assertion.
 */
function probeDeadEnd(world: World, minutes: number, sustainedIncome: number): DeadEndProbe | null {
  const options = optionsFor(world);
  if (options.length === 0) return null;

  let cheapest = Number.POSITIVE_INFINITY;
  for (const option of options) cheapest = Math.min(cheapest, option.cost);

  /*
   * The **day average**, not the sixty-second window.
   *
   * The window version reported an unreachable dead end at 13 minutes into a
   * healthy run: the stand was in a night hour, had sold nothing for a minute,
   * and dividing a price by zero says the game is dead. Three in the morning is
   * not a dead end, it is three in the morning — and ECONOMY_DESIGN §8's rule is
   * about whether the *economy* can afford the next upgrade, which is a question
   * about a day rather than about a minute.
   */
  const income = sustainedIncome;
  /*
   * A non-positive income still means the ninety-second rule cannot be evaluated
   * rather than that it is violated — you cannot express a price in seconds of
   * an income you do not have. Reported as `Infinity` so the assertion can see
   * it and decide; silently returning a large number would let a genuinely dead
   * economy read as a merely expensive one.
   */
  const secondsOfIncome = income > 0 ? (cheapest / income) * 60 : Number.POSITIVE_INFINITY;

  return {
    minutes,
    stage: world.progression.stage,
    cheapestCost: cheapest,
    incomePerMinute: income,
    secondsOfIncome,
  };
}

export function runPolicy(options: RunOptions): RunResult {
  const startedAt = process.hrtime.bigint();

  const sim = new Sim({ seed: options.seed });
  const world = sim.world;

  const totalTicks = Math.round((options.minutes * 60_000) / TICK_MS);
  const sampleEvery = Math.round(SAMPLE_INTERVAL_MS / TICK_MS);
  const decideEvery = Math.max(1, Math.round(options.policy.decisionIntervalMs / TICK_MS));
  const settleTicks = Math.round(PURCHASE_SETTLE_MS / TICK_MS);

  const samples: Sample[] = [];
  const purchases: PurchaseRecord[] = [];
  const deadEndProbes: DeadEndProbe[] = [];
  const stageEnteredAtMinute: Record<number, number | undefined> = { 1: 0 };

  /** Purchases waiting for their after-income reading. */
  const pending: { at: number; record: Omit<PurchaseRecord, 'incomeAfter'> }[] = [];

  let minCash = world.economy.cash;
  let peakIncome = 0;
  /*
   * A day-long rolling mean of the income window, kept alongside the raw one.
   *
   * The traffic curve has a period of exactly one in-game day and a peak-hour
   * multiplier of ×2.2 to ×2.5 (ECONOMY_DESIGN §3), so the *instantaneous*
   * income at noon is more than twice the same economy's income at four in the
   * morning. Comparing either against a designed "income per minute" compares
   * an hour against a day. Averaging over one full day is what makes the two
   * the same quantity.
   */
  const daySamples: number[] = [];
  const daySampleLimit = Math.round(DAY_MS / SAMPLE_INTERVAL_MS);
  let peakSustainedIncome = 0;
  let lastLevels = totalUpgradeLevels(world);
  let stage = world.progression.stage;
  /** Reset at every transition — the design's budget is per stage, not lifetime. */
  let spentThisStage = 0;
  let lastSpend = world.economy.lifetimeSpend;

  for (let tick = 0; tick < totalTicks; tick++) {
    /*
     * Manual preparation, every tick, for an attentive player. Stage 1 has no
     * kitchen staff until one is hired, so this is not flavour — it is the
     * difference between a stand that sells and a stand that does not, and it
     * is exactly what `idle-player` is defined by not doing.
     */
    const sinceVisit = (tick % decideEvery) * TICK_MS;
    const present = options.policy.presence === 'attentive' || sinceVisit < PERIODIC_SESSION_MS;
    if (present) sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });

    if (tick % decideEvery === 0) {
      const view = snapshot(world, tick, spentThisStage);
      const before = view.netIncomePerMinute;

      for (const command of options.policy.decide(view)) {
        sim.dispatch(command);
        if (command.t === 'BUY_UPGRADE') {
          const item = UPGRADES.find((entry) => entry.id === command.upgradeId);
          if (item === undefined) continue;
          pending.push({
            at: tick + settleTicks,
            record: {
              minutes: view.minutes,
              upgradeId: command.upgradeId,
              level: upgradeLevel(world, command.upgradeId) + 1,
              cost: nextUpgradeCost(world, command.upgradeId),
              incomeBefore: before,
            },
          });
        }
      }
    }

    sim.tick();

    if (world.economy.cash < minCash) minCash = world.economy.cash;

    spentThisStage += world.economy.lifetimeSpend - lastSpend;
    lastSpend = world.economy.lifetimeSpend;

    if (world.progression.stage !== stage) {
      stage = world.progression.stage;
      stageEnteredAtMinute[stage] ??= (tick * TICK_MS) / 60_000;
      spentThisStage = 0;
    }

    // A purchase whose settle window has elapsed gets its after-reading.
    while (pending.length > 0 && (pending[0]?.at ?? Number.POSITIVE_INFINITY) <= tick) {
      const entry = pending.shift();
      if (entry === undefined) break;
      const levels = totalUpgradeLevels(world);
      // Only recorded if the purchase actually happened — a policy may ask for
      // something it cannot afford, and the simulation is entitled to refuse.
      if (levels > lastLevels) {
        purchases.push({ ...entry.record, incomeAfter: netIncomePerMinute(world) });
        lastLevels = levels;
      }
    }

    if (tick % sampleEvery === 0) {
      const income = netIncomePerMinute(world);
      if (income > peakIncome) peakIncome = income;

      daySamples.push(income);
      if (daySamples.length > daySampleLimit) daySamples.shift();
      const sustained =
        daySamples.length < daySampleLimit
          ? 0
          : daySamples.reduce((total, value) => total + value, 0) / daySamples.length;
      if (sustained > peakSustainedIncome) peakSustainedIncome = sustained;

      samples.push({
        minutes: (tick * TICK_MS) / 60_000,
        stage: world.progression.stage,
        cash: world.economy.cash,
        netIncomePerMinute: income,
        sustainedIncomePerMinute: sustained,
        customersServed: world.stats.customersServed,
        upgradesBought: totalUpgradeLevels(world),
        employees: world.employees.activeCount,
      });

      /*
       * Not until there is an income to divide by: one full day observed (so
       * `sustained` is real), and at least one sale made. Both guards were added
       * because the probe reported an *infinite* dead end in healthy runs —
       * first in the opening second, then at thirteen minutes during a night
       * hour. Neither was a dead end; both were a division by a window that
       * happened to be empty.
       */
      if (tick * TICK_MS >= WARM_UP_MS && sustained > 0 && world.stats.customersServed > 0) {
        const probe = probeDeadEnd(world, (tick * TICK_MS) / 60_000, sustained);
        if (probe !== null) deadEndProbes.push(probe);
      }
    }
  }

  const unbought = UPGRADES.filter((item) => upgradeLevel(world, item.id) < item.maxLevel).map(
    (item) => item.id,
  );

  return {
    policy: options.policy.id,
    seed: options.seed,
    minutesSimulated: options.minutes,
    stageEnteredAtMinute,
    samples,
    purchases,
    deadEndProbes,
    finalCash: world.economy.cash,
    minCash,
    finalIncomePerMinute: netIncomePerMinute(world),
    peakIncomePerMinute: peakIncome,
    peakSustainedIncomePerMinute: peakSustainedIncome,
    customersServed: world.stats.customersServed,
    upgradesBought: totalUpgradeLevels(world),
    unboughtUpgrades: unbought,
    wallClockMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
  };
}
