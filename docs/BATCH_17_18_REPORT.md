# BATCH REPORT — P17 + P18 (with three user decisions and the exhaustive asset pass)

**Window:** 2026-08-20 → 2026-08-21 · **Branches:** `phase/17-anim-vfx-audio` → `phase/18-premium-ui` (stacked)
**Authorisation:** the second batch directive — P17→P18 autonomous, hard stop after P18, P19+ not authorised.

## 1. Result, stated plainly

**PARTIAL, by external input — not by omission.** Every machine-doable item in the
directive is implemented and verified; what remains open is exactly the set no
machine may produce: 131 images the user generates externally, 23 audio files,
one OFL font, a three-player onboarding test, and the user decisions filed in §7.

## 2. IMPLEMENTED

### The three decisions

- **DECISION 1 — WebGL1 (checkpoint AI).** ADR-017 finalised **Accepted — Option A**
  (2026-08-21): the capability gate requires WebGL **1** (`webgl` →
  `experimental-webgl`, alpha/antialias off, high-performance), graceful no-WebGL
  fallback retained, and the stale "WebGL2-mandatory" wording swept from every
  document that carried it (CLAUDE.md, ROADMAP, TECHNICAL_ARCHITECTURE,
  TESTING_STRATEGY, RESEARCH_NOTES, PROJECT_MEMORY §12 closed). The four-document
  contradiction recorded since P4 is resolved by decision, not by edit.
- **DECISION 2 — Stage 2–4 economy calibration (checkpoint AJ).** Config-only, via
  the real balance simulator (five policies × deterministic multi-seed).
  Stage 2 arrival **25.4 → 16.5–19.0 min** (target 10–22, 12/12 runs in, gate row
  asserted); Stage 3 **53–64 → 51.5–59.8 min** (target 28–70, in-window, measured);
  Stage 4 **358–379 → 332–350 min** against 140–320 — **structurally blocked** on
  single-lane arrival capacity and filed as a decision, not silently "fixed".
  Full BEFORE/TARGET/AFTER/WHY per change in `docs/STAGE_2_4_CALIBRATION_REPORT.md`.
- **DECISION 3 — 08:00 start (checkpoint AK).** `DEFAULT_GAME_START_HOUR = 8` in
  config; first session in daylight, first car inside the 8-second beat (asserted
  in `onboarding.spec.ts`), night intact later; every derived hash pin renewed
  deliberately with its reason (11th and 12th renewals, `simulation.spec.ts`).

### The asset pass

- **Audit (checkpoint AG)** — `docs/FINAL_ASSET_REQUIREMENTS.md` + machine twin
  `docs/assets/assetRequirements.json`: **300 rows**, statuses only from the
  closed vocabulary — **158 PRESENT+VERIFIED · 15 PRESENT+NEEDS REGEN ·
  116 MISSING+PROMPT ADDED · 9 PROCEDURAL BY DESIGN · 1 DEBUG ONLY · 1 NOT
  REQUIRED** — covering the current runtime, stages 1–4, P17 and P18.
- **Catalog (checkpoint AH)** — `docs/ASSET_GENERATION_PROMPTS.html` remains
  generated (never hand-edited): **303 cards = 278 canonical + 25 superseded**,
  the 25 originals byte-preserved under `data-superseded-by`, every new prompt
  self-contained with the hash-locked style block. Coverage is a build gate:
  `pnpm assets:prompt-coverage` → **REQUIRED 131 / MISSING 0 / DUPLICATES 0 /
  ORPHANS 0**, wired into `verify`, CI and a unit test.

### P17 — Animation / VFX / Audio (checkpoint AL)

DollRigRuntime over a 12-activity vocabulary (derived in the read view, never
stored or hashed), nine delta-keyframe clips + rig editor, ParticleLibrary (12
effects, 400-particle wall in code), AudioDirector (ducking, 400 ms throttle,
±6 % detune, 8→34 m distance fade, 24-source cap) behind a lazy manifest that
ships **zero fake audio files**, settings UI, reduced-motion that never touches
sim speed, audio-off fully playable. Detail: `docs/phases/PHASE_17_REPORT.md`.

### P18 — Premium UI/UX + A11y + Responsive (checkpoint AM)

