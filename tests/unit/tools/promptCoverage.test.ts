import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The audit's closing arithmetic, kept true: every image-required row in the
 * requirements matrix has exactly one canonical prompt, no duplicates, no
 * orphans. The tool exits non-zero on any breach; this test is the unit-level
 * hook that makes a drift fail `pnpm test` too, not only the asset CI job.
 */
describe('prompt catalog coverage', () => {
  it('MISSING = 0, DUPLICATES = 0, ORPHANS = 0', () => {
    const out = execFileSync('node', [resolve(__dirname, '../../../tools/validateAssetPromptCoverage.ts')], {
      encoding: 'utf8',
    });
    expect(out).toContain('PROMPTS MISSING        0');
    expect(out).toContain('DUPLICATE PROMPTS      0');
    expect(out).toContain('ORPHAN PROMPTS         0');
  });
});
