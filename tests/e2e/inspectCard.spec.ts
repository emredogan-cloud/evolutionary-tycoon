import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { PROPERTIES, propertyCost } from '@config/properties';

/**
 * The object inspection card, in a real browser — the restaurant evolution
 * directive's §D and §17.
 *
 * The simulation half is pinned in
 * `tests/unit/sim/properties/propertyLevels.test.ts`. What only a browser can
 * show is the half the player touches: a dot on the thing itself, a card that
 * opens beside it, two faces, a price the simulation agrees with, a refusal
 * that says what is missing, and a preview that refuses to show the current
 * picture as if it were the next one.
 */

interface Hook {
  dispatch(command: object): void;
  advanceTicks(n: number): void;
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&paused=1');
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', { timeout: 30_000 });
}

/** Run the world forward without waiting for wall-clock seconds. */
async function advance(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__.advanceTicks(count);
  }, ticks);
}

async function readCash(page: Page): Promise<number> {
  const raw = await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash');
  return Number.parseFloat(raw ?? 'NaN');
}

/**
 * Wait for the HUD to catch up with the world, then read.
 *
 * `advanceTicks` moves the simulation synchronously; the overlay republishes on
 * the next animation frame. A bare `getAttribute` straight after therefore
 * reads the *previous* sample — which is not flakiness, it is a real ordering,
 * and it showed up as a purchase that "charged nothing" and a countdown that
 * "did not move" on the slower engine only.
 */
async function settled<T>(page: Page, read: () => Promise<T>, until: (value: T) => boolean): Promise<T> {
  let last = await read();
  for (let attempt = 0; attempt < 100 && !until(last); attempt++) {
    await page.waitForTimeout(100);
    last = await read();
  }
  return last;
}

/** Serve until the till holds `target`, the way the other flows earn. */
async function earn(page: Page, target: number): Promise<void> {
  for (let round = 0; round < 60 && (await readCash(page)) < target; round++) {
    await page.evaluate(() => {
      const api = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
      for (let i = 0; i < 1200; i++) {
        api.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        api.dispatch({ t: 'SERVE_ORDER', orderSlot: -1 });
        api.advanceTicks(1);
      }
    });
  }
  expect(await readCash(page), 'the stand never earned enough to inspect anything').toBeGreaterThanOrEqual(
    target,
  );
}

function hotspot(page: Page, id: string) {
  return page.locator(`[data-testid="property-hotspot"][data-property="${id}"]`);
}

async function open(page: Page, id: string): Promise<void> {
  await hotspot(page, id).click();
  await expect(page.locator(`[data-testid="inspect-card"][data-property="${id}"]`)).toBeVisible();
}

/**
 * Close through the card's own ×, never by clicking the dot again.
 *
 * Both work for a player, but only one works for a *sweep*: an open card sits
 * beside its hotspot and is wide enough to cover the next one along, so the
 * second `open()` in a loop can find its dot underneath the card it is trying
 * to replace. That is not a defect in the card — a player who wants the next
 * property clicks somewhere they can see — but it is a hang in a test that
 * visits all five in order, and it hangs as a 45 s timeout with no message.
 */
async function close(page: Page): Promise<void> {
  await page.locator('[data-testid="inspect-card"]').getByRole('button', { name: 'Kapat' }).click();
  await expect(page.locator('[data-testid="inspect-card"]')).toHaveCount(0);
}

