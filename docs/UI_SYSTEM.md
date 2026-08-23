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

| Region                | Component                | Content                                                                                                                                              |
| --------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top left              | `HudCash`                | animated cash, ₡/dk rate, player level + XP bar, Gün/Servis/Bekleyen/İtibar row                                                                      |
| Top centre            | `EnvironmentStrip`       | day + clock pill, weather pill (painted `ui_icon_weather-*`), event chip with countdown                                                              |
| Top right             | `NavRail`                | Analiz · Ayarlar · Menü tiles (vector chrome glyphs)                                                                                                 |
| Left edge             | `SpeedRail`              | pause + 1×/2×/4× (`SET_SPEED`)                                                                                                                       |
| Left, upper third     | `OrderCards`             | live orders: state machine verbatim, patience meter, cook bar + countdown, **Hazırla** (PLACED) and **Servis et · +₡x,xx** (ON_PASS, counter stages) |
| Bottom left           | `ActionTiles`            | İnşa Et · Dükkan · Personel                                                                                                                          |
| Bottom centre         | `ContextPanel` (build)   | the whole 30-rung tree, family-grouped cards with painted `ui_upgrade_*` icons and explicit lock reasons; decor strip (`BuildMode`) rides above it   |
| Bottom centre, raised | `UpgradeCard` (centered) | the detail: effects before/after, cost, the buy                                                                                                      |
| Top right, under nav  | `ObjectivePanel`         | stage headline, primary goal + bar, the stage checklist with live counters                                                                           |
| Bottom right          | `EvolutionPanel`         | compact chip → offer → construction progress                                                                                                         |
| Right edge            | `NotificationStrip`      | sim-time TTL notices, never modal                                                                                                                    |
| World layer           | `InspectCard`            | a hotspot pip on every property at its own world anchor; selecting one opens the BİLGİ / İNŞA ET card beside it                                      |
| Overlay               | `PauseOverlay`           | player pauses only (harness pauses never veil)                                                                                                       |

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

## 12. The order card is the whole manual loop (2026-08-23)

Two corrections landed on this one component, and both were only visible in a
browser.

**The countdown was reading the wrong clock.** `UiBridge.refillOrders`
computed the remaining preparation from `world.tick * TICK_MS`, which starts at
zero, while every order timestamp is stamped from `world.clock.simTimeMs`,
which starts at 08:00 — **240 000 ms** in. A five-second lemonade therefore
rendered `243 sn` over a progress bar that never moved (`cook01` clamped at 0),
and every order reported an age of zero forever. One line, `world.clock.simTimeMs`,
and no constant added anywhere. Gated by `tests/unit/app/orderCards.test.ts`
(four assertions that fail on the old code) and `tests/e2e/prepTimer.spec.ts`
(the same numbers read out of the DOM, at 1x, 2x, 4x and paused).

Format: whole seconds, rounded up, `X sn`; over a minute, `m:ss`. Rounding up
is the deliberate half of a conflict — it opens on exactly the advertised prep
time, where rounding down would open a 5.0 s drink on `4` and spend its last
whole second showing `0 sn` on food that is visibly still cooking.

**`ON_PASS` gained a button.** A finished tray is no longer handed over by the
passage of time; the player serves it, or a cook covers after four seconds
(`docs/COOK_PLAYER_INTERACTION_DESIGN.md`). The button sits exactly where
`Hazırla` sits on the same card and carries the money, because what serving is
worth is the reason to press it. **Every** ready tray gets one, not just the
oldest — with three ready and one register, who gets theirs first is the
player's decision, and a button on only one card would have made it for them.

`servable` comes from the bridge rather than being inferred in the component:
a dining room is carried rather than handed over, so from Stage 3 the flag is
false everywhere and the card shows the takings instead of an action that would
refuse.

## 13. Object inspection — the world is the interface (2026-08-23)

`InspectCard` is the restaurant evolution system's whole surface. Every
property carries a pip at its own world anchor showing its level; selecting one
opens a card **beside** it — not over it, because a panel centred on the anchor
hides the object it is describing.

Two faces, and the split is the point:

- **BİLGİ** — what it is, what level, what it provides, how much is in use.
- **İNŞA ET** — the next level, its price, its duration, what it will look
  like, and, when it cannot be bought, exactly which requirement is short.

### Nothing on the card is computed by the component

Every number arrives on `PropertyView`, derived by `UiBridge` from the
simulation on the sample that produced it — including "can I afford this" and
"why is this locked". A component that worked either of those out itself would
be a second implementation of a rule the purchase then applies differently,
which is how a card ends up green over a refusal. The overlay names an intent;
the simulation decides.

That is also why the lock reason is a **string from the bridge** rather than a
disabled state: `CEPHE SV. 2 GEREKLİ` is the actual first shortfall out of
`missingProperties`, not a guess the UI assembled from a boolean.

### The preview has three answers, not two

`nextArt` is `sprite`, `prompted` or `procedural`, and the card draws a
different thing for each: the frame, the words _Görsel üretimde_, or — for the
car park, which has no sprite by design — the bays themselves at card size with
the ones this level adds picked out in the accent colour.

**This was a boolean first, and the boolean was wrong in both directions at
once.** The car park had no asset and claimed verified art, so the card rendered
"the picture is still being made" over a `data-art="real"`: an apology for a
delay nobody was causing, on top of a claim of art nobody had drawn.
`tests/e2e/inspectCard.spec.ts` found it; the three-way type makes the
combination unsayable, and `tests/unit/config/properties.test.ts` fails if a
`sprite` level ever names a frame the atlas does not carry.

### The hotspot is a place, never an average of places

Anchors are derived from the layout — the sign object, the grill object, the bay
nearest the middle, the queue slot in the middle. The first version used the
_mean_ of the car park's bays and rendered the dot on the carriageway: Stage 1
authors its four bays in two pairs at x 2.5/7.5 and 16.5/21.5, so their mean is
the gap between them. The arithmetic was correct the entire time. Two rules now
hold it (`tests/unit/sim/properties/propertyLevels.test.ts`): the car park's
anchor is one of the live bays, and no two anchors are within a metre of each
other — two 44 px touch targets on one spot is a button that "sometimes does
nothing".
