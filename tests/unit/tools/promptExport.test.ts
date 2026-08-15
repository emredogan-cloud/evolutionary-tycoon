import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitPrompts } from '../../../tools/asset-pipeline/prompts.ts';
import { numberPrompts, renderPromptHtml } from '../../../tools/asset-pipeline/promptExport.ts';

/**
 * The handover artefact, checked for the things that would waste somebody's
 * afternoon.
 *
 * Generation happens outside this environment, so this page is the whole
 * interface between the pipeline and the person doing the work. The failure mode
 * that matters is not an ugly page — it is a *missing* prompt, or a prompt whose
 * style block was helpfully reflowed on the way out. Both are silent, and both
 * are discovered only after the art has been made wrong.
 */

const EXPECTED_PROMPTS = 172;
const HTML_PATH = resolve(import.meta.dirname, '../../../docs/ASSET_GENERATION_PROMPTS.html');

describe('prompt numbering', () => {
  const numbered = numberPrompts(emitPrompts());

  it('assigns exactly one id per prompt', () => {
    expect(numbered).toHaveLength(EXPECTED_PROMPTS);
    expect(new Set(numbered.map((asset) => asset.id)).size).toBe(EXPECTED_PROMPTS);
  });

  it('numbers in emission order, zero-padded and stable', () => {
    expect(numbered[0]?.id).toBe('P001');
    expect(numbered[171]?.id).toBe('P172');
    numbered.forEach((asset, index) => {
      expect(asset.index).toBe(index + 1);
    });
  });

  it('is deterministic across runs', () => {
    const again = numberPrompts(emitPrompts());
    expect(again.map((asset) => `${asset.id}:${asset.file}`)).toEqual(
      numbered.map((asset) => `${asset.id}:${asset.file}`),
    );
  });

  it('leaves no prompt, subject or target empty', () => {
    for (const asset of numbered) {
      expect(asset.prompt.trim().length, asset.id).toBeGreaterThan(0);
      expect(asset.describe.trim().length, asset.id).toBeGreaterThan(0);
      expect(asset.file.trim().length, asset.id).toBeGreaterThan(0);
      expect(asset.subjectKey.trim().length, asset.id).toBeGreaterThan(0);
      expect(asset.batch.trim().length, asset.id).toBeGreaterThan(0);
    }
  });

  it('gives every prompt a size hint', () => {
    for (const asset of numbered) {
      expect(asset.prompt, asset.id).toContain('[SIZE HINT:');
      expect(asset.prompt, asset.id).not.toContain('UNDECLARED');
    }
  });
});

describe('the exported page', () => {
  const numbered = numberPrompts(emitPrompts());
  const html = renderPromptHtml(numbered);

  it('contains every prompt id exactly once', () => {
    for (const asset of numbered) {
      const occurrences = html.split(`>${asset.id}<`).length - 1;
      expect(occurrences, asset.id).toBe(1);
    }
  });

  it('contains every target filename', () => {
    for (const asset of numbered) {
      expect(html, asset.id).toContain(asset.file);
    }
  });

  it('reproduces every prompt body without truncation', () => {
    // The assertion that matters most. An escaped prompt read back through
    // textContent returns the original bytes, so what the copy button yields is
    // exactly what emitPrompts produced.
    const escape = (value: string): string =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    for (const asset of numbered) {
      expect(html, asset.id).toContain(`<pre>${escape(asset.prompt)}</pre>`);
    }
  });

  it('never elides a prompt body', () => {
    // Scoped to the <pre> blocks on purpose: the search box's placeholder ends
    // in an ellipsis, which is ordinary UI text. What must never contain one is
    // a prompt, because that is indistinguishable from a truncated contract.
    const bodies = [...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map((match) => match[1] ?? '');
    expect(bodies).toHaveLength(EXPECTED_PROMPTS);
    for (const body of bodies) {
      expect(body).not.toContain('…');
      expect(body).not.toMatch(/\.\.\.\s*\(truncated/i);
      expect(body).not.toMatch(/and \d+ more/i);
      // Every prompt carries the whole style contract, not a reference to it.
      expect(body).toContain('STYLE');
      expect(body).toContain('HEIGHT LIMIT');
    }
  });

  it('lists every batch as its own section', () => {
    const batches = [...new Set(numbered.map((asset) => asset.batch))];
    expect(batches).toHaveLength(12);
    for (const batch of batches) {
      expect(html).toContain(`id="batch-${batch}"`);
    }
  });

  it('offers a filter for every category present', () => {
    for (const category of new Set(numbered.map((asset) => asset.subjectKey.split('/')[0]))) {
      expect(html).toContain(`data-cat="${category}"`);
    }
  });

  it('shows the counts a reader would check first', () => {
    expect(html).toContain(`<b>${EXPECTED_PROMPTS}</b><span>prompts</span>`);
    expect(html).toContain('<b>12</b><span>batches</span>');
  });

  it('is self-contained and offline', () => {
    // No network of any kind: the page has to work from file:// on a machine
    // with no connection.
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/https?:\/\/(?!evolutionary-tycoon)/);
    expect(html).toContain('<meta charset="utf-8">');
  });

  it('provides a clipboard fallback for the non-secure file:// context', () => {
    // navigator.clipboard is unavailable when the page is opened from disk, and
    // a copy button that silently does nothing is worse than no button.
    expect(html).toContain('execCommand');
    expect(html).toContain('isSecureContext');
  });

  it('offers per-prompt and per-batch copying', () => {
    expect(html.split('data-copy="one"').length - 1).toBe(EXPECTED_PROMPTS);
    expect(html.split('data-copy="batch"').length - 1).toBe(12);
  });

  it('renders identically on a second run', () => {
    expect(renderPromptHtml(numberPrompts(emitPrompts()))).toBe(html);
  });
});

describe('the committed page on disk', () => {
  it('is present and matches a fresh render', () => {
    // Guards the case where someone edits a batch definition and forgets to
    // re-export, leaving the person doing the generating with a stale page.
    const onDisk = readFileSync(HTML_PATH, 'utf8');
    expect(onDisk).toBe(renderPromptHtml(numberPrompts(emitPrompts())));
  });

  it('carries all 172 prompts', () => {
    const onDisk = readFileSync(HTML_PATH, 'utf8');
    expect(onDisk.split('data-copy="one"').length - 1).toBe(EXPECTED_PROMPTS);
  });
});
