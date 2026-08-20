# PERF LOG

Every performance measurement, with the conditions under which it was taken.

> **CI cannot measure frame rate.** GitHub Actions runs headless Chromium on SwiftShader (software
> rasterisation), so any FPS number from CI would be meaningless. CI gates on simulation tick time,
> allocation count, bundle size and asset size. **Real FPS is measured manually on real hardware and
> recorded here.** An entry without a device and a browser version is not a measurement (ADR-011).

## Budgets

See [TECHNICAL_ARCHITECTURE §11](TECHNICAL_ARCHITECTURE.md#11-performans-bütçeleri) for the full table.

| Metric                   |  Desktop |   Mobile | Gated by               |
| ------------------------ | -------: | -------: | ---------------------- |
| FPS p50 / p05            |  60 / 50 |  45 / 30 | manual                 |
| Frame time p95           | ≤16.6 ms |   ≤22 ms | manual                 |
| Sim tick p95             |  ≤2.0 ms |  ≤3.5 ms | **CI**                 |
| Steady-state allocation  | 0 B/tick | 0 B/tick | **CI**                 |
| Initial JS bundle (gzip) |  ≤550 kB |        — | **CI**                 |
| CSS (gzip)               |   ≤30 kB |        — | **CI**                 |
| Critical-path assets     |    ≤4 MB |        — | **CI** (from Phase 4)  |
| Total assets             |   ≤28 MB |        — | **CI** (from Phase 16) |

## Measurements

### Phase 1 — 2026-08-14

| Metric                    |                       Value | How measured                        |
| ------------------------- | --------------------------: | ----------------------------------- |
| Production build time     |                      0.40 s | `pnpm build`, local                 |
| JS bundle (raw / gzip)    |     33.90 kB / **13.07 kB** | `pnpm size`                         |
| CSS bundle (raw / gzip)   |       4.86 kB / **1.52 kB** | `pnpm size`                         |
| Source map                |                   398.42 kB | `pnpm build` (not shipped to users) |
| Unit + architecture suite |            ~17 s (27 tests) | `pnpm test:coverage`, local         |
| E2E Chromium              | 2.3 s (8 passed, 6 skipped) | `pnpm e2e:chromium`, local          |
| E2E Firefox               | 6.3 s (8 passed, 6 skipped) | `pnpm e2e:firefox`, local           |

**Honest caveat:** the JS budget is _configured_ but not yet _exercised_ — Phaser is declared but
not imported in Phase 1 (see [DEPENDENCY_NOTES](DEPENDENCY_NOTES.md)). 13 kB says nothing about
whether 550 kB is the right ceiling. That is answered in Phase 3.

**No FPS measured.** There is no rendering yet. First real-GPU measurement is due in Phase 3.

### Phase 2 — 2026-08-15 · simulation core reference point

```
Machine:  AMD Ryzen 5 5500 (12 threads), 15 GB RAM
OS:       Ubuntu 24.04.4 LTS, kernel 7.0.0-28-generic
Runtime:  Node v24.13.1
Command:  pnpm bench:sim   (vitest.bench.config.ts, forked worker with --expose-gc)
Scene:    empty system pipeline — this is the floor every later phase builds on
```

| Measurement                                            |      p50 |      p95 |          per op | Budget            |
| ------------------------------------------------------ | -------: | -------: | --------------: | ----------------- |
| 1000 empty ticks                                       | 0.195 ms | 0.317 ms |   0.195 µs/tick | **< 5 ms** ✅     |
| World hash (120 vehicles, 60 customers)                | 3.772 ms | 4.074 ms |   37.72 µs/hash | < 500 µs ✅       |
| 1000 ticks, one command each                           | 0.328 ms | 0.482 ms |   0.328 µs/tick | < 20 µs ✅        |
| 1000 ticks, 8 events/tick, 3 subscribers               | 0.428 ms | 0.566 ms |  0.054 µs/event | < 10 µs ✅        |
| Vehicle spawn + despawn cycles                         | 0.057 ms | 0.060 ms | 0.036 µs/entity | < 5 µs ✅         |
| World snapshot + `JSON.stringify`                      | 0.345 ms | 0.603 ms |   3.455 µs/save | **< 8 ms** ✅     |
| **Steady-state allocation** (200 000 ticks, gc forced) |        — |        — | **0.20 B/tick** | **≈ 0 B/tick** ✅ |

| Build metric             |                        Value | Change from Phase 1 |
| ------------------------ | ---------------------------: | ------------------- |
| Production build time    |                       0.47 s | +0.07 s             |
| JS bundle (raw / gzip)   |     134.24 kB / **41.22 kB** | +28.11 kB gzip      |
| CSS bundle (gzip)        |                  **1.52 kB** | unchanged           |
| Unit + integration suite |            ~19 s (313 tests) | +286 tests          |
| E2E Chromium             | 3.1 s (17 passed, 6 skipped) | +9 tests            |
| E2E Firefox              | 7.2 s (17 passed, 6 skipped) | +9 tests            |

**Where the 28 kB went:** the deterministic core plus Zod, which now ships because save
validation happens against _untrusted input_ (a file that may be hand-edited, truncated by a
quota, or written by an older build) and therefore cannot be a dev-only check. 41 kB of a 550 kB
budget; the ceiling is still untested against Phaser, which lands in Phase 3.

**Honest caveats:**

- **No FPS measured. There is still no rendering.** First real-GPU measurement is due in Phase 3.
- These are _local_ numbers on the machine above. The CI baseline is recorded separately in
  `tools/bench/baseline.json` from a CI run, because the 15% regression gate must compare like
  with like — a local number would make every CI run look like a regression or hide a real one.
- Allocation is 0.20 B/tick rather than exactly 0. That is V8 bookkeeping over 200 000 ticks, not
  a per-tick allocation: one object literal per tick would be ~50 B/tick, two hundred times higher.

### Phase 3 — 2026-08-15 · first real-GPU measurement

**This is the first frame-rate number this project has ever recorded**, because Phase 3 is the
first phase with anything to render. CI still does not and will not produce one.

```
Device:   AMD Ryzen 5 5500, NVIDIA GeForce GTX 1660 Ti
          ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1660 Ti/PCIe/SSE2, OpenGL 4.5.0)
OS:       Ubuntu 24.04.4 LTS, X11
Browser:  Chromium 150 (Playwright 1.62.1), headed, real GPU — no --disable-gpu, no SwiftShader
Tier:     n/a (degradation tiers arrive in Phase 20)
Viewport: 1920x1080, devicePixelRatio 1
Command:  ?scene=stress&bench=1&e2e=1&seed=424242
Method:   3 s warm-up discarded, then a 12 s window; 2048 frame deltas; percentiles from FrameMeter
```

| Scene                        | Actors drawn |   FPS p50 |   FPS p05 | Frame p95 | Worst frame | Budget                 |
| ---------------------------- | -----------: | --------: | --------: | --------: | ----------: | ---------------------- |
| `stress` (the demanding one) |      **100** | **200.0** | **196.1** |    5.1 ms |       10 ms | p50 ≥ 60 ✅            |
| `depth-testcard`             |           15 |     200.0 |     196.1 |    5.1 ms |      5.1 ms | p05 ≥ 50 ✅            |
| `empty`                      |            0 |     200.0 |     196.1 |    5.1 ms |      5.1 ms | frame p95 ≤ 16.6 ms ✅ |

**Read this number carefully.** All three scenes measure _identically_ at exactly 200.0 FPS and
5.0 ms. That is the display's refresh cap, not the renderer's ceiling — an empty scene and a
hundred-actor scene cannot genuinely cost the same. So:

- What is proven: at 100 actors and 1920×1080 this renderer is **nowhere near** the frame budget.
  Frame time p95 is 5.1 ms of a 16.6 ms allowance, and 0 ticks were dropped over 12 seconds.
- What is **not** proven: how much headroom is left. The measurement is bounded by vsync, so the
  true ceiling is somewhere above 200 FPS and this run cannot say where.
- What is still owed: a mid-range Android phone and an iPhone. Neither was available. The mobile
  budget (p50 ≥ 45) remains **unmeasured** and is Phase 20's to answer, or earlier if a device appears.

| CI-measurable metric (no GPU needed) |        Value | Budget             |
| ------------------------------------ | -----------: | ------------------ |
| **Depth sort, 260 objects**          | **0.013 ms** | ≤ 0.15 ms ✅ (11×) |
| Steady-state simulation allocation   |  0.04 B/tick | ≈ 0 B/tick ✅      |
| 1000 empty ticks                     |     0.195 ms | < 5 ms ✅          |

| Build metric          |                         Value | Change from Phase 2 |
| --------------------- | ----------------------------: | ------------------- |
| **JS bundle (gzip)**  | **405.08 kB** / 550 kB budget | **+363.86 kB**      |
| JS bundle (raw)       |                    1533.02 kB | +1398.78 kB         |
| CSS bundle (gzip)     |                       1.52 kB | unchanged           |
| Production build time |                        1.08 s | +0.61 s             |
| Unit + integration    |             ~23 s (404 tests) | +90 tests           |
| Visual regression     |               9.4 s (6 tests) | new                 |

### The 550 kB budget, finally exercised

Open since Phase 1: _"13 kB says nothing about whether 550 kB is the right ceiling."_ Now it does.

**Phaser costs ~364 kB gzip** (measured as the delta from Phase 2's 41.22 kB; the ~1 000 lines of
new render code account for a few kB of that). Total **405.08 kB against 550 kB — 26% headroom.**

The budget holds, but note the sub-line: TECHNICAL_ARCHITECTURE §11.3 allocates ≤ 320 kB to a
_custom_ Phaser build, and this is the **default** build at ~364 kB. The total is what CI gates on
and it passes; the breakdown line does not. A custom Phaser build is the documented remedy and
belongs to Phase 20 (Performance Optimization) unless the total gets tight sooner.

### Phase 4 — 2026-08-15 · texture memory, and what it does not yet measure

The roadmap's Phase 4 definition of done asks for texture memory in this file. Here it is, with the
caveat that makes it nearly meaningless as a forecast: **there is no production art.** The licence
gate did not close ([`assets/LICENSES.md`](../assets/LICENSES.md) §1), so what is measured is the
placeholder set — six generated checkers standing in for ~160 sprites.

Measured by reading each committed PNG's dimensions and computing `w x h x 4` (RGBA8, no mipmaps —
sprite atlases are not mipmapped in this project):

