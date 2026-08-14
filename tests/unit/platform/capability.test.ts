import { describe, expect, it, vi } from 'vitest';
import { detectCapabilities } from '@platform/capability';

/**
 * These tests matter more than they look. Phaser 4 removed the Canvas renderer,
 * so a wrong answer here is the difference between a player seeing an
 * explanation and a player seeing a black screen
 * (docs/TECHNICAL_ARCHITECTURE.md §12, tier C).
 *
 * jsdom has no WebGL implementation, so we inject fake Document/Navigator
 * objects rather than stubbing globals — which is exactly why
 * detectCapabilities takes them as parameters.
 */

interface FakeGlOptions {
  readonly maxTextureSize?: number;
  readonly rendererString?: string | null;
  readonly loseContextAvailable?: boolean;
}

function makeFakeGl(opts: FakeGlOptions = {}): {
  gl: Record<string, unknown>;
  loseContext: ReturnType<typeof vi.fn>;
} {
  const MAX_TEXTURE_SIZE = 0x0d33;
  const UNMASKED_RENDERER_WEBGL = 0x9246;
  const loseContext = vi.fn();

  const gl: Record<string, unknown> = {
    MAX_TEXTURE_SIZE,
    getParameter: (pname: number): unknown => {
      if (pname === MAX_TEXTURE_SIZE) return opts.maxTextureSize ?? 8192;
      if (pname === UNMASKED_RENDERER_WEBGL) return opts.rendererString ?? null;
      return null;
    },
    getExtension: (name: string): unknown => {
      if (name === 'WEBGL_debug_renderer_info') {
        return opts.rendererString === null ? null : { UNMASKED_RENDERER_WEBGL };
      }
      if (name === 'WEBGL_lose_context') {
        return opts.loseContextAvailable === false ? null : { loseContext };
      }
      return null;
    },
  };

  return { gl, loseContext };
}

function makeDoc(getContext: (id: string) => unknown): Document {
  return {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
      return { getContext } as unknown as HTMLCanvasElement;
    },
  } as unknown as Document;
}

function makeNav(overrides: Partial<Navigator> & { deviceMemory?: number } = {}): Navigator {
  return { hardwareConcurrency: 8, ...overrides } as unknown as Navigator;
}

describe('detectCapabilities', () => {
  it('reports supported when a webgl2 context is available', () => {
    const { gl } = makeFakeGl({ maxTextureSize: 16384, rendererString: 'Fake GPU 9000' });
    const report = detectCapabilities(
      makeDoc((id) => (id === 'webgl2' ? gl : null)),
      makeNav({ deviceMemory: 8 }),
    );

    expect(report.supported).toBe(true);
    expect(report.failure).toBeUndefined();
    expect(report.maxTextureSize).toBe(16384);
    expect(report.renderer).toBe('Fake GPU 9000');
    expect(report.deviceMemoryGb).toBe(8);
    expect(report.hardwareConcurrency).toBe(8);
  });

  it('reports no-webgl2 when the context cannot be created', () => {
    const report = detectCapabilities(
      makeDoc(() => null),
      makeNav(),
    );

    expect(report.supported).toBe(false);
    expect(report.failure).toBe('no-webgl2');
    expect(report.maxTextureSize).toBeNull();
  });

  it('reports no-webgl2 when getContext throws', () => {
    const report = detectCapabilities(
      makeDoc(() => {
        throw new Error('context creation blocked');
      }),
      makeNav(),
    );

    expect(report.supported).toBe(false);
    expect(report.failure).toBe('no-webgl2');
  });

  it('reports no-canvas-element when the document cannot create a canvas', () => {
    const doc = {
      createElement: () => {
        throw new Error('blocked');
      },
    } as unknown as Document;

    const report = detectCapabilities(doc, makeNav());

    expect(report.supported).toBe(false);
    expect(report.failure).toBe('no-canvas-element');
  });

  it('treats a withheld renderer string as normal, not as a failure', () => {
    // Firefox and privacy-hardened browsers withhold WEBGL_debug_renderer_info.
    // Reporting that as unsupported would lock out a whole browser family.
    const { gl } = makeFakeGl({ rendererString: null });
    const report = detectCapabilities(
      makeDoc(() => gl),
      makeNav(),
    );

    expect(report.supported).toBe(true);
    expect(report.renderer).toBeNull();
  });

  it('releases the probe context so it does not count against the browser context limit', () => {
    const { gl, loseContext } = makeFakeGl();
    detectCapabilities(
      makeDoc(() => gl),
      makeNav(),
    );

    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('does not throw when WEBGL_lose_context is unavailable', () => {
    const { gl } = makeFakeGl({ loseContextAvailable: false });
    expect(() =>
      detectCapabilities(
        makeDoc(() => gl),
        makeNav(),
      ),
    ).not.toThrow();
  });

  it('reports null for capabilities the browser does not expose', () => {
    const { gl } = makeFakeGl();
    const nav = {} as unknown as Navigator;
    const report = detectCapabilities(
      makeDoc(() => gl),
      nav,
    );

    expect(report.deviceMemoryGb).toBeNull();
    expect(report.hardwareConcurrency).toBeNull();
  });
});
