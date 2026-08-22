import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSheet, frameStyle, onIconsReady } from '../../../src/ui/lib/atlasIcons';

/**
 * The DOM-side atlas sprite reader — the generalised foodIcons mechanism.
 * Fetch is mocked; what is under test is the state machine: nothing before
 * the sheet, styles after it, one fetch per sheet, and the text fallback
 * (null) for a frame that does not exist.
 */
const SHEET = {
  textures: [
    {
      image: 'ui2.webp',
      size: { w: 200, h: 100 },
      frames: [
        { filename: 'ui_upgrade_menuboard@2x.png', frame: { x: 10, y: 20, w: 40, h: 40 } },
        { filename: 'ui_icon_star@2x', frame: { x: 60, y: 0, w: 20, h: 30 } },
      ],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('atlasIcons', () => {
  it('is null before the sheet arrives, styled after, and fetches once', async () => {
    let calls = 0;
    const fetchMock = vi.fn(() => {
      calls++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SHEET) });
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(frameStyle('ui2', 'ui_upgrade_menuboard@2x', 44)).toBeNull();

    const ready = new Promise<void>((resolve) => {
      const off = onIconsReady(() => {
        off();
        resolve();
      });
    });
    ensureSheet('ui2');
    ensureSheet('ui2'); // second call must not refetch
    await ready;
    expect(calls).toBe(1);

    // Extension present and absent both resolve; scale follows the box.
    const style = frameStyle('ui2', 'ui_upgrade_menuboard@2x', 44);
    expect(style).toContain("background-image:url('/atlas/ui2.webp')");
    expect(style).toContain('width:44px');
    const star = frameStyle('ui2', 'ui_icon_star@2x', 30);
    expect(star).toContain('height:30px');

    // A frame the sheet does not carry stays a text fallback.
    expect(frameStyle('ui2', 'ui_upgrade_missing@2x', 44)).toBeNull();
  });

  it('swallows a failed fetch and stays on the fallback path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) })),
    );
    ensureSheet('ui');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(frameStyle('ui', 'ui_icon_star@2x', 20)).toBeNull();
  });
});
