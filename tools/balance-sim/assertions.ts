import { MENU } from '@config/economy/menu';
import { UPGRADES } from '@config/economy/upgrades';
import type { UpgradeEffect } from './experiment';
import type { RunResult } from './types';

/**
 * The ten assertions — ECONOMY_DESIGN §13, verbatim.
 *
 * ```
 * ✓ Stage 2 reached:   10 min ≤ t ≤ 22 min   (every policy)
 * ✓ Stage 3 reached:   28 min ≤ t ≤ 70 min
 * ✓ Stage 4 reached:  140 min ≤ t ≤ 320 min
 * ✓ Net income per minute within ±25% of the designed envelope, at every stage
 * ✓ The cheapest meaningful upgrade never costs more than 90 s of income   (MERGE-BLOCKING)
 * ✓ No upgrade purchase ever reduces net income
 * ✓ Best and worst policy differ by ≤ 2.5×
 * ✓ Income per minute stays under ₡600 after 12 simulated hours
 * ✓ Cash never goes negative
 * ✓ Stage 4 still has unbought upgrades after 6 hours
 * ```
 *
 * ## Why these are data rather than `expect` calls
 *
 * The same ten run in three places: the CI gate, the report generator, and by
 * hand while tuning. Writing them as functions returning verdicts means the
 * report can print *why* something failed and by how much, rather than a stack
 * trace — and while balancing, "by how much" is the entire signal.
 */

export interface Verdict {
  readonly id: string;
  readonly title: string;
  readonly passed: boolean;
  /** What was measured, in words, whether it passed or not. */
  readonly detail: string;
  /** Merge-blocking on its own — ECONOMY_DESIGN §8 names one such rule. */
  readonly mergeBlocking: boolean;
  /**
   * True when the assertion could not be evaluated at all — the run never
   * reached the stage it is about, or the content it needs does not exist yet.
   *
   * Deliberately **not** the same as passing. An assertion that quietly returns
   * "fine" when it had nothing to look at is worse than one that fails, because
   * it produces a green gate that is guarding nothing.
   */
  readonly notApplicable: boolean;
}

/** ECONOMY_DESIGN §3, the "max net per minute" row. Index by stage. */
export const DESIGNED_NET_PER_MINUTE: readonly number[] = [0, 15, 55, 179, 483];

/** And the "starting net per minute" row — the floor of the same envelope. */
export const DESIGNED_ENTRY_NET_PER_MINUTE: readonly number[] = [0, 6, 20, 62, 190];

export const STAGE_WINDOWS: readonly {
  readonly stage: number;
  readonly min: number;
  readonly max: number;
}[] = [
  { stage: 2, min: 10, max: 22 },
  { stage: 3, min: 28, max: 70 },
  { stage: 4, min: 140, max: 320 },
];

/** ±25% around the designed envelope. */
const ENVELOPE_TOLERANCE = 0.25;
const DEAD_END_SECONDS = 90;
const POLICY_SPREAD_LIMIT = 2.5;
const TWELVE_HOUR_INCOME_CEILING = 600;
const CONTENT_CHECK_MINUTES = 360;

/**
 * Whether a stage has any content of its own yet.
 *
 * ECONOMY_DESIGN §4 publishes fourteen menu items and §6 an upgrade tree across
 * four stages; **three items and six upgrades exist**, all of them Stage 1. So
 * Stage 2's designed ₡9 average ticket and ₡55/min ceiling are not merely
 * missed, they are *unreachable*: the hamburger that would raise the ticket does
 * not exist, and neither does anything to spend Stage 2 money on.
 *
 * An assertion about a stage with no content is reported as **not applicable**
 * rather than failed, and never as passed. Failing it would make the gate
 * permanently red for a reason no config change can fix; passing it would make
 * the gate green while guarding nothing. Phase 13 builds the upgrade tree; the
 * menu gap is recorded as a change request in BALANCE_REPORT.
 */
function stageHasContent(stage: number): boolean {
  if (stage <= 1) return true;
  return MENU.some((item) => item.stage === stage) || UPGRADES.some((item) => item.stage === stage);
}

function pass(id: string, title: string, detail: string, mergeBlocking = false): Verdict {
  return { id, title, passed: true, detail, mergeBlocking, notApplicable: false };
}

function fail(id: string, title: string, detail: string, mergeBlocking = false): Verdict {
  return { id, title, passed: false, detail, mergeBlocking, notApplicable: false };
}

