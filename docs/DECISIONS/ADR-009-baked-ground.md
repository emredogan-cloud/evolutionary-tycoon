# ADR-009 — Baked ground sprites instead of an isometric tilemap

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 0 (recorded in Phase 1)

## Context

The conventional approach for an isometric game is a tilemap.

## Decision

Each evolution stage's lot is rendered as **2–6 large, hand-composed static sprites** ("bakes"),
not tiles.

## Two independent reasons

1. **Technical:** Phaser 4's `TilemapGPULayer` is orthographic-only — there is no fast isometric
   tilemap path. A sprite-per-tile isometric layer would be both slower and more code.
2. **Aesthetic, and more important:** visible tile repetition is the single most recognisable
   "cheap browser tycoon" tell. A hand-composed lot reads as illustration. This directly serves
   visual differentiator #1.

## Consequences

- Draw calls for the ground drop to a handful.
- Memory ≈ 1.5 MB per stage.
- Stage transitions reveal the new bake through an expanding stencil mask (Phaser 4.2), so the
  camera never cuts and the building visibly grows in place.
- Cost: the lot is not procedurally editable. Acceptable — the lot layout is authored content, and
  placeable objects (tables, equipment) remain separate depth-sorted sprites.

## Evidence

docs/RESEARCH_NOTES.md §4; docs/ASSET_PIPELINE.md §5.

## Reversal cost

Medium.
