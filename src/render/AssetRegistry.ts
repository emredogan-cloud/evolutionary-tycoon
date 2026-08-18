/**
 * What the loaded atlases contain, and where each frame's feet are.
 *
 * Phaser's texture manager knows a frame's rectangle. It does not know the
 * frame's **footprint anchor** — the point where the object meets the ground,
 * which `docs/assets/subjectDimensions.json` derives and `assets:import` writes
 * into a sidecar. That number is what the depth sort and the sprite origin both
 * need, so it travels in the atlas JSON's `anchors` block and lands here.
 *
 * No Phaser in this file. It holds plain data about frames, which means the
 * sprite-selection logic above it can be unit-tested in Node — the same reason
 * `VehicleView` and `DollRig` are pure. The scene hands it the parsed atlas JSON
 * and asks it questions.
 *
 * **A missing frame is answered, not thrown.** A decorative atlas that failed to
 * load should cost its decorations, not the session: `has()` reports the truth
 * and the caller decides. `originFor` falls back to bottom-centre, which is
 * where an object with no declared anchor stands.
 */

export interface AtlasFrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface AtlasFrameEntry {
  readonly filename: string;
  readonly frame: AtlasFrameRect;
  readonly sourceSize: { readonly w: number; readonly h: number };
}

export interface AtlasSheetData {
  readonly textures: readonly {
    readonly image: string;
    readonly size: { readonly w: number; readonly h: number };
    readonly frames: readonly AtlasFrameEntry[];
  }[];
  /** Footprint anchors in frame pixels, keyed by frame name. Written by `assets:atlas`. */
  readonly anchors?: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
}

/** A frame's size and the origin a sprite should be drawn with. */
export interface FrameInfo {
  /** Which atlas texture key the frame lives in. */
  readonly atlas: string;
  readonly width: number;
  readonly height: number;
  /** Footprint anchor as a 0..1 origin, ready for `sprite.setOrigin`. */
  readonly originX: number;
  readonly originY: number;
}

export class AssetRegistry {
  private readonly frames = new Map<string, FrameInfo>();

  /** Atlas ids that were asked for and did not arrive. */
  private readonly missing = new Set<string>();

  /**
   * Take one atlas's parsed JSON.
   *
   * Called once per atlas as it loads. Frame names are the source filenames —
   * `veh_sedan_default_se@2x.png` — because `removeFileExtension` is off in the
   * packer, and `src/config/sprites.ts` writes them the same way.
   */
  register(atlasId: string, sheet: AtlasSheetData): void {
    const texture = sheet.textures[0];
    if (texture === undefined) return;

    for (const frame of texture.frames) {
      const anchor = sheet.anchors?.[frame.filename];
      const width = frame.frame.w;
      const height = frame.frame.h;
      this.frames.set(frame.filename, {
        atlas: atlasId,
        width,
        height,
        // Divided by the frame's own size, so a sprite drawn at any scale puts
        // the same world point under the same screen point.
        originX: anchor === undefined ? 0.5 : anchor.x / Math.max(1, width),
        originY: anchor === undefined ? 1 : anchor.y / Math.max(1, height),
      });
    }
  }

  markMissing(atlasId: string): void {
    this.missing.add(atlasId);
  }

  get missingAtlases(): readonly string[] {
    return [...this.missing].sort();
  }

  has(frame: string): boolean {
    return this.frames.has(frame);
  }

  get frameCount(): number {
    return this.frames.size;
  }

  info(frame: string): FrameInfo | undefined {
    return this.frames.get(frame);
  }

  /** The atlas texture key a frame belongs to, for `sprite.setTexture`. */
  atlasOf(frame: string): string | undefined {
    return this.frames.get(frame)?.atlas;
  }

  /**
   * The first frame in `candidates` that exists.
   *
   * The shape every caller needs: a sprite has a preferred frame and a fallback
   * — a braking car wants `_brake` and settles for the plain one — and doing
   * that inline at each call site is how a missing frame becomes a blank sprite
   * nobody notices.
   */
  resolve(...candidates: readonly (string | undefined)[]): string | undefined {
    for (const candidate of candidates) {
      if (candidate !== undefined && this.frames.has(candidate)) return candidate;
    }
    return undefined;
  }

  /** Every frame name that loaded, sorted. For the asset showcase and its test. */
  list(): readonly string[] {
    return [...this.frames.keys()].sort();
  }
}
