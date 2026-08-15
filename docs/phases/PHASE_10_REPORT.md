# PHASE 10 REPORT — Employee AI

**Phase:** 10 — the player becomes a manager
**Date:** 2026-08-15
**Result:** ✅ **PASS (technical)** — 1 131 tests, 104 E2E, 11 goldens, all budgets met
**Branch:** `phase/8-service-loop` (batch branch — P8, P9 and P10 ship together)

---

## 1. Result, stated plainly

You can hire a cook, and then stop clicking. Measured over twenty minutes on the
same seed: **29 customers served by an attentive human clicking every tick, 30
served by one cook while nobody touched the controls.**

1 131 tests pass. 104 E2E across Chromium and Firefox. `pnpm verify` is clean end
to end, no threshold was moved, and the save schema is at **v7** with a chained
migration and a committed fixture carrying a real payroll.

**Four things that are not good news, and are not buried:**

- The cook is **BLOCKED 98% of the shift**. Stage 1 does not have enough work for
  one employee, let alone eight. §7.
- The waiter and the cleaner are implemented, tested, and **have nothing to do**.
  That is the roadmap's own scope decision, and it means two of the three roles
  are unexercised by anything but tests. §6.
- A `Set` in the task board cost **123 B/tick against a 32 B budget** and made a
  populated tick 44% slower. Both were the same object. §8.
- The roadmap's closing question — do they look like workers with intent, or like
  tokens sliding on a board — is a **visual judgement that was not made**. §9.

---

## 2. What was built

| Piece               | Where                                 | What it does                                             |
| ------------------- | ------------------------------------- | -------------------------------------------------------- |
| `EmployeeBrain`     | `src/sim/ai/EmployeeBrain.ts`         | **One** FSM: IDLE / MOVING / PERFORMING / BLOCKED        |
| Role task tables    | `src/config/employees.ts`             | Data. Cook, waiter, cleaner; which tasks, how fast       |
| `TaskBoardSystem`   | `src/sim/systems/`                    | Central scoring, claiming, cancellation                  |
| `EmployeeFsmSystem` | `src/sim/systems/`                    | Walking, working, wages                                  |
| `StaffSystem`       | `src/sim/systems/`                    | `HIRE` and `FIRE`, validated in the simulation           |
| `TaskStore`         | `src/sim/stores/`                     | Pooled tasks with a two-sided claim                      |
| Wages               | `src/config/economy/wages.ts`         | Continuous drain, batched settlement, three-minute grace |
| Save schema **v7**  | `src/persistence/migrations.ts`       | The payroll, with a v6→v7 migration                      |
| Staff panel         | `src/ui/components/StaffPanel.svelte` | List, role, skill, wage, hire, fire                      |
| Task icons          | `src/ui/components/StaffIcons.svelte` | What each employee is doing, over their head             |

### 2.1 One brain, and why it is not four

The roadmap is unusually direct: _"Do not write four state machines."_ The reason
it gives is that the state machine gets tested once and every role inherits the
guarantee. The reason that turned out to matter more is narrower: **there is
exactly one place in the codebase that writes an employee position**, and that is
the whole of the no-teleport guarantee. Four machines would mean four places, and
the fourth is written last, by someone who has stopped reading the first three.

A role is `{tasks, baseSpeedMps, baseWagePerMinute, hireCost, skillSpeedGain}`.
Adding a barista in Phase 13 is an entry in a config file.

---

## 3. No teleporting — the hard requirement

`tests/unit/sim/employees/noTeleport.test.ts`. Four employees at four different
skills, thirty simulated minutes, **every position recorded every tick**, and
every step checked against `walkSpeed(role, skill) × TICK_MS × 1.001`.

Three cases, because the interesting failures are not the obvious one:

1. **The long shift.** Thousands of steps, none over the bound.
2. **The impossible target.** A destination at the far corner of the world,
   stepped once — the bound holds.
3. **The last step of a walk.** A leg shorter than one step must be _walked_, not
   snapped to. Snapping is a teleport of up to a full step on **every single
   arrival**, small enough to look like nothing.

The tolerance is 1.001 and that number is deliberate: floating-point accumulation
over tens of thousands of ticks makes an exact bound flake, and a bound that
flakes gets loosened until it means nothing. A thousandth of a millimetre catches
a teleport — which is metres.

---

## 4. The task board

`score = urgency × reward − distance × cost`, with `urgency = 1 + min(3, ageSeconds
× 0.05)`. Weights in config, because the roadmap names "the TaskBoard making bad
decisions" as a Phase 10 risk and says the mitigation is that the function is
tunable.

**Two employees can never claim the same task**, and the test tries to construct
the failure rather than observing its absence: one piece of work, four idle
cooks, all equally close. A per-employee "look for the best task" sends all four.
Exactly one claims it.

Every claim is recorded on **both** sides — `task.claimedBy` and
`employee.taskSlot` — and that redundancy is what makes a half-completed
cancellation _detectable_ rather than merely unlikely. `assertBoardConsistent`
walks both directions and runs after every scenario in the suite.

