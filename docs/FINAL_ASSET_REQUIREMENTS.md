# FINAL ASSET REQUIREMENTS — the definitive matrix

**Generated 2026-08-21** from the machine inventories (173 source assets ·
172-prompt catalog · `DIRECTION_AUDIT.json` · `ACCEPTED_EXCEPTIONS.json` ·
`sprites.ts` frame tables · `UPGRADE_TREE.iconKey` · layout placements ·
P17/P18 roadmap scope). Machine-readable twin:
[`assets/assetRequirements.json`](assets/assetRequirements.json) — the file
`tools/validateAssetPromptCoverage.ts` checks against the prompt catalog.

**The user generates all art externally. Nothing here claims art was generated.**

## Totals

| Status                   |   Count |
| ------------------------ | ------: |
| PRESENT + VERIFIED       |     289 |
| MISSING + PROMPT ADDED   |       0 |
| PRESENT + NEEDS REGEN    |       0 |
| PROCEDURAL BY DESIGN     |       9 |
| NOT REQUIRED (justified) |       1 |
| DEBUG ONLY               |       1 |
| **Rows**                 | **300** |

> **Delivery, 2026-08-21.** The user generated all 131 prompted assets
> externally and dropped them into `docs/assets/sources`. Every MISSING and
> NEEDS-REGEN row flipped to PRESENT + VERIFIED after `assets:import` → the
> nine checks (**279 source assets, 0 failing**, 75 recorded exceptions, 20
> off-family warnings) → atlas/manifest/report (**all budgets within
> limits**, critical path 3.58 / 4.00 MB). The 30 upgrade-card icons live
> under their canonical `ui_upgrade_<slug>@2x` names (ASSET_PIPELINE §3;
> `UPGRADE_TREE.iconKey` updated in the same change) — the machine twin's
> per-row notes carry the mapping.

New generation prompts appended to the catalog: **131** (P173–P303), covering
every MISSING and NEEDS-REGEN row exactly once. Shared contract per prompt:
the hash-locked `docs/assets/PROMPT_BLOCK.md` body (camera 2:1 dimetric,
NW key light, locked 48-colour palette, transparent background, anchor at the
footprint centre), plus per-asset subject/size/direction lines — the catalog
carries the copy-ready text.

## Reading the rows

