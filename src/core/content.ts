// Turns raw Canvas HTML bodies into safe, self-contained HTML for the static site:
//   1. sanitize with DOMPurify (no scripts, event handlers, forms, data-* attrs;
//      iframes only for https / local targets, and external ones are sandboxed)
//   2. resolve Canvas export tokens ($IMS-CC-FILEBASE$, $WIKI_REFERENCE$, ...) and
//      links to the original Canvas course into relative links within the site
//   3. mark anything that can't be resolved offline as unavailable.

import createDOMPurify from 'dompurify';
import { relUrl } from './paths';

export interface LinkTargets {
  /** Path relative to web_resources/ (decoded) -> site path. */
  fileByPath(path: string): string | undefined;
  /** Manifest resource id -> site path. */
  fileById(id: string): string | undefined;
  page(idOrSlug: string): string | undefined;
  assignment(id: string): string | undefined;
  discussion(id: string): string | undefined;
  quiz(id: string): string | undefined;
  module(id: string): string | undefined;
  /** Course-level section, e.g. "modules" -> "modules.html". */
  section(name: string): string | undefined;
}

export type Resolution =
  | { kind: 'local'; path: string; fragment: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'passthrough' };

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function splitUrl(rest: string): { path: string; fragment: string } {
  const hash = rest.indexOf('#');
  const fragment = hash >= 0 ? rest.slice(hash) : '';
  let path = hash >= 0 ? rest.slice(0, hash) : rest;
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  return { path: path.replace(/^\/+/, '').replace(/\/+$/, ''), fragment };
}

const SECTION_ALIASES: Record<string, string> = {
  '': 'home',
  home: 'home',
  modules: 'modules',
  assignments: 'assignments',
  'assignments/syllabus': 'syllabus',
  syllabus: 'syllabus',
  pages: 'pages',
  wiki: 'pages',
  files: 'files',
  discussion_topics: 'discussions',
  announcements: 'announcements',
  quizzes: 'quizzes',
};

function resolveObject(type: string, id: string, t: LinkTargets): string | undefined {
  switch (type) {
    case 'assignments':
      return t.assignment(id);
    case 'discussion_topics':
    case 'announcements':
      return t.discussion(id);
    case 'quizzes':
      return t.quiz(id);
    case 'pages':
    case 'wiki':
      return t.page(id);
    case 'attachments':
    case 'files':
    case 'file_ref':
      return t.fileById(id);
    case 'modules':
      return t.module(id);
    default:
      return undefined;
  }
}

/** Resolve a course-relative path like "assignments/123" or "pages/foo". */
function resolveCoursePath(path: string, t: LinkTargets): string | undefined {
  const section = SECTION_ALIASES[path];
  if (section !== undefined) return t.section(section);
  const m = /^([a-z_]+)\/([^/]+)(?:\/.*)?$/.exec(path);
  if (m) return resolveObject(m[1]!, safeDecode(m[2]!), t);
  return undefined;
}

export function resolveUrl(raw: string, t: LinkTargets): Resolution {
  const url = raw.trim();
  const tok = /^\$([A-Z_-]+)\$(.*)$/.exec(url);
  if (tok) {
    const [, name, rest] = tok;
    const { path, fragment } = splitUrl(rest!);
    let target: string | undefined;
    switch (name) {
      case 'IMS-CC-FILEBASE':
      case 'IMS_CC_FILEBASE': {
        const decoded = safeDecode(path);
        target = t.fileByPath(decoded) ?? t.fileByPath(decoded.replace(/\/(preview|download)$/, ''));
        if (!target) return { kind: 'unavailable', reason: 'file not included in the export' };
        return { kind: 'local', path: target, fragment: '' };
      }
      case 'WIKI_REFERENCE': {
        const m = /^pages\/(.+)$/.exec(path);
        target = m ? t.page(safeDecode(m[1]!)) : t.section('pages');
        break;
      }
      case 'CANVAS_OBJECT_REFERENCE': {
        const m = /^([a-z_]+)\/([^/]+)/.exec(path);
        target = m ? resolveObject(m[1]!, safeDecode(m[2]!), t) : undefined;
        break;
      }
      case 'CANVAS_COURSE_REFERENCE':
        if (/^external_tools\b/.test(path)) return { kind: 'unavailable', reason: 'external tool (LTI) — requires Canvas' };
        target = resolveCoursePath(path, t);
        break;
      default:
        target = undefined;
    }
    return target ? { kind: 'local', path: target, fragment } : { kind: 'unavailable', reason: 'Canvas link with no offline equivalent' };
  }

  // Links that point back at the live Canvas course (relative or absolute).
  const canvas = /^(?:https?:\/\/([^/]+))?\/courses\/\d+(?:\/(.*))?$/i.exec(url);
  if (canvas && (!canvas[1] || /instructure\.com$|canvas/i.test(canvas[1]))) {
    const { path, fragment } = splitUrl(canvas[2] ?? '');
    if (/^external_tools\b/.test(path)) return { kind: 'unavailable', reason: 'external tool (LTI) — requires Canvas' };
    const target = resolveCoursePath(path, t);
    if (target) return { kind: 'local', path: target, fragment };
    return { kind: 'unavailable', reason: 'link to live Canvas course' };
  }
  if (/^\/(media_objects|media_objects_iframe|equation_images|users|files)\//.test(url)) {
    return { kind: 'unavailable', reason: 'Canvas-hosted resource' };
  }
  return { kind: 'passthrough' };
}

