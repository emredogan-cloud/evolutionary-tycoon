import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * The economy gate — separate from the unit run, like the benchmarks.
 *
 * It plays ten simulated hours of the game (five policies × two hours) plus
 * thirty paired upgrade experiments, and it is judged against a **wall-clock
 * budget** of ninety seconds. Sharing a worker pool with two hundred other test
 * files would make that budget measure the machine's load rather than the
 * simulation's speed, which is the number the roadmap actually asks about.
 *
 * It runs as its own CI job and inside `pnpm verify`.
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
    include: ['tests/balance/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 300_000,
    pool: 'forks',
  },
});
