import { COMMAND_LOG_CAPACITY } from '@config/simulation';
import type { Command } from './commands';

/**
 * Ring buffer of applied commands.
 *
 * Bounded rather than unbounded: a session that runs for hours would otherwise
 * grow without limit for a diagnostic almost nobody reads. The last 5 000
 * commands cover any plausible "what did I just do" window; the complete log is
 * a dev-mode export, not something a player's memory pays for.
 *
 * `overflowed` is exposed so a caller can tell "this is the whole session" from
 * "this is the tail of it" — a replay of a truncated log does not reproduce the
 * world, and silently pretending otherwise would be the worst kind of bug here.
 */
export class CommandLog {
  readonly capacity: number;

  private readonly entries: (Command | undefined)[];
  private writeIndex = 0;
  private total = 0;

  constructor(capacity: number = COMMAND_LOG_CAPACITY) {
    if (capacity <= 0) throw new RangeError('CommandLog capacity must be positive');
    this.capacity = capacity;
    this.entries = new Array<Command | undefined>(capacity).fill(undefined);
  }

  /** Commands currently retained (≤ capacity). */
  get size(): number {
    return Math.min(this.total, this.capacity);
  }

  /** Commands ever appended, including any the ring has since dropped. */
  get totalAppended(): number {
    return this.total;
  }

  get overflowed(): boolean {
    return this.total > this.capacity;
  }

  append(command: Command): void {
    this.entries[this.writeIndex] = command;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.total++;
  }

  /** Oldest retained command first. */
  at(index: number): Command {
    if (index < 0 || index >= this.size) {
      throw new RangeError(`CommandLog index ${index} is outside 0..${this.size - 1}`);
    }
    const start = this.overflowed ? this.writeIndex : 0;
    const entry = this.entries[(start + index) % this.capacity];
    if (entry === undefined) {
      throw new RangeError(`CommandLog slot ${index} is empty`);
    }
    return entry;
  }

  /** Snapshot in chronological order. Allocates — diagnostics and tests only. */
  toArray(): Command[] {
    const out: Command[] = [];
    for (let i = 0; i < this.size; i++) out.push(this.at(i));
    return out;
  }

  clear(): void {
    this.entries.fill(undefined);
    this.writeIndex = 0;
    this.total = 0;
  }
}
