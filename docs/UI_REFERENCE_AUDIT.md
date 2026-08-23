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

## STAGE1_PRODUCT_EXPANSION_REFERENCES

> Added 2026-08-23 for Decision E of the Stage-1 continuation directive. Inputs,
> located and opened rather than recalled:
>
> | File                                           | Bytes     | Subject                  |
> | ---------------------------------------------- | --------- | ------------------------ |
> | `docs/assets/sources/new-gösterge-desing.png`  | 1 550 032 | dashboard / HUD          |
> | `docs/assets/sources/new-menü-design.png`      | 1 780 872 | Dükkan → Menü & Fiyatlar |
> | `docs/assets/sources/personel-list-design.png` | 1 850 723 | Personel                 |
>
> Same standing as §1–3: **design references, not clone targets.** Section E.6
> records what was deliberately not taken and why.

### E.1 The visual system these three agree on

| Aspect                  | As seen in the three images                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Layout hierarchy**    | One dark rounded panel per subject. Inside it, content is banded: a headline band, then a rail or grid, then a footer. Bands are separated by a hairline rule, never by a gap alone.              |
| **Sub-surfaces**        | Each band sits on its own fill — the XP rail and every product/person card are _darker_ than the panel they sit on. Depth is fill, not shadow.                                                    |
| **Spacing**             | Panel padding ≈ card gap ≈ 20–24 px; inside a card, label→value ≈ 2–4 px and group→group ≈ 12 px. Two rhythms only: between things, and within a thing.                                           |
| **Card style**          | Radius ~16 px on cards, ~24–28 px on panels and pills. Border is a barely-there hairline; separation is carried by the fill difference.                                                           |
| **Icon placement**      | Always leading, never trailing, and always paired with the value it qualifies (coin→price, clock→duration, star→level). In the stat strip the icon sits _above_ its label.                        |
| **Typography**          | Three steps and they are never adjacent in weight: value (large, 700–800, tabular), name (medium, 700), label (small, 400–600, muted). Values are always larger _and_ brighter than their labels. |
| **Selected state**      | Amber outline **plus** amber label, on a faint amber fill. Not a solid fill — the fill stays available to mean "pressed".                                                                         |
| **Locked / inactive**   | Grey outline, muted label, full opacity — inactive is quiet, not faded out.                                                                                                                       |
| **Active / status**     | A pill with a coloured dot and a word: green good, blue neutral, purple special, red cost. The dot carries the colour, the word carries the meaning.                                              |
| **Price presentation**  | Coin glyph, then the figure in amber at the largest size on the card. Secondary money (list, profit, wage) is small, neutral-coloured and **labelled**.                                           |
| **Avatar presentation** | A square, rounded, bordered portrait tile at the row's leading edge, the full height of the card beside it.                                                                                       |
| **Information density** | Five or six facts per card and every one of them visible — nothing behind a hover, nothing behind a chevron.                                                                                      |
| **Panel placement**     | Each panel hugs one edge and leaves the world the middle, matching §1's world-first law.                                                                                                          |

### E.2 `new-gösterge-desing.png` → the dashboard

Read: three bands. **(1)** gold coin, `72,38` very large in white, `+7,20/dk`
in green beside it, an `i` tile at the right. **(2)** a sunken pill holding a
star badge, `Seviye 4`, an amber progress bar, and `13 / 170` with `XP` in
blue. **(3)** a rule, then four ruled columns, each icon-over-label-over-value:
`Gün 1 · 00:00`, `Servis 27`, `Bekleyen 0`, `İtibar 50`.

Adopted in `src/ui/components/HudCash.svelte`: all three bands, the sunken
rail, the column rules, the `i`, and the type hierarchy. The data was already
there — what changed is that money, progress and today are no longer three
lines of the same grey text at the same size.

### E.3 `new-menü-design.png` → Dükkan → Menü & Fiyatlar

Read: a tab row (active = amber outline + amber label + icon; inactive = grey
outline + icon) with an info pill at the right; a three-across grid of product
cards; a centred `↻ Varsayılana dön` footer. Each card: large food art, name,
coin + amber price, a green `↑ +50%` badge top-right, a `Liste`/`Kâr` labelled
pair, a `−` / blue slider / `+` stepper, the band written out
(`₡2,03 – ₡6,07 aralığında`), and a duration.

Adopted in `src/ui/components/PricePanel.svelte` and the `.shop` chrome in
`GameHud.svelte`: the grid (`auto-fill`, so three across on a desktop and one
on a phone from a single rule), the card's field order, the stepper, the badge,
the written band, the footer reset, and the tab treatment.

The badge is **computed** — `price / base − 1` — and turns red below the list
price. Every card in the reference reads `+50%` because every card in the
reference is at the top of its band; ours reads what the price actually is.

### E.4 `personel-list-design.png` → Personel

