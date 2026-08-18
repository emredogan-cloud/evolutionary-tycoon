import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Visual regression on a WebGL canvas.
 *
 * This only works because the renderer has a *visual determinism mode*. Without
 * pinning the seed, the tick, the camera, particles and the device pixel ratio,
 * two runs of the same scene differ in half a dozen ways that have nothing to do
 * with the code, and the diff is noise rather than signal.
 *
 * Chromium only, and under forced software rasterisation. Headless WebKit does
 * not render canvas into screenshots (playwright#586) and headless Firefox WebGL
 * needs a virtual framebuffer, so a golden from either would be measuring the
 * harness (ADR-011). SwiftShader is forced on every machine — including ones
 * with a perfectly good GPU — so a golden taken locally and a golden taken in CI
 * are the same pixels.
 *
 * **A diff is never accepted automatically.** TESTING_STRATEGY §8.4: look at it,
 * decide whether the change was intended, and only then update the golden with
 * the reason in the pull request.
 */

const VIEWPORT = { width: 1280, height: 720 };

/** Everything the visual mode pins, in one place. */
/**
 * `freezeAt` is a parameter rather than a suffix because `URLSearchParams.get`
 * returns the *first* match: appending a second `freezeAt=` would be silently
 * ignored, and the Phase 6 goldens would photograph tick 0 while claiming to
 * photograph tick 4264.
 */
function frozenUrl(scene: string, freezeAt = 0, extra = ''): string {
  return `/?scene=${scene}&freezeAt=${String(freezeAt)}&seed=424242&noParticles=1&fixedViewport=1&dpr=1&hideHud=1${extra}`;
}

async function openFrozen(page: Page, scene: string, freezeAt = 0, extra = ''): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto(frozenUrl(scene, freezeAt, extra));
  // Wait on a state attribute, never a timeout — the difference between a suite
  // that is stable and one that lives in docs/FLAKY.md.
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
  await expect(page.locator('html')).toHaveAttribute('data-visual-mode', '1');
  await page.waitForTimeout(250);
}

