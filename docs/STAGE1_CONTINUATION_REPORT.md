# STAGE-1 CONTINUATION — FINAL REPORT

> Branch `feat/stage1-product-expansion`. The user's **decision-locked
> continuation** directive, five decisions A–E.
> Plan written before any code: `46635db`.
> Commits: `af43973` · `6dd7d49` · `d17db82` · `f699478` · `2f77004`.
>
> Categories below are separated as the directive requires. A thing is under
> **VERIFIED** only if a command was run and its output read; everything else
> is under **NOT RUN** with the reason.

---

## 1. IMPLEMENTED

### A · Parking geometry, then lane shadows

The directive was explicit: _"Do not curve-fit the timing by changing
arbitrary constants. The physical world must become correct first."_

Two physical faults were measured, not guessed:

1. The pedestrian corridor sat at y 7.8 while the carriageway ends at 8.50 —
   inside the road.
2. **One shared turn-off served all four bays**, producing crawls of up to
   13.5 m, 5.5 m of it backwards.

Fixed with a bay-proximate turn-off (`entryS` / `rejoinS` per bay,
`TURN_LEAD_METRES = 9`) and a bay-line corridor cut. `considerHandover` now
assigns the bay at the mouth but keeps the car ON_ROAD until it reaches its own
turn-off.

| Measurement                  | Before | After      |
| ---------------------------- | ------ | ---------- |
| Worst in-band manoeuvre time | 5.9 s  | **3.4 s**  |
| Total in-band arc            | ~130 m | **75.9 m** |

That is what paid for `LANE_SHADOW_ENABLED = true`. **This closes recorded
user-decision #6**, which said the mechanism would stay dark because Stage 1
could not afford it.

### B · Two functional buildings

Four authorised; **two shipped, two deferred, both on measurement.**

Kitchen occupancy is **2.1–10.0%** across every stage, policy and seed. So
Prep Counter duplicates the `second-prep-station` upgrade already sold at ₡10
(same bench art), and Small Storage has no consumer to bind to. Shipping either
would have been a purchase that reports success and changes nothing.

What shipped binds: `drinkStationSpeed` and `grillStationSpeed`, consumed in
`KitchenSystem.stationSpeed`, spelled as literals so the inertness test sees
them. Full design: [`STAGE1_BUILDING_SYSTEM.md`](STAGE1_BUILDING_SYSTEM.md).

### E · Three surfaces rebuilt, and the root cause underneath

The three reference images were **located and opened**, not recalled.
[`UI_REFERENCE_AUDIT.md`](UI_REFERENCE_AUDIT.md)
§`STAGE1_PRODUCT_EXPANSION_REFERENCES` documents all twelve aspects the
directive lists, then E.6 records what was deliberately not copied.

The redesign found its own reason for existing. Every reference is built on one
distinction — a label is dimmer than its value — and ours did not have it.
`tokens.css` aliased three ramp steps the locked palette does not contain
(`steel-600`, `amber-600`, `neutral-500`; the ramps are 900/700/500/300, and
neutral is 900/600/300/050). A custom property referencing an undefined custom
property becomes the _guaranteed-invalid value_ and every declaration built on
it is dropped silently at computed-value time.

Measured in Chromium against the preview build, **before** the fix:

| Token             | Consequence                                          |
| ----------------- | ---------------------------------------------------- |
| `--edge`          | `--border` invalid → **16 components at `0px none`** |
| `--ink-dim`       | inherited → **8 components painted labels white**    |
| `--accent-strong` | gradient invalid → **XP bar fill painted `none`**    |
| `--text-md`       | the 380 px type step dropped                         |

`getComputedStyle` returned `rgb(255,255,255)` for both a stat's label and its
value. A visual golden could not have caught it — the goldens were recorded
from the same broken cascade and agreed with it.

### Defects found and fixed while auditing

- **`ContextPanel` kept its own icon map**, described as mirroring the config.
  It did not: **8 upgrades rendered no icon**, 8 keys matched no upgrade, and
  `better-ingredients` drew the badge while its definition names the crates.
- **The Turkish names existed in three copies.** The build panel printed a raw
  id for 8 upgrades; the objective card — which headlines _what to do next_ —
  could name 9 of 30; and 5 upgrades had two different names at once
  (`staff-room` was both "Personel odası" and "Dinlenme odası"). Nothing failed,
  because every lookup ended in `?? id` and a raw id renders perfectly well.
