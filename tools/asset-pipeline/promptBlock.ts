import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PATHS } from './paths.ts';

/**
 * Reads the immutable prompt block and hashes it.
 *
 * ASSET_PIPELINE §4.3 step 2 calls the block "the unchanging body" of every
 * generation prompt, and step 6 records a prompt hash against every accepted
 * asset. "Immutable" enforced by good intentions is not immutable, so it is
 * enforced by hash instead: the block between the two markers is hashed here,
 * `tests/unit/tools/promptBlock.test.ts` asserts it against the value recorded
 * in the document, and `manifest.ts` stamps it onto every asset row.
 *
 * The consequence is the one that matters three months from now: an asset in
 * `MANIFEST.md` names the exact contract text it was generated under, so
 * "generate a matching hat for this character" is answerable rather than a
 * guess, and a silent edit to the style contract cannot pass unnoticed.
 */

/**
 * The markers must stand alone on their own line.
 *
 * A plain substring search finds the first occurrence, and the document
 * *explains* its own markers in prose above the block — so a substring search
 * hashes the sentence describing the mechanism rather than the contract itself,
 * quietly and with a plausible-looking hash. Anchoring to a whole line makes the
 * inline mention in backticks unmatchable, and requiring exactly one of each
 * turns a second block into an error instead of a coin flip.
 */
const BEGIN = /^<!-- PROMPT-BLOCK:BEGIN -->$/gm;
const END = /^<!-- PROMPT-BLOCK:END -->$/gm;

function soleMatch(document: string, pattern: RegExp, label: string): RegExpExecArray {
  const [first, ...rest] = [...document.matchAll(pattern)];
  if (first === undefined || rest.length > 0) {
    const found = first === undefined ? 0 : rest.length + 1;
    throw new Error(`prompt block: expected exactly one ${label} marker on its own line, found ${found}`);
  }
  return first;
}

/** The recorded hash line in the document, so the doc and the code agree. */
const RECORDED_HASH_PATTERN = /\n```\n([0-9a-f]{64})\n```\n/;

export interface PromptBlock {
  /** The block text, normalised to LF with no leading or trailing blank lines. */
  readonly text: string;
  readonly hash: string;
  /** The hash written into PROMPT_BLOCK.md, for the test to compare against. */
  readonly recordedHash: string | null;
}

export function readPromptBlock(path: string = PATHS.promptBlock): PromptBlock {
  const document = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

  const begin = soleMatch(document, BEGIN, 'BEGIN');
  const end = soleMatch(document, END, 'END');
  if (end.index < begin.index) {
    throw new Error(`${path}: the END marker appears before the BEGIN marker`);
  }

  const text = document.slice(begin.index + begin[0].length, end.index).trim();
  if (text.length === 0) {
    throw new Error(`${path}: the prompt block is empty`);
  }

  const recorded = RECORDED_HASH_PATTERN.exec(document);

  return {
    text,
    hash: createHash('sha256').update(text, 'utf8').digest('hex'),
    recordedHash: recorded?.[1] ?? null,
  };
}
