# UI SYSTEM — the consolidation layout and its rules

> 2026-08-22. The reference-derived interface (UI_REFERENCE_AUDIT.md is the
> input; this is the record of what shipped).

## 1. Architecture (unchanged, enforced)

```
Simulation  →  UiBridge (src/app)  →  HudModel  →  Svelte (src/ui)
     ↑                                                   │
     └──────────── Command ◄── UiCommands intents ◄──────┘
```

The UI is a projection; it never invents game state. The bridge publishes one
mutable model refreshed in place (~10 Hz); components copy primitives out.
Every player action is an intent → a stamped Command → the simulation's own
validation. Enforced by dependency-cruiser (`src/ui` cannot import `src/sim`).

## 2. Screen composition (the reference layout)

| Region                | Component                | Content                                                                                                                                            |
| --------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top left              | `HudCash`                | animated cash, ₡/dk rate, player level + XP bar, Gün/Servis/Bekleyen/İtibar row                                                                    |
| Top centre            | `EnvironmentStrip`       | day + clock pill, weather pill (painted `ui_icon_weather-*`), event chip with countdown                                                            |
| Top right             | `NavRail`                | Analiz · Ayarlar · Menü tiles (vector chrome glyphs)                                                                                               |
| Left edge             | `SpeedRail`              | pause + 1×/2×/4× (`SET_SPEED`)                                                                                                                     |
| Left, upper third     | `OrderCards`             | live orders: state machine verbatim, patience meter, cook bar, **Hazırla**                                                                         |
| Bottom left           | `ActionTiles`            | İnşa Et · Dükkan · Personel                                                                                                                        |
| Bottom centre         | `ContextPanel` (build)   | the whole 30-rung tree, family-grouped cards with painted `ui_upgrade_*` icons and explicit lock reasons; decor strip (`BuildMode`) rides above it |
| Bottom centre, raised | `UpgradeCard` (centered) | the detail: effects before/after, cost, the buy                                                                                                    |
| Top right, under nav  | `ObjectivePanel`         | stage headline, primary goal + bar, the stage checklist with live counters                                                                         |
| Bottom right          | `EvolutionPanel`         | compact chip → offer → construction progress                                                                                                       |
| Right edge            | `NotificationStrip`      | sim-time TTL notices, never modal                                                                                                                  |
| Overlay               | `PauseOverlay`           | player pauses only (harness pauses never veil)                                                                                                     |

World-dominance rules: the centre band belongs to the canvas; one panel at a
time (`openPanel`); Escape closes; Space pauses.

## 3. Design tokens

`src/ui/theme/tokens.css` — the locked 48-swatch palette as custom properties
plus the consolidation vocabulary: `--surface-glass`, `--surface-sunken`,
`--accent-soft`, `--radius-pill/card/tile`, `--ok`, `--danger` (palette
aliases), the 44 px `--touch-target`, `--focus-ring`, motion tokens zeroed
under reduced motion, `--ui-scale` (0.9–1.3 via settings).

## 4. Atlas art in the DOM

`src/ui/lib/atlasIcons.ts` serves atlas frames as CSS sprites (`ui` boot
atlas; `ui2` deferred — first panel open fetches it). Everything degrades to
text while a sheet is in flight: no placeholder boxes, ever.

## 5. Debug vs production

`?debug=1` is the only door, in every build (`DebugOverlay`, dev world
overlays). Production sessions carry zero telemetry chrome; the diagnostics
PANEL (build/sha/stage, copyable) stays a player-facing feature behind Menü.

## 6. Responsive strategy

Desktop is world-first at 100vw×100vh (environment skirt + vignette carry the
frame; no letterboxing). Tiers: ≤900 px trims card widths; ≤700 px compacts
(one order card, icon-only tiles at full touch height, multipliers fold into
pause); ≤480 px height hides the corner cards (objective/evolution — their
content returns via notices and taller viewports); ≤380 px keeps cash, time,
speed, tiles, orders. Asserted at seven viewports with the painted-chrome
HUD-share metric (≤22%/28%).

## 7. The world-fill camera law (2026-08-22 correction pass)

**Every pixel of the gameplay viewport is world, at every viewport size and
every camera zoom.** Not by CSS and not by a backdrop: the ground bake
mirror-tiles across the whole camera-reachable rectangle
(`WorldScene.groundCoverRect` — the lot-plus-margin bounding box grown to at
least a 3840×2160 viewport at minimum zoom), the road band runs the full
width of that rectangle, and deterministic tone washes break the tiling
symmetry. The camera still clamps to the lot plus its authored margin, so
gameplay framing is unchanged; what changed is that everything the clamp can
reveal is real terrain.

Three renderer surfaces used to break this at zoom ≠ 1 and are now fitted to
the camera's **visible world rect** every frame (scroll factor exempts an
object from scroll, not from zoom): the night/weather tint, the wet-ground
quad and the precipitation sky (`EnvironmentLayer.viewRect`), and the
vignette bands (`WorldScene.layoutVignette`). A regression here reads as
hard-edged dark rectangles floating over the world at 0.6× — the
2026-08-22 capture that motivated the rule.

Camera scale itself is untouched: minZoom 0.6, maxZoom 1.8, default 1.0,
clamped by `cameraMath`. Larger viewports reveal more world; nothing scales
the stand down to preserve a fixed framing. `?e2e=1` exposes
`window.__EVOTYCOON_CAMERA__` (set/state through the same clamped
`centreOn`) so acceptance can photograph exact zooms.
