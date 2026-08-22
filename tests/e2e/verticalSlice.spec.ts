import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The two Vertical Slice criteria that can be *measured* — GAME_DESIGN_DOCUMENT
 * §23, criteria 6 and 7.
 *
 * The gate has eight criteria. Five of them are human judgements made by
 * watching three people play, and this file does not pretend to make them; they
 * are reported as pending in PHASE_9_REPORT §9. These two are not judgements:
 * "zero critical console errors and no memory leak" and "save → refresh → full
 * restore" are claims a machine can check, and a gate this important deserves
 * the machine's answer rather than an assurance.
 *
 * Criterion 5 — 60 FPS on a real desktop, 40 on a real mobile — is deliberately
 * absent. CI runs Chromium on SwiftShader and cannot measure a frame rate
 * (ADR-011); a number produced here would be a number about the harness.
 */

const TICKS_PER_MINUTE = 1200;

/**
 * Hosts whose injected scripts our own CSP blocks, correctly.
 *
 * Vercel adds a preview-toolbar script to every preview deployment. Our
 * `script-src 'self'` refuses it, the browser logs a CSP violation, and that
 * violation is **the policy working** — it is not the game failing.
 *
 * Filtered by host rather than by message shape, and only for CSP violations, so
 * a real error from our own code cannot hide behind it. Narrow on purpose: the
 * criterion this test serves is "zero critical console errors", and quietly
 * widening the filter until it passes would empty the criterion out.
 */
const FOREIGN_SCRIPT_HOSTS = ['vercel.live'];

function isForeignCspViolation(text: string): boolean {
  if (!text.includes('Content Security Policy')) return false;
  return FOREIGN_SCRIPT_HOSTS.some((host) => text.includes(host));
}

interface Api {
  dispatch(command: { t: 'MANUAL_PREP'; orderSlot: number } | { t: 'BUY_UPGRADE'; upgradeId: string }): void;
  advanceTicks(n: number): void;
  getWorldHash(): string;
  getState(): { tick: number };
  save(): Promise<{ ok: boolean; backend: string; checksum: string | null; error: string | null }>;
  load(): Promise<{ ok: boolean; reason: string | null; tick: number; hash: string }>;
  clearSaves(): Promise<void>;
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&paused=1');
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  /*
   * The HUD publishes only once the bridge goes live, and the bridge waits for
   * assets. Reading `data-cash` before that races a slow load — proven against
   * the CDN, where the sim ticked and earned for a full test's length while the
   * attribute sat at its initial 0.00. Same window as build mode's ghost race.
   */
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
  await expect(page.locator('[data-testid="hud"]')).toBeVisible();
}

async function play(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    const api = (window as unknown as { __EVOTYCOON__: Api }).__EVOTYCOON__;
    for (let i = 0; i < count; i++) {
      api.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      api.advanceTicks(1);
    }
  }, ticks);
}

