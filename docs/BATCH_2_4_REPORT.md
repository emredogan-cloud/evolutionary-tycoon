# BATCH REPORT — PHASES 2 → 4

**Authorised:** 2026-08-14, as a batch, with autonomous execution between phases
**Executed:** 2026-08-14 → 2026-08-15
**Scope:** P2 Simulation Core · P3 Isometric Rendering · P4 Art Direction & Asset Pipeline v1

---

# PHASES 2–4 COMPLETE

| Phase                                | Result         | Report                                     |
| ------------------------------------ | -------------- | ------------------------------------------ |
| **P2 — Simulation Core**             | ✅ **PASS**    | [PHASE_2_REPORT](phases/PHASE_2_REPORT.md) |
| **P3 — Isometric Rendering & World** | ✅ **PASS**    | [PHASE_3_REPORT](phases/PHASE_3_REPORT.md) |
| **P4 — Art Direction & Pipeline v1** | 🟡 **PARTIAL** | [PHASE_4_REPORT](phases/PHASE_4_REPORT.md) |

P4 is reported as partial, not as a pass. Its machinery is complete and gating CI; no production art
exists.

The reason changed mid-flight and the two are worth keeping apart. Until 2026-08-15 the blocker was
the phase's own START CONDITION — nine-item licence verification — which did not close. The project
owner then **opened that gate by executive override**, selecting God Mode AI and accepting the two
unverified items for the MVP ([LICENSES §1.5](../assets/LICENSES.md)). Licensing no longer blocks
anything.

What blocks it now is capability: **the agent has no image generation of any kind** — no model, no
provider account, no API key. That is not an objection that further instruction can lift, and it is
set out with the alternatives that were explicitly _not_ taken in
[PHASE_4_REPORT §11](phases/PHASE_4_REPORT.md). What was built instead is the thing that makes
generation mechanical for whoever can do it: `pnpm assets:prompts` emits 172 ready-to-send prompts
across 12 batches, sized from the same derivation the validator checks against.

# PHASES 5–7 NOT AUTHORIZED

No work was started, prepared, scaffolded or "cleaned up towards" for Phase 5 (Traffic), Phase 6
(Customers) or Phase 7 (Navigation).

---

## 1. What the three phases produced

**Phase 2** turned an empty repository into a deterministic simulation kernel: a 20 Hz fixed
timestep with an accumulator and a catch-up ceiling, six independently seeded sfc32 streams, an
FNV-1a 64-bit world hash computed from four 16-bit limbs, a command log applied at tick start,
a zero-allocation typed event bus, SoA vehicle storage, and a versioned save format with CRC-32 over
canonical JSON and three rotating backups.

**Phase 3** made it visible: a 2:1 dimetric projection with an exact inverse, painter's-algorithm
depth sorting anchored at the footprint centre with a bounded stable tie-break, nine render layers of
which exactly one is sorted per frame, a camera, a two-snapshot interpolating render bridge, a visual
determinism mode, three goldens, and the project's first real-GPU measurement.

**Phase 4** wrote the art contract and the machine that enforces it: a locked 48-colour palette, a
hash-locked prompt block, nine validation checks, a deterministic process→atlas→manifest pipeline
with budget enforcement, contact sheet generation, a runtime loader with real byte-accurate progress,
and a loading screen that says on screen when it is running on placeholders.

## 2. Numbers, measured

| Metric                     | Phase 2   | Phase 3   | Phase 4         |
| -------------------------- | --------- | --------- | --------------- |
| Tests (unit + integration) | 331       | 447       | **583**         |
| Line coverage              | 98.7%     | 98.56%    | 98.46%          |
| Branch coverage            | 90.4%     | 89.81%    | 89.85%          |
| Bundle (gzip)              | 41.22 kB  | 405.39 kB | 406.45 kB       |
| E2E                        | 23 passed | 48 passed | 48 passed       |
| Visual goldens             | —         | 3         | 3 (regenerated) |

Budget: 550 kB. Headroom at the end of the batch: **26%**.

Real-hardware performance was measured once, in Phase 3, on a GTX 1660 Ti: **200 FPS p50, 5.1 ms
frame p95** against a 16.6 ms budget, with depth sorting at 0.013 ms per 260 objects against a
0.15 ms budget. That measurement was vsync-capped and is reported as proving headroom exists rather
than quantifying it. Phase 4 changed nothing in the frame loop and did **not** re-measure, so no FPS
number is claimed for it.

## 3. Defects the batch found in its own work

Sixteen real defects were found by tests and measurements rather than by review. The ones that would
have shipped silently:

