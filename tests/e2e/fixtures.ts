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

  // Vercel injects its preview-comments toolbar (vercel.live/.../feedback.js)
  // into preview deployments only — never the production alias. Our CSP is
  // `script-src 'self'` and blocks it, and the browser logs the refusal as a
  // console error.
  //
  // The refusal is the *correct* outcome, not a defect: WORKING_DISCIPLINE §9
  // says no third-party script runs in this game, and loosening the CSP to
  // silence a preview-only toolbar would weaken production for a convenience
  // feature. So the block stays and this specific message is tolerated.
  //
  // Anchored on both the host and the CSP wording so it cannot mask anything
  // else. If the toolbar is ever unwanted on previews, the alternative fix is
  // to turn Comments off in Vercel project settings — a deployment setting, not
  // a code change.
  /Content Security Policy[\s\S]*vercel\.live/i,
  /vercel\.live[\s\S]*Content Security Policy/i,
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
