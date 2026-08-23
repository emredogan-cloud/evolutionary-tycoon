# STAGE 1 — THE PRODUCT SYSTEM

> The menu: what the stand sells, what it charges, and how long the kitchen is
> tied up making it. Written 2026-08-23.

## 1. The menu is one list

`src/config/economy/menu.ts` is the single definition. Thirteen items, each
carrying its own `label`, `stage`, `basePrice`, `baseCost` and `prepTimeMs`.

The `label` field is new in this pass and it closed a real defect: the price
panel had its own three-entry map of Turkish names, so ten of the thirteen
products rendered their raw id. A name that lives beside the price it belongs
to cannot fall behind it.

| Item           | Stage |   Prep |
| -------------- | ----: | -----: |
| chips          |     1 |  3.0 s |
| cola           |     1 |  5.0 s |
| lemonade       |     1 |  5.0 s |
| coffee         |     2 |  6.0 s |
| hotdog         |     1 |  6.5 s |
| dessert        |     3 |  8.0 s |
| salad          |     3 | 10.0 s |
| fries          |     2 | 12.0 s |
| chicken-meal   |     3 | 25.0 s |
| breakfast-set  |     3 | 28.0 s |
| hamburger      |     2 | 30.0 s |
| premium-burger |     4 | 35.0 s |
| family-meal    |     4 | 45.0 s |

The directive's UX anchors — drink ≈ 5 s, burger ≈ 30 s — are hit exactly.
Its third anchor, pizza ≈ 30 s, has nothing to apply to: there is no pizza on
the menu. Recorded rather than silently dropped.

The hot dog at 6.5 s is the one deviation and it is measured, not chosen:
`STAGE1_4_BALANCE_CALIBRATION.md` §4 has the cliff table. Holding lemonade at
its anchor, 7.0 s puts `stageTransitionPacing` at 23.71 minutes against a
22-minute ceiling and 6.5 s puts it at 18.01. Chips move the figure by 0.17
minutes across half a second; shortening the drink below its anchor does not
help at all. The hot dog has no anchor in the directive, so it took the
deviation and both stated anchors stayed exact.

## 2. Price is a real control, and the band is visible

ECONOMY_DESIGN §4: ±50% around the list price — "tek düğmeyle stratejik
derinlik", one control that trades margin against conversion.

The band is drawn as the slider's own range, so the limit is something the
player can see rather than something they discover by being refused. The
simulation clamps it again anyway, because the panel is not a control
(exploit E2): `SET_PRICE` is a command, and commands are replayed from logs
and loaded from saves.

Every price on a card is a _real_ price. `SET_PRICE` moves the number the
conversion model reads; there is no cosmetic slider anywhere in the panel.

### Why the slider runs 0–100 and not over the prices

A slider whose domain _is_ the band lays a step lattice from `min` that `max`
is not on. Lemonade's band is ₡2.025–₡6.075, and no whole number of five-kuruş
steps from 2.025 lands on 6.075 — so the player could see the top of their own
band and never reach it. Worse, the band's ends are not exact binary fractions,
so even a step computed from the band misses them. A hundred integer notches
has neither problem, and the price it converts to is exact at both ends.

The `−` / `+` buttons step those same notches, five at a time. They exist
because a slider is a poor instrument for a five-kuruş decision, and on a touch
screen it is a poor instrument for any decision.

## 3. The card

Rebuilt against `docs/assets/sources/new-menü-design.png` — see
UI_REFERENCE_AUDIT §STAGE1_PRODUCT_EXPANSION_REFERENCES E.3. Five facts, in the
order a pricing decision is actually made in:

1. **What it is** — the delivered food art and the item's own label.
2. **What am I charging** — the amber figure, the largest thing on the card.
3. **How does that compare** — the markup badge, `price / base − 1`, computed
   and never decorative. Green above the list price, red below it, neutral at
   it. Every card in the reference reads `+50%` because every card in the
   reference sits at the top of its band; ours reads what the price is.
4. **What do I keep** — the `Liste` / `Kâr` pair, labelled.
5. **How long does it tie up the kitchen** — the preparation time, read from
   `MenuItem.prepTimeMs`, the same field the kitchen counts down.

A locked item is **shown, not hidden**, with the stage that would open it. A
menu that only lists what is already available cannot tell the player what
growing would give them.

`↻ Varsayılana dön` resets every sellable price to its list price, and is
disabled when nothing has moved.

## 4. Where preparation time sits in the economy

The balance matrix measures kitchen occupancy at **2.1–10.0%** across every
stage, policy and seed, against 894–1656 parking turnaways for 1097–1593
served. So:

> Preparation is not the throughput constraint — demand and parking are.

Longer preparation therefore costs **patience**, not kitchen capacity: orders
sit longer, more customers give up, fewer are served. That is why the
functional buildings' worth rises with the preparation times rather than
falling, and why their effect is invisible at Stage 1 and decisive at Stage 2
(see [`STAGE1_BUILDING_SYSTEM.md`](STAGE1_BUILDING_SYSTEM.md) §4).

## 5. Tests

- `tests/unit/config/menu*.test.ts` — the shape of the definition.
- `tests/e2e/products.spec.ts` — the panel in a browser. It reads the expected
  preparation times **from `MENU`** rather than transcribing them; the earlier
  version had `'2,5 sn'` and `'9,0 sn'` typed into it and went stale the moment
  the calibration landed. Same lesson as the table coordinates two passes ago.
- `tests/integration/stageTransitionPacing.test.ts` — the ceiling the hot dog
  was calibrated against.
- `tests/balance/matrix.test.ts` — the reporter, gated on `MATRIX_MINUTES`.

## 6. Related

- [`STAGE1_4_BALANCE_CALIBRATION.md`](STAGE1_4_BALANCE_CALIBRATION.md) — the
  full requested / tested / final table and the honest S3/S4 deviation.
- [`ECONOMY_DESIGN.md`](ECONOMY_DESIGN.md) §4 — the price band contract.
