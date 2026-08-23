# STAGE 1 PRODUCT EXPANSION — EXECUTION PLAN

> 2026-08-22, branch `feat/stage1-product-expansion`, base `ce00284` (PR #21
> merged and live on production — the user's six 20:34 review captures under
> `docs/assets/` are taken against it). **No code precedes this plan.**

## 1. Current-state audit (what the repo actually holds)

Verified by source read + the six production captures:

| System         | State                                                                                                                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu / pricing | `menu.ts` already carries per-item `prepTimeMs`, `holdToleranceMs`, `stage`, `station`, `PRICE_BAND ±50%`; `SET_PRICE` clamps in the sim. The UI (`PricePanel`) is a bare slider list — no images, no prep time, no status (capture 2).                                                            |
| Kitchen        | `KitchenSystem` + `stations.ts`: one order per station, FIFO, finite pass (`PASS_CAPACITY` const), `startPrep` shared by MANUAL_PREP and cooks. Station `speed`/`quality` are static config.                                                                                                       |
| Staff          | One brain, task tables in `employees.ts` (cook ₡20, waiter ₡18, cleaner ₡14). `TaskBoardSystem` posts PREP/DELIVER/CLEAN. Cook genuinely works but Stage-1 demand leaves it idle most of the time; the panel (capture 3) is a bare list.                                                           |
| Delivery       | Stage 1 counter delivery is automatic, same-tick, by documented design ("Phase 10 replaces that one step").                                                                                                                                                                                        |
| Build UI       | One "İnşa Et" mode = upgrade tree (`ContextPanel`, auto-anchored purchases) + free-decor strip (`BuildMode`: Saksı/Çöp/Lamba) sharing the screen (capture 1). The store the directive wants does not exist.                                                                                        |
| Placement      | `placeObject/moveObject/removeObject` exist with grid snap + nav trial; decor is free; no zones, no refund, no move/remove UI.                                                                                                                                                                     |
| Construction   | `pendingBuilds` (schema v12) — timed sites, silhouette + bar, offline credit. Reusable as-is.                                                                                                                                                                                                      |
| Effects        | Data-driven kinds with consumers + an inertness test ("none silently inert"). No per-station-type speed kind, no pass-capacity kind.                                                                                                                                                               |
| Traffic        | IDM + gap clamp on-lane is overlap-proof (deterministic suite); the hole is the **transition**: a car that leaves for the layby stops being a lane member while its body is still on the carriageway, so followers accelerate through its rear (capture 5 shows the moment). Same shape at rejoin. |
| Vignette       | Four 6%-alpha edge bands (`layoutVignette`) — the exact "faint black border" the user wants gone.                                                                                                                                                                                                  |
| World          | Stand cluster at y=11 sits ~0.5 m behind the layby; parked pickups visually crowd the canopy (captures 1/4). Trees are split lower/upper quads stacked by measured height.                                                                                                                         |

## 2. User-requested features → classification

**Bugs (root-cause fixes):** maneuver-transition pass-through (33) · four-edge vignette (31) · stand crowded against layby (A) · tree crown/trunk seam if measured (B) · "sign becomes flower" — _diagnosis:_ not an id drift in the sim (PLACE stores `objectId` verbatim); it is the **mode conflation**: buying an upgrade card while the decor strip is armed leaves the next world-click placing the armed decor item. The store rebuild (D/E) removes the ambiguity, and a per-item identity test pins it forever.

