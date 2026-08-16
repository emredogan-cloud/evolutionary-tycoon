import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../tools/balance-sim/assertions';
import type { Verdict } from '../../tools/balance-sim/assertions';
import { measureUpgradeEffects } from '../../tools/balance-sim/experiment';
import { POLICIES } from '../../tools/balance-sim/policies/index';
import { csvReport, markdownReport } from '../../tools/balance-sim/report';
import { runPolicy } from '../../tools/balance-sim/runner';
import type { RunResult } from '../../tools/balance-sim/types';

/**
 * **The economy gate** — GAME_EXECUTION_ROADMAP Phase 12, ECONOMY_DESIGN §13.
 *
 * This is the phase's actual deliverable. Not the simulator — the simulator is
 * the easy half — but the fact that **a config change which breaks the pacing
 * cannot be merged**. Economy balance is what kills this genre, and it is
 * normally defended by somebody playing for an afternoon and saying it felt
 * about right.
 *
 * ## Budget
 *
 * The roadmap allows ninety seconds in CI. Measured on the development machine:
 * **4.84 µs per simulated tick**, so five policies × two simulated hours costs
 * about six seconds, and the paired upgrade experiments about four more. The
 * budget is asserted at the bottom of this file rather than assumed.
 *
 * ## `⊘` is not a pass
 *
 * Three of the ten assertions are about Stages 2 to 4, and **those stages have
 * no content yet**: three of the design's fourteen menu items exist and six of
 * its upgrades, all Stage 1. An assertion with nothing to look at is reported as
 * not-evaluable and listed by name below, so the gate cannot go quietly green
 * over a hole. Phase 13 builds the upgrade tree; the menu gap is a change
 * request recorded in `docs/BALANCE_REPORT.md`.
 */

const SEED = 424_242;
/**
 * Two simulated hours by default, twelve when asked.
 *
 * Two hours is what fits the ninety-second CI budget and is long enough for
 * every assertion about Stage 1 and the policy spread. The two long-run
 * assertions — the twelve-hour income ceiling and Stage 4 content exhaustion —
 * need `BALANCE_MINUTES=720`, which `pnpm balance` runs and the phase
 * report quotes. They are reported as not-evaluable in the short run rather than
 * silently passing.
 */
const REQUESTED_MINUTES = Number.parseInt(process.env['BALANCE_MINUTES'] ?? '', 10);
// An explicit NaN check rather than `||`, which would also swallow a deliberate
// zero — and a zero-minute run should be an obvious mistake, not a silent 120.
const MINUTES = Number.isFinite(REQUESTED_MINUTES) ? REQUESTED_MINUTES : 120;
/**
 * Three seeds for the paired upgrade experiments.
 *
 * One is not enough: an upgrade that changes *when* a driver decides also
 * changes the order of every later RNG draw, which reads as a few per cent of
 * spurious regression. See `experiment.ts`.
 */
const EXPERIMENT_SEEDS = [424_242, 909, 20_260_816] as const;
const CI_BUDGET_MS = 90_000;
const SUITE_TIMEOUT_MS = 300_000;

let cached: { runs: RunResult[]; verdicts: Verdict[]; wallClockMs: number } | null = null;

/**
 * Run everything once, and write the report when asked.
 *
 * `pnpm balance` sets `BALANCE_WRITE_REPORT` and regenerates
 * `docs/BALANCE_REPORT.md`; `pnpm balance:check` — the gate, and what CI runs —
 * only judges. Keeping the two one code path is deliberate: a report that could
 * disagree with the gate would be a document about a build nobody shipped.
 */
function balance(): { runs: RunResult[]; verdicts: Verdict[]; wallClockMs: number } {
  if (cached !== null) return cached;

  const startedAt = process.hrtime.bigint();
  const runs = POLICIES.map((policy) => runPolicy({ policy, seed: SEED, minutes: MINUTES }));
  const effects = measureUpgradeEffects({ seeds: EXPERIMENT_SEEDS, warmUpMinutes: 12, measureMinutes: 24 });
  const verdicts = evaluate(runs, effects);
  cached = { runs, verdicts, wallClockMs: Number(process.hrtime.bigint() - startedAt) / 1e6 };

  if (process.env['BALANCE_WRITE_REPORT'] === '1') {
    const root = resolve(import.meta.dirname, '../..');
    const commit = process.env['GITHUB_SHA']?.slice(0, 7) ?? 'working tree';
    writeFileSync(resolve(root, 'docs/BALANCE_REPORT.md'), markdownReport(runs, verdicts, effects, commit));
    mkdirSync(resolve(root, 'docs/balance'), { recursive: true });
    writeFileSync(resolve(root, 'docs/balance/curves.csv'), csvReport(runs));
  }

  return cached;
}

