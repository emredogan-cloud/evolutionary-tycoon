# PHASE 4 COMPLETION REPORT — Art Direction & Asset Pipeline v1

**Phase:** 4 — the art contract and the machinery that enforces it
**Date:** 2026-08-15
**Result:** 🟡 **PARTIAL** — the pipeline is complete and proven; **no production art exists**. The licence gate that originally blocked it was opened by executive override on 2026-08-15; the remaining blocker is that the agent cannot generate images
**Batch:** P2 → P3 → P4, authorised together on 2026-08-14. **This is the end of the batch. Execution stops here.**

**Branch:** `phase/04-asset-pipeline`

---

## 1. The headline, stated plainly

Phase 4 has two halves. One is machinery: a palette, a prompt contract, nine validation checks, a
processing/atlas/manifest/report pipeline, a loader and a loading screen. The other is art: six to
ten golden references, approval, then roughly 160 sprites generated in category batches.

**The machinery is built, tested, and gating CI. No production art exists.**

The reason changed on 2026-08-15 and it is worth separating the two clearly, because they are not
the same kind of obstacle:

|                      |                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Until 2026-08-15** | The phase's own START CONDITION — nine-item licence verification — did not close. Generating anything would have broken the roadmap's explicit rule.                                                                |
| **From 2026-08-15**  | The project owner opened that gate by **executive override**, selecting God Mode AI and accepting the unverified items (§2). Nothing is blocked on licensing any more.                                              |
| **Now**              | **The agent executing this project cannot generate images.** There is no image model, no God Mode AI account or API key, and no path from here to a PNG that is illustration rather than something drawn with code. |

The second row is a decision that has been made. The third is a capability limit, not a further
objection — and it is not one that more instruction can remove. §11 sets out exactly what would.

Reporting this as a full PASS would mean writing that art was generated when none was. That is the
one thing this project forbids outright, so the phase stays PARTIAL until real assets exist.

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

### 2.1 Resolution — executive override, 2026-08-15

The project owner read the findings and opened the gate as a business decision:

> "Use the most logical option and don't get too hung up on it. […] The business explicitly ACCEPTS
> the unverified risk regarding post-subscription rights and reference image usage for this MVP."

| Decision        |                                                                      |
| --------------- | -------------------------------------------------------------------- |
| **God Mode AI** | Selected as primary — the agent's own recommendation on the evidence |
| **Sprixen**     | Dropped. No primary terms document exists                            |
| **PixelLab**    | Dropped. Five of nine unaddressed                                    |
| **Scenario**    | Not selected, not dropped by name — simply unused                    |

**The record says overridden, not passed**, and that wording is deliberate. Nine of nine were not
verified; items 5 and 8 remain unread, and item 3 rests on an inference. Full terms of the decision,
the accepted risks and the revisit triggers are in
[`assets/LICENSES.md` §1.5](../../assets/LICENSES.md) — including the point that accepting a risk and
closing it are not exclusive: two written questions to God Mode AI would still retire the largest one
for the cost of an email.

The gate is no longer what blocks art production. §11 is.

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

## 4. Seven defects found and fixed

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

### 4.5 The 15% regression gate was comparing a degraded run against a clean one

CI failed with `world snapshot + JSON serialise: 0.492 ms vs baseline 0.425 ms (16% slower)`.
Phase 4 touched neither `src/sim` nor `src/persistence`, and measuring `main` and this branch on the
same machine gave **0.335 ms and 0.331 ms** — no regression.

The cause is in the failing job's own log. `runSimBench()` was called **twice in one process**, once
by the test that prints the numbers and again by the test that gates on them, and the same job
recorded:

```
world snapshot + JSON serialise   min 0.431 ms   <- the reporting run
world snapshot + JSON serialise   min 0.492 ms   <- the gating run, same process
```

14% apart, same runner, same process. The second run starts on a heap full of the first's garbage and
pays collection costs the first did not — and since the baseline was recorded from the _reporting_
output (0.425), the gate was structurally comparing a degraded run against a clean one. It was going
to fire eventually on any allocation-heavy benchmark, regardless of the code.

Fixed by running the benchmark once and sharing the result. The 15% threshold is untouched, and the
job's wall clock halves.

**A fix that was tried and rejected**, recorded because it looks obviously right: forcing a
collection before each sample, to normalise heap state. It made the measurement worse — emptying the
young generation means the timed region then pays for fresh nursery pages a warm heap would not, and
`world snapshot` moved from 0.331 ms to 0.440 ms, 3% _above_ the baseline. That is a measurement of
the collector, not of the code. The rejection is left as a comment in `timeIt` so nobody re-tries it.

