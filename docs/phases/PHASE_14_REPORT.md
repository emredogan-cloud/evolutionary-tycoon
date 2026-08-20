# PHASE 14 REPORT — Offline Progression

**Phase:** 14 — the return becomes informative
**Date:** 2026-08-20
**Result:** ✅ **PASS (technical)** — local gates green, CI 11/11 green, preview-e2e green on the real CDN
**Branch:** `phase/14-offline` (stacked on `phase/consolidation-art`)

---

## 1. Result, stated plainly

A returning player now gets a **priced, explained, claim-once** account of their
absence, defended against every clock the design names, and the game installs a
service worker that makes the second visit cost **kilobytes**.

The phase's centre of gravity is one ordering decision: **the absence is priced
and consumed in a single save write, before the report is ever shown.** Reload
before collecting → the identical report comes back. Reload after collecting →
nothing. There is no interleaving in which a window pays twice, and the E2E
proves it against real IndexedDB across real reloads.

**Four things worth saying out loud:**

- **The game had never actually persisted.** `SaveService` existed since Phase 2,
  but nothing loaded a save at boot and nothing autosaved — both lived only
  behind the `?e2e=1` test hook. P14 made persistence real: boot-load (skipped in
  seeded/visual test sessions, deliberately), a 30 s autosave, and
  `visibilitychange`/`pagehide` writes.
- **The reward is a measurement, not a simulation.** A five-minute sliding meter
  (customers, ticket, COGS, turnaways, five utilization samples) runs inside the
  economy slot. Its first draft sampled every tick and cost the empty-world
  benchmark **57%** — rebuilt to 5 s bucket-boundary sampling, 21/21 budgets
  green. The meter is deliberately **outside the world hash**, proven by the same
  style of test as the cosmetic stream's exclusion.
- **The browser audit caught the report lying.** At 9% peak utilization it said
  "park alanı seni sınırladı". The argmax names the _busiest_ resource; whether
  anything was _binding_ is a threshold — `OFFLINE_LIMITER_SIGNIFICANCE = 0.5`,
  under which the limiter is honestly **demand** and the advice changes to
  visibility/menu. ECONOMY_DESIGN §10 amended in the same commit.
- **The service worker registration registered nothing at first.** It waited for
  a `load` event that had already fired by the time the async boot reached it.
  Caught by the new E2E, fixed by checking `readyState`.

## 2. IMPLEMENTED

