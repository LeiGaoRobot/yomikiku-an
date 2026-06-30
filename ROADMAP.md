# Roadmap

Living document tracking the `main-js.js` extraction work. Updated as
modules land. The plain-language goal: keep cutting `main-js.js` toward
~5k lines so each remaining concern can be reasoned about independently.

## Goal

- **`main-js.js` < 5000 lines** (currently 7890, was 8835 at the start
  of the cumulative effort; **−945 net**). *(Toast Phase-2 dedup added
  +13: delegator branches + retained inline fallbacks — the expected
  small positive delta when one-source-of-truth is the win, not LOC.)*
- **Test coverage growing in lockstep** with each extraction (currently 46
  `*.test.html` files on disk; **42 run headlessly** via the `TESTS` array
  in `scripts/test.sh` — the other 4 are visual/console.assert pages
  excluded by design; **1115 cases, all green** per the latest
  `npm test` run).

> **Sync note (2026-06-30)**: this document was re-audited against the
> working tree. Headline numbers, the Done inventory, and the next-wave
> list below now reflect actual code. Earlier revisions had drifted
> (claimed 7949 lines / 26 test pages / 754 cases).

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
> - `displayResults` — **partially** delegated only. The display-token
>   transforms now route to `analyzer/local/display-tokens.js`
>   (identity-fallback, handler-only — see `main-js.js:4039`), but the
>   function body still owns ~290 lines of DOM assembly. NOT the
>   90-LOC delegator an earlier revision claimed. Further extraction
>   (results-display template builders already exist in
>   `analyzer/local/results-display.js`) is still open.
> - ~~`startPwaDownload`~~ ✅ shipped (-119 LOC, no fallback)

## Method (the "Phase-1/Phase-2" pattern)

Every extraction follows the same recipe documented in `CONTRIBUTING.md`.
Phase-1 lands first as a parallel module + tests; Phase-2 dedup (which
deletes the in-file copy in `main-js.js` in favour of a delegator) lands
later when the LOC saving outweighs the boot-race risk.

In short: **don't touch the playback boundary** (`tts.js` and the
playback state machine inside `main-js.js` — see CLAUDE.md). Everything
else is fair game.

## Done (cumulative)

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

**Additional modules now on disk** (landed after the table above was last
written; not all individually tabulated here — see the module tree):

