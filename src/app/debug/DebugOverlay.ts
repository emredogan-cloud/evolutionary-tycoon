import { CONVERSION_REASONS, conversionReasonName } from '@config/conversion';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import type { GameLoop } from '@app/GameLoop';
import type { Sim } from '@sim/core/Sim';
import { QueueSystem } from '@sim/systems/QueueSystem';
import { VEHICLE_ON_ROAD } from '@sim/systems/VehicleManeuverSystem';

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
export function debugOverlayEnabled(search: string = globalThis.location.search): boolean {
  /*
   * Consolidation pass (§28): production mode never shows raw telemetry, and
   * dev mode stopped being an exception — the overlay was drowning the
   * product view in every screenshot. `?debug=1` is the one door, in every
   * build; the infrastructure itself is untouched.
   */
  return new URLSearchParams(search).get('debug') === '1';
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
      '',
      ...this.conversionLines(),
    ].join('\n');
  }

  /**
   * The conversion read-out — GAME_EXECUTION_ROADMAP Phase 6.
   *
   * Rate, reason breakdown, car park occupancy. This is the same data the
   * Phase 18 player-facing analysis panel is built from, shown raw: if the
   * numbers here are not enough to explain why conversion dropped, the panel
   * will not be either, and it is far cheaper to find that out now.
   *
   * The rate is against *convertible* arrivals rather than all traffic. Dividing
   * by every vehicle would report roughly a fifth of the real figure, because
   * four out of five cars on the road are decorative and were never offered the
   * restaurant.
   */
  private conversionLines(): string[] {
    const stats = this.sim.world.stats;
    const offered = stats.conversionsSucceeded + stats.conversionsFailed;
    const rate = offered > 0 ? (stats.conversionsSucceeded / offered) * 100 : 0;

    const lines = [
      `convert  ${stats.conversionsSucceeded}/${offered} (${rate.toFixed(1)}%)`,
      `parking  ${this.occupiedBays()}/${STAGE1_LAYOUT.parking.length}` +
        `  queue ${this.queueLength()}/${STAGE1_LAYOUT.queueCapacity}` +
        `  spill ${QueueSystem.overflowOf(this.sim.world, STAGE1_LAYOUT)}`,
      `left     ${stats.customersAbandoned} bored, ${stats.turnedAwayNoParking} no space`,
    ];

    /*
     * Sorted by count, worst first, and zeroes dropped. A fixed-order list of
     * nine reasons is nine lines of mostly zero, and the one that matters is
     * whichever is largest today — which changes as the player builds.
     */
    const reasons: { name: string; count: number }[] = [];
    for (let reason = 0; reason < CONVERSION_REASONS.length; reason++) {
      const count = stats.failureReasons[reason] ?? 0;
      if (count > 0) reasons.push({ name: conversionReasonName(reason), count });
    }
    reasons.sort((a, b) => b.count - a.count);
    for (const entry of reasons.slice(0, 4)) {
      lines.push(`  ${entry.name.padEnd(16)} ${entry.count}`);
    }

    return lines;
  }

  private occupiedBays(): number {
    const vehicles = this.sim.world.vehicles;
    const bays = new Set<number>();
    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
      if (!vehicles.isActive(slot)) continue;
      if ((vehicles.state[slot] ?? 0) === VEHICLE_ON_ROAD) continue;
      const bay = vehicles.parkingSlot[slot] ?? -1;
      if (bay >= 0) bays.add(bay);
    }
    return bays.size;
  }

  private queueLength(): number {
    const customers = this.sim.world.customers;
    let queued = 0;
    for (let slot = 0; slot < customers.scanLimit; slot++) {
      if (!customers.isActive(slot)) continue;
      if (customers.at(slot).queueIndex >= 0) queued++;
    }
    return queued;
  }
}
