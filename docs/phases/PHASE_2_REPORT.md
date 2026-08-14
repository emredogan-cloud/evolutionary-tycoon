# PHASE 2 COMPLETION REPORT — Simulation Core & Determinism

**Phase:** 2 — the deterministic, engine-independent simulation kernel
**Date:** 2026-08-15
**Result:** _(filled in below, §11)_
**Batch:** P2 → P3 → P4, authorised together on 2026-08-14. Execution continues to Phase 3 on pass.

**Branch:** `phase/02-simulation-core`
**Pull request:** [#8](https://github.com/emredogan-cloud/evolutionary-tycoon/pull/8)

---

## 1. Scope statement

**The machine that will run the game's systems, and the proof that it is deterministic. No gameplay.**

No traffic, no customers, no restaurant, no economy, no employees, no renderer, no production art.
The eighteen pipeline slots from `TECHNICAL_ARCHITECTURE §5.5` are reserved in their documented
order and **every one of them is a no-op**; each carries the phase in which it stops being one.

The state containers (`progression`, `economy`, `layout`, `staff`, `stats`, `settings`) exist with
structural defaults because the save schema is an explicit Phase 2 deliverable. They hold zeros, not
balance values — the numbers arrive in Phase 9 with the economy that gives them meaning.

---

## 2. What was built

| Area               | Detail                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clock**          | Injectable, accumulates from ticks only. `simTimeMs`, `gameDay`, `gameHour`. Reports day rollover so the caller need not recompute the boundary.                       |
| **Rng**            | sfc32 — 128-bit state, fully serialisable. Six named streams (`traffic`, `conversion`, `customer`, `tips`, `events`, `cosmetic`) derived from seed + stream name.      |
| **World**          | The entire mutable state, plus `hash()`: FNV-1a 64 over raw IEEE-754 bytes, validated against published reference vectors.                                             |
| **SystemPipeline** | 18 ordered slots. Construction rejects a wrong count or a slot out of order, naming the offending index.                                                               |
| **CommandLog**     | Ring buffer of 5000. `overflowed` is exposed — replaying a truncated log does not reproduce the world, and pretending otherwise would be the worst bug available here. |
| **EventBus**       | Typed discriminated union with a per-type record pool, collected during the tick and flushed once at the end. Type safety and zero allocation at the same time.        |
| **Stores**         | `VehicleStore` as SoA over typed arrays with a free list; `SlotPool` for customers, employees and orders. Neither ever grows.                                          |
| **Snapshot**       | The save-state boundary: `src/sim` produces plain data, `src/persistence` wraps it in an envelope. Transient entities are excluded by design.                          |
| **SaveManager**    | Zod-validated v1 schema, CRC-32 over canonical JSON, three rotating backups with recovery, graceful refusal of a future version, import/export.                        |
| **Migrations**     | Chain machinery, contiguity assertion, and an empty list at v1 — with the algorithm tested against synthetic migrations so the first real one ships on proven code.    |
| **GameLoop**       | Fixed 20 Hz accumulator, interpolation alpha, 250 ms frame clamp, 8-tick catch-up ceiling, backlog discard, dropped-tick accounting.                                   |
| **SaveService**    | The simulation ↔ storage bridge, and where the wall clock enters the program.                                                                                          |
| **Debug overlay**  | Dev-only, 4 Hz: tick, simulation time, day/hour, speed, alpha, entity counts, frames, **world hash**. Statically dropped from a production build.                      |
| **Test hooks**     | `window.__EVOTYCOON__` gated on `?e2e=1` (TESTING_STRATEGY §7.2): read state, dispatch commands, advance ticks, drain events, save, load, clear.                       |
| **Benchmark**      | `tools/bench/sim-bench.ts` + `tests/perf/sim.bench.test.ts` + its own Vitest config with `--expose-gc`, wired into CI as its own job.                                  |

**Size:** 1 826 lines of source added across `src/sim`, `src/persistence`, `src/app` and
`src/config`; 3 034 lines of test. Tests outweigh source roughly 5:3, which is the expected ratio
for a phase whose product _is_ a guarantee.

---

## 3. Definition of Done — 15 items, with evidence

| #   | Criterion                                    | Result | Evidence                                                                                                            |
| --- | -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Implementation works                         | ✅     | Kernel runs in Chromium and Firefox against real `requestAnimationFrame`; §5                                        |
| 2   | `pnpm lint` clean                            | ✅     | exit 0                                                                                                              |
| 3   | `pnpm typecheck` clean                       | ✅     | 3 tsc projects + svelte-check: **196 files, 0 errors, 0 warnings**                                                  |
| 4   | Tests green + coverage                       | ✅     | **313 passed**; lines 99.53%, branches 91.73%, functions 99.47%; per-layer thresholds enforced                      |
| 5   | Build succeeds, within budget                | ✅     | 0.47 s; JS **41.22 kB gzip** (limit 550), CSS **1.52 kB** (limit 30)                                                |
| 6   | E2E green (Chromium + Firefox), WebKit smoke | ✅     | local 17/17 both browsers; CI §4                                                                                    |
| 7   | Visual regression                            | n/a    | No rendering exists yet. Goldens land in Phase 3.                                                                   |
| 8   | **CI GREEN**                                 | _(§4)_ | _(run URL below)_                                                                                                   |
| 9   | Preview deployment healthy                   | _(§6)_ | _(preview URL below)_                                                                                               |
| 10  | No critical console errors                   | ✅     | Asserted automatically on every E2E test by the shared fixture                                                      |
| 11  | No runtime errors in real use                | ✅     | §5 — 600 ms and 500 ms live-loop observations, console clean                                                        |
| 12  | Performance within budget                    | ✅     | All seven budgets measured and passing; `docs/PERF_LOG.md` Phase 2 entry. **No FPS claimed — nothing renders yet.** |
| 13  | Documentation synchronised                   | ✅     | §8                                                                                                                  |
| 14  | Git clean, commits pushed                    | ✅     | 9 commits, working tree clean                                                                                       |
| 15  | Phase report written                         | ✅     | This document                                                                                                       |

---

## 4. Verification output

```
$ pnpm lint                → exit 0
$ pnpm format:check        → All matched files use Prettier code style!
$ pnpm typecheck           → COMPLETED 196 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS
$ pnpm depcruise           → ✔ no dependency violations found (43 modules, 100 dependencies cruised)
$ pnpm knip                → exit 0
$ pnpm test:coverage       → Test Files 24 passed (24) · Tests 313 passed (313)
                             Statements 98.75% · Branches 91.73%
                             Functions  99.47% · Lines    99.53%
$ pnpm test:determinism    → Test Files 5 passed (5) · Tests 58 passed (58)
$ pnpm bench:sim           → Test Files 1 passed (1) · Tests 8 passed | 1 skipped
$ pnpm build               → ✓ built in 470ms
                             dist/assets/index-*.js  134.24 kB │ gzip: 41.62 kB
                             dist/assets/index-*.css   4.86 kB │ gzip:  1.52 kB
$ pnpm size                → app entry  41.22 kB gzipped (limit 550 kB)  ✔
                             app styles  1.52 kB gzipped (limit  30 kB)  ✔
$ pnpm e2e:chromium        → 17 passed, 6 skipped (3.1s)
$ pnpm e2e:firefox         → 17 passed, 6 skipped (7.2s)
```

_(CI run table inserted below once the pipeline reports.)_

---

## 5. Determinism — what is actually proven

This is the phase's product, so it is spelled out rather than summarised.

| Property                                                           | How it is proven                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Same seed → same world after **10 000 ticks**                      | `determinism/replay.test.ts`                                                        |
| Same seed **and** same command log → same world after 10 000 ticks | Same file, five scripted commands across the run                                    |
| A recorded session replays to the world it produced                | Live run → `log.toArray()` → fresh `Sim` → identical digest                         |
| Tick batching is irrelevant                                        | 3000 single ticks vs four uneven batches → identical digest                         |
| **Frame pacing is irrelevant**                                     | 4000 frames × 50 ms, 1000 × 200 ms, 800 × 250 ms → all 4000 ticks, identical digest |
| **1x, 2x and 4x reach the same world**                             | Equalised tick counts → identical digest                                            |
| A jittery real-world frame pattern reaches the same world          | 16.7/33.4/8.3/50.1/120 ms pattern vs a plain run                                    |
| Pause suspends time entirely, and resuming continues unchanged     | 500 frames while paused move nothing                                                |
| **Save at 5000 → reload → run to 10 000 == uninterrupted run**     | `determinism/saveload.test.ts`                                                      |
| A save resumes on its own seed, not the constructor's              | Restored into a `Sim` built with a different seed → still matches                   |
| Restoring over a dirty world leaves no residue                     | Ten mutated fields, all cleared                                                     |
| **Draining one RNG stream 10 000× shifts no other stream**         | `determinism/streams.test.ts`, all six streams tested as the drained one            |
| The cosmetic stream cannot change an outcome                       | 10 000 cosmetic draws across 2000 ticks → digest unchanged, and the stream did move |
| Every non-cosmetic stream **does** change the digest               | Same file — proves the exclusion is narrow, not a hole                              |
| Observers cannot perturb the simulation                            | A subscribed run and an unsubscribed run agree after 5000 ticks                     |
| **No forbidden global anywhere under `src/sim`**                   | `determinism/forbiddenGlobals.test.ts` — real TypeScript AST, no opt-out            |
| The scanner itself works                                           | 20 probe cases must be detected; comments and string literals must not be           |
| **The browser agrees with Node, bit for bit**                      | `e2e/simulation.spec.ts` — Chromium and Firefox both reproduce the Node digest      |

The last one is the one that could not be obtained any other way. Node's V8 and Firefox's
SpiderMonkey producing the same 64-bit digest for the same seed is what makes a recorded command
log, a committed fixture and (from Phase 3) a golden screenshot portable rather than
machine-specific.

### The AST scan, and why it exists on top of ESLint

ESLint already bans `Math.random`, `Date.now`, `new Date`, `performance.now`, timers and browser
globals under `src/sim`, and `tests/unit/architecture/enforcement.test.ts` proves those rules
actually fire. The scan is a third layer because the ESLint ban is one `eslint-disable` comment away
from being silenced, and whoever writes that comment will have a good reason and no idea what it
costs. The scan has no opt-out, parses with the real TypeScript parser (so a match inside a comment
or a string cannot be a false positive), and its own detection is verified against twenty probes.

---

## 6. Deployment verification

_(filled in from the preview deployment; see §11)_

---

## 7. Performance

Measured on **AMD Ryzen 5 5500 (12 threads), Ubuntu 24.04.4, Node v24.13.1**, with GC forced.

| Measurement                             | Result          | Budget        |
| --------------------------------------- | --------------- | ------------- |
| 1000 empty ticks                        | **0.195 ms**    | < 5 ms ✅     |
| Steady-state allocation (200 000 ticks) | **0.20 B/tick** | ≈ 0 B/tick ✅ |
| World hash (120 vehicles, 60 customers) | 37.7 µs         | < 500 µs ✅   |
| Command processing                      | 0.33 µs/tick    | < 20 µs ✅    |
| Event flush (8 events, 3 subscribers)   | 0.054 µs/event  | < 10 µs ✅    |
| Vehicle spawn + despawn                 | 0.036 µs/entity | < 5 µs ✅     |
| Save snapshot + `JSON.stringify`        | 3.46 µs         | < 8 ms ✅     |

**No frame rate is claimed.** There is nothing to render, and CI could not measure it anyway
(SwiftShader). The first real-GPU measurement is due in Phase 3.

Allocation is 0.20 B/tick rather than exactly zero. That is V8 bookkeeping spread across 200 000
ticks, not a per-tick allocation: a single object literal per tick would be ~50 B/tick, two hundred
times higher. The assertion threshold is 8 B/tick, which is far below any real allocation and far
above the noise.

**Bundle:** 13.11 kB → **41.22 kB gzip**. The increase is the kernel plus Zod, which now ships
because save validation runs against untrusted input and cannot be a dev-only check. 7.5% of the
550 kB budget; the ceiling remains untested against Phaser until Phase 3.

---

## 8. Documentation synchronised

| Document                      | Change                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TECHNICAL_ARCHITECTURE §8.1` | Save schema updated to the implemented v1 shape: sorted entry arrays instead of maps, `tick`/`nextEntityId`/`control` added, `objectives`/`archetypesSeen` deferred to their systems with the reason recorded |
| `PERF_LOG.md`                 | Phase 2 reference point, machine identified, honest caveats                                                                                                                                                   |
| `CLAUDE.md`                   | New commands; four kernel invariants that will trip up the next agent (hash exclusions, command timing, system order)                                                                                         |
| `src/sim/README.md`           | Contents, and why `vec2`/`easing` are deferred                                                                                                                                                                |
| `src/persistence/README.md`   | Contents, and why `idbAdapter` is excluded from unit coverage                                                                                                                                                 |
| `src/config/README.md`        | Contents, and why no Zod schema yet                                                                                                                                                                           |
| `src/app/README.md`           | Contents                                                                                                                                                                                                      |
| `PROJECT_MEMORY.md`           | Checkpoints F, G, H                                                                                                                                                                                           |

---

## 9. Decisions taken inside the phase

These are implementation choices within the approved scope, recorded because they are the kind that
look arbitrary in six months.

### 9.1 `World.hash()` excludes three things

The cosmetic RNG stream, `control.speedMultiplier` / `control.paused`, and the per-tick event queue.

The cosmetic exclusion is in the roadmap. The other two follow the same logic: they change _when_ a
tick happens, never _what_ it does. Excluding them is what makes "1x, 2x and 4x produce the same
world" a testable statement instead of a tautology — with speed inside the digest, the test could
only ever compare a run against itself.

To keep the replay test strong while individual command _effects_ are excluded, `stats.commandsApplied`
is hashed. It is a monotonic, hashed consequence of the command log, so a replay that dropped a
command is detected even though the command's own effect is not in the digest.

### 9.2 Clock advancement lives in `Sim.tick()`, not `TimeSystem`

Two approved documents pull in different directions. The roadmap's Phase 2 task list and execution
prompt both say all eighteen slots are no-ops; `TECHNICAL_ARCHITECTURE §5.5` describes `TimeSystem`
as advancing the day and hour.

Resolved in favour of the literal "all no-ops" reading: advancing simulation time is the _definition_
of a tick rather than the behaviour of one system, and the `Clock` is itself a Phase 2 deliverable.
`Sim.tick()` advances the clock and emits the day rollover; `TimeSystem` is reserved for the gameplay
consequences of the hour changing (opening times, the day curve), which arrive with traffic in Phase 5.

This is reported rather than silently chosen because it is a reading of two documents, not a fact.

### 9.3 `vec2` and `easing` deferred to Phase 3

Both are in the roadmap's Phase 2 "Files / Modules Expected" list. Nothing in Phase 2 consumes them.
`knip` fails the build on unused exports and WORKING_DISCIPLINE rule 12 forbids a feature without a
defined purpose, and unused code inside the deterministic core is worse than absent code. They land
in Phase 3 with the projection and camera maths that needs them.

### 9.4 `apply(world, command)` mutates rather than returning a new world

The roadmap calls it a pure function. A genuinely pure version would allocate a new world per
command, on a path budgeted at zero allocation. The property that is actually load-bearing is
preserved and tested: the result depends only on `(world, command)`, nothing outside `world` is
touched, and no clock, RNG source or I/O is consulted.

### 9.5 Three `eslint-disable` comments for `prefer-for-of`

`EventBus.flush`, `Sim.tick`'s command drain, `SystemPipeline.run` and `crc32` use indexed loops.
`for-of` over an array or typed array allocates an iterator per pass, and WORKING_DISCIPLINE §2.3
requires indexed loops on measured hot paths. Each site carries its reason inline. The stylistic rule
is disabled per site rather than in the config, and the allocation budget — the mechanism that
actually matters — is enforced by the benchmark.

### 9.6 `idbAdapter.ts` excluded from unit coverage

A hand-written IndexedDB double would prove the double works. Its decision branches (availability
probing, open failure) _are_ unit-tested, and the read/write/remove path is exercised against a real
browser database in `tests/e2e/simulation.spec.ts`, which asserts `backend === 'indexedDB'`. The
exclusion is recorded in `vitest.config.ts` with this reason.

---

## 10. Problems found and how they were resolved

Every one of these was caught by a test or a check, and none was worked around by weakening one.

| #   | Problem                                                                                                                                            | Resolution                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **The 8-tick catch-up ceiling was unreachable.** The 250 ms frame clamp yields 5 ticks, so the guard never fired and `droppedTicks` was dead code. | Changed the ceiling to bound _ticks_ rather than accumulator steps, so it binds when the machine is behind **and** fast-forwarding — the case it exists for. Both guards now have a test recording which one fires.                                                                 |
| 2   | **CRC-32 did not match the published vectors.** It consumed two bytes per UTF-16 code unit.                                                        | Switched to CRC-32/ISO-HDLC over UTF-8 bytes. The implementation is now validated against something other than itself.                                                                                                                                                              |
| 3   | Coverage sat below the §13 per-layer targets (sim branches 82%, persistence lines 87%)                                                             | Fixed the causes, not the thresholds: collapsed ~12 unreachable `?? 0` fallbacks into one tested helper, made the migration chain injectable so the algorithm is testable while the list is empty, and added the failure-path tests the gaps were pointing at. Now 90.6% and 91.9%. |
| 4   | `installTestHooks` threw a bare `TypeError` on a second install                                                                                    | Named the real condition — two simulations wired to one page — and left the property non-configurable so a page script still cannot swap the hook.                                                                                                                                  |
| 5   | Vitest 4 removed `poolOptions`, so `--expose-gc` was silently not applied and the allocation figure was an upper bound                             | Moved `execArgv` to the top level. The harness reports `gcForced`, and the test asserts it — an unforced measurement now fails loudly instead of passing quietly.                                                                                                                   |
| 6   | `tsconfig.node.json` had no `paths`, so the benchmark's imports into `src/**` failed to resolve                                                    | Added the alias map to that project.                                                                                                                                                                                                                                                |
| 7   | The E2E pause-event test failed because the page booted paused                                                                                     | The test was wrong, not the code: re-sending the current value is a deliberate no-op that announces nothing. The test now unpauses.                                                                                                                                                 |
| 8   | jsdom keeps one document per file, so overlay tests queried the first overlay's stale element                                                      | Cleared the document between tests.                                                                                                                                                                                                                                                 |

---

## 11. Gate

_(filled in on completion)_
