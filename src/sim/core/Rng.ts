import { seedWordsFromString } from '../math/hash';

/**
 * sfc32 — Small Fast Counter, 32-bit.
 *
 * Chosen over `Math.random` (banned here) and over a Mersenne Twister because
 * the whole state is four 32-bit words: it serialises into a save file in 16
 * bytes and restores exactly, which is what makes "save at tick 5000, reload,
 * run to 10 000" produce the same world as an uninterrupted run.
 *
 * Passes PractRand well past the sequence lengths this game will ever consume.
 */

export interface RngState {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

/**
 * The six independent streams.
 *
 * Separation is not tidiness. With one shared stream, adding a single
 * `rng.next()` call to a new system shifts the output of every other system,
 * which breaks every economy test and every visual golden at once. Each system
 * draws from its own stream so systems stay isolated from each other's changes.
 *
 * The array order is fixed: it is the iteration order used when hashing and
 * serialising, and `Object.keys` order is not something to depend on.
 */
export const RNG_STREAM_NAMES = ['traffic', 'conversion', 'customer', 'tips', 'events', 'cosmetic'] as const;

export type RngStreamName = (typeof RNG_STREAM_NAMES)[number];

/**
 * `cosmetic` is excluded from the world hash on purpose: it drives visual
 * variation (character part swaps, vehicle colour) that must never change a
 * simulation outcome. A test asserts that draining it leaves the hash untouched.
 */
export const COSMETIC_STREAM: RngStreamName = 'cosmetic';

export type RngStates = Readonly<Record<RngStreamName, RngState>>;

/** splitmix32 — used only to expand a seed into well-mixed sfc32 state words. */
function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return (): number => {
    state = (state + 0x9e3779b9) | 0;
    let z = state ^ (state >>> 16);
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return z >>> 0;
  };
}

/** sfc32 mixes poorly for the first few outputs from a raw seed. */
const SEED_DISCARD_ROUNDS = 12;

export class Rng {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;

  constructor(state: RngState) {
    this.setState(state);
  }

  /**
   * Derive a stream from a numeric seed and a stream name.
   *
   * The name participates in the derivation, so two streams of the same game
   * start at unrelated points and the sequences never accidentally align.
   */
  static fromSeed(seed: number, streamName: string): Rng {
    const [w0, w1] = seedWordsFromString(`${seed}:${streamName}`);
    const next = splitmix32(w0 ^ w1);
    const rng = new Rng({ a: next(), b: next(), c: next(), d: next() });
    for (let i = 0; i < SEED_DISCARD_ROUNDS; i++) rng.next();
    return rng;
  }

  setState(state: RngState): void {
    this.a = state.a | 0;
    this.b = state.b | 0;
    this.c = state.c | 0;
    this.d = state.d | 0;
  }

  saveState(): RngState {
    return { a: this.a, b: this.b, c: this.c, d: this.d };
  }

  /** Raw 32-bit output. */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextUint32() / 4_294_967_296;
  }

  /**
   * Uniform integer in [0, maxExclusive).
   *
   * Derived from the float rather than by modulo: modulo of a 32-bit draw is
   * biased for any max that does not divide 2^32, and archetype-distribution
   * tests assert ±2% over 10 000 draws.
   */
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('Rng.pick called with an empty array');
    }
    const chosen = items[this.int(items.length)];
    if (chosen === undefined) {
      // Unreachable given the bound above; present because
      // noUncheckedIndexedAccess cannot know that and assertions are banned.
      throw new RangeError('Rng.pick produced an out-of-range index');
    }
    return chosen;
  }
}

/** The six streams of one game, addressable by name and iterable in a fixed order. */
export class RngStreams {
  private readonly streams: ReadonlyMap<RngStreamName, Rng>;

  constructor(seed: number) {
    const map = new Map<RngStreamName, Rng>();
    for (const name of RNG_STREAM_NAMES) {
      map.set(name, Rng.fromSeed(seed, name));
    }
    this.streams = map;
  }

  get(name: RngStreamName): Rng {
    const stream = this.streams.get(name);
    if (stream === undefined) {
      throw new RangeError(`Unknown RNG stream: ${name}`);
    }
    return stream;
  }

  get traffic(): Rng {
    return this.get('traffic');
  }
  get conversion(): Rng {
    return this.get('conversion');
  }
  get customer(): Rng {
    return this.get('customer');
  }
  get tips(): Rng {
    return this.get('tips');
  }
  get events(): Rng {
    return this.get('events');
  }
  get cosmetic(): Rng {
    return this.get('cosmetic');
  }

  saveStates(): RngStates {
    const out = {} as Record<RngStreamName, RngState>;
    for (const name of RNG_STREAM_NAMES) {
      out[name] = this.get(name).saveState();
    }
    return out;
  }

  loadStates(states: RngStates): void {
    for (const name of RNG_STREAM_NAMES) {
      this.get(name).setState(states[name]);
    }
  }
}