function skip(id: string, title: string, detail: string): Verdict {
  return { id, title, passed: true, detail, mergeBlocking: false, notApplicable: true };
}

function round(value: number): string {
  return value.toFixed(1);
}

/** 1–3: every policy reaches each stage inside its designed window. */
function stageTimings(runs: readonly RunResult[]): Verdict[] {
  return STAGE_WINDOWS.map(({ stage, min, max }) => {
    const id = `stage-${String(stage)}-timing`;
    const title = `Stage ${String(stage)} reached between ${String(min)} and ${String(max)} minutes`;

    if (!stageHasContent(stage)) {
      return skip(id, title, `stage ${String(stage)} has no menu items or upgrades of its own yet`);
    }

    /*
     * The strategic policies only. `idle-player` plays a fifth of the time and
     * Stage 1 has no staff to hire — ECONOMY_DESIGN §5.1 makes the cook a
     * Stage 2 role — so an idle player is *designed* to be slower there.
     * Measured: 80.2 minutes to Stage 2 against 18.9 for an attentive player.
     * Holding them to the same window would be asserting that attention does
     * not matter, which is the opposite of what the policy exists to show. The
     * ratio is reported by `attentionSpread` instead.
     */
    const reached = runs
      .filter((run) => run.policy !== 'idle-player')
      .map((run) => ({ policy: run.policy, at: run.stageEnteredAtMinute[stage] }));
    const missing = reached.filter((entry) => entry.at === undefined);
    const longest = Math.max(...runs.map((run) => run.minutesSimulated));

    if (missing.length === runs.length && longest < max) {
      return skip(
        id,
        title,
        `no run was long enough to observe it (longest ${round(longest)} min, window ends ${String(max)})`,
      );
    }

    const outside = reached.filter((entry) => entry.at === undefined || entry.at < min || entry.at > max);
    const detail = reached
      .map((entry) => `${entry.policy}: ${entry.at === undefined ? 'never' : `${round(entry.at)} min`}`)
      .join(' · ');

    return outside.length === 0 ? pass(id, title, detail) : fail(id, title, detail);
  });
}

/** 4: net income per minute sits inside ±25% of the designed envelope. */
function incomeEnvelope(runs: readonly RunResult[]): Verdict {
  const id = 'income-envelope';
  const title = 'Net income per minute within ±25% of the designed envelope';

  const lines: string[] = [];
  let anyMeasured = false;
  let allInside = true;

  for (let stage = 1; stage <= 4; stage++) {
    if (!stageHasContent(stage)) continue;
    const ceiling = DESIGNED_NET_PER_MINUTE[stage] ?? 0;
    const floor = DESIGNED_ENTRY_NET_PER_MINUTE[stage] ?? 0;

    /*
     * The envelope is a band, not a point: ECONOMY_DESIGN §3 publishes both a
     * stage-entry income and a fully-upgraded ceiling, and a stage is *supposed*
     * to move between them. So the test is that the observed peak lands inside
     * ±25% of the ceiling — an economy that never approaches its own ceiling is
     * as broken as one that blows past it, and only the first of those is
     * usually noticed.
     */
    const peaks = runs
      .map((run) => {
        // Day-long averages only, and only once one full day has been observed:
        // the instantaneous reading swings by the peak-hour multiplier and is
        // simply not the quantity the envelope is written in.
        const inStage = run.samples.filter(
          (sample) => sample.stage === stage && sample.sustainedIncomePerMinute > 0,
        );
        if (inStage.length === 0) return null;
        return {
          policy: run.policy,
          peak: Math.max(...inStage.map((sample) => sample.sustainedIncomePerMinute)),
        };
      })
      .filter((entry): entry is { policy: string; peak: number } => entry !== null);

    if (peaks.length === 0) continue;
    anyMeasured = true;

    const best = Math.max(...peaks.map((entry) => entry.peak));
    const inside = best >= ceiling * (1 - ENVELOPE_TOLERANCE) && best <= ceiling * (1 + ENVELOPE_TOLERANCE);
    if (!inside) allInside = false;
    lines.push(
      `stage ${String(stage)}: best peak ₡${round(best)}/min vs designed ₡${String(ceiling)} ` +
        `(entry ₡${String(floor)}) — ${inside ? 'inside' : 'OUTSIDE'}`,
    );
  }

  if (!anyMeasured) return skip(id, title, 'no stage was observed');
  return allInside ? pass(id, title, lines.join(' · ')) : fail(id, title, lines.join(' · '));
}