| Piece                                    | Where                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure offline model + four clock defences | `src/sim/systems/OfflineSystem.ts` (`decideElapsed`, `computeOffline`, `physicalCapacityPerMin`)                                                                                                                                                                                                                                                          |
| Five-minute measurement window           | `src/sim/systems/offlineMeter.ts`, advanced from `EconomySystem`'s slot; sales recorded at both payment sites; turnaways at the bay-refusal site                                                                                                                                                                                                          |
| Save v9                                  | `offline: { meter, pending }` envelope; migration v8→v9 (`meter: null` — honest for unmeasured saves); fixture `save-v9.json` from a played session                                                                                                                                                                                                       |
| `COLLECT_OFFLINE` command                | carries explicit amounts (wall-clock derived, sim may not recompute); cash floor at `MINIMUM_CASH`; deliberately not `lifetimeRevenue` (milestones must not advance while away)                                                                                                                                                                           |
| Boot flow                                | `src/app/OfflineService.ts` — load → sync → decide → price → **consume** → show; claim ticks once so the money is in the snapshot the claim-save writes                                                                                                                                                                                                   |
| Time sync                                | `src/platform/timeSync.ts` — GET `/api/time`, `Date` header, `no-store`, 3 s timeout, failure = unsynced (never an error)                                                                                                                                                                                                                                 |
| Lifecycle                                | `src/app/lifecycle.ts` — 30 s interval + hidden + pagehide, single-flight, warn-and-retry                                                                                                                                                                                                                                                                 |
| Report UI                                | `src/ui/screens/OfflineReport.svelte` — gross/expenses/net, limiter with utilization and advice, cap note, Detay, count-up (instant under reduced motion), Topla as the only exit                                                                                                                                                                         |
| PWA                                      | vite-plugin-pwa **1.3.0** (approved stack; DEPENDENCY CHANGE #1 in PROJECT_MEMORY §4), generateSW, runtime inlined (CSP stays `script-src 'self'`), 29-entry precache, `health.json` + `/api/*` never cached, `skipWaiting`+`clientsClaim`, manual 12-line registration, manifest + icons rasterised from the real favicon (`tools/pwa/generateIcons.ts`) |
| Deploy config                            | `vercel.ts`: `/sw.js` + manifest no-cache (CDN-stale sw.js would pin old precaches), SPA-fallback exclusions                                                                                                                                                                                                                                              |

## 3. VERIFIED (command output, this machine, 2026-08-20)

| Gate                                                              | Result                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint` · `format:check` · `typecheck` (3×tsc + svelte-check) | clean                                                                                                                                                                                                                                                                                 |
| `pnpm depcruise`                                                  | 0 violations — the meter's first wiring created a real cycle (`offlineMeter → QueueSystem → DriveThruSystem → offlineMeter`); broken by extracting `capacity.ts` as a leaf, not by weakening the rule                                                                                 |
| `pnpm knip`                                                       | clean                                                                                                                                                                                                                                                                                 |
| `pnpm assets:validate` / `assets:build`                           | 172 assets, 0 failing / budgets within limits                                                                                                                                                                                                                                         |
| `pnpm test:coverage`                                              | **1 423 passed**, per-layer floors met (src/app initially failed 83.3/85 fn — fixed by _adding_ lifecycle+registration tests, not by lowering)                                                                                                                                        |
| `pnpm test:determinism`                                           | **61/61 — world-hash pin unchanged** (the meter is excluded by design, and the exclusion is itself under test)                                                                                                                                                                        |
| `pnpm balance:check`                                              | 5/5                                                                                                                                                                                                                                                                                   |
| `pnpm bench:sim`                                                  | **21/21** (after the sampling rework; the regression was found by this gate doing its job)                                                                                                                                                                                            |
| `pnpm build` + `pnpm size`                                        | 461.27 kB gzip of 550 · CSS 4.26 of 30 · raw-size tripwire consciously moved 1650→1750 (gzip budget untouched)                                                                                                                                                                        |
| `pnpm audit --audit-level=high`                                   | no known vulnerabilities (checked immediately after the dependency add)                                                                                                                                                                                                               |
| E2E chromium (full suite, preview)                                | **80 passed + 6 deployment-only skips** — includes 5 offline scenarios (price/claim-once, re-show without re-price, backward clock, 30 h clamp, corrupt fallback) and 2 SW tests (precache-controlled second visit with 0 static network requests; offline boot with the network cut) |
| Visual goldens                                                    | **14/14, zero diffs** — offline flow and SW are deliberately inert in visual-determinism sessions                                                                                                                                                                                     |
| Offline calc budget                                               | `computeOffline` **190 ns/call** vs < 5 ms budget (PERF_LOG)                                                                                                                                                                                                                          |
| SW bandwidth/boot (localhost)                                     | cold 486 ms / 1.76 MB → warm controlled **227 ms / 1 315 B network** (PERF_LOG; CDN numbers at deployment verification)                                                                                                                                                               |

Security scenarios 1–14 from the batch directive map to: `offlineSystem.test.ts`
(1–7b, 9–11, thresholds), `offlineService.test.ts` (8, 8b, 12–14, unsynced cap,
manipulated meter, migrated save), `offlineScenarios.spec.ts` (browser-level 3,
4, 5, 8, corrupt save), `lifecycle.test.ts` (12, 13 at the DOM seam).

## 4. CI / DEPLOYMENT EVIDENCE (appended once the workflows finished)

- **CI green** at the phase head `26d4587` — run **32350807804**, all 11 jobs
  (quality · security · assets · balance · perf · unit+integration · build+size
  · E2E chromium · E2E firefox under xvfb · WebKit smoke · visual). The first
  dispatch at `09757f2` went red on exactly one finding — knip, a type export
  the demand rework had orphaned — every other job green there too; fixed in
  `26d4587`, no test touched.
- **Preview E2E green** against the Vercel deployments of _both_ SHAs — runs
  **32350134863** (`09757f2`) and **32351060875** (`26d4587`) — the full
  chromium suite incl. the five offline scenarios and both service-worker specs
  on the real CDN with the real `/api/time`.
- **Deployment of record:**
  `https://evolutionary-tycoon-*-emre30283-4955s-projects.vercel.app` (git
  integration build of `26d4587`); `/health.json` → buildSha
  `26d45870df121ee84f68b061b4c1abbefcc997c0` — **exact match**, schemaVersion
  **9**; `/sw.js` served `cache-control: no-cache, must-revalidate` as
  configured.
- Production smoke: **skipped by design** — no production deployment exists.

## 5. NOT RUN

- **Human playtest** — remains NOT RUN (agent cannot playtest;
  `PLAYTEST_PROTOCOL.md` unchanged and still the procedure).
- **Real-GPU FPS after P14** — no render-path change was made (the report is
  DOM, the SW is network); the consolidation GTX 1660 Ti entry stands. No FPS
  claim is made from SwiftShader numbers.
- **Local Firefox/WebKit** — this desktop still cannot run them (no xvfb, no
  root for WebKit deps — known constraint since P7); their verdicts are CI's,
  from the xvfb job and the pinned container job at the SHA above.

## 6. BLOCKED / CHANGE CONTROL

- **None opened by this phase.** ADR-017 (WebGL) remains the user's decision;
  nothing in P14 needed it. Stage 2–4 calibration untouched
  (`CALIBRATED_STAGES=[1]`; balance gate unchanged and green).
- **Repo-vs-docs discrepancy, recorded not silently fixed:** CLAUDE.md §5 lists
  `pnpm config:check` / "vercel.json is generated" — no such script or file
  exists; the platform consumes `vercel.ts` natively (`@vercel/config` is a
  devDependency). Behaviour conflicts with nothing; the stale command list is
  flagged for the user. (CLAUDE.md is user-owned; not edited.)

## 7. Debts created

- `pending` reports survive until collected, but a **corrupt-save recovery
  conversation** (new game vs import) is still console-only — the honest
  fallback is a fresh boot, as it has been since Phase 2. Owed to the settings
  screen (P18/P19 territory).
- The offline meter after a mid-session reload measures only the new session
  (window deliberately not persisted) — conservative by construction; noted in
  code.
