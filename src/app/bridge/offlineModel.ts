/**
 * What the "Uzaktayken" report screen is allowed to know — Phase 14.
 *
 * Imports nothing, exactly like `hudModel.ts` and for the same reason: `src/ui`
 * may not reach the simulation, so the type it renders is declared as plain
 * data on the bridge, and the filling happens in `src/app`.
 */

export interface OfflineReportView {
  /** The full absence, for the headline — "7 saat 12 dakika uzaktaydın". */
  readonly awayMs: number;
  /** How much of it paid, after the 8 h cap (halved when unverified). */
  readonly creditedMs: number;
  readonly customersServed: number;
  readonly gross: number;
  readonly expenses: number;
  /** May be negative — expenses accrue offline by design. */
  readonly net: number;
  /** The limiting factor — the report's entire reason to exist. */
  readonly limiter: string;
  readonly limiterUtilization: number;
  /** Customers the limiter turned away during the credited window. */
  readonly turnedAway: number;
  /** True when the server could not be reached and the cap was halved. */
  readonly capHalved: boolean;
}
