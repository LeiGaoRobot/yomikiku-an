# Roadmap

Living document tracking the `main-js.js` extraction work. Updated as
modules land. The plain-language goal: keep cutting `main-js.js` toward
~5k lines so each remaining concern can be reasoned about independently.

## Goal

- **`main-js.js` < 5000 lines** (currently 7949, was 8835 at the start
  of the cumulative effort; **−886 net**).
- **Test coverage growing in lockstep** with each extraction (currently 26
  `*.test.html` pages, 754 cases — per `scripts/test.sh`).

> **Honest reality check (2026-05-04)**: under the project's current
> "Phase-2 dedup must keep an inline fallback for boot-race safety"
> convention, every dedup nets +5..+15 LOC (delegator wrapper +
> retained inline). The 5000-line target is **structurally unreachable**
> from refactoring alone. The remaining real-shrinkage path is
> *fallback-drop for handler-only delegators*: when every external
> caller is inside a user-interaction handler (click / scroll / async
> resolution post-boot), the boot-race premise vanishes and the
> fallback can be deleted as dead code. Initial audit found ~4
> delegators qualified (-63 LOC commit `90d0dc8`); subsequent
> fallback-free Phase-2 dedups have continued to land (startPwaDownload
> -119, display-tokens -172, translation-modal -299).
>
> **Big remaining wins** (handler-only, fallback-free Phase-2 provably
> safe — but require deep DI work hours-scale):
> - ~~`displayResults`~~ ✅ shipped commit `210a3cb` (-69 LOC; the
>   function turned out to be 162 LOC not ~921 — Phase-1 + Phase-2
>   combined trimmed it to a 90-LOC delegator)
> - ~~`startPwaDownload`~~ ✅ shipped commit `8ff2b02` (-119 LOC)

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
| `modules/analyzer/ui/sentence-text.js` | extractSentenceText                            | 18 |
| `modules/pwa/sw-reset.js`        | createSwResetCoordinator (request / handleMessage)   | 21 |
| `modules/analyzer/ui/jlpt/`      | prompts / renderers / session split                  | 119 |
| `modules/reading/script-display.js` | updateReadingScriptDisplay                        | 21 |
| `modules/pwa/installer.js`       | setupPwaInstaller                                    | 25 |
| `modules/pwa/start-download.js`  | startPwaDownload (handler-only, no fallback)         | 45 |
| `modules/analyzer/local/display-tokens.js` | display token helpers                      | 58 |
| `modules/analyzer/translation-modal.js` | per-line translation modal                    | 55 |
| `modules/analyzer/local/results-display.js` | displayResults pure helpers (filter / classify / template builders) | 89 |
| `modules/analyzer/local/text-preprocess.js` | filterParentheses / computeStructureSignature           | 36 |
| `modules/ui/toolbar-content.js`  | createToolbarContentHTML (DI: t)                     | 31 |
| `modules/docs/search.js`         | escapeRegexSpecials / highlightText / pickSnippet / searchDocuments / buildEmptyStateMarkup / buildResultsMarkup | 55 |
| `modules/youtube/*`              | url / oembed / prompts / gemini-yt / panel shell + A/B/C tabs (字幕导入 / 视频伴读 / 听力题) | 69 |

Plus orchestrator scaffolding tests (jlptPanel 22, reader-mode 16,
shortcut-help 15) and the augmented `srs/store.test.html` (36 covering
SM-2 quality branches + bucketOf boundaries).