**Missing features:** store panel with real cards (D) · placement zones + move/remove UI + 30% refund (F/G — ECONOMY_DESIGN E5 overrides the directive's 50% default, exactly as its "unless" clause provides: _"Yıkım maliyetin %30'unu iade eder, kâr edilemez"_) · product panel with images/prep/status + bounded pricing UI (H) · prep countdown + delivered/payment feedback on cards (I/J) · staff panel redesign with utilization (L) · functional leveled buildings (M–22) · roadside verge as a purchasable zone (C).

**Deferred (not GDD-approved — do not build):** petrol station, playground, staff housing, warehouse-as-supply (no ingredient system exists). Recorded as future GDD decisions, not silently dropped.

## 3. Existing systems reused (nothing rewritten)

`pendingBuilds` construction · `placeObject/moveObject/removeObject` · effect-kind machinery + inertness test pattern · `PRICE_BAND` + `SET_PRICE` · order store states · task board/brain · balance simulator + policies · prompt catalog pipeline (append via `assetRequirements.json` P309+) · save migration chain (v12→v13).

## 4. Architecture decisions

**D1 — Information architecture (Group 29).** Two doors, four surfaces, no
label collision: **İnşa Et** → tabs _Yükseltmeler_ (existing tree) and
_Mutfak & Tesisler_ (new functional buildings); **Dükkan** → tabs _Menü &
Fiyatlar_ (products) and _Dekor & Tabela_ (placeable store items). The decor
quick-strip dies; every placement starts from an explicit purchase card, so
the armed-tool ambiguity that produced "sign→flower" cannot exist.

**D2 — Identity chain (Group E).** Canonical id = `StoreItem.id` /
`Building.id`; each maps to exactly one `objectId` (world catalogue name) in
config. The purchase command carries the id end-to-end:
`BUY_PLACE {itemId, x, y}` validates stage/level/price/zone/nav, deducts,
places, queues the site — atomically in the sim. No array indexes anywhere.
A parametrised test buys every store item and every building and asserts the
rendered variant equals `worldObjectIndexOf(definition.objectId)`.

**D3 — Buildings = leveled placeable equipment (Groups M/18-22).** New
`src/config/buildings.ts`, GDD-backed ("İstasyon seviyesi I–III", automation,
"Depo / stok"): `cola-machine` (DRINK ×3 lv), `burger-machine` (GRILL ×3 lv),
`prep-counter` (PREP ×2 lv), `small-storage` (×2 lv). Levels gate by stage
(Lv1→S1, Lv2→S2, Lv3→S3). Effects are **new kinds with real consumers**:
`drinkStationSpeed`/`grillStationSpeed`/`prepStationSpeed` (scale, consumed
where `KitchenSystem` divides by station speed) and `passCapacity` (additive,
consumed at the pass-load gate). The existing kitchen upgrade rungs stay
untouched (calibrated); new kinds cannot double-dip old ones; the inertness
test extends to every new (building, level, kind).

**D4 — Placed-object levels (schema v13).** `PlacedObject` gains optional
`itemId` + `level`; `PendingBuild` gains optional `targetLevel`. Upgrade-in-
place: `UPGRADE_BUILDING {index}` re-queues a site on the same placed object;
completion bumps `level` (identity, position, ownership preserved). Frames
resolve per level (`assetByLevel`), falling back to the highest existing
frame with the gap prompted.

**D5 — Manual serve (Groups I/J/13).** GDD Stage 1 says "tıkla-hazırla,
tıkla-ver"; current code auto-delivers by design. Implemented as a measured
experiment exactly like the crossing-hold: stage-1, no-waiter counter orders
get a short auto-handover delay (config `COUNTER_HANDOVER_MS`) that the
card's «Teslim Et» click skips. Balance gate decides the delay's size (target:
green at 4 s; revert to 0 = today's behaviour if red, keeping the button as
an instant no-op accelerator). Either way the card gains states
Hazırlanıyor (with remaining seconds) → Hazır/Teslim → Teslim Edildi →
**+₡X.XX chip for ~2.5 s** driven by the PAYMENT event the bridge already
receives.

**D6 — Cook meaning (Group K).** Composite B+D+E, all measured: cook already
auto-preps (B); machines add parallel capacity that only staff can exploit —
the player can still only click one Hazırla at a time (D); cook prep applies
its skill speed curve, the player's manual prep does not (E — exists).
New: bridge exposes per-employee utilization (busy %, orders done, ₡
contribution) shown in the staff panel; balance run compares stage-1
cook-vs-no-cook with and without machines. No fake tasks.

**D7 — Traffic transition blocker (Group 33).** A vehicle in
ENTERING/EXITING state whose curve position still lies inside the carriageway
band casts a **lane shadow**: `orderByLane` inserts it (projected arc
position, real length) into its origin/target lane's bucket so IDM makes
followers brake behind it; the shadow lifts the tick its body clears the
band. Pure sim, deterministic, no new state (derived per tick). Tests: 2/5/10
followers behind an entering leader, gap ≥ 0 every tick; sedan/bus/truck/
motorcycle mix; browser scenario at the layby.

**D8 — Stand into the land (Group A).** The service cluster moves ~1.6 m
south (counter y 11→12.6), opening a real walkway band between layby back
(11.15) and the stand: road → parking → walkway → counter reads left-to-
right. Everything anchored to the counter (queue, waiting rows, stations,
statics, upgrade anchors, maneuver-independent) moves with it; flood-probe
re-run at all four stages; hashes/goldens regenerate once (tenth+1
REFERENCE bump with provenance).

**D9 — Vignette (31).** The four bands are deleted outright (the night/
weather tint stays — it is the environmental treatment, not a frame).

**D10 — Verge as product surface (Group C).** New placement zone
`roadside-verge` (the north/south verge bands + layby fringe); store items
that may live there: flower bed, planted box, advertising board (GDD
"Yol kenarı bilboard"), directional sign. Existing art covers beds/boxes
(bush/flower set); billboard + directional sign are new prompts.

## 5. Dependency graph → 6. Implementation order

```
W1 world geometry (stand shift + vignette + trees)     [invalidates hashes ONCE]
W2 traffic lane-shadow                                  [independent of W1 data-wise, after it to share the hash bump]
S1 store/buildings config + BUY_PLACE/UPGRADE_BUILDING/REMOVE-refund + zones + v13
S2 kitchen effect consumers (station speed, pass capacity) + inertness tests
S3 serve-delay experiment + order-card states/feedback (sim flags + bridge rows)
U1 Dükkan panel (products + decor tabs)   U2 İnşa Et panel (tree + buildings tabs)
U3 staff panel + utilization              U4 move/remove world interaction
A1 asset audit + prompts (P309+)          Q1 balance matrix   Q2 browser matrix   Q3 verify/e2e/goldens
```

Order: **W1 → W2 → S1 → S2 → S3 → U1..U4 → A1 → Q1..Q3**, commits at each
boundary. Rationale vs the directive's A–O: identical shape, with
construction integration (E) folded into S1 (it is one command's queueing)
and staff UI after sim metrics exist so the panel never lies.

## 7. Data model changes

New `store.ts`, `buildings.ts`, `placementZones.ts` configs; `PlacedObject` +`itemId?`+`level?`; `PendingBuild`+`targetLevel?`; new effect kinds ×4; new
commands `BUY_PLACE`, `UPGRADE_BUILDING`, `MANUAL_SERVE`; economy consts
`DEMOLISH_REFUND_FRACTION = 0.3` (E5), `COUNTER_HANDOVER_MS`.

## 8. Save-schema impact

v12→v13: layout.placed rows gain optional itemId/level; pendingBuilds gain
optional targetLevel. Migration fills neither (old decor has no store id —
rendered by objectId exactly as today). New fixture `save-v13.json` with a
leveled building mid-upgrade; chain tests +1 everywhere; hash sections
extend (placed level/itemId, pending targetLevel) → REFERENCE regeneration.

## 9. Asset requirements (initial estimate — final list from the A1 audit)

Buildings: cola machine lv1-3 (drink lv1 exists → +lv2,lv3), burger machine
lv1-3 (grill lv1/lv2 exist → +lv3), prep counter lv2 (pass/counter art
reuse for lv1), storage lv1-2 (+2). Store/roadside: flower bed, planted box
(existing bush set covers), advertising billboard, directional sign (+2-3).
UI: category icons (reuse ui_icon/upgrade set first). All appended as
`NEW_STAGE1_*` rows P309+ through `assetRequirements.json` → regenerated
catalog → coverage gate 0 missing/0 dupes. No new production placeholders:
missing level frames fall back to the nearest real frame **with the site
badge showing the true level**, and the gap prompted.

## 10. UI requirements

One shared card component family (image/name/price/status/lock-reason/
action) reused across all four surfaces, premium tokens only, no emoji
glyphs; statuses AVAILABLE/LOCKED(+reason)/OWNED/MAXED/UNDER CONSTRUCTION.

## 11. Simulation requirements

All purchases/effects/prices/serve resolve in `src/sim` from commands; UI
projects `SimView`/bridge rows only. Determinism preserved (no RNG/clock in
render; hash extended, not weakened).

## 12. Browser test plan

The directive's §32 matrix verbatim: store buy/place/move/remove/refund/
reload; product price → order → prep countdown → serve → +₡ chip; staff
hire/observe/fire; building buy → site → effect → upgrade → visual; traffic
2/5/10 queue-behind-parker; viewports 1920×1080 → 360×640 (geometric cover
rule + spot checks as in the correction pass).

## 13. Balance test plan

`pnpm balance:check` after every S-step; policy runs greedy/margin/
throughput/ROI/idle at stages 1–4; explicit stage-2/3/4 timing windows must
hold; new-building ROI positive but not dominant; price-band edges (0.5×,
1.5×) keep conversion/margin sane; serve-delay decided by gate evidence.

## 14. Regression risk

Highest: W1 geometry (nav/maneuvers/goldens/hashes) — mitigated by the
flood-probe + one-shot golden/REFERENCE regeneration; S3 serve delay
(calibration) — config-gated, gate-decided; v13 migration — fixture chain;
traffic shadow (throughput) — spawn/motion suites + balance gate.

## 15. Rollback strategy

Each W/S/U step is its own conventional commit on this branch; any step
reverts cleanly (`git revert <sha>`); serve-delay and lane-shadow are
config-gated (`COUNTER_HANDOVER_MS = 0`, shadow behind a constant) so
product-level rollback needs no code revert; the branch merges only through
PR with green CI, so main is never exposed mid-pass.

---

# CONTINUATION — decision-locked (2026-08-23)

The user closed both open decisions and added three UI references. This
section is the plan for the remaining scope; it precedes its first line of
code, like the one above.

## C1. Locked decisions

| #   | Decision                                                                                                   | Consequence for this plan                                             |
| --- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A   | Lane shadow **on** — but fix the geometry first, then rebalance. No constant-tuning.                       | The layby manoeuvre must leave the carriageway before the flag flips. |
| B   | Functional buildings **exist in Stage 1** — with real, consumed effects or converted to a real capability. | Effects must bind at Stage 1 or become capability/capacity unlocks.   |
| C   | Prep times calibrated toward 5 s drink / 30 s burger, balance-matrix first.                                | Targets are UX goals, not literals; deviation must be reported.       |
| D   | Stand inward is **not** accepted on a report's word — browser-audited, all dependents moved.               | Re-audit, then move what is still wrong.                              |
| E   | Three new UI references are authoritative.                                                                 | Audit them, then redesign dashboard/menu/staff.                       |

## C2. The measured geometry problem (why A is a geometry task)

Measured from the layout, not inferred:

```
carriageway            y = 1.50 .. 8.50
lane 0 (east, far)     y = 3.50   band 1.60 .. 5.40
lane 1 (west, near)    y = 6.50   band 4.60 .. 8.40
bays                   y = 9.40   parked body 8.45 .. 10.35
manoeuvre corridor     y = 7.80   <-- inside the carriageway
```

Two separate faults produce the 62–85% in-lane manoeuvre time:

1. **The corridor is on the road.** `CLEAR = 1.6` offsets the approach lane
   _toward_ the carriageway, putting it at y 7.8 — inside lane 1's band and
   inside the road itself.
2. **One turn-off point for four bays.** Every car leaves the lane at
   `lane.entryS` (x≈16) whatever bay it is going to, then crawls to it at
   2.6 m/s. Bays sit at x = 2.5, 7.5, 16.5, 21.5, so a westbound car bound
   for p4 travels **5.5 m backwards** at walking pace, and one bound for p1
   crawls 13.5 m. Exits do the same in reverse: everything merges at one
   `rejoinS`, up to 17.5 m from the bay.

**The fix is what a real driver does:** stay on the road at road speed until
you are beside your bay, then turn off; and rejoin just after it. Each
`(lane, bay)` pair gets its own turn-off arc and its own merge arc, so the
manoeuvre becomes a short lateral hop instead of a long parallel crawl. This
removes the backwards travel, shortens every curve, and collapses the in-band
time — without touching a tuning constant.

## C3. Order

```
G1  bay-proximate turn-off + per-bay merge (manoeuvre table + handover)
G2  corridor clear of the carriageway; flood-probe all four stages
G3  stand/dependents browser audit (Decision D), fix what is still wrong
G4  LANE_SHADOW_ENABLED = true; traffic matrix 2/5/10 x 4 archetypes
B1  balance matrix stages 1-4 x 5 policies  ->  STAGE1_4_BALANCE_CALIBRATION.md
B2  prep-time calibration toward 5 s / 30 s, reported BEFORE/TARGET/AFTER
F1  buildings.ts + effects with real consumers + levels + construction
F2  Insa Et panel tab; cook automation measured against the machines
U1  UI_REFERENCE_AUDIT.md new section from the three references
U2  dashboard, menu, staff redesign
V1  roadside verge items; billboard + directional sign prompts
V2  tree silhouette audit (code vs art)
A1  full asset audit + prompt catalogue expansion + coverage gate
Q1  browser matrix, viewports, Firefox, WebKit, perf, full verify
```

Geometry before economy, economy before features, features before chrome —
because each earlier step invalidates the measurements of the later ones.
