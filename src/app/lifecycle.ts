import { AUTOSAVE_INTERVAL_MS } from '@config/simulation';
import type { SaveService } from '@app/SaveService';

/**
 * Persistence lifecycle — Phase 14.
 *
 * Three triggers, from TECHNICAL_ARCHITECTURE §8.2: a thirty-second interval,
 * `visibilitychange` to hidden, and `pagehide`. The lifecycle writes are what
 * make `lastSeenAt` mean "when the player was last here" rather than "when the
 * interval last fired" — a tab closed twenty-nine seconds after the last
 * autosave would otherwise donate those seconds to the offline window.
 *
 * Writes are deliberately not queued or debounced beyond this: the interval is
 * the budget ("do not create excessive save writes"), and the two lifecycle
 * events are moments after which there may be no next chance. A failed write
 * logs and is retried by the next trigger; an exception escaping a
 * `visibilitychange` handler would be a crash in exchange for nothing.
 */
export function startPersistenceLifecycle(win: Window, saves: SaveService): () => void {
  let inFlight = false;

  const persist = (reason: string): void => {
    if (inFlight) return;
    inFlight = true;
    void saves
      .save()
      .catch((error: unknown) => {
        console.warn(`Autosave failed (${reason})`, error);
      })
      .finally(() => {
        inFlight = false;
      });
  };

  const interval = win.setInterval(() => {
    persist('interval');
  }, AUTOSAVE_INTERVAL_MS);

  const onVisibility = (): void => {
    if (win.document.visibilityState === 'hidden') persist('visibilitychange');
  };
  const onPageHide = (): void => {
    /*
     * Best effort, by nature: the browser may kill the process before an async
     * IndexedDB transaction commits. The visibilitychange write above fires
     * first in every real navigation and tab close, which is why the spec
     * recommends the pair rather than either alone.
     */
    persist('pagehide');
  };

  win.document.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);

  return () => {
    win.clearInterval(interval);
    win.document.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', onPageHide);
  };
}
