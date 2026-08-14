import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Determinism, part 5 — a standing AST scan of `src/sim`.
 *
 * ESLint already bans these, and `tests/unit/architecture/enforcement.test.ts`
 * proves the ESLint rules actually fire. So why scan again?
 *
 * Because the ESLint ban is one `eslint-disable` comment away from being
 * silenced, and whoever writes that comment will have a good reason and no idea
 * what it costs. This scan has no opt-out. It reads the real source tree and
 * parses it with the real TypeScript parser, so a match inside a comment or a
 * string literal cannot produce a false positive and a disable comment cannot
 * produce a false negative.
 *
 * One `Math.random()` in here destroys headless testing, CI economy validation,
 * pixel-exact visual regression, reproducible bug reports and the Day Replay
 * feature simultaneously — and the damage surfaces months later as "flaky tests".
 */

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const SIM_ROOT = resolve(REPO_ROOT, 'src/sim');

const FORBIDDEN_MEMBER_ACCESS: readonly (readonly [string, string])[] = [
  ['Math', 'random'],
  ['Date', 'now'],
  ['performance', 'now'],
];

const FORBIDDEN_CALLEES: ReadonlySet<string> = new Set([
  'setTimeout',
  'setInterval',
  'setImmediate',
  'requestAnimationFrame',
  'requestIdleCallback',
  'queueMicrotask',
]);

const FORBIDDEN_IDENTIFIERS: ReadonlySet<string> = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
]);

const FORBIDDEN_IMPORTS: readonly RegExp[] = [
  /^phaser$/,
  /^svelte(\/|$)/,
  /^idb$/,
  /^@(render|ui|app|persistence|platform)\//,
  /\.\.\/(render|ui|app|persistence|platform)\//,
];

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly what: string;
}

/** The scanner itself, separated from the filesystem so the self-test can drive it. */
function scanSource(filePath: string, source: string): Finding[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2022, true);
  const findings: Finding[] = [];

  const report = (node: ts.Node, what: string): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({ file: filePath, line: line + 1, what });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const object = node.expression.text;
      const property = node.name.text;
      for (const [forbiddenObject, forbiddenProperty] of FORBIDDEN_MEMBER_ACCESS) {
        if (object === forbiddenObject && property === forbiddenProperty) {
          report(node, `${object}.${property}`);
        }
      }
    }

    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date') {
      report(node, 'new Date()');
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      if (FORBIDDEN_CALLEES.has(callee)) report(node, `${callee}()`);
    }

    // Bare references to browser globals. Declaration and property *names* are
    // skipped, so one of our own fields called `document` is not a finding.
    if (ts.isIdentifier(node) && FORBIDDEN_IDENTIFIERS.has(node.text)) {
      const parent: ts.Node = node.parent;
      const isName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertySignature(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isPropertyDeclaration(parent) && parent.name === node) ||
        (ts.isMethodDeclaration(parent) && parent.name === node) ||
        (ts.isMethodSignature(parent) && parent.name === node) ||
        (ts.isParameter(parent) && parent.name === node) ||
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.name === node);
      if (!isName) report(node, node.text);
    }

    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier !== undefined && ts.isStringLiteral(specifier)) {
        for (const pattern of FORBIDDEN_IMPORTS) {
          if (pattern.test(specifier.text)) report(node, `import "${specifier.text}"`);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsFiles(full, out);
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('determinism — src/sim contains no non-deterministic construct', () => {
  const files = collectTsFiles(SIM_ROOT);

  it('finds simulation source to scan', () => {
    // A scan that silently found nothing would pass forever.
    expect(files.length).toBeGreaterThan(5);
  });

  it('has no forbidden global, timer, wall-clock read or cross-layer import', () => {
    const findings = files.flatMap((file) =>
      scanSource(relative(REPO_ROOT, file), readFileSync(file, 'utf8')),
    );
    const rendered = findings.map((f) => `${f.file}:${f.line} — ${f.what}`).join('\n');
    expect(findings, `Forbidden constructs found under src/sim:\n${rendered}`).toEqual([]);
  });
});

describe('the scanner itself', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['Math.random', 'export const x = Math.random();'],
    ['Date.now', 'export const t = Date.now();'],
    ['new Date()', 'export const d = new Date();'],
    ['performance.now', 'export const p = performance.now();'],
    ['setTimeout()', 'setTimeout(() => undefined, 0);'],
    ['setInterval()', 'setInterval(() => undefined, 0);'],
    ['requestAnimationFrame()', 'requestAnimationFrame(() => undefined);'],
    ['queueMicrotask()', 'queueMicrotask(() => undefined);'],
    ['window', 'export const w = window.innerWidth;'],
    ['document', 'export const b = document.body;'],
    ['localStorage', 'export const v = localStorage.getItem("k");'],
    ['indexedDB', 'export const f = indexedDB.open("db");'],
    ['fetch', 'export const r = fetch("/x");'],
    ['import "phaser"', 'import Phaser from "phaser";\nexport const e = Phaser;'],
    ['import "svelte"', 'import { mount } from "svelte";\nexport const m = mount;'],
    ['import "idb"', 'import { openDB } from "idb";\nexport const o = openDB;'],
    ['import "@render/x"', 'import { x } from "@render/x";\nexport const y = x;'],
    ['import "@ui/x"', 'import { x } from "@ui/x";\nexport const y = x;'],
    ['import "@persistence/x"', 'import { x } from "@persistence/x";\nexport const y = x;'],
    ['import "../platform/x"', 'import { x } from "../platform/x";\nexport const y = x;'],
  ];

  it.each(cases)('detects %s', (_label, source) => {
    // Without this, a scanner broken by a TypeScript AST change would report a
    // clean tree forever — the exact failure mode this file exists to prevent.
    expect(scanSource('probe.ts', source).length).toBeGreaterThan(0);
  });

  it('ignores matches inside comments and string literals', () => {
    // The reason this is an AST scan and not a grep.
    const source = [
      '// Math.random() is banned here',
      '/* Date.now() too, and window */',
      'export const message = "do not call performance.now() or fetch()";',
    ].join('\n');
    expect(scanSource('probe.ts', source)).toEqual([]);
  });

  it('ignores our own members that happen to share a forbidden name', () => {
    const source = [
      'interface Ctx { readonly document: string; readonly fetch: number }',
      'export function read(ctx: Ctx): string { return ctx.document; }',
    ].join('\n');
    expect(scanSource('probe.ts', source)).toEqual([]);
  });

  it('accepts ordinary deterministic simulation code', () => {
    const source = [
      'import { TICK_MS } from "@config/simulation";',
      'export function step(value: number): number { return value + TICK_MS; }',
    ].join('\n');
    expect(scanSource('probe.ts', source)).toEqual([]);
  });
});
