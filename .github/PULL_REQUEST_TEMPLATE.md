## What and why

<!-- One paragraph. The diff says what changed; say why. -->

## Phase

<!-- Which authorised phase does this belong to? Link the roadmap section. -->

- Phase:
- Scope check: this stays inside the authorised phase scope — yes / no (if no, link the change request)

## Evidence

<!-- docs/WORKING_DISCIPLINE.md §4. Paste real output; do not summarise. -->

- [ ] `pnpm lint`
- [ ] `pnpm format:check`
- [ ] `pnpm typecheck`
- [ ] `pnpm depcruise`
- [ ] `pnpm knip`
- [ ] `pnpm config:check`
- [ ] `pnpm test:coverage`
- [ ] `pnpm build` + `pnpm size`
- [ ] `pnpm e2e` (chromium + firefox)
- [ ] CI green — run URL:
- [ ] Preview deployment healthy — URL:
- [ ] `/health.json` matches this commit
- [ ] No critical console errors in the preview

## Dependency changes

<!-- If any dependency version changed, paste the change record from
     docs/WORKING_DISCIPLINE.md §2.5.2. If none, write "none". -->

none

## Documentation

- [ ] `docs/PROJECT_MEMORY.md` updated
- [ ] Affected documents updated in this PR (not a follow-up)
- [ ] ADR added if a hard-to-reverse decision was made

## Risks and rollback

<!-- What could this break, and how do we undo it? -->
