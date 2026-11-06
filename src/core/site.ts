// Course model -> static multi-page site (Map of path -> bytes).
// Every page is plain HTML with relative links and no JavaScript, so the unzipped
// site works from file:// (double-click index.html), a USB stick, or any web server.

import type {
  Assignment,
  Course,
  Discussion,
  FileEntry,
  Module,
  ModuleItem,
  Page,
  Question,
  Quiz,
  QuizEntry,
  TabKind,
} from './model';
import type { Archive } from './zip';
import { renderContent, sanitize, type LinkTargets } from './content';
import { formatDate, ianaZone, isoDate, parseCanvasDate } from './dates';
import { html, raw, type Raw } from './html';
import { icons, type IconName } from './icons';
import { relUrl, safeFileSegment, slugify } from './paths';
import { SITE_CSS } from './styles';

export interface BuildOptions {
  /** Include quiz/bank correct answers and answer feedback. Default false. */
  includeAnswers?: boolean;
  /** Include unpublished content (labelled). Default true. */
  includeUnpublished?: boolean;
  /** Timestamp shown in the banner. */
  generatedAt?: Date;
}

export interface SiteBuild {
  files: Map<string, Uint8Array>;
  rootName: string;
  warnings: string[];
  stats: Record<string, number>;
}

const SECTION_PATHS: Record<TabKind, string> = {
  home: 'index.html',
  announcements: 'announcements.html',
  syllabus: 'syllabus.html',
  modules: 'modules.html',
  assignments: 'assignments.html',
  discussions: 'discussions.html',
  pages: 'pages.html',
  files: 'files.html',
  quizzes: 'quizzes.html',
};

const SUBMISSION_LABELS: Record<string, string> = {
  online_upload: 'a file upload',
  online_text_entry: 'a text entry box',
  online_url: 'a website URL',
  media_recording: 'a media recording',
  student_annotation: 'a student annotation',
  external_tool: 'an external tool',
  on_paper: 'on paper',
  none: 'nothing (no submission)',
  online_quiz: 'a quiz',
  discussion_topic: 'a discussion post',
  not_graded: 'nothing (not graded)',
};

const QUIZ_TYPES: Record<string, string> = {
  assignment: 'Graded quiz',
  practice_quiz: 'Practice quiz',
  graded_survey: 'Graded survey',
  survey: 'Ungraded survey',
};

const enc = new TextEncoder();

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fmtPoints(n: number | undefined): string {
  if (n === undefined) return '';
  return `${Number.isInteger(n) ? n : n.toFixed(2)} pts`;
}

