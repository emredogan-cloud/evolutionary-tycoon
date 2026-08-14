/**
 * FNV-1a, 64-bit — the digest behind `World.hash()`.
 *
 * Why not a one-liner over `JSON.stringify(world)`: object key order in JSON is
 * an implementation detail, typed arrays serialise as objects, and `-0`, `NaN`
 * and denormals do not survive. The determinism suite has to detect a one-bit
 * divergence in a Float32Array after 10 000 ticks, so the digest is fed raw
 * IEEE-754 bytes in an order the caller controls.
 *
 * 64 bits are computed as four 16-bit limbs because JavaScript's `*` loses
 * precision above 2^53 and `Math.imul` only gives the low 32 bits. Every partial
 * product here stays below 2^26, so the arithmetic is exact.
 */

import { at } from './typedArray';

/** 0xcbf29ce484222325, low limb first. */
const OFFSET_BASIS: readonly [number, number, number, number] = [0x2325, 0x8422, 0x9ce4, 0xcbf2];

/** 0x00000100000001b3, low limb first. Limbs 1 and 3 are zero and are folded away below. */
const PRIME_L0 = 0x01b3;
const PRIME_L2 = 0x0100;

const LIMB_MASK = 0xffff;
const LIMB_SIZE = 0x10000;

export class Hasher {
  private l0 = OFFSET_BASIS[0];
  private l1 = OFFSET_BASIS[1];
  private l2 = OFFSET_BASIS[2];
  private l3 = OFFSET_BASIS[3];

  /**
   * Scratch space for float and integer decomposition.
   *
   * Allocated once per Hasher and reused, so hashing is allocation-free after
   * construction — `World.hash()` is called inside the benchmark loop that
   * asserts zero steady-state allocation.
   */
  private readonly scratch = new DataView(new ArrayBuffer(8));

  reset(): this {
    this.l0 = OFFSET_BASIS[0];
    this.l1 = OFFSET_BASIS[1];
    this.l2 = OFFSET_BASIS[2];
    this.l3 = OFFSET_BASIS[3];
    return this;
  }

  /** FNV-1a core: XOR the byte into the low limb, then multiply by the prime mod 2^64. */
  writeU8(byte: number): this {
    const h0 = (this.l0 ^ (byte & 0xff)) & LIMB_MASK;
    const h1 = this.l1;
    const h2 = this.l2;
    const h3 = this.l3;

    // 64x64 multiply, keeping only the low 64 bits. PRIME_L1 and PRIME_L3 are
    // zero, so the four cross terms they would contribute vanish.
    let acc = h0 * PRIME_L0;
    this.l0 = acc & LIMB_MASK;

    acc = h1 * PRIME_L0 + Math.floor(acc / LIMB_SIZE);
    this.l1 = acc & LIMB_MASK;

    acc = h2 * PRIME_L0 + h0 * PRIME_L2 + Math.floor(acc / LIMB_SIZE);
    this.l2 = acc & LIMB_MASK;

    acc = h3 * PRIME_L0 + h1 * PRIME_L2 + Math.floor(acc / LIMB_SIZE);
    this.l3 = acc & LIMB_MASK;

    return this;
  }

  /** Little-endian, so the byte order does not depend on the host. */
  writeU32(value: number): this {
    this.scratch.setUint32(0, value >>> 0, true);
    this.writeU8(this.scratch.getUint8(0));
    this.writeU8(this.scratch.getUint8(1));
    this.writeU8(this.scratch.getUint8(2));
    this.writeU8(this.scratch.getUint8(3));
    return this;
  }

  writeI32(value: number): this {
    return this.writeU32(value | 0);
  }

  writeBool(value: boolean): this {
    return this.writeU8(value ? 1 : 0);
  }

  /**
   * Raw IEEE-754 bits — `-0` and `+0` therefore hash differently, and every NaN
   * payload is distinguishable.
   *
   * That is deliberate. Two runs that disagree about the sign of zero disagree
   * about something, and the entire point of this digest is to notice.
   */
  writeF64(value: number): this {
    this.scratch.setFloat64(0, value, true);
    for (let i = 0; i < 8; i++) {
      this.writeU8(this.scratch.getUint8(i));
    }
    return this;
  }

  /** UTF-16 code units, low byte first. Independent of any encoder. */
  writeString(value: string): this {
    this.writeU32(value.length);
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i);
      this.writeU8(unit & 0xff);
      this.writeU8(unit >>> 8);
    }
    return this;
  }

  writeF32Array(values: Float32Array, count: number): this {
    for (let i = 0; i < count; i++) {
      // Float32Array reads widen to double losslessly, so the f64 path is exact here.
      this.writeF64(at(values, i));
    }
    return this;
  }

  writeU8Array(values: Uint8Array, count: number): this {
    for (let i = 0; i < count; i++) {
      this.writeU8(at(values, i));
    }
    return this;
  }

  writeI32Array(values: Int32Array, count: number): this {
    for (let i = 0; i < count; i++) {
      this.writeI32(at(values, i));
    }
    return this;
  }

  /** 16 lowercase hex characters, most significant limb first. */
  digest(): string {
    return (
      this.l3.toString(16).padStart(4, '0') +
      this.l2.toString(16).padStart(4, '0') +
      this.l1.toString(16).padStart(4, '0') +
      this.l0.toString(16).padStart(4, '0')
    );
  }
}

/** Convenience for one-off hashing of a string (seed derivation, tests). */
export function hashString(value: string): string {
  return new Hasher().writeString(value).digest();
}

/**
 * Two 32-bit words derived from a string, used to seed RNG streams.
 *
 * Returning both halves of the digest rather than one keeps two streams whose
 * names differ only in a late character from starting close together.
 */
export function seedWordsFromString(value: string): readonly [number, number] {
  const digest = hashString(value);
  return [Number.parseInt(digest.slice(0, 8), 16) >>> 0, Number.parseInt(digest.slice(8, 16), 16) >>> 0];
}
