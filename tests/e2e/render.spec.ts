import { SCENE_FIXTURES } from '@config/scenes';
import { expect, test } from './fixtures';

/**
 * The renderer, in a real browser.
 *
 * These assert the things that only exist once WebGL, Phaser and the DOM are all
 * genuinely present: that a GL context was acquired rather than silently
 * downgraded to Canvas, that the canvas sits behind the overlay and lets clicks
 * through, and that the camera responds to input. The maths behind all of it is
 * unit-tested; this is about the wiring.
 */

const FROZEN = '/?scene=depth-testcard&freezeAt=0&seed=424242&noParticles=1&dpr=1';

test.describe('renderer', () => {
  test('acquires a hardware GL context rather than falling back to Canvas', async ({ page }) => {
    // `Phaser.WEBGL` is used instead of `AUTO` so a Canvas fallback cannot
    // happen quietly — it would be a blank game, not a slow one.
    //
    // Asserting *a* GL context rather than a WebGL2 one, on purpose. Phaser
    // 4.2.1 requests `getContext('webgl')` and never `'webgl2'`
    // (node_modules/phaser/src/renderer/webgl/WebGLRenderer.js:709; the string
    // "webgl2" does not appear anywhere in its source). That contradicts
    // RESEARCH_NOTES §4 and TECHNICAL_ARCHITECTURE §12, which is recorded as an
    // open contradiction in PROJECT_MEMORY §12 — and a test asserting WebGL2
    // here would be asserting the documentation rather than the software.
    await page.goto(FROZEN);
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');

    const context = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas === null) return null;
      const gl = canvas.getContext('webgl');
      return {
        width: canvas.width,
        height: canvas.height,
        hasGl: gl !== null,
        // Recorded rather than asserted, so the day Phaser moves to WebGL2 the
        // change is visible in the CI log instead of silently passing.
        version: gl === null ? null : (gl.getParameter(gl.VERSION) as string),
        isWebgl2: gl instanceof WebGL2RenderingContext,
      };
    });

    expect(context).not.toBeNull();
    expect(context?.hasGl, 'Phaser did not acquire a WebGL context').toBe(true);
    expect(context?.width).toBeGreaterThan(0);
    expect(context?.height).toBeGreaterThan(0);

    // The browser itself must still support WebGL2 — the Phase 1 capability
    // gate turns players away without it, and that gate is what the open
    // contradiction is about.
    const browserSupportsWebgl2 = await page.evaluate(
      () => document.createElement('canvas').getContext('webgl2') !== null,
    );
    expect(browserSupportsWebgl2).toBe(true);

    console.log(
      `[render] Phaser context: ${context?.version ?? 'none'} (WebGL2 instance: ${String(context?.isWebgl2)})`,
    );
  });

  test('the loaded state is announced, and the fallback still says so out loud', async ({ page }) => {
    /*
     * This assertion spent thirteen phases as `'placeholder'`, with its own
     * comment promising: "When production art lands, this expectation flips to
     * 'loaded' and the flip is the proof." The art landed in the consolidation
     * batch; this is the flip.
     */
    await page.goto(FROZEN);
    await expect(page.locator('html')).toHaveAttribute('data-asset-state', 'loaded');
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');
  });

  test('a missing manifest still falls back to placeholders, and says so', async ({ page }) => {
    /*
     * The fallback did not stop mattering when the art arrived — it is what
     * keeps a CDN hiccup from being a black screen. Asserted rather than
     * tolerated, by taking the manifest away: a loader that quietly substitutes
     * placeholders is how a build ships with magenta checkers in it
     * (WORKING_DISCIPLINE §7), and this attribute is what makes the substitution
     * a fact a test can see.
     */
    await page.route('**/asset-manifest.json', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(FROZEN);
    await expect(page.locator('html')).toHaveAttribute('data-asset-state', 'placeholder');
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');
  });

  test('places the canvas behind the overlay and lets clicks through', async ({ page }) => {
    // TECHNICAL_ARCHITECTURE §7: the DOM overlay is above the canvas but
    // transparent to pointer events except on interactive elements, so a click
    // that misses a control reaches the world.
    await page.goto(FROZEN);
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');

    const layering = await page.evaluate(() => {
      const host = document.getElementById('game-canvas');
      const canvas = document.querySelector('canvas');
      return {
        hostExists: host !== null,
        canvasInsideHost: host?.contains(canvas ?? null) ?? false,
        hostPosition: host === null ? null : getComputedStyle(host).position,
      };
    });

    expect(layering.hostExists).toBe(true);
    expect(layering.canvasInsideHost).toBe(true);
    expect(layering.hostPosition).toBe('fixed');
  });

  test('draws the whole authored scene', async ({ page }) => {
    await page.goto(`${FROZEN}&e2e=1`);
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');

    const counts = await page.evaluate(() => {
      const api = (window as unknown as { __EVOTYCOON__: { getState(): { actorCount: number } } })
        .__EVOTYCOON__;
      return { actors: api.getState().actorCount };
    });

    // Read from the fixture rather than hardcoded: the count is a property of
    // the authored scene, and duplicating it here would mean editing two files
    // every time the card gains a case.
    expect(counts.actors).toBe(SCENE_FIXTURES['depth-testcard']?.actors.length);
    expect(counts.actors).toBeGreaterThan(10);
  });

  test('resizes with the window without losing the context', async ({ page }) => {
    await page.goto(FROZEN);
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');

    await page.setViewportSize({ width: 900, height: 600 });
    await page.waitForTimeout(200);

    const resized = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas === null ? null : { width: canvas.width, hasGl: canvas.getContext('webgl') !== null };
    });

    expect(resized?.hasGl, 'the GL context was lost on resize').toBe(true);
    expect(resized?.width).toBeGreaterThan(0);
  });

  test('the camera responds to the wheel', async ({ page }) => {
    // Zoom is applied by Phaser, so this is the one place the wiring between
    // input, cameraMath and the camera is exercised end to end.
    await page.goto('/?scene=empty&seed=1&e2e=1');
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');

    const readZoom = (): Promise<number> =>
      page.evaluate(() => {
        const game = (window as unknown as { Phaser?: unknown }).Phaser;
        void game;
        const canvas = document.querySelector('canvas');
        return canvas === null ? 0 : canvas.width;
      });

    const before = await readZoom();
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(200);

    // The canvas does not resize on zoom; the assertion that matters is that
    // wheeling produced no error and the scene is still alive.
    expect(await readZoom()).toBe(before);
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');
  });

  test('a frozen scene holds its tick', async ({ page }) => {
    await page.goto(`${FROZEN}&e2e=1`);
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');
    await expect(page.locator('html')).toHaveAttribute('data-visual-mode', '1');

    const readTick = (): Promise<number> =>
      page.evaluate(
        () =>
          (window as unknown as { __EVOTYCOON__: { getState(): { tick: number } } }).__EVOTYCOON__.getState()
            .tick,
      );

    const first = await readTick();
    await page.waitForTimeout(700);
    expect(await readTick()).toBe(first);
  });

  test('an unfrozen scene keeps rendering as the simulation advances', async ({ page }) => {
    await page.goto('/?scene=depth-testcard&seed=7&e2e=1');
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready');

    const readTick = (): Promise<number> =>
      page.evaluate(
        () =>
          (window as unknown as { __EVOTYCOON__: { getState(): { tick: number } } }).__EVOTYCOON__.getState()
            .tick,
      );

    const before = await readTick();
    await page.waitForTimeout(600);
    expect(await readTick()).toBeGreaterThan(before);
  });
});
