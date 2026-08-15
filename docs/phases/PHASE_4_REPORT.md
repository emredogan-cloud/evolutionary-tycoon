# PHASE 4 COMPLETION REPORT — Art Direction & Asset Pipeline v1

**Phase:** 4 — the art contract and the machinery that enforces it
**Date:** 2026-08-15
**Result:** 🟡 **PARTIAL** — the pipeline is complete and proven; **no production art exists**, because the phase's own START CONDITION did not close
**Batch:** P2 → P3 → P4, authorised together on 2026-08-14. **This is the end of the batch. Execution stops here.**

**Branch:** `phase/04-asset-pipeline`

---

## 1. The headline, stated plainly

Phase 4 has two halves. One is machinery: a palette, a prompt contract, nine validation checks, a
processing/atlas/manifest/report pipeline, a loader and a loading screen. The other is art: six to
ten golden references, human approval, then roughly 160 sprites generated in category batches.

**The machinery is built, tested, and gating CI. The art does not exist and was not attempted.**

That is not a shortfall against the plan — it is the plan. The roadmap opens Phase 4 with a START
CONDITION and states the consequence of failing it without ambiguity:

> "Bu kapı geçilmeden Faz 4'te tek bir üretim asset'i üretilmez. **Altın referans üretimi de buna
> dâhil.**"
> — GAME_EXECUTION_ROADMAP, Phase 4 START CONDITIONS

The gate did not close. So nothing was generated, and — the second half of the same rule — no
provider was quietly swapped for one with friendlier terms.

Reporting this as a PASS would require either producing art through an unverified licence or calling
the gate closed when it is not. Both are worse than a PARTIAL.

---

## 2. START CONDITION — the licence gate

Nine items, per candidate tool, from primary sources: official URL, access date, verbatim quote.
Full tables in [`assets/LICENSES.md`](../../assets/LICENSES.md) §1.

| Provider    | Items met | Verdict                                                                                                   |
| ----------- | --------: | --------------------------------------------------------------------------------------------------------- |
| God Mode AI |     6 / 9 | Strongest terms — an outright **assignment** of copyright, no attribution, no training on private content |
| Scenario    |     5 / 9 | Ownership and redistribution clear; item 6 — self-serve content may improve their models                  |
| PixelLab    |     3 / 9 | Five items unaddressed. Viable as a backup, not as primary                                                |
| Sprixen     |     0 / 9 | **No primary terms document located.** Only marketing copy on the product site                            |

**Item 8 — rights after a subscription ends — is unaddressed by all four.** That is the item the
Phase 1 correction added deliberately, because it is the one that bites late: a studio that cancels a
subscription and finds its shipped art was licensed only while paying has a problem no engineering
fixes. It cannot be closed by reading a public page; it needs written confirmation.

Sprixen deserves a specific note. Its site claims a commercial licence, royalty-free use and no
attribution. Those claims are exactly the class of secondary evidence this gate exists to reject —
marketing copy is not a licence, and the gate specification says so: _"Sitede yazıyor" yeterli
değildir._

**To close the gate**, three things are needed and none of them are code:

1. Ask God Mode AI in writing whether the copyright assignment survives cancellation, and whether
   uploading reference images grants them any rights.
2. Decide whether Scenario's self-serve training clause is acceptable, or whether it argues for
   Enterprise.
3. Obtain a real terms document for Sprixen, or drop it from the candidate list.

Recommendation on the evidence gathered: **God Mode AI as primary**, subject to (1).

---

## 3. What was built