| Texture                             | Size       |   GPU bytes |
| ----------------------------------- | ---------- | ----------: |
| `ph-customer__PLACEHOLDER__`        | 64x144     |     36.0 kB |
| `ph-employee__PLACEHOLDER__`        | 64x144     |     36.0 kB |
| `ph-prop-short__PLACEHOLDER__`      | 154x134    |     80.6 kB |
| `ph-prop-tall__PLACEHOLDER__`       | 102x205    |     81.7 kB |
| `ph-scale-reference__PLACEHOLDER__` | 128x192    |     96.0 kB |
| `ph-vehicle__PLACEHOLDER__`         | 410x301    |    482.1 kB |
| **Total**                           | 6 textures | **0.79 MB** |

Against the 192 MB desktop / 96 MB mobile budget in ASSET_PIPELINE, that is 0.4% and 0.8%. **This
number will not survive contact with real art** and should not be quoted as headroom. The bound that
will actually matter is the atlas page count: §7 allows up to 4096-square pages for `vehicles` and
`structures`, and one such page costs 64 MB of RGBA8 on its own — a third of the desktop budget for
one atlas. Two full 4096 pages plus the 2048-square atlases would exceed 192 MB.

That is a real constraint discovered by doing this arithmetic rather than by measuring, and it is
recorded now so Phase 16 does not meet it as a surprise. The remedies are already in the documents
(atlas splitting per stage, the KTX2/Basis reconsideration deferred to Phase 20); nothing is being
decided here.

