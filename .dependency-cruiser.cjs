/**
 * Architecture enforcement.
 *
 * These rules are the machine-readable form of docs/WORKING_DISCIPLINE.md §2.1.
 * They are not style preferences — the entire testing architecture depends on
 * src/sim being pure and renderer-free, and "we all agreed not to do that" is
 * not an enforcement mechanism on a long project with context resets between
 * sessions (risk R20).
 *
 * Verified to actually fail: tests/unit/architecture/boundaries.test.ts runs
 * dependency-cruiser against a deliberately-illegal fixture and asserts a
 * violation is reported.
 */
module.exports = {
  forbidden: [
    {
      name: 'sim-no-phaser',
      severity: 'error',
      comment:
        'src/sim must not depend on the renderer. It has to run headless in Node for unit tests, the balance simulator and the CI performance benchmark.',
      from: { path: '^src/sim' },
      to: { path: 'node_modules/phaser|^src/render' },
    },
    {
      name: 'sim-no-svelte',
      severity: 'error',
      comment: 'src/sim must not depend on the UI framework.',
      from: { path: '^src/sim' },
      to: { path: 'node_modules/svelte|^src/ui' },
    },
    {
      name: 'sim-no-persistence-or-platform',
      severity: 'error',
      comment:
        'src/sim performs no I/O. Saving is src/persistence; time sync, storage and analytics are src/platform.',
      from: { path: '^src/sim' },
      to: { path: '^src/(persistence|platform)|node_modules/idb' },
    },
    {
      name: 'sim-no-app',
      severity: 'error',
      comment: 'src/app is the composition root and depends on src/sim, never the other way round.',
      from: { path: '^src/sim' },
      to: { path: '^src/app' },
    },
    {
      name: 'ui-no-sim',
      severity: 'error',
      comment:
        'src/ui must not import the simulation directly — it reads a throttled view model through src/app/bridge. This is what stops the UI from running per-frame and eating the frame budget.',
      from: { path: '^src/ui' },
      to: { path: '^src/sim' },
    },
    {
      name: 'render-no-ui',
      severity: 'error',
      comment: 'The renderer and the DOM overlay are siblings; they communicate through src/app.',
      from: { path: '^src/render' },
      to: { path: '^src/ui' },
    },
    {
      name: 'config-is-data-only',
      severity: 'error',
      comment: 'src/config is pure data and types. It may import zod and nothing else from the project.',
      from: { path: '^src/config' },
      to: {
        path: '^src/(app|sim|render|ui|persistence|platform)|node_modules/(phaser|svelte|idb)',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make module init order load-bearing and break tree-shaking.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Unreachable module — either wire it up or delete it (knip enforces this harder).',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$', '(^|/)tsconfig\\.json$'],
      },
      to: {},
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Application code must not import a devDependency — it would be missing at runtime.',
      // Ambient declaration files (src/vite-env.d.ts) legitimately reference
      // build-time types; they emit nothing and cannot fail at runtime.
      from: { path: '^src', pathNot: '\\.test\\.ts$|\\.d\\.ts$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'no-deprecated-core',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['core'], path: '^(punycode|domain|sys)$' },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.svelte'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
