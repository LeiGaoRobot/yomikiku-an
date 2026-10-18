# Roadmap

Living document tracking the `main-js.js` extraction work. Updated as
modules land. The plain-language goal: keep `main-js.js` bounded and every
remaining concern either extracted, deleted as provably dead, or
explicitly boundary-locked with its blockers written down.

## Goal (retargeted 2026-10-18)

> **Why retargeted:** the old goal — `main-js.js < 5000 lines` — was
> structurally unreachable from refactoring alone (see "Honest reality
> check"). It is replaced by a verifiable ceiling plus a
> concern-classification checklist, so progress is measured by ownership
> clarity instead of raw LOC.

- **`main-js.js` stays ≤ 7,500 lines** — a ceiling, not a target. Current:
  **6,804** (after the 2026-10-18 third pass); was 8,835 at the
  start of the cumulative effort (**−2,031 net**).
- **Acceptance checklist** (re-verify each pass):
  1. `wc -l static/main-js.js` ≤ 7,500.
  2. Every `init*` / stateful concern still in `main-js.js` is either
     **(a)** extracted to `static/js/modules/**`, **(b)** deleted as
     provably unreachable dead code, or **(c)** listed under
     "Boundary-locked concerns" below with concrete blockers +
     prerequisites. No unclassified concerns.
  3. **Every logic module has a sibling test** (`*.test.html` next to the
     module). Exempt only pure side-effect bridge modules whose whole job
     is `window.X = X` registration or event wiring. A newly created logic
     module must ship its sibling test in the same change.
  4. `npm test` and `npm run e2e` are green on the default ports (CI runs
     both; local runs may override `YK_TEST_PORT` / `YK_E2E_PORT`).
- **Test coverage growing in lockstep** with each extraction (currently 54
  `*.test.html` files on disk; **50 run headlessly** via the `TESTS` array
  in `scripts/test.sh` — **1,508 cases, all green** per the latest
  `npm test` run. The 4 unregistered pages are intentional manual-only
  fixtures that don't use the runner's `#summary` harness (visual tables:
  `difficulty`, `syntax`; `console.assert` page: `idb`; non-standard
  harness: `backup/index`). Plus the Playwright E2E smoke suite via
  `npm run e2e` (12 scenarios, all green).)

<details><summary>Header-refactor dead-code sweep history (2026-06/07)</summary>

A full header-refactor dead-code sweep is complete — header-scroll −156,
quick-search −56, mobile lang-dropdown −57, nav lang-flags −12, sidebar i18n
labels −70, dead lang/theme `<select>` −110, dead sidebar controls −215, last
sidebar voice refs in refreshVoices −15, plus assorted consts; toast Phase-2
dedup +13. The old right-settings-sidebar ('sidebar' context) is never
rendered, so every `sidebar*` lookup was null; all live controls run through
the settings modal ('modal' context) + user-menu submenus. All dead
`sidebar*` code is now removed, including the refreshVoices internals —
verified safe: a stubbed-voice headless run shows refreshVoices still
populates voiceSelect + headerVoiceSelect (30 options each) and text still
segments, zero console errors. The only remaining `sidebar*` token is
`toggleBtn`/`sidebarToggle` in the live doc-list collapse function —
guarded, possibly conditionally-present, left as-is.

</details>

> **Sync note (2026-06-30)**: this document was re-audited against the
> working tree. Headline numbers, the Done inventory, and the next-wave
> list below now reflect actual code. Earlier revisions had drifted
> (claimed 7949 lines / 26 test pages / 754 cases).

> **Sync note (2026-10-18)**: headline numbers re-audited after the
> post-1.0.0 hardening pass (8 commits: JLPT/YouTube i18n, TTS seek &
> voice-restore fixes, PWA download button, analyzer vocab-save) and again
> after the technical-debt pass below. Current tree: `main-js.js`
> **6,655** lines, **87** ESM modules, **53** `*.test.html` on disk of
> which **49** run headlessly in **1,356** cases, plus the Playwright E2E
> suite (12 scenarios). *(The old number in this note — 6999 / 86 / 47 /
> v85 / 1147 — was correct before this pass; the Lead bumped `CACHE_VERSION`
> to v86 in the integration commit.)*

> **Status note (2026-10-18, post-1.1.0)**: **v1.1.0 is released**
> (`7d610ad`) and the 「和纸书斋」 redesign is merged (`7bf2a5c`) — the
> redesign is the new UI baseline, not a pending wave. This pass (D:
> technical debt) made three decisions: (1) `initAppDrawer` was **dead
> code, not extractable** — its only trigger `#appIcon` has never existed
> in `index.html` (absent since the initial commit), so it always
> early-returned; **deleted**. (2) `initUserProfile` stays **boundary-
> locked** — audit below; its cloud-sync half is additionally
> *structurally dead* (`window.firebase*` is never defined). (3)
> Reading-line highlight state is now **single-owner**:
> `modules/editor/reading-mode.js` owns it; `main-js.js` keeps four thin
> shims and no second copy. See the notes in the corresponding sections.
>
> **Integration note (2026-10-18, same wave):** alongside the debt pass the
> Lead integrated the other three workstreams — i18n completion (46 keys ×
> ja/en/zh + `i18n/coverage.test.html`), CI now runs the 10-scenario E2E
> suite (redesign layout, backup-v2 import, login smoke) with four new
> sibling unit pages (169 cases), and a YouTube whole-video duration probe
> (`youtube/duration.js`, fail-open) plus the logo re-encode (1.19 MB → 20.8
> KB). Final wave state: 49 headless pages / 1,356 cases, 10 E2E scenarios,
> `CACHE_VERSION` **v87**.

> **Second pass (2026-10-18, same day):** removed the orphaned `#appDrawer`
> DOM (−46 HTML lines) + `.app-drawer*` CSS (−228 CSS lines) + its i18n
> label pass after `initAppDrawer` was proven dead; deferred the boot
> `analyzeText()` to post-load idle (skipped entirely on data-saver/2G);
> lazy-loaded EasyMDE (~345 KB) behind value/focus/addEventListener shims
> so the native textarea works until the editor mounts, with data-saver
> users loading it only on first interaction; E2E grown to 12 scenarios
> (lazy-editor mount, data-saver path) with a one-shot retry for transient
> local-server flakes. `main-js.js` is 6,727 lines — the lazy-editor loader
> and analysis scheduler added ~150 lines while the drawer cleanup took
> ~7; the ≤7,500 ceiling still holds. **Boot-analysis A/B switch** added:
> `localStorage['yomikikuan_boot_analysis']` / `config.js: bootAnalysisMode`
> = `immediate` | `idle` (default) | `manual`; `manual` renders a prompt
> with an Analyze button instead of auto-running. E2E scenario ⑪ covers it.
>
> **Third pass (2026-10-18, same day): cloud sync Option A (app side).**
> New `modules/cloud-sync/index.js` implements explicit Push / Pull with a
> conflict prompt against a documented `window.__yomikikuanCloudBridge`
> contract (`get()` / `set(payload, updatedAt)`), meta key
> `yomikikuan_cloud_sync_meta`, 152 sibling tests. User menu gains
> `#cloudPushBtn` / `#cloudPullBtn`; the legacy `#syncDataBtn` delegates to
> push. **Firebase is still unwired** — `index.html` ships no SDK, so the
> module fails gracefully ("cloud sync not configured") and the ~450-line
> dead Firestore code in `initUserProfile` remains a separate decision.
> E2E scenario ⑫ covers push/pull/conflict/no-bridge with a mock bridge.
> `main-js.js` is 6,804 lines (+51 wiring).


> **✅ Retargeted 2026-10-18**: the analysis below still stands, so the
> `< 5000` goal is formally retired. It was replaced by the ≤ 7,500-line
> ceiling + the concern-classification checklist in "Goal". Kept as
> history because the reasoning about Phase-2 LOC math is still correct.

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

**2026-10-18 technical-debt pass (−344 LOC in `main-js.js`, no new module)**:

- `initAppDrawer` **deleted** (−96 lines incl. the call site) — provably
  dead since the initial commit; see the follow-up under "Next-wave #2"
  for the grep evidence.
- **Reading-mode state de-duplicated.** Removed main-js.js's second copy of
  `isReadingMode` / `activeReadingLine`, the ~260-line legacy overlay
  implementation (`setReadingMode`, `setReadingLineActive`,
  overlay create/remove, `bindReadingOverlayInteractions`), the legacy
  `initReadingModeToggle`, the empty `initReadingModeInteractions`, and the
  `readingModeToggle` / `editorReadingToggle` boot-time consts. The single
  owner is now `modules/editor/reading-mode.js` (already imported by
  `app.js`); `main-js.js` keeps only four thin shims over its `window.*`
  API: `isReadingModeActive` / `clearReadingLineHighlight` /
  `syncReadingLineAttributes` / `updateReadingToggleLabels`.
  Side-effect fixed: the old global-Esc path flipped only the legacy bool
  while the module stayed "active" (module→legacy sync is one-way via
  `__setMainReadingMode`); Esc now routes through `window.setReadingMode`,
  so the two states can no longer diverge.
- Verified: `npm test` **1,356/1,356** (49 pages, after the Lead registered
  the wave's new sibling tests; 1,147/1,147 / 43 pages at the time this
  pass's code edits were validated); `npm run e2e` **8/8**;
  Playwright smoke on a private server (port 8218): boot, document list,
  analyze path (`displayResults` / `showLoadingState` shims), reading-mode
  enter → line highlight → Esc exit → re-enter/exit, language-switch label
  refresh — **15/15 checks, zero console errors**.

## Next-wave candidates (re-audited 2026-10-18)

Ranked by **value/risk ratio** (top = best ROI). Line numbers drift as
modules land — re-grep before starting any item (tree is now 6,655 lines).

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

   **`init*` extraction targets — resolved 2026-10-18.** `initAppDrawer`
   turned out to be **dead code, not an extraction candidate**: its only
   trigger is `document.getElementById('appIcon')`, and `#appIcon` has
   never existed in `index.html` (`git log --all -S appIcon -- index.html`
   returns nothing; the initial commit's `index.html` already lacked it),
   so the `if (!appIcon || ...) return;` guard always fired. Deleted
   (−96 lines) rather than extracted — **deletion beats extraction**, the
   same lesson as the header-scroll cluster. The drawer's DOM
   (`#appDrawer*` in `index.html`), its `.app-drawer*` CSS in
   `styles.css`, and the two `#appDrawerTitle` / `#appDrawerClose` label
   lines in `applyI18n` are now orphaned. Removing them is a future
   cleanup that touches files outside this pass's write scope
   (`index.html` / `styles.css`); the label pass is harmless and keeps the
   existing DOM localised if the drawer is ever re-enabled. Net: candidate
   #2's real yield stays **dead-code removal (−377 total across both
   sessions)**, not extraction.

   **`initUserProfile` — boundary-locked, not extracted (audit
   2026-10-18).** See "Boundary-locked concerns" below for the dependency
   inventory, the "why not now", and the exact prerequisites. Its
   cloud-sync half is additionally *structurally dead* — see candidate #2b.

   **2b. `initUserProfile`'s cloud-sync half is structurally dead (~500 LOC,
   new 2026-10-18).** The function guards the whole Firestore path on
   `window.firebaseDB && window.firebaseAuth && window.firestoreHelpers`,
   plus `window.firebaseSignOut`. Grep across the repo (excluding
   `node_modules`): **those globals are never assigned anywhere**.
   `login.html`'s Firebase module keeps `initializeApp`/`getAuth` in file
   scope and only writes `localStorage.yomikikuan_user`; the inline
   scripts in `index.html` never mention Firebase. Therefore
   `performAutoSync()` always returns early at its guard, and the
   ~450-line bidirectional merge loop, `serverTimestamp()` writes,
   `firebaseSignOut` branches, etc. can never run. **Prerequisite before
   deleting:** confirm no deploy-time script or extension injects
   `window.firebase*` (the repo says none) and decide whether cloud sync
   is a live roadmap item. If it is, the sync half should be extracted to
   `modules/sync/` first and re-wired through an explicit Firebase adapter
   — deleting it now would destroy the reference implementation.
   **This is the single largest remaining LOC win in `main-js.js`.**

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
>
> **Resolved 2026-10-18:** `initAppDrawer` deleted as provably dead
> (never a DI problem); reading-mode state consolidated into its existing
> ESM owner; `initUserProfile` explicitly boundary-locked (audit below).

### Boundary-locked concerns (classified, do not extract without prerequisites)

These are the "no unclassified concern" entries for acceptance item 2(c).

1. **`initUserProfile` — 955 lines, stays in `main-js.js` for now.**
   Audit 2026-10-18 (it is top-level classic-script code *after* the main
   IIFE closes, so "closure locals" here really means globals):
   - **DOM**: 21 distinct `getElementById` targets (`#userProfileContainer`,
     `#userAvatarBtn`, `#userDropdownMenu`, `#userAvatarImg`,
     `#userAvatarPlaceholder`, `#userDisplayName`, `#userEmail`,
     `#syncDataBtn`, `#userSettingsBtn`, `#userDownloadBtn`,
     `#switchAccountBtn`, `#logoutBtn`, `#userExportBtn`, `#userImportBtn`,
     `#userImportFile`, `#errorToast`, `#errorText`, `#syncProgressToast`,
     `#syncProgressText`, `#currentThemeName`, `#currentLangName`) plus
     `querySelectorAll` over the theme/lang submenu parents.
   - **localStorage keys**: `yomikikuan_user`, `lang`, `theme`,
     `yomikikuan_theme`, `yomikikuan_lang`, `yomikikuan_activeId`,
     `yomikikuan_texts`.
   - **window globals**: `documentManager`, `openSettingsModal`,
     `performDataSync`, `setLanguage`, `setCurrentLang`, `applyI18n`,
     `setThemePreference`, `showInfo/Error/SuccessToast`,
     `__yomikikuanDeferredInstallPrompt`, `startAutoSync`,
     `stopAutoSync`, `markUnsyncedChanges`, `firebaseSignOut`,
     `firebaseDB`, `firebaseAuth`, `firestoreHelpers` (last three never
     set — see candidate #2b) — **18+, ~30 bindings once the internal
     nested hooks are counted**.
   - **Nested subsystems inside the function**: a 4-field auto-sync state
     machine + three timers (`markUnsyncedChanges`, `performAutoSync`,
     `startAutoSync`, `stopAutoSync`), the Firestore bidirectional merge,
     backup v2/v3 export/import wiring (`collectBackupPayload`,
     `applyBackup` — thin wrappers over `modules/backup/index.js`),
     PWA install/download flow, logout/switch-account, and no fewer than
     **three nested toast copies** (`showErrorToast` / `showSuccessToast` /
     `showInfoToast`) that re-assign `window.*` after the ESM toasts
     module has already installed the canonical versions.
   - **Why not now**: (a) extracting it as one module would need a
     ~30-binding explicit context; (b) it mixes at least four independent
     concerns that want separate homes (user-menu chrome, auto-sync,
     backup wiring, PWA install); (c) the three nested toast copies make
     `window.show*Toast` ownership order-dependent, so any extraction must
     first delete them; (d) `documentManager`/`openSettingsModal` are
     IIFE-scoped globals only reachable via `window.*`; (e) user-profile
     logic is duplicated conceptually with `login.html`, so the API shape
     is not yet clear.
   - **Prerequisites (in order)**: 1) delete the nested toast copies and
     rely on `modules/ui/toasts.js`; 2) extract auto-sync (dead in index.html
     today) to `modules/sync/` with a Firebase adapter; 3) extract the
     user-menu submenu wiring after unifying theme/lang controls with
     `modules/settings/{theme,font,display}.js`; 4) extract backup wiring to
     `modules/settings/user-menu.js`; 5) only then split `initUserProfile`
     into a ~150-line UI shell + `mountUserMenu(ctx)`.
