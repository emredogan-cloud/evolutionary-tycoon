# STAGE 1 DEVELOPMENT MASTERPLAN

> **What Stage 1 has to become, and in what order.**
>
> Written 2026-08-23 from [`LEVEL1_WORLD_INVENTORY.md`](LEVEL1_WORLD_INVENTORY.md)
> (what is there) and [`RESTAURANT_EVOLUTION_ROADMAP.md`](RESTAURANT_EVOLUTION_ROADMAP.md)
> (how it grows). This is the level plan; those two are the audit and the
> architecture.
>
> Nothing here authorises work. The authorised phase is whatever Project Memory
> §21 names, and P19 is **not started**.

---

## §1 What Stage 1 is for

A roadside lemonade-and-burger stand on a dirt lot beside a two-lane road. The
player is behind the counter: they take an order, they cook it, they hand it
over. Everything else in the game is introduced later.

Stage 1 has to teach four things, in this order, without ever saying them:

1. **A queue forms.** Cars pass, some pull in, people wait. The queue is
   visible, finite, and the player can watch it fail.
2. **Cooking takes time.** The prep timer is real seconds against a real
   station, and two orders do not cook faster than one until there are two
   benches.
3. **The lot is a thing you own.** It is not scenery; the bays fill, the sign
   is read from the road, and both can be bought.
4. **The restaurant grows in place.** Evolution is not a scene change: the
   camera stays put and the counter point never moves.

Item 3 is what the restaurant evolution system added. Before it, the lot was a
backdrop with an invisible capacity, and the only dial a player could turn was
the upgrade shop.

---

## §2 Where Stage 1 stands today

Measured, not remembered — sources in the inventory.

| Area         | State                                                                          |
| ------------ | ------------------------------------------------------------------------------ |
| Layout       | 4 parking bays, 6 queue slots, 0 tables, 1 register, 9 static objects          |
| Kitchen      | 8 station slots; 3 live at `prepStations` 0 (grill, fryer, drink)              |
| Menu         | the Stage-1 items, priced inside `PRICE_BAND`                                  |
| Store        | 7 placeable items, 3 zones, 30% demolition refund                              |
| Buildings    | `cola-machine`, `burger-machine` — bought, placed, levelled, 3 levels each     |
| Upgrades     | 5 rungs / 13 levels reachable at Stage 1                                       |
| Properties   | 5, of which 4 are buyable at Stage 1 (main is the stage itself)                |
| Player level | 1 → 10, gates 6 upgrade rungs                                                  |
| Art          | 8 of 18 property levels have their own frame; 7 are prompted; 3 are procedural |

### What the evolution pass changed

- The car park became a **thing with a level** — the one capacity ceiling in the
  whole game that nobody sold. Two rungs, ₡5 and ₡40.
- Every property gained a **hotspot and a card**: what it is, what level, what
  capacity, how much is in use, what the next level costs and looks like, and —
  when it is locked — exactly which requirement is short.
- Stage transitions gained a **property floor**. Money alone no longer opens
  Stage 2; the lot has to be able to serve it.
- `propertyLevels` became **simulation state**: hashed, saved, migrated (v15),
  and reached only through a logged command.

---

## §3 What is still open at Stage 1

Ordered by what a player meets first. Each row says what it is, what it costs to
close, and what it is blocked on. **None of it is authorised by this document.**

### 3.1 Art owed — 7 property levels

The two that a first session reaches are `service Lv2` (**P317**) and
`frontage Lv2` (**P307**). Both are frame swaps against delivered art, so the
reference is already in the repository. Full detail and copy-ready prompts:
[`LEVEL_ASSET_EVOLUTION_LIBRARY.md`](LEVEL_ASSET_EVOLUTION_LIBRARY.md) §3.

**Blocked on:** image generation, which this agent cannot do (Project Memory
checkpoint N). The prompts are filed; nothing else is in the way.

**Meanwhile:** the level is buyable, its effect is real, and its preview says
_"Görsel üretimde"_ rather than showing the frame the player already owns.

### 3.2 The kitchen is not drawn as a kitchen

Stage 1 has three live stations and no room around them. `pass`, `fryer` and
`drink` are drawn; the benches behind `prepStations` appear as the same grill
frame. A player who buys `second-prep-station` sees the order queue move faster
and sees nothing new on the lot.

