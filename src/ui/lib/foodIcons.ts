import { FOOD_ICONS } from '@config/sprites';

/**
 * The food icons, served to the DOM out of the `ui` atlas.
 *
 * The overlay is Svelte and the icons are atlas frames, which is a genuine gap:
 * Phaser reads the atlas natively, the DOM does not. Rather than shipping every
 * icon a second time as loose files, the atlas page is used as a CSS sprite
 * sheet — one fetch of `/atlas/ui.json` for the geometry, and the browser
 * reuses the very `ui.webp` the canvas has already downloaded.
 *
 * Everything degrades to text. Until the JSON arrives — or if it never does —
 * `styleFor` returns null and the bubble renders the item's label exactly as it
 * did before the art existed. A bubble that rendered an empty square while a
 * fetch was in flight would be a placeholder with extra steps.
 */

interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface AtlasSheet {
  readonly textures?: readonly {
    readonly image: string;
    readonly size: { readonly w: number; readonly h: number };
    readonly frames: readonly { readonly filename: string; readonly frame: FrameRect }[];
  }[];
}

let frames: Map<string, FrameRect> | null = null;
let page: { url: string; width: number; height: number } | null = null;
let requested = false;
const listeners = new Set<() => void>();

/** Kick the fetch off once; safe to call from every component that renders an icon. */
export function ensureLoaded(): void {
  if (requested) return;
  requested = true;
  void fetch('/atlas/ui.json')
    .then((response) => (response.ok ? (response.json() as Promise<AtlasSheet>) : null))
    .then((sheet) => {
      const texture = sheet?.textures?.[0];
      if (texture === undefined) return;
      frames = new Map(texture.frames.map((frame) => [frame.filename, frame.frame]));
      page = { url: `/atlas/${texture.image}`, width: texture.size.w, height: texture.size.h };
      for (const listener of listeners) listener();
    })
    .catch(() => {
      // The text fallback is already on screen; there is nothing to do.
    });
}

/** Re-render hook for components that mounted before the atlas arrived. */
export function onIconsReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Inline CSS that shows one menu item's icon at `size` CSS pixels, or null
 * while only text is available.
 *
 * Background-position mathematics: scaling a sprite sheet so one frame fills a
 * `size` box means scaling the whole page by `size / frame.w`, then offsetting
 * by the frame's origin at that scale.
 */
export function styleFor(itemId: string, size: number): string | null {
  if (frames === null || page === null) return null;
  const name = FOOD_ICONS[itemId];
  // Unmapped items keep their text bubble — a truthful word over a wrong icon.
  if (name === undefined) return null;
  const frame = frames.get(name);
  if (frame === undefined) return null;

  const scale = size / Math.max(frame.w, frame.h);
  return (
    `width:${String(Math.round(frame.w * scale))}px;` +
    `height:${String(Math.round(frame.h * scale))}px;` +
    `background-image:url('${page.url}');` +
    `background-size:${String(Math.round(page.width * scale))}px ${String(Math.round(page.height * scale))}px;` +
    `background-position:-${String(Math.round(frame.x * scale))}px -${String(Math.round(frame.y * scale))}px;`
  );
}
