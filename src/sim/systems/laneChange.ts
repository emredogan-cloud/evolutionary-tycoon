/**
 * Discretionary lane-change gap acceptance — Phase 15's decision layer over
 * the follower model (roadmap: "IDM'e ek bir karar katmanı (boşluk kontrolü)").
 *
 * ## Why this ships as a pure function and not a live behaviour
 *
 * A discretionary change needs a same-direction lane pair, and the approved
 * road — `SHARED_ROAD`, every stage — is one lane each way. That is a fact
 * about the authored world, not about this logic; the decision layer is real,
 * deterministic and tested, and wiring it into `VehicleMotionSystem` is a
 * one-call change on the day a multi-lane road exists (a decision that
 * belongs to the road's owner, being entangled with the traffic-density
 * question PROJECT_MEMORY carries). Recorded in PHASE_15_REPORT §NOT RUN
 * rather than silently absorbed or silently faked.
 *
 * The model is MOBIL's spirit reduced to what the IDM here exposes: change
 * when the target lane offers a real speed advantage, both gaps accept, and
 * the follower you cut in front of is not forced into an emergency stop.
 */

export interface LaneChangeContext {
  /** Ego speed, m/s, and how far below desire it is being held. */
  readonly speed: number;
  readonly desiredSpeed: number;
  /** Gap to the current-lane leader, metres (Infinity for none). */
  readonly currentLeadGap: number;
  /** Gaps in the target lane, metres (Infinity for none). */
  readonly targetLeadGap: number;
  readonly targetLagGap: number;
  /** Speeds of the target-lane pair, m/s. */
  readonly targetLeadSpeed: number;
  readonly targetLagSpeed: number;
}

/** Tunables, exported for the tests that probe the boundary. */
export const LANE_CHANGE = {
  /** Held below this fraction of desire before a change is even considered. */
  frustrationThreshold: 0.7,
  /** The current leader must be this close to matter, metres. */
  followingWithinMetres: 30,
  /** Minimum acceptable gaps, metres. */
  minLeadGapMetres: 8,
  minLagGapMetres: 6,
  /**
   * The lag driver must not need more than this to avoid the ego, m/s² —
   * MOBIL's safety criterion with the same brake ceiling the IDM uses.
   */
  maxImposedDecel: 2.5,
  /** The target must actually be faster: lead speed advantage, m/s. */
  minSpeedAdvantage: 1.5,
} as const;

/** One decision. Pure; the caller owns hysteresis (see `LEFT_TURN`'s shape). */
export function shouldChangeLane(context: LaneChangeContext): boolean {
  const {
    speed,
    desiredSpeed,
    currentLeadGap,
    targetLeadGap,
    targetLagGap,
    targetLeadSpeed,
    targetLagSpeed,
  } = context;

  // Not frustrated: no reason to move.
  if (speed >= desiredSpeed * LANE_CHANGE.frustrationThreshold) return false;
  if (currentLeadGap > LANE_CHANGE.followingWithinMetres) return false;

  // The physical gaps must exist…
  if (targetLeadGap < LANE_CHANGE.minLeadGapMetres) return false;
  if (targetLagGap < LANE_CHANGE.minLagGapMetres) return false;

  // …the lane must actually be better…
  if (targetLeadSpeed - speed < LANE_CHANGE.minSpeedAdvantage && Number.isFinite(targetLeadGap)) {
    return false;
  }

  // …and the driver being cut in front of must not be forced to slam on.
  const closingSpeed = Math.max(0, targetLagSpeed - speed);
  if (closingSpeed > 0) {
    const requiredDecel = (closingSpeed * closingSpeed) / (2 * Math.max(0.5, targetLagGap));
    if (requiredDecel > LANE_CHANGE.maxImposedDecel) return false;
  }

  return true;
}

/**
 * Anti-oscillation companion: a change is only worth making if it would not
 * immediately reverse. The caller asks both directions; a pair that both say
 * "yes" is a ping-pong and neither happens. Exported so the no-oscillation
 * property is testable as arithmetic rather than as a soak.
 */
export function wouldOscillate(forward: LaneChangeContext, reverse: LaneChangeContext): boolean {
  return shouldChangeLane(forward) && shouldChangeLane(reverse);
}