- **`TaskBoardSystem.placeOf`** carried a branch returning the order's own
  station under a comment about not making employees look aimless.
  `Order.station` is `-1` until `startPrep` assigns it and the task is posted
  before that, so it could never run. Removed with the parameter it threaded
  through two functions; determinism 61/61 unchanged, which is the proof.
- **Four of five comment blocks** above `stage1.ts`'s `parking` described
  geometry that no longer exists. Consolidated; every figure re-measured.
- **The order stack covered every speed control.** Found in the browser on the
  last pass over the finished UI: the stack and the rail both sit at
  `left: var(--space-3)` with the same `z-index`, and the stack grows downward
  with the queue. At five queued orders `document.elementFromPoint` at the
  centre of **pause, 1×, 2× and 4×** all returned an `order-card` — the player
  could not pause the game at exactly the moment they would want to. The two
  now derive their columns from one shared `--speed-rail-width`, and
  `tests/e2e/hudOverlap.spec.ts` hit-tests every control against a full queue.
  Verified to fail on the old layout before being trusted on the new one.

---

## 2. VERIFIED

| What                       | Result                           | Command                       |
| -------------------------- | -------------------------------- | ----------------------------- |
| Full gate                  | **exit 0**                       | `pnpm verify`                 |
| Unit + integration         | **1663 passed**                  | `pnpm test:coverage`          |
| Determinism                | **61/61**                        | `pnpm test:determinism`       |
| Balance gate               | **5 passed, 1 skipped**          | `pnpm balance:check`          |
| Sim bench                  | **22/22**                        | `pnpm bench:sim`              |
| Chromium + Firefox e2e     | **exit 0** · 226 passed          | `pnpm e2e`                    |
| Visual goldens (container) | **24/24**                        | `pnpm test:visual:update`     |
| Visual goldens (host)      | **18/18**, 6 container-canonical | `pnpm test:visual`            |
| Prompt coverage            | **missing 0 · dup 0 · orphan 0** | `pnpm assets:prompt-coverage` |
| Bundle                     | **497.39 / 550 kB** gzip         | `pnpm size`                   |
| CSS                        | **8.94 / 30 kB** gzip            | `pnpm size`                   |

### Decision D — verified rather than asserted

The directive said this is _"NOT considered complete merely because a report
mentions it"_. So it was checked against the geometry:

The counter is at y 12.6, moved 1.6 m inward, and the dependents moved with it
— awning +1.6, sign +1.6, serving spots +1.4, bin +1.4, and the queue **graded**
1.6 down to 0.2 so its tail stays on the road, which is deliberate: slots past
`queueCapacity` are how an overwhelmed stand is made visible to the drivers it
is losing, and a rigid translation would have deleted the economy's only
negative feedback loop.

`navigationIntact` was used everywhere to judge a _placement_ and nothing had
ever asked it about the layouts themselves.
`tests/unit/sim/layout/standReachability.test.ts` now does, **at all four
stages**, on a bare lot, plus the walkway measured from the grid and the queue
head/tail invariants. 11 tests, all passing.

### Browser verification (Chromium, live)

Driven through the real browser at `localhost:4173`, seed 424242:

- Dashboard renders all three bands; `--border`, `--ink-dim`, `--accent-strong`
  now resolve (`1px solid #525c6a`, `#8892a0`, `#d98a16`), the XP gradient
  paints, and label/value are distinct colours where they were both white.
- Menu panel renders the 3-across grid with the reference's card. The `+`
  stepper moved lemonade **₡4,05 → ₡4,25**, markup **+0% → +5%**, profit
  **₡2,97 → ₡3,17** — a real `SET_PRICE`, not a cosmetic slider.
- Staff panel renders portrait tiles, names, blue roles, wages, busy share and
  state pills; three hires at ₡0,72 / ₡0,65 / ₡0,52 per minute, payroll ₡1,89.
- Prep times read from the calibration: Limonata 5,0 sn · Sosisli 6,5 sn ·
  Cips 3,0 sn · Hamburger 30,0 sn.

### Viewport matrix — measured, no budget moved

The union of everything that paints, over the viewport (GDD §14.1: 22% desktop,
28% mobile):

| Viewport               | Share | Cap |     |
| ---------------------- | ----: | --: | --- |
| 1920 × 1080 desktop    |  8.2% | 22% | ✅  |
| 1280 × 720 laptop      | 18.4% | 22% | ✅  |
| 1024 × 768 tablet-land | 20.1% | 22% | ✅  |
| 768 × 1024 tablet-port | 16.9% | 28% | ✅  |
| 667 × 375 phone-land   | 21.1% | 28% | ✅  |
| 375 × 667 phone-port   | 25.0% | 28% | ✅  |
| 360 × 640 android      | 26.5% | 28% | ✅  |

