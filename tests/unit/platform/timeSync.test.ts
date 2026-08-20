import { describe, expect, it, vi } from 'vitest';
import { TIME_ENDPOINT, syncServerTime } from '@platform/timeSync';

/**
 * The server-time question — Phase 14. The *decision* about what the answer
 * means lives in `decideElapsed` and is tested there; this suite covers the
 * asking: header parsing, failure shapes, and the no-store discipline.
 */

const SERVER_DATE = 'Tue, 20 Aug 2026 07:00:00 GMT';
const SERVER_MS = Date.parse(SERVER_DATE);

function fetchReturning(response: Response): typeof fetch {
  return vi.fn(() => Promise.resolve(response));
}

describe('syncServerTime', () => {
  it('reads the Date header and reports the offset against the local clock', async () => {
    const response = new Response(null, { status: 204, headers: { date: SERVER_DATE } });
    const result = await syncServerTime(fetchReturning(response), () => SERVER_MS - 120_000);
    expect(result.serverNowMs).toBe(SERVER_MS);
    expect(result.offsetMs).toBe(120_000);
  });

  it('asks with no-store — a cached Date header is a stale Date header', async () => {
    const spy = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 204, headers: { date: SERVER_DATE } })),
    );
    await syncServerTime(spy, () => SERVER_MS);
    expect(spy).toHaveBeenCalledWith(
      TIME_ENDPOINT,
      expect.objectContaining({ cache: 'no-store', method: 'GET' }),
    );
  });

  it('a 404 — vite preview has no functions — is a normal unsynced boot', async () => {
    const result = await syncServerTime(
      fetchReturning(new Response('not found', { status: 404 })),
      () => SERVER_MS,
    );
    expect(result.serverNowMs).toBeNull();
    expect(result.offsetMs).toBeNull();
  });

  it('a missing or unparseable Date header is an unsynced boot, not a crash', async () => {
    const noHeader = await syncServerTime(
      fetchReturning(new Response(null, { status: 204 })),
      () => SERVER_MS,
    );
    expect(noHeader.serverNowMs).toBeNull();

    const garbage = await syncServerTime(
      fetchReturning(new Response(null, { status: 204, headers: { date: 'yesterdayish' } })),
      () => SERVER_MS,
    );
    expect(garbage.serverNowMs).toBeNull();
  });

  it('a network failure is an unsynced boot, not a crash', async () => {
    const failing = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    const result = await syncServerTime(failing, () => SERVER_MS);
    expect(result.serverNowMs).toBeNull();
    expect(result.offsetMs).toBeNull();
  });
});
