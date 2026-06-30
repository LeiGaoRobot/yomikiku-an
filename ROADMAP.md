# Roadmap

Living document tracking the `main-js.js` extraction work. Updated as
modules land. The plain-language goal: keep cutting `main-js.js` toward
~5k lines so each remaining concern can be reasoned about independently.

## Goal

- **`main-js.js` < 5000 lines** (currently 6960, was 8835 at the start
  of the cumulative effort; **−1875 net**). *(A full header-refactor
  dead-code sweep is now complete — header-scroll −156, quick-search −56,
  mobile lang-dropdown −57, nav lang-flags −12, sidebar i18n labels −70,
  dead lang/theme `<select>` −110, dead sidebar controls −215, last
  sidebar voice refs in refreshVoices −15, plus assorted consts; toast
  Phase-2 dedup +13. The old right-settings-sidebar ('sidebar' context)
  is never rendered, so every `sidebar*` lookup was null; all live
  controls run through the settings modal ('modal' context) + user-menu
  submenus.* **All dead `sidebar*` code is now removed, including the
  refreshVoices internals — verified safe: a stubbed-voice headless run
  shows refreshVoices still populates voiceSelect + headerVoiceSelect (30
  options each) and text still segments, zero console errors.** *The only
  remaining `sidebar*` token is `toggleBtn`/`sidebarToggle` in the live
  doc-list collapse function — guarded, possibly conditionally-present,
  left as-is.)*
- **Test coverage growing in lockstep** with each extraction (currently 46
  `*.test.html` files on disk; **42 run headlessly** via the `TESTS` array
  in `scripts/test.sh` — the other 4 are visual/console.assert pages
  excluded by design; **1132 cases, all green** per the latest
  `npm test` run; plus a 4-scenario Playwright E2E smoke suite via
  `npm run e2e`).

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
> - ~~`displayResults`~~ ✅ shipped 2026-07-01 (-59 LOC net in
>   main-js.js; the orchestration that used to live inline — per-token
>   classify/format/build, per-line reflow/merge/split — now lives in
>   `analyzer/local/results-display.js` as `buildTokenMarkup` /
>   `buildLineHtml` / `buildResultsHtml`, no inline fallback). See
>   "Next-wave candidates #4" below for the full writeup — the
>   ~290-LOC estimate this note carried was stale; the function had
>   already shrunk to ~90 lines via earlier display-tokens /
>   results-display Phase-1 work, and the remaining orchestration
>   turned out to need far less DI than expected once it became clear
>   `formatReading` / `buildRubyMarkup` / `escapeHtmlForRuby` /
>   `getRomaji` are plain pure ESM exports importable directly (no
>   window-global lookup needed inside the new module).
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
| `modules/analyzer/local/results-display.js` | displayResults pure helpers + full orchestration (filter / classify / template builders / buildTokenMarkup / buildLineHtml / buildResultsHtml), Phase-2 dedup'd, no fallback | 106 |
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
(**−299 LOC**, biggest single-extraction win to date), displayResults
(**−59 LOC**, no fallback — handler-only; the orchestration that used
to be inline in main-js.js now lives in results-display.js as
buildTokenMarkup/buildLineHtml/buildResultsHtml).

## Next-wave candidates (re-audited 2026-06-30, not yet started)

Ranked by **value/risk ratio** (top = best ROI). Line numbers drift as
modules land — re-grep before starting any item (tree is now 7609 lines).

1. ~~**`showErrorToast` Phase-2 dedup**~~ ✅ shipped 2026-06-30. All
   three toast locals (`showErrorToast` / `showSuccessToast` /
   `showInfoToast`) now delegate to `ui/toasts.js` via an identity-guarded
   `window.show*Toast` lookup, inline fallback retained for boot-race.
   `npm test` green (1115/1115). CACHE_VERSION bumped v61→v62. +13 LOC
   (delegator + retained fallback). **Next-best ROI now → #2.**

