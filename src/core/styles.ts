// Stylesheet for the generated site: a close-enough approximation of Canvas's
// course layout. Light only, like Canvas: instructor content is full of inline
// colors that a dark theme would wreck.
export const SITE_CSS = `
:root {
  --text: #2d3b45; --muted: #6b7780; --link: #0374b5; --border: #c7cdd1;
  --soft: #f5f5f5; --rail: #394b58; --accent: #0374b5; --ok: #0b874b;
  --warn-bg: #fff8e1; --warn-border: #f0c36d; --bad: #e0061f;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: #fff; color: var(--text);
  font: 16px/1.5 "Lato Extended", Lato, "Helvetica Neue", Helvetica, Arial, sans-serif; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
img, video, iframe { max-width: 100%; }
img { height: auto; }

.cr-banner { background: var(--warn-bg); border-bottom: 1px solid var(--warn-border); padding: 6px 16px;
  font-size: 13px; color: #5c4400; }
.cr-header { display: flex; align-items: center; gap: 8px; min-height: 56px; padding: 8px 24px;
  border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.cr-crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 16px; }
.cr-crumbs .cr-icon { width: 14px; height: 14px; color: var(--muted); }
.cr-crumbs span:last-child { color: var(--text); }

.cr-layout { display: flex; align-items: flex-start; }
.cr-coursenav { flex: 0 0 200px; padding: 16px 0 16px 24px; position: sticky; top: 0; }
.cr-coursenav ul { list-style: none; margin: 0; padding: 0; }
.cr-coursenav a { display: block; padding: 6px 12px; border-left: 3px solid transparent; font-size: 15px; }
.cr-coursenav a[aria-current="page"] { border-left-color: var(--text); color: var(--text); font-weight: 600; }
.cr-coursenav a.cr-hidden-tab { color: var(--muted); }
.cr-coursenav .cr-term { padding: 0 12px 12px 15px; font-size: 13px; color: var(--muted); }
.cr-main { flex: 1 1 auto; min-width: 0; padding: 24px 32px 64px; max-width: 1100px; }

h1.cr-title { font-size: 28px; font-weight: 400; margin: 0 0 16px; }
.cr-badges { display: inline-flex; gap: 6px; vertical-align: middle; margin-left: 8px; }
.cr-badge { display: inline-block; font-size: 12px; line-height: 18px; padding: 0 8px; border-radius: 9px;
  border: 1px solid var(--border); color: var(--muted); background: #fff; font-weight: 400; white-space: nowrap; }
.cr-badge.cr-unpub { border-color: #c7cdd1; color: #8b969e; background: var(--soft); }
.cr-badge.cr-hidden { border-color: var(--warn-border); background: var(--warn-bg); color: #5c4400; }
.cr-muted { color: var(--muted); }
.cr-notice { background: var(--soft); border: 1px solid var(--border); border-radius: 4px; padding: 12px 16px; margin: 16px 0; }

/* User content */
.cr-content { overflow-wrap: anywhere; }
.cr-content table { border-collapse: collapse; max-width: 100%; }
.cr-content td, .cr-content th { border: 1px solid var(--border); padding: 4px 8px; }
.cr-content .cr-unavailable, a.cr-unavailable { color: var(--muted); text-decoration: line-through dotted; cursor: help; }
.cr-content iframe { border: 0; }
.cr-unavailable-embed { padding: 24px; text-align: center; background: var(--soft); border: 1px dashed var(--border); color: var(--muted); }

/* Modules */
.cr-module { border: 1px solid var(--border); border-radius: 4px; margin: 0 0 24px; overflow: hidden; }
.cr-module > summary { list-style: none; cursor: pointer; background: var(--soft); padding: 12px 16px;
  display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 17px; border-bottom: 1px solid var(--border); }
.cr-module > summary::-webkit-details-marker { display: none; }
.cr-module > summary .cr-icon { transition: transform .15s; flex: none; }
.cr-module[open] > summary .cr-icon:first-child { transform: rotate(90deg); }
.cr-module:not([open]) > summary { border-bottom: 0; }
.cr-items { list-style: none; margin: 0; padding: 0; }
.cr-item { display: flex; align-items: flex-start; gap: 12px; padding: 10px 16px; border-top: 1px solid #e6e9ea; }
.cr-item:first-child { border-top: 0; }
.cr-item > .cr-icon { flex: none; margin-top: 2px; color: var(--text); }
.cr-item .cr-meta { font-size: 13px; color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; }
.cr-item.cr-subheader { font-weight: 700; background: #fafbfb; }
.cr-item.cr-unpublished { opacity: .75; }
.cr-item .cr-ext { width: 14px; height: 14px; vertical-align: -2px; margin-left: 4px; color: var(--muted); }

/* Lists / tables */
.cr-list { list-style: none; padding: 0; margin: 0 0 24px; border: 1px solid var(--border); border-radius: 4px; }
.cr-list > li { padding: 12px 16px; border-top: 1px solid #e6e9ea; display: flex; gap: 12px; align-items: flex-start; }
.cr-list > li:first-child { border-top: 0; }
.cr-list > li > .cr-icon { flex: none; margin-top: 2px; }
.cr-list .cr-meta { font-size: 13px; color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; }
.cr-list .cr-excerpt { font-size: 14px; color: var(--muted); margin-top: 4px; }
h2.cr-group { font-size: 18px; margin: 24px 0 8px; padding: 8px 16px; background: var(--soft); border: 1px solid var(--border); border-radius: 4px; }
table.cr-table { width: 100%; border-collapse: collapse; margin: 0 0 24px; font-size: 15px; }
.cr-table th, .cr-table td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e6e9ea; vertical-align: top; }
.cr-table th { border-bottom: 2px solid var(--border); font-weight: 700; }
.cr-table .cr-num { text-align: right; white-space: nowrap; }
.cr-table-wrap { overflow-x: auto; }

/* Assignment details */
.cr-details { display: grid; grid-template-columns: max-content 1fr; gap: 4px 24px; padding: 12px 0;
  margin: 0 0 24px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.cr-details dt { font-weight: 700; }
.cr-details dd { margin: 0; }

/* Files */
.cr-tree, .cr-tree ul { list-style: none; margin: 0; padding: 0; }
.cr-tree ul { padding-left: 24px; }
.cr-tree li { padding: 2px 0; }
.cr-tree summary { cursor: pointer; display: inline-flex; gap: 6px; align-items: center; font-weight: 600; }
.cr-tree .cr-file { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cr-tree .cr-size { font-size: 13px; color: var(--muted); }

/* Quizzes */
.cr-question { border: 1px solid var(--border); border-radius: 4px; margin: 0 0 24px; }
.cr-question > header { background: var(--soft); border-bottom: 1px solid var(--border); padding: 8px 16px;
  display: flex; justify-content: space-between; font-weight: 700; gap: 12px; }
.cr-question > .cr-qbody { padding: 16px; }
.cr-choices { list-style: none; padding: 0; margin: 12px 0 0; }
.cr-choices li { display: flex; gap: 10px; align-items: baseline; padding: 6px 8px; border-radius: 4px; }
.cr-choices li .cr-mark { flex: none; width: 14px; height: 14px; border: 1.5px solid var(--muted); border-radius: 50%; position: relative; top: 2px; }
.cr-choices.cr-multi li .cr-mark { border-radius: 3px; }
.cr-choices li.cr-correct { background: #e7f5ee; }
.cr-choices li.cr-correct .cr-mark { background: var(--ok); border-color: var(--ok); }
.cr-correct-label { font-size: 12px; color: var(--ok); font-weight: 700; margin-left: auto; white-space: nowrap; }
.cr-blank { display: inline-block; min-width: 160px; border-bottom: 1.5px solid var(--muted); height: 1.4em; }
.cr-essay { border: 1px solid var(--border); border-radius: 4px; height: 96px; background: #fafbfb; margin-top: 12px; }
.cr-match { width: 100%; border-collapse: collapse; margin-top: 12px; }
.cr-match td { padding: 6px 8px; border-bottom: 1px solid #e6e9ea; vertical-align: top; }
.cr-answers { margin-top: 12px; font-size: 14px; }
.cr-answers strong { color: var(--ok); }
.cr-feedback { margin-top: 12px; padding: 8px 12px; border-left: 3px solid var(--accent); background: #f2f8fc; font-size: 14px; }
.cr-group-box { border: 1px dashed var(--border); border-radius: 4px; padding: 12px 16px; margin: 0 0 24px; }

/* Module item sequence footer */
.cr-seq { display: flex; justify-content: space-between; gap: 12px; margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); }
.cr-seq a { display: inline-block; padding: 6px 14px; border: 1px solid var(--border); border-radius: 4px; background: var(--soft); color: var(--text); }
.cr-seq a:hover { text-decoration: none; background: #eceeef; }

@media (max-width: 768px) {
  .cr-layout { display: block; }
  .cr-coursenav { position: static; padding: 8px 16px; border-bottom: 1px solid var(--border); }
  .cr-coursenav ul { display: flex; flex-wrap: wrap; gap: 4px 0; }
  .cr-coursenav a { border-left: 0; border-bottom: 3px solid transparent; padding: 4px 10px; }
  .cr-coursenav a[aria-current="page"] { border-bottom-color: var(--text); }
  .cr-coursenav .cr-term { display: none; }
  .cr-main { padding: 16px; }
  .cr-header { padding: 8px 16px; }
  .cr-details { grid-template-columns: 1fr; }
}
@media print {
  .cr-banner, .cr-coursenav, .cr-seq { display: none; }
  .cr-main { padding: 0; max-width: none; }
}
`;
