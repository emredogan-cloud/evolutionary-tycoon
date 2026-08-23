import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { BUILDINGS, buildingCost } from '@config/buildings';

/**
 * Functional buildings, in a real browser — the directive's §21 O–R.
 *
 * Decision B's condition is that a purchased building changes the actual
 * game, and the simulation side of that is pinned in
 * `tests/unit/sim/buildings/buildingEffect.test.ts`. What only a browser can
 * show is the half the player touches: the card, the placement, the site that
 * counts down, the level badge that appears when it finishes, and the level
 * that goes up when they pay again.
 */

interface Hook {
  dispatch(command: object): void;
  advanceTicks(n: number): void;
  getState(): {
    placedCount: number;
    placed: readonly { objectId: string; itemId?: string; level?: number }[];
    pendingBuildCount: number;
  };
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&paused=1');
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', { timeout: 30_000 });
}

async function readCash(page: Page): Promise<number> {
  const raw = await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash');
  return Number.parseFloat(raw ?? 'NaN');
}

async function earn(page: Page, target: number): Promise<void> {
  for (let minute = 0; minute < 60 && (await readCash(page)) < target; minute++) {
    await page.evaluate(() => {
      const api = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
      for (let i = 0; i < 1200; i++) {
        api.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        api.advanceTicks(1);
      }
    });
  }
  expect(await readCash(page), 'the stand never earned enough to build').toBeGreaterThanOrEqual(target);
}

async function openBuildings(page: Page): Promise<void> {
  await page.locator('[data-testid="dock-build"]').click();
  await page.locator('[data-testid="build-tab-buildings"]').click();
  await expect(page.locator('[data-testid="building-panel"]')).toBeVisible();
}

/** Sweep the canvas for a legal spot and click it. */
async function placeSomewhereLegal(page: Page): Promise<void> {
  const box = await page.locator('canvas').first().boundingBox();
  if (box === null) throw new Error('no canvas');
  const ghost = page.locator('[data-testid="build-ghost"]');
  for (let ix = 2; ix <= 8; ix++) {
    for (let iy = 4; iy <= 8; iy++) {
      const x = box.x + (box.width * ix) / 10;
      const y = box.y + (box.height * iy) / 10;
      await page.mouse.move(x, y);
      if ((await ghost.count()) === 0) continue;
      if ((await ghost.getAttribute('data-outcome')) !== 'ok') continue;
      await page.mouse.click(x, y);
      return;
    }
  }
  throw new Error('no legal placement found');
}

test.describe('functional buildings', () => {
  test('shows what each one does, what it costs and what it needs', async ({ page }) => {
    await boot(page);
    await openBuildings(page);

    const cards = page.locator('[data-testid="building-card"]');
    await expect(cards).toHaveCount(BUILDINGS.length);

    for (const item of BUILDINGS) {
      const card = page.locator(`[data-testid="building-card"][data-building="${item.id}"]`);
      await expect(card).toContainText(item.label);
      // What it does, not just what it costs.
      await expect(card).toContainText(item.description.slice(0, 12));
      await expect(card).toContainText(String(buildingCost(item, 1) ?? 0));
    }

    // Stage, player level and building level are three different things and
    // the panel says so rather than running them together.
    await expect(page.locator('[data-testid="building-panel"]')).toContainText('Aşama');
    await expect(page.locator('[data-testid="building-panel"]')).toContainText('Oyuncu seviyesi');
  });

  test('buys, builds, completes and then levels up — with the effect only at the end', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page);

    const item = BUILDINGS.find((candidate) => candidate.id === 'cola-machine');
    expect(item).toBeDefined();
    if (item === undefined) return;

    await earn(page, (buildingCost(item, 1) ?? 0) + 5);
    await openBuildings(page);

    const cashBefore = await readCash(page);
    await page.locator(`[data-testid="building-build"][data-building="${item.id}"]`).click();
    await expect(page.locator('[data-testid="build-surface"]')).toHaveAttribute('data-armed', item.id);
    await placeSomewhereLegal(page);

    // The object is on the lot immediately — but at level 0, under a site.
    const afterPlace = await page.evaluate(() => {
      const api = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
      api.advanceTicks(1);
      const view = api.getState();
      return {
        placed: view.placed.slice(0, view.placedCount).map((row) => ({ ...row })),
        sites: view.pendingBuildCount,
      };
    });
    const built = afterPlace.placed.find((row) => row.itemId === item.id);
    expect(built, 'the building never appeared on the lot').toBeDefined();
    expect(built?.level, 'a building under construction already claimed its level').toBe(0);
    expect(afterPlace.sites, 'no construction site was raised').toBeGreaterThan(0);

    await expect
      .poll(async () => Number((cashBefore - (await readCash(page))).toFixed(2)))
      .toBe(Number((buildingCost(item, 1) ?? 0).toFixed(2)));

    // Let the site finish: the level lands, and the badge with it.
    await page.evaluate(() => {
      (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__.advanceTicks(600);
    });
    const done = await page.evaluate(() => {
      const view = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__.getState();
      return view.placed.slice(0, view.placedCount).map((row) => ({ ...row }));
    });
    expect(done.find((row) => row.itemId === item.id)?.level, 'the level never landed').toBe(1);

    await expect(page.locator(`[data-testid="building-card"][data-building="${item.id}"]`)).toHaveAttribute(
      'data-level',
      '1',
    );
    await expect(
      page.locator(
        `[data-testid="building-card"][data-building="${item.id}"] [data-testid="building-level"]`,
      ),
    ).toContainText('Sv. 1');

    // Level 2 needs Stage 2 — the card says so rather than failing silently.
    await expect(
      page.locator(`[data-testid="building-card"][data-building="${item.id}"] [data-testid="building-lock"]`),
    ).toContainText('Aşama 2');
  });
});
