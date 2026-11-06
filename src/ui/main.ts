import { readArchive, writeArchive } from '../core/zip';
import { parseCartridge } from '../core/parse';
import { buildSite, type SiteBuild } from '../core/site';
import type { Course } from '../core/model';
import type { Archive } from '../core/zip';
import { Preview } from './preview';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const fileInput = $<HTMLInputElement>('file');
const drop = $<HTMLLabelElement>('drop');
const status = $<HTMLParagraphElement>('status');
const optUnpublished = $<HTMLInputElement>('opt-unpublished');
const optAnswers = $<HTMLInputElement>('opt-answers');
const result = $<HTMLElement>('result');
const downloadBtn = $<HTMLButtonElement>('download');
const previewBtn = $<HTMLButtonElement>('preview-open');
const previewSection = $<HTMLElement>('preview');
const previewFrame = $<HTMLIFrameElement>('preview-frame');
const previewPath = $<HTMLSpanElement>('preview-path');

let archive: Archive | null = null;
let course: Course | null = null;
let site: SiteBuild | null = null;
let preview: Preview | null = null;

function setStatus(msg: string, error = false): void {
  status.textContent = msg;
  status.classList.toggle('error', error);
}

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

async function load(file: File): Promise<void> {
  closePreview();
  result.hidden = true;
  archive = course = site = null;
  try {
    setStatus(`Reading ${file.name} (${(file.size / 1024 ** 2).toFixed(1)} MB)…`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    setStatus('Unpacking…');
    const read = await readArchive(bytes);
    archive = read.archive;
    setStatus('Reading course structure…');
    await nextFrame();
    course = parseCartridge(archive, read.warnings);
    await rebuild();
  } catch (e) {
    console.error(e);
    setStatus(`Could not convert this file: ${(e as Error).message}`, true);
  }
}

async function rebuild(): Promise<void> {
  if (!archive || !course) return;
  setStatus('Building website…');
  await nextFrame();
  site = buildSite(course, archive, {
    includeAnswers: optAnswers.checked,
    includeUnpublished: optUnpublished.checked,
  });
  render();
  setStatus('Ready.');
  if (!previewSection.hidden) openPreview();
}

function render(): void {
  if (!course || !site) return;
  $('course-title').textContent = course.title;
  const labels: Record<string, string> = {
    modules: 'modules',
    pages: 'pages',
    assignments: 'assignments',
    announcements: 'announcements',
    discussions: 'discussions',
    quizzes: 'quizzes',
    questionBanks: 'question banks',
    files: 'files',
  };
  const stats = $('stats');
  stats.replaceChildren(
    ...Object.entries(labels).map(([k, label]) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = String(site!.stats[k] ?? 0);
      li.append(b, ` ${label}`);
      return li;
    }),
  );
  const warnings = [...new Set([...course.warnings, ...site.warnings])];
  const box = $<HTMLDetailsElement>('warnings-box');
  box.hidden = warnings.length === 0;
  $('warnings-summary').textContent = `${warnings.length} note${warnings.length === 1 ? '' : 's'} about this conversion`;
  $('warnings').replaceChildren(
    ...warnings.map((w) => {
      const li = document.createElement('li');
      li.textContent = w;
      return li;
    }),
  );
  downloadBtn.textContent = optAnswers.checked ? 'Download instructor copy (.zip)' : 'Download website (.zip)';
  result.hidden = false;
}

async function download(): Promise<void> {
  if (!site) return;
  downloadBtn.disabled = true;
  setStatus('Compressing…');
  try {
    const bytes = await writeArchive(site.files, site.rootName);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${site.rootName}${optAnswers.checked ? '-instructor' : ''}.zip`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setStatus(`Saved ${a.download} (${(bytes.byteLength / 1024 ** 2).toFixed(1)} MB).`);
  } catch (e) {
    setStatus(`Could not create the ZIP: ${(e as Error).message}`, true);
  } finally {
    downloadBtn.disabled = false;
  }
}

function openPreview(): void {
  if (!site) return;
  preview?.dispose();
  preview = new Preview(previewFrame, site.files, (p) => (previewPath.textContent = p));
  previewSection.hidden = false;
  preview.show('index.html');
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closePreview(): void {
  preview?.dispose();
  preview = null;
  previewSection.hidden = true;
}

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void load(f);
  fileInput.value = '';
});
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer?.files[0];
  if (f) void load(f);
});
// Dropping a file anywhere else shouldn't navigate away from the app.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

optAnswers.addEventListener('change', () => void rebuild());
optUnpublished.addEventListener('change', () => void rebuild());
downloadBtn.addEventListener('click', () => void download());
previewBtn.addEventListener('click', openPreview);
$('preview-close').addEventListener('click', closePreview);
$('preview-back').addEventListener('click', () => preview?.back());