2. **Dead-code sweep** — ✅ first pass shipped 2026-06-30 (**−156 LOC**,
   no module/test needed, zero behaviour change). While auditing the
   `init*` candidates below, the header-scroll cluster turned out to be
   dead:
   - `initHeaderScroll` — called from `initializeApp`, but
     `document.querySelector('.header')` is always null (the `.header`
     element was removed from `index.html`; only orphan `.header` CSS
     remains), so it early-returned every time.
   - `initContentTopOffset` / `initListPanelTopOffset` — only ever
     referenced by commented-out call sites (`// Header 已移除`).
   All three deleted along with the no-op call. **Lesson: audit
   reachability before assuming a function needs extracting — deletion
   beats extraction.** Likely more dead code from the header-removal
   refactor; a follow-up grep sweep is worthwhile. (Orphan `.header` /
   `.header-content` / `.header-left` CSS in `styles.css` left in place —
   separate, lower-value cleanup; verify no element uses them first.)

   **Update (2026-06-30, continued):** the header refactor left far more
   dead code than the scroll cluster. Verified-and-removed since:
   - `initQuickSearch` (**−56**) — `#quickSearchInput` exists nowhere; the
     function early-returned on the null input. (Caught mid-extraction by
     a headless boot smoke test showing the input absent — deleted, not
     extracted.)
   - mobile lang-dropdown (**−57**) — `#langDropdownBtn` / `#langDropdownMenu`
     / `#langDropdownIcon` gone; `toggleLangDropdown` + wiring + the
     flag-icon sync block + document close-listeners all inert.
   - nav lang-flags (**−12**) — `#langFlagJA/EN/ZH` gone; const defs +
     flag-active sync + three click→`setLanguage` listeners inert.
   Language switching survives via the settings-modal selector
   (`modalLangSelect`) — the live UI.

   **Partially-done dead code — `sidebar*` / old-toolbar lookups.** The
   old right-settings-sidebar is the `'sidebar'` context of
   `createToolbarContentHTML`, and it is **never rendered** (no
   `[data-context]` container in `index.html`; only the `'modal'` context
   — the settings modal, unprefixed ids — is live). So every
   `sidebar*`-prefixed lookup is null. **Removed (−70):** the two inert
   sidebar i18n label blocks (`applyI18n` + the secondary `setText` pass).
   **Left in place (boundary / timing-subtle):** the rest is genuinely
   unsafe to excise mechanically —
   - voice mirroring + the sidebar voice `<select>` population live
     **inside `refreshVoices`** (playback-boundary do-not-touch zone);
   - the speed-slider wiring mutates the playback `rate`;
   - the `themeSelect` / `langSelect` / `sidebar*Select` blocks in
     `applyI18n` hinge on **init-vs-mount capture timing**: the top-level
     `const langSelect = $('langSelect')` is captured at IIFE init (before
     the modal mounts) so it is *also* null, while the live control is
     re-captured as `modalLangSelect` in `mountSettingsModalContent`.
     Deciding what is truly dead there needs runtime tracing, not static
     analysis — exactly the kind of subtlety that should not be rushed.

   **✅ Stragglers swept 2026-07-01 (−176 LOC, no behaviour change).**
   The ~33-lookup estimate above was stale — most `sidebarVoiceSelect` /
   `sidebarThemeSelect` / `sidebarShow*` / `sidebar*Label` / `sidebar*Title`
   id-reachability hits had already been removed in earlier sessions
   (re-grepped: zero remaining matches for that whole family). What
   was actually still dead and got removed, each individually verified
   via `git show HEAD:static/main-js.js` for the live counterpart before
   deletion:
   - `sidebarHaAsWa` fallback in `isHaParticleReadingEnabled` and
     `sidebarShowDetails` fallback in `toggleTokenDetails` — both
     always-null reads in a 3-way fallback chain (main control → sidebar
     → localStorage); sidebar branch deleted, main + localStorage kept.
   - `sidebarFontSizeRange` / `sidebarFontSizeValue` entries inside
     `initFontSizeControls`'s `.filter(Boolean)` arrays — always-null,
     filtered out at runtime either way.
   - `twoPaneToggle` — declared via `$('twoPaneToggle')`, never read
     again anywhere in the file.
   - `deleteDocBtn` / `editorNewBtn` — entirely dead duplicates of the
     live `editorDeleteBtn` / `newDocBtn` wiring (confirmed: id doesn't
     exist in `index.html` or any ESM template; `editorNewBtn` only
     appears as a CSS *class* on `#newDocBtn`, not an id). Removed the
     dead consts, the dead i18n text-sync block, the dead
     `disabled`-toggle line, and both dead `addEventListener` blocks;
     simplified the joint reachability guard in
     `updateDeleteButtonState` to just `editorDeleteBtn`.
   - `settingsButton` — dead click-wiring inside `initSettingsModal`
     (the real open button is `userSettingsBtn` in the user-menu, which
     calls `window.openSettingsModal()` — that global export and the
     rest of `initSettingsModal` were left untouched).
   - **Biggest single find:** an entire ~131-line dead duplicate of the
     backup/import feature inside `mountSettingsModalContent`
     (`exportJsonBtn` / `importJsonBtn` / `importJsonFile` — none of
     these ids exist anywhere). The *live* backup/import UI is a
     separate, near-identical implementation wired to
     `userExportBtn` / `userImportBtn` / `userImportFile` in the
     user-menu (~line 6700s) — that one is untouched and still owns
     `collectBackupPayload` / `doExport` / `applyBackup`.

   Verified via `npm test` (1115/1115), `npm run e2e` (4/4, including
   the backup-roundtrip scenario which exercises
   `modules/backup/index.js` directly), plus manual headless checks of
   new-doc creation and settings-modal open/close. **Incidentally found
   an unrelated pre-existing bug** (not introduced by this sweep —
   confirmed present in the prior commit too): `textInput`'s blur
   handler calls `docManager.deleteEmptyDocument()` but the IIFE-local
   is named `documentManager`, so blurring an empty textarea throws
   instead of cleaning up. Flagged separately, not fixed here (out of
   scope for a dead-code sweep).

   **`init*` extraction targets — deferred as too-coupled.** The live
   `init*` functions are boot-called via `initializeApp` (so a Phase-2
   delegator just hits its inline fallback — no shrink) and the
   fallback-free move-to-`app.js` path is blocked by heavy closure deps:
   `initUserProfile` references **~31** IIFE-locals (Firebase/auth, `t`,
   `LS`, `documentManager`); `initAppDrawer` wires the drawer's
   theme/font/lang controls. Extracting either is hours-scale DI work with
   real risk to auth/drawer for marginal LOC — not worth it now.
   `toggleLangDropdown` is already gone (dead). Net: candidate #2's real
   yield was **dead-code removal (−281 total)**, not extraction.

