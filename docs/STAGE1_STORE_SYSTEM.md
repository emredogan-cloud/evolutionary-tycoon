# STAGE 1 — STORE SYSTEM (DÜKKAN · DEKOR & TABELA)

> Landed 2026-08-23 on `feat/stage1-product-expansion` (`a86677a`), step **S1**
> of [STAGE1_PRODUCT_EXPANSION_PLAN](STAGE1_PRODUCT_EXPANSION_PLAN.md).
> Everything below is implemented and covered; nothing here is a plan.

## 1. The bug this system exists to close

The user reported it exactly:

> buys hand-painted sign · pays · places it · but trash can / flower appears

**No id ever drifted.** The simulation stores what it is handed, and it always
did. The cause was two purchase surfaces sharing one screen:

| Surface                      | What it armed                                        | Where it placed          |
| ---------------------------- | ---------------------------------------------------- | ------------------------ |
| `ContextPanel` upgrade cards | the upgrade the player pressed                       | the upgrade's own anchor |
| `BuildMode` decor strip      | `BUILDABLES[0]` = `planter`, from the tick it opened | wherever the cursor was  |

`BuildMode` mounted a pointer surface across the whole viewport (`inset: 0`,
`z-index: 5`) whenever build mode was open, and its `selected` state was never
null. So a player who bought a sign card and then clicked the world got the
planter the strip had been holding since it opened — the sign, meanwhile, had
queued itself at its authored anchor and never consulted the cursor at all.

## 2. What replaced it

**One armed thing, starting as nothing, owned by the panel that displays it.**

- `GameHud` holds `armedItemId` (`''` by default) and `movingIndex` (`-1`).
- `StorePanel` renders the catalogue and reports presses; it never places.
- `BuildMode` has **no catalogue and no default**. It exists only while
  something is armed, paints a ghost for the id it was handed, and reports a
  click. Closing the panel or switching tabs disarms.

Because only one component may have an opinion about what is being placed, a
placement can no longer disagree with the card that started it.

## 3. The identity chain

The **catalogue id** travels, never the object id — two entries may
legitimately draw the same object, so `objectId` cannot name a purchase:

```
StoreItem.id
  → BUY_PLACE { itemId, x, y }        (no price: cost is read from config at
  → buyPlace()                         the tick it lands on, like BUY_UPGRADE)
  → placeObject(..., { itemId })
  → PlacedObject.itemId               (hashed, saved, migrated)
  → SimView.placed[].itemId → PlacedView.itemId → the store's "Arsadakiler" list
```

Nothing maps a list position, a card index or an `objectId` back to a
catalogue entry. `refundFor` and `sellPlaced` read `itemId` and nothing else.

## 4. The catalogue

`src/config/store.ts` — eleven entries, four categories. **Every `objectId`
resolves in `WORLD_OBJECTS`, proven by test.** The directive's roadside
billboard and directional sign have no delivered art, so they are prompt rows
rather than cards nobody can render.

| Category  | Items                                             | Stage |
| --------- | ------------------------------------------------- | ----- |
| GREENERY  | Çiçek tarhı, Yuvarlak çalı, Geniş çalı, Genç ağaç | 1     |
|           | Çam                                               | 2     |
| SIGNAGE   | Yol kenarı tabelası (zone `roadside`)             | 1     |
| UTILITY   | Sokak lambası, Çöp kutusu                         | 1     |
|           | Sıra bariyeri                                     | 2     |
| FURNITURE | Yuvarlak masa, Plastik sandalye                   | 3     |

Fields: `id · category · label · description · cost · stage · zone · objectId`.

## 5. Placement rules

Two zones, because two are what the lot actually distinguishes:

- **`lot`** — anywhere the existing checks allow.
- **`roadside`** — within `ROADSIDE_BAND_METRES` (6 m) of the carriageway,
  measured to the nearest lane centre line plus half the road width. Distance
  is to the _lanes_, not to a painted band, because a roadside sign earns its
  name by being readable from a moving car. The rule follows the object
  through a move, so it is a placement rule rather than a purchase-time
  formality.

Everything else was already enforced and is not duplicated: the lot rectangle,
the exact-cell occupancy scan, and the navigation trial (`navigationIntact`).
Verdicts the ghost can show: `ok · outside-lot · occupied · blocks-navigation ·
full · wrong-zone`.

## 6. Money

| Action          | Effect                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Buy + place     | one transaction; a refused placement costs nothing and emits no event  |
| Move            | free, no new construction site, identity/level/ownership all preserved |
| Sell (demolish) | **30% back** — `DEMOLISH_REFUND_FRACTION`                              |

**30%, not the directive's 50%.** ECONOMY_DESIGN §8 E5 is explicit — _"İade
yok. Yıkım ise maliyetin %30'unu iade eder, kâr edilemez"_ — and the
directive's own clause defers to an approved GDD rule where one exists. The
fraction is what makes buy-place-remove a cost rather than a free undo, which
is the arbitrage E5 exists to close; a test asserts the round trip loses money.

