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
        // Phaser-bound modules. Each needs a live WebGL context and a running
        // Scene, so a Node unit test could only exercise a mock of Phaser —
        // which would prove the mock works. They are covered where the thing
        // they wrap actually exists:
        //   PhaserBootstrap, BootScene, WorldScene, SceneGraph → tests/e2e/render.spec.ts
        //   CameraController                                   → tests/e2e/render.spec.ts (wheel)
        //   DevOverlays                                        → dev-only, never in a production build
        // The logic they were deliberately built *around* — projection, depth
        // sorting, camera arithmetic, the render bridge — is pure and is unit
        // tested at close to 100%.
        'src/render/PhaserBootstrap.ts',
        'src/render/SceneGraph.ts',
        'src/render/scenes/**',
        'src/render/camera/CameraController.ts',
        'src/render/debug/**',
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
        'src/config/**': { lines: 95, functions: 95, branches: 90, statements: 95 },
        'src/persistence/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
        // TESTING_STRATEGY §13 puts src/render at ≥45% because most of it is
        // visual and covered by E2E and goldens. The Phaser-bound modules are
        // excluded above, so what remains here is the pure maths — and that is
        // held to the same bar as the simulation.
        'src/render/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
        'src/app/**': { lines: 85, functions: 85, branches: 75, statements: 85 },
      },
    },
  },
});
