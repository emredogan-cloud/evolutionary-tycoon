import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * No panel may swallow another panel's controls — and the queue is what makes
 * that happen.
 *
 * The bug this file exists to pin: the speed rail and the order stack both sit
 * at the left edge with the same `z-index`, and the stack grows downward with
 * the queue. At five queued orders it covered the vertically-centred rail
 * completely and, being later in the DOM, took every click.
 * `document.elementFromPoint` at the centre of **pause, 1×, 2× and 4×** all
 * returned an `order-card`. The player could not pause the game at exactly the
 * moment they would want to.
 *
 * ## Why hit-testing and not geometry
 *
 * A rectangle-overlap check answers a question nobody asked. What matters is
 * whether the click lands on the button, and that depends on stacking context,
 * `pointer-events` and transforms as much as on position — all of which a
 * bounding box is blind to. `elementFromPoint` is what the browser itself uses
 * to route a click, so it is what gets asked.
 *
 * ## Why the queue has to be full
 *
 * Every existing suite runs with an empty or nearly-empty pass, which is why a
 * defect this severe survived: the panels only collide once the stack is tall,
 * and nothing had ever made it tall on purpose.
 */

const TICKS_PER_MINUTE = 1200;

interface Api {
  advanceTicks(n: number): void;
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&paused=1');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('hud')).toBeVisible();
}

/** The same page, with the loop running — the state a player is actually in. */
async function bootRunning(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('hud')).toBeVisible();
}

/** Run the world without cooking, so orders pile up on the board. */
async function fillTheQueue(page: Page): Promise<number> {
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.evaluate((ticks) => {
      (window as unknown as { __EVOTYCOON__: Api }).__EVOTYCOON__.advanceTicks(ticks);
    }, TICKS_PER_MINUTE * 5);
    await page.waitForTimeout(250);
    const count = await page.locator('[data-testid="order-card"]').count();
    if (count >= 4) return count;
  }
  return page.locator('[data-testid="order-card"]').count();
}

const SPEED_CONTROLS = ['speed-pause', 'speed-1x', 'speed-2x', 'speed-4x'] as const;

test.describe('the HUD does not cover its own controls', () => {
  test('every speed control stays clickable with a full order queue', async ({ page }) => {
    await boot(page);
    const orders = await fillTheQueue(page);
    expect(orders, 'the queue never filled, so this proves nothing').toBeGreaterThanOrEqual(4);

    for (const id of SPEED_CONTROLS) {
      const covering = await page.evaluate((testid) => {
        const button = document.querySelector(`[data-testid="${testid}"]`);
        if (button === null) return 'missing';
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(
          Math.round(box.x + box.width / 2),
          Math.round(box.y + box.height / 2),
        );
        if (hit === button || button.contains(hit)) return null;
        const owner = hit?.closest('[data-testid]');
        return owner?.getAttribute('data-testid') ?? hit?.tagName ?? 'unknown';
      }, id);

      expect(
        covering,
        `${id} is covered by ${String(covering)} with ${String(orders)} orders queued`,
      ).toBeNull();
    }
  });

  test('the speed control it points at is the one that actually changes speed', async ({ page }) => {
    /*
     * Reachability is necessary, not sufficient: a control that is hittable but
     * wired to nothing passes the test above. So the queue is filled again and
     * the buttons are really pressed.
     *
     * Booted **running**, unlike the test above, because `?paused=1` is a
     * harness flag — "boot without advancing time", for tests that need a
     * pristine tick-0 world — and not the player's pause. A player never
     * reaches this screen with the simulation already stopped.
     *
     * The run also stops at the first pause rather than toggling back, because
     * pausing raises `pause-overlay`, and that veil intercepts pointer events
     * by design: the overlay owns resuming, not the rail behind it. Clicking
     * the rail through it would be testing a path the interface does not offer.
     */
    await bootRunning(page);
    const orders = await fillTheQueue(page);
    expect(orders).toBeGreaterThanOrEqual(4);

    /* `aria-pressed` is the rail's own statement of what is selected, driven
       from the published model rather than from the click — so asserting it
       proves the command reached the simulation and came back, not merely
       that a button toggled a class on itself. */
    await expect(page.getByTestId('speed-1x')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('speed-4x').click();
    await expect(page.getByTestId('speed-4x')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('speed-1x')).toHaveAttribute('aria-pressed', 'false');

    await page.getByTestId('speed-2x').click();
    await expect(page.getByTestId('speed-2x')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('speed-4x')).toHaveAttribute('aria-pressed', 'false');

    await page.getByTestId('speed-pause').click();
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  });
});
