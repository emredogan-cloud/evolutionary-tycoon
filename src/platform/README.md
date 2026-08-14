# `src/platform` — Browser platform adapters

Everything that talks to the environment rather than to the game: capability detection, storage
availability, server-time sync, analytics, error reporting.

Isolated here so that `src/sim` can stay pure and run headless in Node.

**Status:** `capability.ts` (WebGL2 gate), `buildInfo.ts` (build identity).