// ---------------------------------------------------------------------------

let purifier: ReturnType<typeof createDOMPurify> | undefined;

const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-presentation allow-forms';

function getPurifier(): ReturnType<typeof createDOMPurify> {
  if (purifier) return purifier;
  purifier = createDOMPurify(globalThis.window);
  purifier.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName !== 'iframe') return;
    const el = node as Element;
    const src = (el.getAttribute('src') ?? '').trim();
    // Only https or Canvas-local iframes survive; everything else becomes nothing.
    if (!/^https:\/\//i.test(src) && !src.startsWith('$') && !src.startsWith('/')) el.remove();
  });
  purifier.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (el.tagName === 'A' || el.tagName === 'AREA') {
      const target = el.getAttribute('target');
      if (target && target !== '_blank') el.removeAttribute('target');
      if (/^https?:/i.test(el.getAttribute('href') ?? '')) el.setAttribute('rel', 'noopener noreferrer');
    } else if (el.tagName === 'IFRAME') {
      if (/^https:\/\//i.test(el.getAttribute('src') ?? '')) {
        el.setAttribute('sandbox', IFRAME_SANDBOX);
        el.setAttribute('referrerpolicy', 'no-referrer');
      }
      el.setAttribute('loading', 'lazy');
    } else if (el.tagName === 'IMG') {
      el.removeAttribute('srcset');
    }
  });
  return purifier;
}

export function sanitize(html: string): HTMLElement {
  // RETURN_DOM yields the <body> element holding the cleaned content.
  return getPurifier().sanitize(html, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['target', 'allow', 'allowfullscreen', 'frameborder', 'scrolling'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'option', 'base', 'meta', 'link', 'object', 'embed'],
    RETURN_DOM: true,
  }) as HTMLElement;
}

const URL_ATTRS: [string, string][] = [
  ['a', 'href'],
  ['area', 'href'],
  ['img', 'src'],
  ['iframe', 'src'],
  ['video', 'src'],
  ['video', 'poster'],
  ['audio', 'src'],
  ['source', 'src'],
  ['track', 'src'],
];

export interface RenderedContent {
  html: string;
  unresolved: number;
}

/** Sanitize + rewrite a Canvas HTML body for a page that will live at `fromPath`. */
export function renderContent(raw: string, fromPath: string, targets: LinkTargets): RenderedContent {
  const root = sanitize(raw);
  const doc = root.ownerDocument;
  let unresolved = 0;
  for (const [tag, attr] of URL_ATTRS) {
    for (const el of Array.from(root.querySelectorAll(`${tag}[${attr}]`))) {
      const value = el.getAttribute(attr) ?? '';
      const r = resolveUrl(value, targets);
      if (r.kind === 'local') {
        el.setAttribute(attr, relUrl(fromPath, r.path, r.fragment));
        if (tag === 'a') el.removeAttribute('rel');
      } else if (r.kind === 'unavailable') {
        unresolved++;
        const note = `Not available in this offline copy: ${r.reason}`;
        if (tag === 'a' || tag === 'area') {
          el.removeAttribute(attr);
          el.removeAttribute('target');
          el.classList.add('cr-unavailable');
          el.setAttribute('title', note);
        } else if (tag === 'iframe') {
          const div = doc.createElement('div');
          div.className = 'cr-unavailable-embed';
          div.textContent = `Embedded content unavailable — ${r.reason}.`;
          el.replaceWith(div);
        } else {
          el.removeAttribute(attr);
          el.classList.add('cr-unavailable');
          el.setAttribute('title', note);
        }
      }
    }
  }
  return { html: root.innerHTML, unresolved };
}
