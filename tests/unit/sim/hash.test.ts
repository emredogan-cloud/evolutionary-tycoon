import { describe, expect, it } from 'vitest';
import { Hasher, hashString, seedWordsFromString } from '@sim/math/hash';

/**
 * The digest is the instrument every determinism claim is measured with, so it
 * is validated against the published FNV-1a 64 vectors rather than against
 * itself. If the arithmetic were subtly wrong — a lost carry, a truncated limb —
 * the determinism suite would still pass while detecting far less than it claims.
 */
function hashAsciiBytes(text: string): string {
  const hasher = new Hasher();
  for (let i = 0; i < text.length; i++) {
    hasher.writeU8(text.charCodeAt(i));
  }
  return hasher.digest();
}

describe('Hasher — FNV-1a 64', () => {
  it('reproduces the published reference vectors', () => {
    expect(hashAsciiBytes('')).toBe('cbf29ce484222325');
    expect(hashAsciiBytes('a')).toBe('af63dc4c8601ec8c');
    expect(hashAsciiBytes('b')).toBe('af63df4c8601f1a5');
    expect(hashAsciiBytes('c')).toBe('af63de4c8601eff2');
    expect(hashAsciiBytes('foobar')).toBe('85944171f73967e8');
  });

  it('always produces sixteen lowercase hex characters', () => {
    for (let i = 0; i < 200; i++) {
      const digest = new Hasher()
        .writeU32(i)
        .writeF64(i / 7)
        .digest();
      expect(digest).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('reset returns the hasher to the offset basis', () => {
    const hasher = new Hasher();
    hasher.writeString('some state');
    expect(hasher.reset().digest()).toBe('cbf29ce484222325');
  });

  it('distinguishes -0 from +0', () => {
    // Deliberate: two runs that disagree about the sign of zero disagree about
    // something, and noticing that is the entire job of this digest.
    const positive = new Hasher().writeF64(0).digest();
    const negative = new Hasher().writeF64(-0).digest();
    expect(positive).not.toBe(negative);
  });

  it('distinguishes values that differ in the last representable bit', () => {
    const a = new Hasher().writeF64(0.1 + 0.2).digest();
    const b = new Hasher().writeF64(0.3).digest();
    expect(a).not.toBe(b);
  });

  it('is order sensitive', () => {
    const ab = new Hasher().writeU32(1).writeU32(2).digest();
    const ba = new Hasher().writeU32(2).writeU32(1).digest();
    expect(ab).not.toBe(ba);
  });

  it('length-prefixes strings so concatenations do not collide', () => {
    const split = new Hasher().writeString('ab').writeString('c').digest();
    const joined = new Hasher().writeString('a').writeString('bc').digest();
    expect(split).not.toBe(joined);
  });

  it('hashes typed arrays up to the given live count only', () => {
    const values = new Float32Array([1, 2, 999]);
    const twoOfThree = new Hasher().writeF32Array(values, 2).digest();
    values[2] = -999;
    expect(new Hasher().writeF32Array(values, 2).digest()).toBe(twoOfThree);
  });

  it('hashes u8 and i32 arrays element-wise', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const ints = new Int32Array([-1, 0, 1]);
    const first = new Hasher().writeU8Array(bytes, 3).writeI32Array(ints, 3).digest();
    const second = new Hasher().writeU8Array(bytes, 3).writeI32Array(ints, 3).digest();
    expect(first).toBe(second);
    expect(new Hasher().writeU8Array(bytes, 2).writeI32Array(ints, 3).digest()).not.toBe(first);
  });

  it('encodes booleans distinguishably', () => {
    expect(new Hasher().writeBool(true).digest()).not.toBe(new Hasher().writeBool(false).digest());
  });

  it('treats writeI32 as the signed view of writeU32', () => {
    expect(new Hasher().writeI32(-1).digest()).toBe(new Hasher().writeU32(0xffffffff).digest());
  });

  it('handles the full UTF-16 range including surrogate pairs', () => {
    const emoji = new Hasher().writeString('🚗').digest();
    expect(emoji).toMatch(/^[0-9a-f]{16}$/);
    expect(emoji).not.toBe(new Hasher().writeString('🚙').digest());
  });
});

describe('hashString and seedWordsFromString', () => {
  it('is stable for the same input', () => {
    expect(hashString('traffic')).toBe(hashString('traffic'));
  });

  it('separates inputs that differ only in the last character', () => {
    expect(hashString('42:traffic')).not.toBe(hashString('42:traffi3'));
  });

  it('derives two unsigned 32-bit words from the digest', () => {
    const [high, low] = seedWordsFromString('42:customer');
    expect(Number.isInteger(high)).toBe(true);
    expect(Number.isInteger(low)).toBe(true);
    expect(high).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(0xffffffff);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(low).toBeLessThanOrEqual(0xffffffff);
  });
});
