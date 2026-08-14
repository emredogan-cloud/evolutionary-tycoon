import customerUrl from '../../assets/_placeholder/ph-customer__PLACEHOLDER__.png';
import employeeUrl from '../../assets/_placeholder/ph-employee__PLACEHOLDER__.png';
import propShortUrl from '../../assets/_placeholder/ph-prop-short__PLACEHOLDER__.png';
import propTallUrl from '../../assets/_placeholder/ph-prop-tall__PLACEHOLDER__.png';
import scaleReferenceUrl from '../../assets/_placeholder/ph-scale-reference__PLACEHOLDER__.png';
import vehicleUrl from '../../assets/_placeholder/ph-vehicle__PLACEHOLDER__.png';
import { ACTOR_KIND_SPECS } from '@config/actors';

/**
 * Placeholder art, imported so Vite content-hashes and emits it.
 *
 * Static imports rather than a runtime fetch from a directory: the hashed
 * filenames are what make `/assets/**` safe to serve with a one-year immutable
 * cache header (`vercel.ts`), and a missing file becomes a build error instead
 * of a 404 nobody sees until the preview.
 *
 * Phase 4 replaces this module with the generated asset manifest. Nothing else
 * in `src/render` refers to a placeholder by name.
 */

export interface PlaceholderTexture {
  readonly key: string;
  readonly url: string;
  /** Footprint centre within the image, as a 0..1 origin for the sprite. */
  readonly originX: number;
  readonly originY: number;
}

/** Keyed by texture key; the same keys `src/config/actors.ts` declares. */
const URLS: Readonly<Record<string, string>> = {
  'ph-customer': customerUrl,
  'ph-employee': employeeUrl,
  'ph-vehicle': vehicleUrl,
  'ph-prop-short': propShortUrl,
  'ph-prop-tall': propTallUrl,
  'ph-scale-reference': scaleReferenceUrl,
};

/**
 * Origins, derived from the same geometry the generator used.
 *
 * Kept as a formula rather than a table of magic numbers so the sprite's anchor
 * and the depth sorter's anchor cannot drift apart — they are the same
 * calculation, run once here and once in `tools/placeholders/generate.ts`, and
 * a unit test asserts they agree.
 */
export function placeholderTextures(): PlaceholderTexture[] {
  return ACTOR_KIND_SPECS.map((kind) => {
    const url = URLS[kind.textureKey];
    if (url === undefined) {
      throw new Error(`No placeholder image for texture key ${kind.textureKey}`);
    }
    const footprintSpan = kind.footprintX + kind.footprintY;
    const diamondHeight = footprintSpan * 16; // TILE_H / 2
    const bodyHeight = kind.heightMetres * 32; // TILE_Z
    const totalHeight = diamondHeight + bodyHeight;

    return {
      key: kind.textureKey,
      url,
      originX: 0.5,
      // Vertically the centre of the ground diamond, measured from the top.
      originY: (totalHeight - diamondHeight / 2) / totalHeight,
    };
  });
}
