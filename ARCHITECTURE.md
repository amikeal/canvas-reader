# canvas-reader: architecture, decisions and handoff

This document records **why** canvas-reader is built the way it is: what was decided, by whom,
what was rejected, what was learned about Canvas exports, and what is still unverified. It is
for whoever maintains or extends the tool next, human or coding agent.

`README.md` is the user's guide. This file is the design record.

Status (November 2026): working and deployed at https://canvas-reader.netlify.app. That
deployment is **out of date** ([§8](#8-deployment)).

---

## 1. Purpose

When Canvas LMS is unavailable for an extended period, faculty lose access to their course
materials. canvas-reader turns a Canvas **course export** (`.imscc`) into a stand-alone,
read-only website that looks roughly like Canvas. The instructor can browse it from a laptop
or USB stick with no Canvas, no server and no internet connection.

**Companion project:** [canvas-exporter](https://github.com/amikeal/canvas-exporter) produces
those exports automatically every week and drops them in each instructor's Google Shared
Drive.
- **Decision (project owner):** the two projects are **completely independent**, separate
  repositories with no shared code.
- canvas-reader must keep working on hand-made exports from Canvas's UI as well as on API
  exports.

---

## 2. Requirements and decisions

Decided by the project owner unless marked *(implementation)*:

1. **Input:** a Canvas course export (`.imscc`), uploaded by the instructor.
2. **Output:** a browsable, read-only copy that "roughly matches how Canvas renders its
   courses, but doesn't need to be exact." The owner suggested either a downloadable
   static-site ZIP or a single-file SPA.
3. **Purpose:** faculty backup and recovery during a Canvas outage.
4. **Shape:** *(implementation, accepted by owner)* a **single-file converter** that runs
   entirely in the browser and outputs a **multi-page static site** as a ZIP. See
   [§4.1](#41-a-single-file-converter-that-produces-a-multi-page-static-site).
5. **Defaults** *(implementation, accepted by owner)*:
   - Quiz **answer keys off**.
   - **Unpublished content included**, with an "Unpublished" badge.
   - **Grades out of scope** (they aren't in course exports anyway).
6. **Hosting:** the owner deployed the converter with **Netlify Drop** (drag-and-drop), not a
   connected CI deploy.
7. **No `_headers` file on Netlify:** the owner chose "Leave as is" ([§8](#8-deployment)).
8. **Public GitHub repo, scrubbed of real course identifiers** before the first push. No real
   course content is ever committed ([§9](#9-repository-hygiene)).
9. **Owner's standing engineering constraints:**
   - Security-conscious defaults.
   - Builds, tests and dev servers run in a container (Apple `container`, via `scripts/ctr`),
     never on the host.
   - Small commits; plan before non-trivial changes.
   - Mark inferences as inferences.

---

## 3. What a Canvas export is (learned from real exports)

- **A ZIP file**: IMS Common Cartridge 1.1 (`imsmanifest.xml`) plus Canvas's own extension
  files under `course_settings/`. It is not a proprietary format; the owner initially assumed
  a custom "XIP" archive.
- **No student data, by Canvas's design:** no submissions, grades, roster or discussion
  replies.
- **ZIP64 quirk:** Canvas (rubyzip) writes ZIP64 extra fields with `0xFFFFFFFF` sentinel sizes
  for every entry, but **no ZIP64 end-of-central-directory record**. `fflate`'s unzip therefore
  treated every entry as 4 GiB and failed ([§4.3](#43-zip-reading)).
- **Timestamps are UTC without a zone suffix.** For example, a course `start_at` of
  `2026-08-24T05:00:00` is midnight US Central.
  - Assignments carry `<time_zone_edited>` with a Rails zone name, which is mapped to IANA
    (`src/core/dates.ts`) so times render in the instructor's zone, not the viewer's.
  - **Verified** against the Canvas UI: due times matched exactly.
- **Where content lives:**

| Content | Source in the archive |
|---|---|
| Modules: order, indent, sub-headers, publish state | `course_settings/module_meta.xml` (better than the manifest's `<organizations>`) |
| Pages, front page | `wiki_content/*.html` with `<meta>` id/state |
| Assignments: due, points, submission types, group | `<id>/assignment_settings.xml` + HTML |
| Announcements, discussions (incl. graded) | `imsdt` topic XML + `topicMeta` (`type=announcement`) |
| Files | `web_resources/**` |
| Classic quizzes, New Quizzes, question banks | `<id>/assessment_meta.xml`, `non_cc_assessments/*.qti` (QTI 1.2, **contains answer keys**) |
| Syllabus, course summary, assignment groups (with weights), nav tabs | `course_settings/*` |
| Grading schemes (parsed into the model, **not rendered**) | `course_settings/grading_standards.xml` |
| External links; LTI tools | `imswl`; `lti_resource_links/*.xml` |
| Not rendered yet (warned about) | rubrics, calendar events, outcomes, external feeds, course pacing, blueprint settings |

- **Link tokens in HTML bodies** have to be rewritten into relative site links:
  - `$IMS-CC-FILEBASE$/…`
  - `$WIKI_REFERENCE$/pages/<slug>`
  - `$CANVAS_OBJECT_REFERENCE$/<type>/<id>`
  - `$CANVAS_COURSE_REFERENCE$/…`
  - plus `?canvas_download=1` suffixes and absolute links back to the original course.

  Anything that can't be resolved offline is shown struck through as "unavailable" and
  counted in the warnings.

### 3.1 New Quizzes quirks

New Quizzes are exported in the classic QTI layout, with several defects:

1. **Invalid namespace:** `assessment_meta.xml` declares `xmlns:xsi` with a **whitespace-
   containing value** (a schemaLocation pasted into xmlns). Chrome's libxml2 rejects that as a
   fatal error, **jsdom accepts it**, and so tests passed while every New Quiz vanished in the
   browser.
   - Fix: `repairXml` keeps the first token of any such xmlns value, applied to **all** XML so
     tests and browser parse identical input.
2. **Unreliable availability flag:** `<available>false</available>` appears even on published
   quizzes. The embedded `<assignment>`'s workflow state wins.
3. **Assignment data lives inside the quiz:** a quiz's group, due date and points are in the
   quiz's own `assessment_meta.xml`. The Assignments page must read them, or whole assignment
   groups such as "Quizzes" disappear.
4. **Answers in labels:** fill-in-the-blank and dropdown responses are **labelled with the
   correct answer**, and the question text uses a UUID placeholder.
   - Classic quizzes label responses with the variable name (`blank1`, also present in the
     text as `[blank1]`).
   - So a label is shown only when it equals the variable key; otherwise "Blank N".
   - This was an answer-key leak in a no-answers build, found and fixed during testing.
5. **Unknown question types fail closed:** they are rendered without response labels, so a
   new format can't leak answers the same way.
6. **Categorization questions** are rendered: categories and items without answer keys; the
   correct mapping with them.

---

## 4. Design decisions

### 4.1 A single-file converter that produces a multi-page static site

- **The converter is one self-contained HTML file** (`dist/index.html`, about 115 KB), built
  with Vite and `vite-plugin-singlefile`.
  - It can be emailed, put on a USB stick, or opened from disk.
  - There is no server, no login, and no hosted copy of copyrighted course material.
  - Course files never leave the instructor's computer, and the browser enforces it
    ([§5](#5-security-model)).
- **The output is plain multi-page HTML with relative links and no JavaScript**, rather than a
  single-file SPA. Two reasons:
  - Inlining course files (often 60 MB or more of PDFs and slides, more with video) as base64
    in one HTML file roughly doubles the size again and strains browser memory.
  - An SPA that `fetch()`es JSON breaks under `file://` in Chrome. Plain pages work when
    double-clicked from a USB stick, which matters most for a disaster-recovery tool.
- **The output looks like Canvas:**
  - Left course nav from `tab_configuration`; hidden tabs are greyed with a "Hidden from
    students" note.
  - Breadcrumbs.
  - Collapsible modules with type icons and indents.
  - Previous/next buttons between module items.
  - Assignment details.
  - The syllabus with a dated course summary.
  - A file tree.
  - Assignment groups; empty groups are hidden, matching Canvas.
  - An "Offline, read-only copy" banner on every page.
  - A `README.txt` in the ZIP.
- **Changing an option rebuilds the site without re-reading the file.**
- **A CLI** (`src/cli.ts`, using jsdom) runs the same core for bulk conversion and testing.

### 4.2 Pipeline and code map

```
.imscc bytes ─▶ readArchive (zip.ts) ─▶ parseCartridge (parse.ts, qti.ts, xml.ts, dates.ts) ─▶ Course model (model.ts)
            ─▶ buildSite (site.ts, content.ts, html.ts, paths.ts, icons.ts, styles.ts) ─▶ Map<path, bytes>
            ─▶ preview (ui/preview.ts)  or  writeArchive (zip.ts) ─▶ ZIP download
```

| Path | Responsibility |
|---|---|
| `src/core/zip.ts` | ZIP reader (ZIP64-aware, CRC-32, limits, path normalization) and writer (fflate `zip`; already-compressed types stored) |
| `src/core/xml.ts` | Namespace-agnostic XML helpers, `repairXml` |
| `src/core/parse.ts` | Manifest + Canvas settings → `Course`; warnings for unrendered content and unknown resource types |
| `src/core/qti.ts` | QTI 1.2 quizzes and question banks |
| `src/core/content.ts` | DOMPurify sanitization + link-token resolution |
| `src/core/site.ts` | All page rendering (Canvas-like layout) |
| `src/core/dates.ts` | Canvas UTC timestamps, Rails → IANA zones |
| `src/core/index.ts` | `convert()` and `zipSite()` |
| `src/ui/main.ts`, `preview.ts`, `ui.css`, `index.html` | Converter UI and in-page preview |
| `vite.config.ts` | Single-file build + CSP plugin; dev-server polling |
| `test/fixture.ts` | **Synthetic** cartridge mirroring a real export's structure |

### 4.3 ZIP reading

- `fflate`'s `unzip` couldn't read Canvas exports ([§3](#3-what-a-canvas-export-is-learned-from-real-exports)),
  so `zip.ts` reads the central directory itself:
  - It handles ZIP64 extras with or without a ZIP64 EOCD record.
  - It inflates each entry with `fflate.inflateSync`.
  - It verifies **CRC-32**.
- Paths are normalized: `..`, absolute paths and drive letters are rejected (zip-slip).
- Limits (`DEFAULT_LIMITS`): 50,000 entries, 2 GiB per entry, 4 GiB total. They are generous
  on purpose; they exist to stop hostile or corrupt archives, not to police real courses.
- A test reproduces Canvas's exact ZIP64 layout.

### 4.4 Content sanitization and links

- Course HTML is sanitized with **DOMPurify**:
  - No scripts, event handlers, forms or form controls, `data-*` attributes, `object`,
    `embed`, `base`, `meta` or `link`.
  - `srcset` is dropped.
  - Links get `rel="noopener noreferrer"`.
- **Iframes:** only `https:` or Canvas-local sources survive.
  - External ones get `sandbox="allow-scripts allow-same-origin allow-popups
    allow-presentation allow-forms"` and `referrerpolicy="no-referrer"`. This keeps YouTube
    and Panopto embeds working; they are cross-origin, so `allow-same-origin` doesn't grant
    them the site's origin.
  - The original plan was an allow-list of embed hosts; any `https:` source plus the sandbox
    was implemented instead *(implementation)*.
- Every generated page carries `<meta http-equiv="Content-Security-Policy"
  content="script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`.
- XML is parsed with `DOMParser`, which doesn't resolve external entities (no XXE).

### 4.5 Answer keys and unpublished content

- **Answer keys are off by default.** QTI exports always contain them; an instructor who
  shares a backup with students during an outage would otherwise leak every answer.
- With the option on, the ZIP is named `*-instructor.zip` and its `README.txt` carries a
  warning.
- Without it, no correct answers, feedback or answer-bearing labels may appear. Unknown
  formats fail closed ([§3.1](#31-new-quizzes-quirks)).
- Both real exports were checked for answer markers in no-answers builds.
- **Unpublished content is shown by default** with an "Unpublished" badge; the toggle drops it
  and reports how many items were left out.

### 4.6 In-page preview

- The preview renders generated pages into a `srcdoc` iframe:
  - Stylesheets are inlined.
  - Site-internal links are intercepted by a click handler.
  - Non-HTML files are served from `blob:` URLs.
  - **HTML is never served as a top-level blob**, since it would run with the app's origin.
- **The preview iframe is not sandboxed.** A sandbox without `allow-scripts` also blocked the
  parent's click handlers, so preview links did nothing; the sandbox was removed.
  - Scripts still can't run: the content is sanitized, and every generated page has a
    `script-src 'none'` CSP.
  - A `srcdoc` document also inherits the converter's own CSP. *(Inherited behaviour per the
    HTML spec; not separately tested.)*

### 4.7 Converter CSP

- `vite.config.ts` injects a CSP into `dist/index.html` **in `closeBundle`**, after the
  singlefile plugin has inlined the script, so the `sha256` hash covers the final inline code.
  - An earlier version hashed before inlining, which produced an empty `script-src` and a dead
    app.
  - The plugin throws if no script is found.
- The policy is `default-src 'none'`, hashed scripts, and `connect-src 'none'`.
  `connect-src 'none'` makes "your file is never uploaded" a **browser-enforced** property.
  - Verified locally and on the live site: a test `fetch` was blocked.
- Build-only: Vite's dev server injects its own client script, so the dev build has no CSP.
- The build prints a warning from `vite-plugin-singlefile` about the CSP meta; it's expected,
  because the hash is added afterwards.

---

## 5. Security model

| Threat | Control |
|---|---|
| Course data leaving the machine | No server; the converter's CSP has `connect-src 'none'` and `form-action 'none'` |
| Hostile or corrupt ZIP | Own reader with path normalization (zip-slip), CRC checks, entry, size and total limits |
| Script injection via course HTML | DOMPurify; `script-src 'none'` on every generated page; sandboxed external iframes; preview never serves HTML as a top-level blob |
| XXE | `DOMParser` (no external entities) |
| Answer-key leakage | Off by default; instructor copies labelled; unknown question formats fail closed |
| Spreadsheet/CSV injection | Not applicable: no CSV output (grades CSVs come from canvas-exporter, not here) |
| Clickjacking of the hosted converter | **Not mitigated.** `frame-ancestors` can't be set by `<meta>`, and the owner declined a Netlify `_headers` file. Low impact, because the page sends nothing anywhere. |

**Accepted risks:**
- **Uploaded course files** (`web_resources/`) are copied as-is. An uploaded `.html` file is
  served by the generated site like any other file, so it can run its own scripts when opened
  from the site. It is not previewed in the converter.
- **Embedded `https:` iframes** (videos) load from their hosts when online. They are sandboxed
  and no-referrer.

**Never host generated course sites publicly.** They contain copyrighted course material, and
instructor copies contain answer keys. This belongs in faculty guidance.

---

## 6. Development and testing

- **Container only:** `scripts/ctr` runs commands in `canvas-reader-dev` (Node 24, Debian)
  with the repo bind-mounted. `node_modules` holds Linux binaries, so never run npm on the
  host.
  - The default container resolver doesn't answer on the original dev host, so `ctr` passes
    `--dns 1.1.1.1` (`CTR_DNS` overrides it).
  - **Bind-mounting `~/Downloads` hung the container runtime** on a macOS privacy prompt. Copy
    exports into `out/` (gitignored) first.
- **Dev server:** file-change events don't cross the bind mount, so Vite served stale modules.
  This caused a confusing re-test where fixed bugs appeared unfixed. `scripts/ctr` sets
  `VITE_POLL=1`, and Vite polls.
- **`.claude/launch.json`** (untracked, machine-specific) defines `dev` (port 5173) and `dist`
  (`vite preview`, mapped to 4174) servers for the Claude desktop app's browser pane.
- **Tests:** Vitest with jsdom, 60 tests across `zip`, `parse`, `site` and `newquizzes`.
  - **jsdom accepts XML that Chrome rejects.** Browser-only failures are possible, which is
    how the New Quizzes namespace bug slipped through.
  - Verify parser changes in a real browser on the built converter, not only in tests.
- **Real-export verification** (done during development with two real exports, kept in
  `out/` and never committed):
  - All course files came out byte-identical.
  - Every internal link resolved: 662 links in one site and 1,263 in the other.
  - No answer markers appeared in no-answers builds.
  - The Assignments page matched the Canvas UI group for group.
- **README screenshots** (`docs/screenshots/`) come from the synthetic fixture, captured with
  headless Chromium in a throwaway container driven over the DevTools protocol. Never
  screenshot a real course.

---

## 7. History

```
71f716a Scaffold project with container-based dev tooling
101398b Add IMSCC parser, content sanitizer and static site builder
c49b9a4 Add single-file converter UI with in-browser preview
72e4467 Poll for file changes when the dev server runs in the container
533f31e Support New Quizzes exports and fix fill-in-blank answer leak
4a2593f Add screenshots of the converter and a generated site to README
```

The second real export (a course built with **New Quizzes**) surfaced:
- The browser-only XML parse errors.
- Missing quizzes, including whole assignment groups made up of quizzes.
- Quizzes wrongly marked unpublished.
- The fill-in-the-blank answer leak.

All are fixed in `533f31e` ([§3.1](#31-new-quizzes-quirks)).

---

## 8. Deployment

- **Live:** https://canvas-reader.netlify.app, deployed by the owner with **Netlify Drop**: drag
  the `dist/` folder onto the page.
  - Only the prebuilt, tested `dist/index.html` is deployed, never a Netlify build from
    source, so what goes live is exactly what was tested.
- **To update:** run `scripts/ctr npm run build`, then drag `dist/` onto the existing site's
  **Deploys** tab. Dropping on the Drop page again creates a second site. If the site is ever
  connected to this repo instead, it needs a build step, because `dist/` isn't committed.
- **⚠ Outstanding:** the live site was deployed **before** `533f31e` and still has the New
  Quizzes fill-in-the-blank **answer leak**. Redeploy `dist/`.
- **Netlify's HUD script:** Netlify injects
  `<script async src="/.netlify/scripts/hud?variant=public">` on free-tier sites. The page's
  CSP blocks it (one console error per load); this is harmless and shows the CSP working.
  *Which Netlify setting disables the injection was not checked.*
- **Headers:** Netlify sends HSTS but no security headers. A build-generated `_headers` file
  (CSP as an HTTP header, with `frame-ancestors 'none'`) was proposed; the **owner chose
  "Leave as is"**. Revisit if the converter is ever embedded or rebranded.
- **The Netlify MCP connector** was authorized but never used: it returned HTTP 429, and the
  owner switched to Drop. It can be revoked in Netlify under User settings → Applications.

---

## 9. Repository hygiene

- **Never commit real course content or identifiers.** Before the first push, a real Canvas
  course ID and a real course code that had slipped into a test and a commit message were
  scrubbed from **all history** with `git filter-branch`. The backup refs were deleted, and
  only the clean `main` was ever pushed.
- Tests use `test/fixture.ts`, a synthetic cartridge built in memory that mirrors a real
  export's structure. Real exports live in `out/` (gitignored, together with `*.imscc`).
- `dist/` is not committed.

---

## 10. Known gaps and backlog

**Unverified:**
- **Classic quizzes** match the published format but have **not** been checked against a real
  export; both real exports had a question bank and New Quizzes only.
- **Media and video** content.
- **Opening the unzipped site by double-click (`file://`)** was not exercised by the developer.
  Links were checked on disk instead.
- **A full conversion on the live Netlify site** was not run; only the local build was.

**Not rendered yet** (reported as warnings): rubrics, calendar events, learning outcomes,
external feeds, course pacing, blueprint settings. Grading schemes are parsed but not shown,
and not warned about.

**Ideas:**
- Render rubrics and calendar events. An export from a course that has them is needed to
  verify.
- A build-generated `_headers` file, if hosting requirements change.
- Batch conversion via the CLI for many courses, if canvas-exporter users want pre-converted
  sites. *Owner decision so far: canvas-exporter stores `.imscc` only.*