Anything with no `itemId` (a layout static, or decor placed before the store
existed) refunds **nothing**: there is no price to take a fraction of, and
guessing one from `objectId` would pay out on a purchase that never happened.

## 7. Save schema v13

`layout.placed[].itemId?: string` — optional, so a v12 save validates as a v13
save unchanged. **`v12ToV13` invents nothing** and is only the version bump,
written out rather than skipped so the chain records that v13 asked nothing of
the past. Fixture: `tests/fixtures/saves/save-v13.json` (a bought sign
mid-build, a bought flower bed, and the pre-store anonymous bin beside them).

Hashed in both blocks of `World.ts` (`hashSections` and `hash`), as
`itemId ?? ''` — absent and empty hash identically, so a v12 save and its
migration produce the same world.

## 8. Coverage

| Where                                         | What it proves                                                                                                                                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/sim/layout/storeIdentity.test.ts` | buys **every** entry and asserts the world got that entry and no other; refund is exactly 30% and never a profit; stage/zone/funds gates; move keeps identity, site and till; the edge indexes; and **the whole chain through a save and a reload** — see below |
| `tests/unit/app/browserWiring.test.ts`        | the container's verbs become the commands the simulation actually applies                                                                                                                                                                                       |
| `tests/unit/persistence/migration.test.ts`    | v12 rows stay anonymous across v13; v13 round-trips a bought item                                                                                                                                                                                               |
| `tests/e2e/store.spec.ts`                     | the whole chain through real cards, a real pointer and a real canvas — including that opening a panel arms **nothing**                                                                                                                                          |
| `tests/e2e/buildMode.spec.ts`                 | the ghost answers before the click and the click obeys it, armed from a store card                                                                                                                                                                              |

### The save leg, added 2026-08-23

The directive's chain is buy → place → move → **save → reload** → remove →
refund, and the save leg had no test across all eleven items. It has one now.

Identity is the whole point of the leg. A save writes `itemId` and a reload
reads it back, and every later answer — what this refunds, whether it may stand
here, what the player actually owns — is derived from that one field. If a
round-trip dropped it, the object would still be **drawn correctly**, because
`objectId` is stored beside it, and would silently refund nothing: a sign that
became a flower on the only axis the player can measure.

The test reloads all eleven, checks each row's identity, object and position,
then sells every one back and asserts the till holds exactly
`Σ cost × DEMOLISH_REFUND_FRACTION`.

## 9. Functional buildings come through the same door

Added 2026-08-23. `buyPlace` dispatches to `buyBuilding` when the id names a
building, so equipment and decor share one command, one transaction and one
identity chain. What differs is only what happens after the object lands:

- a decor item is finished on the click;
- a building is **real from the click** — it holds its cell and blocks
  navigation exactly as a prop does — but its **level is zero until the site
  completes**, so it contributes no effect and draws no upgraded art meanwhile.

`movePlaced` carries a building's level with it. That was a real bug caught
before it shipped: `moveObject` reset `level`, so relocating a level-3 machine
silently demoted it to level-1 art and no effect.

Detail: [`STAGE1_BUILDING_SYSTEM.md`](STAGE1_BUILDING_SYSTEM.md).

## 10. Known gaps

- **Cosmetic only.** No _decor_ item feeds an economy effect. That is deliberate
  — an `atmosphere` contribution would move the calibrated Stage 1 economy and
  belongs with a balance run, not with a placement system. (The two functional
  buildings above are not decor and do feed effects.)
- **The roadside verge is two of four.** `flower-bed` (₡6) is the
  stone-bordered bed and `roadside-sign` (₡12) _is_ the illuminated billboard
  (`struct_sign_large_lower/_upper`); `zone: 'lot'` is unrestricted, so lot
  items may already stand on the verge. A distinct **wooden planter box** and a
  **directional sign** have no art and are not shipped — a store card that drew
  a placeholder would break REAL ASSET > PLACEHOLDER. Whether those two should
  be produced at all is an open user decision.
- The İnşa Et door now has both tabs: the upgrade tree and **Mutfak & Tesisler**.

## 11. Decor is not a property (2026-08-23)

The restaurant evolution system levels five things and **none of them is a
store item**. That is a decision, and the directive's own words are the reason:
_"Do NOT make every decorative prop levelable just because it exists."_

A bench, a bin, a shrub or a lamp post is personalisation. A player buys it
because they want the lot to look a certain way, and that is a complete
transaction. Attaching a ladder to it turns a choice into an obligation: the
shrub now has a level, the level has a cost, and the player who liked the shrub
is now behind on something.

The one apparent exception proves the rule. `roadside-sign` places the `sign`
object, and the sign **does** move a level — but the level belongs to the
**frontage property**, because what changes is conversion from the road, not
how the sign looks to its owner. The store sells the object; the property sells
what it does.

So the store's catalogue, its zones, its 30% refund and its identity chain are
untouched by this pass. The only overlap is visual: a player who has placed a
`roadside-sign` sees the frontage hotspot sitting on it, because
`propertyAnchor` finds the sign in the layout rather than carrying a coordinate
of its own.
