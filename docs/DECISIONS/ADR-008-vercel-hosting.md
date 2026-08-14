# ADR-008 — Vercel for hosting, not Fly.io

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 1

## Context

The project brief named Vercel and Fly.io as the two candidates.

## Decision

Vercel, static-first.

## Rationale

The MVP is a static client-side app with no server. Fly.io's real advantage — container control and
long-lived connections — is unused until Phase 24 at the earliest; we would be paying to run an
nginx to serve static files. Vercel's per-PR preview deployments, by contrast, are a **direct part
of this project's phase-gate workflow**: every phase's E2E suite runs against a real preview URL,
which is the only way to verify CDN behaviour, security headers and cache policy.

## Documented caveats

- ⚠ **Hobby prohibits commercial use** — including ads, donations, affiliate links and payments.
  If any monetisation is planned, upgrading to Pro is a **Phase 23 task**, not an afterthought.
- ⚠ **100 GB/month bandwidth** ≈ 12,500 cold visits at an 8 MB payload. This makes the asset budget
  a _cost_ constraint, not only a performance one.
- 🚪 Exit hatch built in from day one: `VITE_ASSET_BASE_URL`. Moving `/assets/**` to an object store
  - CDN is a one-line change.
- 🚪 Re-evaluate Fly.io only if an approved feature needs real-time multiplayer or persistent
  WebSockets.

## Evidence

docs/RESEARCH_NOTES.md §9.

## Reversal cost

Low. The build output is a plain static bundle.
