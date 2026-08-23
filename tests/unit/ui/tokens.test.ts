import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every `var(--x)` in the interface must name a token that exists.
 *
 * ## Why this is a test and not a lint rule
 *
 * A custom property whose value references an undefined custom property is not
 * an error anywhere: it becomes the *guaranteed-invalid value*, and every
 * declaration built on it is silently dropped at computed-value time. Nothing
 * warns. The build passes, the type-checker passes, ESLint passes, and the
 * screen quietly loses a whole layer of design.
 *
 * That is not hypothetical — it is what this file was written after. Three
 * aliases named ramp steps the locked 48-swatch palette does not have
 * (`steel-600`, `amber-600`, `neutral-500`; the ramps are 900/700/500/300, and
 * neutral is 900/600/300/050). Measured in Chromium against the preview build:
 *
 *   --border         →  invalid  →  sixteen components rendered `0px none`
 *   --ink-dim        →  invalid  →  eight components inherited plain white,
 *                                   so every label matched its own value
 *   --accent-strong  →  invalid  →  the XP bar's fill painted `none`
 *
 * A visual golden cannot catch this either, because the goldens were recorded
 * from the same broken cascade and agreed with it.
 *
 * A reference with an explicit fallback — `var(--x, #ccc)` — is exempt: the
 * fallback is what makes it safe, and it is deliberate in the handful of
 * places that use it.
 */

const UI = resolve(import.meta.dirname, '../../../src/ui');
const TOKENS = join(UI, 'theme/tokens.css');

/** Token names this file declares, at any selector. */
function declared(css: string): Set<string> {
  const names = new Set<string>();
  for (const match of css.matchAll(/(^|[;{\s])(--[\w-]+)\s*:/g)) {
    const name = match[2];
    if (name !== undefined) names.add(name);
  }
  return names;
}

/**
 * `var(--x)` references with no fallback.
 *
 * The fallback test is a comma before the closing paren, which is why the
 * pattern stops at the first `,` or `)` rather than trying to balance
 * parentheses — a `var()` inside a `color-mix()` still matches, and that is
 * the point.
 */
function referenced(css: string): string[] {
  const names: string[] = [];
  for (const match of css.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
    const [, name, terminator] = match;
    if (name !== undefined && terminator === ')') names.push(name);
  }
  return names;
}

function filesUnder(dir: string, extensions: readonly string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...filesUnder(full, extensions));
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      found.push(full);
    }
  }
  return found;
}

const tokens = readFileSync(TOKENS, 'utf8');
const defined = declared(tokens);

/**
 * Properties a component may set on itself and read back — a local channel
 * rather than a design token. Each is written as an inline `style` on the very
 * element whose rule reads it, so it is always defined where it is used.
 */
const LOCAL_CHANNELS = new Set(['--fill']);

describe('design tokens', () => {
  it('defines every token the theme itself references', () => {
    const missing = [...new Set(referenced(tokens))].filter((name) => !defined.has(name));
    expect(missing).toEqual([]);
  });

  it('defines every token the components reference without a fallback', () => {
    const sources = filesUnder(UI, ['.svelte', '.css']);
    expect(sources.length).toBeGreaterThan(20);

    const missing: string[] = [];
    for (const file of sources) {
      const where = relative(UI, file);
      for (const name of new Set(referenced(readFileSync(file, 'utf8')))) {
        if (defined.has(name) || LOCAL_CHANNELS.has(name)) continue;
        missing.push(`${where}: var(${name})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names only ramp steps the locked palette actually has', () => {
    /*
     * The direct cause of the original breakage: an alias pointing at a step
     * that does not exist. Checked against palette.json rather than against
     * this file, so inventing `--steel-600` in both places still fails.
     */
    const palette = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../docs/assets/palette.json'), 'utf8'),
    ) as { ramps: { id: string; colors: { id: string }[] }[] };

    const rampIds = new Set(palette.ramps.map((ramp) => ramp.id));
    const swatches = new Set(palette.ramps.flatMap((ramp) => ramp.colors.map((c) => `--${c.id}`)));
    expect(swatches.size).toBe(48);

    /* A `--ramp-NNN` name is only checked when `ramp` is one of the palette's
       own — `--neutral-500` is wrong, `--space-300` would just be a token. */
    const isBadStep = (name: string): boolean => {
      const ramp = /^--([a-zA-Z]+)-\d{3}$/.exec(name)?.[1];
      return ramp !== undefined && rampIds.has(ramp) && !swatches.has(name);
    };

    const wrong = [...defined, ...referenced(tokens)].filter(isBadStep);
    expect([...new Set(wrong)]).toEqual([]);
  });
});
