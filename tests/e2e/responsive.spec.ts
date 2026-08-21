import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 18 — the seven-viewport matrix (TESTING_STRATEGY §7.5).
 * At every size: no horizontal overflow, the primary actions visible and
 * touch-sized, and the HUD holding to its share of the world
 * (≤22% desktop / ≤28% mobile — GDD §14.1, measured, not aspired).
 */

const VIEWPORTS = [
  { width: 1920, height: 1080, name: 'desktop', hudShare: 0.22 },
  { width: 1280, height: 720, name: 'laptop', hudShare: 0.22 },
  { width: 1024, height: 768, name: 'tablet-landscape', hudShare: 0.22 },
  { width: 768, height: 1024, name: 'tablet-portrait', hudShare: 0.28 },
  { width: 667, height: 375, name: 'phone-landscape', hudShare: 0.28 },
  { width: 375, height: 667, name: 'phone-portrait', hudShare: 0.28 },
  { width: 360, height: 640, name: 'android-small', hudShare: 0.28 },
] as const;

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242');
  await page.waitForSelector('html[data-app-state="ready"]');
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${String(viewport.width)}×${String(viewport.height)})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('no horizontal scroll, actions reachable, HUD within its share', async ({ page }) => {
      await boot(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);

      for (const id of ['dock-staff', 'dock-analytics', 'settings-gear'] as const) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box, `${id} visible`).not.toBeNull();
        if (box !== null) {
          expect(box.height, `${id} touch height`).toBeGreaterThanOrEqual(43);
          expect(box.x, `${id} on screen`).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        }
      }

      /*
       * The HUD share: the union area of every visible chrome element over the
       * viewport area. Union, not sum — overlapping panels must not be counted
       * twice — approximated on a coarse grid, which overestimates if anything.
       */
      const share = await page.evaluate(() => {
        /*
         * Painted chrome only: the HUD tree is full of full-viewport
         * positioning containers that draw nothing (marker layers, build-mode
         * hit areas) — counting their rects reads as 100% while the actual
         * pixels are a strip and a dock. An element counts when it paints a
         * background or border of its own.
         */
        const paints = (element: HTMLElement): boolean => {
          const style = getComputedStyle(element);
          const bg = style.backgroundColor;
          const hasBg = bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
          const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some(
            (side) => parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0,
          );
          return hasBg || hasBorder;
        };
        const chrome = [...document.querySelectorAll<HTMLElement>('[data-testid="game-hud"] *')].filter(
          (element) =>
            paints(element) &&
            element.closest('[data-testid="pause-overlay"]') === null &&
            element.getBoundingClientRect().width > 0,
        );
        const cell = 8;
        const cols = Math.ceil(window.innerWidth / cell);
        const rows = Math.ceil(window.innerHeight / cell);
        const covered = new Uint8Array(cols * rows);
        for (const element of chrome) {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const x0 = Math.max(0, Math.floor(rect.left / cell));
          const x1 = Math.min(cols - 1, Math.floor((rect.right - 1) / cell));
          const y0 = Math.max(0, Math.floor(rect.top / cell));
          const y1 = Math.min(rows - 1, Math.floor((rect.bottom - 1) / cell));
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) covered[y * cols + x] = 1;
        }
        let on = 0;
        for (const bit of covered) on += bit;
        return on / (cols * rows);
      });
      expect(share, `HUD share ${String(Math.round(share * 100))}%`).toBeLessThanOrEqual(viewport.hudShare);
    });
  });
}
