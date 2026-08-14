# FLAKY TEST REGISTER

> A flaky test is worse than no test: it poisons the signal.
> Policy: [TESTING_STRATEGY §11](TESTING_STRATEGY.md#11-flake-yönetimi).

## Policy summary

1. CI retries once. A test that passes only on the retry is **recorded here**, not ignored.
2. Three flakes in a week → **quarantine** (skip + issue). A skipped test is a tracked debt.
3. More than five quarantined tests → feature work stops until they are fixed.
4. **Retries must never be used to hide an unstable test.** Retry exists for network flakiness.

## Currently flaky: 0

| Test     | First seen | Occurrences | Suspected cause | Status |
| -------- | ---------- | ----------: | --------------- | ------ |
| _(none)_ |            |             |                 |        |

## Currently quarantined: 0

| Test     | Quarantined | Issue | Owner |
| -------- | ----------- | ----- | ----- |
| _(none)_ |             |       |       |

## Known environment limitations (not flakes)

These are documented platform constraints, deliberately excluded from the flake process:

| Limitation                                                                       | Effect                                                              | Reference               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------- |
| Headless WebKit does not render canvas into screenshots                          | No visual regression on WebKit; smoke suite only                    | playwright#586, ADR-011 |
| Headless Firefox WebGL unstable without a virtual framebuffer                    | Firefox E2E runs under `xvfb-run` in CI                             | playwright#21783        |
| CI Chromium uses SwiftShader                                                     | CI cannot measure frame rate; no FPS assertions in CI               | ADR-011                 |
| WebKit needs system libraries absent from this dev machine (`libevent-2.1-7t64`) | WebKit smoke cannot run locally; it runs in the pinned CI container | Phase 1 report          |
