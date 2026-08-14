import { expect, test } from './fixtures';

test.describe('application boot', () => {
  test('renders the shell and reports a supported browser', async ({ page, consoleErrors }) => {
    await page.goto('/');

    // documentElement[data-app-state] is set by the composition root once the
    // capability probe has run, so waiting on it is waiting on real boot
    // completion rather than on an arbitrary timeout.
    await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');

    await expect(page.getByRole('heading', { name: /Evolutionary\s+Tycoon/ })).toBeVisible();
    await expect(page.getByTestId('build-facts')).toBeVisible();
    await expect(page.getByTestId('fact-webgl2')).toHaveText('Destekleniyor');

    // maxTextureSize comes from the real GL context. In CI this is SwiftShader,
    // which still reports a sane value — if it were "bilinmiyor" the probe would
    // be silently failing.
    await expect(page.getByTestId('fact-maxtex')).toHaveText(/^\d+px$/);

    expect(consoleErrors).toEqual([]);
  });

  test('exposes build identity on window for diagnostics', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');

    const build = await page.evaluate(() => {
      return (window as unknown as { __EVOTYCOON_BUILD__?: Record<string, unknown> }).__EVOTYCOON_BUILD__;
    });

    expect(build).toBeDefined();
    expect(typeof build?.['version']).toBe('string');
    expect(typeof build?.['buildSha']).toBe('string');
    expect(build?.['buildSha']).not.toBe('');
  });

  test('the page does not scroll horizontally at mobile width', async ({ page }) => {
    // A horizontal scrollbar on the very first screen is the cheapest possible
    // signal that the responsive layout is broken.
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
