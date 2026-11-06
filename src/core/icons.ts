// Small inline SVG icon set (stroke icons, 20x20, currentColor).
import { raw, type Raw } from './html';

const svg = (body: string): Raw =>
  raw(
    `<svg class="cr-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  );

export const icons = {
  page: svg('<path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5V6h3.5"/><path d="M7.5 10h5M7.5 13h5"/>'),
  assignment: svg('<rect x="4" y="3" width="12" height="15" rx="1.5"/><path d="M7.5 3V1.8h5V3"/><path d="M7 9l2 2 4-4"/><path d="M7 14h6"/>'),
  file: svg('<path d="M13.5 9.5l-5 5a3 3 0 0 1-4.2-4.2l6-6a2 2 0 0 1 2.8 2.8l-6 6a1 1 0 0 1-1.4-1.4l5-5"/>'),
  link: svg('<path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1"/>'),
  discussion: svg('<path d="M3 4h10v7H7l-3 2.5V11H3z"/><path d="M13 7h4v7h-1v2.5L13 14H9v-1"/>'),
  announcement: svg('<path d="M3 8v4h3l6 4V4L6 8z"/><path d="M15 7.5a3.5 3.5 0 0 1 0 5"/>'),
  quiz: svg('<circle cx="10" cy="10" r="7.5"/><path d="M8 7.8a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.9"/><path d="M10 14h.01"/>'),
  tool: svg('<path d="M8 3h4v3a1.5 1.5 0 1 0 3 0V3h2v14H3V3h2v3a1.5 1.5 0 1 0 3 0z"/>'),
  caret: svg('<path d="M7 5l5 5-5 5"/>'),
  folder: svg('<path d="M2.5 5.5a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"/>'),
  external: svg('<path d="M11 3h6v6"/><path d="M17 3l-8 8"/><path d="M15 12v4.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H8"/>'),
  lock: svg('<rect x="4.5" y="9" width="11" height="8" rx="1"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>'),
};

export type IconName = keyof typeof icons;
