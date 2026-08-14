import { SAVE_SCHEMA_VERSION } from '@config/simulation';
import { expect, test } from './fixtures';

/**
 * /health.json is the link between "CI tested commit X" and "commit X is live".
 * Without it, a green pipeline plus a returned deployment id proves only that an
 * upload was accepted (docs/WORKING_DISCIPLINE.md §4, item 9).
 */
test.describe('health endpoint', () => {
  test('serves a well-formed build descriptor', async ({ request }) => {
    const response = await request.get('/health.json');
    expect(response.status()).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;

    expect(typeof body['version']).toBe('string');
    expect(typeof body['buildSha']).toBe('string');
    expect(body['buildSha']).not.toBe('');
    expect(typeof body['builtAt']).toBe('string');
    expect(Number.isNaN(Date.parse(body['builtAt'] as string))).toBe(false);
    // Explicitly null until the asset pipeline exists (Phase 4) — absent would
    // be ambiguous between "no pipeline" and "pipeline produced nothing".
    expect(body['assetManifestHash']).toBeNull();
    expect(body['schemaVersion']).toBe(SAVE_SCHEMA_VERSION);
  });

  test('the served bundle and /health.json report the same commit', async ({ page, request }) => {
    // This is the assertion that makes a deploy verifiable: if the CDN were
    // serving a stale index.html against a fresh health.json (or vice versa),
    // everything else would still look green.
    const health = (await (await request.get('/health.json')).json()) as { buildSha: string };

    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');

    const bundleSha = await page.evaluate(
      () => (window as unknown as { __EVOTYCOON_BUILD__: { buildSha: string } }).__EVOTYCOON_BUILD__.buildSha,
    );

    expect(bundleSha).toBe(health.buildSha);
  });

  test('/api/time returns a usable server clock reference', async ({ request }) => {
    // /api/time is a Vercel Function. `vite preview` serves static files only, so
    // this assertion is only meaningful against a deployed target. Skipping is
    // honest; stubbing it locally would prove nothing about the real endpoint.
    test.skip(
      process.env['E2E_BASE_URL'] === undefined,
      '/api/time is a Vercel Function; set E2E_BASE_URL to test it against a deployment.',
    );

    // Offline progression (Phase 14) depends on this. Verifying it every run
    // means the endpoint cannot quietly rot for twelve phases before anyone notices.
    const response = await request.get('/api/time');

    expect(response.status()).toBe(204);

    const dateHeader = response.headers()['date'];
    expect(dateHeader, '/api/time must expose a Date response header').toBeDefined();

    const serverTime = Date.parse(dateHeader ?? '');
    expect(Number.isNaN(serverTime)).toBe(false);

    // Sanity: within a day of local time. A wider drift would mean we are
    // reading something other than a real clock.
    expect(Math.abs(serverTime - Date.now())).toBeLessThan(24 * 60 * 60 * 1000);

    const cacheControl = response.headers()['cache-control'] ?? '';
    expect(cacheControl).toContain('no-store');
  });
});