3. ~~**`showDetailedTranslation`**~~ ✅ already done — `main-js.js:4347`
   is already a thin delegator to
   `window.YomikikuanTranslationModal.showDetailedTranslation` (DI-bridges
   `t` + `activeTokenDetails`, no inline fallback since it's handler-only).
   Nothing left to extract.

4. ~~**`displayResults` deeper extraction**~~ ✅ shipped 2026-07-01
   (**−59 LOC**, no fallback). The "~290 LOC, hours-scale DI" framing
   here was stale — by the time this was picked up, the function had
   already shrunk to ~90 lines (display-tokens.js + results-display.js
   template builders had already absorbed most of the work). The
   "reading-line highlight state, token-detail closures, per-line play
   wiring" concern turned out to be a non-issue on closer reading: the
   `clearReadingLineHighlight()` call and `syncReadingLineAttributes()`
   call bracket the function and were left untouched in main-js.js;
   nothing *inside* the per-token/per-line builder actually touches
   reading-line-highlight state. The per-line/per-token play buttons
   only ever embed `onclick="playToken(...)"` / `onclick="playLine(...)"`
   as inert string literals — resolved at click-time by globals defined
   elsewhere — so building this markup never calls into the playback
   state machine (confirmed via `results-display.js`'s own boundary-note
   comment, predating this extraction).
   New: `buildTokenMarkup(token, ctx)`, `buildLineHtml(line, lineIndex, ctx)`,
   `buildResultsHtml(lines, ctx)` in `analyzer/local/results-display.js`,
   importing `formatReading` (reading/reading.js), `buildRubyMarkup`
   (reading/ruby.js), `escapeHtmlForRuby`/`getRomaji` (reading/kana.js)
   directly as pure ESM functions — no `window.Yomikikuan*` global
   lookup needed for those three, eliminating a category of boot-race
   risk that the old inline code defended against with `&&` guards.
   `window.YomikikuanDict` (classic-script global) is still read
   defensively, matching the original style. 17 new test cases (106
   total in `results-display.test.html`). Verified via `npm test`
   (1132/1132), `npm run e2e` (4/4), and a direct in-browser call to
   `buildResultsHtml` with real `window.YomikikuanDict` + real sample
   text — screenshotted both pill mode (token-pill kana/romaji/kanji/POS)
   and ruby mode (correctly aligned furigana きょう/よ/てんき over
   今日/良い/天気) to confirm pixel-correct rendering, zero console errors.
   `displayResults` itself is now a ~20-line delegator.

> **Session note (2026-06-30 → 2026-07-01):** the "implement everything"
> pass resolved the actionable candidates across two sessions — toast
> dedup shipped, four header-refactor dead clusters removed (−281),
> `showDetailedTranslation` confirmed already-done, the sidebar/button
> dead-lookup sweep finished (−176, see "Partially-done dead code"
> above), and `displayResults` extraction shipped (−59). What remains
> (the `init*` functions) is deliberately deferred: `initUserProfile`
> / `initAppDrawer` are hours-scale DI work with real risk to
> auth/drawer for marginal LOC — not worth it without a dedicated
> session.

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
