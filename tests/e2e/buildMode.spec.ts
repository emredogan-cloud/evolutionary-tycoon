import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Build mode, in a browser — GAME_EXECUTION_ROADMAP Phase 11.
 *
 * The roadmap: _"a placement that would block navigation must be rejected with
 * clear visual feedback, not silently accepted and then break pathfinding"_.
 *
 * The simulation side of that is already proved in
 * `tests/integration/layoutChange.test.ts`, which hammers a hundred placements
 * and checks the lot is still navigable after every one. What that cannot check
 * is the half the player actually experiences: whether the refusal is *visible*,
 * and whether it arrives before the click or after it. So this test is about the
 * ghost, not about the rule.
 */

/**
 * Since the stage-1 expansion pass the door is a store card, not a palette.
 *
 * The claims below did not change — the ghost still has to answer before the
 * click, the click still has to obey it, and the surface still has to give the
 * world back — but the surface is now armed by buying something specific, so
 * the tests arm it that way. The palette they used to press was the armed
 * decor strip, and that strip *was* the reported sign-becomes-flower bug: it
 * held a prop of its own behind a full-viewport click layer.
 */
interface TestApi {
  advanceTicks(n: number): void;
  dispatch(command: object): void;
}

const TICKS_PER_MINUTE = 1200;
/** The catalogue's cheapest Stage 1 item, so the float is quick to earn. */
const ITEM = 'shrub';

async function readCash(page: Page): Promise<number> {
  const raw = await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash');
  return Number.parseFloat(raw ?? 'NaN');
}

/** Earn a float, open the store, and arm the item — the player's real path. */
async function arm(page: Page, fund = true): Promise<void> {
  if (fund) {
    for (let minute = 0; minute < 40 && (await readCash(page)) < 8; minute++) {
      await page.evaluate((count) => {
        const api = (window as unknown as Record<string, TestApi>)['__EVOTYCOON__'];
        for (let i = 0; i < count; i++) {
          api?.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
          api?.advanceTicks(1);
        }
      }, TICKS_PER_MINUTE);
    }
  }
  await page.locator('[data-testid="dock-menu"]').click();
  await page.locator('[data-testid="shop-tab-decor"]').click();
  await page.locator(`[data-testid="store-card"][data-item="${ITEM}"]`).click();
  await expect(page.locator('[data-testid="build-surface"]')).toBeVisible();
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&paused=1');
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  /*
   * And the *world*, not only the simulation. Build mode's ghost asks the
   * camera to unproject the pointer, and the projector answers null until the
   * world scene is active — which used to be the same instant as the HUD,
   * because the placeholder path had nothing to load. Real atlases opened a
   * window where the HUD is up, the sim runs, and a pointer move lands in a
   * world that does not exist yet; this test found it by moving the mouse
   * exactly once, in that window.
   */
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
}

/**
 * Drag the pointer across the middle of the canvas until the ghost reports
 * `outcome`, and give back the screen point that produced it.
 *
 * ## Why only the middle
 *
 * Because the camera **pans when the pointer nears the edge** —
 * `edgePushVelocity` in `CameraController`, which is a feature and not a bug. A
 * sweep that walked the whole canvas therefore pushed the camera the entire time
 * it was measuring, so the second sweep read a different world through the same
 * pixels and could not find the cell it had just filled. The middle band is the
 * part of the canvas where hovering does not move the world.
 *
 * ## And why the read waits a frame
 *
 * Svelte flushes on a microtask and the attribute is written by that flush, so
 * reading straight after `mouse.move` returns the *previous* point's verdict.
 */
async function findGhost(page: Page, outcome: string): Promise<{ x: number; y: number } | null> {
  const box = await page.locator('canvas').boundingBox();
  if (box === null) return null;

  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 7; column++) {
      /*
       * Whole pixels. Playwright's `mouse.move` and `mouse.click` do not round a
       * fractional coordinate identically, so a fractional lattice can place an
       * object in one cell and then hover its neighbour.
       */
      const x = Math.round(box.x + box.width * (0.32 + 0.06 * column));
      const y = Math.round(box.y + box.height * (0.3 + 0.06 * row));
      await page.mouse.move(x, y);

      const seen = await page.evaluate(
        async () =>
          new Promise<string | null>((resolve) => {
            requestAnimationFrame(() => {
              resolve(
                document.querySelector('[data-testid="build-ghost"]')?.getAttribute('data-outcome') ?? null,
              );
            });
          }),
      );
      if (seen === outcome) return { x, y };
    }
  }
  return null;
}