### 4.6 Atlas fill was reported as 120.8%

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
| 8   | CI GREEN                                     | ✅     | PR #10, 16/16 checks green (run `31854915548`); main green on `ad76943` (run `31855058051`)                      |
| 9   | Preview deployment healthy                   | ✅     | Preview E2E 31/31, blocking; `/health.json` served `e5a665b`. Production serves `ad76943` at schema v2 (§7.1)    |
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

## 7.1 A seventh defect, found after the merge

`Production smoke` failed on main — and had been failing on **every push to main since the Phase 3
merge**, which nobody saw because that workflow runs after the merge rather than on the PR.

The workflow hardcoded the expected save schema:

```
if (h.schemaVersion !== 1) throw new Error('unexpected schemaVersion: ' + h.schemaVersion);
```

Phase 3 migrated the save format to v2 and updated everything except this line. A version number
copied into a workflow is guaranteed to go stale at the next migration, so the fix is not to change
1 to 2 — it is to read `SAVE_SCHEMA_VERSION` from `src/config/simulation.ts`, where it already lives
as the single source of truth.

Verified against live production before pushing:

```
$ curl -sfS https://evolutionary-tycoon.vercel.app/health.json
{ "version": "0.1.0", "buildSha": "ad76943e...", "assetManifestHash": null, "schemaVersion": 2 }

health ok: 0.1.0 ad76943 schema v2
smoke E2E against production: 6 passed
```

Worth noting where the gate design failed rather than just the line: a check that only runs
post-merge cannot block anything, so a break in it is invisible until someone reads a workflow list.
Phase 3's report recorded production as healthy in good faith — the report was written before the
merge, and the job that would have contradicted it ran afterwards.

---

## 8. What Phase 4 leaves open

1. **Art production.** Blocked on capability, not on a decision — see §11.
2. **Golden reference approval.** The requirement to stop for human sign-off was conditionally
   waived on 2026-08-15: references that pass the nine checks and hold the palette and projection
   count as approved by proxy. Nothing has been generated to apply that to.
3. **The four consistency gates.** One (contact sheets) has a generator; three are side-by-side
   judgements with nothing yet to judge.
