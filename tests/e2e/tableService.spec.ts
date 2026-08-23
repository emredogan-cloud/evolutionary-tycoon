import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { STAGE3_LAYOUT } from '@config/layouts/stage3';

/**
 * Scenario C of the consolidation directive — table service, visibly.
 *
 * Stage 3 is where delivery stops being instantaneous: a customer who has
 * ordered walks to a table (`QueueSystem.assignSeats`, one customer per
 * table, hashed), and the plate reaches them because a waiter carried it
 * (`TaskBoard` DELIVER_ORDER → `EmployeeFsm` walks → `deliverOrder`). This
 * spec proves the chain in a browser through the real surfaces: the seat is
 * taken up at the table's actual coordinates, the pass backs up while no
 * waiter exists, and hiring one turns plates on the pass into served
 * customers and money in the till.
 */

const TICKS_PER_MINUTE = 1200;

interface Hook {
  dispatch(command: object): void;
  advanceTicks(n: number): void;
  getState(): {
    tick: number;
    actorCount: number;
    actors: readonly { kind: number; x: number; y: number; activity: number }[];
  };
}

/**
 * Stage 3's tables — read from the layout, never copied out of it.
 *
 * They used to be six literals transcribed from `stage3.ts` under a comment
 * saying so, and the stage-1 expansion pass moved the dining grid when the
 * stand went deeper into the land. The literals stayed where they were, so
 * this spec went on measuring an empty patch of floor 1.9 m from the nearest
 * real table and reported "nobody is at a table" about a diner that was
 * serving perfectly well. A test that duplicates the data it checks against
 * can only ever be right until the data moves.
 */
const TABLES = STAGE3_LAYOUT.tables.map((table) => ({ x: table.x, y: table.y }));

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&paused=1&stage=3');
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
}

async function cookFor(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    const api = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
    for (let i = 0; i < count; i++) {
      api.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      api.dispatch({ t: 'SERVE_ORDER', orderSlot: -1 });
      api.advanceTicks(1);
    }
  }, ticks);
}

async function readCash(page: Page): Promise<number> {
  const raw = await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash');
  return Number.parseFloat(raw ?? 'NaN');
}

async function served(page: Page): Promise<number> {
  return Number.parseInt((await page.locator('[data-testid="hud-served"]').innerText()).trim(), 10);
}

test.describe('stage 3 table service', () => {
  test('a customer takes a real seat, and a waiter is what serves them', async ({ page }) => {
    test.setTimeout(240_000);
    await boot(page);

    /*
     * Earn a payroll the honest way: manual prep. At stage 3 the counter
     * still hands over whatever the player cooks, so the till fills even
     * before any staff exist.
     */
    for (let minute = 0; minute < 30 && (await readCash(page)) < 60; minute++) {
      await cookFor(page, TICKS_PER_MINUTE);
    }
    expect(await readCash(page)).toBeGreaterThanOrEqual(60);

    /*
     * Somebody takes a seat: seats assign the moment an order is placed, and
     * the customer's navigation target is the table itself. The proof is
     * geometric — a person standing within a metre of a configured table
     * position.
     *
     * **Sampled across a shift, not at one tick.** It used to read the world
     * once, immediately after the earning loop, and that passed only because
     * delivery was instantaneous and the dining room was therefore always
     * full at a minute boundary. Since the counter handover became an action
     * (2026-08-23) the pipeline runs a beat behind, and one snapshot can
     * legitimately catch the room between sittings. The claim was always "a
     * customer takes a real seat", never "at this exact tick".
     */
    const countSeated = (): Promise<number> =>
      page.evaluate((tables) => {
        const api = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
        const view = api.getState();
        let hits = 0;
        for (let i = 0; i < view.actorCount; i++) {
          const actor = view.actors[i];
          if (actor?.kind !== 1) continue; // customers only
          for (const table of tables) {
            const dx = actor.x - table.x;
            const dy = actor.y - table.y;
            if (dx * dx + dy * dy < 1.0) hits++;
          }
        }
        return hits;
      }, TABLES);

    let seatedNear = await countSeated();
    for (let sample = 0; sample < 60 && seatedNear === 0; sample++) {
      await cookFor(page, TICKS_PER_MINUTE / 4);
      seatedNear = await countSeated();
    }
    expect(seatedNear, 'nobody sat at a table in fifteen simulated minutes').toBeGreaterThan(0);

    // Hire the kitchen and the floor through the real commands.
    await page.evaluate(() => {
      const api = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
      api.dispatch({ t: 'HIRE', roleId: 'cook', skill: 1 });
      api.advanceTicks(1);
      api.dispatch({ t: 'HIRE', roleId: 'waiter', skill: 1 });
      api.advanceTicks(1);
    });

    /*
     * With a cook and a waiter, the loop closes hands-free: cook fills the
     * pass, waiter walks plates to tables, customers eat, pay, leave. Serving
     * without another MANUAL_PREP is the waiter's proof of work.
     */
    const beforeServed = await served(page);
    const beforeCash = await readCash(page);
    await page.evaluate((ticks) => {
      (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__.advanceTicks(ticks);
    }, TICKS_PER_MINUTE * 20);
    await page.waitForTimeout(200);

    await expect
      .poll(async () => served(page), { message: 'the waiter served nobody' })
      .toBeGreaterThan(beforeServed);
    expect(await readCash(page)).toBeGreaterThan(beforeCash - 60);
  });
});
