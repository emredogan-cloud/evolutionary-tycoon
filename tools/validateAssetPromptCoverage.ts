/**
 * Prompt-catalog coverage gate — the 2026-08-21 audit's arithmetic, re-derived
 * on every run.
 *
 * The requirements matrix (`docs/assets/assetRequirements.json`) is the single
 * machine-readable statement of what art the game needs; the catalog
 * (`docs/ASSET_GENERATION_PROMPTS.html`) is the single place generation
 * prompts live. This tool holds the two to each other:
 *
 *   - every image-required row (MISSING + PROMPT ADDED, PRESENT + NEEDS REGEN)
 *     has exactly ONE canonical prompt whose target file matches, under the id
 *     the matrix assigned;
 *   - no two canonical prompts target the same file (a card marked
 *     `data-superseded-by` is history, not a duplicate — its wording stays
 *     byte-stable per the catalog's own rule);
 *   - no canonical prompt targets a file the matrix knows nothing about;
 *   - statuses that need no prompt (PROCEDURAL BY DESIGN, NOT REQUIRED,
 *     DEBUG ONLY) and PRESENT + VERIFIED provenance prompts are the allowed
 *     exceptions, exactly as the audit directive lists them.
 *
 * Exit 1 on any MISSING / DUPLICATE / ORPHAN — the build fails rather than
 * letting the catalog and the matrix drift apart.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface RequirementRow {
  readonly id: string;
  readonly status: string;
  readonly prompt: string | null;
}

const root = resolve(import.meta.dirname, '..');
const rows = JSON.parse(
  readFileSync(resolve(root, 'docs/assets/assetRequirements.json'), 'utf8'),
) as RequirementRow[];
const html = readFileSync(resolve(root, 'docs/ASSET_GENERATION_PROMPTS.html'), 'utf8');

const cardPattern =
  /<article class="card"(?<attrs>[^>]*)>\s*<div class="head">\s*<span class="pid">(?<pid>P\d+)<\/span>\s*<span class="file">(?<file>[^<]+)<\/span>/g;

const canonicalByFile = new Map<string, string>();
const duplicates: string[] = [];
let cardCount = 0;
let supersededCount = 0;
for (const match of html.matchAll(cardPattern)) {
  cardCount++;
  const { attrs, pid, file } = match.groups as { attrs: string; pid: string; file: string };
  if (attrs.includes('data-superseded-by')) {
    supersededCount++;
    continue;
  }
  const existing = canonicalByFile.get(file);
  if (existing !== undefined) duplicates.push(`${file} (${existing} and ${pid})`);
  else canonicalByFile.set(file, pid);
}

const needsPrompt = rows.filter(
  (row) => row.status === 'MISSING + PROMPT ADDED' || row.status === 'PRESENT + NEEDS REGEN',
);
const missing: string[] = [];
for (const row of needsPrompt) {
  const file = `${row.id}@2x.png`;
  const pid = canonicalByFile.get(file);
  if (pid === undefined) missing.push(`${row.id} (matrix says ${String(row.prompt)})`);
  else if (pid !== row.prompt)
    missing.push(`${row.id}: matrix says ${String(row.prompt)}, catalog's canonical is ${pid}`);
}

const knownFiles = new Set(rows.map((row) => `${row.id}@2x.png`));
const orphans = [...canonicalByFile.keys()].filter((file) => !knownFiles.has(file));

const requiredCount = needsPrompt.length;
console.log(`REQUIRED IMAGE ASSETS  ${String(requiredCount)}`);
console.log(
  `PROMPTS PRESENT        ${String(requiredCount - missing.length)} (canonical cards ${String(canonicalByFile.size)}, superseded ${String(supersededCount)}, total ${String(cardCount)})`,
);
console.log(
  `PROMPTS MISSING        ${String(missing.length)}${missing.length > 0 ? ` — ${missing.join(', ')}` : ''}`,
);
console.log(
  `DUPLICATE PROMPTS      ${String(duplicates.length)}${duplicates.length > 0 ? ` — ${duplicates.join(', ')}` : ''}`,
);
console.log(
  `ORPHAN PROMPTS         ${String(orphans.length)}${orphans.length > 0 ? ` — ${orphans.join(', ')}` : ''}`,
);

if (missing.length > 0 || duplicates.length > 0 || orphans.length > 0) process.exit(1);
