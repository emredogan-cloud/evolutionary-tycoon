import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelteParser from 'svelte-eslint-parser';

/**
 * Determinism guards for src/sim.
 *
 * The simulation core must be reproducible: same seed + same command log must
 * produce the same world after N ticks, on any machine, at any tick rate. That
 * property is what makes headless testing, CI economy validation, pixel-exact
 * visual regression, reproducible bug reports and the Day Replay feature all
 * possible (docs/TECHNICAL_ARCHITECTURE.md §2).
 *
 * A single Math.random() or Date.now() anywhere under src/sim silently destroys
 * it, and the damage is only discovered much later as "flaky" tests. So the ban
 * is mechanical rather than a convention.
 */
const SIM_FORBIDDEN_SYNTAX = [
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message:
      'Math.random() is banned in src/sim — it breaks determinism. Use an injected Rng stream (rng.traffic, rng.conversion, ...).',
  },
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message:
      'Date.now() is banned in src/sim — it breaks determinism. Use the injected Clock (clock.simTimeMs).',
  },
  {
    selector: "NewExpression[callee.name='Date']",
    message:
      'new Date() is banned in src/sim — it breaks determinism. Use the injected Clock, or move the wall-clock read to src/app or src/persistence.',
  },
  {
    selector: "MemberExpression[object.name='performance'][property.name='now']",
    message:
      'performance.now() is banned in src/sim — it breaks determinism. Timing belongs to src/app (GameLoop).',
  },
  {
    selector:
      'CallExpression[callee.name=/^(setTimeout|setInterval|setImmediate|requestAnimationFrame|requestIdleCallback|queueMicrotask)$/]',
    message:
      'Timers are banned in src/sim — the simulation is driven by a fixed 20 Hz tick, not by wall-clock scheduling.',
  },
];

const SIM_FORBIDDEN_GLOBALS = [
  { name: 'window', message: 'src/sim must be renderer- and DOM-free so it can run headless in Node.' },
  { name: 'document', message: 'src/sim must be renderer- and DOM-free so it can run headless in Node.' },
  { name: 'navigator', message: 'src/sim must be renderer- and DOM-free so it can run headless in Node.' },
  { name: 'localStorage', message: 'Persistence belongs to src/persistence, not src/sim.' },
  { name: 'sessionStorage', message: 'Persistence belongs to src/persistence, not src/sim.' },
  { name: 'indexedDB', message: 'Persistence belongs to src/persistence, not src/sim.' },
  { name: 'fetch', message: 'src/sim performs no I/O. Network access belongs to src/platform.' },
  { name: 'XMLHttpRequest', message: 'src/sim performs no I/O. Network access belongs to src/platform.' },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.vercel/**',
      'playwright-report/**',
      'test-results/**',
      '.svelte-kit/**',
      'pnpm-lock.yaml',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Explicit project list rather than projectService: we deliberately keep
        // three tsconfigs (browser / node-tooling / tests) so that src/** cannot
        // reach for a Node API by accident, and the service cannot infer which
        // project owns a file outside the nearest tsconfig's include.
        project: ['./tsconfig.json', './tsconfig.node.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      // These four are the reason we are still on TypeScript 6 rather than 7:
      // typescript-eslint cannot run on TS7 yet, and type-aware rules are not
      // optional in a deterministic simulation (docs/RESEARCH_NOTES.md §2).
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        { allowString: false, allowNumber: false, allowNullableObject: false },
      ],
      '@typescript-eslint/no-unnecessary-condition': 'error',

      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // tsconfig sets noPropertyAccessFromIndexSignature, which *requires*
      // bracket access on index signatures (process.env, header maps, JSON blobs).
      // Without this option the two settings contradict each other.
      '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-param-reassign': 'error',
      'object-shorthand': 'error',
    },
  },

  /* ---- Layer: src/sim — pure, deterministic, headless ---- */
  {
    files: ['src/sim/**/*.ts'],
    languageOptions: {
      globals: {}, // no browser globals, no node globals
    },
    rules: {
      'no-restricted-syntax': ['error', ...SIM_FORBIDDEN_SYNTAX],
      'no-restricted-globals': ['error', ...SIM_FORBIDDEN_GLOBALS],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'phaser',
              message: 'src/sim must not depend on the renderer. See docs/WORKING_DISCIPLINE.md §2.1.',
            },
            {
              name: 'svelte',
              message: 'src/sim must not depend on the UI framework. See docs/WORKING_DISCIPLINE.md §2.1.',
            },
            { name: 'idb', message: 'Persistence belongs to src/persistence, not src/sim.' },
          ],
          patterns: [
            {
              group: ['@render/*', '@ui/*', '@platform/*'],
              message: 'src/sim must not import from the render, ui or platform layers.',
            },
            { group: ['svelte/*'], message: 'src/sim must not depend on the UI framework.' },
          ],
        },
      ],
    },
  },

  /* ---- Layer: src/ui — Svelte allowed, simulation only via the bridge ---- */
  {
    files: ['src/ui/**/*.ts', 'src/ui/**/*.svelte'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@sim/*', '../sim/*', '../../sim/*'],
              message:
                'src/ui must not import the simulation directly. Go through src/app/bridge (docs/WORKING_DISCIPLINE.md §2.1).',
            },
          ],
        },
      ],
    },
  },

  /* ---- Layer: src/config — data and types only ---- */
  {
    files: ['src/config/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@app/*', '@render/*', '@ui/*', '@persistence/*', '@platform/*', 'phaser', 'svelte'],
              message: 'src/config is pure data. It may only import zod and type-only modules.',
            },
          ],
        },
      ],
    },
  },

  /* ---- Browser-facing source ---- */
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  /* ---- Svelte components ---- */
  ...svelte.configs.recommended,
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tseslint.parser,
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
      globals: { ...globals.browser },
    },
    rules: {
      // Svelte escapes by default; {@html} opts out of that and is the only
      // realistic XSS vector in a client-only game.
      'svelte/no-at-html-tags': 'error',
      'svelte/valid-compile': 'error',
    },
  },

  /* ---- Plain JS config and script files: no type information available ---- */
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      // These files belong to no TypeScript project, so type-aware rules cannot
      // run on them. Setting project:false is what actually disables the
      // "not found by the project service" parse error.
      parserOptions: { project: false, projectService: false },
      globals: { ...globals.node },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'no-console': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },

  /* ---- Tooling / Node-side code ---- */
  {
    files: [
      'vite.config.ts',
      'vitest.config.ts',
      'playwright.config.ts',
      'vercel.ts',
      'eslint.config.js',
      'commitlint.config.js',
      'tools/**/*.ts',
      'api/**/*.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },

  /* ---- Tests ---- */
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Fixture files intentionally violate architecture rules to prove the
      // rules actually fire. They are never imported by src.
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  prettier,
);
