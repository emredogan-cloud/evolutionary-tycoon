/**
 * Runtime capability detection.
 *
 * Phaser 4 deprecated the Canvas renderer, so WebGL2 is a hard requirement:
 * without it the game cannot render at all. That makes the unsupported-browser
 * path a product requirement rather than a nicety — a player on an unsupported
 * browser must see an explanation, never a black screen
 * (docs/TECHNICAL_ARCHITECTURE.md §12, tier C).
 */

export type CapabilityFailure = 'no-webgl2' | 'no-canvas-element';

export interface CapabilityReport {
  readonly supported: boolean;
  /** Present only when `supported` is false. */
  readonly failure?: CapabilityFailure;
  /** Unmasked GPU renderer string when the driver exposes it; used for quality tiering in Phase 20. */
  readonly renderer: string | null;
  /** `navigator.deviceMemory` in GB, when the browser exposes it. */
  readonly deviceMemoryGb: number | null;
  readonly hardwareConcurrency: number | null;
  readonly maxTextureSize: number | null;
}

interface NavigatorWithDeviceMemory extends Navigator {
  readonly deviceMemory?: number;
}

/**
 * Read the unmasked renderer string if the driver allows it.
 *
 * Firefox and privacy-hardened browsers withhold WEBGL_debug_renderer_info, so a
 * null here is normal and must not be treated as a failure.
 */
function readRenderer(gl: WebGL2RenderingContext): string | null {
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo === null) return null;
  const value: unknown = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  return typeof value === 'string' ? value : null;
}

function readDeviceMemory(nav: Navigator): number | null {
  const memory = (nav as NavigatorWithDeviceMemory).deviceMemory;
  return typeof memory === 'number' ? memory : null;
}

/**
 * Probe the environment. Creates and discards a throwaway canvas; safe to call
 * before any rendering has been set up.
 *
 * @param doc Document to probe against. Injectable so the unsupported path can
 *   be exercised in tests without stubbing globals.
 */
export function detectCapabilities(doc: Document = document, nav: Navigator = navigator): CapabilityReport {
  const base = {
    renderer: null,
    deviceMemoryGb: readDeviceMemory(nav),
    hardwareConcurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    maxTextureSize: null,
  } as const;

  let canvas: HTMLCanvasElement;
  try {
    canvas = doc.createElement('canvas');
  } catch {
    return { supported: false, failure: 'no-canvas-element', ...base };
  }

  // `failIfMajorPerformanceCaveat` is deliberately NOT set: CI and many Linux
  // desktops fall back to SwiftShader, which is slow but entirely playable at
  // the Low quality tier. Refusing to run there would break our own E2E suite
  // and lock out real users on machines without a GPU driver.
  let gl: WebGL2RenderingContext | null;
  try {
    gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
  } catch {
    gl = null;
  }

  if (gl === null) {
    return { supported: false, failure: 'no-webgl2', ...base };
  }

  const maxTextureSizeRaw: unknown = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  const report: CapabilityReport = {
    supported: true,
    renderer: readRenderer(gl),
    deviceMemoryGb: base.deviceMemoryGb,
    hardwareConcurrency: base.hardwareConcurrency,
    maxTextureSize: typeof maxTextureSizeRaw === 'number' ? maxTextureSizeRaw : null,
  };

  // Release the probe context immediately. Browsers cap the number of live WebGL
  // contexts (Safari especially); leaking this one would cost us the real
  // renderer context later.
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  return report;
}
