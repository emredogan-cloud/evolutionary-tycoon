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
