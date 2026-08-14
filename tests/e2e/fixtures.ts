import { test as base, expect } from '@playwright/test';

/**
 * Shared E2E fixture.
 *
 * "No critical console errors" is asserted automatically on every test rather
 * than as one separate test, because a console error that only appears during a
 * specific interaction is exactly the kind that a single dedicated test misses.
 * docs/TESTING_STRATEGY.md §7.4 makes this a standing assertion.
 */

/** Noise we deliberately tolerate. Keep this list short and justified. */
const IGNORED_ERROR_PATTERNS: readonly RegExp[] = [
  // Chromium logs this for the favicon when running against a preview server
  // that has no /favicon.ico; we ship favicon.svg instead.
  /favicon\.ico/i,
];

interface Fixtures {
  /** Console errors and page errors collected during the test. */
  consoleErrors: string[];
}

export const test = base.extend<Fixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (IGNORED_ERROR_PATTERNS.some((re) => re.test(text))) return;
      errors.push(`console.error: ${text}`);
    });

    page.on('pageerror', (error) => {
      errors.push(`pageerror: ${error.message}`);
    });

    await use(errors);

    expect(errors, `Unexpected console/page errors:\n${errors.join('\n')}`).toEqual([]);
  },
});

export { expect };
