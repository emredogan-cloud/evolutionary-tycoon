import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Performance suite — separate from the unit run on purpose.
 *
 * It needs `--expose-gc` to measure allocation honestly, it takes tens of
 * seconds, and a benchmark that runs on every watch-mode save is a benchmark
 * nobody keeps green. CI runs it as its own job.
 */
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

  test: {
    include: ['tests/perf/**/*.test.ts'],
    environment: 'node',
    // Timing measurements are meaningless when several suites share the cores.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 180_000,
    pool: 'forks',
    // Without this, heap deltas include whatever the collector has not yet
    // reclaimed, and "0 B/tick" would be an assumption rather than a result.
    execArgv: ['--expose-gc'],
  },
});
