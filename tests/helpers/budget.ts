/**
 * Per-test budgets, sized for the cost the project has already accepted.
 *
 * Two documented facts set these numbers. First: P15's calendar made a sim
 * tick ~37% dearer, the bench baseline was re-recorded for it under the §11
 * discipline — but the e2e watchdogs, which time exactly those sim loops on
 * runner hardware, were never resized. The green run at 315bf6d shows where
 * that left them: 29.5 s and 31.9 s tests against 30 s and thirty-second
 * margins on a 1.8 m test against 2.0 m — passing by lottery, failing on the
 * next runner draw with zero code change. The local base budgets below give
 * the worst observed green duration ~50% headroom.
 *
 * Second: against the deployed CDN a fresh context pays a measured 6–13 s
 * network boot that localhost never sees, plus SwiftShader and four-worker
 * contention — so an external target doubles the base. Same recorded
 * discipline as the readiness budgets sized for a runner that decodes
 * atlases the slow way: not one assertion changes, the clock they run
 * against tells the truth about where they run.
 */
export function e2eBudget(localMs: number): number {
  return process.env['E2E_BASE_URL'] !== undefined ? localMs * 2 : localMs;
}
