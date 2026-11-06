import { inflateSync, zip, type AsyncZippable } from 'fflate';

/** Extracted archive: normalized relative path -> bytes. */
export type Archive = Map<string, Uint8Array>;

export interface ArchiveLimits {
  maxEntries: number;
  /** Sum of uncompressed sizes. */
  maxTotalBytes: number;
  maxEntryBytes: number;
}

// Generous: these exist to stop a hostile/corrupt archive from exhausting memory,
// not to police legitimate courses. Browsers will usually fall over before 4 GiB anyway.
export const DEFAULT_LIMITS: ArchiveLimits = {
  maxEntries: 50_000,
  maxTotalBytes: 4 * 1024 ** 3,
  maxEntryBytes: 2 * 1024 ** 3,
};

export class ArchiveError extends Error {}

/**
 * Normalize a path taken from a ZIP entry. Returns null for anything that could
 * escape the extraction root (zip-slip) or is otherwise unusable: absolute paths,
 * drive letters, `..` segments, NUL bytes, directory entries.
 */
export function normalizeArchivePath(raw: string): string | null {
  if (raw.includes('\0')) return null;
  const p = raw.replace(/\\/g, '/');
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.endsWith('/')) return null;
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return null;
    out.push(seg);
  }
  return out.length ? out.join('/') : null;
}

export interface ReadResult {
  archive: Archive;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// ZIP reader.
//
// Why not fflate's unzip: Canvas writes every entry with ZIP64 extra fields
// (sizes = 0xFFFFFFFF in the central directory) but no ZIP64 end-of-central-directory
// record. fflate only honours ZIP64 extras when that record exists, so it sees every
// file as 4 GiB and fails. This reader trusts the central directory, parses ZIP64
// extras whenever a field holds the sentinel, enforces limits on real sizes before
// inflating, and verifies each entry's CRC-32.

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOC = 0x07064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;
const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = U32_MAX;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ U32_MAX) >>> 0;
}

interface CentralEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const utf8 = new TextDecoder('utf-8');
const latin1 = new TextDecoder('latin1');

function readCentralDirectory(buf: Uint8Array): CentralEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  const u64 = (o: number) => {
    const v = dv.getBigUint64(o, true);
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ArchiveError('ZIP field out of range');
    return Number(v);
  };
  const need = (o: number, n: number) => {
    if (o < 0 || o + n > buf.byteLength) throw new ArchiveError('Truncated or corrupt ZIP file');
  };

  // End of central directory: last 22 bytes + up to 64 KiB comment.
  let eocd = -1;
  for (let o = buf.byteLength - 22; o >= Math.max(0, buf.byteLength - 22 - 0xffff); o--) {
    if (u32(o) === SIG_EOCD) {
      eocd = o;
      break;
    }
  }
  if (eocd < 0) throw new ArchiveError('Not a ZIP file (no end-of-central-directory record)');
  let count = u16(eocd + 10);
  let cdSize = u32(eocd + 12);
  let cdOffset = u32(eocd + 16);
  if (count === U16_MAX || cdSize === U32_MAX || cdOffset === U32_MAX) {
    const loc = eocd - 20;
    need(loc, 20);
    if (u32(loc) !== SIG_EOCD64_LOC) throw new ArchiveError('ZIP64 archive is missing its locator record');
    const e64 = u64(loc + 8);
    need(e64, 56);
    if (u32(e64) !== SIG_EOCD64) throw new ArchiveError('Corrupt ZIP64 end-of-central-directory record');
    count = u64(e64 + 32);
    cdSize = u64(e64 + 40);
    cdOffset = u64(e64 + 48);
  }
  need(cdOffset, cdSize);

  const entries: CentralEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    need(p, 46);
    if (u32(p) !== SIG_CEN) throw new ArchiveError('Corrupt ZIP central directory');
    const flags = u16(p + 8);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    need(p + 46, nameLen + extraLen + commentLen);
    const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
    const entry: CentralEntry = {
      name: (flags & 0x800 ? utf8 : isUtf8(nameBytes) ? utf8 : latin1).decode(nameBytes),
      flags,
      method: u16(p + 10),
      crc: u32(p + 16),
      compressedSize: u32(p + 20),
      size: u32(p + 24),
      localOffset: u32(p + 42),
    };
    // ZIP64 extra (0x0001): present fields appear in this order, only if the
    // corresponding 32-bit field is 0xFFFFFFFF.
    if (entry.size === U32_MAX || entry.compressedSize === U32_MAX || entry.localOffset === U32_MAX) {
      let x = p + 46 + nameLen;
      const end = x + extraLen;
      let found = false;
      while (x + 4 <= end) {
        const tag = u16(x);
        const len = u16(x + 2);
        if (tag === 0x0001) {
          let f = x + 4;
          const take = () => {
            if (f + 8 > x + 4 + len) throw new ArchiveError(`Corrupt ZIP64 field for ${entry.name}`);
            const v = u64(f);
            f += 8;
            return v;
          };
          if (entry.size === U32_MAX) entry.size = take();
          if (entry.compressedSize === U32_MAX) entry.compressedSize = take();
          if (entry.localOffset === U32_MAX) entry.localOffset = take();
          found = true;
          break;
        }
        x += 4 + len;
      }
      if (!found) throw new ArchiveError(`Missing ZIP64 sizes for ${entry.name}`);
    }
    entries.push(entry);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function isUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function extractEntry(buf: Uint8Array, e: CentralEntry): Uint8Array {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (e.localOffset + 30 > buf.byteLength || dv.getUint32(e.localOffset, true) !== SIG_LOC)
    throw new ArchiveError(`Corrupt local header for ${e.name}`);
  const start = e.localOffset + 30 + dv.getUint16(e.localOffset + 26, true) + dv.getUint16(e.localOffset + 28, true);
  if (start + e.compressedSize > buf.byteLength) throw new ArchiveError(`Truncated data for ${e.name}`);
  const data = buf.subarray(start, start + e.compressedSize);
  let out: Uint8Array;
  if (e.method === 0) out = data;
  else if (e.method === 8) out = inflateSync(data, { out: new Uint8Array(e.size) });
  else throw new ArchiveError(`Unsupported compression method ${e.method} for ${e.name}`);
  if (out.byteLength !== e.size) throw new ArchiveError(`Size mismatch for ${e.name}`);
  return out;
}

