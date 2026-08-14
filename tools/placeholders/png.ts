import { deflateSync } from 'node:zlib';

/**
 * A minimal, deterministic PNG encoder.
 *
 * Written rather than pulled in because the alternative is a dependency for
 * about eighty lines, and because Phase 4's asset pipeline has to prove that the
 * same source produces byte-identical output — which is far easier to guarantee
 * when the encoder is ours and takes no options. Fixed 8-bit RGBA, filter type
 * 0 on every scanline, one IDAT chunk.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable !== null) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) !== 0 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32Bytes(bytes: Buffer): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  // Indexed: `for-of` over a Buffer allocates an iterator, and this runs once
  // per byte of every generated image.
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ (table[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32Bytes(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** A mutable RGBA canvas. Origin is top-left; out-of-range writes are ignored. */
export class PixelCanvas {
  readonly width: number;
  readonly height: number;
  private readonly pixels: Uint8Array;

  constructor(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new RangeError('PixelCanvas needs positive dimensions');
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height * 4);
  }

  set(x: number, y: number, colour: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const offset = (y * this.width + x) * 4;
    this.pixels[offset] = colour.r;
    this.pixels[offset + 1] = colour.g;
    this.pixels[offset + 2] = colour.b;
    this.pixels[offset + 3] = colour.a;
  }

  fillRect(x: number, y: number, width: number, height: number, colour: Rgba): void {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) this.set(x + dx, y + dy, colour);
    }
  }

  /** Encode as PNG. Deterministic for the same pixels. */
  encode(): Buffer {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr.writeUInt8(8, 8); // bit depth
    ihdr.writeUInt8(6, 9); // colour type: RGBA
    ihdr.writeUInt8(0, 10); // deflate
    ihdr.writeUInt8(0, 11); // adaptive filtering
    ihdr.writeUInt8(0, 12); // no interlace

    // Filter byte 0 (None) per scanline. Filtering would shrink the file, but
    // these are placeholders and a predictable encoder is worth more than bytes.
    const stride = this.width * 4;
    const raw = Buffer.alloc((stride + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      raw[y * (stride + 1)] = 0;
      Buffer.from(this.pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
    }

    return Buffer.concat([
      SIGNATURE,
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}
