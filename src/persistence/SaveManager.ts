import type { WorldSnapshot } from '@sim/core/snapshot';
import { checksumOf } from './checksum';
import { migrateToCurrent } from './migrations';
import type { SaveFileV1 } from './schema';
import { CURRENT_SCHEMA_VERSION, saveFileV1Schema, saveHeaderSchema } from './schema';
import type { StorageAdapter } from './StorageAdapter';

/**
 * Save, load, rotate, recover.
 *
 * Three rotating slots rather than one. The failure this defends against is not
 * hypothetical: a save interrupted by a tab kill, a quota rejection or a browser
 * crash leaves a truncated primary slot, and a game with one slot has then lost
 * everything. With rotation, the worst case is losing the last autosave interval.
 *
 * Nothing here throws on bad data. A corrupt save is a *result*, not an
 * exception — the caller has to show the player a recovery choice either way,
 * and an exception thrown from a `visibilitychange` handler is a crash.
 */

export const SAVE_SLOTS = ['save', 'save.bak1', 'save.bak2'] as const;
type SaveSlot = (typeof SAVE_SLOTS)[number];

export interface SaveMeta {
  readonly buildSha: string;
  /** Wall clock, supplied by the caller — `src/persistence` may read it, `src/sim` may not. */
  readonly nowMs: number;
  readonly playtimeMs: number;
  readonly lastSeenServerAt: number | null;
  /** Preserved across writes so "when did this player start" survives. */
  readonly createdAt?: number;
}

export type LoadFailureReason = 'empty' | 'corrupt' | 'future-version';

export type LoadResult =
  | {
      readonly ok: true;
      readonly save: SaveFileV1;
      readonly slot: SaveSlot;
      /** True when the primary slot failed and a backup was used instead. */
      readonly recovered: boolean;
      readonly migrationSteps: number;
    }
  | {
      readonly ok: false;
      readonly reason: LoadFailureReason;
      readonly detail: string;
      /** What each slot did, so a bug report says more than "load failed". */
      readonly slotErrors: readonly string[];
    };

export class SaveManager {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  get backendName(): string {
    return this.storage.name;
  }

  /** Build a complete, checksummed save file from a world snapshot. */
  static compose(snapshot: WorldSnapshot, meta: SaveMeta): SaveFileV1 {
    const body = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      buildSha: meta.buildSha,
      createdAt: meta.createdAt ?? meta.nowMs,
      lastSeenAt: meta.nowMs,
      lastSeenServerAt: meta.lastSeenServerAt,
      playtimeMs: meta.playtimeMs,
      ...snapshot,
    };
    // Zod's inferred type includes `checksum`; it is computed from everything else,
    // so the object is completed rather than built with a placeholder.
    return { ...body, checksum: checksumOf(body) } as SaveFileV1;
  }

  /**
   * Rotate the backups, then write the primary slot.
   *
   * Order matters: the oldest backup is overwritten first and the primary is
   * written last, so an interruption at any point leaves at least one intact
   * older save rather than two copies of a half-written one.
   */
  async save(snapshot: WorldSnapshot, meta: SaveMeta): Promise<SaveFileV1> {
    const file = SaveManager.compose(snapshot, meta);

    const primary = await this.storage.read('save');
    const backup1 = await this.storage.read('save.bak1');

    if (backup1 !== null) await this.storage.write('save.bak2', backup1);
    if (primary !== null) await this.storage.write('save.bak1', primary);
    await this.storage.write('save', JSON.stringify(file));

    return file;
  }

  /** Primary slot first, then each backup in turn. */
  async load(): Promise<LoadResult> {
    const slotErrors: string[] = [];
    let sawFutureVersion = false;
    let sawAnything = false;

    for (const slot of SAVE_SLOTS) {
      const raw = await this.storage.read(slot);
      if (raw === null) {
        slotErrors.push(`${slot}: empty`);
        continue;
      }
      sawAnything = true;

      const parsed = this.parseSlot(raw);
      if (parsed.ok) {
        return {
          ok: true,
          save: parsed.save,
          slot,
          recovered: slot !== 'save',
          migrationSteps: parsed.migrationSteps,
        };
      }

      slotErrors.push(`${slot}: ${parsed.detail}`);
      if (parsed.reason === 'future-version') sawFutureVersion = true;
    }

    if (!sawAnything) {
      return { ok: false, reason: 'empty', detail: 'no save found in any slot', slotErrors };
    }
    if (sawFutureVersion) {
      return {
        ok: false,
        reason: 'future-version',
        detail: 'save was written by a newer build',
        slotErrors,
      };
    }
    return {
      ok: false,
      reason: 'corrupt',
      detail: 'every slot failed validation',
      slotErrors,
    };
  }

  /** Import a save the player supplied as a file. Same validation as a stored slot. */
  importJson(raw: string): LoadResult {
    const parsed = this.parseSlot(raw);
    if (parsed.ok) {
      return {
        ok: true,
        save: parsed.save,
        slot: 'save',
        recovered: false,
        migrationSteps: parsed.migrationSteps,
      };
    }
    return { ok: false, reason: parsed.reason, detail: parsed.detail, slotErrors: [parsed.detail] };
  }

  /** Pretty-printed, so a player who opens the file sees something legible. */
  static exportJson(save: SaveFileV1): string {
    return JSON.stringify(save, null, 2);
  }

  async clear(): Promise<void> {
    for (const slot of SAVE_SLOTS) await this.storage.remove(slot);
  }

  private parseSlot(
    raw: string,
  ):
    | { ok: true; save: SaveFileV1; migrationSteps: number }
    | { ok: false; reason: LoadFailureReason; detail: string } {
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'corrupt', detail: 'not valid JSON' };
    }

    const header = saveHeaderSchema.safeParse(decoded);
    if (!header.success) {
      return { ok: false, reason: 'corrupt', detail: 'missing or invalid schemaVersion' };
    }
    if (header.data.schemaVersion > CURRENT_SCHEMA_VERSION) {
      return {
        ok: false,
        reason: 'future-version',
        detail: `schema v${header.data.schemaVersion} > supported v${CURRENT_SCHEMA_VERSION}`,
      };
    }

    const migrated = migrateToCurrent(decoded as Record<string, unknown>, header.data.schemaVersion);
    if (!migrated.ok) {
      const reason: LoadFailureReason = migrated.reason === 'future-version' ? 'future-version' : 'corrupt';
      return { ok: false, reason, detail: migrated.detail };
    }

    const validated = saveFileV1Schema.safeParse(migrated.save);
    if (!validated.success) {
      const first = validated.error.issues[0];
      const where = first === undefined ? 'unknown field' : first.path.join('.');
      return { ok: false, reason: 'corrupt', detail: `schema mismatch at ${where}` };
    }

    // Checksum last: a shape that already failed validation says more about what
    // went wrong than "the bytes changed".
    const expected = checksumOf(validated.data);
    if (expected !== validated.data.checksum) {
      return {
        ok: false,
        reason: 'corrupt',
        detail: `checksum mismatch (stored ${validated.data.checksum}, computed ${expected})`,
      };
    }

    return { ok: true, save: validated.data, migrationSteps: migrated.steps };
  }
}
