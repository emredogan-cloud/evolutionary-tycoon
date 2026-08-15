import { HOURS_PER_GAME_DAY, MS_PER_GAME_DAY } from '@config/simulation';

/**
 * Simulation time.
 *
 * Accumulates from ticks and nothing else. Wall-clock reads (`Date.now`,
 * `performance.now`) are banned in `src/sim` by ESLint, which is what lets a
 * twelve-hour play session be simulated in 200 ms of test time and lets a bug
 * report reproduce from a seed alone.
 *
 * The wall clock still exists — it lives in `src/app` (frame pacing) and
 * `src/persistence` (save timestamps, offline earnings). It never crosses in here.
 */
export interface ClockState {
  readonly simTimeMs: number;
}

export class Clock {
  private ms = 0;

  constructor(state?: ClockState) {
    if (state !== undefined) this.ms = state.simTimeMs;
  }

  get simTimeMs(): number {
    return this.ms;
  }

  /**
   * Real milliseconds in one game day.
   *
   * Exposed so systems can convert an arbitrary sim time to an hour without
   * mutating the clock — the spawn process needs the hour of a *future*
   * candidate arrival, not of now.
   */
  get msPerGameDay(): number {
    return MS_PER_GAME_DAY;
  }

  /** Whole in-game days elapsed. Day 0 is the first day. */
  get gameDay(): number {
    return Math.floor(this.ms / MS_PER_GAME_DAY);
  }

  /** Hour within the current day as a float in [0, 24). */
  get gameHour(): number {
    const withinDay = this.ms - this.gameDay * MS_PER_GAME_DAY;
    return (withinDay / MS_PER_GAME_DAY) * HOURS_PER_GAME_DAY;
  }

  /**
   * Advance by one tick's worth of simulation time.
   *
   * Returns true when the day rolled over, so the caller can emit a day event
   * without recomputing the boundary.
   */
  advance(deltaMs: number): boolean {
    const dayBefore = this.gameDay;
    this.ms += deltaMs;
    return this.gameDay !== dayBefore;
  }

  saveState(): ClockState {
    return { simTimeMs: this.ms };
  }

  setState(state: ClockState): void {
    this.ms = state.simTimeMs;
  }

  reset(): void {
    this.ms = 0;
  }
}