Token design system on the locked 48-swatch palette, the signature Conversion
Analytics panel over the CONVERSION_* stream, action dock + world-dominant
panels, notification strip on sim-time TTL, pause/settings/diagnostics, axe-core
as a merge gate (critical+serious = red), seven-viewport matrix with the HUD
share **measured** (≤22 %/28 % after the metric itself convicted the old
always-open panels), 44 px touch floor, UI scale 0.9–1.3×, dyslexia-font toggle.
Detail: `docs/phases/PHASE_18_REPORT.md`.

## 3. VERIFIED (the batch's own numbers)

| Gate               | Result                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`      | exit 0 at every phase close — bundle 477.86 kB gz / 550 budget                                                                                                                                    |
| Unit + integration | **1 531 passed**                                                                                                                                                                                  |
| Determinism suite  | **61/61**, including outcome-invariance for every new command                                                                                                                                     |
| E2E                | chromium **92** + firefox under xvfb (CI matrix)                                                                                                                                                  |
| Visual             | world 18/18 container-regenerated, host-byte-identical; panel goldens 24/24 container-canonical across two verify runs                                                                            |
| Balance            | stage-1 + stage-2 windows asserted, dead-end 68.9 s ≤ 90, policy spread 1.0× ≤ 2.5                                                                                                                |
| Coverage tool      | 131/131 prompts, 0 missing · 0 duplicate · 0 orphan                                                                                                                                               |
| CI + Preview E2E   | **GREEN at `d0cbae4`** — CI 32467140143 (8m45s) + Preview E2E 32467368549 (5m59s); docs SHA `5652f4a` green on its own runs too — CI **32469364343** (9m7s) + Preview E2E **32469594005** (5m25s) |

### The determinism hunt this batch paid for (and what it bought)

Three real defects surfaced by CI's firefox lane, each fixed at root:

1. the 11th pin renewal missed (ambience entered the hash) — renewed with its note;
2. `planDay` left a stale environment-derivation cache for boot-frame readers —
   invalidation now closes the plan, with a regression test and
   `World.hashSections()` forensics;
3. **`Math.hypot` is not correctly rounded and V8 ≠ SpiderMonkey** — replaced by
   `euclidean()` (plain `sqrt`) across 15 sim sites, banned by lint in the sim
   tree, proven by Firefox's old t1000 hash matching the new Node hash
   byte-for-byte.

## 4. NOT RUN / NOT POSSIBLE

- Three-player onboarding playtest — humans required; protocol updated, machine
  halves asserted. **No playtest is claimed.**
- Real-device touch/audio pass — no device in this environment.
- FPS on real hardware — CI is SwiftShader; `docs/PERF_LOG.md` awaits the next
  hardware session.

## 5. MISSING EXTERNAL INPUT (the user's production queue)

1. **131 images** — every one has a copy-ready prompt (P173–P303 range) in the
   catalog; regenerate list additionally covers the 15 NEEDS-REGEN rows.
2. **23 audio files** — `docs/AUDIO_ASSET_REQUIREMENTS.md`; the manifest loader
   is live, silence is the documented fallback.
3. **One OFL dyslexia font file** — toggle ships against the system stack.

## 6. CHANGE CONTROL

- DEPENDENCY CHANGE #1 (P17): none — P17 shipped on the existing tree.
- DEPENDENCY CHANGE #2 (P18): `@axe-core/playwright` **4.10.2** exact pin,
  dev-only, mandated by the roadmap's P18 testing list; PROJECT_MEMORY §4.
- Save schema v10 → **v11** (`settings.audio.ambience`), migration + played
  fixture; §6.2 upgrade table recalibrated under DECISION 2 with the old values
  retained in the note.
- No roadmap edit, no threshold lowered, no test weakened anywhere in the batch.

## 7. REMAINING DEBT / user decisions filed

1. **Stage-4 structure** — envelope and window both capacity-blocked on the
   single ~45 veh/min lane (max conceivable ₡98/min vs ₡190 entry): road/lot
   decision is the user's (decision menu in the calibration report §4).
2. **GDD §8 (every-30 s beat) ⊗ §6.1 (2.2× growth)** — jointly infeasible at
   stage-2 capacity (worst 139–147 s): blocks S2 `CALIBRATED_STAGES` membership.
3. **S7 i18n (TR+EN)** — proposal filed at P18 close, user owns the decision.
4. Perf backstop 5→8 change request (P16) — still awaiting the user.
5. The moderate/minor axe advisories per run — the next polish list.
6. Traffic-density three-way conflict — still open, now an input to (1).
