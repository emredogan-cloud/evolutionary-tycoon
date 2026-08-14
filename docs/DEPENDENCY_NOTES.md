# Dependency notes

Companion to [WORKING_DISCIPLINE §2.5](WORKING_DISCIPLINE.md#25-bağımlılık-sürüm-kilidi-politikası).

## Declared but not yet imported (Phase 1)

These are part of the GATE 0-approved stack and are installed now so their exact versions are
locked in the lockfile, which is a Phase 1 deliverable. They are listed in `knip.json`
`ignoreDependencies` so the dead-code check does not flag them.

| Package  | Declared version | First used in                       | Why installed now                                                 |
| -------- | ---------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `phaser` | 4.2.1            | Phase 3 (Isometric Rendering)       | Approved renderer; version locked at Phase 1                      |
| `zod`    | 4.4.3            | Phase 9 (Economy config validation) | Approved config validator                                         |
| `idb`    | 8.0.3            | Phase 2 (SaveManager)               | Approved persistence adapter                                      |
| `vercel` | 59.0.0           | CLI only — never imported           | Pinned so deploys do not depend on whatever is installed globally |

**Honest note:** because `phaser` is not imported in Phase 1, the 550 kB JS budget is _configured_
but not yet _exercised_ — the Phase 1 bundle is 13.07 kB gzipped. The budget only becomes meaningful
in Phase 3. Reported this way rather than implying the budget has been validated.

## Vercel CLI version resolution

|                                     |                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Globally installed at Phase 1 start | 56.5.0                                                                     |
| Latest available                    | 59.0.0                                                                     |
| **Decision**                        | Pin `vercel@59.0.0` as a repo devDependency; invoke via `pnpm exec vercel` |

Rationale: a globally installed CLI is invisible to the lockfile, so local and CI deploys could
silently use different versions. Pinning it in the repo makes the deploy toolchain reproducible.
Recorded as ADR-012.
