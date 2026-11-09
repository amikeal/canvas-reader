# CLAUDE.md: canvas-reader

A single-file, in-browser converter that turns a Canvas LMS course export (`.imscc`) into a
read-only, Canvas-looking static website (a ZIP of plain HTML with no JavaScript), for faculty
access during Canvas outages. Deployed by hand to Netlify.

**Before changing anything, read [ARCHITECTURE.md](ARCHITECTURE.md).** It records the
decisions, what was learned about Canvas exports (including the New Quizzes quirks), the
security model and the known gaps. Don't reverse a recorded decision without saying so and
asking. [README.md](README.md) is the user's guide.

## Commands

Run everything in the dev container, never on the host (`node_modules` holds Linux
binaries):

```bash
scripts/ctr npm ci
scripts/ctr npm test                      # Vitest + jsdom
scripts/ctr npm run build                 # tsc + vite -> dist/index.html (single file, CSP injected)
PORT=5173 scripts/ctr npm run dev         # dev server (no CSP in dev)
scripts/ctr npx tsx src/cli.ts out/course.imscc out/site/ [--answers] [--no-unpublished]
```

Put real exports in `out/` (gitignored). Don't bind-mount `~/Downloads`; it hangs the
container runtime.

## Invariants: keep these true

- **Nothing leaves the browser.** The converter's CSP (`connect-src 'none'`,
  `form-action 'none'`, hashed scripts) is injected in `closeBundle`, **after** inlining. Don't
  add network calls, analytics, CDNs or `'unsafe-inline'` scripts. If the build's hash step
  breaks, the app is dead; check `dist/index.html` in a browser.
- **The generated site has no JavaScript** and works from `file://`. Every page keeps its
  `script-src 'none'` CSP meta. Only relative links.
- **All course HTML goes through `sanitize()`** in `content.ts`. External iframes stay
  `https:`-only, sandboxed and no-referrer. The preview never serves HTML as a top-level
  `blob:`.
- **Answer keys never appear unless `includeAnswers` is on.** That covers correct answers,
  feedback and response labels that contain answers (New Quizzes labels blanks with the
  answer). Unknown question types fail closed. Any change to `qti.ts` or quiz rendering in
  `site.ts` needs a no-answers test.
- **ZIP input is hostile:** keep path normalization, CRC checks and `DEFAULT_LIMITS` in
  `zip.ts`. Don't swap back to `fflate.unzip`; it can't read Canvas's ZIP64 layout.
- **Canvas timestamps are UTC without a suffix.** Render in the course or assignment zone
  (`dates.ts`).
- **No real course content or identifiers in the repo:** not in tests, fixtures, commit
  messages or screenshots. Use and extend the synthetic `test/fixture.ts`. History was
  scrubbed once; don't make it necessary again.

## Testing notes

- **jsdom accepts XML that Chrome rejects.** Verify parser changes in a real browser against
  the built `dist/index.html`. `repairXml` is applied everywhere so tests and browsers parse
  the same input.
- When fixing a bug, add a test that fails on the old code.
- When a change touches parsing or links, also re-check on a real export (kept in `out/`):
  every internal link resolves, files are byte-identical, and there are no answer markers in
  no-answers builds.

## Conventions

- Small, reviewable commits with the rationale in the message. Propose a plan before
  non-trivial changes.
- Mark anything inferred rather than verified, and update ARCHITECTURE.md §10 when something
  gets verified or added.
- Keep dependencies minimal: `dompurify` and `fflate` at runtime.

## Gotchas

- `scripts/ctr` passes `--dns 1.1.1.1` and sets `VITE_POLL=1`. Without polling, the dev server
  serves stale modules through the bind mount.
- **Deploying:** build, then drag `dist/` onto the Netlify site's **Deploys** tab (not the Drop
  page, which creates a new site). Deploy only the tested build.
- **The live site is behind `main`** (missing the New Quizzes answer-leak fix) until someone
  redeploys.