### 4.1 Cancellation, from either end

| Trigger                  | Path                     | What happens                              |
| ------------------------ | ------------------------ | ----------------------------------------- |
| Employee fired mid-task  | `releaseEmployeeTask`    | Task goes back **unclaimed**, not deleted |
| Order discarded mid-walk | `releaseTask` via retire | Employee returns to IDLE                  |
| Task became impossible   | `releaseEmployeeTask`    | Work is retried rather than dropped       |

Firing does not delete the work. The order still needs cooking, and the next idle
cook should pick it up rather than wait for it to be reposted — tested, including
firing the entire staff mid-task and asserting the world keeps running.

---

## 5. Wages

Accrued **per tick, exactly**, including partial minutes; _settled_ every five
seconds, because cash is a number the player watches and one that moved twenty
times a second would be unreadable.

| Rule                               | Test                                               |
| ---------------------------------- | -------------------------------------------------- |
| Cash never below zero              | Max payroll, ₡2, one game hour, checked every tick |
| Three real minutes of grace        | Asserted just under and just over the boundary     |
| Highest-paid leaves first          | Three roles, the expensive one goes                |
| One at a time, not the whole staff | Asserted at the moment of the first departure      |
| Deterministic                      | Two identical runs, same digest                    |
| No debt left behind                | Cash is exactly 0 and the walkout is counted       |

"Cash never goes below zero" is a design position rather than a safety check, and
it is tested by brute force for that reason: a tycoon game that can put a player
in a hole they cannot dig out of has replaced a decision with a punishment.

---

## 6. Two of the three roles have nothing to do

The roadmap's scope line: _"Cook is fully used now; Waiter and Cleaner are
implemented and tested but only become active in Phase 11 when Stage 3 exists."_

That is what happened, and the consequence is sharper than the sentence suggests:

- **The cleaner** has one task kind, `CLEAN_TABLE`, and the world has no tables.
  Every cleaner hired today is permanently BLOCKED. The staff panel will happily
  sell you one.
- **The waiter** has `DELIVER_ORDER`, which _should_ be real work in Stage 1 —
  carrying plates from the pass. It is not, for the reason PHASE_8_REPORT §6
  measured: `ServiceSystem` hands a plate over on the same tick it reaches the
  pass, so **food sits on the pass for zero ticks out of 24 000** and a delivery
  task is completed by the world before a waiter can walk to it.

The `DELIVER_ORDER` completion branch is therefore a no-op that returns success.
It is reachable, it is not faked into doing something, and Phase 11 makes it
real. This is the third phase in a row in which the same measurement — nothing
ever waits on the pass — has blocked a different feature: the pass plate marker
(Phase 8), the cooler (Phase 9), and now the waiter.

**That is now a pattern rather than a coincidence, and it is worth a decision.**
Either Stage 1 delivery should stop being instantaneous, or three built features
stay dormant until Phase 11.

---

## 7. The cook is blocked 98% of the time

Measured, twenty minutes, seed 424242, one cook at skill 0.7:

```
BLOCKED 98.0%  ·  PERFORMING 1.8%  ·  MOVING 0.0%  ·  IDLE 0.1%
```

Not a defect — the machinery is working exactly as designed. It is a statement
about **Stage 1's volume**: at roughly 1.8 customers a minute, a cook has about
one second of work to do every thirty. The `MOVING` figure rounds to zero because
the walk from the pass to a station is under two metres.

Two consequences worth writing down:

1. **A cook barely pays for itself.** ₡20 to hire and ~₡0.9 a minute against a
   stand taking ~₡5 a minute. Both runs stayed solvent and nobody walked out
   unpaid, which the tests assert — but the margin is thin, and it is Phase 12's
   balance pass that should decide whether that is the intended shape.
2. **An employee standing still 98% of the time will look like a token**, however
   good the animation. That is the roadmap's own Phase 10 risk, and this number
   is the mechanical half of the answer to it. §9.

---

## 8. Performance — and a `Set` that cost more than it looked

| Load                                                     | Budget |    Measured p95 |
| -------------------------------------------------------- | -----: | --------------: |
| staffed tick — 8 employees, 60 pedestrians, 120 vehicles | 3.0 ms |    **0.216 ms** |
| service tick — 120 vehicles, 40 pedestrians, 20 orders   | 2.8 ms |    **0.172 ms** |
| Allocation                                               |   32 B | **1.39 B/tick** |

Bundle **439.23 kB** gzip against 550 kB.

### 8.1 Three defects in the task board, all found by a gate

**The first cost 153 seconds.** `post()` called `nextStartable(world)` — itself a
scan of the order pool — once per order, and checked "already posted?" by
scanning the task pool once per order. With a full order pool that is O(n²) twice
over, and it turned one existing unit test from milliseconds into **153 seconds**.
Both scans are now hoisted out of the loop.

**The second cost 123 B/tick against a 32 B budget.** The hoisted "already
posted" check was a `Set`, cleared and refilled every tick. `Set.clear()` and
`Set.add()` allocate as the backing table grows and shrinks — every tick, forever.
It is now a flat `Int32Array` stamped with the tick number, so nothing is ever
cleared and nothing is ever allocated.

