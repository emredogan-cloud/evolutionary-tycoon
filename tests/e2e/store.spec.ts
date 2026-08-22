import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { DEMOLISH_REFUND_FRACTION, storeItem } from '@config/store';

/**
 * The store, in a real browser — the reported bug's scenario, end to end.
 *
 * > "buys hand-painted sign · pays · places it · but trash can / flower appears"
 *
 * The simulation-side property is pinned in
 * `tests/unit/sim/layout/storeIdentity.test.ts`. What only a browser can prove
 * is the half that was actually broken: that the *interface* hands the
 * simulation the id of the card the player pressed, and that no other surface
 * on that screen is holding an armed prop of its own. So this drives the real
 * cards, the real pointer, and the real canvas, and then asks the simulation
 * what it ended up with.
 */

const TICKS_PER_MINUTE = 1200;

interface Hook {
  dispatch(command: object): void;
  advanceTicks(n: number): void;
  getState(): {
    placedCount: number;
    placed: readonly { objectId: string; x: number; y: number; itemId?: string }[];
  };
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&paused=1');
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
}

async function readCash(page: Page): Promise<number> {
  const raw = await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash');
  return Number.parseFloat(raw ?? 'NaN');
}

/** Earn a float the honest way — the player is the cook at Stage 1. */
async function cookUntil(page: Page, target: number): Promise<void> {
  for (let minute = 0; minute < 40 && (await readCash(page)) < target; minute++) {
    await page.evaluate((count) => {
      const api = hookOf();
      for (let i = 0; i < count; i++) {
        api.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        api.advanceTicks(1);
      }
      function hookOf(): Hook {
        return (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
      }
    }, TICKS_PER_MINUTE);
  }
  expect(await readCash(page), 'the stand never earned a float').toBeGreaterThanOrEqual(target);
}

async function openStore(page: Page): Promise<void> {
  await page.locator('[data-testid="dock-menu"]').click();
  await page.locator('[data-testid="shop-tab-decor"]').click();
  await expect(page.locator('[data-testid="store-panel"]')).toBeVisible();
}

/**
 * Sweep the canvas for a spot the armed item may legally stand on, and click
 * it. Returns the world cell that was taken.
 *
 * Deliberately a search rather than a hardcoded coordinate: the isometric
 * projection, the camera and the layout all move between passes, and a fixed
 * screen point is how a spec ends up asserting something about the sky.
 */
async function placeSomewhereLegal(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').first().boundingBox();
  expect(box, 'no canvas to place on').not.toBeNull();
  if (box === null) throw new Error('no canvas');

  const ghost = page.locator('[data-testid="build-ghost"]');
  for (let ix = 2; ix <= 8; ix++) {
    for (let iy = 2; iy <= 8; iy++) {
      const x = box.x + (box.width * ix) / 10;
      const y = box.y + (box.height * iy) / 10;
      await page.mouse.move(x, y);
      if ((await ghost.count()) === 0) continue;
      if ((await ghost.getAttribute('data-outcome')) !== 'ok') continue;

      const worldX = Number(await ghost.getAttribute('data-world-x'));
      const worldY = Number(await ghost.getAttribute('data-world-y'));
      await page.mouse.click(x, y);
      return { x: worldX, y: worldY };
    }
  }
  throw new Error('no legal placement found anywhere on the visible lot');
}

test.describe('the store', () => {
  test('shows every card with a picture, a price and a reason it is unavailable', async ({ page }) => {
    await boot(page);
    await openStore(page);

    const cards = page.locator('[data-testid="store-card"]');
    await expect(cards).not.toHaveCount(0);

    // Stage 1, no money: every card says which of the two problems it has, and
    // "you have not reached that stage yet" is the one the player can act on.
    const locked = page.locator('[data-testid="store-card"][data-status="locked"]');
    await expect(locked).not.toHaveCount(0);
    await expect(locked.first().locator('[data-testid="store-lock"]')).toContainText('Aşama');

    const short = page.locator('[data-testid="store-card"][data-status="short"]');
    await expect(short).not.toHaveCount(0);
    await expect(short.first().locator('[data-testid="store-lock"]')).toContainText('eksik');
  });

  test('arms nothing until a card is pressed', async ({ page }) => {
    await boot(page);

    // The whole bug in one assertion: opening a panel must not leave the world
    // listening for a placement. Before this pass, opening build mode armed a
    // planter and covered the viewport with a click surface that placed it.
    await expect(page.locator('[data-testid="build-surface"]')).toHaveCount(0);
    await page.locator('[data-testid="dock-build"]').click();
    await expect(page.locator('[data-testid="build-surface"]')).toHaveCount(0);
    await page.locator('[data-testid="dock-build"]').click();

    await openStore(page);
    await expect(page.locator('[data-testid="build-surface"]')).toHaveCount(0);
  });

  test('buys, places, moves and sells back the very item the player pressed', async ({ page }) => {
    test.setTimeout(240_000);
    await boot(page);

    const item = storeItem('waste-bin');
    expect(item, 'the catalogue lost waste-bin').toBeDefined();
    if (item === undefined) return;

    await cookUntil(page, item.cost + 5);
    await openStore(page);

    // ── Arm it, from its own card ──────────────────────────────────────────
    const card = page.locator(`[data-testid="store-card"][data-item="${item.id}"]`);
    await expect(card).toHaveAttribute('data-status', 'available');
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');

    const surface = page.locator('[data-testid="build-surface"]');
    await expect(surface).toHaveCount(1);
    // The surface knows what it is placing, and it is what was pressed.
    await expect(surface).toHaveAttribute('data-armed', item.id);

    // ── Place it ───────────────────────────────────────────────────────────
    const cashBefore = await readCash(page);
    const spot = await placeSomewhereLegal(page);

    const placed = await page.evaluate(() => {
      const api = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
      api.advanceTicks(1);
      const view = api.getState();
      return view.placed.slice(0, view.placedCount).map((row) => ({ ...row }));
    });

    expect(placed, 'nothing was placed').toHaveLength(1);
    // The identity chain, across the whole stack: card → command → world.
    expect(placed[0]?.itemId, 'the world got a different item than was bought').toBe(item.id);
    expect(placed[0]?.objectId, 'the world drew a different object').toBe(item.objectId);
    expect(placed[0]?.x).toBeCloseTo(spot.x, 5);
    expect(placed[0]?.y).toBeCloseTo(spot.y, 5);

    /*
     * Paid for exactly once, and the tool is put down afterwards. Polled
     * rather than read: the till is a *published* value — the bridge samples
     * the world on its own cadence — so reading the DOM the instant after the
     * command applies is racing the publish, not asserting the economy.
     */
    await expect
      .poll(async () => Number((cashBefore - (await readCash(page))).toFixed(2)), {
        message: 'the purchase never reached the till',
      })
      .toBe(Number(item.cost.toFixed(2)));
    await expect(page.locator('[data-testid="build-surface"]')).toHaveCount(0);

    // ── Move it ────────────────────────────────────────────────────────────
    await expect(page.locator('[data-testid="store-owned"]')).toBeVisible();
    const cashBeforeMove = await readCash(page);
    await page.locator('[data-testid="store-move"]').first().click();
    await expect(page.locator('[data-testid="build-surface"]')).toHaveAttribute('data-armed', item.id);
    const moved = await placeSomewhereLegal(page);

    const afterMove = await page.evaluate(() => {
      const api = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
      api.advanceTicks(1);
      const view = api.getState();
      return view.placed.slice(0, view.placedCount).map((row) => ({ ...row }));
    });

    expect(afterMove, 'the move duplicated the object').toHaveLength(1);
    expect(afterMove[0]?.itemId, 'the move re-identified the object').toBe(item.id);
    expect(afterMove[0]?.x).toBeCloseTo(moved.x, 5);
    expect(await readCash(page), 'the move touched the till').toBeCloseTo(cashBeforeMove, 2);

    // ── Sell it back ───────────────────────────────────────────────────────
    const cashBeforeSell = await readCash(page);
    await page.locator('[data-testid="store-sell"]').first().click();

    const afterSell = await page.evaluate(() => {
      const api = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
      api.advanceTicks(1);
      return api.getState().placedCount;
    });
    expect(afterSell, 'selling left the object standing').toBe(0);
    await expect
      .poll(async () => Number(((await readCash(page)) - cashBeforeSell).toFixed(2)), {
        message: 'the refund was not the approved thirty percent',
      })
      .toBe(Number((item.cost * DEMOLISH_REFUND_FRACTION).toFixed(2)));
  });

  test('a placement the lot refuses is shown as refused before the click', async ({ page }) => {
    test.setTimeout(240_000);
    await boot(page);

    const item = storeItem('roadside-sign');
    if (item === undefined) return;
    await cookUntil(page, item.cost + 5);
    await openStore(page);

    await page.locator(`[data-testid="store-card"][data-item="${item.id}"]`).click();

    const box = await page.locator('canvas').first().boundingBox();
    if (box === null) throw new Error('no canvas');

    // Somewhere on the lot the sign is not allowed to stand: the ghost has to
    // say so while the player can still move the mouse.
    const ghost = page.locator('[data-testid="build-ghost"]');
    let sawRefusal = false;
    for (let iy = 2; iy <= 9 && !sawRefusal; iy++) {
      for (let ix = 1; ix <= 9 && !sawRefusal; ix++) {
        await page.mouse.move(box.x + (box.width * ix) / 10, box.y + (box.height * iy) / 10);
        if ((await ghost.count()) === 0) continue;
        const outcome = await ghost.getAttribute('data-outcome');
        if (outcome !== null && outcome !== 'ok') sawRefusal = true;
      }
    }
    expect(sawRefusal, 'the ghost never refused anything anywhere on the lot').toBe(true);
  });
});
