import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The claim this whole consolidation rests on, as an assertion.
 *
 * "Zero production placeholders" is the kind of statement that is true the day
 * it is written and quietly false three phases later, so it is not written — it
 * is measured, every run, on every stage. `WorldScene` counts the quads it drew
 * from a placeholder and publishes the number; this reads it.
 *
 * Counting **quads** rather than checking a flag is deliberate. A placeholder
 * can appear at a stage transition that never existed on the first frame, and a
 * one-shot check taken at boot would miss exactly that. The count is republished
 * every frame, so what is asserted is the state of the frame that was on screen.
 */

const STAGES = [1, 2, 3, 4] as const;

function frozen(stage: number, tick = 600): string {
  return (
    `/?scene=empty&freezeAt=${String(tick)}&stage=${String(stage)}` +
    '&seed=424242&noParticles=1&fixedViewport=1&dpr=1&hideHud=1'
  );
}

async function openStage(page: Page, stage: number, tick?: number): Promise<void> {
  await page.goto(frozen(stage, tick));
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
}

test.describe('production art', () => {
  test('loads the manifest and reports frames, not placeholders', async ({ page }) => {
    await openStage(page, 1);
    const root = page.locator('html');

    // `placeholder` here would mean the manifest was missing entirely — the
    // state the project was in for thirteen phases, and one it must not return
    // to silently.
    await expect(root).toHaveAttribute('data-asset-state', 'loaded');
    await expect(root).not.toHaveAttribute('data-asset-missing', /.+/);

    const frames = Number(await root.getAttribute('data-asset-frames'));
    // Every atlas frame in `docs/assets/productionBatches.json` except the ground
    // bake, which ships as a single file rather than as an atlas frame.
    expect(frames).toBe(171);
  });

  for (const stage of STAGES) {
    test(`draws stage ${String(stage)} with no placeholder quad`, async ({ page }) => {
      await openStage(page, stage);
      await expect(page.locator('html')).toHaveAttribute('data-asset-placeholders', '0');
    });
  }

  test('still draws no placeholder once the lot is busy', async ({ page }) => {
    // A tick with traffic on the road and customers at the counter: the actors
    // that resolve their frames at run time rather than at scene creation.
    await openStage(page, 1, 4264);
    await expect(page.locator('html')).toHaveAttribute('data-asset-placeholders', '0');
  });

  test('fetches every atlas the manifest lists, and none of them fail', async ({ page }) => {
    const failed: string[] = [];
    const fetched: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (!url.includes('/atlas/') && !url.includes('asset-manifest')) return;
      fetched.push(url);
      if (!response.ok()) failed.push(`${String(response.status())} ${url}`);
    });
    page.on('requestfailed', (request) => {
      if (request.url().includes('/atlas/')) failed.push(`failed ${request.url()}`);
    });

    await openStage(page, 1);
    expect(failed).toEqual([]);
    // Seven atlases, each a JSON and a WebP, plus the manifest itself.
    expect(fetched.length).toBeGreaterThanOrEqual(15);
  });

  test('reaches the first playable frame with a clean console', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      /*
       * The preview toolbar is served by the host, blocked by our own CSP, and
       * has nothing to do with the game — the same exclusion `evolutionFlow`
       * already makes rather than loosening the policy that produced it.
       */
      if (message.text().includes('vercel') || message.text().includes('feedback')) return;
      errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

    for (const stage of STAGES) await openStage(page, stage);
    expect(errors).toEqual([]);
  });
});
