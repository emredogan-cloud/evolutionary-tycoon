# STAGE 1 — THE STAFF SYSTEM

> The payroll: who you can hire, what they actually do, and what it is worth.
> Written 2026-08-23, from per-tick measurement rather than from the design
> document.

## 1. Three roles

| Role       | Hire | What it does                                       |
| ---------- | ---: | -------------------------------------------------- |
| Aşçı       |  ₡20 | Takes orders off the board and starts them cooking |
| Garson     |  ₡18 | Carries assembled trays from the pass to tables    |
| Temizlikçi |  ₡14 | Clears tables, slowing the satisfaction decay      |

A cook accepts only `PREP_ORDER`, a waiter only `DELIVER_ORDER`, a cleaner only
`CLEAN_TABLE`. The role tables are in `src/config/employees.ts`.

**A Stage-1 waiter is idle by design.** `ServiceSystem` auto-delivers whenever
the stage's layout has no tables, so no `DELIVER_ORDER` ever exists before
Stage 3. The panel's own pitch says so — "Aşama 3'ten itibaren şart" — and
that is deliberate: a panel that offered a hire without saying when it starts
paying would be selling a number that does not move.

## 2. What a cook is worth, measured

`tests/integration/cookAutomation.test.ts`, seed 424242, 30 simulated minutes
unless stated, sampling `world.employees` **every tick**:

| Scenario                      | Clicks | Served | Cook utilisation |
| ----------------------------- | -----: | -----: | ---------------: |
| Player cooks, no staff        | 36 000 |   base |                — |
| Cook hired, player absent     |  **0** | > 0.6× |              ~4% |
| Cook hired, player also cooks | 36 000 | ≤ base |             < 2% |

The middle row is the whole point of the role, and it is the roadmap's Phase 10
Player Value line in measurable form: **comparable service for none of the
clicking.**

The third row is the honest one. `MANUAL_PREP` is applied at the top of the
tick and consumes every startable order before `TaskBoardSystem` gets to post
one, so a player who clicks every tick leaves the board permanently empty. The
cook is not broken; there is nothing for them to take. What they cost is wages.
That measurement is why the panel's cook pitch reads

> Siparişleri kendi hazırlar. Sen tezgâhta değilken ayakta tutar.

rather than "increases capacity", which would be the panel lying about the
simulation.

### Why ~4% is a healthy cook, not a broken one

A cook's task is **starting** the prep — about 670 ms at skill 0.7 — and the
station then cooks for seconds with the cook already back to idle. A Stage-1
cook lives in the low single digits and that is correct. What matters is the
difference between _quiet_ and _never assigned_, and only zero means the
second.

Nothing asserted that before this pass. `employeeLifecycle` proved a cook
_earns_; `taskboard` proved the board assigns exactly one claimant (and its
work check passes at zero); the distribution test asserts only `> 0`. A change
that stopped posting `PREP_ORDER` altogether would have left the served count
intact in every player-cooking harness and been caught by none of them. There
is now a floor.

## 3. The `busy01` trap

`StaffView.busy01` is sampled once per **publish**, and publishing is throttled
to wall-clock (`UI_SAMPLE_MS`). In real play that is honest — a cook's ~670 ms
of `PERFORMING` spans six or seven publishes.

In a harness that batches thousands of ticks into one frame it is not. The
whole burst falls between two samples and the panel reports `0.000` for a cook
that worked all shift. Measured against the preview build: `busy=0.000` and
`iş yok` across twenty-one simulated minutes while the served count climbed
45 → 74 — the cook's own work counted everywhere except in the number named
after it.

**So: never read utilisation through the bridge in a test.** The automation
measurement walks `world.employees` per tick and touches no view model. The
interface number is correct for the interface; it is the wrong instrument for a
harness.

## 4. The panel

Rebuilt against `docs/assets/sources/personel-list-design.png` — see
UI_REFERENCE_AUDIT §STAGE1_PRODUCT_EXPANSION_REFERENCES E.4. The reference's
argument is that **an employee is a person, not a row**, and the old panel was
three columns of grey text at one size, which is what the directive means by
the bare developer list.

Each row is a portrait tile beside a card carrying a name, the role in blue,
the wage, the measured busy share, and a status pill with a coloured dot.

Two things in the reference are **not** copied:

- Its `12 dk` per row is a tenure or shift clock. The game has no such concept,
  so the second figure is `busy01`, which is measured and varies.
- Its pills read `İyi / Orta / Uzman` — skill tiers. Every hire is at
  `DEFAULT_SKILL` today, so a skill pill would print the same word on every
  card forever. Ours carries the **live state** instead — çalışıyor / yolda /
  sırada bekliyor / iş yok — which is real and changes while you watch. Never
  colour alone: the dot carries the colour, the word carries the meaning.

The four state words are four different sentences on purpose. "İş yok" and
"sırada bekliyor" used to be the same word because the simulation reported them
as one state; they are different problems with opposite answers (hire fewer /
hire more).

### The names are cosmetic and say so

`StaffView` has no name and the simulation has no reason to carry one. The
label is picked from a fixed table by `entityId`, so it is stable across a save
and identical on every machine. Nothing reads it back: not hashed, not
commanded, not persisted. It exists because "Aşçı" three times in a column is a
spreadsheet and "Deniz, Aşçı" is a staff list.

### The portraits are honest about what they are

`ui_icon_role-*` are not portraits. Each is a ~120 px **scene** of four to six
objects — a toque over a chopping board and a pan; a cloche, clipboard,
waistcoat and napkin; a mop, trolley and wet-floor sign. Cropped out of
`ui.webp` and rendered at the 38 px the tile draws, only the cook survives, on
the toque's silhouette; the other two collapse into a grey-white blob and a
blue-yellow blob.

The tile therefore carries a **role-tinted ground** under the illustration.
The tint is what distinguishes the three at a glance; the illustration says
which trade once you look. That is a fix for a measured legibility problem, not
a substitute for the art: the three icons are filed as `PRESENT + NEEDS REGEN`
(P291–P293) with the measurement as the reason, and when single-glyph versions
land they drop into the same tile and the tint can go.

## 5. Wages

Wages are paid per game-minute from the till. An employee who goes unpaid past
`UNPAID_GRACE_MS` walks out, and `stats.employeesLeftUnpaid` counts it — the
balance runs assert it stays at zero, because a stand that cannot make payroll
is a balance failure worth stopping for.

## 6. Tests

- `tests/integration/employeeLifecycle.test.ts` — a cook earns with nobody
  touching the controls; comparable throughput to an attentive human; nobody
  walks out unpaid.
- `tests/integration/cookAutomation.test.ts` — the utilisation floor, the
  click count, absent-versus-present revenue, and what the machines add.
- `tests/unit/sim/employees/taskboard.test.ts` — exactly one claimant per task.
- `tests/e2e/staffFlow.spec.ts` — hiring in a browser, and service continuing
  with no clicks.

## 7. Related

- [`STAGE1_BUILDING_SYSTEM.md`](STAGE1_BUILDING_SYSTEM.md) — the equipment a
  cook operates.
- [`UI_REFERENCE_AUDIT.md`](UI_REFERENCE_AUDIT.md) §E.4 — the reference this
  panel was rebuilt against.