test.describe('inspecting what you own', () => {
  test('every property carries a dot that reports its level', async ({ page }) => {
    await boot(page);

    // One hotspot per property in the table — not a subset chosen by the
    // overlay, because a property with no dot is a property with no way in.
    const dots = page.locator('[data-testid="property-hotspot"]');
    await expect(dots).toHaveCount(PROPERTIES.length);

    for (const spec of PROPERTIES) {
      const dot = hotspot(page, spec.id);
      await expect(dot).toBeVisible();
      const level = Number.parseInt((await dot.getAttribute('data-level')) ?? '0', 10);
      expect(level, `${spec.id} reported level ${String(level)}`).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(spec.maxLevel);
      // The pip is the level, so the lot can be read without opening anything.
      await expect(dot).toHaveText(String(level));
    }
  });

  test('the card opens beside the thing, and closes again', async ({ page }) => {
    await boot(page);
    await open(page, 'parking');

    const card = page.locator('[data-testid="inspect-card"]');
    const dotBox = await hotspot(page, 'parking').boundingBox();
    const cardBox = await card.boundingBox();
    expect(dotBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    if (dotBox === null || cardBox === null) return;

    // Beside, not over: §32 asks for a card that does not hide the object the
    // player just clicked. The card starts to the right of the dot's centre.
    expect(cardBox.x).toBeGreaterThan(dotBox.x + dotBox.width / 2);
    // And inside the viewport, at the size the suite runs at.
    const viewport = page.viewportSize();
    if (viewport !== null) {
      expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(viewport.width + 1);
    }

    // Clicking the same dot again closes it; so does the ×.
    await hotspot(page, 'parking').click();
    await expect(card).toHaveCount(0);
    await open(page, 'parking');
    await card.getByRole('button', { name: 'Kapat' }).click();
    await expect(card).toHaveCount(0);
  });

  test('BİLGİ reports the capacity the simulation is actually using', async ({ page }) => {
    await boot(page);
    await advance(page, 3_000);
    await open(page, 'parking');

    const capacity = await page.locator('[data-testid="inspect-capacity"]').textContent();
    const usage = await page.locator('[data-testid="inspect-usage"]').textContent();
    expect(capacity).toMatch(/^\d+ araç$/);

    // "3 / 4" — the second number is the capacity above it, and the first
    // cannot exceed it. A card that could show 5/4 is showing two derivations.
    const bays = Number.parseInt(capacity?.split(' ')[0] ?? 'NaN', 10);
    const parts = (usage ?? '').split('/').map((part) => Number.parseInt(part.trim(), 10));
    expect(parts[1]).toBe(bays);
    expect(parts[0]).toBeLessThanOrEqual(bays);

    // The service property counts people, not cars, and says so.
    await close(page);
    await open(page, 'service');
    expect(await page.locator('[data-testid="inspect-capacity"]').textContent()).toMatch(/^\d+ kişi$/);
  });

  test('İNŞA ET quotes a price the purchase then charges', async ({ page }) => {
    await boot(page);
    const spec = PROPERTIES.find((item) => item.id === 'parking');
    expect(spec).toBeDefined();
    if (spec === undefined) return;

    const price = propertyCost(spec, 2) ?? 0;
    await earn(page, price + 20);
    await open(page, 'parking');
    await page.locator('[data-testid="inspect-build"]').click();

    await expect(page.locator('[data-testid="inspect-next-label"]')).toContainText('Sv. 2');
    await expect(page.locator('[data-testid="inspect-cost"]')).toHaveText(`₡${price.toFixed(2)}`);
    await expect(page.locator('[data-testid="inspect-duration"]')).toContainText('inşaat');

    const before = await readCash(page);
    await page.locator('[data-testid="inspect-upgrade"]').click();
    await advance(page, 2);

    // Charged, and by the amount the card promised.
    const after = await settled(
      page,
      () => readCash(page),
      (cash) => cash < before,
    );
    expect(before - after).toBeCloseTo(price, 2);
  });

  test('the site counts down before the level arrives, not after', async ({ page }) => {
    await boot(page);
    const spec = PROPERTIES.find((item) => item.id === 'parking');
    if (spec === undefined) return;
    await earn(page, (propertyCost(spec, 2) ?? 0) + 20);

    await open(page, 'parking');
    const capacityBefore = await page.locator('[data-testid="inspect-capacity"]').textContent();

    await page.locator('[data-testid="inspect-build"]').click();
    await page.locator('[data-testid="inspect-upgrade"]').click();
    await advance(page, 2);

    // A site, with the simulation's own remaining time — and the level has not
    // moved. This is the correction pass's rule inherited rather than rebuilt:
    // pay now, receive when the building finishes.
    await expect(page.locator('[data-testid="inspect-site"]')).toBeVisible();
    const readRemaining = async (): Promise<number> =>
      Number.parseInt((await page.locator('[data-testid="inspect-remaining"]').textContent()) ?? 'NaN', 10);
    const remaining = await settled(page, readRemaining, (value) => value > 0);
    expect(remaining).toBeGreaterThan(0);
    await expect(hotspot(page, 'parking')).toHaveAttribute('data-level', '1');

    // The clock runs down rather than sitting still.
    await advance(page, 120);
    const later = await settled(page, readRemaining, (value) => value < remaining);
    expect(later).toBeLessThan(remaining);

    // Finish it. Now the level moves, and so does the capacity.
    await advance(page, 4_000);
    await expect(hotspot(page, 'parking')).toHaveAttribute('data-level', '2');
    await page.locator('[data-testid="inspect-info"]').click();
    const capacityAfter = await settled(
      page,
      async () => (await page.locator('[data-testid="inspect-capacity"]').textContent()) ?? '',
      (text) => text !== capacityBefore,
    );
    expect(capacityAfter).not.toBe(capacityBefore);
    expect(Number.parseInt(capacityAfter, 10)).toBeGreaterThan(Number.parseInt(capacityBefore ?? '0', 10));
  });

  test('a locked upgrade says what is missing instead of going grey', async ({ page }) => {
    await boot(page);
    await open(page, 'parking');
    await page.locator('[data-testid="inspect-build"]').click();

    // Broke at boot: the button carries the shortfall, in money.
    const cta = page.locator('[data-testid="inspect-upgrade"]');
    await expect(cta).toBeDisabled();
    await expect(cta).toContainText('EKSİK');

    /*
     * And the restaurant itself names the property floor — §16's rule that a
     * locked thing stays visible with its reason. At Stage 1 the lot is short
     * of what Stage 2 needs, so the main building's card says which property,
     * not "requirements not met".
     */
    await close(page);
    await open(page, 'main');
    await page.locator('[data-testid="inspect-build"]').click();
    await expect(page.locator('[data-testid="inspect-upgrade"]')).toContainText('SV. 2 GEREKLİ');
  });

  test('the preview never passes the current picture off as the next one', async ({ page }) => {
    /*
     * The one sweep in this file: five properties, each opened, switched to
     * İnşa Et, read and closed. Measured in isolation at 38 s on Chromium
     * against 13 s on Firefox — the gap is Chromium's actionability checks on
     * a control that sits over a continuously repainting canvas, not the
     * assertions, which are four string comparisons. Given room rather than
     * split up, because the point is that **every** property is checked: a
     * sweep that covers four of five is the one that misses the car park.
     */
    test.setTimeout(120_000);
    await boot(page);

    for (const spec of PROPERTIES) {
      await open(page, spec.id);
      await page.locator('[data-testid="inspect-build"]').click();

      const preview = page.locator('[data-testid="inspect-preview"]');
      if ((await preview.count()) === 0) {
        // Maxed out: there is no next level to preview, and the card says so.
        await expect(page.locator('[data-testid="inspect-maxed"]')).toBeVisible();
        await close(page);
        continue;
      }

      const art = await preview.getAttribute('data-art');
      expect(art, `${spec.id} preview state`).toMatch(/^(sprite|prompted|procedural)$/);

      if (art === 'prompted') {
        // §17: no generic placeholder, no unrelated asset, and above all not
        // the frame the player is already looking at. It says what is true.
        await expect(preview).toContainText('Görsel üretimde');
        expect(await preview.locator('i').count(), `${spec.id} drew art it does not have`).toBe(0);
      } else if (art === 'procedural') {
        /*
         * Painted from the layout, so the preview paints it: one cell per bay,
         * the new ones picked out. Never "still being made" — nobody is making
         * it, and telling the player to wait would be the same lie in reverse.
         */
        await expect(preview).not.toContainText('Görsel üretimde');
        expect(await preview.locator('b').count(), `${spec.id} painted no cells`).toBeGreaterThan(0);
      } else {
        expect(await preview.locator('i').count(), `${spec.id} claimed art and drew none`).toBe(1);
      }
      await close(page);
    }
  });
});
