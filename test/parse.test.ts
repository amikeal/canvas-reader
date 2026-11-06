import { readArchive } from '../src/core/zip';
import { parseCartridge, CartridgeError } from '../src/core/parse';
import { buildFixture } from './fixture';
import { strToU8, zipSync } from 'fflate';

async function course() {
  const { archive, warnings } = await readArchive(buildFixture());
  return parseCartridge(archive, warnings);
}

describe('parseCartridge', () => {
  it('reads course settings and navigation tabs', async () => {
    const c = await course();
    expect(c.title).toBe('Test Course 101: Fundamentals');
    expect(c.courseCode).toBe('TEST 101');
    expect(c.defaultView).toBe('wiki');
    expect(c.timeZone).toBe('America/Chicago');
    expect(c.exportedAt).toBe('2026-11-01');
    expect(c.tabs.map((t) => `${t.kind}${t.hidden ? '*' : ''}`)).toEqual([
      'home',
      'announcements',
      'syllabus',
      'modules',
      'quizzes',
      'assignments*',
      'discussions*',
      'files*',
      'pages*',
    ]);
  });

  it('orders modules and items by position', async () => {
    const c = await course();
    expect(c.modules.map((m) => m.title)).toEqual(['Week 1: Basics', 'Week 2']);
    const items = c.modules[0]!.items;
    expect(items.map((i) => i.type)).toEqual([
      'WikiPage',
      'ExternalUrl',
      'Attachment',
      'ContextModuleSubHeader',
      'Assignment',
      'DiscussionTopic',
      'Quizzes::Quiz',
      'ContextExternalTool',
    ]);
    expect(items[1]!.url).toBe('https://example.org/security-mindset');
    expect(items[4]!.indent).toBe(1);
    expect(c.modules[1]!.published).toBe(false);
  });

  it('reads pages with front page and publish state', async () => {
    const c = await course();
    const byTitle = Object.fromEntries(c.pages.map((p) => [p.title, p]));
    expect(byTitle['Home Page']!.frontPage).toBe(true);
    expect(byTitle['Draft']!.published).toBe(false);
    expect(byTitle['Office Hours']!.slug).toBe('office-hours');
  });

  it('reads assignment settings', async () => {
    const c = await course();
    const a = c.assignments[0]!;
    expect(a).toMatchObject({
      id: 'gasg1',
      title: 'Essay One',
      dueAt: '2026-09-03T17:00:00',
      points: 20,
      submissionTypes: ['online_upload', 'online_text_entry'],
      allowedExtensions: ['pdf', 'docx'],
      groupId: 'ggroup1',
      published: true,
    });
    expect(a.html).toContain('Write 500 words');
    expect(c.assignmentGroups).toEqual([{ id: 'ggroup1', title: 'Papers', position: 1, weight: 40 }]);
  });

  it('separates announcements from discussions and keeps graded discussion data', async () => {
    const c = await course();
    const ann = c.discussions.find((d) => d.isAnnouncement)!;
    const disc = c.discussions.find((d) => !d.isAnnouncement)!;
    expect(ann.title).toBe('Class cancelled');
    expect(ann.html).toContain('<p>No class today.');
    expect(disc.assignment?.points).toBe(5);
  });

  it('reads files, hidden folders, links and LTI', async () => {
    const c = await course();
    expect(c.files.map((f) => [f.path, f.id, f.hidden])).toEqual([
      ['Uploaded Media/banner.png', 'gfile2', true],
      ['Week 1/Lecture (1).pdf', 'gfile1', false],
    ]);
    expect(c.webLinks[0]).toMatchObject({ title: 'Schneier', url: 'https://example.org/security-mindset' });
    expect(c.ltiLinks[0]).toMatchObject({ title: 'Publisher Lab', resourceLinkUrl: 'https://tool.example.com/link/1' });
  });

  it('parses question banks with answer keys', async () => {
    const c = await course();
    const bank = c.questionBanks[0]!;
    expect(bank.title).toBe('Unit 1 Bank');
    const [mc, ma, fib, num, essay] = bank.questions;
    expect(mc!.type).toBe('multiple_choice_question');
    expect(mc!.points).toBe(2);
    expect(mc!.responses[0]!.choices.map((ch) => ch.correct)).toEqual([true, false]);
    expect(mc!.responses[0]!.choices[1]!.html).toBe('Velocity &lt;b&gt;'); // plain text is escaped
    expect(mc!.feedback.general).toBe('SECRET-FEEDBACK');
    expect(ma!.responses[0]!.choices.map((ch) => ch.correct)).toEqual([true, false, true]); // <not> excluded
    expect(fib!.responses[0]!.label).toBe('c1');
    expect(num!.responses[0]!.accepted).toEqual(['4.0', 'between 3.9 and 4.1']);
    expect(essay!.responses[0]!.accepted).toEqual([]);
  });

  it('parses classic quizzes including question groups', async () => {
    const c = await course();
    const q = c.quizzes[0]!;
    expect(q).toMatchObject({ id: 'gquiz1', title: 'Quiz 1', points: 5, timeLimit: 30, published: true, assignmentId: 'gquizasg' });
    expect(q.questions.map((e) => e.kind)).toEqual(['question', 'group']);
    const g = q.questions[1]!;
    expect(g.kind === 'group' && g.group).toMatchObject({ pick: 2, pointsPerItem: 1.5, bankRef: 'gbank1' });
  });

  it('warns about content it does not render', async () => {
    const c = await course();
    const w = c.warnings.join('\n');
    expect(w).toMatch(/unsupported type "imsqti_xmlv2p0\/mystery"/);
    expect(w).toMatch(/rubrics/);
  });

  it('rejects archives without a manifest', async () => {
    const { archive } = await readArchive(zipSync({ 'readme.txt': strToU8('hi') }));
    expect(() => parseCartridge(archive)).toThrow(CartridgeError);
  });
});
