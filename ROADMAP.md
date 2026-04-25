# Roadmap

Living document tracking the `main-js.js` extraction work. Updated as
modules land. The plain-language goal: keep cutting `main-js.js` toward
~5k lines so each remaining concern can be reasoned about independently.

## Goal

- **`main-js.js` < 5000 lines** (currently 8537, was 8835 at session start;
  −298 net so far this session).
- **Test coverage growing in lockstep** with each extraction (currently 18
  `*.test.html` pages, 422 cases).

## Method (the "Phase-1/Phase-2" pattern)

Every extraction follows the same recipe documented in `CONTRIBUTING.md`.
Phase-1 lands first as a parallel module + tests; Phase-2 dedup (which
deletes the in-file copy in `main-js.js` in favour of a delegator) lands
later when the LOC saving outweighs the boot-race risk.

In short: **don't touch the playback boundary** (`tts.js` and the
playback state machine inside `main-js.js` — see CLAUDE.md). Everything
else is fair game.

## Done (this session)

15+ pure helpers extracted, all with unit tests:

| Module                           | Functions                                            | Tests |
|----------------------------------|------------------------------------------------------|-------|
| `modules/reading/kana.js`        | toHiragana / toKatakana / normalizeKanaByScript / escapeHtmlForRuby / getRomaji | 44 |
| `modules/reading/ruby.js`        | buildRubyMarkup / fallbackRuby                       | 16 |
| `modules/reading/reading.js`     | formatReading                                        | 20 |
| `modules/player/segment.js`      | splitTextByPunctuation                               | 19 |
| `modules/audio/wav.js`           | base64ToBytes / parseSampleRate / pcm16ToWav         | 30 |
| `modules/backup/doc-export.js`   | escapeHtml / fmtDate / buildHtml                     | 25 |
| `modules/docs/folders.js`        | getActiveFolderId / setActiveFolderId / filterDocByFolder | 21 |
| `modules/i18n/detect.js`         | detectBrowserLanguage                                | 16 |
| `modules/ui/position.js`         | computeTokenDetailsPosition                          | 13 |
| `modules/ui/pwa-toast.js`        | + formatFailedAssetsSummary (additive)               | 13 |
| `modules/util/index.js`          | createRequestId / isEditingElement / sleep           | 19 |
| `modules/analyzer/ui/jlpt/`      | prompts / renderers / session split                  | 119 |

Plus orchestrator scaffolding tests (jlptPanel 22, reader-mode 16,
shortcut-help 15) and the augmented `srs/store.test.html` (36 covering
SM-2 quality branches + bucketOf boundaries).

Phase-2 dedup completed for: kana, ruby, reading, segment,
formatFailedAssetsSummary, base64ToBytes/pcm16ToWav/parseSampleRate
(with thick fallbacks per playback boundary).

## Next-wave candidates (audited, not yet started)

Ranked by **value/risk ratio** (top = best ROI):

1. **`extractSentenceText`** (`main-js.js:969`, ~7 lines) — DOM → trim
   text. Cheap, useful for analyzer tests.
2. **`requestServiceWorkerReset`** (`main-js.js:744`, ~50 lines) —
   postMessage + timeout race. Clean boundary, testable with mock controller.
3. **`positionTokenDetails` Phase-2 dedup** — geometry already extracted
   to `modules/ui/position.js`; replace main-js.js body with delegator +
   DOM mutation only. ~50 → ~15 lines.
4. **`detectBrowserLanguage` Phase-2 dedup** — module exists; main-js.js
   call site at line 890 can become a delegator. -7 lines.
5. **`folders.js` Phase-2 dedup** — `getActiveFolderId` /
   `setActiveFolderId` delegators (~6 lines saved). Tiny win, defer.
6. **`updateReadingScriptDisplay`** (~12 lines) — DOM walker that
   re-renders token kana on script toggle. Mostly DOM, modest test value.
7. **`setupPwaInstaller`** (~22 lines) — beforeinstallprompt handler.
   DOM-coupled, low extractability.
8. **`syncReadingLineAttributes`** + **`setReadingLineActive`** (~30 lines)
   — reading-mode state on the DOM. Phase-1 module possible; Phase-2
   dedup risky (touches reading mode UI).

## Do-not-touch boundaries

Per CLAUDE.md "Playback pipeline boundary":

- `playSegments`, `speakWithPauses`, `playAllText`, `stopSpeaking`,
  `setHeaderProgress`, `currentSegments`, `currentSegmentIndex`,
  `currentUtterance`, `PLAY_STATE`, `isPlaying`, `updatePlayButtonStates`
  — all IIFE-locals in `main-js.js`. Don't add `window.*` mirrors.
  Don't rip the audio element's life cycle out.
- `tts.js`'s `geminiSynth`, voice listing, and the `window.speechSynthesis`
  shim — load-bearing classic script. Phase-2 dedups must keep an inline
  fallback for boot-race safety.

## Infrastructure tracking

- **CI**: `.github/workflows/test.yml` — Ubuntu, Playwright + Chromium
  ad-hoc, Node 24 opt-in. Last green run on master: ~1m25s.
- **Local hooks**: `bash scripts/install-hooks.sh` installs `pre-push`
  (runs `npm test`) and `pre-commit` (warns on cached-asset change
  without SW bump).
- **Test runner**: `npm test` → `bash scripts/test.sh` → headless
  Chromium through 18 pages. Resolves `playwright` from project
  node_modules, `@playwright/mcp`'s nested install, or
  `$PLAYWRIGHT_NODE_PATH`.

## Out of scope (for now)

- Migrating to a build step / bundler — explicitly rejected by CLAUDE.md
  ("Pure static site — intentionally zero-build"). Module dedup happens
  at the call-site level, not via tree-shaking.
- Rewriting EasyMDE / kuromoji / kuroshiro layers — third-party, behave.
- TypeScript migration — tests provide enough type safety for now;
  revisit if the project grows past 30k LOC.
