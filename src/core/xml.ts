// Namespace-agnostic XML helpers. Canvas exports mix several namespaces (cccv1p0,
// imscp, imsdt, imswl, blti, QTI) and we only ever care about local names.
// DOMParser does not fetch external entities or DTDs, so there is no XXE exposure.

const decoder = new TextDecoder('utf-8');

export function decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function parseXml(source: string, label = 'XML'): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error(`${label}: XML parse error: ${(err.textContent ?? '').slice(0, 200)}`);
  return doc;
}

export function parseHtml(source: string): Document {
  return new DOMParser().parseFromString(source, 'text/html');
}

/** Direct children with the given local name. */
export function kids(el: ParentNode | null | undefined, name: string): Element[] {
  if (!el) return [];
  return Array.from(el.children).filter((c) => c.localName === name);
}

export function kid(el: ParentNode | null | undefined, name: string): Element | undefined {
  return kids(el, name)[0];
}

/** Descendants with the given local name, in document order. */
export function all(el: Element | Document | null | undefined, name: string): Element[] {
  if (!el) return [];
  return Array.from(el.getElementsByTagNameNS('*', name));
}

/** Trimmed text of the first direct child named `name`, or undefined if absent/empty. */
export function text(el: ParentNode | null | undefined, name: string): string | undefined {
  const t = kid(el, name)?.textContent?.trim();
  return t ? t : undefined;
}

export function bool(el: ParentNode | null | undefined, name: string): boolean | undefined {
  const t = text(el, name);
  return t === undefined ? undefined : t === 'true';
}

export function num(el: ParentNode | null | undefined, name: string): number | undefined {
  const t = text(el, name);
  if (t === undefined) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
