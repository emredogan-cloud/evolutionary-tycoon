/**
 * Server-time reference — GAME_EXECUTION_ROADMAP Phase 14, TECHNICAL_ARCHITECTURE §10.
 *
 * `/api/time` is the entire backend: a 204 whose `Date` header is the payload.
 * This module asks the question and reports what it heard; *deciding* what the
 * answer means for the offline window is `decideElapsed` in the simulation,
 * where it can be unit-tested against every clock-abuse scenario without a
 * network in sight.
 *
 * Failure is a result, not an exception. A player behind a captive portal, an
 * ad-blocker or no network at all is a normal Tuesday, and the design already
 * says what it costs them: the offline cap halves (GDD §17.3). Nothing here
 * may ever block boot for long — hence the timeout.
 */

export interface TimeSyncResult {
  /** The server's clock, or null when it could not be asked. */
  readonly serverNowMs: number | null;
  /** `serverNowMs − Date.now()` at the moment of the answer. Null when unsynced. */
  readonly offsetMs: number | null;
}

export const TIME_ENDPOINT = '/api/time';

/** Long enough for a slow mobile handshake, short enough not to gate boot. */
const TIME_SYNC_TIMEOUT_MS = 3000;

/**
 * The `Date` header has one-second resolution and one round trip of skew.
 *
 * Neither matters: the tolerance this feeds is five minutes. What matters is
 * `cache: 'no-store'` — a cached Date header is a stale Date header, and the
 * endpoint sets the same directive from its side.
 */
export async function syncServerTime(fetchFn: typeof fetch, nowMs: () => number): Promise<TimeSyncResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, TIME_SYNC_TIMEOUT_MS);

    const response = await fetchFn(TIME_ENDPOINT, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);

    // 404 on `vite preview`, 502 from a broken function — same answer as no
    // network: the server did not vouch for the time.
    if (!response.ok && response.status !== 204) return { serverNowMs: null, offsetMs: null };

    const header = response.headers.get('date');
    if (header === null) return { serverNowMs: null, offsetMs: null };

    const parsed = Date.parse(header);
    if (Number.isNaN(parsed)) return { serverNowMs: null, offsetMs: null };

    return { serverNowMs: parsed, offsetMs: parsed - nowMs() };
  } catch {
    return { serverNowMs: null, offsetMs: null };
  }
}
