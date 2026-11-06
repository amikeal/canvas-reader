import { convert } from '../src/core/index';
import { resolveUrl, type LinkTargets } from '../src/core/content';
import { relUrl } from '../src/core/paths';
import { buildFixture } from './fixture';

const dec = new TextDecoder();
const read = (files: Map<string, Uint8Array>, p: string) => {
  const b = files.get(p);
  if (!b) throw new Error(`missing ${p}; have ${[...files.keys()].join(', ')}`);
  return dec.decode(b);
};
const allHtml = (files: Map<string, Uint8Array>) =>
  [...files.entries()]
    .filter(([p]) => p.endsWith('.html'))
    .map(([, b]) => dec.decode(b))
    .join('\n');

describe('relUrl', () => {
  it('builds encoded relative links', () => {
    expect(relUrl('index.html', 'pages/a.html')).toBe('pages/a.html');
    expect(relUrl('pages/a.html', 'files/Week 1/Lecture (1).pdf')).toBe('../files/Week%201/Lecture%20(1).pdf');
    expect(relUrl('pages/a.html', 'modules.html', '#x')).toBe('../modules.html#x');
  });
});

describe('resolveUrl', () => {
  const t: LinkTargets = {
    fileByPath: (p) => (p === 'a b/c.pdf' ? 'files/a b/c.pdf' : undefined),
    fileById: () => undefined,
    page: (k) => (k === 'intro' ? 'pages/intro.html' : undefined),
    assignment: (id) => (id === 'g1' ? 'assignments/g1.html' : undefined),
    discussion: () => undefined,
    quiz: () => undefined,
    module: () => 'modules.html',
    section: (s) => (s === 'modules' ? 'modules.html' : s === 'syllabus' ? 'syllabus.html' : undefined),
  };
  it.each([
    ['$IMS-CC-FILEBASE$/a%20b/c.pdf?canvas_download=1', { kind: 'local', path: 'files/a b/c.pdf', fragment: '' }],
    ['$WIKI_REFERENCE$/pages/intro#top', { kind: 'local', path: 'pages/intro.html', fragment: '#top' }],
    ['$CANVAS_OBJECT_REFERENCE$/assignments/g1', { kind: 'local', path: 'assignments/g1.html', fragment: '' }],
    ['$CANVAS_COURSE_REFERENCE$/assignments/syllabus', { kind: 'local', path: 'syllabus.html', fragment: '' }],
    ['https://canvas.example.edu/courses/12/pages/intro', { kind: 'local', path: 'pages/intro.html', fragment: '' }],
    ['/courses/12/modules', { kind: 'local', path: 'modules.html', fragment: '' }],
    ['https://example.org/courses/12/pages/intro', { kind: 'passthrough' }],
    ['mailto:x@example.org', { kind: 'passthrough' }],
  ])('%s', (url, expected) => expect(resolveUrl(url, t)).toEqual(expected));

  it.each(['$CANVAS_COURSE_REFERENCE$/external_tools/1', '$IMS-CC-FILEBASE$/nope.pdf', '/courses/12/grades', '/media_objects_iframe/m-1'])(
    'marks %s unavailable',
    (url) => expect(resolveUrl(url, t).kind).toBe('unavailable'),
  );
});