export async function readArchive(data: Uint8Array, limits: ArchiveLimits = DEFAULT_LIMITS): Promise<ReadResult> {
  const warnings: string[] = [];
  const entries = readCentralDirectory(data);
  const wanted: { entry: CentralEntry; path: string }[] = [];
  let total = 0;
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue; // directory
    const path = normalizeArchivePath(entry.name);
    if (path === null) {
      warnings.push(`Skipped unsafe archive path: ${JSON.stringify(entry.name)}`);
      continue;
    }
    if (entry.flags & 0x1) throw new ArchiveError(`Encrypted archive entries are not supported (${entry.name})`);
    if (wanted.length >= limits.maxEntries) throw new ArchiveError(`Archive has more than ${limits.maxEntries} entries`);
    if (entry.size > limits.maxEntryBytes) throw new ArchiveError(`Archive entry ${entry.name} exceeds size limit`);
    total += entry.size;
    if (total > limits.maxTotalBytes) throw new ArchiveError('Archive exceeds total uncompressed size limit');
    wanted.push({ entry, path });
  }

  const archive: Archive = new Map();
  let sinceYield = 0;
  for (const { entry, path } of wanted) {
    if (archive.has(path)) {
      warnings.push(`Duplicate archive path ignored: ${path}`);
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = extractEntry(data, entry);
    } catch (e) {
      if (e instanceof ArchiveError) throw e;
      throw new ArchiveError(`Could not decompress ${entry.name}: ${(e as Error).message}`);
    }
    if (crc32(bytes) !== entry.crc) warnings.push(`Checksum mismatch (file may be damaged): ${path}`);
    archive.set(path, bytes);
    // Keep the UI responsive on large exports.
    sinceYield += entry.compressedSize;
    if (sinceYield > 8 * 1024 ** 2) {
      sinceYield = 0;
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return { archive, warnings };
}

const STORED_EXT = /\.(pdf|pptx?|docx?|xlsx?|zip|jpe?g|png|gif|webp|mp4|m4v|mov|mp3|m4a|ogg|webm|gz|7z)$/i;

/** Build a ZIP; already-compressed formats are stored rather than re-deflated. */
export function writeArchive(files: Map<string, Uint8Array>, rootDir = ''): Promise<Uint8Array> {
  const input: AsyncZippable = {};
  const prefix = rootDir ? rootDir.replace(/\/+$/, '') + '/' : '';
  for (const [path, bytes] of files) {
    input[prefix + path] = [bytes, { level: STORED_EXT.test(path) ? 0 : 6 }];
  }
  return new Promise((resolve, reject) => {
    zip(input, (err, out) => (err ? reject(err) : resolve(out)));
  });
}
