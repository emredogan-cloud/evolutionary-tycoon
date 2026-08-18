# PLACEHOLDER REGISTER

Every temporary asset or stand-in, and when it gets replaced.

> Placeholders are allowed. **Hiding them is not** ([WORKING_DISCIPLINE §7](WORKING_DISCIPLINE.md#7-placeholder-politikası)).
>
> Rules: they live under `assets/_placeholder/`, their filename contains `__PLACEHOLDER__`, and they
> must look **obviously wrong** — magenta/black checker with a label. A placeholder that looks "good
> enough" is the dangerous kind, because it survives to launch.
>
> The build counts placeholders and reports the number. From Phase 22 onward, a production build
> containing any placeholder is a hard error.

## Current count on production screens: **0** — asserted by `tests/e2e/productionArt.spec.ts`

The production art landed in the consolidation batch (2026-08-18) and `WorldScene` publishes
`data-asset-placeholders`, the number of quads drawn from a placeholder this frame; the E2E suite
asserts it is `0` on every stage, busy and idle. The six generated sprites remain **on disk as the
degraded-network fallback** — an atlas that fails to fetch costs its sprites, not the session — and
that is a fallback role, not a production appearance.

## Register

| File                                    | Stood in for                                    | Size (2x)   | Introduced | Replaced       | Status                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------- | ----------- | ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ph-customer__PLACEHOLDER__.png`        | Customer character (doll rig)                   | 64×144      | Phase 3    | **2026-08-18** | 🟢 fallback only                                                                                                                                    |
| `ph-employee__PLACEHOLDER__.png`        | Employee character                              | 64×144      | Phase 3    | **2026-08-18** | 🟢 fallback only                                                                                                                                    |
| `ph-vehicle__PLACEHOLDER__.png`         | `SEDAN_COMMUTER` and the other 3 archetypes     | 410×301     | Phase 3    | **2026-08-18** | 🟢 fallback only                                                                                                                                    |
| `ph-prop-short__PLACEHOLDER__.png`      | Counter, bin, low props                         | 154×134     | Phase 3    | **2026-08-18** | 🟢 fallback only                                                                                                                                    |
| `ph-prop-tall__PLACEHOLDER__.png`       | Sign post, tree, tall props                     | 102×205     | Phase 3    | **2026-08-18** | 🟢 fallback only                                                                                                                                    |
| `ph-scale-reference__PLACEHOLDER__.png` | A 2 m scale figure — a measuring stick, not art | 128×192     | Phase 3    | **2026-08-18** | 🟢 debug only — no layout places it                                                                                                                 |
| `OrderBubble.svelte` text label         | Food icon in the order bubble                   | DOM, ~50×16 | Phase 8    | **2026-08-18** | 🟢 replaced (icon from the ui atlas; five menu items keep a _labelled_ text bubble because no truthful icon exists — an art gap, not a placeholder) |
| _(procedural)_ ground + road shapes     | Stage-1 ground **bake** and road surface        | —           | Phase 3    | **2026-08-18** | 🟡 ground bake live; the **road** is still drawn procedurally from the palette — no road slice was in the delivered set                             |

### Phase 4 did not replace any of these

The replacement column said **Phase 4** for six of the seven rows. It now says **Phase 16**, and the
reason is not a slip in the plan — it is the Phase 4 START CONDITION.

The nine-item AI-tool licence verification did not close, so no art could be produced. That gate was
later opened by executive override ([`assets/LICENSES.md`](../assets/LICENSES.md) §1.5) — but still
no art exists, because the agent has no image-generation capability
([PHASE_4_REPORT §11](phases/PHASE_4_REPORT.md)). Every placeholder here is still standing, and the
prompts that would replace them are emitted by `pnpm assets:prompts`.

Phase 16 is where full asset production lives, and it is the earliest phase that could hold this work
without inventing a new one. If the licence gate closes sooner, the art can land sooner — this column
records where the work is currently scheduled, not a promise that it cannot move.

Two things did change for the better:

- The **procedural ground and road** are still procedural, but their colours are no longer arbitrary.
  They now come from `src/config/surfaces.ts`, every value an entry of the locked 48-colour palette,
  with `tests/unit/tools/palette.test.ts` failing if one drifts off it. A placeholder that obeys the
  art contract is still a placeholder — but it no longer teaches the renderer a colour the real art
  will contradict.
- `pnpm placeholders:build` now exists. Phase 3's generator documented that command, but it was never
  created, so the committed images could not actually be reproduced without calling the function by
  hand. CI now regenerates them and fails if the result differs from what is committed.

### The order bubble is a placeholder that is not a file

`src/ui/components/OrderBubble.svelte` draws the item's name in a magenta dashed box because the food
icons are Phase 4 assets that do not exist. It is registered here rather than left unlisted, because
the rule is about what the player sees and not about where the bytes live: a stand-in in the DOM is
as capable of shipping unnoticed as one in an atlas — arguably more so, since no asset validator will
ever look at it.

It follows the same discipline as the generated PNGs. Magenta on near-black, a dashed border, all
caps — it cannot be mistaken for a finished bubble, and `pnpm assets:validate` will not catch it, so
looking obviously wrong is the entire safeguard.

### Notes

**They are generated, not drawn.** `tools/placeholders/generate.ts` derives every size from the
world dimensions in `src/config` — a person is 144 px tall at 2x _because_ the traffic model says
1.75 m and the projection says 32 px per metre. Nothing is typed in twice, and
`tests/unit/tools/placeholders.test.ts` asserts the committed PNGs are byte-identical to a fresh
generation, so they cannot quietly drift from the geometry they represent.

**The ground and road are drawn with `Graphics`, not loaded.** They have no file, so they are
listed as procedural. That is not a shortcut: there is no isometric tilemap in Phaser 4
(RESEARCH_NOTES §4), so the ground is a hand-composed _bake_ per evolution stage and Phase 4 is
where those are produced.

**The 160 px split rule does not bind placeholders.** `ph-vehicle` (301 px) and `ph-prop-tall`
(205 px) exceed the `_lower`/`_upper` threshold that the Phase 4 validator will enforce on
production art. They are exempt by definition — they live under `assets/_placeholder/` and are
registered here — but the _real_ art replacing them must be split, and the validator will say so.

## History

| Date       | Phase | Change                                                                                                                                                                                                                                                                     |
| ---------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-14 | 1     | Register created. No placeholders exist — Phase 1 ships no game art, and the favicon and shell are real, not stand-ins.                                                                                                                                                    |
| 2026-08-15 | 3     | Six generated sprite placeholders plus the procedural ground and road. All deliberately magenta/black checkered, labelled, with a visible anchor cross. Every one is due for replacement in Phase 4 except the scale reference, which is a measuring tool rather than art. |
| 2026-08-15 | 8     | The order bubble's food icon added as a DOM placeholder — a magenta dashed box with the item's name in it. The first placeholder in this register that is not a file.                                                                                                      |
