# UI REFERENCE AUDIT — the three supplied references, read pixel by pixel

> Inputs (committed beside this file): `docs/assets/Interface-referance-main.png`
> (night scene, 1672×941 composition), `docs/assets/referance-1.png` (food-truck
> day/dusk scene), `docs/assets/referance.png` (bus-stop day scene). They are
> **design references, not clone targets** — this audit extracts the principles
> and maps each pattern onto the systems the game already has.

## 1. What the references agree on (the visual system)

| Principle                      | As seen                                                                                                                                                                                   | Adopt as                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| World-first                    | HUD hugs the four edges; the centre is 100% game world; no side gutters                                                                                                                   | Layout law: no panel may live in the centre band while playing                                                        |
| Two surface families           | **Dark glass** (HUD pills/cards: ~#0c1017 at ~85–92% opacity, 1px lighter border, soft shadow, blur) + **parchment tiles** (build/action cards: warm cream, dark 2px border, inner bevel) | Token pair `--surface-glass` / `--surface-card`; parchment reserved for _purchasable things_, glass for _information_ |
| Warm accent on cool ground     | Gold/amber (#f0b429-ish) for money, selection rings, section titles; green only for "go/price OK"; red only for alerts                                                                    | Existing palette ramps map 1:1 (gold ramp, green ramp); no new colours                                                |
| One radius language            | Pills ~24–28px, cards ~14–18px, icon tiles ~16–20px                                                                                                                                       | `--radius-pill / --radius-card / --radius-tile`                                                                       |
| Icon illustrations, not glyphs | Buttons carry painted icons (hammer, cart, person, weather set)                                                                                                                           | Use the delivered `ui_icon_*` production set; no emoji, no line-glyphs                                                |
| Quiet motion                   | Nothing animates in the stills except implied number/XP transitions                                                                                                                       | Motion tokens: 150–250ms ease-out; reduced-motion zeroes                                                              |

## 2. Region-by-region map (reference → game component)

### Top-left — economy pill (all three refs)

- `Interface-referance-main`: coin chip + `€8,900 NAKİT` **and** star chip + `Seviye 3` + XP bar `320/600 XP`.
- `referance*`: coin chip + `0,00` + **`+0,00/dk` income rate** + chevron (expandable detail: Gün/Saat/Bekleyen/Servis mini-table below).
- **Map to:** `HudCash` rebuilt as one glass pill: cash (animated), income/min (bridge already computes it), player level + XP bar (progression task), chevron expanding the compact stats row. Directly reusable pattern.

### Top-centre — time pill

- Main ref: moon chip + `Gün 1 - 04:29` + weather word. Others: `[clock 08:16] [weather-icon 23°C]`.
- **Map to:** existing day/clock/weather state (P15). One pill, day+clock primary, weather icon from the delivered `ui_icon_weather-*` set. Directly reusable. (Temperature exists nowhere in the sim — **adapted**: weather name instead of °C; do not invent a temperature system.)

### Top-right — primary navigation

- Main ref: five square glass tiles: trophy, bar-chart, cart, gear, hamburger.
- **Map to:** the P18 action dock's five doors (Staff/Menu/Analytics/Settings/Diagnostics) move here as icon tiles: Objectives(trophy) · Analytics(chart) · Shop(cart) · Settings(gear) · Menu(hamburger→pause/save/diagnostics). Uses delivered icons; `aria-pressed` kept from P18.

### Left edge — speed rail

- Main ref: `1x »` compact pill + separate sun/moon chip. Others: a taller tool rail.
- **Map to:** speed control only (1x/2x/4x/pause — commands exist). The refs' long tool rail is **not adopted** (its slots are debug-ish toggles; ours live behind `?debug=1`). Adapted, not cloned.

### Bottom-left — primary actions

- Main ref: three big tiles with icon+label: `İNŞA ET`, `DÜKKAN`, `PERSONEL`.
- **Map to:** Build / Shop / Staff mode buttons (selected state = gold ring like the ref's selected card). Opens the bottom-centre contextual panel.

### Bottom-centre — contextual cards

- Main ref: structure cards: image, name, price pill (green), lock = padlock + `Seviye N`, selected = gold border + count badge. Others: parchment item tiles.
- **Map to:** Build panel (placeable objects from the existing build system), Shop panel (menu+upgrade ladders), Staff panel (roles with wage). Locked-but-visible is the anticipation mechanic the directive requires. Collapses when no mode selected.

### Bottom/right — objective card

- Main ref: `AŞAMA 1 - YOL KENARI` + three checklist rows with radio dots and `0/1 · 0/25 · 0/1` counters. `referance*`: split into **Görevler** (with green ✓ on done rows) + **İstatistikler** (Günlük gelir, kapasite, Memnuniyet ★★★★☆, Araç trafiği 12/dk, Park 1/4, Boş alan 2/4).
- **Map to:** one compact objective card (stage name + up to 4 live objectives with counters — drives "what do I do next"), expandable to the stats block (all six stats already exist in the sim/bridge: daily income, capacity, satisfaction, traffic/min, parking occupancy, free lots). The ★ satisfaction display maps to the existing satisfaction score.

### Off-screen patterns

- Green **PLAY** tile (refs 2–3): maps to pause/resume state toggle.
- Analytics tile beside it: the P18 Conversion Analytics panel keeps its door.

## 3. What is deliberately NOT taken

- °C temperature (no such sim system — weather name/icon instead).
- The left tool rail's cook/waiter/notebook/plug toggles (debug-flavoured; ours stay behind `?debug=1`).
- The XP numbers (`320/600`) as literals — the progression task defines real curves; the _pattern_ (level chip + bar) is what's adopted.
- Bottom-centre bar being always-open (main ref shows Build selected; when nothing is selected the panel collapses — directive §7).

## 4. Asset linkage

The parchment tiles and icon chips in the references are the same visual language
as the delivered production set in `docs/assets/sources` (`ui_icon_*`,
`ui_illust_*`, structure/upgrade icons P173–P303). The rebuild consumes those
assets; where a needed icon is missing it must enter FINAL_ASSET_REQUIREMENTS +
the prompt catalog rather than being improvised (§26 rules).