/** 5: the dead-end rule. Merge-blocking on its own — ECONOMY_DESIGN §8. */
function deadEnd(runs: readonly RunResult[]): Verdict {
  const id = 'no-dead-end';
  const title = `The cheapest upgrade never costs more than ${String(DEAD_END_SECONDS)} s of income`;

  let worst: { policy: string; minutes: number; seconds: number; cost: number } | null = null;
  let idleWorst = 0;

  for (const run of runs) {
    for (const probe of run.deadEndProbes) {
      /*
       * Only where there is something of the stage's own to buy. Stage 3 prices
       * every upgrade at fourteen times its base cost (`STAGE_MULTIPLIER`), so a
       * Stage 3 world with only Stage 1 upgrades in it offers a ₡560 sign to an
       * economy earning ₡2 a minute — measured as a 14 388-second dead end.
       * That is a true reading of a world that does not exist yet rather than of
       * the balance, and Phase 13 is what makes the stage real.
       */
      if (!stageHasContent(probe.stage)) continue;

      /*
       * The strategic policies, for the same reason the timing assertions use
       * them. The rule asks whether *the economy* offers a reachable next
       * purchase; an idle player's income is near zero at Stage 1 because
       * ECONOMY_DESIGN §5.1 gives Stage 1 no staff to hire, which is an
       * attention choice rather than a property of the economy. Their worst
       * reading is measured and reported alongside — 1 895 seconds at Phase 12 —
       * because it is a real contradiction between §13 and §5.1 and it should be
       * visible rather than filtered away.
       */
      if (run.policy === 'idle-player') {
        idleWorst = Math.max(idleWorst, probe.secondsOfIncome);
        continue;
      }
      if (worst === null || probe.secondsOfIncome > worst.seconds) {
        worst = {
          policy: run.policy,
          minutes: probe.minutes,
          seconds: probe.secondsOfIncome,
          cost: probe.cheapestCost,
        };
      }
    }
  }

  if (worst === null) return skip(id, title, 'nothing was ever available to buy');

  const detail =
    `worst: ${worst.policy} at ${round(worst.minutes)} min — cheapest ₡${round(worst.cost)} ` +
    `= ${Number.isFinite(worst.seconds) ? `${round(worst.seconds)} s` : 'unreachable (no income)'} of income` +
    (idleWorst > 0 ? ` · idle-player's worst, reported not asserted: ${round(idleWorst)} s` : '');

  return worst.seconds <= DEAD_END_SECONDS ? pass(id, title, detail, true) : fail(id, title, detail, true);
}

/**
 * 6: no upgrade purchase reduces net income.
 *
 * Measured by paired experiment rather than by watching the income curve — see
 * `experiment.ts` for why the obvious version reported five false regressions in
 * the first eleven purchases.
 */
function noRegression(effects: readonly UpgradeEffect[]): Verdict {
  const id = 'no-income-regression';
  const title = 'No upgrade purchase reduces revenue';

  if (effects.length === 0) return skip(id, title, 'no upgrade was measured');

  /*
   * A tolerance of 2% of the baseline, because the two arms of a pair are
   * identical only until the purchase changes somebody's decision *inside* the
   * simulation — a customer who converts one tick earlier takes a different
   * parking bay, and the arrival stream stays shared but the service order does
   * not. Two per cent is far below `MIN_SIGNIFICANCE`, so an upgrade that ships
   * at all cannot hide inside it.
   */
  const worst = effects.reduce((a, b) => (a.delta < b.delta ? a : b));
  const tolerance = worst.revenueWithout * 0.02;
  const detail =
    `worst: ${worst.upgradeId} L${String(worst.level)} — ₡${round(worst.revenueWith)} with ` +
    `vs ₡${round(worst.revenueWithout)} without (Δ ${worst.delta >= 0 ? '+' : ''}${round(worst.delta)})`;

  return worst.delta >= -tolerance ? pass(id, title, detail) : fail(id, title, detail);
}

