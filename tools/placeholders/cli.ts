import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePlaceholders } from './generate.ts';

/**
 * `pnpm placeholders:build` — regenerate the committed placeholder set.
 *
 * The generator was written in Phase 3 and documented as being run by this
 * command, but the command did not exist: the images were committed and the
 * only way to reproduce them was to call the function by hand. Since the
 * placeholders are derived from `src/config` dimensions, that gap meant a change
 * to the world scale would silently leave stale images behind.
 * `tests/unit/tools/placeholders.test.ts` compares the committed bytes against a
 * fresh render, so the drift is caught either way — this makes it fixable.
 */

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '..', '..', 'assets', '_placeholder');

const specs = generatePlaceholders(output);
for (const spec of specs) {
  console.log(
    `${spec.key}__PLACEHOLDER__.png  ${spec.width}x${spec.height}  anchor ${spec.anchorX},${spec.anchorY}`,
  );
}
console.log(`\n${specs.length} placeholders written to ${output}.`);
