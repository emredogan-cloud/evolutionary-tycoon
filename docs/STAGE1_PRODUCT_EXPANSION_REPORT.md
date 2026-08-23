# STAGE 1 PRODUCT EXPANSION SONUCU

> Branch `feat/stage1-product-expansion`, base `ce00284`.
> Plan: [STAGE1_PRODUCT_EXPANSION_PLAN.md](STAGE1_PRODUCT_EXPANSION_PLAN.md) (`b1f8ae2`, written before any code).
> Commits: `0295930` · `a86677a` · `bbd8077` · `c71f4be` · `6102635`.
>
> **This report covers the first pass only, and closed 🟡 PARTIAL.** The
> decision-locked continuation that finished the outstanding work is
> [`STAGE1_CONTINUATION_REPORT.md`](STAGE1_CONTINUATION_REPORT.md) — decisions
> A–E, commits `af43973` · `6dd7d49` · `d17db82` · `f699478` · `2f77004`.
> Everything listed as _not started_ below (S2 kitchen effect consumers, U2
> functional buildings, A1 asset audit, the cross-stage balance matrix and the
> viewport matrix) is done there.

## Execution Plan

The plan's dependency order was **W1 → W2 → S1 → S2 → S3 → U1..U4 → A1 → Q1..Q3**.
W1, W2, S1 and the product/staff halves of S3/U1/U3 are done. S2 (kitchen
effect consumers), U2 (functional buildings) and A1 (asset audit) are **not
started**, and §26's cross-stage balance matrix and §32's viewport matrix are
not run. Two findings below are the reason the remaining order is now a
question rather than a queue.

The order held: the geometry work invalidated hashes and goldens exactly once,
and every later step was built on a green tree.

## Stage 1 World

The previous session's W1 was **half-finished — sixteen tests were red** when
this one opened. Five root causes, each found by measurement:

1. **A stopped vehicle could never start again.** IDM's free-road acceleration
   is ~0.9 m/s² and a tick is 50 ms, so the first tick out of a standstill
   produces 0.045 m/s — under `STOP_SPEED_EPSILON` (0.05) — and was rounded
   back to zero every tick, forever. Measured: one car alone on an empty lane,
   accelerating at +0.9, frozen from tick 39 904 to the end of the run, its
   spawn headway keeping the lane empty behind it (**1 158 arrivals where
   10 000 are expected**). The epsilon now guards on `accel <= 0`.
2. **The gap clamp could write a car backwards** (measured: 1.67 m of reverse).
   It may now cancel a tick's advance and no more.
3. **The turn-in pin outlived the turn.** `accelerate` braked a car to a halt
   at the mouth on `decision` alone while `considerHandover` gives up the
   moment the customer is gone, so a customerless DECISION_YES car parked
   itself at the head of its lane permanently — an 18-minute Stage 4 deadlock.
4. **A departing car waited at the end of its exit curve** — physically on the
   lane whose gap it was waiting for. It now waits at the band edge.
5. **An e2e spec carried six table coordinates copied out of `stage3.ts`.** The
   dining grid moved and the literals did not, so it measured bare floor and
   reported "nobody is at a table" about a diner that was serving fine.

**Shop position, canopy, trees, vignette** — verified in a real browser at
seed 424242: the scene reads road → layby (outside the carriageway) → walkway
→ stand; the canopy sits over the counter with counter, customer and staff
visible; the trees read as single objects with no floating crown; there is no
four-edge vignette. The 24 goldens were regenerated in the pinned container.

**Roadside green strips** are now a purchasable surface (below), not
meaningless bands.

## Store

- **11 items · 4 categories** (Yeşillik, Tabela, Donanım, Mobilya), stages 1–3.
- Every `objectId` resolves in `WORLD_OBJECTS`, proven by test. The directive's
  billboard and directional sign have **no delivered art**, so they are prompt
  rows rather than cards nobody can render.
- **Purchase**: `BUY_PLACE {itemId, x, y}` — one indivisible transaction, no
  price in the command (cost is read from config at the tick it lands on).
