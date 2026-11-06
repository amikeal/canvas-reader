// .imscc (IMS Common Cartridge 1.1 + Canvas cccv1p0 extensions) -> Course model.

import type {
  Assignment,
  AssignmentGroup,
  Course,
  Discussion,
  FileEntry,
  GradingStandard,
  LtiLink,
  Module,
  ModuleItem,
  Page,
  Quiz,
  QuestionBank,
  Tab,
  TabKind,
  WebLink,
} from './model';
import type { Archive } from './zip';
import { all, bool, decode, kid, kids, num, parseHtml, parseXml, text } from './xml';
import { parseQti, type QtiFile } from './qti';
import { ianaZone } from './dates';

interface Resource {
  id: string;
  type: string;
  href?: string;
  files: string[];
  deps: string[];
}

export class CartridgeError extends Error {}

const TAB_IDS: Record<number, TabKind> = {
  0: 'home',
  1: 'syllabus',
  2: 'pages',
  3: 'assignments',
  4: 'quizzes',
  8: 'discussions',
  10: 'modules',
  11: 'files',
  14: 'announcements',
};
const TAB_LABELS: Record<TabKind, string> = {
  home: 'Home',
  announcements: 'Announcements',
  syllabus: 'Syllabus',
  modules: 'Modules',
  assignments: 'Assignments',
  discussions: 'Discussions',
  pages: 'Pages',
  files: 'Files',
  quizzes: 'Quizzes',
};
// Canvas's default course navigation order (for tabs absent from tab_configuration).
const DEFAULT_TAB_ORDER: TabKind[] = [
  'home',
  'announcements',
  'assignments',
  'discussions',
  'pages',
  'files',
  'syllabus',
  'quizzes',
  'modules',
];

const KNOWN_RESOURCE_TYPES = new Set([
  'webcontent',
  'imsdt_xmlv1p1',
  'imswl_xmlv1p1',
  'imsbasiclti_xmlv1p3',
  'imsbasiclti_xmlv1p0',
  'associatedcontent/imscc_xmlv1p1/learning-application-resource',
  'imsqti_xmlv1p2/imscc_xmlv1p1/assessment',
]);
const UNRENDERED_SETTINGS: Record<string, string> = {
  'course_settings/rubrics.xml': 'rubrics',
  'course_settings/events.xml': 'calendar events',
  'course_settings/learning_outcomes.xml': 'learning outcomes',
  'course_settings/external_feeds.xml': 'external feeds',
  'course_settings/course_paces.xml': 'course pacing',
  'course_settings/blueprint.xml': 'blueprint settings',
};

