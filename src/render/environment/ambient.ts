/**
 * The day/night arithmetic — Phaser-free on purpose, so the curve is unit-
 * testable in node while the drawing half stays in `EnvironmentLayer`.
 */

/** Tint keyframes: hour → colour and strength. Linear between, wrapping. */
const AMBIENT_KEYS: readonly { hour: number; color: number; alpha: number }[] = [
  { hour: 0, color: 0x0b1430, alpha: 0.52 },
  { hour: 4.5, color: 0x0b1430, alpha: 0.52 },
  { hour: 6.5, color: 0x7a4a58, alpha: 0.24 },
  { hour: 8, color: 0xffffff, alpha: 0 },
  { hour: 17, color: 0xffffff, alpha: 0 },
  { hour: 19, color: 0x8a4a30, alpha: 0.2 },
  { hour: 21, color: 0x0b1430, alpha: 0.46 },
  { hour: 24, color: 0x0b1430, alpha: 0.52 },
];

/** Extra grey the sky adds in poor weather, on top of the hour. */
export const WEATHER_TINT: readonly { color: number; alpha: number }[] = [
  { color: 0x000000, alpha: 0 }, //          CLEAR
  { color: 0x39404d, alpha: 0.1 }, //        OVERCAST
  { color: 0x2c3542, alpha: 0.18 }, //       RAIN
  { color: 0x76839a, alpha: 0.14 }, //       SNOW
];

/** How strongly "night" the hour is, 0..1 — drives cones and glows. */
export function nightIntensityAt(hour: number): number {
  if (hour >= 21 || hour < 4.5) return 1;
  if (hour >= 8 && hour < 17) return 0;
  if (hour < 8) return (8 - hour) / 3.5; //   4.5 → 8 fades out
  return (hour - 17) / 4; //                  17 → 21 fades in
}

/** The blended ambient at an hour, exported for the unit test. */
export function ambientAt(hour: number): { color: number; alpha: number } {
  const wrapped = ((hour % 24) + 24) % 24;
  for (let i = 0; i < AMBIENT_KEYS.length - 1; i++) {
    const a = AMBIENT_KEYS[i];
    const b = AMBIENT_KEYS[i + 1];
    if (a === undefined || b === undefined) continue;
    if (wrapped < a.hour || wrapped > b.hour) continue;
    const t = b.hour === a.hour ? 0 : (wrapped - a.hour) / (b.hour - a.hour);
    return { color: lerpColor(a.color, b.color, t), alpha: a.alpha + (b.alpha - a.alpha) * t };
  }
  return { color: 0xffffff, alpha: 0 };
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
