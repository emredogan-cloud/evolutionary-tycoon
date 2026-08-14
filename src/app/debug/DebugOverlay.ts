import type { GameLoop } from '@app/GameLoop';
import type { Sim } from '@sim/core/Sim';

/**
 * Development read-out: tick, simulation time, entity counts and the world hash.
 *
 * The world hash on screen is the point. When a replay diverges, the first
 * question is always "at which tick did the two runs stop agreeing", and having
 * the digest visible while playing turns that from an afternoon into a minute.
 *
 * Plain DOM rather than a Svelte component: this must not appear in the
 * production bundle at all, and a `.svelte` import would be pulled into the UI
 * chunk before any dead-code pass could reach it.
 */

/**
 * Whether the overlay should exist in this build.
 *
 * Both operands are statically replaced by Vite, so a production build with
 * `VITE_DEBUG_PANEL` unset evaluates this to `false` at compile time and the
 * whole module is dropped from the bundle.
 */
export function debugOverlayEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DEBUG_PANEL === '1';
}

const REFRESH_INTERVAL_MS = 250;

export class DebugOverlay {
  private readonly element: HTMLElement;
  private readonly sim: Sim;
  private readonly loop: GameLoop;
  private timer: number | null = null;

  constructor(doc: Document, sim: Sim, loop: GameLoop) {
    this.sim = sim;
    this.loop = loop;

    const element = doc.createElement('div');
    element.id = 'debug-overlay';
    element.dataset['testid'] = 'debug-overlay';
    element.setAttribute('aria-hidden', 'true');
    element.style.cssText = [
      'position:fixed',
      'top:8px',
      'right:8px',
      'z-index:9999',
      'padding:8px 10px',
      'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
      'white-space:pre',
      'color:#d8dee9',
      'background:rgba(12,14,18,0.82)',
      'border:1px solid rgba(255,255,255,0.12)',
      'border-radius:6px',
      'pointer-events:none',
    ].join(';');

    this.element = element;
    doc.body.appendChild(element);
  }

  /**
   * 4 Hz, not per frame.
   *
   * `World.hash()` walks every store; running it 60 times a second would make
   * the debug tool the most expensive thing in the frame and distort the very
   * measurements it exists to support.
   */
  start(win: Window): void {
    if (this.timer !== null) return;
    this.render();
    this.timer = win.setInterval(() => {
      this.render();
    }, REFRESH_INTERVAL_MS);
  }

  stop(win: Window): void {
    if (this.timer === null) return;
    win.clearInterval(this.timer);
    this.timer = null;
  }

  render(): void {
    const view = this.sim.readView();
    const stats = this.loop.stats;
    this.element.textContent = [
      `tick     ${view.tick}`,
      `sim      ${(view.simTimeMs / 1000).toFixed(1)}s`,
      `day/hour ${view.gameDay} / ${view.gameHour.toFixed(2)}`,
      `speed    ${view.speedMultiplier}x${view.paused ? ' (paused)' : ''}`,
      `alpha    ${this.loop.interpolationAlpha.toFixed(3)}`,
      `entities v${view.vehicleCount} c${view.customerCount} e${view.employeeCount} o${view.orderCount}`,
      `frames   ${stats.frames} (dropped ${stats.droppedTicks})`,
      `hash     ${this.sim.world.hash()}`,
    ].join('\n');
  }
}
