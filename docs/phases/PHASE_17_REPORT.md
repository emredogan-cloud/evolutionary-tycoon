# PHASE 17 REPORT — Animation / VFX / Audio

**Batch:** P17–P18 (user-authorized 2026-08-21, stop after P18) · **Branch:** `phase/17-anim-vfx-audio`
**Preceded in-batch by:** ADR-017 finalization (checkpoint AI) · start hour 08:00 (AK) ·
stage 2–4 calibration (AJ) · the exhaustive asset audit (AG) · the 131-prompt catalog
expansion + coverage gate (AH).

## 1. Result, stated plainly

**PARTIAL by external input, deliberately** — the same shape as P16. Every system the
roadmap names is implemented, tested and wired: the full rig runtime with nine authored
keyframe clips and three procedural layers, the twelve-effect particle library under a
hard 400 budget, the complete audio director with every GDD §16 behaviour, the settings
screen, reduced-motion, the clip editor. What does not ship is what the agent cannot
produce: **zero audio files** (23 catalogued in `AUDIO_ASSET_REQUIREMENTS.md`, system
wakes on delivery with no code change) and the two particle textures whose prompts the
audit filed (fire/coin — drawing truthful neighbours until then, recorded in the code).

## 2. IMPLEMENTED

- **`DollRigRuntime`** (`src/render/rig/`): keyframe clips (linear channel sampling,
  loop/one-shot), 120 ms cross-fade blending, procedural base (distance-driven stride
  untouched from P7, breathing at idle), carry lock, mirror rule matching the sprite
  pipeline, per-actor pooled state with TTL prune. Pure maths; sim-time driven, so a
  frozen world holds a frozen pose and 4× cooks four times as fast.
- **Nine clips** (`clips/library.data.ts`): take_order, cook, serve, clean, eat, pay,
  wait_impatient, happy, angry — typed keyframe data validated at load (unknown part or
  unsorted keys = build error). Three procedural: idle, walk, walk_carry.
- **Activity vocabulary** (`@config/animation`): derived per view from the customer FSM
  and the task board (`readView`), never stored/hashed; `ActorSnapshot.activity` carries
  it to the renderer.
- **`ParticleLibrary`** — twelve effects on the fx atlas, event-driven via `FxWiring`
  (payment coins/tips, kitchen steam, angry puffs, upgrade bursts at their own anchors,
  evolution celebration, construction dust, hire poofs); 400-particle wall enforced in
  code; reduced-motion quarters counts; **never constructed** in `noParticles` mode.
- **`AudioDirector`** — category lanes × master, progression ducking with real
  attack/hold/release ramps, 400 ms same-key throttle, ±6% pitch on one-shots, 8→34 m
  distance fade, 24-source ceiling, mute. Music-by-hour selection (day/evening/night).
  Lazy manifest loader after the first playable frame; **silent no-op per missing file**.
- **Settings** — `SET_AUDIO`/`SET_MUTED`/`SET_REDUCED_MOTION` commands (tick-stamped,
  logged, replayable); schema **v11** adds `audio.ambience` with migration + a played
  fixture; `AudioSettings.svelte` panel off a HUD gear, values round-tripping through
  the world.
- **`tools/rig-editor/`** — Vite-served preview over the _shipped_ rig maths
  (`pnpm rig:editor`); not in the production build.

## 3. VERIFIED

