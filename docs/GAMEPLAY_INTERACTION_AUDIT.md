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
