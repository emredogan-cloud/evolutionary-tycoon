import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Visual regression on a WebGL canvas.
 *
 * This only works because the renderer has a *visual determinism mode*. Without
 * pinning the seed, the tick, the camera, particles and the device pixel ratio,
 * two runs of the same scene differ in half a dozen ways that have nothing to do
 * with the code, and the diff is noise rather than signal.
 *
 * Chromium only, and under forced software rasterisation. Headless WebKit does
 * not render canvas into screenshots (playwright#586) and headless Firefox WebGL
 * needs a virtual framebuffer, so a golden from either would be measuring the
 * harness (ADR-011). SwiftShader is forced on every machine — including ones
 * with a perfectly good GPU — so a golden taken locally and a golden taken in CI
 * are the same pixels.
 *
 * **A diff is never accepted automatically.** TESTING_STRATEGY §8.4: look at it,
 * decide whether the change was intended, and only then update the golden with
 * the reason in the pull request.
 */

const VIEWPORT = { width: 1280, height: 720 };

/** Everything the visual mode pins, in one place. */
function frozenUrl(scene: string, extra = ''): string {
  return `/?scene=${scene}&freezeAt=0&seed=424242&noParticles=1&fixedViewport=1&dpr=1&hideHud=1${extra}`;
}

async function openFrozen(page: Page, scene: string, extra = ''): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto(frozenUrl(scene, extra));
  // Wait on a state attribute, never a timeout — the difference between a suite
  // that is stable and one that lives in docs/FLAKY.md.
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-visual-mode', '1');
  await page.waitForTimeout(250);
}

test.describe('visual goldens', () => {
  test('stage1-empty — the bare lot, road and statics', async ({ page }) => {
    await openFrozen(page, 'empty');
    await expect(page).toHaveScreenshot('stage1-empty.png');
  });

  test('iso-depth-testcard — the deliberately hard depth cases', async ({ page }) => {
    // If this one changes, the sorting changed. That is the point of it.
    await openFrozen(page, 'depth-testcard');
    await expect(page).toHaveScreenshot('iso-depth-testcard.png');
  });

  test('camera-bounds — zoomed out against the lot edge', async ({ page }) => {
    await openFrozen(page, 'stress');
    await expect(page).toHaveScreenshot('camera-bounds.png');
  });
});

test.describe('visual determinism', () => {
  test('renders the same scene byte-identically ten times', async ({ browser }) => {
    // The precondition for every golden above. If this fails, a golden diff
    // means nothing, and the roadmap makes it a phase-completion condition.
    const hashes: string[] = [];

    for (let run = 0; run < 10; run++) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await openFrozen(page, 'depth-testcard');
      hashes.push(
        createHash('sha256')
          .update(await page.screenshot())
          .digest('hex'),
      );
      await context.close();
    }

    const unique = new Set(hashes);
    expect(unique.size, `10 runs produced ${unique.size} distinct images:\n${[...unique].join('\n')}`).toBe(
      1,
    );
  });

  test('a fresh page load reproduces the same pixels', async ({ page }) => {
    await openFrozen(page, 'depth-testcard');
    const first = createHash('sha256')
      .update(await page.screenshot())
      .digest('hex');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');
    await page.waitForTimeout(250);
    const second = createHash('sha256')
      .update(await page.screenshot())
      .digest('hex');

    expect(second).toBe(first);
  });

  test('the frozen clock does not advance', async ({ page }) => {
    // A screenshot taken a second later must be the same screenshot; otherwise
    // the golden depends on how fast the machine got to it.
    await openFrozen(page, 'depth-testcard');
    const first = createHash('sha256')
      .update(await page.screenshot())
      .digest('hex');
    await page.waitForTimeout(1000);
    const second = createHash('sha256')
      .update(await page.screenshot())
      .digest('hex');
    expect(second).toBe(first);
  });
});
