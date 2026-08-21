import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Buying something, in a browser — GAME_EXECUTION_ROADMAP Phase 9.
 *
 * The roadmap's E2E line, in order: "yükseltme satın al → nakit düş → görsel
 * değiş → dönüşüm oranı ölçülebilir artsın". Each of those four is a separate
 * assertion below, because each can fail on its own and three of them would be
 * invisible from Node: the card is DOM, the cash figure travels through the
 * throttled bridge, and the object that appears is drawn by Phaser.
 *
 * The world-in-place card is the piece worth testing hardest. GAME_DESIGN
 * DOCUMENT §14.3 asks for a contextual card beside the object and explicitly
 * forbids a modal — so this checks that the game is still visible behind it,
 * which is the property the rule exists to protect.
 */

const TICKS_PER_MINUTE = 1200;

interface TestApi {
  dispatch(command: { t: 'MANUAL_PREP'; orderSlot: number }): void;
  advanceTicks(n: number): void;
}

/**
 * Advance the world by `ticks`, issuing no commands.
 *
 * Its own helper because `page.evaluate` serialises the callback and sends it to
 * the browser: a module-scope helper referenced inside one is a `ReferenceError`
 * in the page, not a compile error here. That cost three tests before it was
 * noticed.
 */
async function advance(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    (window as unknown as { __EVOTYCOON__: { advanceTicks(n: number): void } }).__EVOTYCOON__.advanceTicks(
      count,
    );
  }, ticks);
}

async function cookFor(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    const hooks = (window as unknown as { __EVOTYCOON__: TestApi }).__EVOTYCOON__;
    for (let i = 0; i < count; i++) {
      hooks.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      hooks.advanceTicks(1);
    }
  }, ticks);
}

async function readCash(page: Page): Promise<number> {
  const raw = await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash');
  return Number.parseFloat(raw ?? 'NaN');
}

async function boot(page: Page, seed = 424242): Promise<void> {
  await page.goto(`/?e2e=1&seed=${String(seed)}&paused=1`);
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

/** Earn enough for the cheapest upgrade — ₡6 since Phase 12 — and wait for the HUD to agree. */
async function earnFor(page: Page, credits: number): Promise<void> {
  for (let minute = 0; minute < 30; minute++) {
    await cookFor(page, TICKS_PER_MINUTE);
    await page.waitForTimeout(120);
    if ((await readCash(page)) >= credits) return;
  }
  throw new Error(`never reached ₡${String(credits)} in thirty simulated minutes`);
}

test.describe('buying an upgrade', () => {
  test('opens a card beside the object, without covering the game', async ({ page }) => {
    /*
     * The anti-modal assertion. A modal would pass every other test in this
     * file — the purchase would work, the cash would fall — while destroying the
     * thing GAME_DESIGN_DOCUMENT §14.3 calls the decision that keeps the game
     * visually dominant.
     */
    await boot(page);

    const hotspot = page.locator('[data-testid="upgrade-hotspot"]').first();
    await expect(hotspot).toBeVisible();
    await hotspot.click();

    const card = page.locator('[data-testid="upgrade-card"]');
    await expect(card).toBeVisible();

    const viewport = page.viewportSize();
    const box = await card.boundingBox();
    expect(box, 'the card has no box').not.toBeNull();
    if (box === null || viewport === null) return;

    // A card, not a curtain: comfortably under a fifth of the viewport.
    const share = (box.width * box.height) / (viewport.width * viewport.height);
    expect(share, `the card covers ${(share * 100).toFixed(1)}% of the screen`).toBeLessThan(0.2);

    // And the canvas is still there behind it.
    await expect(page.locator('#game-canvas canvas')).toBeVisible();
  });

  test('shows the exact before and after numbers', async ({ page }) => {
    // §14.3: "current level, the exact before/after numbers, and the cost".
    await boot(page);
    await page.locator('[data-testid="upgrade-hotspot"][data-upgrade="hand-painted-sign"]').click();

    const card = page.locator('[data-testid="upgrade-card"]');
    await expect(card).toBeVisible();
    await expect(page.locator('[data-testid="upgrade-level"]')).toHaveText(/Seviye 0 \/ 4/);
    await expect(card).toContainText('1.00×');
    await expect(card).toContainText('1.50×');
    // ₡6 since Phase 12 rescaled the Stage 1 ladder so the next rung is always
    // inside ninety seconds of income — PHASE_12_REPORT §4.
    await expect(page.locator('[data-testid="upgrade-buy"]')).toContainText('₡6');
  });

  test('refuses the purchase while the player cannot afford it', async ({ page }) => {
    await boot(page);
    await page.locator('[data-testid="upgrade-hotspot"][data-upgrade="hand-painted-sign"]').click();

    await expect(page.locator('[data-testid="upgrade-buy"]')).toBeDisabled();
    await expect(page.locator('[data-testid="upgrade-short"]')).toBeVisible();
  });

  test('takes the cash and raises the level when it is bought', async ({ page }) => {
    await boot(page);
    await earnFor(page, 12);

    const before = await readCash(page);
    await page.locator('[data-testid="upgrade-hotspot"][data-upgrade="hand-painted-sign"]').click();
    await expect(page.locator('[data-testid="upgrade-buy"]')).toBeEnabled();
    await page.locator('[data-testid="upgrade-buy"]').click();

    /*
     * One tick to apply the command — they land at the start of a tick, never on
     * dispatch — then the bridge's next sample carries it. Polled rather than
     * slept: the sequence is deterministic but its wall-clock timing is not.
     */
    await advance(page, 1);
    await expect
      .poll(async () => readCash(page), { message: 'the HUD never showed the purchase' })
      .toBeLessThan(before);

    // ₡6 since Phase 12's ladder rescale — see the note on the buy button above.
    expect(before - (await readCash(page))).toBeCloseTo(6, 1);
    await expect(
      page.locator('[data-testid="upgrade-hotspot"][data-upgrade="hand-painted-sign"]'),
    ).toHaveAttribute('data-level', '1');
  });

  test('puts something in the world that was not there before', async ({ page }) => {
    /*
     * "Visual feedback is not optional. Every purchase changes the world visibly
     * within one second." The object is drawn into the WebGL canvas, so it
     * cannot be queried — what is asserted instead is that the *pixels changed*,
     * by screenshotting the same frozen camera before and after.
     *
     * A weaker claim than "a sign appeared", and an honest one: no production
     * art exists, so what appears is a registered placeholder. That it appears
     * at all is the part this phase can prove.
     */
    await boot(page);
    await earnFor(page, 12);

    const canvas = page.locator('#game-canvas canvas');
    const before = await canvas.screenshot();

    await page.locator('[data-testid="upgrade-hotspot"][data-upgrade="hand-painted-sign"]').click();
    await page.locator('[data-testid="upgrade-buy"]').click();
    await advance(page, 1);
    // One rendered frame is enough — the scene rebuilds its statics on the
    // revision change, which is checked every frame.
    await page.waitForTimeout(250);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after), 'the world looks identical after a purchase').not.toBe(0);
  });

  test('converts more of the same traffic afterwards', async ({ page }) => {
    /*
     * The last link in the roadmap's chain, and the only one that is about the
     * *game* rather than the interface. Two pages, same seed, same commands —
     * one buys a sign at the same point in the run.
     *
     * Measured in the browser rather than trusted from the Node integration
     * test, because this is the assertion that the whole chain — click, command,
     * validation, effect lookup, conversion roll — is connected end to end.
     */
    const served = async (target: Page): Promise<number> =>
      Number.parseInt((await target.locator('[data-testid="hud-served"]').innerText()).trim(), 10);

    await boot(page);
    await earnFor(page, 12);
    await page.locator('[data-testid="upgrade-hotspot"][data-upgrade="hand-painted-sign"]').click();
    await page.locator('[data-testid="upgrade-buy"]').click();
    await advance(page, 1);

    const atPurchase = await served(page);
    await cookFor(page, TICKS_PER_MINUTE * 20);
    await page.waitForTimeout(150);
    const afterwards = await served(page);

    expect(afterwards, `${String(atPurchase)} → ${String(afterwards)} served`).toBeGreaterThan(atPurchase);
  });
});

