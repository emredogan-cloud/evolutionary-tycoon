#!/usr/bin/env node
/**
 * Assert that the committed vercel.json matches what vercel.ts compiles to.
 *
 * vercel.ts is the authored source (typed, commented, reviewable); vercel.json is
 * what the platform actually reads. If they drift, the deployment silently uses
 * stale security headers or a stale cache policy — the kind of failure that is
 * invisible until it matters. So CI compares them on every run.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// @vercel/config does not expose ./package.json or ./dist/cli.js through its
// "exports" map, so require.resolve cannot find the binary. pnpm places a real
// symlink at node_modules/@vercel/config, which makes the literal path stable.
const CLI_PATH = 'node_modules/@vercel/config/dist/cli.js';

if (!existsSync(CLI_PATH)) {
  console.error(`FAIL: ${CLI_PATH} not found. Run \`pnpm install\`.`);
  process.exit(1);
}

const compiled = execFileSync(process.execPath, [CLI_PATH, 'compile'], { encoding: 'utf8' });

let committed;
try {
  committed = readFileSync('vercel.json', 'utf8');
} catch {
  console.error('FAIL: vercel.json is missing. Run `pnpm config:build`.');
  process.exit(1);
}

const normalise = (s) => JSON.stringify(JSON.parse(s));

if (normalise(compiled) !== normalise(committed)) {
  console.error('FAIL: vercel.json is out of sync with vercel.ts.');
  console.error('      Run `pnpm config:build` and commit the result.');
  process.exit(1);
}

console.log('OK: vercel.json matches vercel.ts');