describe('buildSite', () => {
  it('generates the expected pages and copies files', async () => {
    const { site } = await convert(buildFixture());
    for (const p of [
      'index.html',
      'modules.html',
      'syllabus.html',
      'assignments.html',
      'announcements.html',
      'discussions.html',
      'pages.html',
      'files.html',
      'quizzes.html',
      'pages/office-hours.html',
      'assignments/gasg1.html',
      'discussions/gann1.html',
      'quizzes/gquiz1.html',
      'quizzes/bank-gbank1.html',
      'tools/gi8.html',
      'assets/site.css',
      'files/Week 1/Lecture (1).pdf',
      'files/Uploaded Media/banner.png',
    ]) {
      expect(site.files.has(p), p).toBe(true);
    }
    expect(dec.decode(site.files.get('files/Week 1/Lecture (1).pdf')!)).toContain('%PDF');
  });

  it('rewrites Canvas tokens into working relative links', async () => {
    const { site } = await convert(buildFixture());
    const home = read(site.files, 'index.html');
    expect(home).toContain('src="files/Uploaded%20Media/banner.png"');
    expect(home).toContain('href="pages/office-hours.html"');
    expect(home).toContain('href="assignments/gasg1.html"');
    expect(home).toContain('href="files/Week%201/Lecture%20(1).pdf"');
    expect(home).toContain('href="modules.html"');
    expect(home).toMatch(/<a class="cr-unavailable" title="Not available in this offline copy: external tool/);
    expect(home).toMatch(/<a class="cr-unavailable" title="[^"]*file not included/);
    // relative to a nested page
    const asg = read(site.files, 'assignments/gasg1.html');
    expect(asg).toContain('href="../quizzes/gquiz1.html"');
    expect(asg).toContain('href="../assets/site.css"');
  });

  it('sanitizes course HTML', async () => {
    const { site } = await convert(buildFixture());
    const home = read(site.files, 'index.html');
    expect(home).not.toMatch(/<script>alert/);
    expect(home).not.toMatch(/onerror|onclick/);
    expect(home).not.toMatch(/<form|<input/);
    expect(home).not.toContain('javascript:');
    expect(home).not.toContain('insecure.example.com');
    expect(home).not.toContain('data-api-endpoint');
    expect(home).not.toContain('target="_top"');
    expect(home).toMatch(/<iframe[^>]+src="https:\/\/www\.youtube\.com\/embed\/abc"[^>]+sandbox="allow-scripts allow-same-origin/);
    expect(home).toContain(`script-src 'none'`);
  });

  it('renders modules with items, indent, external links and subheaders', async () => {
    const { site } = await convert(buildFixture());
    const m = read(site.files, 'modules.html');
    expect(m.indexOf('Week 1: Basics')).toBeLessThan(m.indexOf('Week 2'));
    expect(m).toContain('href="https://example.org/security-mindset" target="_blank" rel="noopener noreferrer"');
    expect(m).toContain('cr-subheader');
    expect(m).toMatch(/Due <time datetime="2026-09-03T17:00:00.000Z">Sep 3, 2026, 12:00 PM CDT<\/time>/);
    expect(m).toContain('Unpublished');
  });

  it('adds previous/next module navigation to item pages', async () => {
    const { site } = await convert(buildFixture());
    const asg = read(site.files, 'assignments/gasg1.html');
    expect(asg).toMatch(/href="\.\.\/pages\/office-hours\.html"[^>]*>◂ Previous/);
    expect(asg).toMatch(/href="\.\.\/discussions\/gdisc1\.html"[^>]*>Next ▸/);
  });

  it('hides answer keys by default', async () => {
    const { site } = await convert(buildFixture());
    const html = allHtml(site.files);
    expect(html).not.toContain('cr-correct');
    expect(html).not.toContain('SECRET-FEEDBACK');
    expect(html).not.toContain('BLANKANSWER');
    expect(html).not.toContain('Accepted answers');
    expect(read(site.files, 'README.txt')).not.toMatch(/answer keys/);
  });

  it('includes answer keys only when asked', async () => {
    const { site } = await convert(buildFixture(), { includeAnswers: true });
    const bank = read(site.files, 'quizzes/bank-gbank1.html');
    expect(bank).toContain('cr-correct');
    expect(bank).toContain('SECRET-FEEDBACK');
    expect(bank).toContain('BLANKANSWER');
    expect(bank).toContain('between 3.9 and 4.1');
    expect(read(site.files, 'README.txt')).toMatch(/INCLUDES quiz answer keys/);
  });

  it('can leave out unpublished content', async () => {
    const withAll = await convert(buildFixture());
    expect(allHtml(withAll.site.files)).toContain('DRAFT-CONTENT');
    const { site, warnings } = await convert(buildFixture(), { includeUnpublished: false });
    expect(allHtml(site.files)).not.toContain('DRAFT-CONTENT');
    expect(site.files.has('pages/draft-page.html')).toBe(false);
    expect(read(site.files, 'modules.html')).not.toContain('Week 2');
    expect(warnings.join('\n')).toMatch(/unpublished item/);
  });

  it('shows the front page as home and marks hidden tabs', async () => {
    const { site } = await convert(buildFixture());
    const home = read(site.files, 'index.html');
    expect(home).toContain('<h1 class="cr-title">Home Page</h1>');
    expect(home).toMatch(/class="cr-hidden-tab"[^>]*>Assignments/);
  });

  it('renders syllabus with a course summary sorted by date', async () => {
    const { site } = await convert(buildFixture());
    const s = read(site.files, 'syllabus.html');
    expect(s).toContain('href="pages/office-hours.html"');
    const order = ['Essay One', 'Intro thread', 'Quiz 1'].map((t) => s.indexOf(`>${t}</a>`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('escapes titles', async () => {
    const { parseCartridge, buildSite, readArchive } = await import('../src/core/index');
    const { archive } = await readArchive(buildFixture());
    const c = parseCartridge(archive);
    c.pages[0]!.title = '<img src=x onerror=alert(1)>';
    const site = buildSite(c, archive);
    expect(allHtml(site.files)).not.toContain('<img src=x onerror');
  });
});
