import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Hiring somebody, in a browser — GAME_EXECUTION_ROADMAP Phase 10.
 *
 * The phase's Player Value line is that the player stops being the cook and
 * becomes a manager. In a browser that means three things a Node test cannot
 * check: the staff panel exists and refuses what the simulation would refuse,
 * a hire changes the world, and the person who appears has something over their
 * head saying what they are doing.
 */

const TICKS_PER_MINUTE = 1200;

interface Api {
  dispatch(command: { t: 'MANUAL_PREP'; orderSlot: number }): void;
  advanceTicks(n: number): void;
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&paused=1');
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  /*
   * The HUD publishes only once the bridge goes live, and the bridge waits for
   * assets. Reading `data-cash` before that races a slow load — proven against
   * the CDN, where the sim ticked and earned for a full test's length while the
   * attribute sat at its initial 0.00. Same window as build mode's ghost race.
   */
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
}

async function cookFor(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    const api = (window as unknown as { __EVOTYCOON__: Api }).__EVOTYCOON__;
    for (let i = 0; i < count; i++) {
      api.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      api.advanceTicks(1);
    }
  }, ticks);
}

async function advance(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    (window as unknown as { __EVOTYCOON__: { advanceTicks(n: number): void } }).__EVOTYCOON__.advanceTicks(
      count,
    );
  }, ticks);
}

async function readCash(page: Page): Promise<number> {
  const raw = await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash');
  return Number.parseFloat(raw ?? 'NaN');
}

/** Earn until the till holds at least `credits`. */
async function earnFor(page: Page, credits: number): Promise<void> {
  for (let minute = 0; minute < 40; minute++) {
    await cookFor(page, TICKS_PER_MINUTE);
    await page.waitForTimeout(120);
    if ((await readCash(page)) >= credits) return;
  }
  throw new Error(`never reached ₡${String(credits)}`);
}

test.describe('the staff panel', () => {
  test('starts collapsed and empty, with no payroll', async ({ page }) => {
    // A stand with no employees should not be showing a wage bill.
    await boot(page);

    await expect(page.locator('[data-testid="staff-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="staff-count"]')).toHaveText('0');
    await expect(page.locator('[data-testid="staff-payroll"]')).toHaveAttribute('data-payroll', '0.00');
    await expect(page.locator('[data-testid="staff-row"]')).toHaveCount(0);
  });

  test('refuses a hire the player cannot afford', async ({ page }) => {
    /*
     * The button is disabled, and that is a courtesy rather than a control —
     * `tests/unit/sim/employees/wages.test.ts` dispatches the command directly
     * against an empty till and asserts the simulation refuses it too.
     */
    await boot(page);
    await page.locator('[data-testid="staff-toggle"]').click();

    await expect(page.locator('[data-testid="staff-hire"][data-role="cook"]')).toBeDisabled();
  });

  test('hires a cook, takes the money, and shows them on the payroll', async ({ page }) => {
    await boot(page);
    await earnFor(page, 20);
    await page.locator('[data-testid="staff-toggle"]').click();

    const before = await readCash(page);
    const hire = page.locator('[data-testid="staff-hire"][data-role="cook"]');
    await expect(hire).toBeEnabled();
    await hire.click();

    // Commands land at the start of a tick, never on dispatch.
    await advance(page, 1);

    await expect.poll(async () => readCash(page)).toBeLessThan(before);
    expect(before - (await readCash(page))).toBeCloseTo(20, 1);

    await expect(page.locator('[data-testid="staff-row"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="staff-row"]')).toHaveAttribute('data-role', 'cook');
    await expect(page.locator('[data-testid="staff-payroll"]')).not.toHaveAttribute('data-payroll', '0.00');
  });

  test('lets the player fire somebody again', async ({ page }) => {
    await boot(page);
    await earnFor(page, 20);
    await page.locator('[data-testid="staff-toggle"]').click();
    await page.locator('[data-testid="staff-hire"][data-role="cook"]').click();
    await advance(page, 1);
    await expect(page.locator('[data-testid="staff-row"]')).toHaveCount(1);

    await page.locator('[data-testid="staff-fire"]').click();
    await advance(page, 1);

    await expect(page.locator('[data-testid="staff-row"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="staff-payroll"]')).toHaveAttribute('data-payroll', '0.00');
  });
});

test.describe('an employee in the world', () => {
  test('appears with an icon saying what they are doing', async ({ page }) => {
    /*
     * The roadmap's answer to its own Phase 10 risk — that employees read as
     * "tokens sliding on a board". Intent that is legible is halfway to intent
     * that is believable, and none of the rig clips exist yet.
     */
    await boot(page);
    await earnFor(page, 20);
    await page.locator('[data-testid="staff-toggle"]').click();
    await page.locator('[data-testid="staff-hire"][data-role="cook"]').click();
    await advance(page, 1);

    const icon = page.locator('[data-testid="staff-icon"]');
    await expect(icon).toHaveCount(1);
    await expect(icon).toBeVisible();
  });

  test('cooks without a single click, which is the whole point of the phase', async ({ page }) => {
    /*
     * The claim the phase exists to make: the player stops being the cook.
     * Every tick after the hire is `advanceTicks` with **no** `MANUAL_PREP`, and
     * the served count still rises.
     */
    await boot(page);
    await earnFor(page, 20);
    await page.locator('[data-testid="staff-toggle"]').click();
    await page.locator('[data-testid="staff-hire"][data-role="cook"]').click();
    await advance(page, 1);

    const served = async (): Promise<number> =>
      Number.parseInt((await page.locator('[data-testid="hud-served"]').innerText()).trim(), 10);

    const atHire = await served();
    await advance(page, TICKS_PER_MINUTE * 25);
    await page.waitForTimeout(150);

    await expect
      .poll(async () => served(), { message: 'the cook served nobody without the player clicking' })
      .toBeGreaterThan(atHire);
  });

  test('never lets cash go below zero, even with a payroll it cannot afford', async ({ page }) => {
    // The roadmap's hard requirement, checked through the interface the player
    // actually reads rather than only in the simulation.
    await boot(page);
    await earnFor(page, 40);
    await page.locator('[data-testid="staff-toggle"]').click();
    await page.locator('[data-testid="staff-hire"][data-role="cook"]').click();
    await advance(page, 1);
    await page.locator('[data-testid="staff-hire"][data-role="cleaner"]').click();
    await advance(page, 1);

    for (let step = 0; step < 12; step++) {
      await advance(page, TICKS_PER_MINUTE * 5);
      await page.waitForTimeout(60);
      expect(await readCash(page), `negative at step ${String(step)}`).toBeGreaterThanOrEqual(0);
    }
  });
});