Phase-2 dedup completed for: kana, ruby, reading, segment, text-preprocess,
toolbar-content, docs/search (highlightText + searchDocuments + buildEmptyStateMarkup
+ buildResultsMarkup delegators in initSearchModal — full pure-helper
delegation; renderResults still owns DOM mutation + click-handler binding),
formatFailedAssetsSummary, base64ToBytes/pcm16ToWav/parseSampleRate,
detectBrowserLanguage, getActiveFolderId/setActiveFolderId,
extractSentenceText, positionTokenDetails (geometry only — DOM mutation
half stays in main-js.js), requestServiceWorkerReset (Map + handler
branch fully collapsed; **−20 LOC net** — possible because reset is
user-initiated only, so the fallback can be a bare
`Promise.reject('no-coordinator')`), updateReadingScriptDisplay,
setupPwaInstaller, syncReadingLineAttributes, startPwaDownload
(**−119 LOC**, no fallback — install-button click handler),
display-tokens helpers (**−172 LOC**), translation-modal
(**−299 LOC**, biggest single-extraction win to date).

## Next-wave candidates (audited, not yet started)

Ranked by **value/risk ratio** (top = best ROI):

1. ~~**Pure-helper bundle: `computeStructureSignature` + `filterParentheses`**~~
   ✅ shipped — Phase-1 module + 36 tests + Phase-2 dedup landed in this
   session (see `modules/analyzer/local/text-preprocess.js`).
2. ~~**`createToolbarContentHTML` Phase-1**~~ ✅ shipped — Phase-1 module
   + 31 tests + Phase-2 delegator landed in this session (see
   `modules/ui/toolbar-content.js`).
3. ~~**`initSearchModal` pure helpers (modules/docs/search.js)**~~ ✅
   shipped — Phase-1 module + 55 tests + Phase-2 dedup of `highlightText`
   and `performSearch` body. `renderResults` not yet delegated (uses
   inline DOM event wiring after innerHTML); `buildResultsMarkup` is
   exported and ready when worth pursuing.
4. ~~**`renderResults` Phase-2 in `initSearchModal`**~~ ✅ shipped —
   both empty-state branches and the results map now delegate to the
   search module's `buildEmptyStateMarkup` / `buildResultsMarkup`.
   Inline fallbacks retained (boot-race). Net +20 LOC due to dual-path
   `if/else` retention; the structural win is one source of truth.
5. **Next: `initEditorToolbar` (~58 LOC, lines ~5587–5645)** — smaller,
   self-contained. Mostly button-wiring; could be moved to
   `modules/editor/toolbar.js` wholesale if no boot-time call paths
   block fallback drop.
6. ~~**Re-audit existing `__ESM_*` delegators for fallback drops**~~
   ❌ audit completed 2026-05-04, **no candidates**. The 4 guards
   (`READING_MODE`, `DISPLAY_SETTINGS`, `EDITOR_TOOLBAR`,
   `FONT_SETTINGS`) all have boot-time reachability:
   - `updateReadingToggleLabels` ← `applyI18n` ← boot
     (`main-js.js:5343`)
   - `updateDisplaySettings` ← `initDisplayControls`
     ← `initializeApp` (`main-js.js:6336`)
   - `updateEditorToolbar` ← `initEditorToolbar` ← boot
     (`main-js.js:5457`)
   - `applyFontScaleFromStorage` ← boot (`main-js.js:5346`),
     `applyFontFamilyFromStorage` ← `DOMContentLoaded`
     (`main-js.js:7010`)

   Same conclusion for the `?? inline` delegators (kana, ruby,
   sentence-text, etc.) — all reachable from initial document render.
   No further fallback drops are safe without first untangling boot.
3. Companion `setReadingLineActive`/`clearReadingLineHighlight`
   deliberately deferred: their state vars (`activeReadingLine`,
   `isReadingMode`) live in different closures (main-js IIFE vs.
   reading-mode module), so a delegator would diverge state. Requires
   state colocation first.

> **Note on Phase-2 LOC math**: Per the playback-boundary rule, every
> Phase-2 dedup keeps an inline fallback for boot-race safety. So a
> "delegator" replacement is typically a small *positive* LOC delta
> (delegator branch + retained inline) — not the negative deltas the
> ROADMAP previously implied. The win is one-source-of-truth in the
> module, not raw line savings. Bigger functions (positionTokenDetails)
> still net-shrink because the DOM mutation half can be deleted.

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
