import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * TEMPORARY cross-engine section locator (P17, second round — the Firefox
 * divergence survived the planDay fix). Prints which section leaves the Node
 * chain first, at 100-tick checkpoints, plus the environment fields and rng
 * state at the first miss. Removed when the divergence is dead.
 */
const CHECKPOINTS = JSON.parse(
  readFileSync('tests/fixtures/section-checkpoints-424242.json', 'utf8'),
) as Record<string, Record<string, string>>;

test('sections against the node chain', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?e2e=1&seed=424242&paused=1');
  await page.waitForFunction(() => document.documentElement.dataset['simState'] !== undefined);

  const out = await page.evaluate((checkpoints: Record<string, Record<string, string>>) => {
    interface Api {
      advanceTicks(n: number): void;
      getWorldHashSections(): Record<string, string>;
      getEnvironment(): Record<string, unknown>;
    }
    const api = (window as unknown as Record<'__EVOTYCOON__', Api>).__EVOTYCOON__;
    const diffs: string[] = [];
    let firstEnv: Record<string, unknown> | null = null;
    const compare = (tick: number): void => {
      const want = checkpoints[String(tick)];
      if (want === undefined) return;
      const got = api.getWorldHashSections();
      for (const [k, v] of Object.entries(want)) {
        if (got[k] !== v) {
          diffs.push(`${String(tick)}:${k}`);
          firstEnv ??= api.getEnvironment();
        }
      }
    };
    compare(0);
    for (let i = 1; i <= 1000; i++) {
      api.advanceTicks(1);
      if (i % 100 === 0 || i === 1) compare(i);
    }
    return { diffs, firstEnv };
  }, CHECKPOINTS);

  console.log('SECTION DIFFS:', JSON.stringify(out));
  expect(out.diffs).toHaveLength(0);
});
