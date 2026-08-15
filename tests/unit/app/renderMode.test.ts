import { describe, expect, it } from 'vitest';
import { FrameMeter } from '@app/FrameMeter';
import { parseRenderMode, prefersReducedMotion } from '@app/renderMode';

describe('parseRenderMode', () => {
  it('defaults to a live, unpinned scene', () => {
    const mode = parseRenderMode('');
    expect(mode.freezeAt).toBeNull();
    expect(mode.visualDeterminism).toBe(false);
    expect(mode.sceneId).toBe('empty');
    expect(mode.lockedCamera).toBeNull();
  });

  it('reads the full visual determinism set', () => {
    const mode = parseRenderMode(
      '?seed=42&freezeAt=600&scene=depth-testcard&noParticles=1&fixedViewport=1&dpr=1&hideHud=1',
    );
    expect(mode.freezeAt).toBe(600);
    expect(mode.noParticles).toBe(true);
    expect(mode.fixedViewport).toBe(true);
    expect(mode.hideHud).toBe(true);
    expect(mode.cook).toBe(false);
    expect(mode.sceneId).toBe('depth-testcard');
    expect(mode.visualDeterminism).toBe(true);
  });

  it('treats freezeAt=0 as frozen, not as absent', () => {
    // The most common golden URL. `0 || null` would silently unfreeze it and the
    // screenshot would race the animation loop.
    const mode = parseRenderMode('?freezeAt=0');
    expect(mode.freezeAt).toBe(0);
    expect(mode.visualDeterminism).toBe(true);
  });

  it('ignores a non-numeric freezeAt', () => {
    expect(parseRenderMode('?freezeAt=soon').freezeAt).toBeNull();
  });

  it('any single pinning parameter is enough to count as visual mode', () => {
    expect(parseRenderMode('?noParticles=1').visualDeterminism).toBe(true);
    expect(parseRenderMode('?fixedViewport=1').visualDeterminism).toBe(true);
    expect(parseRenderMode('?hideHud=1').visualDeterminism).toBe(true);

    /*
     * `cook=1` is deliberately *not* in that list. It changes what the player
     * did, not how the frame is rendered — a run with it is a different world,
     * not the same world pinned. Treating it as a pinning parameter would let a
     * URL that only cooks silently claim to be visually deterministic.
     */
    expect(parseRenderMode('?cook=1').visualDeterminism).toBe(false);
    expect(parseRenderMode('?cook=1').cook).toBe(true);
    expect(parseRenderMode('?scene=stress').visualDeterminism).toBe(false);
  });

  it('locks the camera whenever the clock is frozen on a known scene', () => {
    // A golden taken through a camera the player can nudge fails the first time
    // a pointer crosses the canvas during the screenshot.
    const mode = parseRenderMode('?freezeAt=0&scene=depth-testcard');
    expect(mode.lockedCamera).not.toBeNull();
    expect(mode.lockedCamera?.zoom).toBe(1);
    expect(Number.isFinite(mode.lockedCamera?.x ?? Number.NaN)).toBe(true);
  });

  it('does not lock the camera for a live scene', () => {
    expect(parseRenderMode('?scene=depth-testcard').lockedCamera).toBeNull();
  });

  it('does not lock the camera for an unknown scene', () => {
    expect(parseRenderMode('?freezeAt=0&scene=nope').lockedCamera).toBeNull();
  });

  it('locks each scene to its own framing', () => {
    const card = parseRenderMode('?freezeAt=0&scene=depth-testcard').lockedCamera;
    const stress = parseRenderMode('?freezeAt=0&scene=stress').lockedCamera;
    expect(stress?.zoom).not.toBe(card?.zoom);
  });
});

describe('prefersReducedMotion', () => {
  it('reports what the media query says', () => {
    const reduced = { matchMedia: () => ({ matches: true }) } as unknown as Window;
    const normal = { matchMedia: () => ({ matches: false }) } as unknown as Window;
    expect(prefersReducedMotion(reduced)).toBe(true);
    expect(prefersReducedMotion(normal)).toBe(false);
  });

  it('assumes no preference when matchMedia is unavailable', () => {
    // A hardened or embedded browser may omit it, and a missing media-query API
    // is not a reason to refuse to boot.
    expect(prefersReducedMotion({} as unknown as Window)).toBe(false);
  });
});

describe('FrameMeter', () => {
  it('reports nothing before it has seen a frame', () => {
    expect(new FrameMeter().stats()).toEqual({
      samples: 0,
      p50Ms: 0,
      p95Ms: 0,
      p05Fps: 0,
      p50Fps: 0,
      worstMs: 0,
    });
  });

  it('converts a steady 60 Hz stream into 60 FPS', () => {
    const meter = new FrameMeter();
    for (let i = 0; i < 300; i++) meter.record(16.6667);
    const stats = meter.stats();
    expect(stats.samples).toBe(300);
    expect(stats.p50Fps).toBeCloseTo(60, 1);
    expect(stats.p05Fps).toBeCloseTo(60, 1);
  });

  it('reports the worst 5% of frames as p05, not the best', () => {
    // The number players actually feel. Getting this backwards would report a
    // stuttering game as smooth.
    const meter = new FrameMeter();
    for (let i = 0; i < 95; i++) meter.record(10);
    for (let i = 0; i < 5; i++) meter.record(100);

    const stats = meter.stats();
    expect(stats.p50Ms).toBe(10);
    expect(stats.p95Ms).toBe(100);
    expect(stats.p05Fps).toBeCloseTo(10, 5);
    expect(stats.p50Fps).toBeCloseTo(100, 5);
    expect(stats.worstMs).toBe(100);
  });

  it('ignores impossible deltas rather than poisoning the percentiles', () => {
    const meter = new FrameMeter();
    meter.record(Number.NaN);
    meter.record(-5);
    meter.record(0);
    meter.record(Number.POSITIVE_INFINITY);
    expect(meter.stats().samples).toBe(0);
  });

  it('keeps only the most recent window', () => {
    const meter = new FrameMeter(4);
    for (const delta of [100, 100, 100, 100, 10, 10, 10, 10]) meter.record(delta);
    const stats = meter.stats();
    expect(stats.samples).toBe(4);
    expect(stats.worstMs).toBe(10);
  });

  it('reset discards the samples', () => {
    const meter = new FrameMeter();
    meter.record(16);
    meter.reset();
    expect(meter.stats().samples).toBe(0);
  });

  it('sorting for percentiles does not corrupt the ring', () => {
    // The stats pass sorts a copy; sorting the ring itself would silently make
    // "most recent window" mean "smallest values seen".
    const meter = new FrameMeter(4);
    meter.record(50);
    meter.record(10);
    meter.record(30);
    meter.stats();
    meter.record(20);
    expect(meter.stats().samples).toBe(4);
    expect(meter.stats().worstMs).toBe(50);
  });
});
