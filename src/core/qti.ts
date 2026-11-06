// QTI 1.2 (Canvas flavour) parsing for question banks and classic quizzes.
//
// Verified against a Canvas question-bank export covering all ten classic question
// types. The <assessment>/<section> (quiz + question group) handling follows the
// QTI 1.2 spec and Canvas's exporter conventions but has NOT been verified against a
// real classic-quiz export yet.

import type { Question, QResponse, QuestionBank, QuizEntry, QuestionGroup } from './model';
import { all, kid, kids, text } from './xml';

function escapeText(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** HTML for a <material>: mattext is HTML when texttype says so, plain text otherwise. */
function materialHtml(material: Element | undefined): string {
  if (!material) return '';
  return kids(material, 'mattext')
    .map((m) => {
      const t = m.textContent ?? '';
      return (m.getAttribute('texttype') ?? '').toLowerCase() === 'text/html' ? t : escapeText(t);
    })
    .join('');
}

function metadata(item: Element): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of all(kid(item, 'itemmetadata'), 'qtimetadatafield')) {
    const k = text(f, 'fieldlabel');
    if (k) out.set(k, text(f, 'fieldentry') ?? '');
  }
  return out;
}

function isNegated(el: Element, stop: Element): boolean {
  for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
    if (p.localName === 'not') return true;
  }
  return false;
}

/** Does this respcondition award credit? */
function awardsCredit(cond: Element): boolean {
  return kids(cond, 'setvar').some((sv) => {
    const v = Number(sv.textContent);
    return Number.isFinite(v) && v > 0;
  });
}

export function parseItem(item: Element): Question {
  const meta = metadata(item);
  const presentation = kid(item, 'presentation');
  const responses: QResponse[] = [];
  const byId = new Map<string, QResponse>();

  for (const r of presentation ? Array.from(presentation.querySelectorAll('*')) : []) {
    if (r.localName !== 'response_lid' && r.localName !== 'response_str' && r.localName !== 'response_num') continue;
    const resp: QResponse = {
      id: r.getAttribute('ident') ?? '',
      label: kid(kid(r, 'material'), 'mattext')?.textContent?.trim() || undefined,
      kind: r.localName === 'response_lid' ? 'choice' : 'text',
      multiple: (r.getAttribute('rcardinality') ?? '').toLowerCase() === 'multiple',
      choices: all(kid(r, 'render_choice'), 'response_label').map((l) => ({
        id: l.getAttribute('ident') ?? '',
        html: materialHtml(kid(l, 'material')),
        correct: false,
      })),
      accepted: [],
    };
    responses.push(resp);
    byId.set(resp.id, resp);
  }

  const resproc = kid(item, 'resprocessing');
  for (const cond of kids(resproc, 'respcondition')) {
    if (!awardsCredit(cond)) continue;
    const cv = kid(cond, 'conditionvar');
    if (!cv) continue;
    for (const eq of all(cv, 'varequal')) {
      if (isNegated(eq, cv)) continue;
      const resp = byId.get(eq.getAttribute('respident') ?? '');
      const value = (eq.textContent ?? '').trim();
      if (!resp || !value) continue;
      if (resp.kind === 'choice') {
        const c = resp.choices.find((ch) => ch.id === value);
        if (c) c.correct = true;
      } else if (!resp.accepted.includes(value)) {
        resp.accepted.push(value);
      }
    }
    // Numeric ranges: <and><vargte>lo</vargte><varlte>hi</varlte></and> with lo != hi.
    for (const and of all(cv, 'and')) {
      const lo = kid(and, 'vargte') ?? kid(and, 'vargt');
      const hi = kid(and, 'varlte') ?? kid(and, 'varlt');
      if (!lo || !hi || isNegated(and, cv)) continue;
      const resp = byId.get(lo.getAttribute('respident') ?? '');
      const a = lo.textContent?.trim();
      const b = hi.textContent?.trim();
      if (resp && a && b && a !== b) {
        const s = `between ${a} and ${b}`;
        if (!resp.accepted.includes(s)) resp.accepted.push(s);
      }
    }
  }

  const feedback: Question['feedback'] = {};
  for (const fb of kids(item, 'itemfeedback')) {
    const html = materialHtml(kid(kid(fb, 'flow_mat'), 'material'));
    if (!html) continue;
    const id = fb.getAttribute('ident') ?? '';
    if (id === 'general_fb') feedback.general = html;
    else if (id === 'correct_fb') feedback.correct = html;
    else if (id === 'general_incorrect_fb') feedback.incorrect = html;
  }

  const pts = Number(meta.get('points_possible'));
  return {
    id: item.getAttribute('ident') ?? '',
    title: item.getAttribute('title') ?? 'Question',
    type: meta.get('question_type') ?? 'unknown',
    points: Number.isFinite(pts) ? pts : undefined,
    html: materialHtml(kid(presentation, 'material')),
    responses,
    feedback,
  };
}

function sectionEntries(section: Element): QuizEntry[] {
  const out: QuizEntry[] = [];
  for (const child of Array.from(section.children)) {
    if (child.localName === 'item') {
      out.push({ kind: 'question', question: parseItem(child) });
    } else if (child.localName === 'section') {
      const sel = all(child, 'selection')[0];
      const pick = Number(text(sel, 'selection_number'));
      const ppi = Number(text(kid(sel, 'selection_extension'), 'points_per_item'));
      const group: QuestionGroup = {
        id: child.getAttribute('ident') ?? '',
        title: child.getAttribute('title') ?? 'Question group',
        pick: Number.isFinite(pick) ? pick : undefined,
        pointsPerItem: Number.isFinite(ppi) ? ppi : undefined,
        bankRef: text(sel, 'sourcebank_ref'),
        questions: kids(child, 'item').map(parseItem),
      };
      out.push({ kind: 'group', group });
    }
  }
  return out;
}

export interface QtiFile {
  banks: QuestionBank[];
  /** Assessments keyed by ident. */
  assessments: Map<string, { title: string; entries: QuizEntry[] }>;
}

export function parseQti(doc: Document): QtiFile {
  const banks: QuestionBank[] = all(doc, 'objectbank').map((ob) => {
    let title = 'Question bank';
    for (const f of all(kid(ob, 'qtimetadata'), 'qtimetadatafield')) {
      if (text(f, 'fieldlabel') === 'bank_title') title = text(f, 'fieldentry') ?? title;
    }
    return { id: ob.getAttribute('ident') ?? '', title, questions: kids(ob, 'item').map(parseItem) };
  });
  const assessments = new Map<string, { title: string; entries: QuizEntry[] }>();
  for (const a of all(doc, 'assessment')) {
    const entries: QuizEntry[] = [];
    for (const s of kids(a, 'section')) entries.push(...sectionEntries(s));
    assessments.set(a.getAttribute('ident') ?? '', { title: a.getAttribute('title') ?? '', entries });
  }
  return { banks, assessments };
}