The full three-band dashboard first measured **32.5%** at 360 × 640. On phone
breakpoints the day strip now folds behind the `i` that was already there to
explain it. **No threshold was moved**; the design changed.

---

## 3. CALIBRATED

Both of the directive's UX anchors are hit **exactly**:

| Item      | Requested    | Final                                   |
| --------- | ------------ | --------------------------------------- |
| lemonade  | drink ≈ 5 s  | **5.0 s**                               |
| cola      | drink ≈ 5 s  | **5.0 s**                               |
| hamburger | burger ≈30 s | **30.0 s**                              |
| pizza     | ≈ 30 s       | not on the menu — recorded, not dropped |

One deviation: **hotdog 6.5 s**, and it is measured. Holding lemonade at its
anchor, `stageTransitionPacing` reads 23.71 min at 7.0 s and 18.01 min at
6.5 s against a 22-minute ceiling. Chips move it 0.17 min across half a second;
shortening the drink below its anchor does not help. The hot dog has no anchor
in the directive, so it took the deviation.

Stage 2 lands at **15.5–19.2 min** against its 10–22 window, asserted and
passing with margin.

**The honest cost:** Stages 3 and 4 ended _worse_ than baseline — S3 ~60–66 →
**64–75**, S4 ~306–320 → **351–377** — and both are outside their design
windows. Both are `⊘ not evaluable` in the gate and have been since ADR-016,
because stages 2–4's income has never had a calibration pass. That boundary is
pre-existing; this pass moved the numbers further out, and
[`STAGE1_4_BALANCE_CALIBRATION.md`](STAGE1_4_BALANCE_CALIBRATION.md) §6 says so
in those words.

### What automation is worth (directive §14)

Per-tick sampling, never through the bridge —
[`STAGE1_STAFF_SYSTEM.md`](STAGE1_STAFF_SYSTEM.md) §3 explains why.

| Scenario                      | Clicks | Cook utilisation |
| ----------------------------- | -----: | ---------------: |
| Cook hired, player absent     |  **0** |              ~4% |
| Cook hired, player also cooks | 36 000 |             < 2% |

Machines, four simulated hours, one cook, player absent:

| Stage | Setup       | Served | Revenue | Abandoned | Wasted |
| ----- | ----------- | -----: | ------: | --------: | -----: |
| 1     | bare        |    487 |   ₡2526 |         0 |      1 |
| 1     | machines L1 |    490 |   ₡2545 |         0 |      1 |
| 2     | bare        |    527 |   ₡5511 |         4 |     10 |
| 2     | machines L1 |    545 |   ₡5780 |         2 |      5 |
| 2     | machines L2 |    554 |   ₡5890 |     **0** |  **0** |

Stage 1 has no queue, so faster preparation cannot become many more customers
there. Stage 2 is where the equipment pays, and it pays by removing the
abandonment entirely.

### Performance — real GPU, foreground tab

[`PERF_LOG.md`](PERF_LOG.md) carried this measurement as **not taken** in two
successive passes, the last of which handed it to the user. It is taken now.

| Scene                                          |   FPS | p95 frame |
| ---------------------------------------------- | ----: | --------: |
| Stage 1, live                                  | 122.3 |    8.6 ms |
| Stage 4, quiet lot, 4×                         | 122.7 |    8.5 ms |
| Stage 4, 13 vehicles · 9 customers · 31 orders | 120.9 |    8.8 ms |

Budget is p95 ≤ 16.6 ms; 0 dropped ticks. These are the display's vsync cap
rather than a ceiling — what they establish is that nothing in this pass costs
a frame.

---

## 4. EXTERNAL ASSET REQUIRED

Five items, each filed with the measurement that justifies it. All are
generated into the catalogue from `assetRequirements.json`; coverage stays
0 missing / 0 duplicate / 0 orphan.

| Prompt       | File                               | Why                                                         |
| ------------ | ---------------------------------- | ----------------------------------------------------------- |
| **P309**     | `nature_tree_broadleaf-01_lower`   | delivered `_lower` is a **complete tree**, not a lower half |
| **P310**     | `nature_tree_broadleaf-01_upper`   | delivered `_upper` is a free-floating canopy, painted apart |
| **P291–293** | `ui_icon_role-cleaner/cook/waiter` | ~120 px **scenes** where the brief said single glyph        |