- **Placement**: two zones. `roadside` items must stand within 6 m of the
  carriageway, and the rule follows the object through a move.
- **Movement**: identity, ownership and construction state preserved; no new
  scaffolding, no money moved.
- **Removal**: **30% refund** — ECONOMY_DESIGN §8 E5, which overrides the
  directive's 50% default by its own "unless" clause. A test asserts
  buy-place-remove _loses_ money, which is the arbitrage E5 exists to close.

### The reported bug

> buys hand-painted sign · pays · places it · but trash can / flower appears

**No id ever drifted.** `BuildMode` held its own catalogue and armed
`BUILDABLES[0]` = `planter` the tick build mode opened, behind a click surface
covering the whole viewport; the upgrade card the player pressed placed itself
at its authored anchor and never consulted the cursor. Two purchase surfaces,
one screen, one invisible.

Now there is one armed thing, it starts as nothing, and it belongs to the panel
that displays it. The catalogue id travels card → command → world → save.
Documented in [STAGE1_STORE_SYSTEM.md](STAGE1_STORE_SYSTEM.md).

## Products

- **13 products**, all named (they were behind a **three-entry** label map — ten
  rendered their raw id).
- Each card: picture, name, **preparation time from the field the kitchen counts
  down**, player price vs list price, margin over ingredient cost, ±50% band as
  numbers, and the stage a locked one needs.
- **Pricing is real.** `SET_PRICE` moves the number the conversion model reads;
  an e2e test sets a price, advances a tick, and reads it back **from the
  world**, then dispatches ₡9999 straight at the simulation to prove the clamp
  is the simulation's.
- The slider is 100 integer notches converting to a price. A range whose domain
  is the band lays a step lattice from `min` that `max` is not on — neither end
  of any band was reachable before.
- **Order cards**: countdown in simulation milliseconds ("18 sn" — 4× runs it
  four times faster, pause holds it), `ON_PASS` → "Hazır", `DELIVERED` →
  "Teslim edildi" (no longer "Yiyor" while food is still coming), and the
  order's value on the card.

**Not done:** prep times are unchanged. The directive asks for ~5 s drinks and
~30 s burgers; today they are 2.5 s and 9 s. Those numbers are calibrated
economy inputs — changing them moves every stage timing — so they belong with
the balance matrix (§26) that has not been run.

## Staff

**The complaint, measured** (Stage 1, seed 424242, 50 simulated minutes):

| Scenario                       | Served | Cash    | Cook state    |
| ------------------------------ | ------ | ------- | ------------- |
| player cooking, no cook        | 106    | ₡406.03 | —             |
| player cooking, cook hired     | 106    | ₡368.63 | **idle 100%** |
| cook hired, player not cooking | 99     | ₡340.59 | idle 97.7%    |
| neither                        | 0      | ₡0.00   | —             |

So it is worse than "not much to do": while the player is also cooking, a cook
adds **exactly nothing** to throughput and costs ₡37.40, because the player
takes every order the instant it is startable. What a cook is genuinely for is
row three — it keeps the stand earning at **93% of an always-clicking player**
while nobody is playing it, which is the light-idle model the game is built on.
The panel says that now rather than implying capacity it does not add.

**The root cause underneath**: `TaskBoardSystem.assign` marked _every_ employee
without a task as `BLOCKED`, under a comment claiming the state existed "so a
stand where nobody can do anything is distinguishable from a quiet one" — while
making those two identical. `blockedMs`, the counter any utilisation figure
would rest on, was counting quiet as obstruction. Now: no work of an accepted
kind anywhere is **IDLE**; such work claimed by somebody else is **BLOCKED**.

Panel: role, what it is for, hire cost beside running cost, four distinct state
sentences, and the measured share of the last minute spent working.

## Functional Buildings

**Not built, and the measurement above is why the design question is open.**

The directive lists Cola Machine, Burger Machine and Prep Counter as _early_
buildings whose effect is faster preparation and more kitchen throughput. At
Stage 1 a cook spends **2.3% of a session performing** — preparation is not the
constraint, demand is. A machine that makes preparation faster therefore cannot
move Stage 1's numbers, and shipping one would be an upgrade that reports
success while changing nothing, which §19 and §26 both forbid.

