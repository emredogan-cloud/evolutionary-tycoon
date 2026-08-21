import { expect, test } from './fixtures';

/**
 * The service worker — Phase 14's PWA half.
 *
 * Three promises are worth a browser test: the worker takes control, a
 * controlled second visit is served from the precache (the ~0-bandwidth
 * requirement, which is a Vercel cost constraint), and a controlled page boots
 * with the network gone. The identity probe and the time endpoint must keep
 * bypassing the cache — a cached /health.json would make "which build is
 * live" unanswerable.
 */

test.describe('service worker', () => {
  test('takes control, and a second visit is served from the precache', async ({ page, browserName }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');

    // First visit: wait until the worker has activated AND claimed this page
    // (clientsClaim) — a reload issued mid-claim races the interception and
    // its navigation legitimately bypasses the worker.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    // Second visit: controlled from the first byte.
    const served: { url: string; fromSw: boolean }[] = [];
    page.on('response', (response) => {
      served.push({ url: response.url(), fromSw: response.fromServiceWorker() });
    });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
    const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null);
    expect(controlled).toBe(true);

    if (browserName === 'chromium') {
      /*
       * The bandwidth claim, measured: everything static on the boot path is
       * answered by the worker. Two endpoints are *expected* to hit the
       * network — /api/time (a cached Date header is a stale Date header) and
       * /health.json (the deployment identity probe) — and nothing else is.
       */
      const network = served.filter(
        (r) =>
          !r.fromSw &&
          !r.url.includes('/api/time') &&
          !r.url.includes('/health.json') &&
          // Chromium fetches the favicon outside the page's cache scope.
          !r.url.includes('favicon'),
      );
      expect(
        network.map((r) => r.url),
        'static requests that bypassed the service worker',
      ).toEqual([]);
    }
  });

  test('a controlled page boots with the network gone', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    // Reload once so the whole document lifecycle has run controlled.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');

    await context.setOffline(true);
    try {
      await page.reload();
      /*
       * The whole point of the phase's PWA half: the shell, the bundle and the
       * atlases come out of the precache, the sim boots, and the absent
       * /api/time downgrades the offline window rather than the session.
       */
      await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
    } finally {
      await context.setOffline(false);
    }
  });
});
