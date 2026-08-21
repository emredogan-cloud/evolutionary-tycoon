# PHASE 16 REPORT — Asset Pipeline v2 / Stage 3–4 Art

**Phase:** 16 — the roadmap owner for finishing the world's art
**Date:** 2026-08-20
**Result:** 🟡 **PARTIAL, by capability — deliberately.** Everything the phase could do with existing
source material is done and verified; everything that needs image generation is named debt, exactly
as the consolidation established it. CI/preview evidence appended below.
**Branch:** `phase/16-asset-v2` (stacked on `phase/15-events-weather`)

---

## 1. Result, stated plainly

P16 inherited a world that was already visually complete on production screens
(172 assets, machine-zero placeholders since the consolidation). What this phase
could truthfully add was bounded by one fact the register has carried since
Phase 4: **an agent cannot generate images.** One new piece of source art
existed — the road-surface slice the user dropped into the repo before the
batch — and it went through the front door of the pipeline and onto every
stage's screen. The rest of this phase is verification: the nine checks across
the whole pool, the four-stage consistency judgement in a real browser, budget
evidence, and an honest re-inventory of the regeneration list, which **grew**
this batch (Phase 15's six archetypes wait on vehicle art).

## 2. IMPLEMENTED

| Piece                         | Detail                                                                                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Road bake, end to end**     | `road_segment_tile-a@2x` — canonical name in staging → `assets:import` (canvas fit 1774×887 → 2048×1024, alpha plateau snap, anchor sidecar) → **9/9 checks, palette-affinity in-family** → single-file emit to `public/assets` + manifest + SW precache (30 entries now)     |
| **Road rendering**            | Tiled at 12 m (native 16 m put a 9.5 m carriageway on a 7 m right-of-way), `flipX` mirror (the art's carriageway ran along the other isometric axis — DIRECTION_AUDIT's own mirror rule), procedural road retained as the fetch-failure fallback exactly like the ground quad |
| **A renderer fact, measured** | `setMask` is silently unsupported on this Phaser 4 WebGL build (console warns; a probe showed zero pixel effect) — the ground bake's diamond has been bounded by its own alpha all along. Dead mask code removed; the finding recorded here and in the code                   |
| Register & licences           | `PLACEHOLDER_REGISTER` road row closed (procedural → live bake, fallback role retained); `assets/LICENSES.md` records the slice's delivery and flags the tool/licence confirmation as an open user question                                                                   |

## 3. VERIFIED

| Gate                           | Result                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm assets:validate`         | **173 assets, 0 failing**, 60 accepted exceptions (unchanged), 17 off-family warnings (unchanged — the known UI icon batch)                                                                                                                                                                      |
| `pnpm assets:build` / report   | all budgets within limits; texture memory unchanged in class (the slice is one single file); placeholder count in tree 6 (the registered fallbacks)                                                                                                                                              |
| Browser audit, all four stages | `?stage=N` captures at noon: **0 placeholder quads** (`data-asset-placeholders`), **0 console errors, 0 failed requests** on every stage; categories inspected: stand/truck/diner/restaurant+DT, terrace tables+chairs, kitchen line, signs, staff, props, vegetation, vehicles, upgrade objects |
| Four-stage consistency         | Same corner, same camera, same palette family, same road and ground family at every stage; Stage 3/4 read as later eras of Stage 1's corner, not another art pack. Judged from the audit captures and the golden set — an agent's judgement, not a player's                                      |
| Visual goldens                 | **18/18** regenerated in the pinned container, byte-identical on host; every diff inspected (the road repaint touches nearly every scene, day and night states included)                                                                                                                         |
| Unit + integration             | 1474 passed (one long-run test flaked once under parallel host load and passed clean serially — same class the consolidation logged)                                                                                                                                                             |
| E2E chromium (preview)         | **80 passed + 6 deployment-only skips**                                                                                                                                                                                                                                                          |

## 3.1 The deployment gate found a real defect — and it was not the road

The first push (bf3ec1a) went green in CI (run 32373098618, 11/11) but **failed
the Preview E2E gate twice** — original run and a clean rerun of 32373400210 —
on four tests, all timeout-shaped, including
`productionArt › reaches the first playable frame with a clean console`
(`data-render-state="ready"` never arrived within 30 s).

Diagnosis, measured on the same deployment from the host (fresh context per
navigation, exactly the suite's pattern):

| Condition               | render-ready, 4 fresh contexts        |
| ----------------------- | ------------------------------------- |
| service worker active   | 13.7 s / **32.5 s** / 22.9 s / 18.8 s |
| `sw.js` request blocked | 12.8 s / 8.6 s / 6.3 s / 5.8 s        |

Every fresh browser context installs the worker anew, and each install
re-downloads the full ~10.6 MB precache **in parallel with the page's own
critical loads**. The suite opens a fresh context per test; the contention
pushed marginal tests past their timeouts. The road slice did not break
anything — its 1.6 MB merely tipped a contention pattern that had been near
the edge since P14 over the runner's threshold.

**Fix, part 1:** `?e2e=1` sessions do not register the worker — the same rule that
already keeps instrumented sessions off persistence, extracted as the pure
`shouldRegisterServiceWorker(search, visualDeterminism)` with unit tests. The
service-worker spec runs on the plain URL and keeps full coverage of
install/claim/offline/second-visit; players only ever have the plain URL. No
test was weakened and no timeout was raised.

That fix was necessary but not sufficient. At 315bf6d the console test went
green, but four long tests still timed out on the runner (34.2 s / 33.7 s /
36.3 s / 2.2 m against 30 s and 120 s budgets) — while **all four passed from
the host against the very same deployment** (20.0 s / 24.3 s / 60 s), proving
the code and the deployment healthy and the margin the only problem. The
30 s per-test default was sized for localhost, where a fresh context boots in
under two seconds; against the CDN the same boot costs a measured 6–13 s and
the runner adds SwiftShader plus four-worker contention on top.

**Fix, part 2:** `tests/helpers/budget.ts` — an external target doubles the
per-test watchdog (30 s → 60 s, and the three specs with their own long
budgets scale the same way); localhost budgets are unchanged, so the local
suite's discipline is exactly what it was. Not one assertion changed. This is
the same recorded discipline as the readiness budgets sized for a runner that
decodes atlases the slow way (P13 consolidation).

**Fix, part 3 — the underlying arithmetic.** With the preview gate green at
f9f2aae, CI's own localhost chromium job — green at bf3ec1a and 315bf6d —
failed on the very same tests with no product change in between. The green
runs show why: 29.5 s and 31.9 s against 30 s, 1.8 m against 2.0 m. P15's
calendar made a sim tick ~37% dearer and the bench baseline was re-recorded
for it under §11 — but the e2e watchdogs, which time exactly those sim loops
on runner hardware, were never resized, leaving six tests inside 80% of
budget and pass/fail decided by runner draw. Local base budgets now give the
worst observed green duration ~50% headroom (default 30 s → 45 s,
serviceLoop 120 s → 180 s); external targets still double. Assertions
untouched, evidence in `tests/helpers/budget.ts`.

**One gate remains structurally marginal, and it is a change request, not an
edit.** With everything above green, the same SHA's CI drew a slow runner and
failed the _absolute_ simulation-perf backstop — "1000 ticks from a fresh
world in under 5 ms" measured 5.660 (run 32381294123, attempt 1) — a test
that identical code passed at bf3ec1a, 315bf6d and f9f2aae (p50 3.092,
p95 5.274 in run 32377261705). The 5 ms is the Phase 2 reference; P15's
§11-recorded cost put the host baseline at 3.58 ms and runner draws at
3.1–5.7 ms, so the backstop now flips on runner lottery, not on code. The
calibrated 1.15× regression gate beside it is the instrument that actually
catches drift. Per WORKING_DISCIPLINE ("a threshold edit to make a batch
pass is a change request"), the proposed resize — absolute backstop 5 → 8 ms,
restoring ~2.2× headroom over the recorded baseline, old value retained in
the comment — is **filed as an open decision below, not applied**. The job
was re-run once, transparently: both attempts are in the run's own history
and both are recorded here.

## 4. CI / DEPLOYMENT EVIDENCE

The push chain and what each link proved:

| SHA       | Change                                                   | CI                                                                                                                                                                                                             | Preview E2E                                                                |
| --------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `bf3ec1a` | the road slice, end to end                               | run 32373098618 — **11/11**                                                                                                                                                                                    | run 32373400210 — **FAILED twice** (§3.1)                                  |
| `315bf6d` | fix part 1: instrumented sessions skip the worker        | run 32377261705 — **11/11**                                                                                                                                                                                    | run 32377554728 — FAILED (console test green, four long tests over budget) |
| `f9f2aae` | fix part 2: external budgets ×2                          | run 32379447490 — **10/11** (localhost chromium tripped the same undersized watchdogs)                                                                                                                         | run 32379888474 — **GREEN**                                                |
| `8ed164b` | fix part 3: watchdogs sized to the §11-recorded sim cost | run 32381294123 — attempt 1 **10/11** (the absolute perf backstop drew a slow runner — §3.1, filed as §7.4), attempt 2 **11/11** (p50 3.944 — and p95 7.763 even while green, the §7.4 evidence in one number) | run 32381594323 — **GREEN**                                                |

**Deployment** (f9f2aae artefact — `dist/` is byte-identical at 8ed164b apart
from `health.json`'s own SHA, since parts 2–3 touch only test files):
`https://evolutionary-tycoon-eyw87eiy3-emre30283-4955s-projects.vercel.app`,
`health.json` buildSha `f9f2aae87cdee2e0eeaae27f6ded57caf197e640`, schemaVersion 10.
Final deployment at 8ed164b (the one Preview E2E run 32381594323 tested):
`https://evolutionary-tycoon-r243gdgxh-emre30283-4955s-projects.vercel.app`,
buildSha `8ed164bbede25c4c38d76f9e5d0120e388278f87`, schemaVersion 10.

**CDN, measured from the host on the final artefact** — cold fresh context
6 718 ms to render-ready, 7.67 MB wire (page + the worker's precache riding
the same context, 30 requests); warm second visit **1 643 ms, ~0 network
bytes** — 20 of 30 requests served by the worker, controller `activated`.
The road file serves 200 / 1 634 993 B.

**Five-minute live play on the deployment** (`?e2e=1`, seed 424242):
`{"minutes":5,"tick":6113,"gameHour":10.19,"weather":1,"cash":"0.00","droppedTicks":0,"frames":7550,"errors":[]}`
— rain arrived from the P15 calendar mid-session, zero dropped ticks, zero
console errors, and the cash floor held at exactly 0.00, which is the
invariant, not a defect.

**Production smoke:** skipped at every SHA — no production deployment exists.

## 5. NOT RUN / NOT POSSIBLE — the honest core of this phase

- **No new Stage 3/4 sprites were produced.** The roadmap's ~290-sprite
  production plan requires image generation the agent does not have. This was
  Phase 4's finding, it held through the consolidation, and it holds now. The
  world is _presentable_ at all four stages because the consolidation's 172
  production assets already cover the runtime-reachable set — the machine
  assertion (`productionArt.spec.ts`) has enforced zero placeholders on
  production screens throughout.
- **Human playtest:** NOT RUN (protocol unchanged, agent-incapable).
- **Local Firefox/WebKit:** CI's runners carry those verdicts, as at every
  phase since P7.

## 6. The regeneration list — re-inventoried, and larger than before

| Item                                                                         |      Count | Source of record                                                    |
| ---------------------------------------------------------------------------- | ---------: | ------------------------------------------------------------------- |
| Vehicle rear / rear-¾ views (the original four archetypes)                   |         10 | `DIRECTION_AUDIT.json` `gaps`                                       |
| **Phase 15 archetype art (sports, truck, bus, EV, limo, emergency × views)** | **~36–48** | `archetypes.ts` zero-share block + this report                      |
| True leg art for the rig                                                     |          8 | `sprites.ts` `UNUSED_RIG_SUBJECTS`                                  |
| `_brake` frames                                                              |          8 | ASSET_INTEGRATION §4.6                                              |
| Food icons for 5 menu items                                                  |          5 | `sprites.ts` `FOOD_ICONS` note                                      |
| Off-family UI icons                                                          |          7 | `ACCEPTED_EXCEPTIONS.json`                                          |
| ~~Road surface bake~~                                                        |      ~~1~~ | ✅ **delivered and live, this phase**                               |
| Stage 2/3/4-specific ground bakes                                            |          3 | `GROUND_FRAMES` reuses stage 1's                                    |
| Stage 3/4 full production plan (roadmap §P16 Assets)                         |       ~290 | `productionBatches.json` extension owed when generation is possible |

## 7. Open items this phase adds

1. **Road slice provenance** — tool/licence unstated at delivery; recorded in
   LICENSES with the user question flagged.
2. **Polish debts:** tile joints read as kerb joints but two seams are
   noticeable per screen; driveway kerb cuts don't exist where the entry
   manoeuvre crosses the verge; near-side verge shows under the drive-thru's
   on-road spill (the fix wants either art or the road-width decision).
3. **The delivered slice looks four-lane** (double-yellow centre + per-half
   dashes read as 2×2 at a glance) while the sim road is 1×2 — adjacent to the
   standing road-width/traffic-density/lane-change user decision; if the road
   ever widens, this art is already the right art.
4. **CHANGE REQUEST — absolute sim-perf backstop.** `sim.bench.test.ts`'s
   "under 5 ms" is the Phase 2 reference; after P15's §11-recorded cost it
   flips on CI runner lottery with zero code change (§3.1). Proposal: 5 → 8 ms
   with the old value retained in the comment — same recorded form as the
   32 B/tick allocation raise of 2026-08-15 — leaving the calibrated 1.15×
   regression gate as the sharp instrument. **Needs the user's yes; not
   applied.**