2. **Playback state machine + `tts.js`** — see "Do-not-touch boundaries".
   Unchanged by this pass; still the hardest boundary in the codebase.
3. **Reading-line highlight / reading-mode state** — no longer a boundary:
   resolved 2026-10-18 (single owner = `modules/editor/reading-mode.js`).
4. **`ui/reader-mode.js` (fullscreen Reader Mode overlay)** — audited
   2026-10-18: it is a *separate* feature from reading-mode line
   highlighting (it clones `#content` into a `#readerModeOverlay` and owns
   only its own `fontScale` / `currentLineIdx` / `keyHandler` state; it
   never touches `activeReadingLine` / `isReadingMode`). No duplication to
   colocate; leave as-is.

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
- ~~**`setReadingLineActive` / `clearReadingLineHighlight`**~~ ✅ shipped
  2026-10-18 — **state colocation done in the opposite direction from the
  original plan**: instead of moving the state into a new module, the
  duplicate copy was deleted from `main-js.js` and the pre-existing owner
  (`modules/editor/reading-mode.js`, already imported by `app.js`, already
  self-bootstrapping, already exporting `setReadingLineActive` /
  `clearReadingLineHighlight` / `syncReadingLineAttributes` /
  `updateReadingToggleLabels` and bridging them to `window`) became the
  single owner. `main-js.js` keeps four thin shims + `isReadingModeActive()`
  and no local state, so divergence is impossible. Note: the task brief
  named `modules/ui/reader-mode.js` as the counterpart — that module is the
  *fullscreen Reader Mode overlay* (separate feature, already self-owned);
  the actual duplicate lived in `static/main-js.js` vs.
  `modules/editor/reading-mode.js`. Bonus bug fixed: global Esc used to
  desync the module state (module→legacy sync was one-way).

