import { describe, expect, it } from 'vitest';
import { at } from '@sim/math/typedArray';

describe('at', () => {
  it('reads elements from every numeric array kind', () => {
    expect(at(new Float32Array([1.5, 2.5]), 1)).toBe(2.5);
    expect(at(new Int32Array([-7, 7]), 0)).toBe(-7);
    expect(at(new Uint8Array([3, 4]), 1)).toBe(4);
  });

  it('returns zero for an index outside the array', () => {
    // The one branch that replaces several dozen `?? 0` fallbacks across the
    // stores. It is unreachable from the stores themselves — every caller there
    // has already bounds-checked — so it is proven here instead.
    const values = new Float32Array([1]);
    expect(at(values, 1)).toBe(0);
    expect(at(values, -1)).toBe(0);
    expect(at(values, 1_000)).toBe(0);
  });

  it('does not confuse a stored zero with an out-of-range read', () => {
    expect(at(new Int32Array([0]), 0)).toBe(0);
  });
});