| Phase | Defect                                                                               | How it surfaced             |
| ----- | ------------------------------------------------------------------------------------ | --------------------------- |
| P2    | `MAX_CATCHUP_TICKS` was dead code — the frame clamp made it unreachable              | Writing a test for it       |
| P2    | CRC-32 consumed two bytes per UTF-16 unit, so it did not match published vectors     | Published test vectors      |
| P2    | Our own bundle called `eval()` — Zod probes `Function('')` for a JIT path            | Preview E2E under CSP       |
| P3    | Interpolation silently collapsed; later frames blended from an already-reached pose  | A test of frame ordering    |
| P3    | The depth tie-break could outvote a real height difference                           | Arithmetic on the bound     |
| P3    | Checksum verified after migration, so every v1 save broke the moment v2 landed       | Migration test              |
| P3    | The stress scene measured 74 actors while claiming 100                               | Real-hardware run           |
| P4    | **The visual gate could not see a repainted ground** — 233,365 pixels, and it passed | Changing a colour           |
| P4    | UI success green and danger red collapsed under simulated deuteranopia               | Colour-blind test           |
| P4    | The prompt block hash was hashing the prose that describes the markers               | Content assertion           |
| P4    | Atlas fill reported 120.8% — above the floor it was supposed to enforce              | Impossible number           |
| P4    | The per-tick allocation gate had been flaky since P2 — one failure in four runs      | `pnpm verify`               |
| P4    | The 15% regression gate benchmarked twice per process and gated on the degraded run  | CI, on this PR              |
| P4    | Production smoke hardcoded `schemaVersion !== 1` — red on main since the P3 merge    | Checking main after merge   |
| P4    | Check 4 compared drawn sprites against world heights — would reject every vehicle    | Building the prompt emitter |
| P4    | Check 6 would have split every car; §1.4's 160 px means 2.5 m of body, not sprite    | Building the prompt emitter |

The Phase 4 visual-gate defect is the one worth singling out, because it was a defect in a **gate**:
Phase 3 set `maxDiffPixelRatio: 0.002` and left `threshold` at Playwright's default of 0.2, which
made the ratio meaningless. Every Phase 3 golden was, in effect, ungated against colour drift. It is
now `threshold: 0`, and a one-unit change in one channel of one colour has been measured to fail it.

## 4. Process commitments, kept

The batch instruction was explicit that autonomous execution does not mean skipping gates. For the
record:

- **No test was weakened, deleted or quarantined.** Where a threshold was in the way, the cause was
  fixed — coverage gaps were closed by collapsing unreachable branches and adding failure-path tests,
  and the deuteranopia failure was fixed in the palette rather than in the assertion.
- **No known failure was carried forward.** Each phase's validation ran before the next began.
- **CI was strengthened, never weakened.** Phase 2 restored preview E2E to blocking; Phase 3 added
  the visual regression job; Phase 4 added the asset job and repaired the visual gate's threshold.
- **No error was suppressed.** The CSP was not loosened with `unsafe-eval` when our own bundle
  tripped it; the cause was fixed at source with `z.config({ jitless: true })`.
- **No architecture was silently changed**, and no approved document was edited. Where Phase 4's
  implementation had to interpret an ambiguous requirement, the interpretation and its arithmetic are
  written into [PHASE_4_REPORT §3.1](phases/PHASE_4_REPORT.md) rather than into the source document.
- **No scope was silently expanded.** One judgement call is worth naming: Phase 4 moved the
  renderer's provisional ground and road colours onto the locked palette. That was in scope (P4 owns
  the art direction, and task 10 is "update the visual goldens"), it is recorded, and it is what
  exposed the visual gate defect.
- **No hook was bypassed.**

## 5. Deployment

Recorded in the phase reports with commit SHAs and fetched `/health.json` output. Vercel
Authentication remains **disabled** — it was not re-enabled, and preview E2E remained a blocking
gate for the whole batch.

Production serves `ad76943` at schema v2, verified by fetching `/health.json` and running the smoke
E2E against the live alias (6 passed).

One gate-design lesson is worth carrying forward: `Production smoke` runs _after_ a merge, so it can
never block anything, and it had been failing on every push to main since Phase 3 without appearing
on any PR. Phase 3's report recorded production as healthy in good faith — it was written before the
merge, and the job that contradicted it ran afterwards. A post-merge check needs someone to look at
it, and "someone will notice" is not a mechanism.

## 6. What the batch leaves open

1. **Art production** — blocked on capability, not on any decision
   ([PHASE_4_REPORT §11](phases/PHASE_4_REPORT.md)). Every prompt is written and waiting.
2. **The two unread licence items** — accepted rather than answered. Two written questions to God
   Mode AI would still retire the larger one.
3. **Phaser's WebGL1/WebGL2 contradiction** — measured in Phase 3, four documents disagree with the
   measurement, referred to the user and untouched since. It does not block anything; it only makes
   the Phase 1 capability gate stricter than necessary.
   (PROJECT_MEMORY §12, open contradiction #4)
4. **Undeclared reference heights** — every subject beyond the seven ASSET_PIPELINE §1.2 states is
   listed as pending and **fails** validation rather than passing.
5. **S1: how many real minutes is one game day** — still open, decided by playing in Phase 5.

---

## FINAL STATE

> **PHASES 2–4 COMPLETE** — P2 PASS, P3 PASS, **P4 PARTIAL**.
> **PHASES 5–7 NOT AUTHORIZED.**
>
> Execution has stopped and is waiting for explicit approval. P4's remaining work is ~165 generated
> images; the licence gate that once blocked it is open, and every prompt needed to produce them is
> emitted by `pnpm assets:prompts`.
