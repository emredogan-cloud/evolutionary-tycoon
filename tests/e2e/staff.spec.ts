import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The staff panel — the directive's §15, and the measurement behind it.
 *
 * "Why should I hire this person?" and "what does this person cost me?" are
 * the two questions the panel has to answer, and the second one used to be the
 * only one it could. The first is answered from a measurement rather than from
 * flavour text: at Stage 1, hiring a cook while the player is also cooking
 * changes throughput by nothing at all, because the player takes every order
 * the instant it is startable — so the pitch says what a cook is actually for.
 */

interface Hook {
  dispatch(command: object): void;
  advanceTicks(n: number): void;
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&paused=1');
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
  await page.locator('[data-testid="dock-staff"]').click();
  await expect(page.locator('[data-testid="staff-panel"]')).toBeVisible();
}

test.describe('the staff panel', () => {
  test('says what each role is for, and what it costs', async ({ page }) => {
    await boot(page);

    const cook = page.locator('[data-testid="staff-hire"][data-role="cook"]');
    await expect(cook).toBeVisible();
    // The price to hire…
    await expect(cook).toContainText('₡20');
    // …and what the money buys, which is not "more throughput".
    await expect(cook).toContainText('Sen tezgâhta değilken');

    await expect(page.locator('[data-testid="staff-payroll"]')).toHaveAttribute('data-payroll', '0.00');
  });

  test('reports an unoccupied cook as having no work, not as blocked', async ({ page }) => {
    test.setTimeout(180_000);
    await boot(page);

    // Enough to hire, earned the honest way.
    for (let minute = 0; minute < 40; minute++) {
      const cash = Number(await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash'));
      if (cash >= 25) break;
      await page.evaluate(() => {
        const api = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
        for (let i = 0; i < 1200; i++) {
          api.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
          api.dispatch({ t: 'SERVE_ORDER', orderSlot: -1 });
          api.advanceTicks(1);
        }
      });
    }

    await page.locator('[data-testid="staff-hire"][data-role="cook"]').click();
    await page.evaluate(() => {
      (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__.advanceTicks(600);
    });

    const row = page.locator('[data-testid="staff-row"][data-role="cook"]');
    await expect(row).toBeVisible();

    /*
     * The distinction this pass put into the simulation, read back through the
     * interface — and asserted structurally rather than at an instant.
     *
     * With exactly one cook on the payroll, "sırada bekliyor" is *impossible*:
     * blocked means work of a kind this role does exists and somebody else is
     * holding it, and there is nobody else. Before the fix the board reported
     * every cook without a task as blocked, so this reads as blocked on almost
     * every sample. Sampling across a window rather than once also survives
     * the arrival stream moving, which a single-instant check does not.
     */
    const states = new Set<string>();
    for (let sample = 0; sample < 12; sample++) {
      states.add((await row.locator('[data-testid="staff-state"]').innerText()).trim());
      await page.evaluate(() => {
        (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__.advanceTicks(120);
      });
    }

    expect(states.has('sırada bekliyor'), 'a lone cook reported as blocked — by whom?').toBe(false);
    expect(states.has('iş yok'), 'the cook was never reported as simply having no work').toBe(true);

    // And the panel puts a number on it rather than making the player guess.
    const busy = Number(await row.locator('[data-testid="staff-busy"]').getAttribute('data-busy'));
    expect(busy).toBeGreaterThanOrEqual(0);
    expect(busy).toBeLessThanOrEqual(1);

    // Firing stops the wage bill.
    await expect(page.locator('[data-testid="staff-payroll"]')).not.toHaveAttribute('data-payroll', '0.00');
    await page.locator('[data-testid="staff-fire"]').first().click();
    await page.evaluate(() => {
      (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__.advanceTicks(2);
    });
    await expect
      .poll(async () => page.locator('[data-testid="staff-payroll"]').getAttribute('data-payroll'))
      .toBe('0.00');
  });
});