describe('the economy stays inside its designed envelope', () => {
  it(
    'passes every assertion it can evaluate',
    () => {
      const { verdicts } = balance();
      const failures = verdicts.filter((verdict) => !verdict.passed);

      expect(
        failures.map((verdict) => `${verdict.id}: ${verdict.detail}`),
        'the economy left its designed envelope',
      ).toEqual([]);
    },
    SUITE_TIMEOUT_MS,
  );

  it(
    'never leaves the player with nothing they can afford',
    () => {
      /*
       * ECONOMY_DESIGN §8, and the one assertion the design itself marks
       * MERGE-BLOCKING: the cheapest meaningful upgrade may never cost more than
       * ninety seconds of income. A dead end is the single failure this genre
       * cannot recover from — the player is not losing, they are not winning,
       * and there is nothing to do.
       *
       * Asserted separately from the group above so that a config change which
       * breaks *this* one is unmistakable in the CI log.
       */
      const { verdicts } = balance();
      const deadEnd = verdicts.find((verdict) => verdict.id === 'no-dead-end');

      expect(deadEnd, 'the dead-end assertion did not run at all').toBeDefined();
      expect(deadEnd?.mergeBlocking).toBe(true);
      expect(deadEnd?.passed, deadEnd?.detail ?? '').toBe(true);
    },
    SUITE_TIMEOUT_MS,
  );

  it(
    'names every assertion it could not evaluate',
    () => {
      /*
       * The gate's own honesty check. A not-evaluable assertion is allowed —
       * Stages 2 to 4 have no content yet — but the *set* of them is pinned, so
       * an assertion that quietly stops being evaluable fails here rather than
       * disappearing into a green tick.
       */
      const { verdicts } = balance();
      const blocked = verdicts.filter((verdict) => verdict.notApplicable).map((verdict) => verdict.id);

      /*
       * An allow-list rather than an exact set, because which of them is
       * evaluable depends on how long the run was: the twelve-hour assertions
       * become real under `pnpm balance:long`, and Stage 4 content only once a
       * run gets there. What must never happen is a *new* assertion quietly
       * joining the list — that is what this catches.
       */
      const ALLOWED_BLOCKED = new Set([
        // No Stage 2/3/4 menu items or upgrades exist yet — Phase 13, and a menu
        // change request recorded in docs/BALANCE_REPORT.md.
        'stage-2-timing',
        'stage-3-timing',
        'stage-4-timing',
        // Need a twelve-hour run; `pnpm balance:long` evaluates them.
        'no-exponential-escape',
        'content-not-exhausted',
      ]);

      for (const id of blocked) {
        expect(ALLOWED_BLOCKED.has(id), `${id} became unevaluable and nobody said so`).toBe(true);
      }
      /*
       * At least one must be blocked and named, or the allow-list above is
       * describing a situation that no longer exists — which is its own kind of
       * stale. Phase 13 filled the content holes, so what remains blocked is the
       * ticket arithmetic of change request §8.1.
       */
      expect(blocked.length, 'nothing is blocked any more — prune the allow-list').toBeGreaterThan(0);
    },
    SUITE_TIMEOUT_MS,
  );

  it(
    'runs inside the CI budget',
    () => {
      // The roadmap: "balance run in CI < 90 seconds. If it exceeds, optimise
      // *simulation speed* — not the number of policies or the length of the
      // run." Asserted so that a slowdown is caught as a slowdown rather than
      // fixed by quietly simulating less.
      const { wallClockMs } = balance();
      expect(wallClockMs, `balance run took ${(wallClockMs / 1000).toFixed(1)} s`).toBeLessThan(CI_BUDGET_MS);
    },
    SUITE_TIMEOUT_MS,
  );

  it(
    'is reproducible: the same seed gives the same economy',
    () => {
      /*
       * The property everything else here rests on. If two runs of the same
       * policy on the same seed disagreed, every number in the report would be
       * an anecdote — and the gate would fail randomly, which is how a merge
       * gate gets turned off.
       */
      const first = runPolicy({ policy: POLICIES[0] ?? POLICIES[0]!, seed: SEED, minutes: 20 });
      const second = runPolicy({ policy: POLICIES[0] ?? POLICIES[0]!, seed: SEED, minutes: 20 });

      expect(second.customersServed).toBe(first.customersServed);
      expect(second.finalCash).toBe(first.finalCash);
      expect(second.stageEnteredAtMinute).toEqual(first.stageEnteredAtMinute);
    },
    SUITE_TIMEOUT_MS,
  );
});
