/**
 * Per-test budgets, sized for where the suite is pointed.
 *
 * Against localhost a fresh context reaches render-ready in under two
 * seconds; against the deployed CDN the same boot costs a measured 6–13 s
 * (fresh context, empty cache, real network), and the preview runner adds
 * SwiftShader and four-worker contention on top. The budgets below are the
 * local budgets — the numbers the assertions were written against — and an
 * external target doubles them, because a CDN round-trip world exists and
 * the watchdog has to include it. Same discipline as the readiness budgets
 * sized for a runner that decodes atlases the slow way: the assertions do
 * not change, the clock they run against tells the truth about the target.
 */
export function e2eBudget(localMs: number): number {
  return process.env['E2E_BASE_URL'] !== undefined ? localMs * 2 : localMs;
}
