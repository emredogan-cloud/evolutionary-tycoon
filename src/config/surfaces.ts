/**
 * Surface colours drawn by code rather than by art.
 *
 * The lot, the road and the lane markings are drawn with `Graphics` until the
 * baked ground art of ASSET_PIPELINE §5 exists. Provisional, but **not
 * arbitrary**: every value here is an entry of the locked 48-colour palette in
 * `docs/assets/palette.json`, because a renderer painting colours outside the
 * palette makes the palette a document rather than a contract.
 *
 * `src/config` may not import anything from the project, so the hexes are
 * literals with their palette id named alongside.
 * `tests/unit/render/surfaces.test.ts` reads `palette.json` and fails if a value
 * here drifts off it — the link is enforced, not commented.
 *
 * These are `0xRRGGBB` numbers because that is what Phaser's Graphics API takes.
 */
export const SURFACE_COLORS = {
  /** meadow-700 — the lot's grass and verge. */
  ground: 0x586e22,
  /** meadow-900 — the lot grid, one ramp step down so it reads as shadow. */
  groundGrid: 0x35441a,
  /** pavement-700 — asphalt. */
  road: 0x3a414c,
  /** neutral-050 — lane markings. The only near-white in the palette. */
  roadMarking: 0xf2f0ea,
} as const;