test.describe('vertical slice — criterion 7, save and restore', () => {
  test('a full session survives a save, a refresh and a load', async ({ page }) => {
    /*
     * "Kaydet → yenile → tam geri yükleme", and **what *tam* means here is
     * scoped by an approved decision**. TECHNICAL_ARCHITECTURE §8.1 keeps
     * transient state out of the save deliberately: vehicles on the road,
     * walking customers and half-finished orders are rebuilt clean on load. So
     * the restored world is *not* digest-identical to the one that was saved,
     * and it is not supposed to be — the road is empty for a few seconds and
     * then fills again.
     *
     * The claim that can be made, and is: everything persistent comes back
     * exactly, and the restore is **idempotent** — saving the restored world and
     * loading it again lands on the same digest. A lossy field would drift on
     * the second round trip; this catches that, which a single save-and-compare
     * cannot.
     *
     * PHASE_9_REPORT §9 records the scope for the human making the gate call,
     * because "my traffic disappeared when I reloaded" is a thing a player will
     * notice and a thing this criterion should surface rather than hide.
     */
    await boot(page);
    await play(page, TICKS_PER_MINUTE * 8);

    // Buy something, so the save has a purchase in it. A save that only carried
    // cash would pass this test with the whole upgrade system deleted.
    const before = await page.evaluate(async () => {
      const api = (window as unknown as { __EVOTYCOON__: Api }).__EVOTYCOON__;
      api.dispatch({ t: 'BUY_UPGRADE', upgradeId: 'hand-painted-sign' });
      api.advanceTicks(1);
      const result = await api.save();
      return { result, tick: api.getState().tick };
    });

    expect(before.result.ok, before.result.error ?? '').toBe(true);
    // The real backend, not a fallback: a save that quietly landed in memory
    // would not survive the reload below, and the failure would read as a
    // restore bug rather than as a storage one.
    expect(before.result.backend).toBe('indexedDB');

    // A real reload, not a re-render: a fresh document, a fresh simulation and a
    // fresh storage handle.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');

    const first = await page.evaluate(async () => {
      const api = (window as unknown as { __EVOTYCOON__: Api }).__EVOTYCOON__;
      const result = await api.load();
      return { result, hash: api.getWorldHash(), tick: api.getState().tick };
    });

    expect(first.result.ok, first.result.reason ?? '').toBe(true);
    expect(first.tick, 'the clock did not come back').toBe(before.tick);

    // Round two, from the restored world. Same digest, or something is lossy.
    await page.evaluate(async () => {
      await (window as unknown as { __EVOTYCOON__: Api }).__EVOTYCOON__.save();
    });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');

    const second = await page.evaluate(async () => {
      const api = (window as unknown as { __EVOTYCOON__: Api }).__EVOTYCOON__;
      await api.load();
      return { hash: api.getWorldHash(), tick: api.getState().tick };
    });

    expect(second.tick).toBe(first.tick);
    expect(second.hash, 'a field is lost on every round trip').toBe(first.hash);

    await page.evaluate(async () => {
      await (window as unknown as { __EVOTYCOON__: Api }).__EVOTYCOON__.clearSaves();
    });
  });

  test('the upgrade the player bought is still bought after the reload', async ({ page }) => {
    // The digest already proves this, but it proves it in a way nobody can read.
    // This is the same claim in the interface the player uses.
    await boot(page);
    await play(page, TICKS_PER_MINUTE * 8);
    await page.evaluate(async () => {
      const api = (window as unknown as { __EVOTYCOON__: Api }).__EVOTYCOON__;
      api.dispatch({ t: 'BUY_UPGRADE', upgradeId: 'hand-painted-sign' });
      // Through the sign's construction (3.4 s = 68 ticks) — the claim under
      // test is "bought survives a reload", and bought means built.
      api.advanceTicks(80);
      await api.save();
    });

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
    await page.evaluate(async () => {
      await (window as unknown as { __EVOTYCOON__: Api }).__EVOTYCOON__.load();
    });

    await page.locator('[data-testid="dock-build"]').click();
    await expect(
      page.locator('[data-testid="build-card"][data-upgrade="hand-painted-sign"]'),
    ).toHaveAttribute('data-level', '1');

    await page.evaluate(async () => {
      await (window as unknown as { __EVOTYCOON__: Api }).__EVOTYCOON__.clearSaves();
    });
  });
});

test.describe('vertical slice — criterion 6, a clean long run', () => {
  test('runs a long session with no console errors and no unbounded heap growth', async ({ page }) => {
    /*
     * **What this measures, exactly.** The criterion says thirty minutes in
     * DevTools. This runs thirty *simulated* minutes — the whole of the loop's
     * work, every allocation, every pool cycle — in a few seconds of wall clock,
     * and checks the console and the JS heap.
     *
     * It is a weaker test than a human sitting with DevTools for half an hour,
     * and it is stated as weaker: it cannot catch a leak in the renderer's
     * per-frame path, because only a few hundred frames are drawn. What it does
     * catch is the thing most likely to be wrong after this phase — a
     * simulation that accumulates state it never releases — and it catches it on
     * every CI run rather than once.
     */
    const errors: string[] = [];
    const record = (text: string): void => {
      if (isForeignCspViolation(text)) return;
      errors.push(text);
    };
    page.on('console', (message) => {
      if (message.type() === 'error') record(message.text());
    });
    page.on('pageerror', (error) => {
      record(error.message);
    });

    await boot(page);

    const heapOf = async (): Promise<number> =>
      page.evaluate(
        () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
      );

    // Ten minutes in, once the pools have filled and the world has reached its
    // steady population. Measuring from tick zero would measure start-up.
    await play(page, TICKS_PER_MINUTE * 10);
    const settled = await heapOf();

    await play(page, TICKS_PER_MINUTE * 20);
    const later = await heapOf();

    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);

    /*
     * `performance.memory` is Chromium-only and absent in Firefox, where it
     * reads zero. Skipping the assertion there rather than asserting on a zero
     * is the honest handling — a test that "passes" on a number the browser
     * never provided is worse than no test.
     */
    if (settled > 0) {
      const growth = (later - settled) / settled;
      expect(
        growth,
        `heap ${(settled / 1e6).toFixed(1)} MB → ${(later / 1e6).toFixed(1)} MB over 20 simulated minutes`,
      ).toBeLessThan(0.5);
    }
  });
});
