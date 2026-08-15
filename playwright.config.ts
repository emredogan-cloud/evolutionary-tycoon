import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

/**
 * Target under test.
 *
 * Locally and in the default CI job this is the built preview server. The
 * preview-e2e workflow overrides it with the real Vercel preview URL so that the
 * CDN, the security headers and the cache policy are exercised too — a passing
 * local build does not prove the deployed artefact behaves correctly.
 */
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:4173';
const usesExternalTarget = process.env['E2E_BASE_URL'] !== undefined;

export default defineConfig({
  testDir: 'tests',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  // One retry absorbs genuine network flakiness. A test that only passes on the
  // retry is recorded as flaky and tracked in docs/FLAKY.md — retries must never
  // be used to paper over an unstable test (docs/TESTING_STRATEGY.md §11).
  retries: isCI ? 1 : 0,
  ...(isCI ? { workers: 4 } : {}),
  timeout: 30_000,
  expect: { timeout: 10_000 },

  /**
   * Goldens live in one directory rather than beside each spec, so a visual
   * change is a single obvious diff in review instead of files scattered
   * through the test tree.
   */
  snapshotPathTemplate: '{testDir}/visual/__screenshots__/{arg}{ext}',

  reporter: isCI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['github']]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      testMatch: ['e2e/**/*.spec.ts'],
      // smoke/ is WebKit's reduced suite; running it here would just duplicate
      // coverage. visual/ is its own project with a pinned viewport and DPR.
      testIgnore: ['e2e/smoke/**'],
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Force software rasterisation so rendering is deterministic across
          // machines. GitHub Actions gives us SwiftShader anyway; pinning it
          // locally means goldens generated here match goldens generated in CI.
          // See docs/RESEARCH_NOTES.md §3.
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu'],
        },
      },
    },
    {
      name: 'firefox',
      testMatch: ['e2e/**/*.spec.ts'],
      testIgnore: ['e2e/smoke/**'],
      use: { ...devices['Desktop Firefox'] },
      // NOTE: in CI this project must be invoked under `xvfb-run`. Headless
      // Firefox WebGL is unstable without a virtual framebuffer
      // (microsoft/playwright#21783).
    },
    {
      name: 'visual',
      // Chromium only, and deliberately so: headless WebKit does not render
      // canvas into screenshots (playwright#586) and headless Firefox WebGL needs
      // a virtual framebuffer. A golden from either would measure the harness
      // rather than the game (ADR-011).
      testMatch: ['visual/**/*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // Pinned: the same scene at DPR 1 and DPR 2 is different pixels, and a
        // golden taken on one machine would fail on another for no reason.
        deviceScaleFactor: 1,
        launchOptions: {
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu'],
        },
      },
      expect: {
        toHaveScreenshot: {
          /*
           * `threshold` decides whether a pixel counts as different at all;
           * `maxDiffPixelRatio` decides how many are allowed to. They are not
           * interchangeable, and leaving the first at Playwright's default of
           * 0.2 made the second meaningless.
           *
           * Found in Phase 4: repainting the entire lot and road from
           * #4a5d3a/#3b3b40 to the locked palette's #586e22/#3a414c changed
           * 233,365 pixels — a quarter of the frame — and the suite passed,
           * because a YIQ distance of 0.2 swallows a colour change that large.
           * A gate that cannot see a repainted ground is not a gate.
           *
           * Zero is affordable here because the rendering is bit-exact: the
           * determinism test below asserts ten consecutive captures are
           * byte-identical, and Phase 3 measured host and container output equal
           * by SHA-256. The ratio below stays as the margin for cross-machine
           * anti-aliasing, not as cover for a colour drift.
           */
          threshold: 0,
          maxDiffPixelRatio: 0.002,
          animations: 'disabled',
        },
      },
    },
    {
      name: 'webkit-smoke',
      // WebKit runs a reduced suite on purpose: headless WebKit does not render
      // canvas content into screenshots (microsoft/playwright#586) and has no
      // hardware acceleration. We assert boot, DOM and console health only, and
      // we never take a canvas screenshot here.
      testMatch: ['e2e/smoke/**/*.spec.ts'],
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Omit the key entirely when targeting a deployed URL. `exactOptionalPropertyTypes`
  // (correctly) rejects an explicit `undefined` here.
  ...(usesExternalTarget
    ? {}
    : {
        webServer: {
          command: 'pnpm preview',
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: !isCI,
          timeout: 120_000,
          // Without these a failed start surfaces only as "timed out waiting",
          // which says nothing about why.
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
});
