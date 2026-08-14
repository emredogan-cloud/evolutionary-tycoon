import { describe, expect, it } from 'vitest';
import { canonicalJson, checksumOf, crc32 } from '@persistence/checksum';

describe('crc32', () => {
  it('matches the published reference vectors', () => {
    // CRC-32/ISO-HDLC. Validated against known values rather than against
    // itself, so a lost reflection or a wrong polynomial cannot pass silently.
    expect(crc32('')).toBe('00000000');
    expect(crc32('a')).toBe('e8b7be43');
    expect(crc32('abc')).toBe('352441c2');
    expect(crc32('123456789')).toBe('cbf43926');
  });

  it('always returns eight lowercase hex characters', () => {
    for (let i = 0; i < 500; i++) {
      expect(crc32(`sample-${i}`)).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('changes when a single character changes', () => {
    expect(crc32('save-data-a')).not.toBe(crc32('save-data-b'));
  });

  it('detects truncation', () => {
    // The failure this exists for: a write interrupted by a tab kill or a
    // storage quota rejection.
    const full = '{"schemaVersion":1,"cash":100}';
    expect(crc32(full.slice(0, -5))).not.toBe(crc32(full));
  });

  it('handles non-ASCII input', () => {
    expect(crc32('müşteri')).toMatch(/^[0-9a-f]{8}$/);
    expect(crc32('müşteri')).not.toBe(crc32('musteri'));
  });
});

describe('canonicalJson', () => {
  it('sorts object keys so the digest depends on content, not insertion order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: 2, b: 1 })).toBe(canonicalJson({ b: 1, a: 2 }));
  });

  it('sorts nested objects too', () => {
    expect(canonicalJson({ outer: { z: 1, a: 2 } })).toBe('{"outer":{"a":2,"z":1}}');
  });

  it('preserves array order, which is meaningful', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it('round-trips through JSON.parse to the same string', () => {
    const original = { z: 1, a: { y: [1, 2], b: 'text' }, m: null, flag: true };
    const reparsed: unknown = JSON.parse(JSON.stringify(original));
    expect(canonicalJson(reparsed)).toBe(canonicalJson(original));
  });

  it('normalises values JSON cannot represent instead of emitting a hole', () => {
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson(() => undefined)).toBe('null');
    expect(canonicalJson(Symbol('x'))).toBe('null');
    expect(canonicalJson([undefined])).toBe('[null]');
  });

  it('drops undefined properties rather than writing them', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('handles primitives and null', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson('text')).toBe('"text"');
    expect(canonicalJson(true)).toBe('true');
  });
});

describe('checksumOf', () => {
  it('excludes the checksum field itself', () => {
    const body = { schemaVersion: 1, cash: 100 };
    const expected = crc32(canonicalJson(body));
    expect(checksumOf(body)).toBe(expected);
    expect(checksumOf({ ...body, checksum: 'anything' })).toBe(expected);
  });

  it('is stable regardless of field order', () => {
    expect(checksumOf({ a: 1, b: 2, checksum: 'x' })).toBe(checksumOf({ checksum: 'y', b: 2, a: 1 }));
  });

  it('changes when any other field changes', () => {
    const base = { schemaVersion: 1, cash: 100, checksum: 'x' };
    expect(checksumOf({ ...base, cash: 101 })).not.toBe(checksumOf(base));
  });

  it('distinguishes a number from its string form', () => {
    expect(checksumOf({ cash: 100 })).not.toBe(checksumOf({ cash: '100' }));
  });
});
