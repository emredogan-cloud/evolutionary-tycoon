/**
 * Frame-time sampling for the manual performance pass.
 *
 * CI is forbidden from reporting a frame rate — GitHub Actions runs Chromium on
 * SwiftShader, so any number from there measures a software rasteriser
 * (WORKING_DISCIPLINE §8, ADR-011). Real figures come from a real GPU, by hand,
 * through `?bench=1`, and land in `docs/PERF_LOG.md` with the device named.
 *
 * A ring buffer rather than a growing array: the meter must not be the thing
 * that allocates during the measurement it is taking.
 */

export interface FrameStats {
  readonly samples: number;
  /** Median frame time, milliseconds. */
  readonly p50Ms: number;
  /** 95th percentile — the number the frame budget is written against. */
  readonly p95Ms: number;
  /** Worst 5% of frames, expressed as FPS. The one players actually feel. */
  readonly p05Fps: number;
  readonly p50Fps: number;
  readonly worstMs: number;
}

const DEFAULT_CAPACITY = 2048;

export class FrameMeter {
  private readonly deltas: Float64Array;
  private readonly scratch: Float64Array;
  private writeIndex = 0;
  private count = 0;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    this.deltas = new Float64Array(capacity);
    // Sorting in place would destroy the ring's ordering, and allocating a copy
    // per read would allocate during a measurement of allocation-sensitive code.
    this.scratch = new Float64Array(capacity);
  }

  record(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.deltas[this.writeIndex] = deltaMs;
    this.writeIndex = (this.writeIndex + 1) % this.deltas.length;
    if (this.count < this.deltas.length) this.count++;
  }

  reset(): void {
    this.writeIndex = 0;
    this.count = 0;
  }

  stats(): FrameStats {
    if (this.count === 0) {
      return { samples: 0, p50Ms: 0, p95Ms: 0, p05Fps: 0, p50Fps: 0, worstMs: 0 };
    }

    this.scratch.set(this.deltas.subarray(0, this.count));
    const view = this.scratch.subarray(0, this.count);
    view.sort();

    const at = (fraction: number): number =>
      view[Math.min(this.count - 1, Math.floor(this.count * fraction))] ?? 0;

    const p50Ms = at(0.5);
    const p95Ms = at(0.95);

    return {
      samples: this.count,
      p50Ms,
      p95Ms,
      // The slowest frames are the largest deltas, so the worst 5% of the
      // *experience* is the 95th percentile of the *time*.
      p05Fps: p95Ms > 0 ? 1000 / p95Ms : 0,
      p50Fps: p50Ms > 0 ? 1000 / p50Ms : 0,
      worstMs: view[this.count - 1] ?? 0,
    };
  }
}
