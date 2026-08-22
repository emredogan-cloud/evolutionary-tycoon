import { expect, test } from './fixtures';
import { e2eBudget } from '../helpers/budget';
import type { Page } from '@playwright/test';

/**
 * The upgrade tree, in a browser — GAME_EXECUTION_ROADMAP Phase 13.
 *
 * The roadmap's E2E line is _"her ailenin bir yükseltmesi"_ — one upgrade from
 * each of the five families. What that is really testing is that the tree's two
 * new *interface* ideas survive the trip through the bridge: the build menu that
 * exists for discovery, and the card that now has to explain **two different
 * kinds of no** (you have not unlocked this; you cannot afford this).
 *
 * The simulation side is proved in Node — thirty upgrades, every effect measured
 * moving, every prerequisite enforced. None of that needs a browser. What needs
 * a browser is whether a player can find any of it.
 */

interface TestApi {
  dispatch(command: Record<string, unknown>): void;
  advanceTicks(n: number): void;
}

async function boot(page: Page, stage = 1): Promise<void> {
  await page.goto(`/?e2e=1&seed=424242&paused=1&stage=${String(stage)}`);
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  /*
   * The HUD publishes only once the bridge goes live, and the bridge waits for
   * assets. Reading `data-cash` before that races a slow load — proven against
   * the CDN, where the sim ticked and earned for a full test's length while the
   * attribute sat at its initial 0.00. Same window as build mode's ghost race.
   */
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
}

async function readCash(page: Page): Promise<number> {
  const raw = await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash');
  return Number.parseFloat(raw ?? 'NaN');
}

/** Open the discovery surface — the consolidation pass's build panel. */
async function openMenu(page: Page): Promise<void> {
  await page.locator('[data-testid="dock-build"]').click();
  await expect(page.locator('[data-testid="build-panel"]')).toBeVisible();
}

test.describe('the build panel is the map of the tree', () => {
  test('lists all five families and every upgrade in them', async ({ page }) => {
    await boot(page);
    await openMenu(page);

    const families = page.locator('[data-testid="build-family"]');
    await expect(families).toHaveCount(5);

    // The full tree, including what is still locked — seeing what is coming is
    // the point of a discovery list.
    await expect(page.locator('[data-testid="build-card"]')).toHaveCount(30);

    for (const family of ['VISIBILITY_APPEAL', 'KITCHEN', 'CAPACITY', 'DRIVE_THRU', 'STAFF']) {
      await expect(page.locator(`[data-testid="build-family"][data-family="${family}"]`)).toHaveCount(1);
    }
  });

  test('shows a later stage as out of reach rather than hiding it', async ({ page }) => {
    /*
     * A Stage 1 stand can see the drive-thru upgrades and cannot buy them. That
     * is deliberate: an upgrade tree the player cannot see the shape of is a
     * series of surprises rather than a plan.
     */
    await boot(page);
    await openMenu(page);

    const laneRow = page.locator('[data-testid="build-card"][data-upgrade="lane-extension"]');
    await expect(laneRow).toBeVisible();
    await expect(laneRow).toHaveAttribute('data-stage', '4');
    await expect(laneRow).toHaveClass(/locked/);
  });

  test('selecting a row opens the card beside the object, not a purchase', async ({ page }) => {
    /*
     * GAME_DESIGN_DOCUMENT §14.3 puts the decision in the world. A second place
     * to buy would quietly become the first place, because a list is faster to
     * click through than a world is to look at — so the list *points*, and the
     * card is where money moves.
     */
    await boot(page);
    await openMenu(page);

    await expect(page.locator('[data-testid="upgrade-card"]')).toHaveCount(0);
    await page.locator('[data-testid="build-card"][data-upgrade="hand-painted-sign"]').click();

    const card = page.locator('[data-testid="upgrade-card"]');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-upgrade', 'hand-painted-sign');
    // And nothing was bought by looking at it.
    await expect(page.locator('[data-testid="upgrade-level"]')).toContainText('Kademe 0');
  });
});

