/**
 * CRC32 and canonical JSON — save integrity.
 *
 * **This detects corruption, not cheating.** A single-player game where a player
 * edits their own save harms nobody, and treating the player as an adversary
 * would cost real engineering to achieve nothing. Truncated writes, a storage
 * quota hit mid-flush and a browser killed during `pagehide`, by contrast, are
 * routine and they destroy progress. That is what the checksum is for.
 */

const CRC32_POLYNOMIAL = 0xedb88320;

/** Built once on first use rather than at module load, so a build that never saves never pays. */
let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable !== null) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) !== 0 ? (value >>> 1) ^ CRC32_POLYNOMIAL : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  crcTable = table;
  return table;
}

/**
 * CRC-32/ISO-HDLC over the UTF-8 bytes of the input. Eight lowercase hex chars.
 *
 * UTF-8 rather than raw UTF-16 code units so the result matches the published
 * CRC-32 test vectors — which is what lets the implementation be validated
 * against something other than itself.
 */
export function crc32(input: string): string {
  const table = getCrcTable();
  const bytes = new TextEncoder().encode(input);
  let crc = 0xffffffff;
  // Indexed rather than for-of: `for-of` over a typed array allocates an
  // iterator, and this runs over the whole save on every autosave.
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ (table[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

/**
 * JSON with object keys sorted, recursively.
 *
 * `JSON.stringify` preserves insertion order, so the checksum of a save written
 * today and the checksum of the same save after a parse/re-serialise round trip
 * would differ for no meaningful reason. Sorting makes the digest a function of
 * content alone.
 */
export function canonicalJson(value: unknown): string {
  // JSON.stringify returns undefined for these three, which would splice a hole
  // into the serialised output. None can appear in a save; normalising them to
  // null keeps a hand-edited file from producing invalid JSON.
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const entry = record[key];
    if (entry === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${canonicalJson(entry)}`);
  }
  return `{${parts.join(',')}}`;
}

/**
 * Checksum of everything in the save except the checksum field itself.
 *
 * Taking the field out rather than zeroing it means an old save whose checksum
 * slot happened to hold something else still verifies against its content.
 */
export function checksumOf(save: Readonly<Record<string, unknown>>): string {
  const { checksum: _ignored, ...rest } = save;
  return crc32(canonicalJson(rest));
}