test.describe('build mode', () => {
  test('the ghost says yes or no before the click, and the click obeys it', async ({ page }) => {
    await boot(page);

    // Closed by default: the pointer surface must not exist until asked for.
    await expect(page.locator('[data-testid="build-surface"]')).toHaveCount(0);

    test.setTimeout(240_000);
    await arm(page);
    await expect(page.locator('[data-testid="build-surface"]')).toHaveAttribute('data-armed', ITEM);

    // 1. Somewhere on the lot, the ghost is green and says so.
    const good = await findGhost(page, 'ok');
    expect(good, 'nowhere on the lot accepted a placement').not.toBeNull();
    if (good === null) return;
    const ghost = page.locator('[data-testid="build-ghost"]');
    await expect(ghost).toHaveAttribute('data-outcome', 'ok');
    await expect(ghost).not.toHaveClass(/bad/);

    // The ghost sits on a grid cell, not under the cursor. Half-metre cells, so
    // every coordinate it reports is a multiple of 0.5.
    const worldX = Number.parseFloat((await ghost.getAttribute('data-world-x')) ?? 'NaN');
    const worldY = Number.parseFloat((await ghost.getAttribute('data-world-y')) ?? 'NaN');
    expect((worldX * 2) % 1, `ghost x ${String(worldX)} is off the grid`).toBe(0);
    expect((worldY * 2) % 1, `ghost y ${String(worldY)} is off the grid`).toBe(0);

    // 2. Clicking there places it, and the world says so.
    await page.mouse.click(good.x, good.y);
    await page.evaluate(() => {
      (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.advanceTicks(2);
    });
    await expect(page.locator('[data-testid="store-owned"] li')).toHaveCount(1);

    // Placing puts the tool down, so the next sweep has to arm again.
    await page.locator(`[data-testid="store-card"][data-item="${ITEM}"]`).click();

    /*
     * 3. The filled cell is now refused, and the refusal is on screen.
     *
     * Found by sweeping again rather than by returning to the pixel that was
     * clicked. Screen coordinates are not a stable name for a world cell — the
     * camera keeps easing for a moment after boot, so the same pixel is a
     * different cell a few hundred milliseconds later, and an earlier version of
     * this test failed for exactly that reason while the placement itself was
     * perfectly correct. Sweeping asks the question that actually matters: is
     * there now somewhere the game refuses because it is taken?
     */
    const taken = await findGhost(page, 'occupied');
    expect(taken, 'the placed object did not make its own cell occupied').not.toBeNull();
    if (taken === null) return;
    await expect(ghost).toHaveClass(/bad/);

    await page.mouse.click(taken.x, taken.y);
    await page.evaluate(() => {
      (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.advanceTicks(2);
    });
    await expect(
      page.locator('[data-testid="store-owned"] li'),
      'a refused placement was accepted anyway',
    ).toHaveCount(1);

    // 4. Selling it back puts the lot back.
    await page.locator('[data-testid="store-sell"]').first().click();
    await page.evaluate(() => {
      (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.advanceTicks(2);
    });
    await expect(page.locator('[data-testid="store-owned"] li')).toHaveCount(0);
  });

  test('off the lot is refused, with its own reason', async ({ page }) => {
    /*
     * Its own answer rather than a generic "no", because the four ways a
     * placement fails are four different mistakes and only one of them is the
     * player's fault in an interesting way. The corner of the viewport is
     * reliably outside the lot at the boot camera.
     */
    test.setTimeout(240_000);
    await boot(page);
    // Nothing to buy it with, and none needed: the ghost answers before money
    // is ever asked for, which is the point of answering before the click.
    await arm(page, false);

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;

    await page.mouse.move(box.x + 6, box.y + box.height - 6);
    const ghost = page.locator('[data-testid="build-ghost"]');
    await expect(ghost).toHaveAttribute('data-outcome', 'outside-lot');
    await expect(ghost).toHaveClass(/bad/);
  });

  test('putting the tool down gives the world back', async ({ page }) => {
    // The surface covers the canvas while something is armed. If it survived
    // disarming, every later click in the session would land on an invisible
    // sheet — which is exactly how a bought sign became a placed flower.
    test.setTimeout(240_000);
    await boot(page);
    await arm(page, false);

    await page.locator(`[data-testid="store-card"][data-item="${ITEM}"]`).click();
    await expect(page.locator('[data-testid="build-surface"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="build-ghost"]')).toHaveCount(0);

    // And the other door does not arm anything either.
    await page.locator('[data-testid="dock-build"]').click();
    await expect(page.locator('[data-testid="build-surface"]')).toHaveCount(0);
  });
});