`sprites.ts` claimed P309/P310 were already prompted, under a marker
(`NEW_STAGE1_WORLD`) that did not exist either. They exist now.

The role icons were measured by cropping them out of `ui.webp` and rendering
at the 38 px the staff panel draws: only the cook survives, on the toque's
silhouette; the other two collapse into a grey-white blob and a blue-yellow
blob. The panel meanwhile distinguishes them with a **role-tinted tile** —
a fix for the legibility problem, not a substitute for the art.

Reconstructing the other two split pairs the same way says **`broadleaf-02`
and `conifer-01` both compose into one coherent tree**, so this is one bad pair
rather than a fault in the split rule.

---

## 5. DEFERRED

| Item                                     | Why                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| **Prep Counter** building                | duplicates `second-prep-station` at ₡10; same effect, same art                        |
| **Small Storage** building               | no consumer; kitchen 2–10% busy, a bigger pass changes no number                      |
| Roadside verge: wooden planter box       | no art. Two of the four verge items **already ship**                                  |
| Roadside verge: directional sign         | no art                                                                                |
| `getFrameStats()` returning `samples: 0` | in-app instrument is not recording; rAF measurement unaffected                        |
| `iconKey` → world object for 13 upgrades | `placeholder: ''` means they place nothing while `worldChange` says something appears |

On the **verge**: the directive names flower bed, planted box, advertising
billboard and directional sign. Two of the four are already purchasable —
`flower-bed` (₡6, the stone-bordered bed) and `roadside-sign` (₡12, which _is_
the illuminated billboard, `struct_sign_large_lower/_upper`). `zone: 'lot'` is
unrestricted, so lot items may already stand on the verge. The other two have
no art, and shipping a store card that draws a placeholder would break
"REAL ASSET > PLACEHOLDER". **Prompts were not written for these two either** —
see §7.

---

## 6. NOT RUN

| What                                | Why                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WebKit smoke (`pnpm e2e:smoke`)** | **FAILS TO LAUNCH on this host.** `browserType.launch: Host system is missing dependencies` — `libevent-2.1-7t64`. Needs `sudo apt-get install libevent-2.1-7t64` or the pinned container. **2 failed, 1 passed** — an environment failure, not a code failure, and reported as NOT RUN rather than as a pass. |
| Human playtests                     | Not fabricated. `PLAYTEST_PROTOCOL.md` needs people.                                                                                                                                                                                                                                                           |
| Stage 3/4 income calibration        | `CALIBRATED_STAGES = [1]`; that is the pre-existing ADR-016 boundary and a user decision, not implementation work.                                                                                                                                                                                             |

> A near-miss worth recording: the background task runner reported the WebKit
> run as "exit code 0" because the command was piped through `tail`, and the
> pipeline's exit code is `tail`'s. Re-running it directly gave exit 1. The
> suite was almost reported as passing.

---

## 7. BLOCKED — waiting on the user

1. 🔴 **Road / plot structure** — the S4 capacity block.
   `STAGE_2_4_CALIBRATION_REPORT.md` §4 has the menu. The lane-shadow budget
   has **left** this list: Decision A paid for it physically.
2. 🔴 **GDD §8 ⊗ §6.1** — S2's `CALIBRATED_STAGES` membership. This pass moved
   S3/S4 further outside their windows.
3. 🟠 **Verge items 3 and 4** — should a wooden planter box and a directional
   sign be produced at all? They are not in the delivered set and are not
   obviously distinct from `flower-bed` and `roadside-sign`. Writing prompts
   for art nobody has decided to make would add two permanent rows to the
   requirements matrix on my own authority.
4. 🟠 **S7 i18n** · **perf backstop 5 → 8 ms** · **external production**
   (23 audio + 1 OFL font + the visual items, now +5).

---

## 8. FINAL STATE

```
Decision A  ✅  lane shadows on, paid for physically
Decision B  ✅  two buildings, two deferred, all four on measurement
Decision C  ✅  both anchors exact, one measured deviation, cost stated
Decision D  ✅  verified at four stages, not taken from a report
Decision E  ✅  three surfaces rebuilt, root cause found and gated
```

`pnpm verify` exit 0 · 1663 tests · determinism 61/61 · balance 5/5 ·
Chromium + Firefox e2e exit 0 (226 passed, 113 per browser) ·
goldens 24/24 container, 18/18 host · prompt coverage 0/0/0 ·
WebKit smoke **NOT RUN** (host missing `libevent-2.1-7t64`).

---

# P19 NOT STARTED / STOP — WAITING FOR USER REVIEW
