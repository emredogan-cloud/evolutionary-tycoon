# BUILD & CONSTRUCTION DESIGN — purchases that take time

> 2026-08-22, the UI/world correction pass. The directive's words: _"PLACE →
> construction foundation/silhouette → countdown → completion → full
> production asset revealed. Do NOT implement instantaneous construction."_

## 1. The flow

```
click Satın al / place decor
  ├─ the simulation validates (stage, prereqs, level gate, price, nav)
  ├─ money moves NOW (cash −cost, lifetimeSpend +cost)
  ├─ a PendingBuild appears in world.layout.pendingBuilds  ← hashed, saved
  ├─ the renderer shows the object as a dark translucent silhouette
  │  with a world-space progress bar; the card shows «İnşa ediliyor · N dk»
  ├─ ProgressionSystem counts remainingMs down in SIMULATION time
  └─ at zero: the level applies / the decor reveals untinted,
     UPGRADE_APPLIED fires (bursts + notices), layout revision bumps
```

Nothing about the purchase is a UI claim: the effect, the world object and
the celebration all arrive together, at completion, from the same tick.

## 2. The time model — derived, not invented

One game day is 720 real seconds (`MS_PER_GAME_DAY`), so **one game minute
is 500 sim-ms**. The directive's band — "small object: 5–10 min, larger
upgrade longer" — is read in **game minutes**, because the calibrated
economy admits no other reading: stage-1 completion is a measured ~one-day
window and literal real-world minutes per rung would re-pace the entire
calibrated curve (`CALIBRATED_STAGES=[1]`).

`buildDurationMs(cost) = clamp(1000 + cost·400, 3000, 12000)` sim-ms
(`BUILD_TIME`, src/config/economy/upgrades.ts):

| Purchase                     | Cost | Duration (sim) | Game time |
| ---------------------------- | ---: | -------------: | --------: |
| Decor (free)                 |    0 |            3 s |     6 min |
| Hand-painted sign, rung 1    |   ₡6 |          3.4 s |     7 min |
| Cooler, rung 1               |  ₡12 |          5.8 s |    12 min |
| Stage-4 rungs (₡21+)         |  ₡21 |          9.4 s |    19 min |
| Ceiling                      |    — |           12 s |    24 min |
| Stage evolutions (for scale) |    — |        12–30 s | 24–60 min |

The hierarchy a player feels is preserved: decor < upgrade < a whole new
building. The balance gate ran green against this exact model (5/5,
2026-08-22) — the delay is small enough that the calibrated stage-1 curve
holds without retuning.

## 3. Semantics

- **Speed/pause**: sites advance in `ProgressionSystem`'s slot on simulation
  deltas — 4× builds four times faster, pause holds a frozen site. Browser-
  verified: paused remainingMs held over 40 ticks; 4× completed a site.
- **Reload**: `pendingBuilds` is hashed, saved (schema v12) and restored.
  Browser-verified: a lamp site saved at 2500 ms resumed at 2200 ms after a
  full reload.
- **Offline**: `COLLECT_OFFLINE` carries the same `creditedMs` window the
  earnings were priced over; sites advance through the exact code the live
  tick runs, so a build that finishes while away applies on collection —
  the moment the player is present to see the reveal.
- **Queueing**: levels already under construction count toward `maxed` and
  price the next rung; a rung under construction cannot be bought again
  (`pendingUpgradeLevels`). Multiple different sites build in parallel —
  builder scarcity is deliberately not modelled at this scale.
- **Removal**: removing placed decor mid-build takes its site with it.
- **Prerequisites** unlock on _applied_ levels, not queued ones.

## 4. Visuals

The site draws the target object's own sprite tinted `0x2b323d` at 62%
alpha — the shape says what is coming, the treatment says it is not here
yet — plus an amber progress bar on the `worldUi` layer fed by the same
`progress` number the cards show. Completion is the untinted sprite taking
its place plus the existing `UPGRADE_APPLIED` burst. A painted scaffold
overlay is prompted as `struct_scaffold_site` (P308, NEW_CONSTRUCTION_01);
until it lands the silhouette carries the site alone — an explicit
AWAITING EXTERNAL ASSET note, not a placeholder.

## 5. What deliberately did NOT change

Stage evolution (EVOLVE) keeps its own construction path (`world.construction`,
12–30 s, the growing-building mask) — it predates this pass and is the model
this pass extended downward to purchases.
