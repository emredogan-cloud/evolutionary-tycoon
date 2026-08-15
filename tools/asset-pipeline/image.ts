import sharp from 'sharp';

/**
 * Pixel access for the validator and the processor.
 *
 * Everything downstream works on straight (non-premultiplied) 8-bit RGBA in
 * sRGB. Normalising once, here, means no other module has to ask what colour
 * space a file was in — which matters because a PNG tagged Display P3 and a PNG
 * tagged sRGB carrying identical bytes are different colours, and the palette
 * check would quietly fail one and pass the other.
 */

export interface RawImage {
  readonly width: number;
  readonly height: number;
  /** Straight RGBA, 4 bytes per pixel, row-major. */
  readonly data: Buffer;
}

export async function readRaw(path: string): Promise<RawImage> {
  const { data, info } = await sharp(path)
    .toColorspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) {
    throw new Error(`${path}: expected 4 channels after ensureAlpha, got ${info.channels}`);
  }
  return { width: info.width, height: info.height, data };
}

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The tightest rectangle containing every pixel with alpha above `threshold`. */
export function alphaBounds(image: RawImage, threshold = 0): Bounds | null {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y++) {
    const row = y * image.width * 4;
    for (let x = 0; x < image.width; x++) {
      if ((image.data[row + x * 4 + 3] ?? 0) > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Rec. 709 relative luminance, 0-255.
 *
 * Used only to compare one region of an image against another, so the exact
 * coefficients matter less than using the same ones everywhere. Rec. 709 because
 * the assets are sRGB and that is sRGB's own luma.
 */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
