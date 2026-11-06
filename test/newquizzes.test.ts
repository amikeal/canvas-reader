// Regressions from a real New Quizzes export:
//  - browsers rejected assessment_meta.xml (whitespace in an xmlns URI), dropping the quiz
//  - quiz-backed assignments never appeared on the Assignments page
//  - New Quizzes fill-in-blank labels are the answers and leaked with answers off
import { convert } from '../src/core/index';
import { readArchive } from '../src/core/zip';
import { parseCartridge } from '../src/core/parse';
import { repairXml } from '../src/core/xml';
import { buildFixture, fixtureFiles } from './fixture';

const dec = new TextDecoder();
const page = (files: Map<string, Uint8Array>, p: string) => dec.decode(files.get(p)!);
const allHtml = (files: Map<string, Uint8Array>) =>
  [...files.entries()]
    .filter(([p]) => p.endsWith('.html'))
    .map(([, b]) => dec.decode(b))
    .join('\n');

// jsdom tolerates what Chrome's libxml2 rejects, so assert the repaired input is
// clean rather than relying on the test parser to fail.
const XMLNS = /\sxmlns(?::[\w.-]+)?\s*=\s*(["'])([^"']*)\1/g;

describe('repairXml', () => {
  it('keeps only the first token of an xmlns URI containing whitespace', () => {
    const src = '<quiz xmlns="http://a/x" xmlns:xsi="http://a/x https://a/x.xsd" identifier="q"/>';
    expect(repairXml(src)).toBe('<quiz xmlns="http://a/x" xmlns:xsi="http://a/x" identifier="q"/>');
  });

  it('leaves valid documents byte-identical', () => {
    const src = `<a xmlns="http://ok" xmlns:b='http://ok/b' schemaLocation="x y"/>`;
    expect(repairXml(src)).toBe(src);
  });

  it('leaves no whitespace in any namespace URI across the fixture', () => {
    for (const [path, body] of Object.entries(fixtureFiles())) {
      if (typeof body !== 'string' || !/\.(xml|qti)$/.test(path)) continue;
      for (const m of repairXml(body).matchAll(XMLNS)) expect(m[2], `${path}: ${m[0]}`).not.toMatch(/\s/);
    }
  });
});

describe('New Quizzes', () => {
  it('parses the quiz, its questions and its assignment', async () => {
    const { archive } = await readArchive(buildFixture());
    const c = parseCartridge(archive);
    expect(c.warnings.join('\n')).not.toMatch(/parse error/i);
    const q = c.quizzes.find((x) => x.id === 'gnewq1')!;
    expect(q.title).toBe('New Quiz 1');
    expect(q.published).toBe(true); // <available>false</available> is overridden by the assignment
    expect(q.assignment).toMatchObject({ id: 'gnewqasg', groupId: 'gquizgroup', points: 10 });
    expect(q.questions.map((e) => e.kind === 'question' && e.question.type)).toEqual([
      'fill_in_multiple_blanks_question',
      'categorization_question',
    ]);
  });

  it('lists quiz-backed assignments in their assignment group', async () => {
    const { site } = await convert(buildFixture());
    const a = page(site.files, 'assignments.html');
    const quizzesGroup = a.slice(a.indexOf('<h2 class="cr-group">Quizzes'));
    expect(quizzesGroup).toContain('href="quizzes/gnewq1.html">New Quiz 1</a>');
    expect(quizzesGroup).toMatch(/Due <time[^>]*>Jan 30, 2024, 4:20 PM CST<\/time>/);
    expect(a.match(/>New Quiz 1<\/a>/g)).toHaveLength(1);
    expect(page(site.files, 'syllabus.html').match(/>New Quiz 1<\/a>/g)).toHaveLength(1);
  });

  it('never shows fill-in-blank answers without includeAnswers', async () => {
    const { site } = await convert(buildFixture());
    const html = allHtml(site.files);
    expect(html).not.toContain('SECRETBLANK');
    const q = page(site.files, 'quizzes/gnewq1.html');
    expect(q).toContain('GPT stands for [Blank 1]');
    expect(q).not.toContain('dc1a0e7e-fe3b');
  });

  it('shows fill-in-blank answers with includeAnswers', async () => {
    const { site } = await convert(buildFixture(), { includeAnswers: true });
    const q = page(site.files, 'quizzes/gnewq1.html');
    expect(q).toMatch(/\[Blank 1\]<\/td><td><span class="cr-answers"><strong>Accepted:<\/strong> SECRETBLANK/);
  });

  it('renders categorization questions without leaking the mapping', async () => {
    const off = page((await convert(buildFixture())).site.files, 'quizzes/gnewq1.html');
    expect(off).toContain('<strong>Categories:</strong> ML · AI');
    expect(off.match(/Learns from data/g)).toHaveLength(1); // items listed once, not per category
    expect(off).not.toContain('cr-correct');
    const on = page((await convert(buildFixture(), { includeAnswers: true })).site.files, 'quizzes/gnewq1.html');
    expect(on).toMatch(/<strong>ML<\/strong><\/td><td><div>Learns from data<\/div><\/td>/);
    expect(on).toMatch(/<strong>AI<\/strong><\/td><td><div>Senses and acts<\/div><\/td>/);
  });
});
