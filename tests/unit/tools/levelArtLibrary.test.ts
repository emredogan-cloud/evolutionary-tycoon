import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROPERTIES, propertyLevelArt } from '@config/properties';
import { auditPrompts } from '../../../tools/asset-pipeline/auditPrompts.ts';

/**
 * `docs/LEVEL_ASSET_EVOLUTION_LIBRARY.md` against the things it describes.
 *
 * The library is the directive's §23 record: every property level, one of four
 * verdicts, and a prompt where the verdict is "no art yet". A document like
 * that is worth exactly as much as its agreement with the code — and a
 * hand-maintained table of eighteen rows across three files is the shape of
 * thing that agrees on the day it is written and never again.
 *
 * So the agreement is measured. Not the prose: the **counts**, the **ids** and
 * the **prompt text**, which are the parts somebody would act on.
 */

const LIBRARY = readFileSync(
  resolve(import.meta.dirname, '../../../docs/LEVEL_ASSET_EVOLUTION_LIBRARY.md'),
  'utf8',
);

/** Every property level, flattened — the set the library must account for. */
const LEVELS = PROPERTIES.flatMap((spec) =>
  Array.from({ length: spec.maxLevel }, (_, index) => ({
    id: spec.id,
    level: index + 1,
    art: propertyLevelArt(spec.id, index + 1),
  })),
);

describe('the level art library', () => {
  it('accounts for every property level and nothing else', () => {
    // Eighteen rows, and the document says eighteen. A tally that drifts from
    // the ladder is the first sign the table stopped being read.
    expect(LEVELS).toHaveLength(18);
    expect(LIBRARY).toContain('Eighteen rows');
  });

  it('publishes the verdict tally the config actually produces', () => {
    const verified = LEVELS.filter((row) => row.art.kind === 'sprite').length;
    const prompted = LEVELS.filter((row) => row.art.kind === 'prompted').length;
    const procedural = LEVELS.filter((row) => row.art.kind === 'procedural').length;

    /*
     * Asserted against the document's own sentence rather than against a
     * constant here, so the failure names the line a person has to fix.
     */
    expect(LIBRARY).toContain(
      `**Tally: ${String(verified)} VERIFIED ASSET · ${String(prompted)} EXTERNAL PROMPT REQUIRED · ` +
        `${String(procedural)} PROCEDURAL BY DESIGN · 0 INTENTIONALLY NON-VISUAL · 0 unclassified.**`,
    );
  });

  it('names a filed prompt for every level that has no art', () => {
    /*
     * The load-bearing claim. Seven levels are buyable with no picture; each one
     * must point at a prompt id that exists in the catalogue, or the card's
     * "Görsel üretimde" is a promise nobody made.
     */
    const filed = new Map(auditPrompts().map((entry) => [entry.file, entry]));
    const promptIds = LIBRARY.match(/\bP3\d\d\b/g) ?? [];
    expect(new Set(promptIds).size).toBeGreaterThanOrEqual(
      LEVELS.filter((row) => row.art.kind === 'prompted').length,
    );

    for (const file of [
      'struct_counter_lv3@2x.png',
      'struct_grill_lv3@2x.png',
      'struct_counter_wide_lv1@2x.png',
      'struct_forecourt_lv1@2x.png',
      'struct_sign_large_lit_upper@2x.png',
      'struct_frontage_lights@2x.png',
      // Filed 2026-08-22 for frontage Lv2, and deliberately not re-numbered.
      'struct_sign_large_painted_upper@2x.png',
    ]) {
      expect(filed.has(file), `${file} is named in the library and not in the catalogue`).toBe(true);
    }
  });

  it('reproduces each prompt verbatim, so the two cannot drift', () => {
    /*
     * The document exists to be copied out of. If its SUBJECT line and the
     * generator's differ by a word, somebody generates the wrong asset and
     * every downstream check passes — the file will be the right size, in the
     * right palette, and of the wrong thing.
     */
    const subjectLine = /^\[SUBJECT: (.+)\]$/m;
    for (const entry of auditPrompts()) {
      if (entry.batch !== 'restaurant-evolution') continue;
      const subject = subjectLine.exec(entry.prompt)?.[1];
      expect(subject, `${entry.file} has no SUBJECT line`).toBeDefined();
      expect(
        LIBRARY.includes(`[SUBJECT: ${subject ?? ''}]`),
        `${entry.file}: the library's SUBJECT is not the generator's`,
      ).toBe(true);
    }
  });

  it('files the new prompts as one batch, because they reference each other', () => {
    const batch = auditPrompts().filter((entry) => entry.batch === 'restaurant-evolution');
    expect(batch).toHaveLength(6);
    // Each is a swap into an existing frame's canvas, so each names the frame
    // it replaces. A prompt that named nothing would be a new object.
    for (const entry of batch) {
      expect(entry.prompt, `${entry.file} references no delivered asset`).toMatch(
        /struct_[a-z0-9_]+|px at 2x/,
      );
    }
  });
});
