import { expect, test } from './fixtures';

/**
 * Security and cache headers, verified against whatever is actually serving.
 *
 * These only mean something against the deployed URL: `vite preview` does not
 * apply vercel.json. The preview-e2e workflow sets E2E_BASE_URL to the real
 * Vercel preview, and that is where this suite carries weight. Locally it is
 * skipped rather than asserted-and-ignored, so a green local run never implies
 * headers were checked.
 */
const isDeployedTarget = process.env['E2E_BASE_URL'] !== undefined;

test.describe('deployed headers', () => {
  test.skip(
    !isDeployedTarget,
    'Headers come from vercel.json, which only applies on a real deployment. Set E2E_BASE_URL to run.',
  );

  test('security headers are present on the document', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();

    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("script-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('geolocation=()');
  });

  test('the document is not cached', async ({ request }) => {
    const response = await request.get('/');
    expect(response.headers()['cache-control'] ?? '').toMatch(/no-cache|no-store/);
  });

  test('/health.json is not cached', async ({ request }) => {
    const response = await request.get('/health.json');
    expect(response.headers()['cache-control'] ?? '').toContain('no-store');
  });

  test('build assets are immutable for a year', async ({ page, request }) => {
    // Bandwidth is a cost constraint, not only a performance one: Vercel Hobby
    // allows 100 GB/month (docs/RESEARCH_NOTES.md §9). If assets were not
    // immutable, every repeat visit would re-download the bundle.
    await page.goto('/');
    const assetUrl = await page.evaluate(() => {
      const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
      return script?.src ?? null;
    });

    expect(assetUrl, 'expected a hashed module script under /assets/').not.toBeNull();

    const response = await request.get(assetUrl ?? '');
    const cacheControl = response.headers()['cache-control'] ?? '';
    expect(cacheControl).toContain('immutable');
    expect(cacheControl).toContain('max-age=31536000');
  });

  test('an unknown path renders the app rather than a 404', async ({ page }) => {
    await page.goto('/some/deep/unknown/route');
    await expect(page.locator('html')).toHaveAttribute('data-app-state', /ready|unsupported/);
  });
});
