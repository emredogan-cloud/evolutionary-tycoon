import { readFileSync } from 'node:fs';
import { PATHS } from './paths.ts';
import { readPromptBlock } from './promptBlock.ts';
import { loadSubjectDimensions, resolveExpectation, spriteFor } from './subjectDimensions.ts';
import type { SubjectDimensions } from './subjectDimensions.ts';
import { parseAssetName } from './naming.ts';

/**
 * Turns the batch list into the exact text to send to the generator.
 *
 * ASSET_PIPELINE §4.3 step 2 defines a prompt as the immutable block plus two
 * lines that vary — `SUBJECT` and `SIZE HINT`. This assembles both for every
 * asset in the stage 1–2 set, so generation is a mechanical pass rather than a
 * hundred and sixty judgement calls about wording. Consistency comes from the
 * contract being identical every time, which is only true if nobody is retyping
 * it.
 *
 * The `SIZE HINT` is **derived**, not written down: `spriteMetrics` projects the
 * subject's world dimensions, so the number in the prompt is the number the
 * validator will check the result against. When those were two separately
 * maintained values they disagreed by 3x on vehicles.
 *
 * Every emitted filename is run through `parseAssetName`, so a batch definition
 * that would produce an unparseable name fails here rather than after someone
 * has paid to generate it.
 */

export interface PromptedAsset {
  readonly file: string;
  readonly subjectKey: string;
  readonly batch: string;
  readonly describe: string;
  readonly prompt: string;
  /** Derived sprite size at 2x, or null for fixed-canvas categories. */
  readonly size: { width: number; height: number } | null;
  readonly split: boolean;
}

interface BatchAsset {
  readonly name?: string;
  readonly variant?: string;
  readonly state?: string;
  readonly file?: string;
  readonly subject: string;
  readonly describe: string;
}

interface Archetype {
  readonly name: string;
  readonly describe: string;
  readonly subject: string;
}

interface Batch {
  readonly id: string;
  readonly category: string;
  readonly describePrefix?: string;
  readonly assets?: readonly BatchAsset[];
  readonly archetypes?: readonly Archetype[];
  readonly variants?: readonly string[];
  readonly subjects?: readonly string[];
  readonly directions?: readonly string[];
  readonly states?: readonly string[];
  readonly brakeDirections?: readonly string[];
  readonly subject?: string;
  readonly part?: string;
}

interface BatchFile {
  readonly version: number;
  readonly tool: string;
  readonly goldenReferences: { readonly note: string; readonly assets: readonly BatchAsset[] };
  readonly batches: readonly Batch[];
}

export function loadBatches(path: string = PATHS.productionBatches): BatchFile {
  return JSON.parse(readFileSync(path, 'utf8')) as BatchFile;
}

/** `<category>_<name>_<variant>[_<direction>][_<state>]@2x.png`. */
function filenameOf(parts: {
  category: string;
  name: string;
  variant: string;
  direction?: string;
  state?: string;
}): string {
  const fields = [parts.category, parts.name, parts.variant, parts.direction, parts.state].filter(
    (field): field is string => field !== undefined && field !== '',
  );
  return `${fields.join('_')}@2x.png`;
}

function sizeHint(
  subjectKey: string,
  table: SubjectDimensions,
): { text: string; size: { width: number; height: number } | null; split: boolean } {
  const expectation = resolveExpectation(subjectKey, table);
  const sprite = spriteFor(subjectKey, table);

  if (sprite !== null) {
    const { metrics, box } = sprite;
    // Split on BODY height, not sprite height — §1.4's 160 px is 2.5 m of
    // object. See checkSplitRule.
    const split = expectation?.mode === 'reference' && expectation.splitExpected;
    const text = split
      ? `${metrics.width} x ${metrics.height} px overall for a ${box.footprintX} x ${box.footprintY} x ${box.heightMetres} m object. ` +
        `EXCEEDS the 160px limit, so produce TWO images, _lower and _upper, each complete and cut at the same horizontal line`
      : `${metrics.width} x ${metrics.height} px for a ${box.footprintX} x ${box.footprintY} x ${box.heightMetres} m object`;
    return { text, size: { width: metrics.width, height: metrics.height }, split };
  }

  if (expectation?.mode === 'canvas') {
    return {
      text: `${expectation.width} x ${expectation.height} px canvas`,
      size: { width: expectation.width, height: expectation.height },
      split: false,
    };
  }

  if (expectation?.mode === 'envelope') {
    return {
      text: `no taller than ${expectation.height} px — one part of an assembled adult, drawn at the scale it will be assembled at`,
      size: null,
      split: false,
    };
  }

  return {
    text: 'UNDECLARED — add this subject to docs/assets/subjectDimensions.json',
    size: null,
    split: false,
  };
}

function assemble(block: string, describe: string, hint: string, golden: string): string {
  return [
    block,
    '',
    `[REFERENCE IMAGES: ${golden}]`,
    '---',
    `[SUBJECT: ${describe}]`,
    `[SIZE HINT: ${hint}]`,
  ].join('\n');
}

