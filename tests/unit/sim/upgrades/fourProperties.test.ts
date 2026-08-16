import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTOR_KIND_SPECS } from '@config/actors';
import { EFFECT_MODE_OF, UPGRADES } from '@config/economy/upgrades';
import type { EffectKind } from '@config/economy/upgrades';
import { layoutForStage } from '@config/layouts';

/**
 * **The four-property rule, enforced** — GAME_DESIGN_DOCUMENT §13.1,
 * GAME_EXECUTION_ROADMAP Phase 13.
 *
 * Every upgrade must have all four of:
 *
 * 1. a **cost** (and, where the tree branches, a prerequisite);
 * 2. a **measurable simulation effect**;
 * 3. a **visible change in the world** — without exception;
 * 4. a **gameplay consequence** — a new decision, or a bottleneck removed.
 *
 * The roadmap is blunt about why this is a test rather than a convention: it is
 * what stops the tree filling up with "+3% efficiency". A rule nobody can merge
 * past is a different thing from a rule written in a document.
 *
 * The interesting half is property 2. "Has an effect" is easy to fake — an
 * effect kind nothing reads is a number in a config file — so this file also
 * **reads `src/sim` and checks every kind has a consumer**. That is the only
 * version of "measurable" that cannot be satisfied by writing more config.
 */

const SIM_ROOT = resolve(import.meta.dirname, '../../../../src/sim');

/** Every `.ts` file under `src/sim`, concatenated. */
function simSources(): string {
  const parts: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.endsWith('.ts')) parts.push(readFileSync(path, 'utf8'));
    }
  };
  walk(SIM_ROOT);
  return parts.join('\n');
}

describe('property 1 — every upgrade has a cost', () => {
  it('prices everything above zero', () => {
    for (const item of UPGRADES) {
      expect(item.baseCost, `${item.id} is free`).toBeGreaterThan(0);
      expect(item.maxLevel, `${item.id} has no levels`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('property 2 — every upgrade has a measurable effect', () => {
  it('declares at least one', () => {
    for (const item of UPGRADES) {
      expect(item.effects.length, `${item.id} changes nothing`).toBeGreaterThan(0);
    }
  });

  it('and something in src/sim actually reads every kind it declares', () => {
    /*
     * **The assertion that makes "measurable" mean something.**
     *
     * An effect kind with no consumer is a number the player pays for and the
     * simulation never looks at — indistinguishable, from inside the config,
     * from one that works. Phase 13 added ten kinds at once, which is exactly
     * the situation where one gets forgotten.
     *
     * Matched on the call rather than on the bare name, because the name also
     * appears in the config that declares it.
     */
    const source = simSources();
    const declared = new Set<EffectKind>(UPGRADES.flatMap((item) => item.effects.map((e) => e.kind)));

    for (const kind of declared) {
      expect(source.includes(`effectValue(world, '${kind}')`), `nothing in src/sim reads '${kind}'`).toBe(
        true,
      );
    }
  });

  it('uses a mode the effect table knows about', () => {
    for (const item of UPGRADES) {
      for (const effect of item.effects) {
        expect(EFFECT_MODE_OF[effect.kind], `${item.id}/${effect.kind}`).toBeDefined();
      }
    }
  });
});

describe('property 3 — every upgrade changes the world visibly', () => {
  it('describes the change in words', () => {
    for (const item of UPGRADES) {
      expect(item.worldChange.trim().length, `${item.id} has no world change`).toBeGreaterThan(10);
    }
  });

  it('names a placeholder that the renderer can actually draw', () => {
    // An upgrade whose placeholder is not in the render catalogue throws a
    // `RangeError` from inside `registerStatics` — on the frame after a
    // purchase, which is the worst possible moment.
    for (const item of UPGRADES) {
      expect(
        ACTOR_KIND_SPECS.some((spec) => spec.textureKey === item.placeholder),
        `${item.id} draws as "${item.placeholder}", which nothing loads`,
      ).toBe(true);
      expect(item.iconKey.trim().length, `${item.id} has no icon key`).toBeGreaterThan(0);
    }
  });

  it("anchors the card beside the thing it changes, inside that stage's lot", () => {
    /*
     * GAME_DESIGN_DOCUMENT §14.3: the card opens in the world, beside the
     * object. An anchor outside the lot opens a card about nothing, and one at
     * the origin opens every card in the same corner.
     */
    for (const item of UPGRADES) {
      const lot = layoutForStage(item.stage).lot;
      expect(item.anchor.x, `${item.id} anchor x`).toBeGreaterThan(lot.minX);
      expect(item.anchor.x, `${item.id} anchor x`).toBeLessThan(lot.maxX);
      expect(item.anchor.y, `${item.id} anchor y`).toBeGreaterThan(lot.minY);
      expect(item.anchor.y, `${item.id} anchor y`).toBeLessThan(lot.maxY);
    }
  });

  it('does not stack two upgrades on the same spot', () => {
    // Two cards opening at the same point is one card the player cannot reach.
    const seen = new Map<string, string>();
    for (const item of UPGRADES) {
      const key = `${item.anchor.x.toFixed(1)},${item.anchor.y.toFixed(1)}`;
      const other = seen.get(key);
      expect(other, `${item.id} anchors on top of ${String(other)}`).toBeUndefined();
      seen.set(key, item.id);
    }
  });
});

describe('property 4 — every upgrade changes how the game is played', () => {
  it('says what it does for the player, in their words', () => {
    /*
     * Not the effect restated. "visibility +0.30" is property 2; this is "more
     * of the traffic notices you at all". The length floor is crude and it is
     * the only automatic check available — the real defence is that a reviewer
     * can read the line and tell whether it describes a decision.
     */
    for (const item of UPGRADES) {
      expect(item.consequence.trim().length, `${item.id} has no consequence`).toBeGreaterThan(15);
      expect(item.consequence, `${item.id}'s consequence just restates the effect`).not.toMatch(/^\+?\d/);
    }
  });
});
