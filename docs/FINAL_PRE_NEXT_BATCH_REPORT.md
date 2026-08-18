# FINAL PRE-NEXT-BATCH REPORT — consolidation, 2026-08-18

**Scope:** production-art integration · world authoring · visual QA · P11–P13 open-issue closure ·
validation. **Not** P14 or any new roadmap phase.
**Branch:** `phase/consolidation-art` (stacked on `phase/11-evolution`) · 23 commits ·
final SHA in §7.
**Companion:** [`ASSET_INTEGRATION_REPORT.md`](ASSET_INTEGRATION_REPORT.md) — the asset chain in full.

---

## 1. The seven inherited open issues

| #   | Issue                        | State                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Average ticket model         | **RESOLVED** — ADR-016 combo baskets; chances solved against §3, both blocked assertions now evaluable; Stage 3 timing green on first measurement. New successor debt named: stage 2–4 income calibration (`CALIBRATED_STAGES=[1]`).                                                                             |
| 2   | Evolution strands the player | **RESOLVED** — ADR-014 operating reserve; the recorded ₡804 scenario is reproduced verbatim in `evolutionReserve.test.ts` and refused; boundary/hire/income-recovery/save tests at every stage.                                                                                                                  |
| 3   | Idle player progression      | **RESOLVED (change control)** — ADR-015; product classified from the GDD (active + light idle, offline is P14's §17 system); attention ladder measured (21.7 min → never across five attention levels); ECONOMY_DESIGN §13 amended to what the gate already enforced. No fake automation added.                  |
| 4   | Human playtest (3×1h)        | **NOT RUN** — and not simulable. `PLAYTEST_PROTOCOL.md` + `PLAYTEST_RESULTS_TEMPLATE.md` prepared: three player profiles, observer discipline, timeline, 18 questions, severity rules, the five art judgements embedded. Zero fabricated observations.                                                           |
| 5   | Art-dependent judgements     | **DONE as AGENT VISUAL REVIEW** (§2 below) — explicitly not a player test.                                                                                                                                                                                                                                       |
| 6   | WebKit                       | **RESOLVED** — local: **not available** (`libevent-2.1-7t64`, needs root; unchanged). Pinned CI container (`playwright:v1.62.1-noble`): **3/3 smoke passed**, log in the batch evidence.                                                                                                                         |
| 7   | WebGL1/WebGL2 contradiction  | **CHANGE CONTROL REQUIRED** — ADR-017 (Proposed) with the runtime measurement: browser offers WebGL2, the live canvas holds WebGL1, the gate refuses WebGL1-only browsers the game would serve. Options + recommendation written; per CLAUDE.md, no gate or document touched without the reserved user decision. |

## 2. AGENT VISUAL REVIEW — the five deferred judgements

Made from deterministic captures of the deployed build. **This is an agent's visual/technical
judgement, not player feedback**; the playtest protocol asks people the same questions.

| #   | Judgement (deferred since)          | Verdict            | Grounds                                                                                                                                                                                                                                                           |
| --- | ----------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Conversion moment reads (P6)        | **READS**          | A committed car visibly sheds speed over 16 m (decision point re-authored so the fastest sedan can physically make the turn), nose-dips, turns in; the accordion forms behind it. Gap: no `_brake` frames — the tint that stood in read as paint and was removed. |
| 2   | Pedestrian naturalness (P7)         | **ADEQUATE**       | Five-part figures with distance-driven stride, arm counter-swing and bob read as people, not sliders, at 56 px. Ceiling: legs are painted into the delivered body art, so strides cannot articulate — regeneration item.                                          |
| 3   | Service loop satisfaction (P8)      | **READS**          | Order icon over the head → kitchen → pass → hand-over, on a counter whose pastry case and till give the transaction a place. The basket's tray rule makes the pass visibly _hold_ food.                                                                           |
| 4   | Employee intent (P10)               | **PARTIAL**        | Employees have appearance, heading and task motion; the amber work-shirt tint separates them from customers at a look, but weakly at distance. Real fix is uniform art (regeneration list).                                                                       |
| 5   | Stage silhouettes, same place (P11) | **READS STRONGLY** | Stand → truck → terrace diner → restaurant+drive-thru are unmistakably four eras of one corner: the roadside landmarks are pinned by test (`sprites.test.ts` asserts their coordinates across all four layouts).                                                  |

**Overall visual quality judgement:** the world now reads as an illustrated place, not systems on
placeholders; coherent palette family (measured, 12–30 affinity), one camera, consistent scale. The
honest deductions: all-white vehicle paint (runtime tint hooks exist, no variety wired), ten missing
vehicle rear views bridged by nearest-truthful facings, and a UI icon batch that measurably left the
palette family (7 waivers). Category-average for this genre — met on world art, short on vehicle
completeness and UI icon consistency.

## 3. Verification (exact, this SHA)

| Gate                                                                                                                                      | Result                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm verify` (lint · format · 3×tsc+svelte · depcruise · knip · assets validate+build · coverage · balance:check · bench · build · size) | ✅ exit 0 at `a259642` (2026-08-19). The bench regression gate false-tripped once at host load ≈5 — all ten scenarios +15–52% with zero code change — and passed 21/21 at load 1.5; the mixed calibration cancels a different CPU, not a contended one                                                                                                                                                                                     |
| Unit + integration                                                                                                                        | **1 374 passed** (incl. 10 basket pins, 7 reserve scenarios, and 15 defensive-arm tests added to clear the config/render coverage floors)                                                                                                                                                                                                                                                                                                  |
| Determinism suite                                                                                                                         | **61/61**, world-hash pin renewed 8th time, Node ≡ browser (`4a7f9c6d7871981a`)                                                                                                                                                                                                                                                                                                                                                            |
| Balance gate (120 min CI)                                                                                                                 | **5/5**; merge-blocking dead-end worst 73.8 s of 90                                                                                                                                                                                                                                                                                                                                                                                        |
| Balance manual (720 min)                                                                                                                  | **5/5**; uncalibrated stages report numbers, not asserted                                                                                                                                                                                                                                                                                                                                                                                  |
| Perf budgets (`bench:sim`)                                                                                                                | **21/21**                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| E2E Chromium + Firefox                                                                                                                    | **146 passed + 12 deployment-only skips** (the header/health tests × 2 browsers run against the preview instead — §4). Includes 8 production-art assertions. Running the suite against the CDN exposed a boot race in six helpers — HUD read before the bridge went live — fixed in `e331158`; suite re-run green after the fix                                                                                                            |
| WebKit smoke                                                                                                                              | local **not available** · pinned container **3/3**, re-run hermetically at the final tree (read-only mount, fresh install)                                                                                                                                                                                                                                                                                                                 |
| Visual goldens                                                                                                                            | **14/14**, regenerated in the container, byte-identical on host; every diff inspected, three rounds (findings in ASSET_INTEGRATION_REPORT §4)                                                                                                                                                                                                                                                                                              |
| Bundle                                                                                                                                    | 456.35 kB gzip of 550 kB · CSS 3.93 kB of 30 kB                                                                                                                                                                                                                                                                                                                                                                                            |
| Assets                                                                                                                                    | 172/172, 0 failing · texture memory 21.13 MB / 96 MB                                                                                                                                                                                                                                                                                                                                                                                       |
| CI                                                                                                                                        | **green at `d720a3f`** — run 32195375649, all 11 jobs (quality · security · assets · unit+integration · balance · perf · build+size · E2E chromium · E2E firefox · WebKit · visual). The branch's first CI runs found two real infrastructure defects the new gates were built to catch — see §4 — plus four wall-clock budgets sized for placeholder-era boots; fixed in `919bcc0`, `f530e9f`, `95f50b7`, `d720a3f`, no assertion changed |

## 4. Deployment (preview)

**Deployment of record:** the Vercel-built deployment of the final SHA, verified by the
`preview-e2e` workflow on an isolated runner. Two CLI `--prebuilt` deployments earlier in the batch
(`408eceff…`/`jyvl03uy2`, `a2596421…`/`bh7uneeeb`, both verified SHA-exact with clean walkthroughs)
are superseded.

| Check                     | Result                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| URL                       | `https://evolutionary-tycoon-3hj8n0ir3-emre30283-4955s-projects.vercel.app`                                                                 |
| `/health.json` buildSha   | `d720a3fc5f1b7f1e33369292b0690478d36e0983` — **exact match** with the branch head                                                           |
| Built by                  | Vercel's own build from the committed sources (`assets:build && build`) — no local artefacts                                                |
| Stages 1–4 on the CDN     | `assets=loaded`, 171 frames, **0 placeholders**, each stage                                                                                 |
| Live play (4 sim-min)     | HUD live, 0 placeholders                                                                                                                    |
| Console errors            | **0** (vercel.live toolbar excluded, as established in P13)                                                                                 |
| Failed / non-OK requests  | **0**                                                                                                                                       |
| Load → playable, CDN cold | **5.3 s** (quiet host, ~1.4 MB/s link, software GL; raw CDN fetch of all atlases ≈3 s; localhost real-GPU numbers stay in PERF_LOG)         |
| `preview-e2e` workflow    | **success** — run 32195593116: the full chromium suite against this deployment, on an isolated runner                                       |
| Deployment-only E2E       | headers · caching · immutability · SPA fallback · `/api/time` — **12/12**, chromium + firefox, run locally against the prebuilt deploys too |

**Two real infrastructure defects, found by the placeholder gate on the branch's first push.**
Vercel's git-integration auto-deploys and CI's build job both built from clean checkouts where
`public/atlas` — gitignored pipeline output — does not exist, so both served the game in placeholder
mode; before this batch nothing fetched atlases at runtime, so neither path had ever been caught.
`919bcc0` makes the deploy `buildCommand` run the asset pipeline and teaches the SPA fallback to
404 a missing atlas instead of serving it HTML; `f530e9f` adds the same pipeline step to CI's build
job. The `data-asset-placeholders` counter and `productionArt.spec.ts` turned both into red runs on
their first opportunity, which is precisely the job they were given.

**The dev desktop remains unfit for full-suite CDN runs** — it generates the load that starves it.
Testing from it anyway surfaced a real boot race (six helpers read the HUD before the bridge
publishes; the sim was earning while `data-cash` sat at 0.00 — fixed in `e331158`) and mis-sized
readiness budgets (`95f50b7`, `d720a3f`). With those fixed, the isolated runner passes the suite
against the CDN; the desktop's role is exploration, the runner's verdict is the record.

## 5. Performance after real art

`PERF_LOG.md`, consolidation entry — first real-GPU + real-assets measurement:
**5.05 ms mean frame (p99 5.1) on a GTX 1660 Ti** with every atlas resident; navigation→ready 1.2 s
(localhost); JS heap 29 MB; texture memory 21.13 MB decoded (placeholder era: 0.79 MB); no
pre-existing budget regressed. SwiftShader figures deliberately not reported as FPS, per CLAUDE.md.

## 6. Remaining risks and debts (named, owned)

1. **Stage 2–4 income calibration has never been performed** — newly _measurable_ (that is the
   progress), gated behind `CALIBRATED_STAGES`, entangled with the user-owned traffic-density
   decision. First numbers: A3 peak ₡66/min vs designed 62–179 corridor (inside, low), A4 arrival
   371–379 min vs ≤320, A2-entry dead-end 166 s.
2. **ADR-017 (WebGL) awaits the user decision** CLAUDE.md reserves.
3. **Art regeneration list** — ASSET_INTEGRATION_REPORT §5 (10 vehicle views, legs, brake frames,
   5 food icons, 7 UI icons, road bake, stage ground bakes).
4. **Drive-thru full-length lane** wants lot/frontage redesign (two-car lane shipped, honest).
5. **Human playtest** still zero sessions; protocol ready.
6. **PR #17 (P8–P10) remains open on GitHub**; this branch stacks two branches above it.
7. **The full E2E suite against a CDN target stays off the dev desktop** — it generates the very
   load that starves it. The boot race and budget findings it produced are fixed (`e331158`,
   `95f50b7`, `d720a3f`) and the `preview-e2e` workflow now passes against the deployed preview on
   an isolated runner, which is the standing arbiter for CDN claims.

## 7. Recommendation on P14+

**Ready to proceed once the user has looked at three things:** the ADR-017 WebGL decision, the
stage-2–4 calibration mandate (with the traffic-density decision it depends on), and this report's
art-regeneration list — the first two block nothing in P14's offline system, the third only polish.
The world is visually complete, the placeholder count is machine-zero, the economy's blocked
assertions are unblocked and honest, and every recoverability hazard the batch inherited is closed
with a regression test standing on it.

_Evidence log lines, exact SHAs and the Turkish summary are in the closing message of the
consolidation session; Project Memory §20–§22 carries checkpoints T through Y._
