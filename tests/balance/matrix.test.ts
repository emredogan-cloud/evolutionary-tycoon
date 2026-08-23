/**
 * The cross-stage calibration matrix — the continuation's Decision C.
 *
 * `balance:check` asserts the contract holds; this *reports* the numbers the
 * contract is drawn from, so a prep-time change can be argued from evidence
 * rather than from taste. Every policy, one long run each, with the stage
 * timings, the throughput, the ticket, the kitchen's own occupancy and the
 * parking outcome broken out per stage.
 *
 * Deliberately a reporter and not a gate: the gate is `assertions.ts`, and a
 * second set of thresholds living here would be a second contract to keep in
 * step with the first.
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { MENU } from '@config/economy/menu';
import { POLICIES } from '../../tools/balance-sim/policies/index';
import { runPolicy } from '../../tools/balance-sim/runner';
import type { World } from '@sim/core/World';

/**
 * A reporter, not a gate — skipped unless MATRIX_MINUTES asks for it, because
 * a full cross-policy sweep is minutes of wall clock and `balance:check` runs
 * on every verify. The gate is `economy.test.ts`; this is the evidence a
 * calibration decision gets argued from.
 */
describe('balance matrix', () => {
  it.runIf(process.env['MATRIX_MINUTES'] !== undefined)(
    'sweeps every policy across the stages and writes the report',
    () => {
      const MINUTES = Number(process.env['MATRIX_MINUTES'] ?? '420');
      const SEEDS = (process.env['MATRIX_SEEDS'] ?? '424242,777,20260815').split(',').map(Number);

      interface StageRow {
        samples: number;
        cookBusy: number;
        cookLive: number;
        served: number;
        revenue: number;
        turnedAway: number;
        spawned: number;
      }

      function blank(): StageRow {
        return { samples: 0, cookBusy: 0, cookLive: 0, served: 0, revenue: 0, turnedAway: 0, spawned: 0 };
      }

      const rows: string[] = [];
      rows.push(`# Balance matrix — ${String(MINUTES)} simulated minutes, seeds ${SEEDS.join('/')}`);
      rows.push('');
      rows.push(
        '| policy | seed | S2 min | S3 min | S4 min | served | revenue | ticket | turned away | cook busy |',
      );
      rows.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

      const prepLine = MENU.map((item) => `${item.id}=${(item.prepTimeMs / 1000).toFixed(1)}s`).join(' · ');

      for (const policy of POLICIES) {
        for (const seed of SEEDS) {
          const perStage = new Map<number, StageRow>();
          const result = runPolicy({
            policy,
            seed,
            minutes: MINUTES,
            onSample: (world: World) => {
              const stage = world.progression.stage;
              const row = perStage.get(stage) ?? blank();
              row.samples++;
              for (let slot = 0; slot < world.employees.scanLimit; slot++) {
                if (!world.employees.isActive(slot)) continue;
                const employee = world.employees.at(slot);
                row.cookLive++;
                // MOVING or PERFORMING — the two states that are work.
                if (employee.state === 1 || employee.state === 2) row.cookBusy++;
              }
              row.served = world.stats.customersServed;
              row.revenue = world.economy.lifetimeRevenue;
              row.turnedAway = world.stats.turnedAwayNoParking;
              row.spawned = world.stats.vehiclesSpawned;
              perStage.set(stage, row);
            },
          });

          const last = result.samples.at(-1);
          const served = last?.customersServed ?? 0;
          // `Sample` carries no revenue, so it comes from the per-stage rows
          // the sampler filled straight off the world.
          const revenue = [...perStage.values()].reduce((a, r) => Math.max(a, r.revenue), 0);
          const turned = [...perStage.values()].reduce((a, r) => Math.max(a, r.turnedAway), 0);
          const busy = [...perStage.values()].reduce((a, r) => a + r.cookBusy, 0);
          const live = [...perStage.values()].reduce((a, r) => a + r.cookLive, 0);
          const at = (stage: number): string => {
            const minute = result.stageEnteredAtMinute[stage];
            return minute === undefined ? '—' : minute.toFixed(1);
          };
          rows.push(
            `| ${policy.id} | ${String(seed)} | ${at(2)} | ${at(3)} | ${at(4)} | ${String(served)} | ` +
              `${revenue.toFixed(0)} | ${served === 0 ? '—' : (revenue / served).toFixed(2)} | ` +
              `${String(turned)} | ${live === 0 ? '—' : `${((busy / live) * 100).toFixed(1)}%`} |`,
          );
        }
      }

      rows.push('');
      rows.push(`Prep times in this run: ${prepLine}`);
      const out = process.env['MATRIX_OUT'] ?? '/tmp/balance-matrix.md';
      writeFileSync(out, rows.join('\n') + '\n');
      process.stdout.write(rows.join('\n') + '\n');

      expect(rows.length).toBeGreaterThan(3);
    },
    1_800_000,
  );
});
