# ADR-017 — The game runs on WebGL 1, the gate demands WebGL 2, and the resolution needs a decision

**Status:** **Accepted — Option A** (user decision, 2026-08-21: "WebGL1 kullanımı
onaylandı. Maksimum uyumluluk için belgeleri buna göre güncelle.") ·
**Proposed:** 2026-08-18 · **Decided:** 2026-08-21 · **Phase:** pre-P17

> CLAUDE.md is explicit: _"do not 'fix' the documents or the capability gate without the decision it
> asks for."_ This ADR therefore changes **nothing**. It exists because the consolidation directive
> (§20) requires the contradiction investigated and formally documented rather than carried another
> batch, and because the investigation produced a measurement the decision can now rest on.

## The measurement (2026-08-18, production build via preview, Chromium/SwiftShader)

Taken from the live canvas of the running game, not from documentation:

```json
{
  "webgl2Available": true, // the browser offers WebGL 2
  "canvasIsWebgl2": false, // the game's canvas does not hold a WebGL 2 context
  "canvasIsWebgl1": true, // it holds a WebGL 1 context
  "gl.version": "WebGL 1.0 (OpenGL ES 2.0 Chromium)",
  "gl.maxTextureSize": 8192
}
```

This confirms CLAUDE.md's own note at runtime: Phaser 4.2.1 opens a WebGL **1** context
(`WebGLRenderer.js:709`; the string "webgl2" does not occur in its source), regardless of what the
browser could provide.

## The contradiction, stated precisely

- `src/platform/capability.ts` **refuses to start** on any browser that cannot create a WebGL 2
  context (`failure: 'no-webgl2'`).
- The engine then renders **everything on WebGL 1** — thirteen phases of gameplay, every golden,
  every E2E run, every preview deployment. Production reality has been WebGL 1 the whole time.
- Four approved documents describe WebGL 2 as mandatory.

Net effect: a WebGL 1-only browser is turned away from a game that would run on it, and a
WebGL 2 browser is granted nothing the gate's check implies. The gate tests a capability the
product does not use.

## The options for the decision

**Option A — align the gate with the engine (require WebGL 1).**
Compatibility strictly widens; nothing the game does today changes; the four documents are corrected
to describe the shipped renderer. Cost: if a post-MVP feature genuinely needs GL2-only features
(instanced particles at Phase 15 scale, float textures), the floor has to be re-raised then, with
data on who gets excluded.

**Option B — keep the WebGL 2 gate as deliberate future-proofing.**
The four documents get a clarifying line ("the gate is a forward requirement; the current renderer
uses GL1"), so they stop being wrong without the policy moving. Cost: continuing to refuse players
the product could serve, for a benefit that has no scheduled consumer.

**Recommendation: A.** The gate should describe what the product needs, and thirteen phases of
measurement say what it needs is WebGL 1. The moment a real GL2 consumer is scheduled, the
requirement can return as a fact instead of a guess.

## The decision (2026-08-21)

**Option A.** The supported-renderer requirement becomes: _a WebGL-capable
browser compatible with the approved Phaser 4 renderer_ — which is WebGL 1.
The gate probes `webgl` (with the `experimental-webgl` alias for old Safari)
instead of `webgl2`; a browser with no usable WebGL context of any kind still
gets the graceful fallback screen (Tier C), unchanged as a product requirement.

### Compatibility consequence

Strictly widens. Every browser that passed before still passes (WebGL2 implies
WebGL1); WebGL1-only browsers — the ones the game has been rendering for all
along — stop being turned away. No browser is newly _claimed_: the gate now
tests exactly the context the engine opens, so "supported" and "runs" coincide.

### Testing consequence

- `tests/unit/platform/capability.test.ts`: the refusal fixture becomes
  "no WebGL at all"; a WebGL1-only environment asserts **supported**.
- The failure id `no-webgl2` becomes `no-webgl` (shell copy updated with it).
- E2E boot assertions ("canvas gets a context") already run on WebGL1 —
  thirteen phases of goldens and E2E are themselves the regression suite.

### Rollback

Re-raise the floor in `capability.ts` (one probe string + failure id) **only**
with a scheduled GL2-only consumer and exclusion data, per the option-A cost
recorded above. The documents changed by this decision are listed in
PHASE_17_REPORT's change-control section.

## What the consolidation batch did and did not do

- Did: took the runtime measurement above, recorded it here and in PROJECT_MEMORY §12.
- Did not: touch `capability.ts`, the four documents, or the failure copy — that waited
  for this decision.
