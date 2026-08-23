# COOK ⊗ PLAYER — the responsibility split

> Written 2026-08-23, from the player's report: _"hire a cook and the cook keeps
> the service flowing; the player spends too much time waiting."_
>
> Every number below was measured with the shipping simulation
> (`tests/integration/cookAutomation.test.ts`, seed 424242, four simulated
> hours unless stated). Nothing here is estimated.

---

## 1. What was actually wrong

Stage 1's service loop had exactly **one** player action, and automation bought
it outright.

```
customer queues → orders → ORDER_PLACED
                              ↓  MANUAL_PREP        ← the player's only verb
                           COOKING
                              ↓  KitchenSystem
                           ON_PASS
                              ↓  ServiceSystem.deliver()   ← automatic, same tick
                           DELIVERED → EATING → PAYING
```

`ServiceSystem.deliver()` handed the whole tray over on the tick it reached the
pass, at any stage with no tables. So the player's contribution was `MANUAL_PREP`
and nothing else, and a ₡20 cook took `PREP_ORDER` off the board. After one hire
the loop ran end to end with the player watching.

Two other things fell out of the same line, and both were already recorded as
defects nobody had connected to it:

- **PHASE_8_REPORT §6**: food sat on the pass for **zero ticks out of 24 000**.
  The pass plate indicator, the cooler upgrade and the whole hold-temperature
  model were decorating an event with no duration.
- **STAGE1_STAFF_SYSTEM §2**: a cook beside an attentive player runs at **<2%**
  utilisation and adds nothing but wages, because `MANUAL_PREP` empties the
  board before `TaskBoardSystem` can post to it.

## 2. What was NOT wrong

The cook is not overpowered and does not need nerfing. Measured at Stage 1 with
nobody at the controls, before any change: 487 served, ₡2526, 4% utilisation.
That is the light-idle model working as designed. The problem is not that the
cook does too much; it is that the **game asked the player for too little**.

---

## 3. The five candidates

The directive names five. Each is judged against the measurement that decides
it, not against taste.

### A · Cook prepares only; nobody covers the counter

The purest split: the pass is the player's station, full stop.

| Stage 1, 4 h        | served | revenue | note                      |
| ------------------- | -----: | ------: | ------------------------- |
| player cooks+serves |    492 |   ₡2555 | the manual baseline       |
| player cooks only   |  **0** |  **₡0** | 267 abandoned, 268 wasted |
| nobody at all       |      0 |      ₡0 | 267 abandoned             |

**Rejected.** Row two is what A does to an unattended stand: everything cooked,
nothing served, every plate binned. It is not "light idle", it is a job with a
punch clock, and it breaks `employeeLifecycle`'s standing claim that a cook
earns with nobody touching the controls.

### B · Cook prepares **and** serves, immediately

This is what shipped before, expressed as a policy rather than an accident.

| Stage 1, 4 h   | served | revenue |      cook utilisation |
| -------------- | -----: | ------: | --------------------: |
| player absent  |    487 |   ₡2526 |                   ~4% |
| player serving |      — |       — | no difference to make |

**Rejected.** It is the complaint. There is no action left to take, so presence
is worth exactly zero and the player is an observer with a wallet.

### C · Cook prepares; the player serves; the cook covers after a window ★

The shipped model. A finished tray waits at the pass for
`COUNTER_HANDOVER_MS = 4 000 ms`. Inside the window it is the player's to hand
over (`SERVE_ORDER`); past it, a cook takes it as a fallback task.

Measured (cook hired in **every** row — this is not automation versus none, it
is what is left to do once automation is bought):

| Scenario                      | served | revenue | abandoned | wasted | cook busy | player commands |
| ----------------------------- | -----: | ------: | --------: | -----: | --------: | --------------: |
| **S1** cook, player absent    |    467 |   ₡2426 |         0 |      0 |     4.09% |               0 |
| **S1** cook, player serves    |    489 |   ₡2548 |         0 |      0 |     2.41% |         288 000 |
| **S1** cook, player does both |    492 |   ₡2555 |         0 |      0 |     0.03% |         576 000 |
| **S2** cook, player absent    |    370 |   ₡3864 |         3 |      4 |    10.06% |               0 |
| **S2** cook, player serves    |    542 |   ₡5690 |         4 |      4 |    13.01% |         288 000 |
| **S2** cook, player does both |    537 |   ₡5635 |         3 |      2 |     2.11% |         576 000 |

Three things come out of that table, and they are the reasons this is the
chosen model:

1. **Presence is worth something, and worth more as the stand grows.**
   Stage 1 +4.7% served; Stage 2 **+46% served, +47% revenue**. The gradient is
   the right way round: an idle game where the player matters less over time is
   an idle game that ends.
2. **The unattended stand still runs.** ₡2426 at Stage 1 and ₡3864 at Stage 2
   with nobody playing. Lower than an attended one, which is the point.
3. **Delegating beats clicking everything.** Serve-only outperforms
   cook-and-serve at Stage 2 (542 against 537) while keeping the cook six times
   busier (13.0% against 2.1%). The optimal play is to let the cook cook and
   take the counter yourself, which is precisely the split the design intends —
   arrived at by the simulation rather than instructed by the UI.

### D · Cook prepares; the player handles customer requests

Special orders, complaints, a request queue. **Rejected as out of scope, not on
merit.** Nothing in the simulation models a request today; building one is a
new system, a new save field and a new balance surface — a roadmap change
request, not a correction pass. It is a reasonable Stage 3 idea and is recorded
here rather than dropped.

