/**
 * Euclidean length, engine-portable — Phase 17.
 *
 * `Math.sqrt` is IEEE-754 correctly rounded, so `sqrt(dx*dx + dy*dy)` is
 * bit-identical on every engine. `Math.hypot` is NOT required to be correctly
 * rounded, and V8 and SpiderMonkey genuinely differ in last-place bits — which
 * put a customer's stride a ULP apart per step and, by tick ~450 of a daylight
 * boot, a different world digest in Firefox than in Node (the P17 hunt;
 * PHASE_17_REPORT §3.1). The midnight boot's empty first hour had been hiding
 * it since Phase 7.
 *
 * The overflow protection hypot buys matters near 1e150; world coordinates
 * live under 1e3. Every `src/sim` distance goes through here so the property
 * is a rule, not a habit — `no-restricted-properties` bans `Math.hypot` in
 * the sim tree.
 */
export function euclidean(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}