**No FPS was measured in Phase 4.** Nothing in this phase changed the render loop — the surface
colours moved onto the locked palette and the boot scene became a loading screen, neither of which
affects frame cost. The Phase 3 measurement (200 FPS p50, 5.1 ms p95, GTX 1660 Ti) stands and was
not re-run, so it is not restated here as if it were.

### Phase 8 — 2026-08-15 · the cost of closing the loop

Simulation only. **No FPS was measured in Phase 8** and none is claimed: the renderer gained nothing
this phase, and the DOM overlay it did gain is throttled to 10 Hz precisely so it cannot show up in
a frame time. The Phase 3 measurement (200 FPS p50, 5.1 ms p95, GTX 1660 Ti) stands and was not
re-run.

Machine: this development host, headless Node 24.13.1, `pnpm bench:sim`. Calibration 0.9124 ms.

| Load                                                             | Budget | Measured p95 | Of budget |
| ---------------------------------------------------------------- | -----: | -----------: | --------: |
| populated tick — 120 vehicles, 20 customers (Phase 6)            | 2.2 ms | **0.113 ms** |      5.1% |
| crowded tick — 120 vehicles, 60 pedestrians (Phase 7)            | 2.5 ms | **0.339 ms** |     13.5% |
| service tick — 120 vehicles, 40 pedestrians, 20 orders (Phase 8) | 2.8 ms | **0.185 ms** |      6.6% |

