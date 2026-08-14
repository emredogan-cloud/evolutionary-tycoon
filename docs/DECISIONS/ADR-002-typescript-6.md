# ADR-002 — TypeScript 6.0.3, not 7

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 1

## Context

TypeScript 7.0 reached GA on 8 July 2026 with a Go-native compiler and 8–12× faster full builds.
It is the obvious default choice — except that TS 7.0 ships without a stable programmatic API
(deferred to 7.1), and `typescript-eslint` needs that API. Its peer range is still
`typescript >=4.8.4 <6.1.0`, and ESLint core is blocked behind the same issue.

## Decision

Pin `typescript@6.0.3`. Keep type-aware linting enabled.

## Alternatives considered

- **TS 7 without type-aware lint.** Rejected: `no-floating-promises`, `no-misused-promises`,
  `strict-boolean-expressions` and `no-unnecessary-condition` are not optional in a deterministic
  simulation. A swallowed promise or a silent truthiness bug there produces a defect that cannot be
  reproduced, which defeats the entire testing architecture.
- **Hybrid: TS 7 for `tsc`, TS 6 pinned for ESLint** (via `@typescript/typescript6`). Rejected:
  two compiler versions in one repo means two type-resolution behaviours, and therefore a class of
  bug that passes CI and fails in the editor, or vice versa. Not worth it at MVP scale.

## Consequences

- Builds are slower than they could be. On a project this size that is seconds, not minutes.
- `baseUrl` is deprecated in TS 6 and removed in 7, so `paths` entries are written relative
  (`./src/...`) with no `baseUrl` — this also clears one TS7 migration blocker in advance.

## Upgrade trigger (documented, not automatic)

1. `typescript-eslint` publishes a release with a `typescript >=7` peer range (tracking:
   typescript-eslint#12518), **and**
2. that release has been out for at least two weeks, **then**
3. upgrade in a dedicated PR with the full suite green.

## Evidence

docs/RESEARCH_NOTES.md §2. Verified live from the npm registry on 2026-08-14:
`typescript-eslint@8.67.0` peer `typescript >=4.8.4 <6.1.0`.

## Reversal cost

Low — a single PR once the trigger fires.