| Area | Modules |
|---|---|
| editor | `editor/editor-toolbar.js` (+ test — `updateEditorToolbar`, the old candidate #5), `editor/reading-mode.js` |
| gemini | `gemini/client.js` (+ test) |
| analyzer/ui | `article-summary-helpers.js` (+ test), `vocab-helpers.js` (+ test), `articleSummary.js`, `inlineCard.js`, `vocabPanel.js`, `modalA11y.js`, `jlpt/audio.js`, `jlpt/coach.js` |
| youtube/tabs | `import.js` (+ test), `companion.js`, `companion-sync.js` (+ test), `listening.js` (+ test) |
| ui | `toasts.js`, `dialog.js`, `inspector.js`, `progress-rings.js`, `utils.js` |
| docs | `pure.js`, `store.js` |
| player | `controls.js`, `state.js` |
| settings | `display.js`, `font.js`, `theme.js` |
| analysis/analyzer | `analysis/render.js`, `analyzer/concurrency.js` |

> ✅ `ui/toasts.js` is now the single source of truth. The three
> in-file copies (`showErrorToast` / `showSuccessToast` / `showInfoToast`)
> were collapsed to delegators (identity-guarded, inline fallback for
> boot-race) on 2026-06-30 — see Done note below.

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

## Next-wave candidates (re-audited 2026-06-30, not yet started)

Ranked by **value/risk ratio** (top = best ROI). Line numbers from the
current 7877-line `main-js.js`.

1. ~~**`showErrorToast` Phase-2 dedup**~~ ✅ shipped 2026-06-30. All
   three toast locals (`showErrorToast` / `showSuccessToast` /
   `showInfoToast`) now delegate to `ui/toasts.js` via an identity-guarded
   `window.show*Toast` lookup, inline fallback retained for boot-race.
   `npm test` green (1115/1115). CACHE_VERSION bumped v61→v62. +13 LOC
   (delegator + retained fallback). **Next-best ROI now → #2.**

2. **Self-contained `init*` UI functions → `modules/ui/`** — all are
   handler/boot button-wiring with no playback state. Best targets:
   - `initAppDrawer` (`:6453`, ~96 LOC)
   - `initQuickSearch` (`:6378`, ~75 LOC) — pairs with existing
     `docs/search.js`
   - `initHeaderScroll` (`:5598`, ~71 LOC)
   - `initUserProfile` (`:6931`, ~82 LOC)
   - `initAppDrawer` / `toggleLangDropdown` (`:2138`, ~96 LOC)
   Each is a candidate for wholesale move (Phase-1 module + test, then a
   thin boot-time call). Verify boot reachability before dropping any
   fallback.

3. **`showDetailedTranslation` (`:4347`, ~64 LOC)** — analyzer-area,
   pairs with the existing `analyzer/translation-modal.js`. Likely
   handler-only (invoked from a detail-expand click).

4. **`displayResults` deeper extraction (`:4039`, ~290 LOC)** — the
   template-builder half already lives in
   `analyzer/local/results-display.js`; the in-file body still assembles
   DOM inline. Highest LOC ceiling but most DI work. See the reality-check
   note above — this is NOT already a 90-LOC delegator.

### Closed / not viable

- ~~**`computeStructureSignature` + `filterParentheses`**~~ ✅ shipped
  (`analyzer/local/text-preprocess.js`, 36 tests).
- ~~**`createToolbarContentHTML`**~~ ✅ shipped (`ui/toolbar-content.js`,
  31 tests).
- ~~**`initSearchModal` pure helpers + `renderResults` Phase-2**~~ ✅
  shipped (`docs/search.js`). `renderResults` delegates to
  `buildEmptyStateMarkup` / `buildResultsMarkup`; inline fallbacks
  retained.
- ~~**`initEditorToolbar` (old candidate #5)**~~ ✅ effectively done —
  `editor/editor-toolbar.js` owns `updateEditorToolbar` (+ test). No
  standalone `initEditorToolbar` function remains in `main-js.js`.
- ~~**Re-audit `__ESM_*` delegators for fallback drops**~~ ❌ no
  candidates (2026-05-04). The 4 guards (`READING_MODE`,
  `DISPLAY_SETTINGS`, `EDITOR_TOOLBAR`, `FONT_SETTINGS`) and the
  `?? inline` delegators (kana, ruby, sentence-text, …) are all reachable
  from initial document render. No further fallback drops are safe
  without first untangling boot.
- **`setReadingLineActive` / `clearReadingLineHighlight`** deferred:
  their state vars (`activeReadingLine`, `isReadingMode`) live in
  different closures (main-js IIFE vs. reading-mode module), so a
  delegator would diverge state. Requires state colocation first.

### Off-limits (playback boundary — see Do-not-touch below)

`refreshVoices` (`:2612`), `playAllText` (`:4411`), `playSegments`
(`:3580`), `restartCurrentSegmentAt` (`:2355`),
`initVoiceAndSpeedControls` (`:6086`) — all touch voice listing or the
playback state machine / `Audio` element. Do not extract.

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
  Chromium through the 42 pages in the `TESTS` array. Resolves
  `playwright` from project node_modules, `@playwright/mcp`'s nested
  install, or `$PLAYWRIGHT_NODE_PATH`.

## Out of scope (for now)

- Migrating to a build step / bundler — explicitly rejected by CLAUDE.md
  ("Pure static site — intentionally zero-build"). Module dedup happens
  at the call-site level, not via tree-shaking.
- Rewriting EasyMDE / kuromoji / kuroshiro layers — third-party, behave.
- TypeScript migration — tests provide enough type safety for now;
  revisit if the project grows past 30k LOC.
