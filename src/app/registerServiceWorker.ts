/**
 * Service-worker registration — Phase 14.
 *
 * Ten lines by hand instead of `virtual:pwa-register`, deliberately: the CSP
 * is `script-src 'self'` with no eval and no third-party origins, and the
 * registration path is the one place a helper library would add runtime code
 * this project cannot audit line-by-line. The worker itself is generated at
 * build time by vite-plugin-pwa (workbox precache, runtime inlined); dev
 * builds have no worker and this function quietly does nothing there.
 *
 * `updateViaCache: 'none'` + workbox's `skipWaiting`/`clientsClaim` is the
 * roadmap's update strategy: the *worker script* is always revalidated, so a
 * new deployment replaces the cache on the next visit rather than being
 * pinned behind its own old cache forever.
 */
export function registerServiceWorker(win: Window): void {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in win.navigator)) return;

  const register = (): void => {
    win.navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch((error: unknown) => {
      // A blocked or failed registration costs the second-visit bandwidth win,
      // nothing else. The game must not care.
      console.warn('Service worker registration failed', error);
    });
  };

  /*
   * The call arrives late in an async boot, and `load` has usually fired by
   * then — a listener added after the event runs never. Checked rather than
   * assumed, because the first draft assumed and registered exactly nothing.
   */
  if (win.document.readyState === 'complete') {
    register();
  } else {
    win.addEventListener('load', register, { once: true });
  }
}
