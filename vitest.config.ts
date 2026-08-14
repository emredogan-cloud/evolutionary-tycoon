import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@app': resolve(import.meta.dirname, 'src/app'),
      '@sim': resolve(import.meta.dirname, 'src/sim'),
      '@render': resolve(import.meta.dirname, 'src/render'),
      '@ui': resolve(import.meta.dirname, 'src/ui'),
      '@config': resolve(import.meta.dirname, 'src/config'),
      '@persistence': resolve(import.meta.dirname, 'src/persistence'),
      '@platform': resolve(import.meta.dirname, 'src/platform'),
    },
  },

  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __BUILD_SHA__: JSON.stringify('test'),
    __BUILT_AT__: JSON.stringify('1970-01-01T00:00:00.000Z'),
    __DEV_BUILD__: JSON.stringify(true),
  },

  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Node by default. A test that genuinely needs a DOM opts in per-file with
    // `// @vitest-environment jsdom`. Running everything in jsdom would slow the
    // suite and, worse, would hide an accidental DOM dependency in src/sim.
    environment: 'node',
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,

    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/**/types.ts',
        // The composition root wires modules together and runs on import; there
        // is nothing to unit test that E2E does not cover better. Excluding it
        // keeps the threshold meaningful instead of diluting it.
        'src/app/main.ts',
        // IndexedDB has no meaningful test double: a hand-written stub would
        // prove the stub works. Its decision branches (availability probing,
        // open failure) ARE unit-tested via IdbAdapter.open in
        // tests/unit/app/container.test.ts; the read/write/remove path is
        // covered against a real browser database in
        // tests/e2e/simulation.spec.ts, which is a stronger test than a fake.
        'src/persistence/idbAdapter.ts',
      ],
      // Ratcheted for Phase 2 (docs/TESTING_STRATEGY.md §13). Thresholds are a
      // floor, not a target; they rise as each phase lands real logic. Per-glob
      // entries mean a well-covered layer cannot mask a thin one.
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
        'src/sim/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
        'src/config/**': { lines: 95, functions: 95, branches: 95, statements: 95 },
        'src/persistence/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  },
});
