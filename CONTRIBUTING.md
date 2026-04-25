# Contributing to YomiKiku-an

Thanks for considering a contribution. This is a pure-static, no-build-step
project — every change is small enough to land without infrastructure.

## Local setup

```bash
# 1. Boot the dev server (any of these works)
npm start                    # python3 -m http.server 8000
python3 -m http.server 8000

# 2. Open http://localhost:8000
```

Optional: `cp config.example.js config.js` and add a Gemini API key to enable
AI features locally. `config.js` is gitignored — never commit it.

## Tests

15 `*.test.html` pages, 374 cases. Run them all in one command:

```bash
npm test                     # boots a local HTTP server + Playwright Chromium
```

Per-page status + a TOTAL line; exit 0 on full pass. CI runs the same
suite on every push and PR via `.github/workflows/test.yml`.

To wire up a local hook that runs `npm test` before every push:

```bash
bash scripts/install-hooks.sh
```

If `playwright` isn't found, install it any of:
- `npm install --save-dev playwright` (project-local, recommended)
- `npm install -g @playwright/mcp` (Homebrew users get this automatically)
- `export PLAYWRIGHT_NODE_PATH=/path/to/dir/containing/playwright`

## Project shape

```
index.html                          # entry point; loads classic scripts then ESM
service-worker.js                   # PWA cache (CACHE_VERSION must bump per deploy)
static/
  main-js.js                        # ~8500 lines, being incrementally extracted
  js/
    tts.js, dictionary.js, i18n.js, segmenter.js   # other classic scripts
    modules/                        # ESM modules (post-extraction targets)
      analyzer/  audio/  backup/  config/  docs/  i18n/
      player/    reading/ srs/      ui/
scripts/
  test.sh, install-hooks.sh, hooks/pre-push
.github/workflows/test.yml          # CI
```

Detailed conventions — load order, classic-script globals, IDB schemas, the
load-bearing playback pipeline boundary — live in `CLAUDE.md`. **Read it
before touching anything in `main-js.js` or `tts.js`.**

## Adding a new module

The repo is mid-migration from `main-js.js` into `static/js/modules/`. The
established pattern is two phases:

**Phase 1 — parallel module + tests** (low-risk; lands first):
1. Create `static/js/modules/<area>/<name>.js` with named ESM exports.
2. Register a `window.Yomikikuan<Name>` global so classic-script callers
   (main-js.js, tts.js) can find it.
3. Create `<name>.test.html` next to the module. Follow the format used by
   the other test pages: `<div id="summary"></div><div id="results"></div>`
   + `import { ... } from './<name>.js';` + `check()` / per-row output.
4. Wire it into the boot chain: add one `import('/static/js/modules/...')`
   line in main-js.js's bootstrap section + add the path to
   `static/pwa-assets.json` so the SW caches it.
5. Add the test path to `scripts/test.sh`'s TESTS array.
6. Bump `CACHE_VERSION` in `service-worker.js`.

**Phase 2 — dedup** (separate later commit):
- Replace the in-file copy in main-js.js with a delegator pointing at the
  global. Keep an inline fallback if the function is on a hot path that
  could be called during the boot-race window (most importantly anything
  in tts.js — see CLAUDE.md "playback pipeline boundary").

## Commit style

Recent commits show the convention:

```
<type>(<scope>): <imperative one-line summary>

<body explaining why, with PASS counts and LOC deltas where relevant>
```

Common `<type>` prefixes seen in the log:
- `feat`, `refactor`, `test`, `docs`, `ci`, `chore`, `i18n`, `ui`

`<scope>` examples: `audio`, `pwa`, `reading`, `jlpt`, `srs`, `infra`,
`reader`, `inspector`. Keep the title under ~70 chars; put detail in the
body.

## PR checklist

- [ ] `npm test` is green locally (or note any expected failures).
- [ ] Every new module has a sibling `*.test.html`.
- [ ] If you touched any cached asset, `CACHE_VERSION` is bumped in
      `service-worker.js`.
- [ ] If you added a new module, it's listed in `static/pwa-assets.json`
      AND the runner in `scripts/test.sh`.
- [ ] No secrets in commits (`config.js`, API keys, `.env`).
- [ ] If you touched `main-js.js` or `tts.js`, you've re-read the
      "Playback pipeline boundary" section of `CLAUDE.md`.

## Reporting bugs / requesting features

Open a GitHub issue with steps to reproduce. For UI bugs, include the
browser + screen size (mobile breakpoints are 768px and 480px).