| Area                  | Detail                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Palette**           | `docs/assets/palette.json` — 48 colours, twelve four-step ramps, with the validator's own thresholds carried in the file      |
| **Prompt block**      | `docs/assets/PROMPT_BLOCK.md` — the immutable style contract, **hash-enforced** so "immutable" is a mechanism, not a promise  |
| **Reference heights** | `docs/assets/referenceHeights.json` — the seven heights §1.2 actually states, and an explicit list of what nobody has decided |
| **Naming**            | `naming.ts` — the §3 grammar as a parser; all fifteen documented examples parse, ten malformed names are rejected             |
| **Validator**         | `validate.ts` — nine checks, plus two set-level checks §4.3 implies but does not list                                         |
| **Processing**        | `process.ts` — trim, re-anchor, sRGB, 1x variant, sharp with pinned encoder options                                           |
| **Atlas**             | `atlas.ts` — MaxRects-BSSF, 2px padding + extrude, power-of-two, trim on, rotation **off**; anchors carried alongside frames  |
| **Manifest**          | `manifest.ts` — per-file SHA-256, priority totals, and the contract stamp (prompt hash + palette version)                     |
| **Report**            | `report.ts` — §13 category budgets, total, critical path, boot, and the §7 atlas fill floor                                   |
| **Contact sheets**    | `contactSheet.ts` — every asset at 100% and 50% on the real game ground, plus a greyscale silhouette sheet                    |
| **Audio**             | `audio.ts` — WAV → OGG + M4A at −16/−20 LUFS. Built now, used in Phase 17                                                     |
| **CLI**               | `pnpm assets:{validate,process,atlas,audio,manifest,report,contact-sheet,build}`                                              |
| **Runtime loader**    | `AssetLoader.ts` — manifest fetch, three-attempt exponential backoff, byte-accurate progress                                  |
| **Loading screen**    | `LoadScene.ts` — replaces `BootScene`; a real progress bar, and it says on screen when it is running on placeholders          |
| **Surface colours**   | `src/config/surfaces.ts` — the renderer's provisional ground/road colours moved onto the locked palette                       |
| **CI**                | A new `assets` job: validate, build with budgets, and a placeholder-reproducibility check                                     |

### 3.1 Two constants this pipeline chose rather than quoted

Both are called out because a reader should be able to argue with them.

**`COVERAGE_AXIS = 0.6`, applied to the dominant axis rather than to area.** §4.3 says the alpha
bounding box must cover "≥60% of the canvas". Read as _area_, the check is unsatisfiable for
anything not roughly square: a sedan is 288 × 90 px (§1.2), so on a square canvas its bounding box
covers at most 288·90 / 288² = **31%** however well it is framed. A check no correct asset can pass
is not a check. It is therefore read along the longest axis, which preserves the stated intent —
_"aşırı boşluk yok"_, no excessive empty space — at any aspect ratio. **The 0.6 threshold itself is
unchanged.**

**`PER_FILE_BUDGET_MULTIPLIER = 3`.** §13 budgets a category total and an expected file count, which
gives an average but not a per-file cap. The average alone would fail correct assets, since some
sprites are legitimately larger; the category total alone catches nothing until the whole batch
exists. Three times the average is a chosen middle. The real total is enforced by `report.ts`. This
number is not from the documents.

---

## 4. Five defects found and fixed

Each was found by a test or a measurement, not by inspection.

### 4.1 The visual regression gate could not see a repainted ground

**Severity: high.** Phase 3's `playwright.config.ts` set `maxDiffPixelRatio: 0.002` with the comment
_"a minimal tolerance for anti-aliasing noise, not a licence to drift"_ — but left `threshold` at
Playwright's default of **0.2**. The two are not interchangeable: `threshold` decides whether a pixel
counts as different at all, `maxDiffPixelRatio` decides how many may. With the first at 0.2, the
second was decorative.

Discovered by accident. Moving the renderer's surface colours onto the locked palette repainted the
lot and road from `#4a5d3a`/`#3b3b40` to `#586e22`/`#3a414c` — **233,365 pixels, a quarter of the
frame** — and the suite passed. Forcing a snapshot rewrite (`--update-snapshots=all`) proved the
goldens really did still hold the old colours.

