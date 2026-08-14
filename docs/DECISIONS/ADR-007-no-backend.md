# ADR-007 — No backend (except a five-line /api/time)

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 1

## Context

It is tempting to add Supabase or Postgres "because we will need it eventually" — accounts, cloud
saves, leaderboards.

## Decision

The MVP is a fully client-side static application. The only server-side code is `api/time.ts`:
a 204 response whose payload is the platform's `Date` header, used by offline progression to detect
clock manipulation.

## Alternatives considered

- **Supabase (Postgres + Auth) from the start.** Rejected: the MVP is single-player with no
  accounts and no leaderboard. It would add cost, maintenance, latency and a security surface in
  exchange for zero player value. Directly contrary to WORKING_DISCIPLINE rules 5 and 12.

## Consequences

- Cloud save is deferred to Phase 19 and is **conditional**: it only gets built if there is evidence
  of real cross-device demand from real users. Skipping it for a documented reason is a successful
  outcome of that phase.
- Local save plus JSON export/import covers device changes for most players.
- The command log (ADR-004) means server-side validation could be added later without redesign —
  a future option that costs nothing today.

## Evidence

docs/TECHNICAL_ARCHITECTURE.md §3, §10.

## Reversal cost

Low — adding a backend later is straightforward; removing an unneeded one is not.