test.describe('visual goldens', () => {
  test('stage1-empty — the bare lot, road and statics', async ({ page }) => {
    await openFrozen(page, 'empty');
    await expect(page).toHaveScreenshot('stage1-empty.png');
  });

  test('iso-depth-testcard — the deliberately hard depth cases', async ({ page }) => {
    // If this one changes, the sorting changed. That is the point of it.
    await openFrozen(page, 'depth-testcard');
    await expect(page).toHaveScreenshot('iso-depth-testcard.png');
  });

  test('camera-bounds — zoomed out against the lot edge', async ({ page }) => {
    await openFrozen(page, 'stress');
    await expect(page).toHaveScreenshot('camera-bounds.png');
  });

  /*
   * The two Phase 6 goldens are the first that photograph a *simulated* state
   * rather than an authored arrangement. There is no way to author them: a
   * customer standing beside a parked car is the product of a conversion roll, a
   * braking curve, a manoeuvre and a walk, and placing one by hand would prove
   * that the renderer can draw a person, which the depth test card already does.
   *
   * The cost is that the tick numbers are load-bearing. They come from seed
   * 424242 — the seed every golden already uses — and were found by running the
   * simulation and looking for the first frame in each state. A balance change
   * moves them, and the golden will diff; TESTING_STRATEGY §8.4 requires looking
   * at that diff and deciding, which is exactly the right amount of friction for
   * a change that moves when the first customer arrives.
   */
  test('stage1-first-customer — the moment the loop closes', async ({ page }) => {
    // Tick 4264: one customer walking to the counter, one car still parking.
    await openFrozen(page, 'empty', 4264);
    await expect(page).toHaveScreenshot('stage1-first-customer.png');
  });

  test('stage1-queue — four people waiting, and one of them losing patience', async ({ page }) => {
    /*
     * **Tick 5309, re-derived in Phase 8.** It was 7940 in Phase 6, 10417 in
     * Phase 7, and it has moved for the third time — because the thing it
     * photographs genuinely moved, not because the pixels drifted.
     *
     * Phase 8 gave the counter an exit. Until this phase a customer who reached
     * the front stood there, so the queue only ever grew and the busiest moment
     * was late and crowded. Now they order, step aside into the waiting area and
     * eventually leave, so the counter drains continuously and the busiest it
     * ever gets is four people — reached far earlier, at tick 5309, with one of
     * them down to 9.8% of their patience.
     *
     * Re-derived rather than re-recorded at 10417, for the same reason as last
     * time: a screenshot named `stage1-queue` that no longer photographs a queue
     * is a golden that lies about its subject, and it would go on lying quietly
     * for as long as the pixels happened to be stable. The old tick now shows
     * two people and an empty counter.
     */
    await openFrozen(page, 'empty', 5309);
    await expect(page).toHaveScreenshot('stage1-queue.png');
  });

  /**
   * The loop, mid-service — GAME_EXECUTION_ROADMAP Phase 8, `stage1-serving`.
   *
   * Tick 8280 was found by simulating seed 424242 with an attentive cook and
   * looking for the first frame where the stand is genuinely busy: a customer
   * waiting on an order, a station part-way through cooking, and a payment
   * thirty ticks old. Five customers, eight vehicles, ₡24.03 taken.
   *
   * `cook=1` is what makes it reachable. In Stage 1 the player is the cook, so a
   * fast-forward that issues no commands arrives at tick 8280 with a queue of
   * people and a kitchen that has never started anything — a golden of a stand
   * that is not serving, filed under the name `stage1-serving`.
   *
   * ## Why the overlay is not in this picture
   *
   * It was, briefly, and it made the golden host-specific. Phase 8's order
   * bubbles, progress rings, pass plates and coin popups are DOM, and DOM means
   * text: with the overlay mounted, this golden differed by 4283 pixels between
   * the pinned container and the development host, and **every one of those
   * pixels was a glyph**. The canvas matched exactly. `system-ui` resolves to
   * different fonts in the two images and font rasterisation is not portable
   * even when the family is, so no amount of pinning inside the page fixes it.
   *
   * That is not a loss. Visual regression exists for the thing Playwright cannot
   * otherwise inspect — pixels in a WebGL canvas. The overlay is queryable DOM,
   * and `tests/e2e/serviceLoop.spec.ts` asserts each marker by test id, which is
   * a stricter check than a screenshot and does not go stale when a font does.
   */
  test('stage1-serving — the stand mid-service, cooking and paid', async ({ page }) => {
    await openFrozen(page, 'empty', 8280, '&cook=1');
    await expect(page).toHaveScreenshot('stage1-serving.png');
  });

  /**
   * Before and after — GAME_EXECUTION_ROADMAP Phase 9.
   *
   * The same seed, the same tick, the same camera; the only difference is that
   * the second one owns three upgrades. The pair is the visual half of "visual
   * feedback is not optional": if a purchase changed nothing on screen, these
   * two images would be identical and the diff would say so.
   *
   * Three rather than one, chosen to land in different places — the sign on the
   * stand, the marker out at the roadside, the second prep bench behind the
   * counter — so a regression that dropped one of them still shows.
   *
   * What appears is a registered placeholder, not art. That is stated in
   * PLACEHOLDER_REGISTER and in the phase report; the golden proves the object
   * is drawn, sorted and in the right place, which is the part that can be true
   * before the art exists.
   */
  test('upgrades-before — the stand with nothing bought', async ({ page }) => {
    await openFrozen(page, 'empty', 8280, '&cook=1');
    await expect(page).toHaveScreenshot('upgrades-before.png');
  });

  test('upgrades-after — the same moment, three upgrades in', async ({ page }) => {
    await openFrozen(
      page,
      'empty',
      8280,
      /*
       * `roadside-marker` was removed in Phase 12 — the paired experiment
       * measured every level of it as costing revenue, because a converted
       * driver reserves a bay the moment they decide and the marker made them
       * decide sooner. `bigger-counter` takes its place here: three upgrades
       * from three different families is what the golden is about, and the
       * simulation refuses a purchase it does not recognise, which is what took
       * the scene to `data-sim-state="failed"`.
       */
      '&cook=1&buy=hand-painted-sign,bigger-counter,second-prep-station',
    );
    await expect(page).toHaveScreenshot('upgrades-after.png');
  });

  /**
   * The four stages — GAME_EXECUTION_ROADMAP Phase 11, "visual golden'lar: her
   * aşama".
   *
   * The same lot, the same road and the same camera in all four; what changes is
   * the building, the car park, the tables and — at Stage 4 — the drive-thru
   * lane. That is the design constraint made photographable: put these side by
   * side and the plot is recognisably the same place.
   *
   * `?stage=` sets the stage directly rather than playing to it. A golden that
   * had to earn its way to Stage 4 would take minutes to regenerate and would
   * photograph whatever the economy happened to do on the day.
   *
   * Stage 3 and 4 art is **placeholder** and registered as such — GAME_EXECUTION
   * ROADMAP puts it in Phase 16. What these goldens protect is the *geometry*:
   * where the bays are, where the tables are, where the lane runs.
   */
  for (const stage of [2, 3, 4]) {
    test(`stage${String(stage)}-layout — the lot as it is built out`, async ({ page }) => {
      await openFrozen(page, 'empty', 600, `&stage=${String(stage)}`);
      await expect(page).toHaveScreenshot(`stage${String(stage)}-layout.png`);
    });
  }
});

test.describe('visual determinism', () => {
  test('renders the same scene byte-identically ten times', async ({ browser }) => {
    // The precondition for every golden above. If this fails, a golden diff
    // means nothing, and the roadmap makes it a phase-completion condition.
    //
    // Ten full boots, each decoding every atlas — a 4-core CI runner spends
    // 5-8 s per boot where this machine spends ~1.5 s, and the default thirty
    // seconds covered the loop only before boot carried real art.
    test.setTimeout(180_000);
    const hashes: string[] = [];

    for (let run = 0; run < 10; run++) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await openFrozen(page, 'depth-testcard');
      hashes.push(
        createHash('sha256')
          .update(await page.screenshot())
          .digest('hex'),
      );
      await context.close();
    }

    const unique = new Set(hashes);
    expect(unique.size, `10 runs produced ${unique.size} distinct images:\n${[...unique].join('\n')}`).toBe(
      1,
    );
  });

  test('a fresh page load reproduces the same pixels', async ({ page }) => {
    await openFrozen(page, 'depth-testcard');
    const first = createHash('sha256')
      .update(await page.screenshot())
      .digest('hex');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
      timeout: 30_000,
    });
    await page.waitForTimeout(250);
    const second = createHash('sha256')
      .update(await page.screenshot())
      .digest('hex');

    expect(second).toBe(first);
  });

  test('the frozen clock does not advance', async ({ page }) => {
    // A screenshot taken a second later must be the same screenshot; otherwise
    // the golden depends on how fast the machine got to it.
    await openFrozen(page, 'depth-testcard');
    const first = createHash('sha256')
      .update(await page.screenshot())
      .digest('hex');
    await page.waitForTimeout(1000);
    const second = createHash('sha256')
      .update(await page.screenshot())
      .digest('hex');
    expect(second).toBe(first);
  });
});
