/**
 * Bounds-safe reads for typed arrays.
 *
 * `noUncheckedIndexedAccess` types `float32Array[i]` as `number | undefined`,
 * which is correct — the index really can be out of range — but writing
 * `?? 0` at every one of the several dozen read sites in the stores spreads the
 * same unreachable branch everywhere and buries the two places where an
 * out-of-range read would be a genuine bug.
 *
 * One helper instead: a single branch, tested once, inlined by the engine.
 */

export type NumericArray = Float32Array | Int32Array | Uint8Array;

/** The element at `index`, or 0 when the index is outside the array. */
export function at(array: NumericArray, index: number): number {
  return array[index] ?? 0;
}
