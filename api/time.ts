/**
 * Server-time reference.
 *
 * This is the entire backend. Offline progression (Phase 14) needs a source of
 * truth for wall-clock time so that moving the system clock forward cannot mint
 * rewards. The payload is the platform-provided `Date` response header; the body
 * is deliberately empty.
 *
 * Deliberately NOT a general API. See docs/TECHNICAL_ARCHITECTURE.md §10.
 */
export function GET(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      // Any caching at all would defeat the purpose: a cached Date header is a
      // stale Date header.
      'Cache-Control': 'no-store, max-age=0',
      'Timing-Allow-Origin': '*',
    },
  });
}