**The third was the same object.** With the `Set` gone, a separately-reported 44%
slowdown on the populated tick disappeared too: it had been garbage-collection
pressure, not work.

None of these would have been noticed by looking at the code, and none produced a
wrong answer. The allocation gate caught the one that mattered most — the garbage
would have surfaced as frame stutter in Phase 12 with no obvious cause.

### 8.2 And a fourth, in the common case

`TaskBoardSystem` ran its full scan on every world, including the overwhelming
majority that have **no employees at all** — every Stage 1 session before the
player hires anyone. Measured at **57% of a populated tick**, spent entirely on
describing work that would be thrown away. It now returns immediately when the
payroll and the board are both empty.

---

## 9. Do they look like workers with intent?

The roadmap's closing instruction: _"watch employees for 5 minutes. Do they look
like workers with intent, or like tokens sliding on a board? Report honestly."_

**NOT JUDGED: AWAITING EXTERNAL ART.**

The judgement cannot be made and saying otherwise would be fabrication. An
employee is currently a magenta chequerboard at roughly three times its true
size, with a dashed magenta box over its head containing the letter `P`. None of
the five rig clips the roadmap lists — `take_order`, `cook`, `serve`, `clean`,
`walk_carry` — exist, because they are Phase 4 assets and Phase 4's art is
external work.

What _was_ done instead, honestly:

- **The mechanical half is measured** and it is not flattering: BLOCKED 98% of the
  shift (§7). Whatever the art does, an employee that is motionless 98% of the
  time is going to read as a token. The fix is not animation, it is having enough
  work — which is Stage 2 and Stage 3.
- **Intent is made legible** rather than animated: the task icon over each
  employee says what they are doing, and BLOCKED is drawn in warning amber
  because a worker who wants work and has none is something the player can fix.
  That is a registered placeholder, not a solution.
- **The state distribution is in this report** so whoever makes the judgement
  knows what they are looking at before they look.

---

## 10. Definition of done — WORKING_DISCIPLINE §4

| #   | Item                           | Status | Evidence                                                                    |
| --- | ------------------------------ | ------ | --------------------------------------------------------------------------- |
| 1   | Feature complete to phase spec | ✅     | §2; §6 records two roles with no work by design                             |
| 2   | Unit tests                     | ✅     | 1 131 pass                                                                  |
| 3   | Integration tests              | ✅     | `employeeLifecycle.test.ts`, 7 tests                                        |
| 4   | Determinism suite              | ✅     | Green; task assignment replays identically                                  |
| 5   | Coverage thresholds            | ✅     | None moved; a role-validator test closed the gap                            |
| 6   | Lint / format / types          | ✅     | Clean, 284 files                                                            |
| 7   | Architecture boundaries        | ✅     | `depcruise` clean                                                           |
| 8   | Dead code                      | ✅     | `knip` clean — `roleAccepts` deleted rather than kept                       |
| 9   | Performance budgets            | ✅     | §8 — 0.216 ms against 3.0 ms                                                |
| 10  | Allocation budget              | ✅     | 1.39 B/tick against 32, after §8.1                                          |
| 11  | Visual goldens                 | ✅     | 11 pass, unchanged — employees are not in a golden                          |
| 12  | E2E                            | ✅     | 104 pass, Chromium + Firefox                                                |
| 13  | **Save migration**             | ✅     | **v6 → v7**, chained, with a `save-v7.json` fixture carrying a real payroll |
| 14  | Documentation                  | ✅     | This report, PROJECT_MEMORY, PERF_LOG                                       |
| 15  | **Employee naturalness**       | ⚠️     | **NOT JUDGED — awaiting external art.** §9                                  |

Fourteen of fifteen, with the same class of blocked item as Phases 6, 7, 8 and 9.

---

## 11. Open items carried forward

1. **Nothing ever waits on the pass** (§6) — now blocking three built features
   across three phases. Needs a decision: either Stage 1 delivery stops being
   instantaneous, or the pass plate, the cooler and the waiter stay dormant until
   Phase 11.
2. **The cook is blocked 98% of the shift** (§7) — a statement about Stage 1
   volume, not a defect, and a balance input for Phase 12.
3. **`staff.hired` and `staff.employees` are two lists.** `hired` has been in the
   schema since Phase 2, carrying a `roleId` string; the payroll indexes roles by
   position. Phase 10 did not use `hired` and did not remove it. Reconciling them
   is a change request, not a migration.
4. **The applicant pool is a Phase 13 feature.** Every hire is at skill 0.5 today
   — the panel has no slider, because a slider there is the player choosing their
   own difficulty rather than making a decision about people.

---

## 12. What Phase 11 inherits

Employees that work, get paid, and leave if they are not. Tables — which Phase 11
introduces — immediately give the cleaner and the waiter something to do, and the
`CLEAN_TABLE` and `DELIVER_ORDER` branches are already there, tested, waiting for
a subject to exist.
