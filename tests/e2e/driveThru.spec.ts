import { expect, test } from './fixtures';

/**
 * The Stage 4 restaurant, in a browser — GAME_EXECUTION_ROADMAP Phase 11.
 *
 * ## What this test is and is not for
 *
 * The drive-thru's *behaviour* — cars ordering at the post, advancing to the
 * window, the lane compacting, the much shorter patience — is proved in
 * `tests/integration/driveThru.test.ts`, in Node, deterministically, twelve
 * ways. Repeating any of that here would buy nothing and cost a browser.
 *
 * What only a browser can answer is whether the **Stage 4 world runs at all**:
 * it has a different layout, a different manoeuvre table, a second register, ten
 * tables and a lane that Stage 1 has no code path for, and every one of those is
 * reached for the first time through the renderer. A stage that throws on its
 * first frame is a stage that passes every simulation test in the suite.
 *
 * `?stage=4` starts there rather than playing there. Earning Stage 4 honestly is
 * three transitions and hours of simulated time; the parameter is the same kind
 * of affordance as `?scene=` and is documented as one in `renderMode.ts`.
 */

/**
 * Hosts whose injected scripts our own CSP blocks, correctly.
 *
 * Vercel adds a preview-toolbar script to every preview deployment; our
 * `script-src 'self'` refuses it and the browser logs a violation. That
 * violation is **the policy working**, not the game failing — and this test's
 * "no errors" assertion is about the Stage 4 world, which has nothing to do with
 * it. Filtered by host and only for CSP violations, exactly as
 * `verticalSlice.spec.ts` does, so a real error from our own code cannot hide
 * behind it.
 */
const FOREIGN_SCRIPT_HOSTS = ['vercel.live'];

function isForeignCspViolation(text: string): boolean {
  if (!text.includes('Content Security Policy')) return false;
  return FOREIGN_SCRIPT_HOSTS.some((host) => text.includes(host));
}

interface TestApi {
  dispatch(command: Record<string, unknown>): void;
  advanceTicks(n: number): void;
  getState(): { stage: number };
}

test('the Stage 4 restaurant boots, renders and keeps serving', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!isForeignCspViolation(error.message)) errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (!isForeignCspViolation(message.text())) errors.push(message.text());
  });

  await page.goto('/?e2e=1&seed=424242&paused=1&stage=4');
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');

  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, TestApi>)['__EVOTYCOON__']?.getState().stage,
    ),
    'the stage parameter did not take',
  ).toBe(4);

  // Enough staff that the kitchen is not the thing being measured.
  await page.evaluate(() => {
    const hooks = (window as unknown as Record<string, TestApi>)['__EVOTYCOON__'];
    hooks?.dispatch({ t: 'HIRE', roleId: 'cook', skill: 0.6 });
    hooks?.dispatch({ t: 'HIRE', roleId: 'waiter', skill: 0.6 });
  });

  // Ten minutes of simulated trading, in chunks so the overlay keeps up.
  for (let chunk = 0; chunk < 6; chunk++) {
    await page.evaluate(() => {
      const hooks = (window as unknown as Record<string, TestApi>)['__EVOTYCOON__'];
      if (hooks === undefined) return;
      for (let tick = 0; tick < 2000; tick++) {
        hooks.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        hooks.advanceTicks(1);
      }
    });
  }

  const served = Number.parseInt((await page.locator('[data-testid="hud-served"]').textContent()) ?? '0', 10);
  expect(served, 'the Stage 4 restaurant served nobody in ten minutes').toBeGreaterThan(0);

  // A stage that logs an error on the way through is not a stage that works.
  expect(errors, `browser errors during Stage 4: ${errors.join(' | ')}`).toHaveLength(0);
  await expect(page.locator('canvas')).toHaveCount(1);
});
