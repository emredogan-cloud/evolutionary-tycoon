# GAMEPLAY INTERACTION AUDIT — what the browser showed before the repair

> 2026-08-21/22, the consolidation pass's §3/§16 evidence. Every finding
> below was observed in a real Chromium session against the running game and
> screenshotted before anything was changed; classifications drove the work.

## 1. The money dead-start (root cause, browser-proven)

A plain session ran **2.5 real minutes with order bubbles on screen and cash
frozen at 0.00** (`served=0, bubbles=2`). Source truth matched the pixels:
`UiCommands` had **no prep/serve verb at all** — `MANUAL_PREP` existed in the
simulation and was dispatched only by test fixtures. At stage 1 the manual
loop IS the game, so every order expired unserved, hiring the ₡20 cook was
unreachable, and hours of play earned nothing. **Not a pipeline bug: an
unexposed interaction.** (The E2E suite had masked it by cooking through the
test hook.)

Repair: the order cards + `prep(orderSlot)` intent. Proof: cash
**0.00 → 3.72** through the real Hazırla button; scenario B green.

## 2. Element inventory at audit time (classification)

| Element                                                                                                                                                                          | Verdict            | Outcome                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------- |
| `debug-overlay` (tick/hash/convert…)                                                                                                                                             | HIDE-IN-DEBUG-MODE | `?debug=1` only, every build                    |
| `build-facts` shell relic                                                                                                                                                        | REMOVE from play   | unsupported/boot screens only                   |
| 40× `upgrade-hotspot` "+" dots                                                                                                                                                   | REMOVE             | replaced by the build panel cards               |
| Full-width `build-menu`/`build-panel` top strips                                                                                                                                 | REPLACE            | bottom-centre panel + decor strip               |
| `HudCash` card                                                                                                                                                                   | REDESIGN           | economy pill (+level/XP, +rate)                 |
| `EnvironmentStrip`                                                                                                                                                               | REDESIGN           | time pill with painted icons                    |
| Dock (bottom-right buttons)                                                                                                                                                      | MOVE/REDESIGN      | NavRail (top right) + ActionTiles (bottom left) |
| `ObjectivePanel` single line                                                                                                                                                     | REDESIGN           | stage checklist card                            |
| `EvolutionPanel`                                                                                                                                                                 | MOVE               | bottom right                                    |
| `StaffPanel`, `PricePanel`, `AnalyticsPanel`, `AudioSettings`, `DiagnosticsPanel`, `NotificationStrip`, `PauseOverlay`, `WorldMarkers`, `StaffIcons`, `OrderBubble`, `CoinPopup` | KEEP               | restyled by tokens where needed                 |
| Letterboxed canvas (black bands)                                                                                                                                                 | FIX                | environment skirt + vignette + full-bleed       |

## 3. World behaviour findings

- **Parking sweep-through**: the single-mouth entry curve carried cars bound
  for far bays through the airspace of parked near bays (screenshotted at
  seed 777, tick 14000). Root cause was the manoeuvre geometry, fixed with
  the clearance corridor (§15) — not masked with UI.
- **Reserve fleet absent**: six behaviour-complete archetypes at share 0;
  their art had landed, so the recorded activation condition was met.
- **West-facing reserve vehicles undrawable** (found by the facings test):
  no west files delivered; fixed with draw-time mirroring, not shipped bytes.
- **Seating/waiter**: systems existed and were correct by construction
  (one-customer-one-table set); what was missing was _proof_, now scenario C.
- Grounding/anchors: verified visually across frozen frames — wheels on
  road plane, no floats, no teleports observed in any capture.

## 4. The 2026-08-22 correction pass — what the browser showed, and what moved

Every finding observed live in Chromium against seed 424242 before anything
changed; the six user captures under `assets/` are the baseline record.

| Observed                                                     | Root cause                                                                                                       | Outcome                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Flat brown void around a detailed rectangle                  | Lot-only bake whose diamond mask is silently inert on this Phaser 4; flat-colour skirt                           | Ground mirror-tiles the whole camera-reachable rect + tone washes (§ UI_SYSTEM 7)               |
| Road as offset slabs with grass crossing it                  | The delivered road slice is a self-contained diorama tile; its verge wraps its own ends                          | Continuous procedural band from the locked palette; seamless-strip prompt P304                  |
| Hard-edged dark rectangles at zoom-out                       | Viewport-sized scroll-factor-0 quads — exempt from scroll, not zoom                                              | Night/wet/rain/vignette fitted per-frame to the camera's visible world rect                     |
| Cars "parked" on the carriageway, bodies through one another | Bays authored half-on-road with no painted geometry; 8.5–11 m archetypes assigned 5 m-spaced bays                | Marked layby + span-aware bay assignment; deterministic no-overlap suite                        |
| Cars "driving backwards/sideways"                            | Nine 2026-08-21 frames don't show their filename's facing (near-axial eye-read miss, audited full-size on green) | `VEHICLE_FACING_FIXES` truthful substitution now; regen prompts NEW_VEHICLE_01–09               |
| Ghost rectangle around some cars                             | `veh_sports_default_se` ships a baked checkerboard "transparency"                                                | Excluded via the fix table; regen prompt P220                                                   |
| Awning lying on the apron                                    | Separate static at ground level 0.8 m north of the counter                                                       | Mounted at bar height over the counter (z 1.75)                                                 |
| Purchases invisible                                          | `world.layout.placed` had no render path at all; buildables named placeholder stems                              | Placed decor renders as depth-sorted statics with real art (schema v12 migrates old ids)        |
| Purchases instantaneous                                      | `buyUpgrade` applied on the click                                                                                | Timed construction sites — BUILD_CONSTRUCTION_DESIGN.md                                         |
| HUD cash at ₡ −2.5e16 over a ₡65 world                       | Self-retriggering `$effect` (untracked `shown` read) compounding across background-tab frame gaps                | `untrack` + absurd-jump snap in HudCash                                                         |
| Stage 2+ walk network silently severed by the new layby      | Bay band + counter left no walkable row; the truck's body sealed the doors' walkway                              | Bay pairs flank the pedestrian mouth; truck moved south; flood-probed intact at all four stages |

Known and accepted (recorded, not hidden): before Stage 4 a far-lane
pull-in still crosses oncoming traffic without gap acceptance — the
short-fused early hold was implemented and **measured** to collapse the road
(mean speed 13.9 → 3.1 m/s, spawn throughput −5.6%, genuine merge overlap),
so the sub-second crossing transient stays and belongs to the open road/lot
user decision (`STAGE_2_4_CALIBRATION_REPORT` §4, `LEFT_TURN` config note).
