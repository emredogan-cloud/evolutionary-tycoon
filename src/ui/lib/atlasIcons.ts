/**
 * Atlas frames served to the DOM as CSS sprites — the foodIcons mechanism,
 * generalised to every interface atlas.
 *
 * `ui` ships with the boot fetch; `ui2` (upgrade-card icons, the state
 * illustrations) is a *deferred* atlas — its first requester triggers the
 * fetch, which is the whole point of the tier: panel art costs nothing until
 * a panel opens. Everything degrades to text exactly like the order bubble:
 * `frameStyle` returns null until the sheet arrives and the caller renders
 * its label instead.
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

type SheetId = 'ui' | 'ui2';

interface SheetState {
  frames: Map<string, FrameRect> | null;
  page: { url: string; width: number; height: number } | null;
  requested: boolean;
}

const sheets: Record<SheetId, SheetState> = {
  ui: { frames: null, page: null, requested: false },
  ui2: { frames: null, page: null, requested: false },
};

const listeners = new Set<() => void>();

export function ensureSheet(id: SheetId): void {
  const state = sheets[id];
  if (state.requested) return;
  state.requested = true;
  void fetch(`/atlas/${id}.json`)
    .then((response) => (response.ok ? (response.json() as Promise<AtlasSheet>) : null))
    .then((sheet) => {
      const texture = sheet?.textures?.[0];
      if (texture === undefined) return;
      state.frames = new Map(texture.frames.map((frame) => [frame.filename, frame.frame]));
      state.page = { url: `/atlas/${texture.image}`, width: texture.size.w, height: texture.size.h };
      for (const listener of listeners) listener();
    })
    .catch(() => undefined);
}

/** Re-render hook: fires when any sheet arrives. Returns an unsubscribe. */
export function onIconsReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Inline style rendering `frame` at `px` box size (contain-fit), or null
 * until the sheet is here. Frame names are atlas filenames without extension
 * (`ui_upgrade_menuboard@2x`, `ui_icon_weather-rain@2x`).
 */
export function frameStyle(id: SheetId, frame: string, px: number): string | null {
  const state = sheets[id];
  if (state.frames === null || state.page === null) return null;
  const rect = state.frames.get(frame) ?? state.frames.get(`${frame}.png`);
  if (rect === undefined) return null;
  const scale = px / Math.max(rect.w, rect.h);
  const width = rect.w * scale;
  const height = rect.h * scale;
  return (
    `display:inline-block;width:${String(width)}px;height:${String(height)}px;` +
    `background-image:url('${state.page.url}');` +
    `background-position:-${String(rect.x * scale)}px -${String(rect.y * scale)}px;` +
    `background-size:${String(state.page.width * scale)}px ${String(state.page.height * scale)}px;` +
    'image-rendering:auto;'
  );
}