Fixed by setting `threshold: 0`, affordable because the rendering is bit-exact (the determinism test
asserts ten consecutive captures are byte-identical, and Phase 3 measured host and container output
equal by SHA-256). `maxDiffPixelRatio` stays as the cross-machine anti-aliasing margin.

**Proof it now fires:** changing one channel of one colour by one unit — `0x586e22` → `0x586e23` —
fails the gate with _"233418 pixels (ratio 0.26 of all image pixels) are different"_. Before the fix,
a 22-unit change across three channels was invisible.

Three goldens regenerated in the pinned container under the strict threshold.

### 4.2 The success green and the danger red collapsed under deuteranopia

`palette.test.ts` simulates protanopia, deuteranopia and tritanopia over the pairs that carry
meaning. The first palette draft used `foliage-500` for UI success against `crimson-500` for danger.
Under deuteranopia they separate by **22.6 units** — for the one pair that must never be confusable.

Fixed in the palette, not the threshold: UI success moved to `foliage-300`, the lit step, which
clears by **74**. ASSET_PIPELINE §12's requirement is now enforced by a test rather than asserted in
a document.

### 4.3 The prompt block hash was hashing the wrong text

`readPromptBlock` located its markers with `indexOf`, which found the **first** occurrence — and the
document explains its own markers in prose above the block. So it hashed the sentence describing the
mechanism, and produced a plausible-looking hash of the wrong thing.

Fixed by anchoring the markers to their own line and requiring exactly one of each. Caught by the
test that asserts the block contains `STYLE`, `CAMERA`, `LIGHT` and the rest.

### 4.4 The per-tick allocation gate was flaky, and had been since Phase 2

`pnpm verify` failed on `allocates essentially nothing per tick in steady state` — 8.87 B/tick
against a budget of 8. Nothing in `src/sim` changed in Phase 4, so this was not a regression.
Re-running seven times produced two failures (8.87 and 9.84) and five passes: a gate firing on
roughly one run in four.

The cause was methodological, not a budget being too tight. `measureAllocationPerTick` took a
**single** `heapUsed` delta across 200,000 ticks. That delta is the simulation's allocation _plus_
whatever else the runtime did in the same window — and the first sample after warm-up carries the
cost of structures the warm-up itself created.

Fixed by taking the minimum of five samples. The minimum is the correct statistic because the noise
is one-sided: runtime bookkeeping can only add to a heap delta, never subtract. This is the same
reasoning Phase 2 already applied to the timing regression gate, which compares the minimum of 25
samples for the same reason.

**The 8 B budget did not move.** What moved is how the number is arrived at, and the result is
decisive about the diagnosis:

```
measured 0.02 B/tick (worst sample 0.09)   x4 consecutive runs
```

Two orders of magnitude below the budget, and stable — where the single-sample version was reading
between 2 and 10. Eight consecutive `pnpm bench:sim` runs now pass.

`tools/bench/baseline.json` still records `bytesPerTick: 0.227` from a CI run under the old
methodology. It is left as recorded rather than hand-edited, because it is evidence from a real run —
and it is not asserted against; only the timings are.

### 4.5 Atlas fill was reported as 120.8%

`detectIdentical` makes duplicate art share one rect, so summing every frame's area counts shared
pixels once per frame. Fixed to count distinct rects. Worth noting because the wrong number was
**above** the §7 floor: it would have been quoted into this report as a pass.

---

## 5. Definition of Done — 15 items, with evidence