**Blocked on:** P316 (`struct_grill_lv3`) for the third bench, and a decision
about whether Stage 1 should show a second bench _at all_ — it is the one place
where the current layout has no space authored for it.

**Not a defect.** The effect is real and the card says what it does. It is a
gap between mechanic and picture, recorded rather than papered over.

### 3.3 Seating does not exist at Stage 1

By design (`ADR` and inventory §6: tables arrive at Stage 3). Adding outdoor
seating to Stage 1 would switch the level to waiter-carried delivery, which is
Stage 3's mechanic. That is a design change and needs a change request, not an
implementation.

### 3.4 The frontage ladder outruns its art three levels deep

`hand-painted-sign` sells four rungs; exactly one of them changes the picture
(and that one is P307, still owed). Levels 3 and 4 are P319 and P320.

This is the ladder where the mismatch is widest, and it is worth naming as a
**design question** rather than only an art gap: four rungs of "the sign is more
visible" is a lot of ladder for one object. The alternative — fewer rungs,
each with its own picture — is a change request against
[`PROGRESSION_DESIGN.md`](PROGRESSION_DESIGN.md), not something to decide here.

### 3.5 Six unbriefed interface references

`docs/assets/level-1-interface.png` … `level-6-interface.png` are present in the
working tree, untracked, and were supplied without a brief. They are **not**
used by anything and are **not** committed. They are named here so they are not
silently lost; what they are for is a question for the user.

---

## §4 Order of work, if and when it is authorised

The dependency order, so nothing is built on something that has to move:

```
1. Art delivery (P307, P317)        ← unblocks the two Stage-1-reachable levels
2. Art delivery (P316, P319)        ← Stage-2-reachable
3. Kitchen layout decision           ← needs 1 to know what a bench looks like
4. Art delivery (P315, P318, P320)  ← Stage 3/4-reachable, no Stage-1 impact
5. Frontage ladder review            ← a design decision, not a build
```

Steps 1, 2 and 4 are the same kind of work and could be one generation session —
they are already one batch (`restaurant-evolution`) for exactly that reason:
each prompt references the frame it replaces, and generating them apart is how a
family stops looking related.

---

## §5 What "Stage 1 is done" would mean

Not a feeling. The fifteen items of
[`WORKING_DISCIPLINE.md` §4](WORKING_DISCIPLINE.md#4-tamamlandi-ne-demek--definition-of-done),
plus these four that are specific to this level:

1. **Every property level a Stage-1 player can reach has its own picture.**
   Today: 2 of the 4 reachable levels do. Measured by
   `tests/unit/tools/levelArtLibrary.test.ts`.
2. **No card shows a number the simulation cannot be asked for.** Enforced by
   `tests/e2e/inspectCard.spec.ts`, which reads the capacity out of the DOM and
   compares it against a direct count of the world.
3. **The opening session reaches Stage 2 inside the pacing window.** Currently
   measured and passing — see `tests/integration/stageTransitionPacing.test.ts`.
4. **The balance gate evaluates every assertion.** `pnpm balance:check` with no
   `⊘` for any Stage-1 policy. Currently 5 passed, 1 skipped, exit 0.

---

## §6 Related

- [`LEVEL1_WORLD_INVENTORY.md`](LEVEL1_WORLD_INVENTORY.md) — what is there
- [`RESTAURANT_EVOLUTION_ROADMAP.md`](RESTAURANT_EVOLUTION_ROADMAP.md) — how it grows
- [`LEVEL_ASSET_EVOLUTION_LIBRARY.md`](LEVEL_ASSET_EVOLUTION_LIBRARY.md) — every level's picture
- [`STAGE1_UI_FINAL_CORRECTION_REPORT.md`](STAGE1_UI_FINAL_CORRECTION_REPORT.md) — the 2026-08-23 correction pass
- [`COOK_PLAYER_INTERACTION_DESIGN.md`](COOK_PLAYER_INTERACTION_DESIGN.md) — why the cook does not play the game for you
- [`STAGE1_BUILDING_SYSTEM.md`](STAGE1_BUILDING_SYSTEM.md) · [`STAGE1_STORE_SYSTEM.md`](STAGE1_STORE_SYSTEM.md)
