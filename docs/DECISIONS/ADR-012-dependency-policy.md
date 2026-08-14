# ADR-012 — Dependency version lock policy and Vercel CLI pinning

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 1

## Context

Two related problems: silent dependency drift, and tooling that lives outside the lockfile.

At Phase 1 start the globally installed Vercel CLI was **56.5.0** while **59.0.0** was current — a
discrepancy that would make local and CI deploys silently different.

## Decision

1. **Exact pins everywhere.** `save-exact=true` in `.npmrc`; no caret or tilde ranges.
2. The rule is _not_ "never upgrade" — it is **"never upgrade casually, implicitly, or without
   evidence."** Every version change carries a written record: old version, proposed version, class
   (`SECURITY` / `BLOCKING-COMPAT` / `APPROVED-FEATURE`), rationale, evidence, compatibility impact,
   required tests. `SECURITY` may be applied before approval; the other two may not.
3. **Dependabot is enabled but never auto-merges.** It surfaces updates; a human decides.
4. **Reproducibility pins:** Node via `.nvmrc` + `engines`, pnpm via `packageManager`, the
   Playwright Docker image by full tag, GitHub Actions by major version.
5. **Vercel CLI pinned as a repo devDependency at 59.0.0**, invoked via `pnpm exec vercel`, so the
   deploy toolchain is captured in the lockfile rather than depending on whatever is installed
   globally.
6. `strict-peer-dependencies=true` so incompatibilities surface loudly at install time.

## Honest note on unused declared dependencies

`phaser`, `zod` and `idb` are installed in Phase 1 but not yet imported — they are part of the
approved stack and are pinned now so the lockfile records the exact versions, which is a Phase 1
deliverable. Consequence: the 550 kB JS budget is _configured_ but not yet _exercised_ (the Phase 1
bundle is 13.07 kB gzipped). It only becomes meaningful in Phase 3. Recorded in
`docs/DEPENDENCY_NOTES.md`.

## Evidence

docs/WORKING_DISCIPLINE.md §2.5; docs/DEPENDENCY_NOTES.md.

## Reversal cost

Low.