Building them where they _do_ bind means Stage 2+, which is a change to the
directive's own staging and touches the calibrated-stages boundary. **That is a
user decision, not one to make while implementing.**

## Traffic

The directive's §33 — "if one vehicle is parking, vehicles behind it wait, then
continue" — is **implemented, deterministic and covered**
(`tests/unit/sim/traffic/laneShadow.test.ts`: 2/5/10 followers queue behind a
turning body, never touch it, resume when it swings clear), and **ships dark**
behind `LANE_SHADOW_ENABLED = false`, exactly as the plan's §15 provides for.

It cannot pay for itself out of Stage 1's calibrated demand. At the band's
physical floor (1.9 m = 0.95 + 0.95, where two bodies touch):

- **Stage 2 arrives in 28.8 game-minutes against a calibrated ceiling of 22**;
- bay cycles fall to 957 of 1 000;
- the evening peak compresses to exactly 3.0× the trough where the assertion
  needs more than 3.0×.

The cause is the layby: it sits one lane width off the near carriageway and a
manoeuvre runs at 2.6 m/s, so **near-lane parking sweeps spend 62–85% of their
length — up to 5.9 s — genuinely inside the lane**. Absorbing that means
re-calibrating the one stage `CALIBRATED_STAGES` covers, which is the open
road/lot decision. Two escapes were tried and rejected with numbers: `AHEAD` at
3.0 m turns the suite green but is curve-fitting (2.0 m is far worse, 5 132
arrivals), and moving the layby 0.7 m south clears the corridor but starves the
road another way (1 656 arrivals).

Overlap, pass-through and reversing are all separately fixed and green
regardless of the flag.

## Assets

**Audit not run.** Store items were deliberately limited to objects that already
have art, so nothing new is required by what shipped. Coverage is unchanged and
green: **22 required · 22 present · 0 missing · 0 duplicate · 0 orphan** (308
prompt cards). Known gaps recorded rather than filled: roadside billboard,
directional sign, and per-level building art.

## Balance

`pnpm balance:check` **5/5 green** after every economy-touching change. The
cross-policy, cross-stage matrix of §26 was **not** run; nothing shipped changes
a calibrated input (store items are cosmetic, prices and prep times unchanged,
the lane shadow is dark).

## Browser Verification

Chromium e2e **109/109**, including four new store specs and two staff specs
that drive real cards, a real pointer and a real canvas. Visual goldens
**24/24** in the pinned container, byte-identical on the host. Live inspection
at seed 424242 confirmed the world composition and the panels.

**Not done:** the §32 viewport matrix (1920×1080 → 360×640), Firefox and WebKit.
The MCP browser tab has no `requestAnimationFrame`, so its HUD never
republishes — all interaction evidence here is Playwright's.

## Performance

Unchanged and within budget: bundle **491.72 kB gzip** (limit 550), 22 perf
budgets green, determinism suite **61/61**. No FPS number is claimed; none was
measured on real hardware this pass.

## Remaining Issues

1. 🔴 **Lane shadow is dark** pending the road/lot decision (above).
2. 🔴 **Functional buildings** need a staging decision before they can have an
   effect worth consuming (above).
3. 🟠 Prep times still 2.5 s / 9 s rather than the directive's ~5 s / ~30 s.
4. 🟠 Billboard, directional sign and per-level building art unprompted.
5. 🟠 Viewport matrix, Firefox and WebKit not run.

## Final State

🟡 **STAGE 1 PRODUCT EXPANSION PARTIAL**

Delivered and verified: the world composition, five traffic/world root-cause
fixes, the store with its identity chain, the product panel, the order-card
feedback, and the staff panel with the cook question answered by measurement.
Not delivered: functional buildings, the asset audit, the balance matrix and
the viewport matrix — two of them blocked on decisions this pass produced
evidence for rather than made.

**PLAYTEST = NOT RUN.**

P19 NOT STARTED
STOP — WAITING FOR USER REVIEW