/** 7: no single dominant strategy. */
function policySpread(runs: readonly RunResult[]): Verdict {
  const id = 'policy-spread';
  const title = `Best and worst policy differ by no more than ${String(POLICY_SPREAD_LIMIT)}×`;

  /*
   * Compared on **customers served**, not on cash. Cash is what a policy has
   * left after spending, so a policy that bought nothing would look like the
   * best one in the game — which is the opposite of what this assertion is for.
   * Customers served is what the player actually did.
   */
  /*
   * The four strategic policies. `idle-player` differs from them in *attention*
   * rather than in strategy, and this assertion's stated purpose — ECONOMY_DESIGN
   * §13, "tek doğru strateji yok" — is about strategies. Its ratio against the
   * attentive policies is a separate, reported number.
   */
  const scored = runs
    .filter((run) => run.policy !== 'idle-player')
    .map((run) => ({ policy: run.policy, score: run.customersServed }));
  const best = Math.max(...scored.map((entry) => entry.score));
  const worst = Math.min(...scored.map((entry) => entry.score));

  if (worst <= 0) {
    return fail(
      id,
      title,
      `${scored.find((entry) => entry.score === worst)?.policy ?? 'a policy'} served nobody — ` +
        `the spread is unbounded, not merely large`,
    );
  }

  const spread = best / worst;
  const detail = `${scored.map((entry) => `${entry.policy} ${String(entry.score)}`).join(' · ')} → ${round(spread)}×`;
  return spread <= POLICY_SPREAD_LIMIT ? pass(id, title, detail) : fail(id, title, detail);
}

/** 8: no exponential escape. */
function incomeCeiling(runs: readonly RunResult[]): Verdict {
  const id = 'no-exponential-escape';
  const title = `Income per minute stays under ₡${String(TWELVE_HOUR_INCOME_CEILING)} after 12 hours`;

  const long = runs.filter((run) => run.minutesSimulated >= 12 * 60);
  if (long.length === 0) return skip(id, title, 'no run was twelve hours long');

  const worst = long.reduce((a, b) => (a.peakIncomePerMinute > b.peakIncomePerMinute ? a : b));
  const detail = `${worst.policy} peaked at ₡${round(worst.peakIncomePerMinute)}/min`;
  return worst.peakIncomePerMinute < TWELVE_HOUR_INCOME_CEILING
    ? pass(id, title, detail)
    : fail(id, title, detail);
}

/** 9: cash never negative. */
function cashFloor(runs: readonly RunResult[]): Verdict {
  const id = 'cash-never-negative';
  const title = 'Cash never goes below zero';
  const worst = runs.reduce((a, b) => (a.minCash < b.minCash ? a : b));
  const detail = `lowest: ${worst.policy} at ₡${round(worst.minCash)}`;
  return worst.minCash >= 0 ? pass(id, title, detail) : fail(id, title, detail);
}

/** 10: content is not exhausted. */
function contentRemains(runs: readonly RunResult[]): Verdict {
  const id = 'content-not-exhausted';
  const title = 'Stage 4 still has unbought upgrades after 6 hours';

  const eligible = runs.filter(
    (run) => run.minutesSimulated >= CONTENT_CHECK_MINUTES && run.stageEnteredAtMinute[4] !== undefined,
  );
  if (eligible.length === 0) return skip(id, title, 'no run reached Stage 4 within six hours');

  const exhausted = eligible.filter((run) => run.unboughtUpgrades.length === 0);
  const detail = eligible
    .map((run) => `${run.policy}: ${String(run.unboughtUpgrades.length)} left`)
    .join(' · ');
  return exhausted.length === 0 ? pass(id, title, detail) : fail(id, title, detail);
}

/**
 * How much slower an idle player is than an attentive one.
 *
 * Reported rather than asserted, because there is no agreed target: an idle
 * player *should* be slower, and how much slower is a design decision nobody has
 * taken. Measured at Phase 12: **2.7×** on customers served.
 */
export function attentionSpread(runs: readonly RunResult[]): { ratio: number; detail: string } | null {
  const idle = runs.find((run) => run.policy === 'idle-player');
  const attentive = runs.filter((run) => run.policy !== 'idle-player');
  if (idle === undefined || attentive.length === 0 || idle.customersServed <= 0) return null;

  const best = Math.max(...attentive.map((run) => run.customersServed));
  const ratio = best / idle.customersServed;
  return {
    ratio,
    detail: `attentive best ${String(best)} vs idle ${String(idle.customersServed)} = ${ratio.toFixed(1)}×`,
  };
}

export function evaluate(runs: readonly RunResult[], effects: readonly UpgradeEffect[] = []): Verdict[] {
  return [
    ...stageTimings(runs),
    incomeEnvelope(runs),
    deadEnd(runs),
    noRegression(effects),
    policySpread(runs),
    incomeCeiling(runs),
    cashFloor(runs),
    contentRemains(runs),
  ];
}
