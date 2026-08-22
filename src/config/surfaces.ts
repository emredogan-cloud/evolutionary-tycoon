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

  // ── The continuous road band (UI/world correction pass) ──────────────────
  // The delivered road slice is a self-contained diorama tile whose grass
  // wraps its own ends, so butting copies of it always shows a seam. The road
  // is therefore composed in world space from these palette entries instead;
  // the slice stays in the pipeline as reference art for the seamless-strip
  // regeneration prompt (NEW_UI_WORLD_FIX catalogue entries).
  /** pavement-900 — asphalt shadow: wear bands, drain pits, curb shadow line. */
  asphaltShadow: 0x1f232a,
  /** pavement-500 — worn concrete: patch repairs, curb shadow side. */
  asphaltWorn: 0x6e7684,
  /** pavement-300 — lit concrete: the curb top. */
  curbTop: 0xa8aeb6,
  /** steel-300 — curb stone highlight edge on the sun side. */
  curbLit: 0xc3cbd6,
  /** amber-300 — the sunlit yellow edge line, as in the delivered slice. */
  laneYellow: 0xf4bc55,
  /** foliage-500 — the roadside verge base green. */
  verge: 0x2f8447,
  /** foliage-300 — lit grass dabs on the verge. */
  vergeLit: 0x5bb169,
  /** foliage-700 — grass shadow dabs and the verge's road-side edge. */
  vergeShadow: 0x1e5931,
  /** meadow-500 — dry tufts on the verge, tying it to the dirt lot. */
  vergeDry: 0x849e33,
} as const;
