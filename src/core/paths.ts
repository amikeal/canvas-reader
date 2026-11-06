// Output-site path helpers. All site paths are relative to the site root and use '/'.

/** Lower-case, filesystem-safe slug. */
export function slugify(s: string, fallback = 'item'): string {
  const slug = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

/** Percent-encode each path segment so names with spaces, #, ? etc. survive as URLs. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Relative URL from one site file to another (both root-relative paths). */
export function relUrl(from: string, to: string, fragment = ''): string {
  const depth = from.split('/').length - 1;
  return '../'.repeat(depth) + encodePath(to) + fragment;
}

/** Characters invalid in Windows/macOS file names, replaced so the unzipped site works everywhere. */
export function safeFileSegment(seg: string): string {
  const cleaned = seg.replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '');
  return cleaned || '_';
}
