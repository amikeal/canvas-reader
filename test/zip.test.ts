import { deflateSync, strToU8, zipSync } from 'fflate';
import { crc32, normalizeArchivePath, readArchive, ArchiveError } from '../src/core/zip';

describe('normalizeArchivePath', () => {
  it.each([
    ['a/b.txt', 'a/b.txt'],
    ['./a//b.txt', 'a/b.txt'],
    ['a\\b.txt', 'a/b.txt'],
    ['web_resources/My File (1).pdf', 'web_resources/My File (1).pdf'],
  ])('accepts %s', (input, out) => expect(normalizeArchivePath(input)).toBe(out));

  it.each(['../evil', 'a/../../evil', '/etc/passwd', 'C:/Windows/x', 'C:evil', 'dir/', 'a/\0b', '', '..\\evil'])(
    'rejects %j',
    (input) => expect(normalizeArchivePath(input)).toBeNull(),
  );
});

describe('readArchive', () => {
  it('drops traversal entries and reports them', async () => {
    const zip = zipSync({ 'ok.txt': strToU8('fine'), '../evil.txt': strToU8('nope'), 'a/../../b.txt': strToU8('nope') });
    const { archive, warnings } = await readArchive(zip);
    expect([...archive.keys()]).toEqual(['ok.txt']);
    expect(warnings.join('\n')).toMatch(/unsafe archive path/);
  });

  it('enforces entry-count and size limits', async () => {
    const zip = zipSync({ a: strToU8('1'), b: strToU8('2'), c: strToU8('3') });
    await expect(readArchive(zip, { maxEntries: 2, maxTotalBytes: 1e9, maxEntryBytes: 1e9 })).rejects.toBeInstanceOf(ArchiveError);
    const big = zipSync({ a: new Uint8Array(5000) });
    await expect(readArchive(big, { maxEntries: 10, maxTotalBytes: 1000, maxEntryBytes: 1e9 })).rejects.toThrow(/total/);
  });

  it('rejects non-zip input', async () => {
    await expect(readArchive(strToU8('not a zip at all'))).rejects.toBeInstanceOf(ArchiveError);
  });

  it('reads Canvas-style ZIP64 extras without a ZIP64 end record', async () => {
    const files = { 'imsmanifest.xml': strToU8('<manifest/>'), 'web_resources/a b.pdf': strToU8('%PDF-1.4 '.repeat(500)) };
    const { archive, warnings } = await readArchive(canvasStyleZip64(files));
    expect(warnings).toEqual([]);
    expect(new TextDecoder().decode(archive.get('imsmanifest.xml'))).toBe('<manifest/>');
    expect(archive.get('web_resources/a b.pdf')!.byteLength).toBe(4500);
  });

  it('warns on CRC mismatch', async () => {
    const zip = canvasStyleZip64({ 'x.txt': strToU8('hello') }, { corruptCrc: true });
    const { warnings } = await readArchive(zip);
    expect(warnings.join()).toMatch(/Checksum mismatch.*x\.txt/);
  });
});

/** Mimics rubyzip/Canvas: every entry carries ZIP64 extras, sizes are 0xFFFFFFFF, no ZIP64 EOCD. */
function canvasStyleZip64(files: Record<string, Uint8Array>, opts: { corruptCrc?: boolean } = {}): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const comp = deflateSync(data);
    const crc = (crc32(data) ^ (opts.corruptCrc ? 1 : 0)) >>> 0;
    const z64 = new DataView(new ArrayBuffer(20));
    z64.setUint16(0, 1, true);
    z64.setUint16(2, 16, true);
    z64.setBigUint64(4, BigInt(data.length), true);
    z64.setBigUint64(12, BigInt(comp.length), true);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 45, true);
    local.setUint16(8, 8, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, 0xffffffff, true);
    local.setUint32(22, 0xffffffff, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 20, true);
    const localBytes = concat([new Uint8Array(local.buffer), nameBytes, new Uint8Array(z64.buffer), comp]);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 63, true);
    cen.setUint16(6, 45, true);
    cen.setUint16(10, 8, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, 0xffffffff, true);
    cen.setUint32(24, 0xffffffff, true);
    cen.setUint16(28, nameBytes.length, true);
    cen.setUint16(30, 20, true);
    cen.setUint32(42, offset, true);
    central.push(concat([new Uint8Array(cen.buffer), nameBytes, new Uint8Array(z64.buffer)]));
    chunks.push(localBytes);
    offset += localBytes.length;
  }
  const cd = concat(central);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, central.length, true);
  eocd.setUint16(10, central.length, true);
  eocd.setUint32(12, cd.length, true);
  eocd.setUint32(16, offset, true);
  return concat([...chunks, cd, new Uint8Array(eocd.buffer)]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
