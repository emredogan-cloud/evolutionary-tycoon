/**
 * The nine authored keyframe clips — Phase 17 (ASSET_PIPELINE §6.2).
 *
 * Typed data rather than JSON: the type-aware lint that guards `src` cannot
 * follow a JSON import's tuple types, and the editor never read the file
 * anyway — it round-trips clips through its textarea. `tools/rig-editor`
 * imports exactly this module, so the preview and the game share one truth.
 */
import type { Clip } from '../clips';

type ClipData = Omit<Clip, 'name'>;

export const CLIP_DATA: Readonly<Record<string, ClipData>> = {
  take_order: {
    durationMs: 1200,
    loop: false,
    channels: {
      head: {
        rotation: [
          [0, 0],
          [300, 0.12],
          [900, 0.12],
          [1200, 0],
        ],
      },
      armRight: {
        rotation: [
          [0, 0],
          [250, -0.55],
          [800, -0.5],
          [1200, 0],
        ],
      },
      torso: {
        rotation: [
          [0, 0],
          [300, 0.05],
          [1000, 0.05],
          [1200, 0],
        ],
      },
    },
  },
  cook: {
    durationMs: 900,
    loop: true,
    channels: {
      armRight: {
        rotation: [
          [0, -0.35],
          [225, -0.6],
          [450, -0.35],
          [675, -0.15],
          [900, -0.35],
        ],
      },
      armLeft: {
        rotation: [
          [0, 0.2],
          [450, 0.35],
          [900, 0.2],
        ],
      },
      torso: {
        offsetY: [
          [0, 0],
          [225, -0.02],
          [450, 0],
          [675, -0.02],
          [900, 0],
        ],
        rotation: [
          [0, 0.06],
          [450, 0.1],
          [900, 0.06],
        ],
      },
    },
  },
  serve: {
    durationMs: 800,
    loop: false,
    channels: {
      armRight: {
        rotation: [
          [0, 0],
          [300, -0.7],
          [600, -0.65],
          [800, 0],
        ],
      },
      armLeft: {
        rotation: [
          [0, 0],
          [300, -0.7],
          [600, -0.65],
          [800, 0],
        ],
      },
      torso: {
        rotation: [
          [0, 0],
          [300, 0.08],
          [600, 0.08],
          [800, 0],
        ],
      },
    },
  },
  clean: {
    durationMs: 1100,
    loop: true,
    channels: {
      armRight: {
        rotation: [
          [0, -0.3],
          [275, -0.7],
          [550, -0.3],
          [825, -0.7],
          [1100, -0.3],
        ],
      },
      torso: {
        rotation: [
          [0, 0.12],
          [550, 0.18],
          [1100, 0.12],
        ],
        offsetY: [
          [0, -0.04],
          [550, -0.07],
          [1100, -0.04],
        ],
      },
    },
  },
  eat: {
    durationMs: 1400,
    loop: true,
    channels: {
      armRight: {
        rotation: [
          [0, 0],
          [350, -0.85],
          [700, -0.9],
          [1050, -0.2],
          [1400, 0],
        ],
      },
      head: {
        rotation: [
          [0, 0],
          [350, 0.1],
          [700, 0.14],
          [1050, 0.04],
          [1400, 0],
        ],
      },
    },
  },
  pay: {
    durationMs: 700,
    loop: false,
    channels: {
      armRight: {
        rotation: [
          [0, 0],
          [250, -0.6],
          [500, -0.55],
          [700, 0],
        ],
      },
      head: {
        rotation: [
          [0, 0],
          [250, 0.08],
          [700, 0],
        ],
      },
    },
  },
  wait_impatient: {
    durationMs: 2000,
    loop: true,
    channels: {
      armLeft: {
        rotation: [
          [0, 0],
          [400, 0.5],
          [900, 0.5],
          [1100, 0],
          [2000, 0],
        ],
      },
      head: {
        rotation: [
          [0, 0],
          [400, -0.15],
          [900, -0.15],
          [1100, 0],
          [1500, 0.1],
          [1800, 0.1],
          [2000, 0],
        ],
      },
      torso: {
        offsetY: [
          [0, 0],
          [1200, 0],
          [1300, -0.03],
          [1400, 0],
          [1500, -0.03],
          [1600, 0],
          [2000, 0],
        ],
      },
    },
  },
  happy: {
    durationMs: 1000,
    loop: false,
    channels: {
      torso: {
        offsetY: [
          [0, 0],
          [250, 0.1],
          [500, 0],
          [700, 0.06],
          [1000, 0],
        ],
      },
      armLeft: {
        rotation: [
          [0, 0],
          [250, 0.9],
          [600, 0.85],
          [1000, 0],
        ],
      },
      armRight: {
        rotation: [
          [0, 0],
          [250, -0.9],
          [600, -0.85],
          [1000, 0],
        ],
      },
      head: {
        rotation: [
          [0, 0],
          [250, -0.08],
          [1000, 0],
        ],
      },
    },
  },
  angry: {
    durationMs: 1000,
    loop: false,
    channels: {
      torso: {
        rotation: [
          [0, 0],
          [200, -0.1],
          [600, -0.12],
          [1000, 0],
        ],
        offsetY: [
          [0, 0],
          [200, -0.05],
          [600, -0.05],
          [1000, 0],
        ],
      },
      armLeft: {
        rotation: [
          [0, 0],
          [200, 0.4],
          [450, 1.1],
          [700, 0.5],
          [1000, 0],
        ],
      },
      head: {
        rotation: [
          [0, 0],
          [200, -0.12],
          [600, -0.12],
          [1000, 0],
        ],
      },
    },
  },
};