### Off-limits (playback boundary — see Do-not-touch below)

Line numbers current as of 2026-10-18 (post technical-debt pass — re-grep
before relying on them; they drift every extraction):
`refreshVoices` (`:2157`), `playAllText` (`:3857`), `setHeaderProgress`
(`:1866`), `speakWithPauses` (`:3043`), `playSegments` (`:3089`),
`stopSpeaking` (`:3325`), `updatePlayButtonStates` (`:3343`),
`restartCurrentSegmentAt` (`:1919`), `initVoiceAndSpeedControls` (`:5050`)
— all touch voice listing or the playback state machine / `Audio` element.
Do not extract.

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
  Chromium through the 49 pages in the `TESTS` array (**1,356 cases**).
  Resolves `playwright` from project node_modules, `@playwright/mcp`'s
  nested install, or `$PLAYWRIGHT_NODE_PATH`. E2E: `npm run e2e` →
  `bash scripts/e2e.sh` → Playwright spec in `tests/e2e/` (12 scenarios,
  includes the redesign layout assertions + login.html smoke). Override
  ports with `YK_TEST_PORT` / `YK_E2E_PORT` when running in parallel.

## Out of scope (for now)

- Migrating to a build step / bundler — explicitly rejected by CLAUDE.md
  ("Pure static site — intentionally zero-build"). Module dedup happens
  at the call-site level, not via tree-shaking.
- Rewriting EasyMDE / kuromoji / kuroshiro layers — third-party, behave.
- TypeScript migration — tests provide enough type safety for now;
  revisit if the project grows past 30k LOC.