Read: a header (`Personel`, person icon, count; total wage in red at the
right); rows of `[square portrait] [dark card]`; each card carrying a name, a
blue role or a description, a duration, a wage, and a coloured status pill;
a footer tip strip.

Adopted in `src/ui/components/StaffPanel.svelte`: the header, the portrait +
card row shape, the name, the blue role, the wage, and the status pill with its
dot. This is the surface the directive singled out as "the old bare developer-
list appearance", and the reference's actual argument is the one adopted: **an
employee is a person, not a row.**

### E.5 The root cause found underneath the redesign

The references' whole hierarchy is _labels dimmer than their values_. Ours had
none, and not because of the CSS in the components:

`src/ui/theme/tokens.css` aliased three ramp steps that do not exist. The
locked palette is 12 ramps × 4 steps — 900/700/500/300, and 900/600/300/050 for
`neutral` — and the file named `steel-600`, `amber-600` and `neutral-500`. A
custom property that references an undefined custom property becomes the
_guaranteed-invalid value_, and every declaration built on it is dropped
silently at computed-value time. Nothing warns; the build, the type-checker and
ESLint all pass.

Measured in Chromium against the preview build, before the fix:

| Token             | Resolved to | Consequence                                                |
| ----------------- | ----------- | ---------------------------------------------------------- |
| `--edge`          | invalid     | `--border` invalid → **16 components rendered `0px none`** |
| `--ink-dim`       | invalid     | inherited → **8 components painted labels pure white**     |
| `--accent-strong` | invalid     | gradient invalid → **the XP bar's fill painted `none`**    |
| `--text-md`       | invalid     | the 380 px type step was dropped                           |

`getComputedStyle` on the dashboard returned `rgb(255,255,255)` for both the
label and its value, and `0px none rgb(255,255,255)` for the panel border.

Fixed to `steel-700`, `amber-500` and `steel-500`; `--text-md` retired in
favour of the scale's own `--text-base`. `--c-text-dim`, the legacy
vocabulary's tertiary, was also 3.63:1 against `--surface-raised` — below AA
for small text while this file's header claimed the set passed — and now
resolves to the same 5.29:1 tone.

`tests/unit/ui/tokens.test.ts` is the gate: every `var(--x)` without a fallback
must name a defined token, and no `--ramp-NNN` name may reference a step
`palette.json` does not have. A visual golden could not have caught this — the
goldens were recorded from the same broken cascade and agreed with it.

### E.6 What was deliberately not taken

- **The reference's menu contents** (Su, Sandviç, Dondurma). Ours renders
  `MENU`; the reference is a mock-up.
- **`12 dk` on a staff row.** That is a tenure or shift clock and the game has
  no such concept. The second figure on our card is `busy01`, which is measured
  and varies — measured at Stage 1, a cook is idle 97.7% of a session, and the
  panel offering the hire should say so.
- **`İyi / Orta / Uzman` skill pills.** Every hire is at `DEFAULT_SKILL` today,
  so a skill pill would print the same word on every card forever. The pill
  carries the **live state** instead — working / moving / waiting / idle — which
  is real and changes while you watch. The pattern is adopted; the content is
  ours.
- **The wrench beside `Servis` and the parcel beside `İtibar`.** Decorative
  there. Ours name what they count, from the delivered set: a customer for
  customers, a star for standing.
- **The bar-chart glyph beside `2,5 sn`.** A duration gets a clock.
- **`€` and `%10 maaş al`.** The game's unit is `₡`, and there is no wage-cut
  mechanic to offer.
- **All three bands on a phone.** The full dashboard measured **32.5%** of a
  360×640 viewport against GDD §14.1's 28% mobile budget (this panel alone at
  16.3%). On phone breakpoints the day strip folds behind the `i` that was
  already there to explain it, taking the chrome to 26.5%. Money and progress —
  what the player is actually watching — stay on screen. Measured, per viewport,
  in `tests/e2e/responsive.spec.ts`.

### E.7 Asset gap opened by this section

The portrait tile is real and shaped as the reference shapes it, but it is
filled with the delivered **role** icon (`ui_icon_role-cook`, `-waiter`,
`-cleaner`), not a per-person portrait — that set does not exist. Recorded as
an asset requirement rather than faked with a silhouette; see
`docs/ASSET_GENERATION_PROMPTS.html`, marker `NEW_STAGE1_CONTINUATION_*`.

## 4. Asset linkage

The parchment tiles and icon chips in the references are the same visual language
as the delivered production set in `docs/assets/sources` (`ui_icon_*`,
`ui_illust_*`, structure/upgrade icons P173–P303). The rebuild consumes those
assets; where a needed icon is missing it must enter FINAL_ASSET_REQUIREMENTS +
the prompt catalog rather than being improvised (§26 rules).