The service load costs _less_ than the crowded one despite carrying twenty orders, because
separation is O(n²) over pedestrians and this load has forty rather than sixty. Orders are cheap by
comparison: the whole order pool is scanned linearly by two systems.

#### The baseline moved, and why

`tools/bench/baseline.json` was re-recorded at `964705e`. The populated tick went from 2.7582 to
3.3314 calibration units — **18% slower** — and the crowded tick by a similar margin. That is a
relative regression against a baseline recorded at `82655f2`, which is _before_ the three Phase 8
systems existed.

It was attributed by substitution rather than by reasoning, after two wrong guesses:

1. `enforceGaps` was disabled and the benchmark re-run — still 18% slower. Not the cause.
2. `KitchenSystem`, `ServiceSystem` and `SatisfactionSystem` were replaced with the no-op slots they
   had occupied until this phase — the regression **disappeared entirely**.

So the cost is the three new systems, which is what adding three systems to an eighteen-slot pipeline
costs. `ServiceSystem` is the bulk of it: it visits every live customer every tick and switches on
their state. The absolute budgets all pass with an order of magnitude of headroom, so nothing is
being optimised on the strength of a number that is 5% of its own ceiling.

A first attempt to attribute this from a wrapped-system profiler was discarded: wrapping eighteen
`run` methods reported 189 µs/tick against a real cost of 15 µs/tick, so the harness was 92% of what
it was measuring and its per-system shares could not be trusted.

### Template for future entries

```
### Phase N — YYYY-MM-DD

Device:   <make/model, CPU, GPU>
OS:       <version>
Browser:  <name + exact version>
Tier:     Ultra | High | Medium | Low
Scene:    <entities on screen, stage, seed>
Command:  <e.g. ?bench=1&seed=42>

| Metric | Value |
| --- | ---: |
| FPS p50 | |
| FPS p05 | |
| Frame time p95 | |
| Sim tick p95 | |
| JS heap after 30 min | |
| Draw calls | |
```

---

