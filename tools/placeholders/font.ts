import type { PixelCanvas, Rgba } from './png';

/**
 * A 3x5 bitmap font, just large enough to label a placeholder.
 *
 * A placeholder that does not say what it is standing in for is a placeholder
 * that survives to launch. Labelling them is the cheapest possible defence, and
 * it needs exactly this much typography: uppercase, digits, a hyphen and a
 * space. Each glyph is five rows of three bits, high bit leftmost.
 */

const GLYPHS: Readonly<Record<string, readonly number[]>> = {
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b011, 0b100, 0b101, 0b101, 0b011],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  J: [0b001, 0b001, 0b001, 0b101, 0b010],
  K: [0b101, 0b101, 0b110, 0b101, 0b101],
  L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101],
  N: [0b101, 0b111, 0b111, 0b111, 0b101],
  O: [0b010, 0b101, 0b101, 0b101, 0b010],
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  Q: [0b010, 0b101, 0b101, 0b110, 0b011],
  R: [0b110, 0b101, 0b110, 0b101, 0b101],
  S: [0b011, 0b100, 0b010, 0b001, 0b110],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b011],
  V: [0b101, 0b101, 0b101, 0b101, 0b010],
  W: [0b101, 0b101, 0b111, 0b111, 0b101],
  X: [0b101, 0b101, 0b010, 0b101, 0b101],
  Y: [0b101, 0b101, 0b010, 0b010, 0b010],
  Z: [0b111, 0b001, 0b010, 0b100, 0b111],
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b110, 0b001, 0b010, 0b100, 0b111],
  '3': [0b110, 0b001, 0b010, 0b001, 0b110],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b110, 0b001, 0b110],
  '6': [0b011, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b110],
  '-': [0b000, 0b000, 0b111, 0b000, 0b000],
  '.': [0b000, 0b000, 0b000, 0b000, 0b010],
  ' ': [0b000, 0b000, 0b000, 0b000, 0b000],
};

export const GLYPH_WIDTH = 3;
export const GLYPH_HEIGHT = 5;
const LETTER_SPACING = 1;

export function measureText(text: string, scale: number): { width: number; height: number } {
  const glyphs = text.length;
  const width = glyphs * (GLYPH_WIDTH + LETTER_SPACING) - LETTER_SPACING;
  return { width: Math.max(0, width) * scale, height: GLYPH_HEIGHT * scale };
}

/** Draw uppercase text. Unknown characters fall back to a space rather than throwing. */
export function drawText(
  canvas: PixelCanvas,
  text: string,
  originX: number,
  originY: number,
  scale: number,
  colour: Rgba,
): void {
  let cursorX = originX;
  for (const character of text.toUpperCase()) {
    const glyph = GLYPHS[character] ?? GLYPHS[' '];
    if (glyph !== undefined) {
      for (let row = 0; row < GLYPH_HEIGHT; row++) {
        const bits = glyph[row] ?? 0;
        for (let column = 0; column < GLYPH_WIDTH; column++) {
          const lit = (bits >> (GLYPH_WIDTH - 1 - column)) & 1;
          if (lit === 1) {
            canvas.fillRect(cursorX + column * scale, originY + row * scale, scale, scale, colour);
          }
        }
      }
    }
    cursorX += (GLYPH_WIDTH + LETTER_SPACING) * scale;
  }
}
