# Canvas Course Reader

Converts a Canvas LMS course export (`.imscc`) into a stand-alone, read-only static
website: a backup that faculty can open when Canvas is unavailable.

- **Converter:** one self-contained HTML file (`dist/index.html`). Open it in a browser, drop in the
  `.imscc`, preview the result, and download a ZIP. Everything runs locally. The page's CSP sets
  `connect-src 'none'`, so the browser itself prevents the course file from being uploaded.
- **Output:** plain multi-page HTML with relative links and no JavaScript. Unzip it and open
  `index.html` from disk, a USB stick, or any web server.

## What's in a Canvas export (and what isn't)

| Rendered | Source in the archive |
|---|---|
| Modules (order, indent, sub-headers, publish state) | `course_settings/module_meta.xml` |
| Pages, front page | `wiki_content/*.html` |
| Assignments (due/points/submission types) | `<id>/assignment_settings.xml` + HTML |
| Announcements, discussions (incl. graded) | `imsdt` topic XML + `topicMeta` |
| Files | `web_resources/**` |
| Classic quizzes, New Quizzes, question banks | `<id>/assessment_meta.xml`, `non_cc_assessments/*.qti` (QTI 1.2) |
| Syllabus + course summary, assignment groups, nav tabs | `course_settings/*` |
| External links; LTI tools (as "requires Canvas" stubs) | `imswl`, `lti_resource_links/` |

Canvas course exports never contain **student submissions, grades, rosters or discussion
replies**. Rubrics, calendar events and outcomes are reported as warnings but not rendered yet.

New Quizzes are exported in the classic QTI layout. Three quirks of that export are handled:
- `assessment_meta.xml` has a whitespace-containing `xmlns:xsi`, which browsers reject. It's
  repaired before parsing.
- `<available>false</available>` appears even on published quizzes, so the embedded
  assignment's publish state wins.
- Fill-in-the-blank responses are labelled with the answer itself, so labels are never shown
  for blanks.

Question types this tool doesn't recognize are rendered without response labels.

## Options

- **Include unpublished content** (default on): unpublished items are shown with a badge.
- **Include quiz answer keys** (default off): this produces an *instructor copy*. QTI exports
  contain the correct answers, so a copy made with this option must not be given to students.

## Security notes

- ZIP input: entry paths are normalized; `..`, absolute paths and drive letters are rejected
  (zip-slip). Entry count and declared sizes are capped.
- Course HTML is sanitized with DOMPurify: no scripts, event handlers, forms, `data-*`
  attributes or `object`/`embed`. Only `https:` iframes are kept, and they are sandboxed.
  Every generated page also carries a `script-src 'none'` CSP.
- XML is parsed with `DOMParser`, which does not resolve external entities.
- Uploaded course files (`web_resources/`) are copied as-is. An uploaded `.html` file in the
  course is served by the generated site like any other file.

## Development

Everything runs in a container (Apple `container`) with the repo bind-mounted. Don't run npm on
the host, because `node_modules` contains Linux binaries.

```bash
scripts/ctr npm ci
scripts/ctr npm test
scripts/ctr npm run build                 # -> dist/index.html
PORT=5173 scripts/ctr npm run dev         # http://localhost:5173
scripts/ctr npx tsx src/cli.ts out/course.imscc out/site/ [--answers] [--no-unpublished]
```

`scripts/ctr` sets `--dns 1.1.1.1` because the default container resolver doesn't answer on some
hosts. Override it with `CTR_DNS`. Bind mounts outside the repo, such as `~/Downloads`, can hang the
runtime on a macOS privacy prompt, so copy inputs into `out/` (gitignored) first.

Tests use a synthetic cartridge built in memory (`test/fixture.ts`), so no real course content
is committed.
