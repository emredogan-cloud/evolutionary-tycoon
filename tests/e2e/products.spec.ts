import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { MENU } from '@config/economy/menu';

/**
 * The menu panel and the order card — the directive's §11 and §12, in a
 * browser.
 *
 * The economics were already real (`MenuItem.prepTimeMs`, `PRICE_BAND`,
 * `SET_PRICE` clamping in the simulation); what was missing was an interface
 * that showed any of it. The price panel listed thirteen products under a
 * three-entry label map, so ten of them offered the player a raw id and a
 * slider. So these assert what the panel now *says*, and that moving a slider
 * still moves the number the simulation sells at.
 */

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&paused=1');
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
  await page.locator('[data-testid="dock-menu"]').click();
  await expect(page.locator('[data-testid="price-panel"]')).toBeVisible();
}

test.describe('the menu panel', () => {
  test('names every product, and never shows a raw id', async ({ page }) => {
    await boot(page);

    const cards = page.locator('[data-testid="product-card"]');
    await expect(cards).toHaveCount(MENU.length);

    for (const item of MENU) {
      const card = page.locator(`[data-testid="product-card"][data-item="${item.id}"]`);
      // The Turkish name from the menu config, not the id.
      await expect(card).toContainText(item.label);
      await expect(card, `${item.id} rendered its raw id`).not.toContainText(item.id);
    }
  });

  test('shows each product its preparation time', async ({ page }) => {
    await boot(page);
    /*
     * A drink and a burger are different businesses at the same margin, and
     * the number comes from the field the kitchen counts down — read from the
     * menu rather than transcribed, so a calibration pass cannot leave this
     * spec asserting last week's economy. These were literal '2,5 sn' and
     * '9,0 sn' until Decision C moved them to 5,0 and 30,0.
     */
    for (const item of MENU) {
      const card = page.locator(`[data-testid="product-card"][data-item="${item.id}"]`);
      const expected = `${(item.prepTimeMs / 1000).toFixed(1).replace('.', ',')} sn`;
      await expect(card.locator('[data-testid="product-prep"]')).toHaveText(expected);
    }
  });

  test('says which stage a product it cannot sell yet needs', async ({ page }) => {
    await boot(page);
    const locked = page.locator('[data-testid="product-card"][data-status="locked"]');
    await expect(locked).not.toHaveCount(0);
    await expect(locked.first().locator('[data-testid="product-lock"]')).toContainText('Aşama');
  });

  test('a price the player sets is the price the simulation sells at', async ({ page }) => {
    await boot(page);

    const slider = page.locator('[data-testid="price-slider"][data-item="lemonade"]');
    await expect(slider).toBeVisible();

    // The band's top, which the notched slider can actually reach.
    const band = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="price-slider"][data-item="lemonade"]');
      return el === null ? null : Number(el.getAttribute('data-price'));
    });
    expect(band).not.toBeNull();

    await slider.fill('100');

    /*
     * Read back after the bridge republishes, which is the whole assertion:
     * the number on this card is filled from `world.economy.prices`, so if it
     * still reads the new price after a tick, the *simulation* is holding it.
     * A cosmetic slider — one that moved a local variable and nothing else —
     * would fail here and pass every other check in this file.
     */
    await page.evaluate(() => {
      (window as unknown as { __EVOTYCOON__: { advanceTicks(n: number): void } }).__EVOTYCOON__.advanceTicks(
        4,
      );
    });

    await expect
      .poll(
        async () => {
          const el = page.locator('[data-testid="price-slider"][data-item="lemonade"]');
          return Number(await el.getAttribute('data-price'));
        },
        { message: 'the price did not survive a republish from the world' },
      )
      .toBeGreaterThan(band ?? Number.POSITIVE_INFINITY);
  });
});