| Gate               | Result                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm verify`      | **exit 0** — lint/format/typecheck(3+svelte)/depcruise/knip/assets(173, coverage 131-131-0-0-0)/coverage/balance/bench/build/size                                                          |
| Unit + integration | **1 524 passed** (rig 28 · particles 6+1 · audio 7 · FxWiring 14 · activity 6 · persistence 85 incl. v11 chain)                                                                            |
| Determinism        | **61/61**; reduced-motion & audio-mix outcome-invariance proven twice (unit `reducedMotion.test.ts`, e2e delta-exact 300/300)                                                              |
| Bench              | **22/22** — new rig row: p50 ≈ 0.03–0.05 ms for 60 characters vs the 1.2 ms budget                                                                                                         |
| E2E chromium       | **82 passed** (+`audioSettings.spec.ts` ×3: slider round-trip through the command log; two silent game-hours played by hand with the till moving; tick-for-tick reduced-motion)            |
| Visual goldens     | **18/18 byte-identical** — no regen needed: breath offset is sub-pixel and frozen frames hold no clip states; noParticles keeps the library unconstructed, per the roadmap's own leak rule |
| Coverage           | branches 85.45 % global (≥85), render floors met after the FxWiring/activity suites                                                                                                        |

## 3.1 The gate caught two real defects on the way out

1. **The eleventh pin renewal, missed** — schema v11 hashed the ambience
   slider; tick 0 moved by one written double; the local chromium suite had
   been run before that write landed. CI caught it, the desk had not
   (run 32450020298). Renewed with the note in the pin block (978e126).
2. **A latent P15 defect, exposed by the 08:00 start and caught as a
   Firefox-only hash mismatch (run 32450756322)** — and it was never about
   Firefox. The UI bridge samples weather on the boot frame, deriving against
   the _unplanned_ day and caching at tick 0; `planDay` rewrote the schedule
   without invalidating, so the tick's own derive read the poisoned cache and
   `lastWeather` — hashed state — depended on whether a frame painted before
   the first tick. Invisible at the midnight boot (pre-plan default equalled
   hour-0's planned weather); the daylight start put hour 8 in a rain segment
   and the race became a digest. Fixed at the root: `planDay` ends by
   invalidating the derivation cache; the regression test replays the browser
   boot order in miniature (91a5f09). The hunt leaves permanent forensics —
   `World.hashSections()` plus hook getters that name the diverging
   neighbourhood instead of a sixteen-hex shrug.
3. **And then a second, deeper one under it: `Math.hypot`.** Firefox's
   trajectory survived the planDay fix unchanged, so a temporary section
   locator rode one CI round (d97da41) and named it exactly: only the
   `customers` section, from the first pedestrian stride (tick 400-500).
   `Math.hypot` carries no rounding guarantee; V8's strays where
   SpiderMonkey's does not - proven beyond argument when the sqrt-swept node
   figure at tick 1000 came out byte-for-byte equal to the value Firefox had
   been producing all along. All fifteen sim call sites now go through
   `euclidean()` (correctly-rounded `sqrt` of squares), an eslint restriction
   bans `Math.hypot` from the sim tree permanently, and the twelfth pin
   renewal records the story (d5e068b). The midnight boot's empty first hour
   had hidden this since Phase 7; the daylight decision ended the luck -
   the best thing it did all batch.

## 4. CI / DEPLOYMENT EVIDENCE

| SHA       | Change                      | CI                                                                               | Preview E2E              |
| --------- | --------------------------- | -------------------------------------------------------------------------------- | ------------------------ |
| `7a28d23` | P17 complete                | 32450020298 - chromium+firefox red (stale pins)                                  | 32450200382 - red (same) |
| `978e126` | 11th pin renewal            | 32450756322 - **firefox-only red** (the real divergence)                         | 32450938549 - **GREEN**  |
| `91a5f09` | planDay invalidation        | 32452361218 - firefox red (second divergence beneath)                            | 32452589997 - **GREEN**  |
| `d97da41` | section locator (temporary) | 32453178131 - locator names `customers`                                          | -                        |
| `d5e068b` | the sqrt sweep              | **32454056716 - GREEN, all 11** (firefox matches node checkpoint-for-checkpoint) | **32454300583 - GREEN**  |

> Final-state evidence (this docs SHA's own runs) is appended at the batch
> close, per the addendum precedent.

## 5. NOT RUN / NOT POSSIBLE

- **Audio files: none exist and none were faked.** The 20-minute real-device audio
  fatigue pass the DoD names **cannot run against silence** — recorded as blocked on
  the external audio delivery, protocol unchanged.
- **Real-GPU frame time: NOT RUN.** Three flag combinations of headed Playwright all
  landed on `ANGLE … SwiftShader driver` on this workstation (verified via
  `WEBGL_debug_renderer_info`); the software reading (~40 ms) is deliberately not
  reported as FPS (D-08). The rig's own budget is CPU maths and IS measured.
- **Human playtest:** NOT RUN (protocol unchanged, agent-incapable).
- **iOS device audio unlock:** no device; Phaser's unlock path is the mechanism
  (RESEARCH_NOTES §13), untested on hardware.

## 6. CHANGE CONTROL

- Schema v10 → **v11** (`audio.ambience`) with migration, fixture `save-v11.json`
  (played session), and the migration-step literals each growing by one.
- `ECONOMY_DESIGN §6.2` visibility/menu-appeal curve rows updated to the calibrated
  values **under the user's calibration authority**, old values retained in the §6.2
  note; `upgradeEffect.test.ts` follows the document it quotes. (Caught by that very
  test — the §6.2 pins did their job.)
- `RenderContext.subscribeEvents` — the renderer may listen, never emit; handed in by
  the composition root like every other capability.

## 7. Open items this phase adds

1. **23 audio files** — `AUDIO_ASSET_REQUIREMENTS.md`, external production.
2. **fx_fire / fx_coin textures** — prompts P245–P246; recorded fallback until then.
3. Real-GPU frame measurement owes a run on a machine whose browser can reach the GPU.