| #   | Criterion                                    | Result | Evidence                                                                                                         |
| --- | -------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Implementation works                         | 🟡     | Pipeline runs end to end on synthetic fixtures; **no production art to run it on**                               |
| 2   | `pnpm lint` clean                            | ✅     | exit 0                                                                                                           |
| 3   | `pnpm typecheck` clean                       | ✅     | 222 files, 0 errors, 0 warnings                                                                                  |
| 4   | Tests green + coverage                       | ✅     | **583 passed** (37 files); lines 98.46%, branches 89.85%, functions 96.64%                                       |
| 5   | Build succeeds, within budget                | ✅     | **406.45 kB gzip / 550 kB**                                                                                      |
| 6   | E2E green (Chromium + Firefox), WebKit smoke | ✅     | 48 passed / 12 skipped; WebKit 3/3 in the pinned container (local host lacks `libevent-2.1-7t64`)                |
| 7   | Visual regression                            | ✅     | 3 goldens regenerated, 6/6 green **under a gate that now actually fires** (§4.1)                                 |
| 8   | CI GREEN                                     | ⬜     | _recorded below after the run_                                                                                   |
| 9   | Preview deployment healthy                   | ⬜     | _recorded below_                                                                                                 |
| 10  | No critical console errors                   | ✅     | Standing fixture assertion on every E2E test                                                                     |
| 11  | No runtime errors in real use                | ✅     | Loading screen → world, `data-asset-state="placeholder"`, console clean                                          |
| 12  | Performance within budget                    | 🟡     | Texture memory recorded (0.79 MB, placeholders only). **No FPS measured** — nothing in P4 touched the frame loop |
| 13  | Documentation synchronised                   | ✅     | §7                                                                                                               |
| 14  | Project Memory updated                       | ✅     | Checkpoints K and L                                                                                              |
| 15  | Phase report written                         | ✅     | This file                                                                                                        |

**Roadmap Phase 4 task list, honestly scored:**

| #   | Task                                     | Result | Note                                                           |
| --- | ---------------------------------------- | ------ | -------------------------------------------------------------- |
| 1   | palette.json + prompt block              | ✅     |                                                                |
| 2   | 6–10 golden references → human approval  | ❌     | **Blocked on the licence gate.** Also a human gate             |
| 3   | Category batch production                | ❌     | Blocked on 2                                                   |
| 4   | `validate.ts` — nine checks              | ✅     | Each proven to fail on the right input                         |
| 5   | process / atlas / manifest / report      | ✅     | Deterministic output measured, not assumed                     |
| 6   | Contact sheet generator                  | ✅     | Exercised on fixtures                                          |
| 7   | Asset loading system                     | ✅     | Priorities, retry, real progress                               |
| 8   | Loading screen with real progress        | ✅     |                                                                |
| 9   | Replace placeholders, clear the register | ❌     | Blocked on 3. Register still lists six                         |
| 10  | Update visual goldens                    | ✅     | Updated for the palette change — and the gate was repaired     |
| 11  | Run the four consistency gates           | ❌     | Nothing to run them on; three of the four are human judgements |

---

## 6. Verification commands and output

```
pnpm lint            exit 0
pnpm format:check    All matched files use Prettier code style!
pnpm typecheck       222 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS
pnpm depcruise       no dependency violations found (74 modules, 175 dependencies)
pnpm knip            exit 0
pnpm assets:validate assets:validate — 0 files in assets/source ... Nothing was validated or built.
pnpm assets:build    all stages ran; all budgets within limits
pnpm test:coverage   583 passed (37 files) · lines 98.46% · branches 89.85%
pnpm bench:sim       10 passed (8 consecutive runs green after the §4.4 fix)
pnpm build           406.45 kB gzip / 550 kB
pnpm e2e             48 passed, 12 skipped
pnpm test:visual     6 passed (in the pinned container)
webkit-smoke         3 passed (in the pinned container)
```

**`pnpm assets:validate` on an empty tree reports "0 assets" and exits 0.** That is deliberate and
the wording is deliberate: an empty pipeline is not a passing pipeline, and printing a row of ticks
over nothing would be the exact species of false evidence this project forbids.

### 6.1 Determinism, measured

The roadmap requires deterministic pipeline output — the manifest hashes it and the CDN caches on
that hash. Measured rather than inferred from pinned versions:

- `processDirectory` run twice into different directories → **all eight outputs SHA-256 identical**
- `buildAtlases` run twice → **`props.webp` and `props.json` SHA-256 identical**
- `writeManifest` run twice → **identical content hash**
- `pnpm placeholders:build` → **zero diff** against the committed set

---

## 7. Documentation changed

| File                                | Change                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `assets/LICENSES.md`                | **New.** Nine-item tables for four providers; gate verdict              |
| `assets/MANIFEST.md`                | **New.** Provenance format, and the explicit statement that it is empty |
| `docs/assets/palette.json`          | **New.** The 48-colour contract                                         |
| `docs/assets/PROMPT_BLOCK.md`       | **New.** The immutable prompt body, hash-recorded                       |
| `docs/assets/referenceHeights.json` | **New.** Declared heights, and a `pending` list of undecided ones       |
| `docs/PERF_LOG.md`                  | Phase 4 entry: texture memory, and the 4096-page arithmetic             |
| `docs/PROJECT_MEMORY.md`            | Checkpoints K and L; §17 asset state; §21 next authorised action        |
| `docs/PLACEHOLDER_REGISTER.md`      | Still six. Nothing was replaced, and the register says why              |

**No approved document was modified.** ASSET_PIPELINE, TECHNICAL_ARCHITECTURE and the roadmap are
untouched; where this phase's implementation had to interpret them, the interpretation is in §3.1
rather than in an edit to the source of truth.

---

## 8. What Phase 4 leaves open

1. **The licence gate.** Three actions, all requiring the project owner (§2). Until then no art can
   be generated by anyone, not just by an agent.
2. **Golden reference approval** is a human gate by design — _"STOP and get human approval"_.
3. **The four consistency gates.** One (contact sheets) has a generator; three are side-by-side human
   judgements with nothing to judge.
4. **Undeclared reference heights.** `referenceHeights.json` carries only the seven heights §1.2
   states. Every other subject in the stage 1–2 set is on the `pending` list, and the validator
   **fails** rather than passes them. Those are open art decisions, listed instead of guessed.
5. **Texture memory at scale.** 0.79 MB today is meaningless; the constraint that will bite is that a
   single 4096-square atlas page costs 64 MB of RGBA8 — a third of the desktop budget (§ PERF_LOG).
6. **Phaser's WebGL1/WebGL2 contradiction** from Phase 3 remains open and untouched
   (PROJECT_MEMORY §12, open contradiction #4). It did not block Phase 4.

---

## 9. Change record — dependencies

Per [WORKING_DISCIPLINE §2.5.2](../WORKING_DISCIPLINE.md):

| Package                | Version    | Why                                                               | Status                                                                                                           |
| ---------------------- | ---------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `sharp`                | **0.35.3** | Image processing for `process.ts`, atlas encoding, contact sheets | Already named in the approved stack (TECHNICAL_ARCHITECTURE §3, roadmap Phase 4) — first install, not an upgrade |
| `free-tex-packer-core` | **0.3.9**  | Atlas packing                                                     | Same                                                                                                             |

Both are `devDependencies`: they run at build time and no byte of either reaches the browser.

**Environment note.** Phase 3's container golden run left `node_modules` linked to the container's
pnpm store (`/work/.pnpm-store`), so `pnpm add` failed with `ERR_PNPM_UNEXPECTED_STORE`. The
root-owned directories were removed from inside the same pinned container and the install redone
against the host store. `.pnpm-store/` is gitignored; nothing reached the repository. The
`test:visual:update` script also needed `mkdir -p /tmp/bin` before `corepack enable`, which was
failing outright.

---

## 10. Assessment

The half of Phase 4 that could be done was done thoroughly, and it found a defect in Phase 3's
visual gate that would otherwise have let real art drift silently — which is, in a small way, the
phase justifying itself. The half that could not be done was not faked, not worked around, and not
quietly reduced in scope.

**Phase 4: PARTIAL.** The batch ends here.
