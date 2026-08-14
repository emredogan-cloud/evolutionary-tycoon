# `src/persistence` — Save, migrations, storage

IndexedDB via `idb`, with a localStorage fallback. Versioned schema, chained migrations, CRC32
checksum, three rotating backups, JSON export/import.

The checksum exists for **corruption detection, not anti-cheat**. This is a single-player game; a
player who edits their own save harms only themselves. Save corruption, by contrast, is a real and
frequent failure that destroys progress.

Every schema version ships a committed fixture, and CI runs the full `v1 → current` chain on every
push — backward compatibility is [WORKING_DISCIPLINE](../../docs/WORKING_DISCIPLINE.md) rule 13 and
it is tested, not promised.

## What is here (Phase 2)

```
schema.ts             SaveFileV1 + Zod validation (a save is untrusted input)
checksum.ts           CRC-32/ISO-HDLC + canonical JSON (key-sorted)
migrations.ts         chain machinery; the list itself is empty at v1
SaveManager.ts        compose · save with backup rotation · load with recovery · import/export
StorageAdapter.ts     the interface + the in-memory backend
idbAdapter.ts         IndexedDB (primary)
localStorageAdapter.ts fallback
```

`idbAdapter.ts` is excluded from unit coverage: a hand-written IndexedDB double would prove the
double works. Its decision branches (availability, open failure) _are_ unit-tested, and the
read/write path is exercised against a real browser database in `tests/e2e/simulation.spec.ts`.

**Status:** v1 complete, migration chain empty by design.