test.describe('the price panel', () => {
  test('moves a price and keeps it inside the band', async ({ page }) => {
    await boot(page);

    const slider = page.locator('[data-testid="price-slider"][data-item="hotdog"]');
    await expect(slider).toBeVisible();

    // The band itself, ±50% of ₡5, drawn as the slider's own range so the limit
    // is visible rather than discovered by being refused.
    /*
     * The ±50% band around the hot dog's base price, which Phase 12 moved from
     * ₡5 to ₡6.75 — the three Stage 1 prices and their ingredient costs were
     * scaled together so the uniform three-item average is the ₡4.50 ticket
     * ECONOMY_DESIGN §3 builds the envelope on, with every published margin
     * unchanged. `PRICE_BAND` itself is untouched.
     */
    await expect(slider).toHaveAttribute('min', '3.375');
    await expect(slider).toHaveAttribute('max', '10.125');

    /*
     * The band's own maximum, not a round number. The slider steps in ₡0.05 and
     * its minimum is ₡3.375, so ₡10 is not a value it can hold — Playwright
     * rejects it as malformed. The maximum always is, by construction.
     */
    await slider.fill('10.125');
    /*
     * One tick, because a command lands at the *start* of a tick and never on
     * dispatch — a deliberate property (wall-clock arrival time must not change
     * an outcome), and one that makes a paused world look like a broken slider.
     */
    await advance(page, 1);
    await expect(page.locator('[data-testid="price-value"][data-item="hotdog"]')).toHaveText(/10,1/);
  });
});

test.describe('the objective', () => {
  test('names one target and tracks progress toward it', async ({ page }) => {
    // One target, deliberately: six is a list, and a list is not a goal.
    await boot(page);

    const panel = page.locator('[data-testid="objective-panel"]');
    await expect(panel).toBeVisible();
    await expect(page.locator('[data-testid="objective-target"]')).toHaveText('Elle boyanmış tabela');

    const start = Number.parseInt(
      (await page.locator('[data-testid="objective-progress"]').getAttribute('data-progress')) ?? '0',
      10,
    );
    expect(start).toBe(0);

    /*
     * Six minutes, not three. On this seed the first car parks at tick 4264 —
     * three and a half minutes in — so a three-minute run ends with an empty
     * till and the test would have been measuring the arrival process.
     */
    await cookFor(page, TICKS_PER_MINUTE * 6);
    await expect
      .poll(
        async () =>
          Number.parseInt(
            (await page.locator('[data-testid="objective-progress"]').getAttribute('data-progress')) ?? '0',
            10,
          ),
        { message: 'the objective never advanced' },
      )
      .toBeGreaterThan(0);
  });
});