`requiredBefore` marks the phase whose _quality bar_ wants the asset (P17 =
this batch's VFX, P18 = premium UI, P20 = perf/polish); nothing blocks
_runtime_ today — the world runs placeholder-zero on the present pool with
recorded fallbacks (nearest-facing vehicles, labelled order bubbles, tinted
employee shirts, stage-1 ground reuse).

## VEHICLES (92 rows)

| Asset ID                    | Subject                                                                 | Stage | Runtime consumer                       | Status             | Prompt | Priority | Before | Note                                                        |
| --------------------------- | ----------------------------------------------------------------------- | ----- | -------------------------------------- | ------------------ | ------ | -------- | ------ | ----------------------------------------------------------- |
| `veh_bus_brake_n`           | tour bus — brake-lit n                                                  | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P173   | P3       | —      | ships with the archetype set                                |
| `veh_bus_brake_ne`          | tour bus — brake-lit ne                                                 | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P174   | P3       | —      | ships with the archetype set                                |
| `veh_bus_default_e`         | tour bus — e view                                                       | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P175   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_bus_default_n`         | tour bus — n view                                                       | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P176   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_bus_default_ne`        | tour bus — ne view                                                      | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P177   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_bus_default_s`         | tour bus — s view                                                       | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P178   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_bus_default_se`        | tour bus — se view                                                      | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P179   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_emergency_brake_n`     | ambulance with light bar — brake-lit n                                  | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P180   | P3       | —      | ships with the archetype set                                |
| `veh_emergency_brake_ne`    | ambulance with light bar — brake-lit ne                                 | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P181   | P3       | —      | ships with the archetype set                                |
| `veh_emergency_default_e`   | ambulance with light bar — e view                                       | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P182   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_emergency_default_n`   | ambulance with light bar — n view                                       | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P183   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_emergency_default_ne`  | ambulance with light bar — ne view                                      | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P184   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_emergency_default_s`   | ambulance with light bar — s view                                       | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P185   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_emergency_default_se`  | ambulance with light bar — se view                                      | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P186   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_ev_brake_n`            | modern compact EV — brake-lit n                                         | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P187   | P3       | —      | ships with the archetype set                                |
| `veh_ev_brake_ne`           | modern compact EV — brake-lit ne                                        | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P188   | P3       | —      | ships with the archetype set                                |
| `veh_ev_default_e`          | modern compact EV — e view                                              | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P189   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_ev_default_n`          | modern compact EV — n view                                              | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P190   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_ev_default_ne`         | modern compact EV — ne view                                             | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P191   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_ev_default_s`          | modern compact EV — s view                                              | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P192   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_ev_default_se`         | modern compact EV — se view                                             | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P193   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_limo_brake_n`          | black VIP limousine — brake-lit n                                       | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P194   | P3       | —      | ships with the archetype set                                |
| `veh_limo_brake_ne`         | black VIP limousine — brake-lit ne                                      | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P195   | P3       | —      | ships with the archetype set                                |
| `veh_limo_default_e`        | black VIP limousine — e view                                            | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P196   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_limo_default_n`        | black VIP limousine — n view                                            | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P197   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_limo_default_ne`       | black VIP limousine — ne view                                           | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P198   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_limo_default_s`        | black VIP limousine — s view                                            | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P199   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_limo_default_se`       | black VIP limousine — se view                                           | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P200   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_motorcycle_brake_n`    | brake-light lit variant of the rear view                                | all   | VehicleView brake state                | PRESENT + VERIFIED | P201   | P2       | P20    | ASSET_INTEGRATION §4.6 — tint read as paint and was removed |
| `veh_motorcycle_brake_ne`   | brake-light lit variant of the rear view                                | all   | VehicleView brake state                | PRESENT + VERIFIED | P202   | P2       | P20    | ASSET_INTEGRATION §4.6 — tint read as paint and was removed |
| `veh_motorcycle_default_n`  | true rear / rear-three-quarter view (currently nearest-facing fallback) | all   | VehicleView via DIRECTION_AUDIT assign | PRESENT + VERIFIED | P203   | P1       | P20    | DIRECTION_AUDIT.gaps                                        |
| `veh_motorcycle_default_ne` | true rear / rear-three-quarter view (currently nearest-facing fallback) | all   | VehicleView via DIRECTION_AUDIT assign | PRESENT + VERIFIED | P204   | P1       | P20    | DIRECTION_AUDIT.gaps                                        |
| `veh_motorcycle_default_nw` | true rear / rear-three-quarter view (currently nearest-facing fallback) | all   | VehicleView via DIRECTION_AUDIT assign | PRESENT + VERIFIED | P205   | P1       | P20    | DIRECTION_AUDIT.gaps                                        |
| `veh_pickup_brake_n`        | brake-light lit variant of the rear view                                | all   | VehicleView brake state                | PRESENT + VERIFIED | P206   | P2       | P20    | ASSET_INTEGRATION §4.6 — tint read as paint and was removed |
| `veh_pickup_brake_ne`       | brake-light lit variant of the rear view                                | all   | VehicleView brake state                | PRESENT + VERIFIED | P207   | P2       | P20    | ASSET_INTEGRATION §4.6 — tint read as paint and was removed |
| `veh_pickup_default_n`      | true rear / rear-three-quarter view (currently nearest-facing fallback) | all   | VehicleView via DIRECTION_AUDIT assign | PRESENT + VERIFIED | P208   | P1       | P20    | DIRECTION_AUDIT.gaps                                        |
| `veh_pickup_default_ne`     | true rear / rear-three-quarter view (currently nearest-facing fallback) | all   | VehicleView via DIRECTION_AUDIT assign | PRESENT + VERIFIED | P209   | P1       | P20    | DIRECTION_AUDIT.gaps                                        |
| `veh_pickup_default_nw`     | true rear / rear-three-quarter view (currently nearest-facing fallback) | all   | VehicleView via DIRECTION_AUDIT assign | PRESENT + VERIFIED | P210   | P1       | P20    | DIRECTION_AUDIT.gaps                                        |
| `veh_sedan_brake_n`         | brake-light lit variant of the rear view                                | all   | VehicleView brake state                | PRESENT + VERIFIED | P211   | P2       | P20    | ASSET_INTEGRATION §4.6 — tint read as paint and was removed |
| `veh_sedan_brake_ne`        | brake-light lit variant of the rear view                                | all   | VehicleView brake state                | PRESENT + VERIFIED | P212   | P2       | P20    | ASSET_INTEGRATION §4.6 — tint read as paint and was removed |
| `veh_sedan_default_n`       | true rear / rear-three-quarter view (currently nearest-facing fallback) | all   | VehicleView via DIRECTION_AUDIT assign | PRESENT + VERIFIED | P213   | P1       | P20    | DIRECTION_AUDIT.gaps                                        |
| `veh_sports_brake_n`        | low two-seat sports car — brake-lit n                                   | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P214   | P3       | —      | ships with the archetype set                                |
| `veh_sports_brake_ne`       | low two-seat sports car — brake-lit ne                                  | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P215   | P3       | —      | ships with the archetype set                                |
| `veh_sports_default_e`      | low two-seat sports car — e view                                        | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P216   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_sports_default_n`      | low two-seat sports car — n view                                        | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P217   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_sports_default_ne`     | low two-seat sports car — ne view                                       | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P218   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_sports_default_s`      | low two-seat sports car — s view                                        | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P219   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_sports_default_se`     | low two-seat sports car — se view                                       | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P220   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_truck_brake_n`         | box-body long-haul truck — brake-lit n                                  | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P221   | P3       | —      | ships with the archetype set                                |
| `veh_truck_brake_ne`        | box-body long-haul truck — brake-lit ne                                 | 2-4   | VehicleView brake state                | PRESENT + VERIFIED | P222   | P3       | —      | ships with the archetype set                                |
| `veh_truck_default_e`       | box-body long-haul truck — e view                                       | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P223   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_truck_default_n`       | box-body long-haul truck — n view                                       | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P224   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_truck_default_ne`      | box-body long-haul truck — ne view                                      | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P225   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_truck_default_s`       | box-body long-haul truck — s view                                       | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P226   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_truck_default_se`      | box-body long-haul truck — se view                                      | 2-4   | archetypes.ts zero-share block         | PRESENT + VERIFIED | P227   | P1       | P20    | sw/w/nw by pipeline mirror, DIRECTION_AUDIT rule            |
| `veh_van_brake_n`           | brake-light lit variant of the rear view                                | all   | VehicleView brake state                | PRESENT + VERIFIED | P228   | P2       | P20    | ASSET_INTEGRATION §4.6 — tint read as paint and was removed |
| `veh_van_brake_ne`          | brake-light lit variant of the rear view                                | all   | VehicleView brake state                | PRESENT + VERIFIED | P229   | P2       | P20    | ASSET_INTEGRATION §4.6 — tint read as paint and was removed |
| `veh_van_default_n`         | true rear / rear-three-quarter view (currently nearest-facing fallback) | all   | VehicleView via DIRECTION_AUDIT assign | PRESENT + VERIFIED | P230   | P1       | P20    | DIRECTION_AUDIT.gaps                                        |
| `veh_van_default_ne`        | true rear / rear-three-quarter view (currently nearest-facing fallback) | all   | VehicleView via DIRECTION_AUDIT assign | PRESENT + VERIFIED | P231   | P1       | P20    | DIRECTION_AUDIT.gaps                                        |
| `veh_van_default_nw`        | true rear / rear-three-quarter view (currently nearest-facing fallback) | all   | VehicleView via DIRECTION_AUDIT assign | PRESENT + VERIFIED | P232   | P1       | P20    | DIRECTION_AUDIT.gaps                                        |
| `veh_motorcycle_default_e`  | veh motorcycle default e                                                | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P100   | —        | —      |                                                             |
| `veh_motorcycle_default_n`  | veh motorcycle default n                                                | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P098   | —        | —      |                                                             |
| `veh_motorcycle_default_ne` | veh motorcycle default ne                                               | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P099   | —        | —      |                                                             |
| `veh_motorcycle_default_nw` | veh motorcycle default nw                                               | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P105   | —        | —      |                                                             |
| `veh_motorcycle_default_s`  | veh motorcycle default s                                                | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P102   | —        | —      |                                                             |
| `veh_motorcycle_default_se` | veh motorcycle default se                                               | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P101   | —        | —      |                                                             |
| `veh_motorcycle_default_sw` | veh motorcycle default sw                                               | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P103   | —        | —      |                                                             |
| `veh_motorcycle_default_w`  | veh motorcycle default w                                                | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P104   | —        | —      |                                                             |
| `veh_pickup_default_e`      | veh pickup default e                                                    | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P084   | —        | —      |                                                             |
| `veh_pickup_default_n`      | veh pickup default n                                                    | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P082   | —        | —      |                                                             |
| `veh_pickup_default_ne`     | veh pickup default ne                                                   | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P083   | —        | —      |                                                             |
| `veh_pickup_default_nw`     | veh pickup default nw                                                   | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P089   | —        | —      |                                                             |
| `veh_pickup_default_s`      | veh pickup default s                                                    | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P086   | —        | —      |                                                             |
| `veh_pickup_default_se`     | veh pickup default se                                                   | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P085   | —        | —      |                                                             |
| `veh_pickup_default_sw`     | veh pickup default sw                                                   | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P087   | —        | —      |                                                             |
| `veh_pickup_default_w`      | veh pickup default w                                                    | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P088   | —        | —      |                                                             |
| `veh_sedan_default_e`       | veh sedan default e                                                     | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P077   | —        | —      |                                                             |
| `veh_sedan_default_n`       | veh sedan default n                                                     | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P075   | —        | —      |                                                             |
| `veh_sedan_default_ne`      | veh sedan default ne                                                    | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P076   | —        | —      |                                                             |
| `veh_sedan_default_nw`      | veh sedan default nw                                                    | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P081   | —        | —      |                                                             |
| `veh_sedan_default_s`       | veh sedan default s                                                     | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P078   | —        | —      |                                                             |
| `veh_sedan_default_se`      | veh sedan default se                                                    | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P002   | —        | —      |                                                             |
| `veh_sedan_default_sw`      | veh sedan default sw                                                    | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P079   | —        | —      |                                                             |
| `veh_sedan_default_w`       | veh sedan default w                                                     | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P080   | —        | —      |                                                             |
| `veh_van_default_e`         | veh van default e                                                       | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P092   | —        | —      |                                                             |
| `veh_van_default_n`         | veh van default n                                                       | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P090   | —        | —      |                                                             |
| `veh_van_default_ne`        | veh van default ne                                                      | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P091   | —        | —      |                                                             |
| `veh_van_default_nw`        | veh van default nw                                                      | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P097   | —        | —      |                                                             |
| `veh_van_default_s`         | veh van default s                                                       | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P094   | —        | —      |                                                             |
| `veh_van_default_se`        | veh van default se                                                      | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P093   | —        | —      |                                                             |
| `veh_van_default_sw`        | veh van default sw                                                      | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P095   | —        | —      |                                                             |
| `veh_van_default_w`         | veh van default w                                                       | all   | atlas via AssetRegistry                | PRESENT + VERIFIED | P096   | —        | —      |                                                             |

## CHARACTER_PARTS (68 rows)

| Asset ID                  | Subject                                                                | Stage | Runtime consumer        | Status             | Prompt | Priority | Before | Note                                                                                     |
| ------------------------- | ---------------------------------------------------------------------- | ----- | ----------------------- | ------------------ | ------ | -------- | ------ | ---------------------------------------------------------------------------------------- |
| `char_leg-l_default_ne`   | rig leg part — painted-into-body art, unusable for stride articulation | all   | src/render/rig          | PRESENT + VERIFIED | P233   | P2       | —      | UNUSED_RIG_SUBJECTS — legs are baked into the delivered bodies; stride cannot articulate |
| `char_leg-l_default_nw`   | rig leg part — painted-into-body art, unusable for stride articulation | all   | src/render/rig          | PRESENT + VERIFIED | P234   | P2       | —      | UNUSED_RIG_SUBJECTS — legs are baked into the delivered bodies; stride cannot articulate |
| `char_leg-l_default_se`   | rig leg part — painted-into-body art, unusable for stride articulation | all   | src/render/rig          | PRESENT + VERIFIED | P235   | P2       | —      | UNUSED_RIG_SUBJECTS — legs are baked into the delivered bodies; stride cannot articulate |
| `char_leg-l_default_sw`   | rig leg part — painted-into-body art, unusable for stride articulation | all   | src/render/rig          | PRESENT + VERIFIED | P236   | P2       | —      | UNUSED_RIG_SUBJECTS — legs are baked into the delivered bodies; stride cannot articulate |
| `char_leg-r_default_ne`   | rig leg part — painted-into-body art, unusable for stride articulation | all   | src/render/rig          | PRESENT + VERIFIED | P237   | P2       | —      | UNUSED_RIG_SUBJECTS — legs are baked into the delivered bodies; stride cannot articulate |
| `char_leg-r_default_nw`   | rig leg part — painted-into-body art, unusable for stride articulation | all   | src/render/rig          | PRESENT + VERIFIED | P238   | P2       | —      | UNUSED_RIG_SUBJECTS — legs are baked into the delivered bodies; stride cannot articulate |
| `char_leg-r_default_se`   | rig leg part — painted-into-body art, unusable for stride articulation | all   | src/render/rig          | PRESENT + VERIFIED | P239   | P2       | —      | UNUSED_RIG_SUBJECTS — legs are baked into the delivered bodies; stride cannot articulate |
| `char_leg-r_default_sw`   | rig leg part — painted-into-body art, unusable for stride articulation | all   | src/render/rig          | PRESENT + VERIFIED | P240   | P2       | —      | UNUSED_RIG_SUBJECTS — legs are baked into the delivered bodies; stride cannot articulate |
| `char_arm-l_default_ne`   | char arm-l default ne                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P059   | —        | —      |                                                                                          |
| `char_arm-l_default_nw`   | char arm-l default nw                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P062   | —        | —      |                                                                                          |
| `char_arm-l_default_se`   | char arm-l default se                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P060   | —        | —      |                                                                                          |
| `char_arm-l_default_sw`   | char arm-l default sw                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P061   | —        | —      |                                                                                          |
| `char_arm-r_default_ne`   | char arm-r default ne                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P063   | —        | —      |                                                                                          |
| `char_arm-r_default_nw`   | char arm-r default nw                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P066   | —        | —      |                                                                                          |
| `char_arm-r_default_se`   | char arm-r default se                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P064   | —        | —      |                                                                                          |
| `char_arm-r_default_sw`   | char arm-r default sw                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P065   | —        | —      |                                                                                          |
| `char_body_female-01_ne`  | char body female-01 ne                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P015   | —        | —      |                                                                                          |
| `char_body_female-01_nw`  | char body female-01 nw                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P018   | —        | —      |                                                                                          |
| `char_body_female-01_se`  | char body female-01 se                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P016   | —        | —      |                                                                                          |
| `char_body_female-01_sw`  | char body female-01 sw                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P017   | —        | —      |                                                                                          |
| `char_body_female-02_ne`  | char body female-02 ne                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P019   | —        | —      |                                                                                          |
| `char_body_female-02_nw`  | char body female-02 nw                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P022   | —        | —      |                                                                                          |
| `char_body_female-02_se`  | char body female-02 se                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P020   | —        | —      |                                                                                          |
| `char_body_female-02_sw`  | char body female-02 sw                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P021   | —        | —      |                                                                                          |
| `char_body_male-01_ne`    | char body male-01 ne                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P008   | —        | —      |                                                                                          |
| `char_body_male-01_nw`    | char body male-01 nw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P010   | —        | —      |                                                                                          |
| `char_body_male-01_se`    | char body male-01 se                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P001   | —        | —      |                                                                                          |
| `char_body_male-01_sw`    | char body male-01 sw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P009   | —        | —      |                                                                                          |
| `char_body_male-02_ne`    | char body male-02 ne                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P011   | —        | —      |                                                                                          |
| `char_body_male-02_nw`    | char body male-02 nw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P014   | —        | —      |                                                                                          |
| `char_body_male-02_se`    | char body male-02 se                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P012   | —        | —      |                                                                                          |
| `char_body_male-02_sw`    | char body male-02 sw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P013   | —        | —      |                                                                                          |
| `char_hair_long-01_ne`    | char hair long-01 ne                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P051   | —        | —      |                                                                                          |
| `char_hair_long-01_nw`    | char hair long-01 nw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P054   | —        | —      |                                                                                          |
| `char_hair_long-01_se`    | char hair long-01 se                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P052   | —        | —      |                                                                                          |
| `char_hair_long-01_sw`    | char hair long-01 sw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P053   | —        | —      |                                                                                          |
| `char_hair_short-01_ne`   | char hair short-01 ne                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P043   | —        | —      |                                                                                          |
| `char_hair_short-01_nw`   | char hair short-01 nw                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P046   | —        | —      |                                                                                          |
| `char_hair_short-01_se`   | char hair short-01 se                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P044   | —        | —      |                                                                                          |
| `char_hair_short-01_sw`   | char hair short-01 sw                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P045   | —        | —      |                                                                                          |
| `char_hair_short-02_ne`   | char hair short-02 ne                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P047   | —        | —      |                                                                                          |
| `char_hair_short-02_nw`   | char hair short-02 nw                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P050   | —        | —      |                                                                                          |
| `char_hair_short-02_se`   | char hair short-02 se                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P048   | —        | —      |                                                                                          |
| `char_hair_short-02_sw`   | char hair short-02 sw                                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P049   | —        | —      |                                                                                          |
| `char_hair_tied-01_ne`    | char hair tied-01 ne                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P055   | —        | —      |                                                                                          |
| `char_hair_tied-01_nw`    | char hair tied-01 nw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P058   | —        | —      |                                                                                          |
| `char_hair_tied-01_se`    | char hair tied-01 se                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P056   | —        | —      |                                                                                          |
| `char_hair_tied-01_sw`    | char hair tied-01 sw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P057   | —        | —      |                                                                                          |
| `char_head_female-01_ne`  | char head female-01 ne                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P031   | —        | —      |                                                                                          |
| `char_head_female-01_nw`  | char head female-01 nw                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P034   | —        | —      |                                                                                          |
| `char_head_female-01_se`  | char head female-01 se                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P032   | —        | —      |                                                                                          |
| `char_head_female-01_sw`  | char head female-01 sw                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P033   | —        | —      |                                                                                          |
| `char_head_female-02_ne`  | char head female-02 ne                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P035   | —        | —      |                                                                                          |
| `char_head_female-02_nw`  | char head female-02 nw                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P038   | —        | —      |                                                                                          |
| `char_head_female-02_se`  | char head female-02 se                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P036   | —        | —      |                                                                                          |
| `char_head_female-02_sw`  | char head female-02 sw                                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P037   | —        | —      |                                                                                          |
| `char_head_male-01_ne`    | char head male-01 ne                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P023   | —        | —      |                                                                                          |
| `char_head_male-01_nw`    | char head male-01 nw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P026   | —        | —      |                                                                                          |
| `char_head_male-01_se`    | char head male-01 se                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P024   | —        | —      |                                                                                          |
| `char_head_male-01_sw`    | char head male-01 sw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P025   | —        | —      |                                                                                          |
| `char_head_male-02_ne`    | char head male-02 ne                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P027   | —        | —      |                                                                                          |
| `char_head_male-02_nw`    | char head male-02 nw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P030   | —        | —      |                                                                                          |
| `char_head_male-02_se`    | char head male-02 se                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P028   | —        | —      |                                                                                          |
| `char_head_male-02_sw`    | char head male-02 sw                                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P029   | —        | —      |                                                                                          |
| `char_head_neutral-01_ne` | char head neutral-01 ne                                                | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P039   | —        | —      |                                                                                          |
| `char_head_neutral-01_nw` | char head neutral-01 nw                                                | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P042   | —        | —      |                                                                                          |
| `char_head_neutral-01_se` | char head neutral-01 se                                                | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P040   | —        | —      |                                                                                          |
| `char_head_neutral-01_sw` | char head neutral-01 sw                                                | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P041   | —        | —      |                                                                                          |

## FOOD (12 rows)

| Asset ID                 | Subject                                               | Stage | Runtime consumer             | Status             | Prompt | Priority | Before | Note                                         |
| ------------------------ | ----------------------------------------------------- | ----- | ---------------------------- | ------------------ | ------ | -------- | ------ | -------------------------------------------- |
| `food_breakfast_default` | breakfast menu item icon (order bubble + menu screen) | 3-4   | FOOD_ICONS map + OrderBubble | PRESENT + VERIFIED | P241   | P1       | P18    | sprites.ts FOOD_ICONS note                   |
| `food_chicken_default`   | chicken menu item icon (order bubble + menu screen)   | 3-4   | FOOD_ICONS map + OrderBubble | PRESENT + VERIFIED | P242   | P1       | P18    | sprites.ts FOOD_ICONS note                   |
| `food_dessert_default`   | dessert menu item icon (order bubble + menu screen)   | 3-4   | FOOD_ICONS map + OrderBubble | PRESENT + VERIFIED | P243   | P1       | P18    | sprites.ts FOOD_ICONS note                   |
| `food_family_default`    | family menu item icon (order bubble + menu screen)    | 3-4   | FOOD_ICONS map + OrderBubble | PRESENT + VERIFIED | P244   | P1       | P18    | sprites.ts FOOD_ICONS note                   |
| `food_salad_default`     | salad menu item icon (order bubble + menu screen)     | 3-4   | FOOD_ICONS map + OrderBubble | PRESENT + VERIFIED | P245   | P1       | P18    | sprites.ts FOOD_ICONS note                   |
| `food_seasonal`          | seasonal/campaign item icon                           | 4     | menu                         | NOT REQUIRED       | —      | P2       | —      | GDD §4: variable item, post-MVP campaign art |
| `food_burger_default`    | food burger default                                   | all   | atlas via AssetRegistry      | PRESENT + VERIFIED | P133   | —        | —      |                                              |
| `food_coffee_default`    | food coffee default                                   | all   | atlas via AssetRegistry      | PRESENT + VERIFIED | P138   | —        | —      |                                              |
| `food_fries_default`     | food fries default                                    | all   | atlas via AssetRegistry      | PRESENT + VERIFIED | P134   | —        | —      |                                              |
| `food_hotdog_default`    | food hotdog default                                   | all   | atlas via AssetRegistry      | PRESENT + VERIFIED | P135   | —        | —      |                                              |
| `food_soda_default`      | food soda default                                     | all   | atlas via AssetRegistry      | PRESENT + VERIFIED | P137   | —        | —      |                                              |
| `food_wrap_default`      | food wrap default                                     | all   | atlas via AssetRegistry      | PRESENT + VERIFIED | P136   | —        | —      |                                              |

## UPGRADE_VISUALS (30 rows)

| Asset ID              | Subject                          | Stage    | Runtime consumer     | Status             | Prompt | Priority | Before | Note                      |
| --------------------- | -------------------------------- | -------- | -------------------- | ------------------ | ------ | -------- | ------ | ------------------------- |
| `struct_automation`   | upgrade card icon — automation   | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P246   | P1       | P18    | iconKey declared, no file |
| `struct_badge`        | upgrade card icon — badge        | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P247   | P1       | P18    | iconKey declared, no file |
| `struct_barrier`      | upgrade card icon — barrier      | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P248   | P1       | P18    | iconKey declared, no file |
| `struct_bench`        | upgrade card icon — bench        | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P249   | P1       | P18    | iconKey declared, no file |
| `struct_canopy`       | upgrade card icon — canopy       | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P250   | P1       | P18    | iconKey declared, no file |
| `struct_cooler`       | upgrade card icon — cooler       | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P251   | P1       | P18    | iconKey declared, no file |
| `struct_counter_wide` | upgrade card icon — counter wide | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P252   | P1       | P18    | iconKey declared, no file |
| `struct_crates`       | upgrade card icon — crates       | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P253   | P1       | P18    | iconKey declared, no file |
| `struct_dispenser`    | upgrade card icon — dispenser    | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P254   | P1       | P18    | iconKey declared, no file |
| `struct_forecourt`    | upgrade card icon — forecourt    | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P255   | P1       | P18    | iconKey declared, no file |
| `struct_headset`      | upgrade card icon — headset      | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P256   | P1       | P18    | iconKey declared, no file |
| `struct_heatlamp`     | upgrade card icon — heatlamp     | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P257   | P1       | P18    | iconKey declared, no file |
| `struct_knives`       | upgrade card icon — knives       | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P258   | P1       | P18    | iconKey declared, no file |
| `struct_lane`         | upgrade card icon — lane         | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P259   | P1       | P18    | iconKey declared, no file |
| `struct_menuboard`    | upgrade card icon — menuboard    | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P260   | P1       | P18    | iconKey declared, no file |
| `struct_neon`         | upgrade card icon — neon         | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P261   | P1       | P18    | iconKey declared, no file |
| `struct_orderpost`    | upgrade card icon — orderpost    | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P262   | P1       | P18    | iconKey declared, no file |
| `struct_oven`         | upgrade card icon — oven         | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P263   | P1       | P18    | iconKey declared, no file |
| `struct_planter`      | upgrade card icon — planter      | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P264   | P1       | P18    | iconKey declared, no file |
| `struct_prep_station` | upgrade card icon — prep station | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P265   | P1       | P18    | iconKey declared, no file |
| `struct_pylon`        | upgrade card icon — pylon        | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P266   | P1       | P18    | iconKey declared, no file |
| `struct_reader`       | upgrade card icon — reader       | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P267   | P1       | P18    | iconKey declared, no file |
| `struct_register`     | upgrade card icon — register     | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P268   | P1       | P18    | iconKey declared, no file |
| `struct_shoes`        | upgrade card icon — shoes        | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P269   | P1       | P18    | iconKey declared, no file |
| `struct_sign_lit`     | upgrade card icon — sign lit     | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P270   | P1       | P18    | iconKey declared, no file |
| `struct_sign_painted` | upgrade card icon — sign painted | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P271   | P1       | P18    | iconKey declared, no file |
| `struct_staffroom`    | upgrade card icon — staffroom    | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P272   | P1       | P18    | iconKey declared, no file |
| `struct_supervisor`   | upgrade card icon — supervisor   | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P273   | P1       | P18    | iconKey declared, no file |
| `struct_terrace`      | upgrade card icon — terrace      | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P274   | P1       | P18    | iconKey declared, no file |
| `struct_window`       | upgrade card icon — window       | per-rung | UPGRADE_TREE.iconKey | PRESENT + VERIFIED | P275   | P1       | P18    | iconKey declared, no file |

## GROUND (4 rows)

| Asset ID               | Subject                                                    | Stage | Runtime consumer                     | Status             | Prompt | Priority | Before | Note                                              |
| ---------------------- | ---------------------------------------------------------- | ----- | ------------------------------------ | ------------------ | ------ | -------- | ------ | ------------------------------------------------- |
| `ground_stage2_tile-a` | stage-2 lot surface bake (gravel/asphalt/asphalt+markings) | 2     | GROUND_FRAMES (reuses stage 1 today) | PRESENT + VERIFIED | P276   | P2       | P20    | deliberate reuse recorded in PLACEHOLDER_REGISTER |
| `ground_stage3_tile-a` | stage-3 lot surface bake (gravel/asphalt/asphalt+markings) | 3     | GROUND_FRAMES (reuses stage 1 today) | PRESENT + VERIFIED | P277   | P2       | P20    | deliberate reuse recorded in PLACEHOLDER_REGISTER |
| `ground_stage4_tile-a` | stage-4 lot surface bake (gravel/asphalt/asphalt+markings) | 4     | GROUND_FRAMES (reuses stage 1 today) | PRESENT + VERIFIED | P278   | P2       | P20    | deliberate reuse recorded in PLACEHOLDER_REGISTER |
| `ground_stage1_tile-a` | ground stage1 tile-a                                       | all   | atlas via AssetRegistry              | PRESENT + VERIFIED | P005   | —        | —      |                                                   |

## ROAD (1 rows)

| Asset ID              | Subject             | Stage | Runtime consumer        | Status             | Prompt | Priority | Before | Note                                            |
| --------------------- | ------------------- | ----- | ----------------------- | ------------------ | ------ | -------- | ------ | ----------------------------------------------- |
| `road_segment_tile-a` | road segment tile-a | all   | atlas via AssetRegistry | PRESENT + VERIFIED | —      | —        | —      | user-delivered outside the catalog (road slice) |

## VFX_TEXTURES (15 rows)

| Asset ID                       | Subject                 | Stage | Runtime consumer        | Status               | Prompt | Priority | Before | Note                                            |
| ------------------------------ | ----------------------- | ----- | ----------------------- | -------------------- | ------ | -------- | ------ | ----------------------------------------------- |
| `fx_coin_soft`                 | small coin particle     | all   | ParticleLibrary         | PRESENT + VERIFIED   | P279   | P2       | P18    | ui_icon_coin is UI-family, not a particle       |
| `fx_fire_soft`                 | soft fire lick particle | all   | ParticleLibrary         | PRESENT + VERIFIED   | P280   | P1       | P17    | roadmap P17 effect list                         |
| `procedural:UI-transitions`    | UI transitions          | all   | render layer            | PROCEDURAL BY DESIGN | —      | P2       | —      | CSS                                             |
| `procedural:camera-shake`      | camera shake            | all   | render layer            | PROCEDURAL BY DESIGN | —      | P2       | —      | transform                                       |
| `procedural:construction-mask` | construction mask       | all   | render layer            | PROCEDURAL BY DESIGN | —      | P2       | —      | Graphics ConstructionMask                       |
| `procedural:headlight-beams`   | headlight beams         | all   | render layer            | PROCEDURAL BY DESIGN | —      | P2       | —      | Graphics + ADD blend                            |
| `procedural:neon-flicker`      | neon flicker            | all   | render layer            | PROCEDURAL BY DESIGN | —      | P2       | —      | tint modulation                                 |
| `procedural:night-tint`        | night tint              | all   | render layer            | PROCEDURAL BY DESIGN | —      | P2       | —      | Graphics overlay                                |
| `procedural:rain`              | rain                    | all   | render layer            | PROCEDURAL BY DESIGN | —      | P2       | —      | P15 renders precipitation with Graphics strokes |
| `procedural:snow`              | snow                    | all   | render layer            | PROCEDURAL BY DESIGN | —      | P2       | —      | Graphics flakes                                 |
| `procedural:wet-road-sheen`    | wet road sheen          | all   | render layer            | PROCEDURAL BY DESIGN | —      | P2       | —      | Graphics overlay                                |
| `fx_dust_soft`                 | fx dust soft            | all   | atlas via AssetRegistry | PRESENT + VERIFIED   | P141   | —        | —      |                                                 |
| `fx_smoke_soft`                | fx smoke soft           | all   | atlas via AssetRegistry | PRESENT + VERIFIED   | P140   | —        | —      |                                                 |
| `fx_sparkle_soft`              | fx sparkle soft         | all   | atlas via AssetRegistry | PRESENT + VERIFIED   | P142   | —        | —      |                                                 |
| `fx_steam_soft`                | fx steam soft           | all   | atlas via AssetRegistry | PRESENT + VERIFIED   | P139   | —        | —      |                                                 |

## UI_ICONS (43 rows)

| Asset ID                      | Subject                                          | Stage | Runtime consumer        | Status             | Prompt | Priority | Before | Note                                                                |
| ----------------------------- | ------------------------------------------------ | ----- | ----------------------- | ------------------ | ------ | -------- | ------ | ------------------------------------------------------------------- |
| `ui_icon_event-accident`      | event strip icon — accident                      | all   | src/ui strip            | PRESENT + VERIFIED | P282   | P1       | P18    |                                                                     |
| `ui_icon_event-festival`      | event strip icon — festival                      | all   | src/ui strip            | PRESENT + VERIFIED | P283   | P1       | P18    |                                                                     |
| `ui_icon_event-fuel-spike`    | event strip icon — fuel-spike                    | all   | src/ui strip            | PRESENT + VERIFIED | P284   | P1       | P18    |                                                                     |
| `ui_icon_event-night-rush`    | event strip icon — night-rush                    | all   | src/ui strip            | PRESENT + VERIFIED | P285   | P1       | P18    |                                                                     |
| `ui_icon_event-road-work`     | event strip icon — road-work                     | all   | src/ui strip            | PRESENT + VERIFIED | P286   | P1       | P18    |                                                                     |
| `ui_icon_event-weather-front` | event strip icon — weather-front                 | all   | src/ui strip            | PRESENT + VERIFIED | P287   | P1       | P18    |                                                                     |
| `ui_icon_role-cleaner`        | staff role icon — cleaner                        | 2-4   | src/ui Staff            | PRESENT + VERIFIED | P291   | P1       | P18    |                                                                     |
| `ui_icon_role-cook`           | staff role icon — cook                           | 2-4   | src/ui Staff            | PRESENT + VERIFIED | P292   | P1       | P18    |                                                                     |
| `ui_icon_role-waiter`         | staff role icon — waiter                         | 2-4   | src/ui Staff            | PRESENT + VERIFIED | P293   | P1       | P18    |                                                                     |
| `ui_icon_weather-clear`       | weather strip icon — clear                       | all   | src/ui HUD              | PRESENT + VERIFIED | P297   | P1       | P18    |                                                                     |
| `ui_icon_weather-overcast`    | weather strip icon — overcast                    | all   | src/ui HUD              | PRESENT + VERIFIED | P298   | P1       | P18    |                                                                     |
| `ui_icon_weather-rain`        | weather strip icon — rain                        | all   | src/ui HUD              | PRESENT + VERIFIED | P299   | P1       | P18    |                                                                     |
| `ui_icon_weather-snow`        | weather strip icon — snow                        | all   | src/ui HUD              | PRESENT + VERIFIED | P300   | P1       | P18    |                                                                     |
| `ui_icon_angry`               | UI icon measurably off the locked palette family | all   | src/ui                  | PRESENT + VERIFIED | P281   | P3       | —      | ACCEPTED_EXCEPTIONS palette-affinity waiver — regen restores family |
| `ui_icon_hire`                | UI icon measurably off the locked palette family | all   | src/ui                  | PRESENT + VERIFIED | P288   | P3       | —      | ACCEPTED_EXCEPTIONS palette-affinity waiver — regen restores family |
| `ui_icon_neutral`             | UI icon measurably off the locked palette family | all   | src/ui                  | PRESENT + VERIFIED | P289   | P3       | —      | ACCEPTED_EXCEPTIONS palette-affinity waiver — regen restores family |
| `ui_icon_pause`               | UI icon measurably off the locked palette family | all   | src/ui                  | PRESENT + VERIFIED | P290   | P3       | —      | ACCEPTED_EXCEPTIONS palette-affinity waiver — regen restores family |
| `ui_icon_speed-2`             | UI icon measurably off the locked palette family | all   | src/ui                  | PRESENT + VERIFIED | P294   | P3       | —      | ACCEPTED_EXCEPTIONS palette-affinity waiver — regen restores family |
| `ui_icon_speed-4`             | UI icon measurably off the locked palette family | all   | src/ui                  | PRESENT + VERIFIED | P295   | P3       | —      | ACCEPTED_EXCEPTIONS palette-affinity waiver — regen restores family |
| `ui_icon_star`                | UI icon measurably off the locked palette family | all   | src/ui                  | PRESENT + VERIFIED | P296   | P3       | —      | ACCEPTED_EXCEPTIONS palette-affinity waiver — regen restores family |
| `ui_icon_build`               | ui icon build                                    | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P152   | —        | —      |                                                                     |
| `ui_icon_cash`                | ui icon cash                                     | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P143   | —        | —      |                                                                     |
| `ui_icon_clock`               | ui icon clock                                    | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P146   | —        | —      |                                                                     |
| `ui_icon_close`               | ui icon close                                    | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P168   | —        | —      |                                                                     |
| `ui_icon_coin`                | ui icon coin                                     | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P144   | —        | —      |                                                                     |
| `ui_icon_customer`            | ui icon customer                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P145   | —        | —      |                                                                     |
| `ui_icon_drink`               | ui icon drink                                    | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P155   | —        | —      |                                                                     |
| `ui_icon_fire`                | ui icon fire                                     | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P158   | —        | —      |                                                                     |
| `ui_icon_fryer`               | ui icon fryer                                    | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P154   | —        | —      |                                                                     |
| `ui_icon_grill`               | ui icon grill                                    | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P153   | —        | —      |                                                                     |
| `ui_icon_happy`               | ui icon happy                                    | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P160   | —        | —      |                                                                     |
| `ui_icon_info`                | ui icon info                                     | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P167   | —        | —      |                                                                     |
| `ui_icon_lock`                | ui icon lock                                     | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P164   | —        | —      |                                                                     |
| `ui_icon_patience`            | ui icon patience                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P159   | —        | —      |                                                                     |
| `ui_icon_save`                | ui icon save                                     | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P172   | —        | —      |                                                                     |
| `ui_icon_settings`            | ui icon settings                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P169   | —        | —      |                                                                     |
| `ui_icon_sound-off`           | ui icon sound-off                                | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P171   | —        | —      |                                                                     |
| `ui_icon_sound-on`            | ui icon sound-on                                 | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P170   | —        | —      |                                                                     |
| `ui_icon_speed-1`             | ui icon speed-1                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P147   | —        | —      |                                                                     |
| `ui_icon_staff`               | ui icon staff                                    | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P156   | —        | —      |                                                                     |
| `ui_icon_unlock`              | ui icon unlock                                   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P165   | —        | —      |                                                                     |
| `ui_icon_upgrade`             | ui icon upgrade                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P151   | —        | —      |                                                                     |
| `ui_icon_warning`             | ui icon warning                                  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P166   | —        | —      |                                                                     |

## UI_ILLUSTRATIONS (3 rows)

| Asset ID            | Subject                                            | Stage | Runtime consumer | Status             | Prompt | Priority | Before | Note |
| ------------------- | -------------------------------------------------- | ----- | ---------------- | ------------------ | ------ | -------- | ------ | ---- |
| `ui_illust_empty`   | empty-state illustration (no saves / nothing here) | all   | src/ui screens   | PRESENT + VERIFIED | P301   | P2       | P18    |      |
| `ui_illust_error`   | recoverable-error illustration                     | all   | src/ui screens   | PRESENT + VERIFIED | P302   | P2       | P18    |      |
| `ui_illust_offline` | away-report header illustration                    | all   | src/ui screens   | PRESENT + VERIFIED | P303   | P2       | P18    |      |

## STRUCTURES (14 rows)

| Asset ID                  | Subject                 | Stage | Runtime consumer        | Status             | Prompt | Priority | Before | Note |
| ------------------------- | ----------------------- | ----- | ----------------------- | ------------------ | ------ | -------- | ------ | ---- |
| `struct_awning_lv1`       | struct awning lv1       | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P108   | —        | —      |      |
| `struct_counter_lv1`      | struct counter lv1      | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P106   | —        | —      |      |
| `struct_counter_lv2`      | struct counter lv2      | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P107   | —        | —      |      |
| `struct_door_default`     | struct door default     | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P114   | —        | —      |      |
| `struct_drink_lv1`        | struct drink lv1        | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P117   | —        | —      |      |
| `struct_fryer_lv1`        | struct fryer lv1        | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P116   | —        | —      |      |
| `struct_grill_lv1`        | struct grill lv1        | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P004   | —        | —      |      |
| `struct_grill_lv2`        | struct grill lv2        | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P115   | —        | —      |      |
| `struct_pass_default`     | struct pass default     | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P118   | —        | —      |      |
| `struct_sign_large_lower` | struct sign large lower | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P112   | —        | —      |      |
| `struct_sign_large_upper` | struct sign large upper | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P113   | —        | —      |      |
| `struct_truck_lv1_lower`  | struct truck lv1 lower  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P109   | —        | —      |      |
| `struct_truck_lv1_upper`  | struct truck lv1 upper  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P110   | —        | —      |      |
| `struct_window_default`   | struct window default   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P111   | —        | —      |      |

## PROPS (7 rows)

| Asset ID                            | Subject                 | Stage | Runtime consumer        | Status             | Prompt | Priority | Before | Note                |
| ----------------------------------- | ----------------------- | ----- | ----------------------- | ------------------ | ------ | -------- | ------ | ------------------- |
| `ph-scale-reference__PLACEHOLDER__` | 2 m measuring stick     | all   | debug only              | DEBUG ONLY         | —      | P2       | —      | no layout places it |
| `prop_barrier_default`              | prop barrier default    | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P123   | —        | —      |                     |
| `prop_bin_default`                  | prop bin default        | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P122   | —        | —      |                     |
| `prop_chair_plastic`                | prop chair plastic      | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P120   | —        | —      |                     |
| `prop_chair_wooden`                 | prop chair wooden       | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P121   | —        | —      |                     |
| `prop_table_round_4seat`            | prop table round 4seat  | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P003   | —        | —      |                     |
| `prop_table_square_2seat`           | prop table square 2seat | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P119   | —        | —      |                     |

## VEGETATION (11 rows)

| Asset ID                         | Subject                        | Stage | Runtime consumer        | Status             | Prompt | Priority | Before | Note |
| -------------------------------- | ------------------------------ | ----- | ----------------------- | ------------------ | ------ | -------- | ------ | ---- |
| `nature_bush_flowering-01`       | nature bush flowering-01       | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P130   | —        | —      |      |
| `nature_bush_round-01`           | nature bush round-01           | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P128   | —        | —      |      |
| `nature_bush_round-02`           | nature bush round-02           | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P129   | —        | —      |      |
| `nature_pole_lamp_lower`         | nature pole lamp lower         | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P131   | —        | —      |      |
| `nature_pole_lamp_upper`         | nature pole lamp upper         | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P132   | —        | —      |      |
| `nature_tree_broadleaf-01_lower` | nature tree broadleaf-01 lower | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P006   | —        | —      |      |
| `nature_tree_broadleaf-01_upper` | nature tree broadleaf-01 upper | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P007   | —        | —      |      |
| `nature_tree_broadleaf-02_lower` | nature tree broadleaf-02 lower | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P124   | —        | —      |      |
| `nature_tree_broadleaf-02_upper` | nature tree broadleaf-02 upper | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P125   | —        | —      |      |
| `nature_tree_conifer-01_lower`   | nature tree conifer-01 lower   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P126   | —        | —      |      |
| `nature_tree_conifer-01_upper`   | nature tree conifer-01 upper   | all   | atlas via AssetRegistry | PRESENT + VERIFIED | P127   | —        | —      |      |

## What is deliberately NOT in the matrix

1. **The ~290-sprite Stage 3/4 bespoke production plan** (roadmap §P16 Assets,
   `productionBatches.json` extension). Those sprites are not referenced by any
   runtime frame table — the shipped stages draw from the shared pool with
   zero placeholders — so they are stage-identity _enrichment_, not
   requirements, and inventing 290 unaudited rows is exactly what §26 forbids.
   The plan remains the named debt it has been since P16.
2. **Audio files** — not image prompts; `AUDIO_ASSET_REQUIREMENTS.md` (P17).
3. **The dyslexia-friendly font** (P18) — an external font file, sourced like
   audio, recorded in the P18 report; no image prompt can produce it.
4. **Rig clips** (`*.json`) — authored data, P17 deliverables, not art.

## Zero-omission check (§19)

Every runtime-reachable visual surface holds exactly one of the four allowed
answers: the frame tables (`WORLD_OBJECTS`, `FOOD_ICONS`, `FX_FRAMES`,
`GROUND_FRAMES`, `ROAD_FRAME`, rig part names, vehicle facings, UI icon set)
resolve to PRESENT rows; every declared-but-fileless reference (30 iconKeys,
6 zero-share archetypes, 10 audit gaps, 5 food icons, 8+12 brake views,
3 ground bakes, 2 FX textures, 13 P18 icons, 3 P18 illustrations) has a
MISSING row and a prompt; every intentional non-image effect has its
PROCEDURAL row and reason; the one prop no layout places is DEBUG ONLY; the
seasonal icon is the one justified NOT REQUIRED. `validateAssetPromptCoverage`
re-derives this arithmetic on every run.
