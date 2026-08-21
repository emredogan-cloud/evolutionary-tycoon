# PHASE 18 REPORT — Premium UI/UX + Accessibility + Responsive

**Batch:** P17–P18 · **Branch:** `phase/18-premium-ui` (stacked on `phase/17-anim-vfx-audio`)

## 1. Result, stated plainly

**PARTIAL by human-input, deliberately.** Every implementable P18 system shipped and is
machine-verified: the token design system on the locked palette, the signature
Conversion Analytics panel, the action dock with world-dominant panels, the
notification strip, staff/settings/diagnostics/pause screens, the a11y layer with
axe as a CI gate, and the seven-viewport responsive matrix with the HUD share
measured (not aspired). What did not run is what needs humans: the three-player
onboarding test, and the OFL dyslexia font file (external asset; the system-stack
fallback and the toggle are live).

## 2. IMPLEMENTED

- **Design system** — `src/ui/theme/tokens.css`: the 48-swatch locked palette
  verbatim as CSS custom properties (chrome and world share pigments), semantic
  surfaces/ink with AA-chosen pairs, type scale (16 base), spacing rhythm, radii,
  elevation, motion tokens that zero out under `prefers-reduced-motion`, z-layers,
  44-px touch floor, focus ring, `--ui-scale`. The Phase-1 `--c-*` vocabulary
  stays alive as aliases so no component silently lost its colours.
- **Conversion Analytics (GDD §14.4)** — `AnalyticsPanel.svelte` over a
  bridge-side last-100 ring fed by the CONVERSION_* event stream (replay-safe,
  unhashed, zero sim change): ranked reason bars, converted share, and exactly one
  advisory line ("En büyük kazanç: …"). States what happened; decides nothing.
- **Action dock** — Personel · Menü · Analiz · Ayarlar · Tanılama; one panel at a
  time; `aria-pressed`; bottom-centred on phones with safe-area.
- **Panels behind actions** — the always-open P9 price list and the P10 staff
  panel now live behind the dock (the responsive measurement is what convicted
  them — see §3); staff arrives expanded because the player asked for it.
- **Notification strip (GDD §14.2)** — right edge, self-dismissing on sim-time
  TTL (pauses hold their lines), stackable, `aria-live`, kind+icon+text so no
  state is colour-only; fed by a curated event map (quiet by default).
- **Evolution card** — compact one-line chip until the offer is real.
- **Pause** — veil + Space toggle + Esc-closes-panels; **harness-paused boots
  never veil** (`?paused=1` is a fixture, not a player).
- **Settings** — audio sliders (P17) + high-contrast (world command, hashed like
  its siblings), UI scale 0.9–1.3× and dyslexia-friendly font (app-local
  localStorage; presentation state never enters a save).
- **Diagnostics (GDD §22)** — build/version/stage/day/url/ua with one copy button.
- **Onboarding is design** — asserted as such: no dialog/tutorial chrome at boot,
  and the first car inside the 8-second beat (the daylight decision's payoff).

## 3. VERIFIED

| Gate                                     | Result                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                            | **exit 0** — bundle 477.86 kB gz of 550 · CSS 6.08 of 30                                                                                                                                                                                                                                                                                                   |
| Unit + integration                       | **1 531 passed** (analytics ring ×2, strip feed, + the P17 set)                                                                                                                                                                                                                                                                                            |
| E2E chromium                             | **92 passed + 6 deployment skips** — includes `a11y.spec.ts` (axe over 6 screens, critical+serious = build-red), `responsive.spec.ts` (7 viewports: no overflow, 44-px targets, HUD share ≤22 %/28 % via painted-chrome union grid), `onboarding.spec.ts`                                                                                                  |
| axe findings fixed at source             | unnamed progressbars ×2, unfocusable scrollable region — found by the gate, fixed in the components                                                                                                                                                                                                                                                        |
| The HUD share test convicted real chrome | 29–33 % measured before the fix; the permanent price list and the always-open panels went behind the dock; now ≤22 %/28 % on all seven viewports                                                                                                                                                                                                           |
| Visual goldens                           | world 18/18 container-regenerated and **host-byte-identical**; +6 **panel goldens (container-canonical, host-skipped — DOM text cannot promise cross-host font rasters; the header says so; `capture.css` hides the canvas during capture so SwiftShader compositing cannot flicker the backdrop)** — 24/24 in the pinned container across two verify runs |
| Determinism                              | 61/61 — high-contrast/paused commands ride the log like every setting                                                                                                                                                                                                                                                                                      |

## 4. CI / DEPLOYMENT EVIDENCE

| SHA       | Change                  | CI                                                                                                                                                                                                             | Preview E2E                    |
| --------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `e8a0b25` | P18 complete            | 32461797407 - red in three groups: staffFlow (stale toggle clicks + dock overlap), firefox pause a11y (Space races listener attachment), and every panel golden timing out with **zero completed comparisons** | 32462020792 - red (same specs) |
| `d0cbae4` | the three fixes at root | **32467140143 - GREEN**                                                                                                                                                                                        | **32467368549 - GREEN**        |

The panel-golden diagnosis mattered: the failure was never a pixel diff. The
translucent panels sit over the live WebGL canvas, and on CI's SwiftShader the
compositor catches the canvas between presents — the screenshot never
stabilises. `capture.css` hides the canvas during capture (flat token
background behind the same translucency, blur and radii), goldens were
regenerated in the pinned container (image digest `dcc5531e` verified
byte-identical to CI's pull), and two container verify runs held stable. The
world goldens never moved a byte. No pixel tolerance was touched.

> Final-state evidence (this docs SHA's own runs) is appended at the batch
> close, per the addendum precedent.

## 5. NOT RUN / NOT POSSIBLE

- **Three-player onboarding test: NOT RUN** — humans required; the protocol
  (PLAYTEST_PROTOCOL.md) gains the 60-second question; the machine-checkable
  halves (no tutorial chrome, first-car beat) are asserted instead.
- **OpenDyslexic font file** — external OFL asset, recorded beside the audio
  debt; Verdana/Trebuchet stack serves until it lands.
- **Real-device touch pass** — no device; touch targets and safe-areas are
  asserted geometrically in the matrix.

## 6. CHANGE CONTROL

- **DEPENDENCY CHANGE #2 — `@axe-core/playwright` 4.10.2** (exact pin, dev-only),
  recorded in PROJECT_MEMORY §4; mandated by the roadmap's own P18 testing list.
- `SET_HIGH_CONTRAST` command (schema untouched — the field existed since v?);
  `UiBridge` constructor gains `harnessPaused`.
- Spec reroutes for the dock era: staffFlow boots through Personel, price specs
  through Menü, evolutionFlow expands the chip — the specs walk the player's path.

## 7. Open items this phase adds

1. **S7 (i18n, TR+EN)** — GDD §25 assigns the _decision_ to P18. Proposal filed,
   not decided: keep TR-only for MVP, extract strings post-MVP; the user owns it.
2. OFL dyslexia font + the P18 icon/illustration prompts (P279–P303) await
   external generation.
3. The moderate/minor axe advisories printed per run are the next polish list.