## Consolidation batch — production art — 2026-08-18

The first entry in this log measured on a **real GPU with real assets**. Every earlier number was
taken against placeholder art (0.79 MB of texture), so this is the before/after the batch exists to
record.

```
Device:   desktop, NVIDIA GeForce GTX 1660 Ti (ANGLE OpenGL 4.5)
OS:       Linux 7.0.0-28-generic
Browser:  Chromium 145 (Playwright build), HEADED, hardware GL — not SwiftShader
Scene:    /?e2e=1&seed=424242, stage 1 after 6 000 ticks (5 sim-minutes of traffic and service)
Method:   600 consecutive rAF deltas; load timed from navigation to the data attributes
```

| Metric                         |                                                       Value |
| ------------------------------ | ----------------------------------------------------------: |
| Frame time mean                |                                                     5.05 ms |
| Frame time p50 / p95 / p99     |                                          5.0 / 5.1 / 5.1 ms |
| Effective FPS (uncapped rAF)   |                                                        ~198 |
| Navigation → assets loaded     |                                                    1 191 ms |
| Navigation → world scene ready |                                                    1 204 ms |
| JS heap after load + 5 sim-min |                                                       29 MB |
| Stage-switch cost              | not measurable (no test hook; visually instant in captures) |

**Asset pipeline, after integration (shipped bytes, from `pnpm assets:report`):**

| Budget                 | Before (placeholders) |                           After (production) |
| ---------------------- | --------------------: | -------------------------------------------: |
| Total shipped          |                 ~0 MB |                           3.36 MB / 27.30 MB |
| Critical path          |                  0 MB |                            2.22 MB / 4.00 MB |
| Decoded texture memory |               0.79 MB |                         **21.13 MB** / 96 MB |
| Bundle (js, gzip)      |               ~455 kB |                           456.35 kB / 550 kB |
| Atlas pages            |                     0 | 7 (each shrunk to its smallest power-of-two) |

**Reading.** The renderer's whole frame is ~5 ms on a mid-range 2019 GPU with every production atlas
resident — the art is not the constraint, and no earlier budget regressed. Texture memory rose from
under a megabyte to 21.13 MB, which is 22% of the mobile budget the documents bind (ASSET_PIPELINE
§17 / TECHNICAL_ARCHITECTURE §11); the fill-ratio floor those pages fail is reported rather than
enforced by ADR-013, because power-of-two pages make the ratio unreachable for small sets while the
memory total — the number a device actually runs out of — stays the enforced gate. Load-to-playable
is 1.2 s on localhost; the number to re-measure on the deployed CDN is in the deployment
verification section of the final report. SwiftShader CI numbers are deliberately not quoted here —
CLAUDE.md's rule stands, and this entry exists because a real GPU was available.

---

## Phase 14 — offline progression + service worker — 2026-08-20

```
Device:   dev desktop (Linux 7.0.0-28-generic), localhost preview (vite preview :4173)
Browser:  Chromium 145 (Playwright build), headless, SwiftShader — load timing only, no FPS claims
Method:   Playwright probe; SW-controlled reload measured with response.fromServiceWorker()
```

| Metric                                          |                                                                                                                                            Value |
| ----------------------------------------------- | -----------------------------------------------------------------------------------------------------------------------------------------------: |
| `computeOffline` (the boot-time settlement)     |                                                                                              **190 ns/call** (100 000 iterations; budget < 5 ms) |
| Cold first visit → sim running                  |                                                                                                                 486 ms · **1.76 MB** transferred |
| Warm second visit (SW-controlled) → sim running |                                                         **227 ms** · network **1 315 B** (yalnızca `/api/time` sınıfı istekler) · 5 istek SW'den |
| Service worker precache                         |                                                                                                  29 entries, 8.98 MB (atlaslar + bundle + shell) |
| Sim perf budgets after the offline meter        | **21/21** — per-tick meter sampling first measured **+57%** on the empty-world bench; moved to 5 s bucket-boundary sampling, budgets green again |