test.describe('the card explains both kinds of no', () => {
  test('says how much money is missing', async ({ page }) => {
    await boot(page);
    await openMenu(page);
    await page.locator('[data-testid="build-card"][data-upgrade="hand-painted-sign"]').click();

    // A fresh stand cannot afford anything, and the card says by how much
    // rather than only that it cannot.
    const short = page.locator('[data-testid="upgrade-short"]');
    await expect(short).toBeVisible();
    const missing = Number.parseInt((await short.getAttribute('data-short-by')) ?? '0', 10);
    expect(missing, 'the card did not say how much was missing').toBeGreaterThan(0);
    await expect(page.locator('[data-testid="upgrade-buy"]')).toBeDisabled();
  });

  test('names the prerequisite when that is the problem', async ({ page }) => {
    /*
     * The difference that matters. Money is solved by waiting; a prerequisite is
     * solved by doing something else first, and a card that greyed the button
     * out for both would leave the player guessing which.
     */
    await boot(page, 2);
    await page.evaluate(() => {
      (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.dispatch({
        t: 'SET_PRICE',
        itemId: 'lemonade',
        price: 4.05,
      });
    });
    await openMenu(page);
    await page.locator('[data-testid="build-card"][data-upgrade="illuminated-sign"]').click();

    const locked = page.locator('[data-testid="upgrade-locked"]');
    await expect(locked).toBeVisible();
    await expect(locked).toContainText('Önce gerekli');
    await expect(page.locator('[data-testid="upgrade-buy"]')).toBeDisabled();
  });
});

/**
 * Buy `id`, and check the world and the list agree that it happened.
 *
 * Trades first, then **waits for the overlay to catch up**: the bridge publishes
 * on a render frame and a forty-thousand-tick `page.evaluate` holds the main
 * thread for all of it, so the instant it returns the DOM still describes the
 * world as it was. Reading the buy button then measures the throttle rather than
 * the till.
 */
async function buyRoot(page: Page, family: string, id: string, ticks: number): Promise<void> {
  const before = await readCash(page);
  await trade(page, ticks);
  await expect
    .poll(async () => readCash(page), { message: `the till never rose before buying ${id}` })
    .toBeGreaterThan(before);

  await page.locator(`[data-testid="build-card"][data-upgrade="${id}"]`).click();

  /*
   * Park the pointer in the middle of the viewport before touching the card.
   *
   * The card is anchored in the *world* and positioned through the camera, and
   * the camera pans while the pointer sits near an edge (`edgePushVelocity` in
   * `CameraController` — a feature, not a bug). A card that never stops moving
   * never becomes stable, and Playwright waits for stability before clicking:
   * Firefox timed out here for two minutes on a button that was enabled the
   * whole time.
   */
  const viewport = page.viewportSize();
  if (viewport !== null) await page.mouse.move(viewport.width / 2, viewport.height / 2);

  const card = page.locator('[data-testid="upgrade-card"]');
  await expect(card).toHaveAttribute('data-upgrade', id);
  await expect(page.locator('[data-testid="upgrade-family"]')).toHaveAttribute('data-family', family);

  const buy = page.locator('[data-testid="upgrade-buy"]');
  await expect(buy, `${id} was not buyable`).toBeEnabled();
  await buy.click();
  await page.evaluate(() => {
    // Through the whole construction, not two ticks: the correction pass
    // lands the level when the site completes (ceiling 12 s = 240 ticks).
    (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.advanceTicks(260);
  });

  // The level the card reports is the level the simulation holds; the bridge is
  // the only path between them.
  await expect(page.locator('[data-testid="upgrade-level"]')).toContainText('Kademe 1');
  await expect(
    page.locator(`[data-testid="build-card"][data-upgrade="${id}"]`),
    `${id} did not show as owned in the list`,
  ).toHaveAttribute('data-owned', '1');
}

/** Play with an attentive cook for `ticks`, in one pass so the loop never crosses the boundary. */
async function trade(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    const hooks = (window as unknown as Record<string, TestApi>)['__EVOTYCOON__'];
    if (hooks === undefined) return;
    for (let tick = 0; tick < count; tick++) {
      hooks.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      hooks.advanceTicks(1);
    }
  }, ticks);
}

test('one upgrade from four families, at the stage where they open', async ({ page }) => {
  /*
   * Two minutes, because this plays fifty thousand ticks and Firefox runs the
   * simulation about half as fast as Chromium — the default thirty seconds is a
   * measurement of SpiderMonkey rather than of the tree.
   */
  test.setTimeout(e2eBudget(120_000));
  /*
   * The roadmap's line — _"her ailenin bir yükseltmesi"_ — for the four families
   * that exist by Stage 2. The fifth is the drive-thru, which only exists at
   * Stage 4 and gets its own test below.
   *
   * Stage 2 rather than Stage 4 on purpose: `STAGE_MULTIPLIER` puts a Stage 4
   * price at fifty-five times its base, so the same five purchases cost ₡2 000
   * there and ₡150 here. The thing under test is the tree and the interface, not
   * how long a restaurant takes to save up.
   */
  await boot(page, 2);
  await openMenu(page);

  await buyRoot(page, 'VISIBILITY_APPEAL', 'hand-painted-sign', 20_000);
  await buyRoot(page, 'KITCHEN', 'sharper-knives', 12_000);
  await buyRoot(page, 'CAPACITY', 'shade-canopy', 12_000);
  await buyRoot(page, 'STAFF', 'non-slip-shoes', 12_000);
});

test('and one from the drive-thru, which only exists at Stage 4', async ({ page }) => {
  test.setTimeout(e2eBudget(120_000));
  /*
   * The fifth family. A Stage 4 restaurant needs waiters to serve its tables, so
   * two are hired before anything is measured — without them nothing is
   * delivered and the till never moves, which is Phase 11's own finding rather
   * than anything about upgrades.
   */
  await boot(page, 4);

  await page.evaluate(() => {
    const hooks = (window as unknown as Record<string, TestApi>)['__EVOTYCOON__'];
    for (const roleId of ['waiter', 'waiter']) hooks?.dispatch({ t: 'HIRE', roleId, skill: 0.6 });
  });

  await openMenu(page);
  await buyRoot(page, 'DRIVE_THRU', 'express-window', 60_000);
});