export function buildSite(course: Course, archive: Archive, options: BuildOptions = {}): SiteBuild {
  const includeAnswers = options.includeAnswers ?? false;
  const includeUnpublished = options.includeUnpublished ?? true;
  const generatedAt = options.generatedAt ?? new Date();
  const keep = (published: boolean) => published || includeUnpublished;
  const warnings: string[] = [];
  const out = new Map<string, Uint8Array>();
  const write = (path: string, body: string) => out.set(path, enc.encode(body));
  let unresolvedLinks = 0;

  // ---- what goes in --------------------------------------------------------
  const pages = course.pages.filter((p) => keep(p.published));
  const assignments = course.assignments.filter((a) => keep(a.published));
  const discussions = course.discussions.filter((d) => keep(d.published));
  const quizzes = course.quizzes.filter((q) => keep(q.published));
  const modules = course.modules
    .filter((m) => keep(m.published))
    .map((m) => ({ ...m, items: m.items.filter((i) => keep(i.published)) }));

  // ---- path maps -----------------------------------------------------------
  const pagePath = new Map<string, string>();
  for (const p of pages) {
    const path = `pages/${slugify(p.slug)}.html`;
    for (const key of [p.id, p.resourceId, p.slug, slugify(p.title)]) if (!pagePath.has(key)) pagePath.set(key, path);
  }
  const quizPath = new Map<string, string>();
  for (const q of quizzes) {
    const path = `quizzes/${slugify(q.id)}.html`;
    quizPath.set(q.id, path);
    if (q.assignmentId) quizPath.set(`asg:${q.assignmentId}`, path);
  }
  const discussionPath = new Map<string, string>();
  for (const d of discussions) {
    const path = `discussions/${slugify(d.id)}.html`;
    discussionPath.set(d.id, path);
    if (d.assignment) discussionPath.set(`asg:${d.assignment.id}`, path);
  }
  const assignmentPath = new Map<string, string>();
  for (const a of assignments) {
    const path =
      (a.quizId && quizPath.get(a.quizId)) || (a.discussionId && discussionPath.get(a.discussionId)) || `assignments/${slugify(a.id)}.html`;
    assignmentPath.set(a.id, path);
  }
  const assignmentTarget = (id: string) =>
    assignmentPath.get(id) ?? quizPath.get(`asg:${id}`) ?? discussionPath.get(`asg:${id}`);

  const filePathByRel = new Map<string, string>();
  const filePathByRelLower = new Map<string, string>();
  const filePathById = new Map<string, string>();
  const usedFilePaths = new Set<string>();
  for (const f of course.files) {
    let path = 'files/' + f.path.split('/').map(safeFileSegment).join('/');
    for (let n = 2; usedFilePaths.has(path.toLowerCase()); n++) path = path.replace(/(\.[^./]*)?$/, `-${n}$1`);
    usedFilePaths.add(path.toLowerCase());
    filePathByRel.set(f.path, path);
    filePathByRelLower.set(f.path.toLowerCase(), path);
    if (f.id) filePathById.set(f.id, path);
    const bytes = archive.get(f.archivePath);
    if (bytes) out.set(path, bytes);
  }

  const targets: LinkTargets = {
    fileByPath: (p) => filePathByRel.get(p) ?? filePathByRelLower.get(p.toLowerCase()),
    fileById: (id) => filePathById.get(id),
    page: (key) => pagePath.get(key) ?? pagePath.get(slugify(key)),
    assignment: assignmentTarget,
    discussion: (id) => discussionPath.get(id),
    quiz: (id) => quizPath.get(id),
    module: () => SECTION_PATHS.modules,
    section: (name) => SECTION_PATHS[name as TabKind],
  };

  const content = (rawHtml: string, path: string): Raw => {
    if (!rawHtml.trim()) return raw('');
    const r = renderContent(rawHtml, path, targets);
    unresolvedLinks += r.unresolved;
    return raw(r.html);
  };
  const excerpt = (rawHtml: string, max = 180): string => {
    const t = (sanitize(rawHtml).textContent ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  };
  const when = (s: string | undefined, tz?: string, dateOnly = false) =>
    s ? html`<time datetime="${isoDate(s)}">${formatDate(s, ianaZone(tz) ?? course.timeZone, { dateOnly })}</time>` : '';
  const unpub = (published: boolean) => (published ? '' : html`<span class="cr-badge cr-unpub">Unpublished</span>`);

  // ---- module item targets & sequence -------------------------------------
  interface ItemTarget {
    path?: string;
    external?: string;
    icon: IconName;
    meta?: Raw[];
  }
  const ltiById = new Map(course.ltiLinks.map((l) => [l.id, l]));
  const toolPages = new Map<string, { item: ModuleItem; path: string }>();
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const quizById = new Map(quizzes.map((q) => [q.id, q]));

  const extIcon = raw(icons.external.value.replace('class="cr-icon"', 'class="cr-icon cr-ext"'));
  const dueMeta = (dueAt?: string, points?: number, tz?: string, allDay = false): Raw[] => {
    const meta: Raw[] = [];
    if (dueAt) meta.push(html`<span>Due ${when(dueAt, tz, allDay)}</span>`);
    if (points !== undefined) meta.push(html`<span>${fmtPoints(points)}</span>`);
    return meta;
  };

  const itemTarget = (item: ModuleItem): ItemTarget => {
    const ref = item.ref ?? '';
    switch (item.type) {
      case 'WikiPage':
        return { path: targets.page(ref), icon: 'page' };
      case 'Assignment': {
        const a = assignmentById.get(ref);
        return { path: assignmentTarget(ref), icon: 'assignment', meta: a && dueMeta(a.dueAt, a.points, a.timeZone, a.allDay) };
      }
      case 'Attachment':
        return { path: targets.fileById(ref), icon: 'file' };
      case 'DiscussionTopic':
        return { path: discussionPath.get(ref), icon: 'discussion' };
      case 'Quizzes::Quiz': {
        const q = quizById.get(ref);
        return { path: quizPath.get(ref), icon: 'quiz', meta: q && dueMeta(q.dueAt, q.points) };
      }
      case 'ExternalUrl':
        return { external: item.url, icon: 'link' };
      case 'ContextExternalTool': {
        const path = `tools/${slugify(item.id)}.html`;
        toolPages.set(item.id, { item, path });
        return { path, icon: 'tool' };
      }
      default:
        return { icon: 'page' };
    }
  };

  const itemTargets = new Map<string, ItemTarget>();
  const sequence: { title: string; path: string; module: Module }[] = [];
  const seqIndex = new Map<string, number>();
  for (const m of modules) {
    for (const item of m.items) {
      if (item.type === 'ContextModuleSubHeader') continue;
      const t = itemTarget(item);
      itemTargets.set(item.id, t);
      if (t.path && t.path.endsWith('.html')) {
        if (!seqIndex.has(t.path)) seqIndex.set(t.path, sequence.length);
        sequence.push({ title: item.title, path: t.path, module: m });
      }
    }
  }
  const seqFooter = (path: string): Raw => {
    const i = seqIndex.get(path);
    if (i === undefined) return raw('');
    const prev = sequence[i - 1];
    const next = sequence[i + 1];
    return html`<nav class="cr-seq" aria-label="Module navigation">
      <span>${prev ? html`<a href="${relUrl(path, prev.path)}" title="${prev.title}">◂ Previous</a>` : ''}</span>
      <span class="cr-muted">${sequence[i]!.module.title}</span>
      <span>${next ? html`<a href="${relUrl(path, next.path)}" title="${next.title}">Next ▸</a>` : ''}</span>
    </nav>`;
  };

  // ---- layout --------------------------------------------------------------
  const courseLabel = course.courseCode?.replace(/:$/, '') || course.title;
  const exported = course.exportedAt ? ` exported ${course.exportedAt}` : '';
  const layout = (p: { path: string; title: string; active?: TabKind; crumbs?: { label: string; path?: string }[]; body: Raw }): string => {
    const crumbs = [{ label: courseLabel, path: 'index.html' }, ...(p.crumbs ?? [])];
    const nav = course.tabs.map(
      (t) =>
        html`<li><a href="${relUrl(p.path, SECTION_PATHS[t.kind])}"${raw(t.kind === p.active ? ' aria-current="page"' : '')}${raw(
          t.hidden ? ' class="cr-hidden-tab" title="Hidden from students in Canvas"' : '',
        )}>${t.label}</a></li>`,
    );
    const term =
      course.startAt || course.endAt
        ? html`<div class="cr-term">${when(course.startAt, undefined, true)}${course.endAt ? html` – ${when(course.endAt, undefined, true)}` : ''}</div>`
        : '';
    return (
      '<!doctype html>\n' +
      html`<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${p.title} · ${courseLabel}</title>
<link rel="stylesheet" href="${relUrl(p.path, 'assets/site.css')}">
</head><body>
<div class="cr-banner" role="note">Offline, read-only copy of <strong>${course.title}</strong>${exported}. Generated ${generatedAt.toISOString().slice(0, 10)}. Submissions, grades and external tools require Canvas.</div>
<header class="cr-header"><nav class="cr-crumbs" aria-label="Breadcrumbs">${crumbs.map((c, i) =>
        html`${i ? icons.caret : ''}${c.path && i < crumbs.length - 1 ? html`<a href="${relUrl(p.path, c.path)}">${c.label}</a>` : html`<span>${c.label}</span>`}`,
      )}</nav></header>
<div class="cr-layout">
<nav class="cr-coursenav" aria-label="Course navigation">${term}<ul>${nav}</ul></nav>
<main class="cr-main" id="content">${p.body}</main>
</div></body></html>
`.value
    );
  };

  // ---- modules -------------------------------------------------------------
  const modulesBody = (path: string): Raw =>
    html`${modules.length ? '' : html`<p class="cr-muted">This course has no modules.</p>`}${modules.map(
      (m) => html`<details class="cr-module" open id="module-${slugify(m.id)}">
<summary>${icons.caret}<span>${m.title}</span><span class="cr-badges">${unpub(m.published)}${
        m.unlockAt ? html`<span class="cr-badge">Unlocks ${when(m.unlockAt, undefined, true)}</span>` : ''
      }</span></summary>
<ul class="cr-items">${m.items.map((item) => moduleItem(item, path))}</ul></details>`,
    )}`;

  const moduleItem = (item: ModuleItem, path: string): Raw => {
    const pad = raw(`style="padding-left:${16 + item.indent * 24}px"`);
    if (item.type === 'ContextModuleSubHeader') return html`<li class="cr-item cr-subheader" ${pad}>${item.title}</li>`;
    const t = itemTargets.get(item.id) ?? itemTarget(item);
    let link: Raw;
    if (t.external) link = html`<a href="${t.external}" target="_blank" rel="noopener noreferrer">${item.title}</a>${extIcon}`;
    else if (t.path) link = html`<a href="${relUrl(path, t.path)}">${item.title}</a>`;
    else link = html`<span class="cr-unavailable" title="Not included in this offline copy">${item.title}</span>`;
    return html`<li class="cr-item${item.published ? '' : ' cr-unpublished'}" ${pad}>${icons[t.icon]}<div>${link}${
      t.meta?.length ? html`<div class="cr-meta">${t.meta}</div>` : ''
    }</div>${item.published ? '' : html`<span class="cr-badges">${unpub(false)}</span>`}</li>`;
  };

  write(
    'modules.html',
    layout({ path: 'modules.html', title: 'Modules', active: 'modules', crumbs: [{ label: 'Modules' }], body: html`<h1 class="cr-title">Modules</h1>${modulesBody('modules.html')}` }),
  );

  // ---- pages ---------------------------------------------------------------
  const pageBody = (p: Page, path: string): Raw =>
    html`<h1 class="cr-title">${p.title}<span class="cr-badges">${p.frontPage ? html`<span class="cr-badge">Front page</span>` : ''}${unpub(p.published)}</span></h1>
<div class="cr-content">${content(p.html, path)}</div>${seqFooter(path)}`;
  for (const p of pages) {
    const path = pagePath.get(p.id)!;
    write(path, layout({ path, title: p.title, active: 'pages', crumbs: [{ label: 'Pages', path: 'pages.html' }, { label: p.title }], body: pageBody(p, path) }));
  }
  write(
    'pages.html',
    layout({
      path: 'pages.html',
      title: 'Pages',
      active: 'pages',
      crumbs: [{ label: 'Pages' }],
      body: html`<h1 class="cr-title">Pages</h1>${
        pages.length
          ? html`<ul class="cr-list">${pages.map(
              (p) => html`<li>${icons.page}<div><a href="${relUrl('pages.html', pagePath.get(p.id)!)}">${p.title}</a><span class="cr-badges">${
                p.frontPage ? html`<span class="cr-badge">Front page</span>` : ''
              }${unpub(p.published)}</span></div></li>`,
            )}</ul>`
          : html`<p class="cr-muted">No pages.</p>`
      }`,
    }),
  );

  // ---- assignments ---------------------------------------------------------
  const assignmentDetails = (a: Assignment): Raw => {
    const rows: [string, Raw | string][] = [];
    if (a.dueAt) rows.push(['Due', when(a.dueAt, a.timeZone, a.allDay)]);
    if (a.points !== undefined) rows.push(['Points', String(a.points)]);
    if (a.submissionTypes.length)
      rows.push(['Submitting', a.submissionTypes.map((s) => SUBMISSION_LABELS[s] ?? s.replace(/_/g, ' ')).join(', ')]);
    if (a.allowedExtensions.length) rows.push(['File types', a.allowedExtensions.join(', ')]);
    if (a.unlockAt || a.lockAt)
      rows.push([
        'Available',
        html`${a.unlockAt ? html`from ${when(a.unlockAt, a.timeZone)}` : ''}${a.unlockAt && a.lockAt ? ' ' : ''}${a.lockAt ? html`until ${when(a.lockAt, a.timeZone)}` : ''}`,
      ]);
    if (a.gradingType && a.gradingType !== 'points') rows.push(['Display grade as', a.gradingType.replace(/_/g, ' ')]);
    if (a.peerReviews) rows.push(['Peer reviews', 'Required']);
    return rows.length ? html`<dl class="cr-details">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>` : raw('');
  };

  for (const a of assignments) {
    const path = assignmentPath.get(a.id)!;
    if (!path.startsWith('assignments/')) continue; // quiz/discussion-backed
    write(
      path,
      layout({
        path,
        title: a.title,
        active: 'assignments',
        crumbs: [{ label: 'Assignments', path: 'assignments.html' }, { label: a.title }],
        body: html`<h1 class="cr-title">${a.title}<span class="cr-badges">${unpub(a.published)}</span></h1>
${assignmentDetails(a)}
${a.externalToolUrl ? html`<div class="cr-notice">${icons.tool} This assignment is delivered through an external tool: <a href="${a.externalToolUrl}" target="_blank" rel="noopener noreferrer">${a.externalToolUrl}</a>. It requires Canvas to launch.</div>` : ''}
<div class="cr-content">${content(a.html, path)}</div>${seqFooter(path)}`,
      }),
    );
  }

  const gradedDiscussions = discussions.filter((d) => d.assignment && !d.isAnnouncement);
  type Row = { title: string; path: string; icon: IconName; dueAt?: string; tz?: string; allDay?: boolean; points?: number; published: boolean; groupId?: string; position?: number };
  const assignmentRows: Row[] = [
    ...assignments.map((a) => ({
      title: a.title,
      path: assignmentPath.get(a.id)!,
      icon: (a.quizId ? 'quiz' : a.discussionId ? 'discussion' : 'assignment') as IconName,
      dueAt: a.dueAt,
      tz: a.timeZone,
      allDay: a.allDay,
      points: a.points,
      published: a.published,
      groupId: a.groupId,
      position: a.position,
    })),
    ...gradedDiscussions.map((d) => ({
      title: d.title,
      path: discussionPath.get(d.id)!,
      icon: 'discussion' as IconName,
      dueAt: d.assignment!.dueAt,
      tz: d.assignment!.timeZone,
      allDay: d.assignment!.allDay,
      points: d.assignment!.points,
      published: d.published,
      groupId: d.assignment!.groupId,
      position: d.assignment!.position,
    })),
    // Graded quizzes (classic and New Quizzes) keep their assignment inside
    // assessment_meta.xml. Skip any already listed via an assignment_settings resource.
    ...quizzes
      .filter((q) => q.assignment && !assignments.some((a) => a.quizId === q.id))
      .map((q) => ({
        title: q.title,
        path: quizPath.get(q.id)!,
        icon: 'quiz' as IconName,
        dueAt: q.assignment!.dueAt ?? q.dueAt,
        tz: q.assignment!.timeZone,
        allDay: q.assignment!.allDay,
        points: q.assignment!.points ?? q.points,
        published: q.published,
        groupId: q.assignment!.groupId,
        position: q.assignment!.position,
      })),
  ];
  const groups = [...course.assignmentGroups];
  const knownGroups = new Set(groups.map((g) => g.id));
  if (assignmentRows.some((r) => !r.groupId || !knownGroups.has(r.groupId))) groups.push({ id: '__other', title: 'Other', position: 1e9 });
  const rowLi = (r: Row, path: string) =>
    html`<li>${icons[r.icon]}<div><a href="${relUrl(path, r.path)}">${r.title}</a>${unpub(r.published)}<div class="cr-meta">${
      r.dueAt ? html`<span>Due ${when(r.dueAt, r.tz, r.allDay)}</span>` : html`<span>No due date</span>`
    }${r.points !== undefined ? html`<span>${fmtPoints(r.points)}</span>` : ''}</div></div></li>`;
  const assignmentsBody = (path: string): Raw =>
    assignmentRows.length
      ? html`${groups.map((g) => {
          const rows = assignmentRows
            .filter((r) => (g.id === '__other' ? !r.groupId || !knownGroups.has(r.groupId) : r.groupId === g.id))
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
          if (!rows.length) return '';
          return html`<h2 class="cr-group">${g.title}${g.weight ? html` <span class="cr-muted">(${g.weight}% of total)</span>` : ''}</h2><ul class="cr-list">${rows.map((r) => rowLi(r, path))}</ul>`;
        })}`
      : html`<p class="cr-muted">No assignments.</p>`;
  write(
    'assignments.html',
    layout({ path: 'assignments.html', title: 'Assignments', active: 'assignments', crumbs: [{ label: 'Assignments' }], body: html`<h1 class="cr-title">Assignments</h1>${assignmentsBody('assignments.html')}` }),
  );

  // ---- discussions & announcements ----------------------------------------
  for (const d of discussions) {
    const path = discussionPath.get(d.id)!;
    const section: TabKind = d.isAnnouncement ? 'announcements' : 'discussions';
    const label = d.isAnnouncement ? 'Announcements' : 'Discussions';
    const posted = d.postedAt ?? d.delayedPostAt;
    write(
      path,
      layout({
        path,
        title: d.title,
        active: section,
        crumbs: [{ label, path: SECTION_PATHS[section] }, { label: d.title }],
        body: html`<h1 class="cr-title">${d.title}<span class="cr-badges">${unpub(d.published)}${
          d.delayedPostAt && !d.postedAt ? html`<span class="cr-badge">Delayed post</span>` : ''
        }</span></h1>
${posted ? html`<p class="cr-muted">Posted ${when(posted)}</p>` : ''}
${d.assignment ? assignmentDetails(d.assignment) : ''}
<div class="cr-content">${content(d.html, path)}</div>
${d.isAnnouncement ? '' : html`<p class="cr-notice cr-muted">Replies are not included in Canvas course exports.</p>`}${seqFooter(path)}`,
      }),
    );
  }
  const topicList = (list: Discussion[], path: string, icon: IconName, empty: string): Raw =>
    list.length
      ? html`<ul class="cr-list">${list.map((d) => {
          const posted = d.postedAt ?? d.delayedPostAt;
          return html`<li>${icons[icon]}<div><a href="${relUrl(path, discussionPath.get(d.id)!)}">${d.title}</a>${unpub(d.published)}<div class="cr-meta">${
            posted ? html`<span>${when(posted)}</span>` : ''
          }${d.assignment?.points !== undefined ? html`<span>${fmtPoints(d.assignment.points)}</span>` : ''}${
            d.assignment?.dueAt ? html`<span>Due ${when(d.assignment.dueAt, d.assignment.timeZone)}</span>` : ''
          }</div><div class="cr-excerpt">${excerpt(d.html)}</div></div></li>`;
        })}</ul>`
      : html`<p class="cr-muted">${empty}</p>`;
  const announcements = discussions.filter((d) => d.isAnnouncement);
  const regularDiscussions = discussions.filter((d) => !d.isAnnouncement);
  write(
    'announcements.html',
    layout({
      path: 'announcements.html',
      title: 'Announcements',
      active: 'announcements',
      crumbs: [{ label: 'Announcements' }],
      body: html`<h1 class="cr-title">Announcements</h1>${topicList(announcements, 'announcements.html', 'announcement', 'No announcements.')}`,
    }),
  );
  write(
    'discussions.html',
    layout({
      path: 'discussions.html',
      title: 'Discussions',
      active: 'discussions',
      crumbs: [{ label: 'Discussions' }],
      body: html`<h1 class="cr-title">Discussions</h1>${topicList(regularDiscussions, 'discussions.html', 'discussion', 'No discussions.')}`,
    }),
  );

  // ---- quizzes & question banks -------------------------------------------
  const questionHtml = (q: Question, n: number, path: string): Raw => {
    const answers = includeAnswers;
    const choiceList = (r: Question['responses'][number]) =>
      html`<ul class="cr-choices${r.multiple ? ' cr-multi' : ''}">${r.choices.map(
        (c) => html`<li class="${answers && c.correct ? 'cr-correct' : ''}"><span class="cr-mark"></span><div>${content(c.html, path)}</div>${
          answers && c.correct ? html`<span class="cr-correct-label">Correct</span>` : ''
        }</li>`,
      )}</ul>`;
    const plain = (s: string) => sanitize(s).textContent ?? '';
    // Blank/dropdown names. Classic quizzes label each response with its variable
    // name ("blank1", which also appears in the text as [blank1]). New Quizzes label
    // it with the ANSWER and use a UUID in the text, so a label is only shown when it
    // equals the variable name; otherwise blanks are numbered and the text rewritten.
    let questionText = q.html;
    const blankName = new Map<string, string>();
    if (q.type === 'fill_in_multiple_blanks_question' || q.type === 'multiple_dropdowns_question') {
      q.responses.forEach((r, i) => {
        const key = r.id.replace(/^response_/, '');
        const name = r.label === key ? key : `Blank ${i + 1}`;
        blankName.set(r.id, name);
        if (name !== key) questionText = questionText.split(`[${key}]`).join(`[${name}]`);
      });
    }
    let body: Raw | string = '';
    switch (q.type) {
      case 'essay_question':
        body = html`<div class="cr-essay" aria-label="Essay response area"></div>`;
        break;
      case 'file_upload_question':
        body = html`<div class="cr-notice cr-muted">${icons.file} Students upload a file for this question.</div>`;
        break;
      case 'text_only_question':
        break;
      case 'matching_question': {
        const options = q.responses[0]?.choices ?? [];
        body = html`<table class="cr-match"><tbody>${q.responses.map(
          (r) =>
            html`<tr><td>${r.label ?? ''}</td><td>${
              answers ? html`<strong>${plain(r.choices.find((c) => c.correct)?.html ?? '—')}</strong>` : html`<span class="cr-blank"></span>`
            }</td></tr>`,
        )}</tbody></table>${answers ? '' : html`<p class="cr-answers cr-muted">Options: ${options.map((o) => plain(o.html)).join(' · ')}</p>`}`;
        break;
      }
      case 'fill_in_multiple_blanks_question':
        // The "choices" here ARE the accepted answers; never show them without includeAnswers.
        body = html`<table class="cr-match"><tbody>${q.responses.map(
          (r) =>
            html`<tr><td>[${blankName.get(r.id)}]</td><td>${
              answers ? html`<span class="cr-answers"><strong>Accepted:</strong> ${r.choices.map((c) => plain(c.html)).join(', ')}</span>` : html`<span class="cr-blank"></span>`
            }</td></tr>`,
        )}</tbody></table>`;
        break;
      case 'multiple_dropdowns_question':
        body = html`${q.responses.map((r) => html`<p class="cr-answers"><strong>[${blankName.get(r.id)}]</strong></p>${choiceList(r)}`)}`;
        break;
      case 'categorization_question': {
        // New Quizzes: one response per category, each listing every item; correct
        // items per category come from resprocessing.
        const items = new Map<string, string>();
        for (const r of q.responses) for (const c of r.choices) if (!items.has(c.id)) items.set(c.id, c.html);
        const categories = q.responses.map((r) => r.label ?? '').filter(Boolean);
        body = answers
          ? html`<table class="cr-match"><tbody>${q.responses.map(
              (r) =>
                html`<tr><td><strong>${r.label ?? ''}</strong></td><td>${r.choices
                  .filter((c) => c.correct)
                  .map((c) => html`<div>${plain(c.html)}</div>`)}</td></tr>`,
            )}</tbody></table>`
          : html`<p class="cr-answers"><strong>Categories:</strong> ${categories.join(' · ')}</p><ul class="cr-choices">${[...items.values()].map(
              (h) => html`<li><span class="cr-mark"></span><div>${content(h, path)}</div></li>`,
            )}</ul>`;
        break;
      }
      case 'multiple_choice_question':
      case 'true_false_question':
      case 'multiple_answers_question':
      case 'short_answer_question':
      case 'numerical_question':
      default: {
        // Unknown types fail closed: response labels are never shown, because for
        // some types (see blanks above) the label is the answer.
        const known = ['multiple_choice_question', 'true_false_question', 'multiple_answers_question', 'short_answer_question', 'numerical_question'];
        const parts = q.responses.map((r) =>
          r.kind === 'choice'
            ? choiceList(r)
            : html`<p><span class="cr-blank"></span></p>${
                answers && r.accepted.length ? html`<p class="cr-answers"><strong>Accepted answers:</strong> ${r.accepted.join(' · ')}</p>` : ''
              }`,
        );
        body = html`${parts.length ? parts : html`<p><span class="cr-blank"></span></p>`}${
          known.includes(q.type) ? '' : html`<p class="cr-answers cr-muted">Question type “${q.type.replace(/_/g, ' ')}” is shown in simplified form.</p>`
        }`;
      }
    }
    const fb = answers
      ? [q.feedback.general, q.feedback.correct && `<strong>If correct:</strong> ${q.feedback.correct}`, q.feedback.incorrect && `<strong>If incorrect:</strong> ${q.feedback.incorrect}`]
          .filter((s): s is string => !!s)
          .map((s) => html`<div class="cr-feedback">${content(s, path)}</div>`)
      : [];
    return html`<section class="cr-question"><header><span>Question ${n}</span><span class="cr-muted">${fmtPoints(q.points)}</span></header>
<div class="cr-qbody"><div class="cr-content">${content(questionText, path)}</div>${body}${fb}</div></section>`;
  };

  const bankTitle = new Map(course.questionBanks.map((b) => [b.id, b.title]));
  const entriesHtml = (entries: QuizEntry[], path: string): Raw => {
    let n = 0;
    return html`${entries.map((e) => {
      if (e.kind === 'question') return questionHtml(e.question, ++n, path);
      const g = e.group;
      const desc = [
        g.pick !== undefined ? `Pick ${g.pick} question${g.pick === 1 ? '' : 's'}` : '',
        g.pointsPerItem !== undefined ? `${fmtPoints(g.pointsPerItem)} per question` : '',
        g.bankRef ? `from question bank “${bankTitle.get(g.bankRef) ?? g.bankRef}”` : '',
      ]
        .filter(Boolean)
        .join(', ');
      return html`<div class="cr-group-box"><h3>Question group: ${g.title}</h3><p class="cr-muted">${desc}</p>${g.questions.map((q) => questionHtml(q, ++n, path))}</div>`;
    })}`;
  };
  const answerNote = includeAnswers
    ? html`<div class="cr-notice"><strong>Instructor copy:</strong> correct answers and answer feedback are shown.</div>`
    : html`<div class="cr-notice cr-muted">Correct answers are not included in this copy.</div>`;
  const countQuestions = (entries: QuizEntry[]) => entries.reduce((n, e) => n + (e.kind === 'question' ? 1 : e.group.pick ?? e.group.questions.length), 0);

  for (const q of quizzes) {
    const path = quizPath.get(q.id)!;
    const rows: [string, Raw | string][] = [];
    if (q.quizType) rows.push(['Type', QUIZ_TYPES[q.quizType] ?? q.quizType]);
    if (q.points !== undefined) rows.push(['Points', String(q.points)]);
    rows.push(['Questions', String(countQuestions(q.questions))]);
    if (q.dueAt) rows.push(['Due', when(q.dueAt, q.assignment?.timeZone)]);
    if (q.unlockAt || q.lockAt) rows.push(['Available', html`${q.unlockAt ? html`from ${when(q.unlockAt)} ` : ''}${q.lockAt ? html`until ${when(q.lockAt)}` : ''}`]);
    rows.push(['Time limit', q.timeLimit ? `${q.timeLimit} minutes` : 'None']);
    if (q.allowedAttempts !== undefined) rows.push(['Allowed attempts', q.allowedAttempts < 0 ? 'Unlimited' : String(q.allowedAttempts)]);
    write(
      path,
      layout({
        path,
        title: q.title,
        active: 'quizzes',
        crumbs: [{ label: 'Quizzes', path: 'quizzes.html' }, { label: q.title }],
        body: html`<h1 class="cr-title">${q.title}<span class="cr-badges">${unpub(q.published)}</span></h1>
<dl class="cr-details">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>
<div class="cr-content">${content(q.html, path)}</div>${answerNote}${entriesHtml(q.questions, path)}${seqFooter(path)}`,
      }),
    );
  }
  const bankPath = (id: string) => `quizzes/bank-${slugify(id)}.html`;
  for (const b of course.questionBanks) {
    const path = bankPath(b.id);
    write(
      path,
      layout({
        path,
        title: b.title,
        active: 'quizzes',
        crumbs: [{ label: 'Quizzes', path: 'quizzes.html' }, { label: `Question bank: ${b.title}` }],
        body: html`<h1 class="cr-title">Question bank: ${b.title}</h1><p class="cr-muted">${b.questions.length} question(s)</p>${answerNote}${entriesHtml(
          b.questions.map((question) => ({ kind: 'question' as const, question })),
          path,
        )}`,
      }),
    );
  }
  write(
    'quizzes.html',
    layout({
      path: 'quizzes.html',
      title: 'Quizzes',
      active: 'quizzes',
      crumbs: [{ label: 'Quizzes' }],
      body: html`<h1 class="cr-title">Quizzes</h1>${
        quizzes.length
          ? html`<ul class="cr-list">${quizzes.map(
              (q) => html`<li>${icons.quiz}<div><a href="${relUrl('quizzes.html', quizPath.get(q.id)!)}">${q.title}</a>${unpub(q.published)}<div class="cr-meta">${
                q.dueAt ? html`<span>Due ${when(q.dueAt)}</span>` : ''
              }${q.points !== undefined ? html`<span>${fmtPoints(q.points)}</span>` : ''}<span>${countQuestions(q.questions)} questions</span></div></div></li>`,
            )}</ul>`
          : html`<p class="cr-muted">No quizzes.</p>`
      }${
        course.questionBanks.length
          ? html`<h2 class="cr-group">Question banks</h2><ul class="cr-list">${course.questionBanks.map(
              (b) => html`<li>${icons.quiz}<div><a href="${relUrl('quizzes.html', bankPath(b.id))}">${b.title}</a><div class="cr-meta"><span>${b.questions.length} questions</span></div></div></li>`,
            )}</ul>`
          : ''
      }`,
    }),
  );

  // ---- external tool stubs -------------------------------------------------
  for (const { item, path } of toolPages.values()) {
    const lti = item.ref ? ltiById.get(item.ref) : undefined;
    const url = item.url ?? lti?.resourceLinkUrl ?? lti?.launchUrl;
    write(
      path,
      layout({
        path,
        title: item.title,
        active: 'modules',
        crumbs: [{ label: 'Modules', path: 'modules.html' }, { label: item.title }],
        body: html`<h1 class="cr-title">${item.title}</h1>
<div class="cr-notice">${icons.tool} This item is an external tool (LTI) that is launched through Canvas, so it cannot be opened from this offline copy.${
          lti?.title ? html`<br>Tool: <strong>${lti.title}</strong>${lti.description ? html` — ${lti.description}` : ''}` : ''
        }${url ? html`<br>Launch URL: <code>${url}</code>` : ''}</div>${seqFooter(path)}`,
      }),
    );
  }

  // ---- files ---------------------------------------------------------------
  interface Dir {
    dirs: Map<string, Dir>;
    files: FileEntry[];
  }
  const tree: Dir = { dirs: new Map(), files: [] };
  for (const f of course.files) {
    const segs = f.path.split('/');
    let d = tree;
    for (const s of segs.slice(0, -1)) {
      if (!d.dirs.has(s)) d.dirs.set(s, { dirs: new Map(), files: [] });
      d = d.dirs.get(s)!;
    }
    d.files.push(f);
  }
  const hiddenNote = html`<span class="cr-badge cr-hidden">Hidden from students</span>`;
  const renderDir = (d: Dir, prefix: string): Raw =>
    html`${[...d.dirs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, sub]) => {
        const full = prefix + name + '/';
        const hidden = course.files.some((f) => f.hidden && f.path.startsWith(full)) && course.files.filter((f) => f.path.startsWith(full)).every((f) => f.hidden);
        return html`<li><details${raw(prefix ? '' : ' open')}><summary>${icons.folder}${name}${hidden ? hiddenNote : ''}</summary><ul>${renderDir(sub, full)}</ul></details></li>`;
      })}${d.files.map(
      (f) =>
        html`<li class="cr-file">${icons.file}<a href="${relUrl('files.html', filePathByRel.get(f.path)!)}">${f.path.split('/').pop()}</a><span class="cr-size">${fmtSize(f.size)}</span>${
          f.hidden ? hiddenNote : ''
        }</li>`,
    )}`;
  write(
    'files.html',
    layout({
      path: 'files.html',
      title: 'Files',
      active: 'files',
      crumbs: [{ label: 'Files' }],
      body: html`<h1 class="cr-title">Files</h1>${
        course.files.length
          ? html`<p class="cr-muted">${course.files.length} files · ${fmtSize(course.files.reduce((n, f) => n + f.size, 0))}</p><ul class="cr-tree">${renderDir(tree, '')}</ul>`
          : html`<p class="cr-muted">No files.</p>`
      }`,
    }),
  );

  // ---- syllabus ------------------------------------------------------------
  const summary = [
    ...assignmentRows,
    // Ungraded/practice quizzes have no assignment row; add them once.
    ...quizzes
      .filter((q) => !assignmentRows.some((r) => r.path === quizPath.get(q.id)))
      .map((q) => ({ title: q.title, path: quizPath.get(q.id)!, icon: 'quiz' as IconName, dueAt: q.dueAt, points: q.points, published: q.published })),
  ].sort((a, b) => {
    const da = parseCanvasDate(a.dueAt)?.getTime() ?? Infinity;
    const db = parseCanvasDate(b.dueAt)?.getTime() ?? Infinity;
    return da - db || a.title.localeCompare(b.title);
  });
  const syllabusBody = (path: string): Raw =>
    html`<h1 class="cr-title">Syllabus</h1><div class="cr-content">${
      course.syllabusHtml ? content(course.syllabusHtml, path) : html`<p class="cr-muted">No syllabus content.</p>`
    }</div>${
      summary.length
        ? html`<h2>Course summary</h2><div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Date</th><th>Details</th><th class="cr-num">Points</th></tr></thead><tbody>${summary.map(
            (r) =>
              html`<tr><td>${r.dueAt ? when(r.dueAt, (r as Row).tz, (r as Row).allDay) : html`<span class="cr-muted">No date</span>`}</td><td>${icons[r.icon]} <a href="${relUrl(path, r.path)}">${r.title}</a></td><td class="cr-num">${
                r.points !== undefined ? String(r.points) : ''
              }</td></tr>`,
          )}</tbody></table></div>`
        : ''
    }`;
  write('syllabus.html', layout({ path: 'syllabus.html', title: 'Syllabus', active: 'syllabus', crumbs: [{ label: 'Syllabus' }], body: syllabusBody('syllabus.html') }));

  // ---- home ----------------------------------------------------------------
  const front = pages.find((p) => p.frontPage);
  let homeBody: Raw;
  switch (course.defaultView) {
    case 'wiki':
      homeBody = front ? html`<h1 class="cr-title">${front.title}</h1><div class="cr-content">${content(front.html, 'index.html')}</div>` : html`<h1 class="cr-title">${course.title}</h1>${modulesBody('index.html')}`;
      break;
    case 'syllabus':
      homeBody = syllabusBody('index.html');
      break;
    case 'assignments':
      homeBody = html`<h1 class="cr-title">${course.title}</h1>${assignmentsBody('index.html')}`;
      break;
    case 'feed':
      homeBody = html`<h1 class="cr-title">${course.title}</h1><h2>Recent announcements</h2>${topicList(announcements.slice(0, 5), 'index.html', 'announcement', 'No announcements.')}`;
      break;
    default:
      homeBody = html`<h1 class="cr-title">${course.title}</h1>${modulesBody('index.html')}`;
  }
  write('index.html', layout({ path: 'index.html', title: 'Home', active: 'home', body: homeBody }));

  // ---- assets & readme -----------------------------------------------------
  write('assets/site.css', SITE_CSS);
  write(
    'README.txt',
    `${course.title}\nOffline, read-only copy generated ${generatedAt.toISOString()} from a Canvas course export${exported}.\n\n` +
      `Open index.html in any web browser. No internet connection or server is required,\n` +
      `except for external links and embedded videos hosted elsewhere.\n\n` +
      `Not included (not part of Canvas course exports): student submissions, grades,\n` +
      `roster, discussion replies. External tools (LTI) require Canvas.\n` +
      (includeAnswers ? `\nWARNING: this copy INCLUDES quiz answer keys. Do not share it with students.\n` : ''),
  );

  if (unresolvedLinks) warnings.push(`${unresolvedLinks} link(s)/embed(s) point to Canvas features or files not in the export; they are marked as unavailable.`);
  if (!includeUnpublished) {
    const dropped =
      course.pages.length - pages.length + course.assignments.length - assignments.length + course.discussions.length - discussions.length + course.quizzes.length - quizzes.length;
    if (dropped) warnings.push(`${dropped} unpublished item(s) were left out.`);
  }

  return {
    files: out,
    rootName: slugify(`${courseLabel}-offline`),
    warnings,
    stats: {
      modules: modules.length,
      pages: pages.length,
      assignments: assignments.length,
      announcements: announcements.length,
      discussions: regularDiscussions.length,
      quizzes: quizzes.length,
      questionBanks: course.questionBanks.length,
      files: course.files.length,
      siteFiles: out.size,
    },
  };
}
