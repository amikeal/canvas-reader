// In-page preview of the generated site without writing anything to disk.
// Pages are loaded into a sandboxed srcdoc iframe (no scripts); site-internal links
// are intercepted and non-HTML files are served from blob: URLs.

const decoder = new TextDecoder();

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  txt: 'text/plain',
  css: 'text/css',
};

export class Preview {
  private blobs = new Map<string, string>();
  private history: string[] = [];

  constructor(
    private frame: HTMLIFrameElement,
    private files: Map<string, Uint8Array>,
    private onNavigate: (path: string) => void,
  ) {}

  private blobUrl(path: string): string {
    let url = this.blobs.get(path);
    if (!url) {
      const ext = path.split('.').pop()?.toLowerCase() ?? '';
      // Never hand HTML to the browser as a top-level blob: it would run with this app's origin.
      const type = MIME[ext] ?? 'application/octet-stream';
      url = URL.createObjectURL(new Blob([this.files.get(path)! as BlobPart], { type }));
      this.blobs.set(path, url);
    }
    return url;
  }

  /** Resolve a relative URL found in `from` to a site path, or null if external. */
  private resolve(from: string, value: string): { path: string; hash: string } | null {
    if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return null;
    const u = new URL(value, `https://site.invalid/${from}`);
    if (u.host !== 'site.invalid') return null;
    let path: string;
    try {
      path = decodeURIComponent(u.pathname.slice(1));
    } catch {
      return null;
    }
    return this.files.has(path) ? { path, hash: u.hash } : null;
  }

  show(path: string, hash = '', push = true): void {
    const bytes = this.files.get(path);
    if (!bytes) return;
    if (push) this.history.push(path);
    const doc = new DOMParser().parseFromString(decoder.decode(bytes), 'text/html');

    for (const link of Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))) {
      const r = this.resolve(path, link.getAttribute('href') ?? '');
      if (!r) continue;
      const style = doc.createElement('style');
      style.textContent = decoder.decode(this.files.get(r.path)!);
      link.replaceWith(style);
    }
    for (const el of Array.from(doc.querySelectorAll('[href], [src], [poster]'))) {
      for (const attr of ['href', 'src', 'poster']) {
        const v = el.getAttribute(attr);
        if (v === null) continue;
        if (attr === 'href' && v.startsWith('#')) continue;
        const r = this.resolve(path, v);
        if (!r) {
          if (el.tagName === 'A' && /^https?:/i.test(v)) el.setAttribute('target', '_blank');
          continue;
        }
        if (el.tagName === 'A' && r.path.endsWith('.html')) {
          el.setAttribute('href', r.hash || '#');
          el.setAttribute('data-cr-path', r.path);
          el.setAttribute('data-cr-hash', r.hash);
        } else if (r.path.endsWith('.html')) {
          el.removeAttribute(attr); // e.g. iframe of an uploaded .html file: not previewed
        } else {
          el.setAttribute(attr, this.blobUrl(r.path));
          if (el.tagName === 'A') el.setAttribute('target', '_blank');
        }
      }
    }

    this.frame.onload = () => {
      const d = this.frame.contentDocument;
      if (!d) return;
      d.addEventListener('click', (ev) => {
        const a = (ev.target as Element | null)?.closest?.('a[data-cr-path]');
        if (!a) return;
        ev.preventDefault();
        this.show(a.getAttribute('data-cr-path')!, a.getAttribute('data-cr-hash') ?? '');
      });
      if (hash) d.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
      else this.frame.contentWindow?.scrollTo(0, 0);
    };
    this.frame.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
    this.onNavigate(path);
  }

  back(): void {
    if (this.history.length < 2) return;
    this.history.pop();
    this.show(this.history[this.history.length - 1]!, '', false);
  }

  dispose(): void {
    for (const url of this.blobs.values()) URL.revokeObjectURL(url);
    this.blobs.clear();
    this.history = [];
    this.frame.srcdoc = '';
  }
}
