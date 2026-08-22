# GAMEPLAY INTERACTION REPORT — the loop, repaired and proven

> The repair record over GAMEPLAY_INTERACTION_AUDIT.md's findings.
> Every claim cites a browser run or a green suite.

## 1. The manual loop (scenario B)

Customer arrives → order card appears (the sim's five-state machine verbatim:
PLACED → COOKING → ON_PASS → DELIVERED → PAID) → **Hazırla** dispatches the
real `MANUAL_PREP` → the kitchen's own finish derivation drives the cook bar
→ the customer collects, eats, pays → the coin burst fires and the animated
cash pill rises. **Proof: cash 0.00 → 3.72 in-browser through the button**;
`upgradeFlow`/`verticalSlice` re-walk it every run. "Mutfak dolu" is the
kitchen's real verdict on the button, per order.

## 2. Table service (scenario C — `tableService.spec.ts`, green)

At stage 3 a customer with an order takes a REAL seat (geometric assertion
within 1 m of the layout's own table coordinates; one customer per table by
construction), the pass backs up while no waiter exists, and hiring a cook +
waiter turns plates into served customers **with zero further player input**
— served and cash rise hands-free. No teleported food: delivery is a waiter
task the employee FSM walks to.

## 3. Staff automation (scenario D — `staffFlow.spec.ts`, green)

With a cook hired the order cards stop demanding attention (the kitchen
starts prep itself), the served counter rises without a single manual click,
and cash never goes below zero even against an unaffordable payroll.

## 4. Vehicles (§14/§15)

- **Corridor parking**: entry and exit run via a clearance point 1.6 m off
  the bay line, a car length before/after the bay — no sweep through parked
  neighbours (frozen captures at seeds 777/424242 confirm; the drive-thru
  queue keeps its by-design on-line creep).
- **Brake lights are frames** wherever the rear faces the camera; elsewhere
  the default frame is already the truth.
- **The ten-archetype fleet is live** at 8% reserve share (originals keep
  92%, ratios intact): bus, truck, EV, sports, limo (reputation-gated 75),
  emergency — visible in the stage-2/3/4 goldens. Balance gate green with
  the mix; 13th pin renewal carries the reasons.
- **West facings mirror at draw time** with the anchor mirrored — zero
  shipped bytes, placeholder-free by construction (a not-yet-streamed
  reserve texture skips the draw; deterministic boots await the atlas).

## 5. Money pipeline end-to-end (§16/§33)

order → serve → `PAYMENT` event → EconomySystem → `world.economy.cash` →
bridge sample → `data-cash` — every edge exercised by the scenario suite; the
save round-trip keeps the cash (`verticalSlice` criterion 7). The full event
trace (ORDER_PLACED…PAYMENT) already exists on the sim event bus and feeds
FX/audio/notices; the debug overlay (behind `?debug=1`) prints the live
counters when asked.

## 6. Evolution (scenario F)

Confirm → `CONSTRUCTION_STARTED` dust → sim-time mask reveal (pause-safe,
4×-honest) → `STAGE_CHANGED` celebration burst + a strip line that names the
unlock ("Küçük lokanta açıldı — masalar ve garsonlar") → the next stage's
layout, menu and rungs. `evolutionFlow.spec.ts` green.

## 7. Human playtest

**NOT RUN.** No human played; nothing here claims otherwise
(PLAYTEST_PROTOCOL.md unchanged).