### E · Cook prepares; the player manages kitchen capacity

**Rejected on measurement.** Kitchen occupancy at Stage 1 is **2.1–10.0%**
across every stage, policy and seed (STAGE1_CONTINUATION_REPORT §1B). There is
no capacity to manage: a station-assignment interface would be a panel of
controls over a bottleneck that does not exist, which is the definition of a
fake task.

---

## 4. The split, stated

| Actor       | Owns                                                                                                                  | Never, or only as cover                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Cook**    | `PREP_ORDER` — takes placed orders to a free station.                                                                 | Any delivery, until it has gone begging for 4 s.       |
| **Waiter**  | `DELIVER_ORDER` at a stage **with tables** — the walk from the pass to a seated customer, on sight.                   | Cooking. The counter handover before the window.       |
| **Cleaner** | `CLEAN_TABLE`.                                                                                                        | Anything in the service or kitchen chain.              |
| **Player**  | The counter handover and its **priority**. Pricing, purchases, hiring, building, placement, upgrades, when to evolve. | The dining room — a seated customer's food is carried. |

One `DELIVER_ORDER` means two different jobs and the stage decides which:

- **Table service** (stage has tables) — the waiter's own work, claimed the
  instant it is posted. Unchanged; this is what the ₡18 buys from Stage 3. The
  player has no button for it: a seated customer is across the room, the walk is
  the point, and `nextServable` returns -1 there so the card shows what the
  order is worth instead of an action that would refuse.
- **The counter handover** (stage has no tables) — the tray is being passed to
  somebody standing right at it. The player's station. **Every** role waits
  `COUNTER_HANDOVER_MS` before covering it, waiters included, so hiring a waiter
  early buys cover rather than the loop.

A cook may cover a _table_ delivery too, but only after the same window. That
is not the waiter's job leaking: it is what stops a diner with a cook and no
waiter from silently ceasing to serve anyone, and it costs the cook their place
in the kitchen while they walk. A waiter is instant, faster on foot and on a
lower wage, which is the whole argument for hiring one.

`TaskBoardSystem.mayClaimTask` is that rule, and `cookAutomation.test.ts` asks
it directly at all four stages — before and after the window — rather than
hoping a thirty-minute run happens to exercise the case.

**This was found in the browser, not designed on paper.** The first version let
the player serve at any stage, and `tableService.spec.ts` went red: at Stage 3
the player's handover caught customers while they were still at the counter, so
nobody ever walked to a table and the whole seating mechanic silently stopped
happening.

## 5. Why four seconds

The window is the player's, and its length is the only free parameter.

| Window | What it does                                                                                     |
| -----: | ------------------------------------------------------------------------------------------------ |
|    0 s | model B. Serving is a button that races the simulation and always loses.                         |
|    4 s | **shipped.** Slightly longer than a lemonade's whole preparation (5.0 s), so acting is worth it. |
|      ∞ | model A. An unattended stand bins everything.                                                    |

Four seconds is bounded above by the two clocks it sits between: customer
patience while `WAITING_FOR_FOOD`, and the shortest `holdToleranceMs` on the
menu (45 s for the hot dog). At 4 s plus one walk, an unattended tray is
delivered inside ~8 s — well under both, which is why the absent-player rows
above lose throughput rather than customers. It is a **throughput** cost, not a
punishment.

## 6. What the player sees

- The order card gains **"Servis et · +₡x,xx"** in `ON_PASS`, in the same place
  and shape as "Hazırla" in `PLACED`. The gesture the player already learned
  continues into the one they have not, and it carries the money because what
  serving is worth is the reason to press it.
- The staff panel answers **"Aşçı ne yapar?"** with four lines, two of them
  negative:

  ```
  AŞÇI                                            ₡20
  Siparişleri kendi hazırlar. Sen tezgâhta
  değilken servisi de ayakta tutar.
  ✓ Mutfağı yönetir, siparişleri hazırlar
  ✓ Sen yokken tezgâhı da devralır (4 sn sonra)
  ✕ Servisi senin yerine üstlenmez
  ✕ Fiyat, satın alma ve yerleşim kararı vermez
  ```

  `tests/unit/ui/roleDuties.test.ts` checks each of those claims against the
  role table and the window constant, so the panel cannot drift into selling
  automation the simulation does not perform.

## 7. The honest cost

**A player who cooks and never serves now earns nothing.** Measured: 0 served,
267 abandoned, 268 wasted over four hours. Before this pass, cooking alone was
the whole loop. That is a real learning cliff at minute one, and the mitigation
is the affordance rather than a safety net — the ready card is a green button
where the amber one was, and doing nothing at all still costs exactly what doing
nothing has always cost.

It is recorded here rather than smoothed away, because the alternative — having
the stand hand the tray over by itself when nobody is employed — would make
serving optional again, and optional is where this started.

## 8. Related

- [`STAGE1_STAFF_SYSTEM.md`](STAGE1_STAFF_SYSTEM.md) — the roles, wages and the
  `busy01` measurement trap.
- [`STAGE1_UI_FINAL_CORRECTION_REPORT.md`](STAGE1_UI_FINAL_CORRECTION_REPORT.md)
  — this pass's report, with the browser evidence.
- `tests/integration/cookAutomation.test.ts` — every number above.