export function parseCartridge(archive: Archive, initialWarnings: string[] = []): Course {
  const warnings = [...initialWarnings];
  const readText = (path: string): string | undefined => {
    const b = archive.get(path);
    return b ? decode(b) : undefined;
  };
  const readXml = (path: string): Document | undefined => {
    const s = readText(path);
    if (s === undefined) return undefined;
    try {
      return parseXml(s, path);
    } catch (e) {
      warnings.push((e as Error).message);
      return undefined;
    }
  };

  const manifest = readXml('imsmanifest.xml');
  if (!manifest) throw new CartridgeError('No imsmanifest.xml found — this does not look like a Common Cartridge / Canvas export.');

  // ---- resources --------------------------------------------------------
  const resources = new Map<string, Resource>();
  for (const r of all(manifest, 'resource')) {
    const id = r.getAttribute('identifier');
    if (!id) continue;
    resources.set(id, {
      id,
      type: r.getAttribute('type') ?? '',
      href: r.getAttribute('href') ?? undefined,
      files: kids(r, 'file').map((f) => f.getAttribute('href') ?? '').filter(Boolean),
      deps: kids(r, 'dependency').map((d) => d.getAttribute('identifierref') ?? '').filter(Boolean),
    });
  }
  const unknownTypes = new Map<string, number>();
  for (const r of resources.values()) {
    if (!KNOWN_RESOURCE_TYPES.has(r.type)) unknownTypes.set(r.type, (unknownTypes.get(r.type) ?? 0) + 1);
  }
  for (const [t, n] of unknownTypes) warnings.push(`${n} resource(s) of unsupported type "${t}" were not rendered.`);
  for (const [path, what] of Object.entries(UNRENDERED_SETTINGS)) {
    if (archive.has(path)) warnings.push(`This export contains ${what} (${path}), which this version does not render.`);
  }

  // ---- course settings --------------------------------------------------
  const settings = readXml('course_settings/course_settings.xml');
  const courseEl = settings?.documentElement;
  const lomTitle = all(all(manifest, 'general')[0], 'string')[0]?.textContent?.trim();
  const exportedAt = all(all(manifest, 'lifeCycle')[0], 'dateTime')[0]?.textContent?.trim();

  // ---- files ------------------------------------------------------------
  const hrefToResource = new Map<string, string>();
  for (const r of resources.values()) {
    if (r.type === 'webcontent' && r.href?.startsWith('web_resources/')) hrefToResource.set(r.href, r.id);
  }
  const hiddenFolders: string[] = [];
  const filesMeta = readXml('course_settings/files_meta.xml');
  for (const f of all(filesMeta, 'folder')) {
    if (bool(f, 'hidden') || bool(f, 'locked')) {
      const p = f.getAttribute('path');
      if (p) hiddenFolders.push(p.replace(/\/+$/, '') + '/');
    }
  }
  const files: FileEntry[] = [];
  for (const [path, bytes] of archive) {
    if (!path.startsWith('web_resources/')) continue;
    const rel = path.slice('web_resources/'.length);
    files.push({
      id: hrefToResource.get(path),
      path: rel,
      archivePath: path,
      size: bytes.byteLength,
      hidden: hiddenFolders.some((h) => rel.startsWith(h)),
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  // ---- wiki pages -------------------------------------------------------
  const pages: Page[] = [];
  const usedSlugs = new Set<string>();
  for (const [path, bytes] of archive) {
    if (!/^wiki_content\/[^/]+\.html?$/i.test(path)) continue;
    const doc = parseHtml(decode(bytes));
    const meta = (n: string) => doc.querySelector(`meta[name="${n}"]`)?.getAttribute('content') ?? undefined;
    const resourceId = [...resources.values()].find((r) => r.href === path)?.id;
    let slug = path.replace(/^wiki_content\//, '').replace(/\.html?$/i, '');
    while (usedSlugs.has(slug)) slug += '-1';
    usedSlugs.add(slug);
    const id = meta('identifier') ?? resourceId ?? slug;
    pages.push({
      id,
      resourceId: resourceId ?? id,
      slug,
      title: doc.title?.trim() || slug,
      html: doc.body?.innerHTML ?? '',
      published: (meta('workflow_state') ?? 'active') !== 'unpublished',
      frontPage: meta('front_page') === 'true',
    });
  }
  pages.sort((a, b) => a.title.localeCompare(b.title));

  // ---- assignments ------------------------------------------------------
  const assignments: Assignment[] = [];
  const timeZones: string[] = [];
  const parseAssignmentEl = (el: Element, id: string, html: string): Assignment => {
    const tz = text(el, 'time_zone_edited');
    if (tz) timeZones.push(tz);
    const list = (n: string) =>
      (text(el, n) ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return {
      id,
      title: text(el, 'title') ?? 'Untitled assignment',
      html,
      dueAt: text(el, 'due_at'),
      unlockAt: text(el, 'unlock_at'),
      lockAt: text(el, 'lock_at'),
      allDay: bool(el, 'all_day') ?? false,
      timeZone: tz,
      points: num(el, 'points_possible'),
      gradingType: text(el, 'grading_type'),
      submissionTypes: list('submission_types'),
      allowedExtensions: list('allowed_extensions'),
      groupId: text(el, 'assignment_group_identifierref'),
      position: num(el, 'position'),
      published: (text(el, 'workflow_state') ?? 'published') !== 'unpublished',
      quizId: text(el, 'quiz_identifierref'),
      discussionId: text(el, 'discussion_topic_identifierref'),
      externalToolUrl: text(el, 'external_tool_url'),
      peerReviews: bool(el, 'peer_reviews') ?? false,
    };
  };
  for (const [path] of archive) {
    const m = /^([^/]+)\/assignment_settings\.xml$/.exec(path);
    if (!m) continue;
    const dir = m[1]!;
    const doc = readXml(path);
    if (!doc) continue;
    const el = doc.documentElement;
    const id = el.getAttribute('identifier') ?? dir;
    const res = resources.get(id) ?? resources.get(dir);
    const htmlPath =
      (res?.href && res.href.endsWith('.html') ? res.href : undefined) ??
      [...archive.keys()].find((k) => k.startsWith(dir + '/') && /\.html?$/i.test(k));
    const htmlDoc = htmlPath ? parseHtml(readText(htmlPath) ?? '') : undefined;
    assignments.push(parseAssignmentEl(el, id, htmlDoc?.body?.innerHTML ?? ''));
  }

  // ---- discussions & announcements -------------------------------------
  const topicMetas = new Map<string, Element>();
  for (const r of resources.values()) {
    if (r.type !== 'associatedcontent/imscc_xmlv1p1/learning-application-resource' || !r.href?.endsWith('.xml')) continue;
    const el = readXml(r.href)?.documentElement;
    if (el?.localName === 'topicMeta') topicMetas.set(text(el, 'topic_id') ?? '', el);
  }
  const discussions: Discussion[] = [];
  for (const r of resources.values()) {
    if (r.type !== 'imsdt_xmlv1p1') continue;
    const topicPath = r.files[0] ?? r.href;
    const topic = topicPath ? readXml(topicPath)?.documentElement : undefined;
    if (!topic) continue;
    const meta = topicMetas.get(r.id) ?? r.deps.map((d) => topicMetas.get(d)).find(Boolean);
    let html = kid(topic, 'text')?.textContent ?? '';
    const attachments = all(kid(topic, 'attachments'), 'attachment')
      .map((a) => a.getAttribute('href'))
      .filter((h): h is string => !!h);
    if (attachments.length) {
      html += '<p><strong>Attachments:</strong></p><ul>';
      for (const h of attachments) {
        const name = decodeURIComponent(h.split('/').pop() ?? h);
        html += `<li><a href="${h.replace(/"/g, '&quot;')}">${name.replace(/[&<>]/g, '')}</a></li>`;
      }
      html += '</ul>';
    }
    const state = text(meta, 'workflow_state') ?? 'active';
    const asgEl = kid(meta, 'assignment');
    discussions.push({
      id: r.id,
      title: text(meta, 'title') ?? text(topic, 'title') ?? 'Untitled discussion',
      html,
      isAnnouncement: text(meta, 'type') === 'announcement',
      postedAt: text(meta, 'posted_at'),
      delayedPostAt: text(meta, 'delayed_post_at'),
      position: num(meta, 'position'),
      published: state !== 'unpublished',
      assignment: asgEl ? parseAssignmentEl(asgEl, asgEl.getAttribute('identifier') ?? `${r.id}-assignment`, '') : undefined,
    });
  }
  discussions.sort(
    (a, b) =>
      (b.postedAt ?? b.delayedPostAt ?? '').localeCompare(a.postedAt ?? a.delayedPostAt ?? '') ||
      (b.position ?? 0) - (a.position ?? 0),
  );

  // ---- web links & LTI --------------------------------------------------
  const webLinks: WebLink[] = [];
  const ltiLinks: LtiLink[] = [];
  for (const r of resources.values()) {
    const path = r.files[0] ?? r.href;
    if (!path) continue;
    if (r.type === 'imswl_xmlv1p1') {
      const el = readXml(path)?.documentElement;
      const url = kid(el, 'url')?.getAttribute('href');
      if (el && url) webLinks.push({ id: r.id, title: text(el, 'title') ?? url, url });
    } else if (r.type.startsWith('imsbasiclti_xml')) {
      const el = readXml(path)?.documentElement;
      if (!el) continue;
      const props = new Map(all(el, 'property').map((p) => [p.getAttribute('name') ?? '', p.textContent?.trim() ?? '']));
      ltiLinks.push({
        id: r.id,
        title: text(el, 'title') ?? 'External tool',
        description: text(el, 'description'),
        launchUrl: text(el, 'secure_launch_url') ?? text(el, 'launch_url'),
        resourceLinkUrl: props.get('resource_link_url') || undefined,
      });
    }
  }

  // ---- question banks & quizzes ----------------------------------------
  const qtiCache = new Map<string, QtiFile | null>();
  const readQti = (path: string): QtiFile | null => {
    if (!qtiCache.has(path)) {
      const doc = readXml(path);
      qtiCache.set(path, doc ? parseQti(doc) : null);
    }
    return qtiCache.get(path)!;
  };
  const questionBanks: QuestionBank[] = [];
  for (const path of archive.keys()) {
    if (!/^non_cc_assessments\/[^/]+\.qti$/.test(path)) continue;
    questionBanks.push(...(readQti(path)?.banks ?? []));
  }
  const quizzes: Quiz[] = [];
  for (const path of archive.keys()) {
    const m = /^([^/]+)\/assessment_meta\.xml$/.exec(path);
    if (!m) continue;
    const dir = m[1]!;
    const el = readXml(path)?.documentElement;
    if (!el) continue;
    const id = el.getAttribute('identifier') ?? dir;
    const qti =
      readQti(`non_cc_assessments/${id}.xml.qti`)?.assessments.get(id) ??
      readQti(`${dir}/assessment_qti.xml`)?.assessments.values().next().value;
    const asgEl = kid(el, 'assignment');
    const available = bool(el, 'available');
    quizzes.push({
      id,
      title: text(el, 'title') ?? qti?.title ?? 'Untitled quiz',
      html: text(el, 'description') ?? '',
      quizType: text(el, 'quiz_type'),
      points: num(el, 'points_possible'),
      timeLimit: num(el, 'time_limit'),
      allowedAttempts: num(el, 'allowed_attempts'),
      dueAt: text(el, 'due_at'),
      unlockAt: text(el, 'unlock_at'),
      lockAt: text(el, 'lock_at'),
      shuffleAnswers: bool(el, 'shuffle_answers'),
      published: available ?? (text(el, 'workflow_state') ?? 'active') !== 'unpublished',
      questions: qti?.entries ?? [],
      assignmentId: asgEl?.getAttribute('identifier') ?? undefined,
    });
    if (!qti) warnings.push(`Quiz "${text(el, 'title') ?? id}": no question data found.`);
  }
  quizzes.sort((a, b) => a.title.localeCompare(b.title));

  // ---- modules ----------------------------------------------------------
  const modules: Module[] = [];
  const moduleMeta = readXml('course_settings/module_meta.xml');
  if (moduleMeta) {
    for (const m of kids(moduleMeta.documentElement, 'module')) {
      const items: (ModuleItem & { pos: number })[] = kids(kid(m, 'items'), 'item').map((it, i) => ({
        id: it.getAttribute('identifier') ?? `item-${i}`,
        type: text(it, 'content_type') ?? 'Unknown',
        title: text(it, 'title') ?? '',
        ref: text(it, 'identifierref'),
        url: text(it, 'url'),
        indent: Math.min(num(it, 'indent') ?? 0, 5),
        newTab: bool(it, 'new_tab') ?? false,
        published: (text(it, 'workflow_state') ?? 'active') !== 'unpublished',
        pos: num(it, 'position') ?? i,
      }));
      items.sort((a, b) => a.pos - b.pos);
      modules.push({
        id: m.getAttribute('identifier') ?? `module-${modules.length}`,
        title: text(m, 'title') ?? 'Module',
        position: num(m, 'position') ?? modules.length,
        published: (text(m, 'workflow_state') ?? 'active') !== 'unpublished',
        unlockAt: text(m, 'unlock_at'),
        requireSequential: bool(m, 'require_sequential_progress') ?? false,
        items: items.map(({ pos: _pos, ...rest }) => rest),
      });
    }
  } else {
    // Generic Common Cartridge: derive modules from the manifest organization.
    const root = all(manifest, 'organization')[0];
    const top = kids(kid(root, 'item'), 'item');
    top.forEach((m, mi) => {
      const items: ModuleItem[] = [];
      const walk = (el: Element, depth: number) => {
        for (const it of kids(el, 'item')) {
          const ref = it.getAttribute('identifierref') ?? undefined;
          const res = ref ? resources.get(ref) : undefined;
          items.push({
            id: it.getAttribute('identifier') ?? `item-${items.length}`,
            type: !res ? 'ContextModuleSubHeader' : guessItemType(res, archive),
            title: text(it, 'title') ?? '',
            ref,
            url: res?.type === 'imswl_xmlv1p1' ? webLinks.find((w) => w.id === ref)?.url : undefined,
            indent: depth,
            newTab: false,
            published: true,
          });
          walk(it, depth + 1);
        }
      };
      walk(m, 0);
      modules.push({
        id: m.getAttribute('identifier') ?? `module-${mi}`,
        title: text(m, 'title') ?? `Module ${mi + 1}`,
        position: mi,
        published: true,
        requireSequential: false,
        items,
      });
    });
  }
  modules.sort((a, b) => a.position - b.position);

  // ---- groups, grading, syllabus, tabs ---------------------------------
  const assignmentGroups: AssignmentGroup[] = kids(readXml('course_settings/assignment_groups.xml')?.documentElement, 'assignmentGroup')
    .map((g, i) => ({
      id: g.getAttribute('identifier') ?? `group-${i}`,
      title: text(g, 'title') ?? 'Assignments',
      position: num(g, 'position') ?? i,
      weight: num(g, 'group_weight'),
    }))
    .sort((a, b) => a.position - b.position);

  const gradingStandards: GradingStandard[] = kids(
    readXml('course_settings/grading_standards.xml')?.documentElement,
    'gradingStandard',
  ).map((g, i) => {
    let scheme: [string, number][] = [];
    try {
      const data = JSON.parse(text(g, 'data') ?? '[]') as unknown;
      if (Array.isArray(data)) scheme = data.filter((r): r is [string, number] => Array.isArray(r) && r.length === 2);
    } catch {
      /* ignore malformed scheme */
    }
    return {
      id: g.getAttribute('identifier') ?? `gs-${i}`,
      title: text(g, 'title') ?? 'Grading scheme',
      scheme,
      pointsBased: bool(g, 'points_based') ?? false,
    };
  });

  const syllabusRes = [...resources.values()].find((r) => r.href?.endsWith('syllabus.html'));
  const syllabusSrc = readText(syllabusRes?.href ?? 'course_settings/syllabus.html');
  const syllabusHtml = syllabusSrc ? parseHtml(syllabusSrc).body?.innerHTML : undefined;

  const tabs = parseTabs(text(courseEl, 'tab_configuration'));

  // Pick the most common zone the instructor edited dates in.
  const tzCounts = new Map<string, number>();
  for (const z of timeZones) tzCounts.set(z, (tzCounts.get(z) ?? 0) + 1);
  const tzName = [...tzCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? text(courseEl, 'time_zone');
  const timeZone = ianaZone(tzName) ?? 'UTC';
  if (tzName && !ianaZone(tzName)) warnings.push(`Unrecognized time zone "${tzName}"; dates are shown in UTC.`);

  return {
    id: courseEl?.getAttribute('identifier') ?? manifest.documentElement.getAttribute('identifier') ?? 'course',
    title: text(courseEl, 'title') ?? lomTitle ?? 'Course',
    courseCode: text(courseEl, 'course_code'),
    startAt: text(courseEl, 'start_at'),
    endAt: text(courseEl, 'conclude_at'),
    defaultView: text(courseEl, 'default_view') ?? 'modules',
    timeZone,
    exportedAt,
    syllabusHtml,
    tabs,
    modules,
    pages,
    assignments,
    assignmentGroups,
    discussions,
    quizzes,
    questionBanks,
    files,
    webLinks,
    ltiLinks,
    gradingStandards,
    warnings,
  };
}

function guessItemType(res: Resource, archive: Archive): ModuleItem['type'] {
  switch (res.type) {
    case 'imsdt_xmlv1p1':
      return 'DiscussionTopic';
    case 'imswl_xmlv1p1':
      return 'ExternalUrl';
    case 'imsqti_xmlv1p2/imscc_xmlv1p1/assessment':
      return 'Quizzes::Quiz';
    default:
      if (res.type.startsWith('imsbasiclti')) return 'ContextExternalTool';
      if (res.href?.startsWith('wiki_content/')) return 'WikiPage';
      if (res.files.some((f) => f.endsWith('assignment_settings.xml')) || archive.has(`${res.id}/assignment_settings.xml`))
        return 'Assignment';
      return 'Attachment';
  }
}

function parseTabs(json: string | undefined): Tab[] {
  const seen = new Set<TabKind>();
  const tabs: Tab[] = [];
  let config: unknown = [];
  try {
    config = json ? JSON.parse(json) : [];
  } catch {
    config = [];
  }
  if (Array.isArray(config)) {
    for (const entry of config) {
      const kind = typeof entry?.id === 'number' ? TAB_IDS[entry.id] : undefined;
      if (!kind || seen.has(kind)) continue;
      seen.add(kind);
      tabs.push({ kind, label: TAB_LABELS[kind], hidden: entry.hidden === true });
    }
  }
  for (const kind of DEFAULT_TAB_ORDER) {
    if (!seen.has(kind)) tabs.push({ kind, label: TAB_LABELS[kind], hidden: false });
  }
  // Home is always first in Canvas.
  tabs.sort((a, b) => (a.kind === 'home' ? -1 : b.kind === 'home' ? 1 : 0));
  return tabs;
}
