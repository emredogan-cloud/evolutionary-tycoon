import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UPGRADES } from '@config/economy/upgrades';
import { UPGRADE_IDS, UPGRADE_LABEL_IDS, upgradeLabel } from '@ui/lib/upgradeLabels';

/**
 * The interface names every upgrade, and names it once.
 *
 * Three components each kept their own copy of this map, and all three had
 * drifted: eight upgrades printed a raw id in the build panel, twenty-one
 * printed one in the objective card, and five had two different Turkish names
 * depending on which panel you were looking at. None of it failed a test,
 * because every lookup ended in `?? id` and a raw id renders perfectly well.
 *
 * So the fallback stays — a player should see something rather than a blank —
 * and this test is what makes it a safety net instead of a hiding place.
 */

describe('upgrade labels', () => {
  it('names every upgrade in the tree', () => {
    const unnamed = UPGRADE_IDS.filter((id) => upgradeLabel(id) === id);
    expect(unnamed, 'these upgrades would render their raw id').toEqual([]);
  });

  it('has no name for an upgrade that no longer exists', () => {
    /*
     * The other half, and the half that actually caused the damage: a rename
     * leaves the old key behind, the map still has thirty entries, and it looks
     * complete while eight cards have quietly lost their names.
     */
    const known = new Set(UPGRADE_IDS);
    expect(UPGRADE_LABEL_IDS.filter((id) => !known.has(id))).toEqual([]);
  });

  it('is the only upgrade-name map in the interface', () => {
    /*
     * The rule this file exists to enforce, checked structurally rather than
     * by hoping. Any component that re-introduces a table keyed by upgrade id
     * has re-introduced the drift, so the shape is what is banned — not the
     * specific eight keys that happened to rot last time.
     */
    const ui = resolve(import.meta.dirname, '../../../src/ui');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.svelte') || entry.endsWith('.ts')) files.push(full);
      }
    };
    walk(ui);

    const sample = UPGRADES.slice(0, 6).map((item) => item.id);
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith('upgradeLabels.ts')) continue;
      const source = readFileSync(file, 'utf8');
      // A map keyed by upgrade ids: several distinct upgrade ids appearing as
      // object keys in one file is the signature.
      const keyed = sample.filter((id) => source.includes(`'${id}':`) || source.includes(`${id}:`));
      if (keyed.length >= 3) offenders.push(`${file.slice(ui.length + 1)} (${keyed.join(', ')})`);
    }
    expect(offenders, 'a second upgrade-name map has appeared').toEqual([]);
  });
});

describe('upgrade card icons', () => {
  it('names an atlas frame that exists, for every upgrade', () => {
    /*
     * `iconKey` was only ever length-checked. Nothing resolved it against the
     * built atlas, which is how the build panel's own copy of these keys could
     * drift for eight upgrades without a single test noticing.
     *
     * Skipped rather than failed when no atlas has been built: a fresh clone
     * has no `public/atlas`, and a test that fails there would be testing the
     * checkout rather than the code. `pnpm verify` builds the assets first.
     */
    interface Sheet {
      readonly textures?: readonly { readonly frames: readonly { readonly filename: string }[] }[];
    }

    const atlas = join(resolve(import.meta.dirname, '../../../public/atlas'), 'ui2.json');
    if (!existsSync(atlas)) return;

    const sheet = JSON.parse(readFileSync(atlas, 'utf8')) as Sheet;
    const frames = new Set(
      (sheet.textures ?? []).flatMap((texture) =>
        texture.frames.map((frame) => frame.filename.replace(/\.png$/, '')),
      ),
    );
    expect(frames.size, 'ui2.json contained no frames').toBeGreaterThan(20);

    const missing = UPGRADES.filter((item) => !frames.has(item.iconKey)).map(
      (item) => `${item.id} -> ${item.iconKey}`,
    );
    expect(missing, 'these upgrade cards would render no icon').toEqual([]);
  });
});
