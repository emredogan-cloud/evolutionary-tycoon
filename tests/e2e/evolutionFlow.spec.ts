import { expect, test } from './fixtures';
import { e2eBudget } from '../helpers/budget';
import type { Page } from '@playwright/test';

/**
 * Growing the restaurant, in a browser — GAME_EXECUTION_ROADMAP Phase 11.
 *
 * The roadmap's E2E line: _"koşullar sağlan → evrim tetikle → inşaat görünsün →
 * yeni aşama oynanabilir"_. Four assertions, and three of them are invisible
 * from Node: the requirement rows are DOM, the button is DOM, and "the camera
 * did not cut away" is a statement about a canvas.
 *
 * The last one is the one worth testing hardest. GAME_DESIGN_DOCUMENT §7 is
 * explicit that evolution is **not** a scene change — the building grows in
 * place. A scene swap would still satisfy every simulation test in the suite, so
 * here is the only place that rule can actually be checked.
 */

interface TestApi {
  dispatch(command: Record<string, unknown>): void;
  advanceTicks(n: number): void;
  getState(): { stage: number };
  getWorldHash(): string;
}

/** Long enough for the run below; see `playTheThreshold`. */
const SLOW_TEST_MS = e2eBudget(180_000);

async function boot(page: Page, seed = 424242): Promise<void> {
  await page.goto(`/?e2e=1&seed=${String(seed)}&paused=1`);
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

/**
 * Actually play until the Stage 1 requirements are met.
 *
 * **Played, not granted.** There is no debug command that hands the player cash,
 * and adding one would put a cheat in the command log — the same log that has to
 * replay to the same world hash. So this cooks, sells, buys and hires exactly as
 * a player would.
 *
 * **In chunks, and that is not an optimisation.** The first version ran all
 * 120 000 ticks inside one `page.evaluate` and polled for the button as it went.
 * It never found it: a synchronous loop holds the main thread, so Svelte cannot
 * re-render and the DOM the loop is reading is frozen at boot. Yielding between
 * chunks is what lets the interface catch up with the world.
 *
 * It runs long because the Stage 1 economy is starved — PHASE_11_REPORT §5
 * measures 46.7 to 55.2 minutes of simulated time against a designed 12 to 18,
 * which is Phase 12's problem to fix. When it does, this gets three times faster
 * on its own.
 *
 * Everything inside the callback is inline on purpose: `page.evaluate`
 * serialises the function and runs it in the browser, so a module-scope constant
 * referenced in here is a `ReferenceError` in the page rather than a compile
 * error out here.
 */
async function playTheThreshold(page: Page): Promise<boolean> {
  await page.evaluate(() => {
    (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.dispatch({
      t: 'HIRE',
      roleId: 'cook',
      skill: 0.5,
    });
  });

  for (let chunk = 0; chunk < 60; chunk++) {
    await page.evaluate((index) => {
      const hooks = (window as unknown as Record<string, TestApi>)['__EVOTYCOON__'];
      if (hooks === undefined) return;
      for (let tick = 0; tick < 2000; tick++) {
        hooks.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        // A player spending as they go, which is how the upgrade milestone is met.
        if ((index * 2000 + tick) % 600 === 0) {
          hooks.dispatch({ t: 'BUY_UPGRADE', upgradeId: 'hand-painted-sign' });
        }
        hooks.advanceTicks(1);
      }
    }, chunk);

    if ((await page.locator('[data-testid="evolve-button"]').count()) > 0) return true;
  }
  return false;
}

test.describe('evolution', () => {
  test('conditions met → evolve → construction runs → the next stage plays', async ({ page }) => {
    test.setTimeout(SLOW_TEST_MS);
    await boot(page);

    // 1. The panel says what is still missing, before anything is met.
    await expect(page.locator('[data-testid="evolution-panel"]')).toBeVisible();
    // Phase 18 collapses the requirement list behind a one-line chip.
    await page.getByTestId('evolution-peek').click();
    await expect(page.locator('[data-testid="requirement"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="evolve-button"]')).toHaveCount(0);

    // 2. Conditions met by playing — and the offer appears without a reload.
    expect(await playTheThreshold(page), 'never reached the Stage 1 requirements').toBe(true);
    const evolve = page.locator('[data-testid="evolve-button"]');
    await expect(evolve).toBeVisible();

    // The canvas we are about to watch across the transition.
    const canvasBefore = await page.locator('canvas').evaluate((node) => node.outerHTML.slice(0, 120));

    // 3. Construction is visible, and it takes time rather than snapping.
    await evolve.click();
    /*
     * A tick, because the click only *queues* the command. `sim.dispatch` stamps
     * and applies at the start of a tick, never on dispatch (CLAUDE.md §6), and
     * the world is paused here — so without this the button has been pressed and
     * nothing has happened yet. That is the design working, not a race.
     */
    await page.evaluate(() => {
      (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.advanceTicks(5);
    });
    await expect(page.locator('[data-testid="construction-status"]')).toBeVisible();

    const readProgress = async (): Promise<number> => {
      const raw = await page.locator('[data-testid="construction-progress"]').getAttribute('data-progress');
      return Number.parseFloat(raw ?? 'NaN');
    };
    const progressEarly = await readProgress();
    await page.evaluate(() => {
      (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.advanceTicks(80);
    });
    /*
     * Polled rather than read once. The bridge pushes to Svelte on a render
     * frame, not on a tick — so immediately after `advanceTicks` returns, the
     * world has moved and the DOM has not yet. Reading once here measured the
     * throttle, not the construction.
     */
    await expect
      .poll(readProgress, { message: 'construction did not advance, so it is not construction' })
      .toBeGreaterThan(progressEarly);

    // 4. The new stage arrives, and it is the same canvas it started on.
    await page.evaluate(() => {
      (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.advanceTicks(400);
    });
    const stage = await page.evaluate(
      () => (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.getState().stage,
    );
    expect(stage, 'the stage never changed').toBe(2);

    const canvasAfter = await page.locator('canvas').evaluate((node) => node.outerHTML.slice(0, 120));
    expect(canvasAfter, 'the canvas was replaced — that is a scene change').toBe(canvasBefore);
    await expect(page.locator('canvas')).toHaveCount(1);

    // Playable: the world still ticks after the transition.
    const hashBefore = await page.evaluate(() =>
      (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.getWorldHash(),
    );
    await page.evaluate(() => {
      (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.advanceTicks(200);
    });
    const hashAfter = await page.evaluate(() =>
      (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.getWorldHash(),
    );
    expect(hashAfter, 'the world stopped simulating after the transition').not.toBe(hashBefore);

    /*
     * GAME_DESIGN_DOCUMENT §14.3 forbids a modal here for the same reason it
     * forbids one for upgrades: the thing being changed is on screen, and a
     * dialogue over it hides the only feedback that matters. Asserted in this
     * test rather than its own so it does not pay the run cost twice.
     */
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="hud-cash"]')).toBeVisible();
  });
});
