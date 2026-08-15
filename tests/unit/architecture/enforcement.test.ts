import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * These spawn ESLint and dependency-cruiser as child processes against fixture
 * files, so each one is seconds rather than milliseconds — and the whole file is
 * about 25 s on its own, more when the rest of the suite is competing for cores.
 * Past Vitest's 5 s default, which is what it started failing on.
 *
 * The subprocess is the point: the test proves the *real* configuration rejects
 * a violation, not that a copy of the rule does. So the timeout moves rather
 * than the mechanism.
 */
const ENFORCEMENT_TIMEOUT_MS = 120_000;

/**
 * Proof that the architecture and determinism guards actually fire.
 *
 * docs/WORKING_DISCIPLINE.md §2.1–2.2 declare that `src/sim` is pure,
 * renderer-free and deterministic, and that `src/ui` may not import the
 * simulation. A rule nobody has ever watched fail is indistinguishable from a
 * rule that does not work — and this project runs across many sessions with
 * context resets (risk R20), so "we all know not to do that" is not an
 * enforcement mechanism.
 *
 * These tests write deliberately illegal files into the real source tree, run
 * the real tools with the real configs, assert the expected rule name appears,
 * and clean up. Anything less — a synthetic ruleset, a fixture directory outside
 * src — would test a copy of the rule rather than the rule that guards the build.
 *
 * Everything here is `concurrent: false` and lives in ONE file on purpose: these
 * tests mutate a shared resource (the source tree), so they must never run
 * concurrently with each other.
 */

const FIXTURE_DIRS = ['src/sim/__fixture__', 'src/ui/__fixture__', 'src/config/__fixture__'] as const;

function writeFixture(relPath: string, contents: string): void {
  mkdirSync(relPath.slice(0, relPath.lastIndexOf('/')), { recursive: true });
  writeFileSync(relPath, contents, 'utf8');
}

interface ToolResult {
  readonly exitCode: number;
  readonly output: string;
}

function run(args: string[]): ToolResult {
  try {
    const output = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { exitCode: 0, output };
  } catch (error: unknown) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { exitCode: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const depcruise = (): ToolResult =>
  run([
    'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
    'src',
    '--config',
    '.dependency-cruiser.cjs',
  ]);

const lint = (file: string): ToolResult =>
  run(['node_modules/eslint/bin/eslint.js', file, '--format', 'json']);

afterEach(() => {
  for (const dir of FIXTURE_DIRS) rmSync(dir, { recursive: true, force: true });
});

describe('architecture enforcement', { concurrent: false }, () => {
  it('the real source tree has zero violations', () => {
    const { exitCode, output } = depcruise();
    expect(output).toContain('no dependency violations found');
    expect(exitCode).toBe(0);
  });

  it.each([
    ['renderer import', "import Phaser from 'phaser';\nexport const x = Phaser;\n", 'sim-no-phaser'],
    ['UI framework import', "import { mount } from 'svelte';\nexport const x = mount;\n", 'sim-no-svelte'],
    [
      'platform-layer import',
      "import { buildInfo } from '../../platform/buildInfo';\nexport const x = buildInfo;\n",
      'sim-no-persistence-or-platform',
    ],
  ])(
    'dependency-cruiser rejects a %s from src/sim',
    (_label, source, rule) => {
      writeFixture('src/sim/__fixture__/illegal.ts', source);

      const { exitCode, output } = depcruise();

      expect(exitCode).not.toBe(0);
      expect(output).toContain(rule);
    },
    ENFORCEMENT_TIMEOUT_MS,
  );

  it(
    'dependency-cruiser rejects a direct simulation import from src/ui',
    () => {
      // The UI must read a throttled view model through src/app/bridge. Importing
      // the simulation directly is how a UI ends up running per frame.
      writeFixture('src/sim/__fixture__/thing.ts', 'export const thing = 1;\n');
      writeFixture(
        'src/ui/__fixture__/illegal.ts',
        "import { thing } from '../../sim/__fixture__/thing';\nexport const x = thing;\n",
      );

      const { exitCode, output } = depcruise();

      expect(exitCode).not.toBe(0);
      expect(output).toContain('ui-no-sim');
    },
    ENFORCEMENT_TIMEOUT_MS,
  );

  it(
    'dependency-cruiser rejects a non-data import from src/config',
    () => {
      writeFixture(
        'src/config/__fixture__/illegal.ts',
        "import { buildInfo } from '../../platform/buildInfo';\nexport const x = buildInfo;\n",
      );

      const { exitCode, output } = depcruise();

      expect(exitCode).not.toBe(0);
      expect(output).toContain('config-is-data-only');
    },
    ENFORCEMENT_TIMEOUT_MS,
  );
});

describe('src/sim determinism guards', { concurrent: false }, () => {
  const FIXTURE = 'src/sim/__fixture__/violation.ts';

  it.each([
    ['Math.random()', 'export const v = Math.random();\n', 'Math.random() is banned'],
    ['Date.now()', 'export const v = Date.now();\n', 'Date.now() is banned'],
    ['new Date()', 'export const v = new Date();\n', 'new Date() is banned'],
    ['performance.now()', 'export const v = performance.now();\n', 'performance.now() is banned'],
    [
      'setTimeout',
      'export function f(): void {\n  setTimeout(() => undefined, 1);\n}\n',
      'Timers are banned',
    ],
    [
      'requestAnimationFrame',
      'export function f(): void {\n  requestAnimationFrame(() => undefined);\n}\n',
      'Timers are banned',
    ],
  ])('ESLint rejects %s in src/sim', (_label, source, expectedMessage) => {
    writeFixture(FIXTURE, source);

    const { exitCode, output } = lint(FIXTURE);

    expect(exitCode).not.toBe(0);
    expect(output).toContain(expectedMessage);
  });

  it.each([
    ['phaser', "import Phaser from 'phaser';\nexport const v = Phaser;\n"],
    ['svelte', "import { mount } from 'svelte';\nexport const v = mount;\n"],
  ])(
    'ESLint rejects an import of %s from src/sim',
    (_label, source) => {
      writeFixture(FIXTURE, source);

      const { exitCode, output } = lint(FIXTURE);

      expect(exitCode).not.toBe(0);
      expect(output).toContain('no-restricted-imports');
    },
    ENFORCEMENT_TIMEOUT_MS,
  );

  it(
    'ESLint accepts deterministic code',
    () => {
      writeFixture(FIXTURE, 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');

      const { exitCode } = lint(FIXTURE);

      expect(exitCode).toBe(0);
    },
    ENFORCEMENT_TIMEOUT_MS,
  );
});
