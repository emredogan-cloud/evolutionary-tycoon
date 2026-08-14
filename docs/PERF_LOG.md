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