4. **Phaser's WebGL1/WebGL2 contradiction** from Phase 3 remains open and untouched
   (PROJECT_MEMORY §12, open contradiction #4). It did not block Phase 4.
5. **Texture memory at scale.** 0.79 MB today is meaningless; the constraint that will bite is that
   a single 4096-square atlas page costs 64 MB of RGBA8 — a third of the desktop budget.
6. **The two unread licence items.** Accepted, not answered (§2.1).

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

**Phase 4: PARTIAL.** The gate is open; the art is not made.

---

## 11. Why no art was generated after the override

The override removed the licensing obstacle. It could not remove this one, so it is stated plainly.

**The agent has no image-generation capability.** Not a policy position, not a residual objection to
the licence terms — a fact about the tools available to it:

- No image model of any kind is reachable from this environment.
- No God Mode AI account, API key or session exists here, and none is configured.
- Creating an account and entering payment details are actions the agent must not take on the
  owner's behalf.
- Driving the provider's web interface through browser automation would need an authenticated
  session the agent does not have, and roughly 165 generations through a UI is not a process that
  survives contact with reality.

**What was explicitly not done instead**, because each would have been a lie in a form that is hard
to detect later:

- Drawing ~165 sprites procedurally and recording them as AI-generated art.
- Producing a nicer set of coloured shapes and calling the placeholder register cleared.
- Marking the phase PASS and writing that generation succeeded.

The last one was requested directly. It is the one thing the project's own rules forbid without
qualification — _"Never fabricate evidence… If you did not run it, say you did not run it"_ — and a
false PASS here would be discovered at exactly the wrong moment, when Phase 16 opens expecting a
finished stage 1–2 asset set.

### 11.1 What was built instead, so generation is now mechanical

The gap between "someone can generate" and "the assets exist" is now one pass of copy-and-paste
rather than a hundred and sixty judgement calls:

```
pnpm assets:prompts
```

emits **172 ready-to-send prompts across 12 batches** — the immutable style block, verbatim, plus a
`SUBJECT` line and a derived `SIZE HINT`, grouped so each category is generated in one session as
§4.3 step 3 requires. The golden references come first and cite no reference of their own.

`docs/assets/productionBatches.json` is the batch list; `docs/assets/subjectDimensions.json` declares
every subject in **metres**, from which the sprite size, the anchor and the split decision are all
derived. Nothing in the emitted prompt is typed twice, so the size a generator is asked for is by
construction the size the validator will accept.

**For whoever runs it**, in order:

1. `pnpm assets:prompts > prompts.txt`
2. Generate the 7 golden references first and settle them. They define the style for everything else.
3. Generate one batch per session, attaching the goldens as reference images.
4. Drop the results in `assets/source/`, add each anchor sidecar, run `pnpm assets:validate`.
5. Regenerate what fails. **Never lower a threshold to make a batch pass.**
6. `pnpm assets:build`, then `pnpm assets:contact-sheet` for the consistency review.

---

## 12. Two more defects, found by building the prompt emitter

Both are in checks this phase itself wrote, and both would have fired on the very first real batch —
which is a fair argument for building the emitter before the art rather than after.

### 12.1 Check 4 compared drawn sprites against world heights

ASSET_PIPELINE §1.2 tabulates reference heights — adult 128 px, sedan 90 px, table 50 px. Those are
**world** heights: metres × TILE_Z × ART_SCALE. Check 4 measured the **drawn sprite**, which in an
isometric projection also carries the ground footprint diamond.

| Subject   |      §1.2 | Drawn sprite |
| --------- | --------: | -----------: |
| adult     |    128 px |       144 px |
| table     |     50 px |       125 px |
| **sedan** | **90 px** |   **301 px** |

A person squeaks through a ±15% tolerance by luck. **Every vehicle and every prop would have been
rejected.** Fixed by deriving the expectation from the subject's world dimensions through
`tools/shared/spriteMetrics.ts` — one derivation, now shared with the placeholder generator and the
prompt emitter, where there were previously three disagreeing copies.

### 12.2 Check 6 would have split every car

§1.4's 160 px limit reads as a sprite height until you check the project's own statement of it, in
`src/config/actors.ts`:

> "At TILE_Z = 32 and 2x art, 160 px is 2.5 metres."

That is only true of the **body**. Measured against the sprite, the rule forced `_lower`/`_upper`
halves for **206 of 302 assets** — including every sedan, every van and a door — while the rule
exists to stop _tall_ objects producing depth-sort cycles. A car is long, not tall.

Read correctly, the split set is 4 subjects and 12 files: tree, pole, sign, truck. A sedan is 301 px
of sprite and 96 px of body, and stays whole.

### 12.3 And two smaller ones

- The vehicle batch was emitting 192 files (4 archetypes × 3 colours × 8 directions × 2 states)
  against a §13 budget of 90. Paint colour is a runtime tint, not a sprite variant; brake variants
  are only needed for the two directions the stage-1 road uses. Now 40, the count the roadmap states.
- Split subjects were emitting one filename where they need two, and the golden references — which
  _are_ production assets — were emitted twice. Both caught by a test asserting no duplicates.

---

## 13. Definition of done, restated after the override

| Task                                   | Status                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------- |
| 1. palette + prompt block              | ✅                                                                         |
| 2. Golden references → approval        | ❌ Not generated (§11). Approval-by-proxy criteria are recorded and unused |
| 3. Category batch production           | ❌ Not generated (§11). All 172 prompts are emitted and ready              |
| 4. Validator, nine checks              | ✅ — and two defects in it found and fixed (§12)                           |
| 5. process / atlas / manifest / report | ✅                                                                         |
| 6. Contact sheet generator             | ✅                                                                         |
| 7. Asset loading system                | ✅                                                                         |
| 8. Loading screen                      | ✅                                                                         |
| 9. Replace placeholders                | ❌ Blocked on 3. Register still lists seven                                |
| 10. Update visual goldens              | ✅ for the palette change; nothing further to update                       |
| 11. Four consistency gates             | ❌ Blocked on 3                                                            |

**Phase 4 remains PARTIAL.** Six of eleven tasks complete; the five that are not all reduce to a
single missing capability, and none of them are blocked on a decision any more.

One last note on the shape of what was found. Three of the seven defects were in **gates** — the
visual threshold, the allocation benchmark, the regression comparison — and a fourth, the production
smoke probe, was in a gate that had been red for two phases without anyone seeing it. A phase spent
building validation machinery turned out to be a good time to discover that some of the existing
machinery was not validating anything. That is worth remembering the next time a suite is green.
