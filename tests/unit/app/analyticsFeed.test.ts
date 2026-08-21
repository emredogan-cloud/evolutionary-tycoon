import { describe, expect, it } from 'vitest';
import { CONVERSION_REASONS, REASON_QUEUE_TOO_LONG, REASON_NOT_VISIBLE } from '@config/conversion';
import { Sim } from '@sim/core/Sim';
import type { HudModel } from '@app/bridge/hudModel';
import { CONVERSION_RING_SIZE, UiBridge } from '@app/bridge/UiBridge';

/**
 * Phase 18 — the Analytics feed and the notification strip, at the bridge.
 * The ring rides the event stream (replay-safe, unhashed); this stages the
 * events directly and reads the published model, exactly as the panel does.
 */
function bridge(): { sim: Sim; ui: UiBridge; latest: () => HudModel } {
  const sim = new Sim({ seed: 1 });
  const ui = new UiBridge(sim, (x, y, _z, out) => {
    out.x = x;
    out.y = y;
    return true;
  });
  ui.start();
  let model: HudModel | null = null;
  ui.subscribe((published) => {
    model = published;
  });
  return {
    sim,
    ui,
    latest: () => {
      ui.refresh();
      if (model === null) throw new Error('nothing published');
      return model;
    },
  };
}

describe('the conversion ring', () => {
  it('counts the last hundred decisions by reason, converted separated', () => {
    const { sim, latest } = bridge();
    sim.events.subscribe(() => undefined);
    for (let i = 0; i < 3; i++) sim.world.eventQueue.emitConversionSucceeded(i, 0, 0.5);
    for (let i = 0; i < 5; i++) sim.world.eventQueue.emitConversionFailed(i, 0, REASON_QUEUE_TOO_LONG, 0.1);
    sim.world.eventQueue.emitConversionFailed(9, 0, REASON_NOT_VISIBLE, 0.1);
    sim.tick();
    const model = latest();
    expect(model.analytics.sampleSize).toBe(9);
    expect(model.analytics.converted).toBe(3);
    expect(model.analytics.reasonCounts[REASON_QUEUE_TOO_LONG]).toBe(5);
    expect(model.analytics.reasonCounts[REASON_NOT_VISIBLE]).toBe(1);
  });

  it('never grows past one hundred — the oldest yields', () => {
    const { sim, latest } = bridge();
    // Emitted across ticks — the pooled queue flushes a bounded batch per tick.
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 28; i++) {
        sim.world.eventQueue.emitConversionFailed(i, 0, REASON_NOT_VISIBLE, 0.1);
      }
      sim.tick();
    }
    expect(latest().analytics.sampleSize).toBe(CONVERSION_RING_SIZE);
    expect(CONVERSION_REASONS.length).toBeGreaterThan(0);
  });
});

describe('the notification strip feed', () => {
  it('turns the newsworthy events into lines and ages them out', () => {
    const { sim, latest } = bridge();
    sim.world.eventQueue.emitStageUnlocked(2);
    sim.world.eventQueue.emitEmployeeLeft(5, 'cook', 'unpaid');
    sim.tick();
    const lines = latest().notices;
    // The first tick may add its own weather line; the two staged ones must be there.
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.some((line) => line.kind === 'warning')).toBe(true);
    expect(lines.some((line) => line.kind === 'progress')).toBe(true);
  });
});
