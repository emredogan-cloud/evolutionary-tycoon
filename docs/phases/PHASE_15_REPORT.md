# PHASE 15 REPORT — Advanced Traffic / Events / Weather / Time-of-Day

**Phase:** 15 — the same day stops repeating
**Date:** 2026-08-20
**Result:** ✅ **PASS (technical)** — local gates green, CI 11/11 green at `7ea73ab`, preview-e2e green on the real CDN
**Branch:** `phase/15-events-weather` (stacked on `phase/14-offline`)

---

## 1. Result, stated plainly

The world now has a **deterministic calendar**: four weather states and six
event types, planned once per game day from `rng.events` in a fixed number of
draws, so (seed, day) names exactly one sky and one schedule — the property Day
Replay stands on, proven by test rather than promised. Night is a **lighting
pass** (ambient curve, headlight cones on every vehicle, glow on owned lighting
upgrades, the neon's deterministic flicker), rain and snow visibly fall and are
themselves pure functions of sim time — which is the entire reason four new
weather goldens can exist.

**Five things worth saying out loud:**

- **Weather's gameplay bite is Stage 4's, by the design's own hand.** GDD §9.6
  defines "kar/yağmur (yoğunluk ↓ …)" _inside_ "Olaylar (Aşama 4)". Measured
  with the factors live from Stage 1: stage-2 arrival slid 21.78 → 22.1 min
  against a 10–22 corridor — the P12-calibrated economy was being re-priced by
  a sky that did not exist when it was calibrated. `WEATHER_EFFECTS_MIN_STAGE=4`
  encodes the section heading; the sky itself is ambient at every stage.
- **The left turn found a real deadlock, twice.** First: an unstaffed Stage 4
  test world let drive-thru spill squat in the conflict box forever — an
  _illegal_ world under ADR-014; the fixture was wrong, not the turn. Second
  and real: a **held turner 4 m upstream of the exit-merge point** read as
  oncoming traffic, and continuous converts starved mergers for a measured
  **18 minutes**. A car committed to leaving the lane is not oncoming — the
  narrow exemption in `rejoinClear` carries the measurement in its comment.
- **The six new archetypes are behaviour without bodies.** No production art
  exists for any of them (the delivered set covers exactly the four on the
  road), so their spawn share is zero and a test pins that. Their behaviours —
  the VIP reputation gate, the truck's night appetite, the sports car's tips,
  the EV's charger hook — are complete and unit-tested; the shares flip when
  P16-era art arrives. This project does not draw a bus as a van.
- **Lane changing is live wiring over a road that cannot use it.** The
  gap-acceptance layer (MOBIL-lite) runs in `VehicleMotionSystem` behind a
  same-heading partner table computed from the lane graph — every entry is -1
  on the authored one-lane-each-way road, so it idles by _geometry_, not by
  flag. Proven twice: on a synthetic two-lane eastbound graph a frustrated
  follower genuinely changes (and refuses an unsafe cut); on the authored road
  ten live minutes move nobody across. Activating it for real is entangled
  with the road-width/traffic-density decision the user owns.
- **The old goldens were unknowingly photographing 00:30.** The clock starts
  at midnight and nothing painted the hour until now. All fourteen re-shot at
  a pinned `forceHour=12` (their daytime-showcase intent, now explicit) and
  each diff inspected — the visible change is honest noon traffic on a road
  the old midnight frames showed near-empty.

## 2. IMPLEMENTED

| Piece                     | Where                                                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calendar                  | `src/sim/systems/EventSystem.ts` (slot 2, reserved since P2), `src/config/{events,weather}.ts` — 6 events (duration/effect/labels/minStage), 4 weather states, fixed-draw planning, derived active state, transition announcements on the bus |
| Save v10                  | `environment` block (plan, not derivation) + migration + fixture `save-v10.json`; hash pin renewed (9th) with the dated note                                                                                                                  |
| Traffic consumers         | spawn acceptance × environment (envelope widened ×`MAX_EVENT_TRAFFIC_FACTOR` so festival thinning stays exact), conversion slot 8, global speed cap (road work/accident), drive-thru share − seated bias, truck share × night-rush/fuel-spike |
| Ten archetypes            | +SPORTS_CAR/TRUCK_LONGHAUL/BUS_TOUR/EV_MODERN/VIP_LIMO/EMERGENCY, share 0 (art), with `minReputation`/`tipFactor`/`hourAffinity`/`chargerAffinityBoost` consumed by spawn, conversion and both payment sites                                  |
| Left turn                 | far-lane converts hold at the mouth for a patience-shrinking oncoming gap (Stage 4+, the GDD's own scoping — and the measured reason: from Stage 1 it starved delivered demand 23.7→14.7/min); congestion forms and always clears             |
| Lane-change layer         | `src/sim/systems/laneChange.ts` pure decisions + live wiring in motion (see §1)                                                                                                                                                               |
| Lighting & weather render | `src/render/environment/` — ambient keyframe curve, beam/glow/precipitation as `Graphics` (runtime canvas textures render nothing on this Phaser 4 build — probed, pivoted), wet ground, reduced-motion holds, `noParticles` skips creation   |
| HUD                       | `EnvironmentStrip.svelte` — clock, weather, thin event strip with countdown (never a modal, per the roadmap)                                                                                                                                  |
| Fixture instruments       | `?forceHour/?forceWeather/?forceEvent` container pins (the `?stage` pattern) powering four new goldens                                                                                                                                        |
| S6 decided                | GDD §25.3 — night is the hour of already-approved mechanics plus this lighting pass; no new mechanic, no scope increase                                                                                                                       |

## 3. VERIFIED (command output, this machine, 2026-08-20)

| Gate                                                                | Result                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint · format · typecheck (3×tsc + svelte-check) · depcruise · knip | clean — one new cycle (decision constants) broken by moving them to the store leaf, not by loosening                                                                                                                                                      |
| `pnpm test:coverage`                                                | **1 508 passed**, all per-layer floors met (branches 85.4% global)                                                                                                                                                                                        |
| `pnpm test:determinism`                                             | **61/61** — same-seed-same-calendar, fixed-draw planning, snapshot round-trip continuation equality all added                                                                                                                                             |
| `pnpm balance:check`                                                | **5/5** after the stage-gate fix; before it, stage-2 timing measured 22.1 vs ≤22 and the pusher was tuned per the roadmap's own rule ("tune the events, not the envelope")                                                                                |
| `pnpm bench:sim`                                                    | **21/21** on the **re-recorded `phase15` baseline** — §11 discipline: two real optimisations first (per-tick derivation cache; the +47% first wiring is in the code comment), absolute budgets all green throughout, phase12 numbers retained in PERF_LOG |
| E2E chromium (preview)                                              | **80 passed + 6 deployment-only skips**                                                                                                                                                                                                                   |
| Visual goldens                                                      | **18/18** regenerated in the pinned container, byte-identical on host; every one of the 8 changed + 4 new diffs inspected (night/rain/snow/festival read unmistakably; noon traffic replaces midnight emptiness)                                          |
| Draw calls (measured, GL-call wrap)                                 | noon 5 → night **+1**, rain **+2** — budget was ≤ +8                                                                                                                                                                                                      |
| Seed-tuned fixtures                                                 | wages (seed 3), stranded-walkers (seed 999), spawn-envelope (weather-mean-derived floor) — each retuned with the reason in-file; **no assertion weakened**                                                                                                |

## 4. CI / DEPLOYMENT EVIDENCE (appended once the workflows finished)

- **CI green** at the phase head `7ea73ab` — run **32368939802**, all 11 jobs.
  The first dispatch at `ac26dac` went red on exactly one budget — the CI
  runner's _absolute_ fresh-tick budget at 5.32 ms of 5 — which priced the
  envelope mistake §1 describes; fixed by the stage-aware headroom in
  `7ea73ab`, no budget touched.
- **Preview E2E green** against the Vercel deployment of `7ea73ab` — run
  **32369208677**, full chromium suite on the real CDN.
- Production smoke: skipped by design (no production deployment exists).

## 5. NOT RUN

- **Human playtest** — NOT RUN (agent cannot playtest; protocol unchanged).
- **Real-GPU frame measurement for the lighting pass** — the render additions
  are ≤2 draw calls and SwiftShader numbers are not FPS claims; the standing
  GTX 1660 Ti entry remains the last real-GPU record. Re-measure on real
  hardware at P16's visual close-out alongside the art audit.
- **Local Firefox/WebKit** — unchanged constraint; their verdicts are CI's.
- **Live lane-change traffic** — impossible on the authored road (see §1); the
  layer idles by geometry and a test will fail loudly the day a multi-lane
  road is authored.

## 6. OPEN ITEMS THIS PHASE SURFACED (decisions, not defects)

1. **The game starts at midnight.** Invisible before lighting; now the first
   session opens dark with 0.1× traffic, in tension with §19's "first car in
   8 s". A start-hour choice (e.g. 08:00) is one config line that renews
   hashes and seed fixtures — the user's call (GDD §25.3 records it).
2. **Road width** stays entangled with the traffic-density conflict (#7) —
   now also the key to live lane changes and to the four-lane look of the
   user's delivered road bake (P16 material).

## 7. Debts created

- Degradation tiers ("Low: particles off") still have no tier _system_; the
  `noParticles` instrument and reduced-motion cover the accessibility half
  until P20's performance work builds tiers for real.
- Event/weather **audio identities** wait for P17 (the roadmap's own slot).