**Reading.** "İkinci ziyaret ~0 bant genişliği" localhost'ta ölçüldü: 1.3 KB (yalnızca no-store
uçları). CDN'deki karşılığı deployment doğrulamasında ölçülür ve faz raporuna girer. SwiftShader
sayıları FPS iddiası değildir (CLAUDE.md kuralı); bu giriş yalnızca yükleme/bant genişliği kaydıdır.

---

## Phase 15 — events, weather, day/night — 2026-08-20

```
Device:   dev desktop (Linux 7.0.0-28-generic), localhost preview
Browser:  Chromium 145 (Playwright build), headless, SwiftShader — draw-call counting only, no FPS claims
Method:   WebGLRenderingContext.drawElements/drawArrays wrapped pre-boot; 40-frame mean, stage 3 frozen scene
```

| Metric                                     |                                       Value |
| ------------------------------------------ | ------------------------------------------: |
| Draw calls, clear noon                     |                               **5 / frame** |
| Draw calls, night + lit signs + headlights |         **6 / frame** (**+1**, budget ≤ +8) |
| Draw calls, noon rain (precipitation on)   |                          **7 / frame** (+2) |
| Sim perf budgets                           | **21/21** on the re-recorded baseline below |

**Baseline re-record (`bench:record`, full run) — the §11 discipline applied.** The relative gate
compared against the **phase12** baseline, recorded before the calendar existed. Phase 15's honest
per-tick additions — the calendar derivation in slot 2 and a spawn candidate stream widened ×3 so a
festival can be _exact_ Lewis–Shedler thinning — measured **+37% on the empty-world tick** against
that stale workload. Two real optimisations were taken first (bucket-boundary meter sampling in
P14; a per-tick derivation cache after the first wiring re-derived per candidate, measured +47%);
the remainder is the feature's price, every **absolute** budget still passes, and the baseline was
re-recorded as `phase15` with the same mixed-calibration environment. The phase12 numbers are
retained here:

```
phase12 baseline (superseded 2026-08-20, retained per WORKING_DISCIPLINE §11):
  1000 ticks fresh world       2.7360 cal units   → phase15: 3.8491
  populated tick               3.0414             → 3.7ish (run-to-run ±5%)
  stage 4 tick                61.0572             → ~70.3
  1000 ticks, 1 command each   2.7585             → ~3.8
  8 events/tick, 3 subs        2.8814             → ~3.9
  snapshot + JSON              2.5533             → ~2.97 (v10 environment block is real payload)
```

---

## Phase 16 — the road bake — 2026-08-20

Same method as the Phase 15 entry (GL-call wrap, SwiftShader, load/draw-call
figures only). With the baked road tiling every stage:

| Metric                                   |                 Value |
| ---------------------------------------- | --------------------: |
| Draw calls, stage 3 noon                 | **4 / frame** (was 5) |
| Draw calls, stage 3 night with lit signs | **4 / frame** (was 6) |

The bake _reduced_ draw calls: the tiles batch with the texture pipeline and
the procedural marking `Graphics` they replace is gone. Shipped-bytes and
texture-memory budgets unchanged in class (`pnpm assets:report` — all within
limits; the slice is one single file, SW precache 30 entries).

### 2026-08-20 — the absolute fresh-world backstop has no cross-runner margin

Identical code across four CI dispatches: p50 3.092 (p95 5.274) → 5.660 (FAIL)
→ 3.944 (p95 7.763) against the Phase-2-era `< 5 ms` absolute. Host baseline
after the §11 phase15 re-record is 3.58 ms. The calibrated 1.15× relative gate
never fired — the flap is the stale absolute, not the code. Resize (5 → 8 ms)
filed as a change request in PHASE_16_REPORT §7.4; **not applied** pending the
user's decision.
