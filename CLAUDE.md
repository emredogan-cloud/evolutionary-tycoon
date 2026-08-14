# CLAUDE.md — agent operating instructions

> **Read this before touching anything in this repository.**

## 1. Read these first, in this order

1. **[`docs/WORKING_DISCIPLINE.md`](docs/WORKING_DISCIPLINE.md)** — the binding operating contract.
   Non-negotiable. Read it in full at the start of every phase.
2. **[`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md)** — persistent project memory. Tells you the
   current phase, what is authorised, what is already verified, and what is still open.
3. **The current phase section of [`docs/GAME_EXECUTION_ROADMAP.md`](docs/GAME_EXECUTION_ROADMAP.md)** —
   only the phase named in Project Memory §21.

## 2. Authority order

```
1. Explicit user decisions
2. Approved roadmap (25 phases, P0–P24 — approved 2026-08-14, do not revert to the 22-phase version)
3. docs/WORKING_DISCIPLINE.md
4. docs/PROJECT_MEMORY.md
```

Project Memory is the compact memory layer connecting the others. **It never silently overrides
them.** If you find a contradiction: **STOP** and report the conflicting documents, the exact
conflict, the likely source of truth, and a proposed resolution. Do not reconcile architecture or
scope on your own.

## 3. Hard rules

1. **Respect the authorised phase.** Only the work named in Project Memory §21 is authorised.
   No "getting a head start" on the next phase. Stop at every phase gate and wait for explicit
   approval — "tamam", "iyi", "güzel" are not approval.
2. **Never fabricate evidence.** No claimed test result without command output. No claimed
   performance number without a measurement. No "deployed successfully" without fetching the live
   URL. If you did not run it, say you did not run it.
3. **Never silently modify the roadmap.** Use the change-request format in
   WORKING_DISCIPLINE §6.
4. **Update Project Memory.** At phase start, at each material event, at phase end, and at every
   stop. Evidence-oriented: commands, outputs, SHAs, URLs, measured values — never "probably" or
   "should work".
5. **Never skip tests.** Do not weaken, delete or quarantine a test to make CI green. Fix the code.
6. **Never commit secrets.** Everything prefixed `VITE_` is public by construction.
7. **Never upgrade a dependency casually.** WORKING_DISCIPLINE §2.5 — exact pins, change record
   required, no silent upgrades.
8. **Report partial completion as partial.** What is done, what is not, and why.

## 4. Architecture boundaries — enforced by CI, not by trust

```
src/sim/**       pure TypeScript. No Phaser, Svelte, DOM, browser globals.
                 No Math.random, Date.now, new Date, performance.now, timers.
src/render/**    Phaser allowed. Reads the simulation; never mutates it.
src/ui/**        Svelte allowed. Must NOT import src/sim — go through src/app/bridge.
src/app/**       composition root only. Wires layers; contains no game logic.
src/config/**    data and types only. May import zod and nothing else from the project.
```

Violations fail the build via `eslint.config.js` and `.dependency-cruiser.cjs`, and
`tests/unit/architecture/enforcement.test.ts` proves those rules actually fire.

**Do not weaken a rule to make code pass.** If a rule genuinely blocks correct work, that is a
change request, not a config edit.

### Why `src/sim` purity is absolute

Same seed + same command log must produce the same world hash after N ticks, on any machine, at any
tick rate. That single property is what makes possible: headless unit testing, CI performance
measurement (there is no GPU in CI — headless Chromium uses SwiftShader), pixel-exact visual
regression on a WebGL canvas, exactly-reproducible bug reports, CI economy validation via the
balance simulator, and the Day Replay gameplay feature. One stray `Math.random()` destroys all six,
and the damage surfaces much later as "flaky tests".

## 5. Commands

```bash
pnpm dev              # dev server
pnpm build            # production build (emits dist/health.json)
pnpm preview          # serve the build on :4173

pnpm lint             # ESLint, type-aware
pnpm format:check     # Prettier
pnpm typecheck        # tsc x3 projects + svelte-check
pnpm depcruise        # architecture boundaries
pnpm knip             # dead code / unused deps
pnpm config:check     # vercel.json is in sync with vercel.ts

pnpm test             # Vitest unit + integration
pnpm test:coverage    # with coverage thresholds (per-layer, see TESTING_STRATEGY §13)
pnpm test:determinism # the determinism suite on its own — the most important signal
pnpm bench:sim        # headless simulation benchmark + budgets (needs --expose-gc; config handles it)
pnpm e2e              # Playwright: chromium + firefox
pnpm e2e:smoke        # Playwright: webkit reduced suite
pnpm size             # bundle budgets

pnpm verify           # everything above, in order — run before claiming done
```

## 6. Things that will trip you up

- **TypeScript is pinned to 6.0.3, not 7.** TS 7 has no stable programmatic API, so
  `typescript-eslint` cannot run on it, and type-aware lint is not optional here. The upgrade
  trigger is documented in `docs/RESEARCH_NOTES.md` §2. Do not "helpfully" upgrade.
- **CI cannot measure FPS.** GitHub Actions runs Chromium on SwiftShader. Never write a CI assertion
  about frame rate, and never report an FPS number you did not measure on real hardware. Real
  measurements go in `docs/PERF_LOG.md`.
- **Visual regression is Chromium-only.** Headless WebKit does not render canvas into screenshots
  (playwright#586); headless Firefox WebGL needs `xvfb-run`.
- **`vercel.json` is generated.** Edit `vercel.ts`, then run `pnpm config:build`. `pnpm config:check`
  fails the build if they drift.
- **Placeholders must be registered** in `docs/PLACEHOLDER_REGISTER.md` and must look obviously
  wrong. A placeholder that looks "good enough" is the dangerous kind.
- **`World.hash()` deliberately excludes three things**, and each exclusion is itself under test:
  the `cosmetic` RNG stream, `control.speedMultiplier` / `control.paused`, and the per-tick event
  queue. They are excluded because none of them may change a simulation _outcome_ — which is
  exactly what makes "1x, 2x and 4x produce the same world" a statement worth testing. Adding one
  of them to the digest silently breaks the determinism suite's meaning, not just its result.
- **Commands land at the start of a tick, never on dispatch.** `sim.dispatch()` queues; `tick()`
  stamps, applies and logs. Applying immediately would let wall-clock arrival time change the
  outcome.
- **The eighteen system slots are ordered and that order is architecture.** Changing it changes
  throughput and invalidates every balance number measured before the change (WORKING_DISCIPLINE §6).

## 7. Git

```
main                      protected; merge only with green CI
phase/<n>-<slug>          phase branch
fix/<slug>  chore/<slug>
```

Conventional Commits, enforced by commitlint. Scope is required and comes from a closed list
(see `commitlint.config.js`).

## 8. Definition of done

[`docs/WORKING_DISCIPLINE.md` §4](docs/WORKING_DISCIPLINE.md#4-tamamlandi-ne-demek--definition-of-done) —
15 items, each requiring evidence, recorded in `docs/phases/PHASE_<N>_REPORT.md`.

Code existing is not done.
