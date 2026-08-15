import { describe, expect, it } from 'vitest';
import {
  abandonTargetFor,
  canTransition,
  customerStateName,
  customerStateSpec,
  isWaiting,
  CUSTOMER_STATES,
  CUSTOMER_STATE_SPECS,
  STATE_ABANDONING,
  STATE_ENTERING,
  STATE_GONE,
  STATE_LEAVING_ANGRY,
  STATE_QUEUEING_AT_COUNTER,
  STATE_SEEKING_PARKING,
  STATE_WALKING_TO_CAR,
} from '@sim/ai/fsm/customerFsm';

/**
 * Properties of the graph's *shape*, not of any one run.
 *
 * A deadlocked customer does not crash anything. It stands still forever while
 * the rest of the game keeps running, and it is found weeks later by someone
 * noticing the queue never shortens. Every check here is aimed at that failure,
 * and each is a property a `switch` statement could not have been asked about
 * — which is the entire reason the machine is declared as data.
 */

const START = STATE_ENTERING;

/** Every state reachable from `ENTERING` by following declared edges. */
function reachable(): Set<number> {
  const seen = new Set<number>([START]);
  const frontier = [START];
  while (frontier.length > 0) {
    const state = frontier.pop();
    if (state === undefined) continue;
    for (const next of customerStateSpec(state).to) {
      if (seen.has(next)) continue;
      seen.add(next);
      frontier.push(next);
    }
  }
  return seen;
}

/** Shortest path length from `from` to `to`, or -1. Breadth-first. */
function distance(from: number, to: number): number {
  if (from === to) return 0;
  const seen = new Set<number>([from]);
  let frontier = [from];
  let steps = 0;
  while (frontier.length > 0) {
    steps++;
    const next: number[] = [];
    for (const state of frontier) {
      for (const target of customerStateSpec(state).to) {
        if (target === to) return steps;
        if (seen.has(target)) continue;
        seen.add(target);
        next.push(target);
      }
    }
    frontier = next;
  }
  return -1;
}

describe('customer state machine — shape', () => {
  it('names every state exactly once', () => {
    // The index is what the record stores and what the world hash digests, so a
    // duplicate name means two states share meaning and a reordering is silent.
    const names = CUSTOMER_STATE_SPECS.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([...CUSTOMER_STATES]);
  });

  it('has no unreachable state', () => {
    const seen = reachable();
    const orphans = CUSTOMER_STATE_SPECS.map((spec, index) => ({ spec, index }))
      .filter((entry) => !seen.has(entry.index))
      .map((entry) => entry.spec.name);
    expect(orphans, 'unreachable from ENTERING').toEqual([]);
  });

  it('has exactly one terminal state, and it is GONE', () => {
    const terminal = CUSTOMER_STATE_SPECS.map((spec, index) => ({ spec, index })).filter(
      (entry) => entry.spec.to.length === 0,
    );
    expect(terminal.map((entry) => entry.spec.name)).toEqual(['GONE']);
    expect(terminal[0]?.index).toBe(STATE_GONE);
  });

  it('lets every state reach the terminal state', () => {
    /*
     * The real anti-deadlock property. "Every state has an exit" is weaker than
     * it sounds — two states pointing at each other satisfy it and trap the
     * customer between them forever.
     */
    for (let state = 0; state < CUSTOMER_STATE_SPECS.length; state++) {
      expect(
        distance(state, STATE_GONE),
        `${customerStateName(state)} cannot reach GONE`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives every waiting state an exit to ABANDONING', () => {
    // GAME_EXECUTION_ROADMAP Phase 6: patience must be able to end any wait.
    for (let state = 0; state < CUSTOMER_STATE_SPECS.length; state++) {
      if (!isWaiting(state)) continue;
      expect(
        customerStateSpec(state).to.includes(STATE_ABANDONING),
        `${customerStateName(state)} waits but cannot abandon`,
      ).toBe(true);
    }
  });

  it('has at least one waiting state, so the check above is not vacuous', () => {
    const waiting = CUSTOMER_STATE_SPECS.filter((spec) => spec.patienceSeconds !== null);
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting.map((spec) => spec.name)).toContain('QUEUEING_AT_COUNTER');
    // And every one of them grants a real amount of it. A waiting state with a
    // patience of zero abandons on the tick it is entered, which is what
    // `SEEKING_PARKING` did before the duration moved onto the spec.
    for (const spec of waiting) {
      expect(spec.patienceSeconds, spec.name).toBeGreaterThan(0);
    }
  });

  it('never declares a self-transition', () => {
    // A state that can move to itself passes every reachability check while
    // making no progress, which is a deadlock the other tests cannot see.
    for (let state = 0; state < CUSTOMER_STATE_SPECS.length; state++) {
      expect(customerStateSpec(state).to, customerStateName(state)).not.toContain(state);
    }
  });

  it('declares no duplicate edges', () => {
    for (const spec of CUSTOMER_STATE_SPECS) {
      expect(new Set(spec.to).size, spec.name).toBe(spec.to.length);
    }
  });

  it('points every edge at a real state', () => {
    for (const spec of CUSTOMER_STATE_SPECS) {
      for (const target of spec.to) {
        expect(target, `${spec.name} -> ${String(target)}`).toBeLessThan(CUSTOMER_STATE_SPECS.length);
        expect(target).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('refuses an unknown state loudly', () => {
    expect(() => customerStateSpec(99)).toThrow(/Unknown customer state/);
    expect(() => customerStateSpec(-1)).toThrow(/Unknown customer state/);
  });
});

describe('customer state machine — transitions', () => {
  it('accepts only declared edges', () => {
    expect(canTransition(STATE_ENTERING, STATE_SEEKING_PARKING)).toBe(true);
    // Skipping the walk to the counter would be teleportation, which
    // GAME_DESIGN_DOCUMENT §8 forbids outright.
    expect(canTransition(STATE_ENTERING, STATE_QUEUEING_AT_COUNTER)).toBe(false);
    expect(canTransition(STATE_GONE, STATE_ENTERING)).toBe(false);
  });

  it('sends someone who gave up in a car straight to leaving, and someone on foot back to it', () => {
    /*
     * The one piece of information `ABANDONING` cannot carry itself: it is
     * reached both from a queue on foot and from a car that never found a bay.
     */
    expect(abandonTargetFor(STATE_SEEKING_PARKING)).toBe(STATE_LEAVING_ANGRY);
    expect(abandonTargetFor(STATE_QUEUEING_AT_COUNTER)).toBe(STATE_WALKING_TO_CAR);
  });

  it('declares both abandon targets as edges out of ABANDONING', () => {
    // Otherwise `abandonTargetFor` names a move the graph would refuse, and the
    // guard in `CustomerFsmSystem.transition` would throw at runtime instead.
    for (const state of [STATE_SEEKING_PARKING, STATE_QUEUEING_AT_COUNTER]) {
      expect(canTransition(STATE_ABANDONING, abandonTargetFor(state))).toBe(true);
    }
  });

  it('keeps every in-vehicle state out of the walking half of the graph', () => {
    /*
     * `alwaysInVehicle` drives nothing at runtime — the record's own `visible`
     * flag does — so it is only worth declaring if it stays true. A state marked
     * in-vehicle that could be reached on foot would make `abandonTargetFor`
     * send someone to walk back to a car they are already sitting in.
     */
    const onFoot = new Set([STATE_WALKING_TO_CAR, STATE_QUEUEING_AT_COUNTER]);
    for (const state of onFoot) {
      expect(customerStateSpec(state).alwaysInVehicle, customerStateName(state)).toBe(false);
    }
  });
});
