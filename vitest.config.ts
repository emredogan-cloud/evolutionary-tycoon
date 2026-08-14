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
      ],
      // Phase 1 thresholds. These are a floor, not a target, and they ratchet up
      // per phase as real logic lands (see docs/TESTING_STRATEGY.md §13):
      //   src/sim ≥ 90% from Phase 2, src/config ≥ 95%, src/persistence ≥ 90%.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