export interface EmitOptions {
  readonly batchesPath?: string;
  readonly promptBlockPath?: string;
  readonly table?: SubjectDimensions;
}

export function emitPrompts(options: EmitOptions = {}): PromptedAsset[] {
  const file = loadBatches(options.batchesPath ?? PATHS.productionBatches);
  const block = readPromptBlock(options.promptBlockPath ?? PATHS.promptBlock).text;
  const table = options.table ?? loadSubjectDimensions();
  const out: PromptedAsset[] = [];
  const emitted = new Set<string>();

  const push = (
    batch: string,
    fileName: string,
    subjectKey: string,
    describe: string,
    golden: string,
  ): void => {
    const hint = sizeHint(subjectKey, table);

    /*
     * A subject taller than the split limit exists only as two files, never one
     * (ASSET_PIPELINE §1.4), so the emitter produces both. Emitting the whole
     * object and leaving "also do an upper half" to a note is how a `_lower`
     * ships without its `_upper` and renders as a floating stump.
     */
    const names = hint.split
      ? (['lower', 'upper'] as const).map((half) => fileName.replace('@2x.png', `_${half}@2x.png`))
      : [fileName];

    for (const name of names) {
      const parsed = parseAssetName(name);
      if (!parsed.ok) {
        throw new Error(`batch "${batch}" would produce an invalid filename ${name}: ${parsed.reason}`);
      }
      /*
       * A golden reference IS a production asset — §4.3 step 1 picks one
       * character, one vehicle, one table, one appliance from the real set. It is
       * generated once, as the golden, and the batch that would also have
       * produced it skips it rather than asking for it twice.
       */
      if (emitted.has(name)) continue;
      emitted.add(name);

      const half = parsed.name.splitPart;
      const described =
        half === null
          ? describe
          : `${describe} — the ${half.toUpperCase()} half only, cut at the same horizontal line as its partner`;

      out.push({
        file: name,
        subjectKey,
        batch,
        describe: described,
        prompt: assemble(block, described, hint.text, golden),
        size: hint.size,
        split: hint.split,
      });
    }
  };

  // The golden references come first and cite no reference of their own — they
  // are what everything else will be referenced against.
  for (const asset of file.goldenReferences.assets) {
    const fileName = asset.file ?? '';
    const parsed = parseAssetName(fileName);
    if (!parsed.ok) throw new Error(`golden reference ${fileName}: ${parsed.reason}`);
    const hint = sizeHint(asset.subject, table);
    emitted.add(fileName);
    out.push({
      file: fileName,
      subjectKey: asset.subject,
      batch: 'golden-references',
      describe: asset.describe,
      prompt: assemble(block, asset.describe, hint.text, 'none — this IS the reference'),
      size: hint.size,
      split: hint.split,
    });
  }

  const golden = 'the approved golden reference set for this category';

  for (const batch of file.batches) {
    const prefix = batch.describePrefix === undefined ? '' : `${batch.describePrefix}; `;

    if (batch.assets !== undefined) {
      for (const asset of batch.assets) {
        const fileName = filenameOf({
          category: batch.category,
          name: asset.name ?? '',
          variant: asset.variant ?? 'default',
          ...(asset.state === undefined ? {} : { state: asset.state }),
        });
        push(batch.id, fileName, asset.subject, `${prefix}${asset.describe}`, golden);
      }
      continue;
    }

    if (batch.archetypes !== undefined) {
      for (const archetype of batch.archetypes) {
        for (const variant of batch.variants ?? ['default']) {
          for (const direction of batch.directions ?? [undefined]) {
            const states = [
              '',
              ...(batch.brakeDirections?.includes(direction ?? '') === true ? ['brake'] : []),
            ];
            for (const state of batch.states ?? states) {
              const fileName = filenameOf({
                category: batch.category,
                name: archetype.name,
                variant,
                ...(direction === undefined ? {} : { direction }),
                state,
              });
              const facing = direction === undefined ? '' : `, facing ${direction}`;
              const braking = state === 'brake' ? ', brake lights lit' : '';
              push(
                batch.id,
                fileName,
                archetype.subject,
                `${prefix}${archetype.describe} in ${variant}${facing}${braking}`,
                golden,
              );
            }
          }
        }
      }
      continue;
    }

    // Character parts: one subject, many variants and directions.
    for (const part of batch.subjects ?? [batch.subject?.split('/')[1] ?? '']) {
      for (const variant of batch.variants ?? ['default']) {
        for (const direction of batch.directions ?? [undefined]) {
          const fileName = filenameOf({
            category: batch.category,
            name: part,
            variant,
            ...(direction === undefined ? {} : { direction }),
          });
          const facing = direction === undefined ? '' : `, facing ${direction}`;
          push(
            batch.id,
            fileName,
            `${batch.category}/${part}`,
            `${prefix}variant ${variant}${facing}`,
            golden,
          );
        }
      }
    }
  }

  return out;
}
