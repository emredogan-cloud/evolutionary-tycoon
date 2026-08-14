# `src/persistence` — Save, migrations, storage

IndexedDB via `idb`, with a localStorage fallback. Versioned schema, chained migrations, CRC32
checksum, three rotating backups, JSON export/import.

The checksum exists for **corruption detection, not anti-cheat**. This is a single-player game; a
player who edits their own save harms only themselves. Save corruption, by contrast, is a real and
frequent failure that destroys progress.

Every schema version ships a committed fixture, and CI runs the full `v1 → current` chain on every
push — backward compatibility is [WORKING_DISCIPLINE](../../docs/WORKING_DISCIPLINE.md) rule 13 and
it is tested, not promised.

**Status:** empty. Populated in Phase 2.
