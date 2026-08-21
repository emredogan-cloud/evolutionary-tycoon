/**
 * Combine same-category effects so they cannot be stacked into nonsense.
 *
 *   combined = 1 − Π(1 − effectᵢ × categoryWeight)
 *
 * ECONOMY_DESIGN §6.2, and it exists **before the exploit it prevents is
 * reachable**. Today no two of the six upgrades share a category, so every call
 * has one term and the result equals its input. That is exactly when to write
 * it: the Phase 13 tree adds the second contributor to a category, and by then
 * the combining rule is load-bearing, tested, and nobody has to remember it.
 *
 * ## What it prevents (exploit E4)
 *
 * Five separate +20% conversion effects multiplied together give ×2.49 — enough
 * to convert half the road and break the demand ceiling that three of
 * ECONOMY_DESIGN §7's five structural brakes depend on. Through this function
 * they give **+67%**, and no number of further +20%s ever reaches +100%: each
 * one closes a fraction of the remaining gap rather than scaling what is
 * already there.
 *
 * The property is structural, not a clamp. A clamp would silently discard the
 * sixth upgrade's effect and leave the player buying something that does
 * nothing; this leaves every purchase worth *something*, just less than the one
 * before — which is the diminishing return the design asks for.
 */
export function combineDiminishing(effects: readonly number[], categoryWeight = 1): number {
  let remaining = 1;
  for (const effect of effects) {
    /*
     * A negative effect is a penalty and combines the same way — `1 - (-0.2)`
     * is 1.2, so `remaining` grows and the combined total goes negative. That is
     * the correct behaviour and it is not clamped here: clamping belongs at the
     * point of use, where the caller knows whether a negative multiplier means
     * "worse" or "impossible".
     */
    remaining *= 1 - effect * categoryWeight;
  }
  return 1 - remaining;
}
