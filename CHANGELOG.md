# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Changed
- **EasyMDE is lazy-loaded**: the ~345 KB editor bundle is no longer part
  of the first paint. The plain textarea stays fully functional until the
  editor mounts; `textInput.value` / `focus` / `addEventListener` are
  shimmed so boot-time callers behave identically. On normal connections it
  mounts after the load event via idle callback; data-saver/2G users only
  load it on first interaction. Offline installs still precache it.
- **Boot analysis scheduling + A/B switch**: the initial `analyzeText()`
  now waits for the load event + idle instead of firing at +100 ms, so the
  shell paints before the ~11.5 MB kuromoji dictionary download starts.
  Data-saver/2G connections skip the automatic run entirely (blur /
  Ctrl+Enter / 解析 still trigger it). A switch selects the mode:
  `localStorage['yomikikuan_boot_analysis']` or `config.js`
  `bootAnalysisMode` = `immediate` (legacy +100 ms) | `idle` (default) |
  `manual` (prompt with an Analyze button, no auto-run).
- **Removed the orphaned app-drawer UI**: `initAppDrawer` was deleted last
  pass as dead code (`#appIcon` never existed); this pass removes its
  matching `#appDrawer` markup (−46 lines), `.app-drawer*` / `.app-item*` /
  `.logout-btn` CSS (−228 lines) and the now-unused
  `applications`/`closeApplicationList` i18n keys.
- `main-js.js` 6,655 → 6,727 (the lazy-editor loader + analysis scheduler
  add ~150 lines; the drawer label pass removes ~7). Ceiling ≤7,500 holds.
- `CACHE_VERSION` v86 → v87; EasyMDE assets added to `pwa-assets.json` for
  explicit offline installs.

### Added
- **Cloud sync Option A (app side)**: explicit Push / Pull with a conflict
  prompt, implemented in `modules/cloud-sync/index.js` against a documented
  `window.__yomikikuanCloudBridge` contract (`get()` /
  `set(payload, updatedAt)`). Meta baseline lives in
  `yomikikuan_cloud_sync_meta`; the user menu gains Push/Pull buttons and
  the legacy sync button delegates to Push. **Firebase is still unwired**
  (no SDK in `index.html`), so the module degrades gracefully to a
  "cloud sync not configured" toast. 13 new i18n keys × ja/en/zh; 152 unit
  cases; E2E ⑫ covers push / pull / conflict accept+dismiss / missing
  bridge with a mock bridge.
- **YouTube whole-video duration cap**: `youtube/duration.js` probes
  `getDuration()` through a hidden IFrame player at parse time (the keyless
  oEmbed endpoint has no duration), so a >10-minute video is rejected before
  any tab can call Gemini. Fail-open: a blocked/offline probe resolves
  `null` and falls back to the old `?start=&end=` clip-range check. Sibling
  test: `youtube/duration.test.html`.
- **CI now runs the Playwright E2E suite** (12 scenarios) after the unit
  suite, with failure artifacts. New guards: desktop 1440×900 redesign
  layout (AI rail, fixed dock, paper canvas), mobile 390×844 rail/dock
  geometry, backup **v2 → v3** import compatibility, and a `login.html`
  smoke test.
- **i18n coverage test**: `i18n/coverage.test.html` asserts ja/en/zh key
  sets are identical and that every literal `t/tr/trFmt/format('…')` key in
  21 module sources resolves in all three languages.
- **E2E growth**: lazy-EasyMDE mount/typing/blur-analysis and a
  data-saver path (editor stays unloaded until interaction) and a
  boot-analysis `manual` mode, cloud sync with a mock bridge — 12
  scenarios total; the runner retries a scenario once on transient
  local-server flakiness.
- **Sibling unit tests** for `settings/theme.js`, `settings/font.js`,
  `settings/display.js` and `analysis/render.js` (+169 cases).
- `docs/plans/2026-10-18-post-1.1.0-product-decisions.md` — measured
  first-load performance, cloud-sync options, and the YouTube-cap design.

### Changed
- **i18n completion**: 46 new keys × ja/en/zh; localized the inspector
  drawer (cards, aria, missing-key hint — now a real element instead of a
  CSS `::after`), shortcut-help panel, progress rings, reading-mode
  labels/tooltips, HTML export copy, and the editor char-count/toast.
- **`main-js.js` 6,999 → 6,655 lines** (−344): deleted the always-dead
  `initAppDrawer` (`#appIcon` never existed in any `index.html`) and removed
  the duplicate reading-mode state + ~260-line legacy overlay implementation
  — `modules/editor/reading-mode.js` is now the single owner.
- `CACHE_VERSION` v85 → v86.
- `static/logo.png` re-encoded 1024×1024 → 128×128 (1.19 MB → 20.8 KB,
  −98.3%); it is displayed at 22 px and doubles as the login favicon.
- Docs: ROADMAP goal retargeted (≤7,500-line ceiling + concern
  classification + sibling-test rule), test counts now 49 pages / 1,356
  cases.

### Fixed
- **Reading-mode state divergence**: the global Esc handler used to flip
  only main-js.js's legacy boolean while the ESM module stayed "active".
  Removing the duplicate state makes divergence structurally impossible.
- YouTube import could send a >10-minute video to Gemini unless the URL
  carried an explicit clip range; the full-video duration is now checked
  first.

## [1.1.0] - 2026-10-18

### Added
- **「和纸书斋」 redesign**: paper/ink/hanko-red token system built from
  `static/favicon.svg` (paper `#FAF7F2` / surface `#FFFDFA` / ink
  `#0B1623` / accent `#E63946`, dark theme inverts paper/ink and lifts
  the accent to `#FF6B75`), applied across the app and `login.html`.
- **Right-hand AI rail**: the five AI entry points (`#inspectorToggleBtn`,
  `#vocabBtn`, `#articleSummaryBtn`, `#jlptBtn`, `#youtubeBtn`) moved out
  of the header into a vertical rail; on ≤768px the rail becomes a bottom
  tab strip above the safe-area inset.
- **Player dock**: the playback bar is now a fixed bottom dock; the
  ふりがな / かな and 中/日 toggles stay visible in it.
- **Shared overlay shell**: JLPT, summary, vocab, YouTube, settings and
  search panels share one ink-scrim / surface-panel shell.
- **Design source canvas**: 21 artboards under
  `docs/design/yomikikuan-redesign/` plus
  `docs/plans/2026-09-05-claude-design-recreation-plan.md`.
- SVG stroke icons replace header/rail emoji; emoji were stripped from
  panel titles and tabs (ja/en/zh).

### Changed
- `CACHE_VERSION` v84 → v85 for the redesign deploy.
- Docs re-synced with the tree: `main-js.js` 6999 lines, 47 test pages
  (43 headless, 1147 cases), README test counts updated.

### Fixed
- **JLPT panel i18n**: mode descriptions (previously Chinese-only
  `MODE_META.nameZh`) now route through `panel.jlpt.modeDesc.*` keys in
  ja/en/zh across the mode grid, generation-status header, and
  weak-point coach banner.
- **YouTube import**: explicit clip ranges (`?start=&end=`) over the
  10-minute cap are rejected before any Gemini call (the free oEmbed
  endpoint exposes no duration, so this is the one enforceable check).
- **TTS seek**: the J/K 10-second seek shortcut was dead code — it now
  drives a real `Audio` accessor behind the playback boundary.
- **TTS voice/volume restore**: preferences were read through
  `window.LS`, but the classic script only sets `window.YomikikuanLS`,
  so saved voice/volume were silently ignored on reload.
- **PWA download**: restored the missing `#headerDownloadBtn` and share
  `deferredPrompt` globally so the install button works again.
- **Analyzer vocab save**: fixed silently-broken vocab-save in the JLPT
  depth panel and article summary.
- Assorted i18n gaps, `pwa-assets.json` manifest entries, mobile CSS,
  theme drift, and dead code.

## [1.0.0] - 2026-07-01

First tagged release. YomiKiku-an is a browser-based, zero-build Japanese
reading and listening practice tool.

### Added
- Kuromoji.js-based text segmentation with part-of-speech tags, kana, and
  romaji display.
- Speech synthesis via the Web Speech API: word/line/full-text playback,
  live speed adjustment (0.25–4.0x), voice selection, seekable progress
  bar, and keyboard shortcuts.
- JMdict dictionary integration with clickable word cards.
- Multi-document management with autosave, quick switching, and JSON
  backup export/import (schema v3, including vocab + mistake book).
- Built-in EasyMDE markdown editor.
- Optional Gemini-API-powered AI features: per-sentence analyzer,
  article-level summary, JLPT listening question generator (N5–N1),
  中/日 bilingual per-line translation, and an SM-2 spaced-repetition
  vocab + mistake book.
- YouTube import: subtitle transcription, companion playback, and
  auto-generated listening questions from a pasted video URL.
- PWA support with an offline-capable service worker and install prompt.
- Optional Google login + Firestore cloud sync (`login.html`).
- Dark mode, multilingual UI (ja/en/zh), draggable toolbar, and a
  mobile-polished responsive layout (768px / 480px breakpoints).

### Changed
- Ongoing incremental extraction of `static/main-js.js` into ES modules
  under `static/js/modules/` (analyzer, backup, docs, editor, i18n,
  player, settings, srs, ui) — see `ROADMAP.md` for the running log.
  `main-js.js` is down to ~6960 lines from an ~8835-line starting point,
  with 1132 test cases across 42 headless `*.test.html` pages plus a
  4-scenario Playwright E2E smoke suite.

### Fixed
- `textInput`'s blur handler referenced an undefined `docManager`
  instead of `documentManager`, so blurring an empty textarea threw
  instead of cleaning up the empty document.
- The user-menu's "download/install app" button threw
  `ReferenceError: t is not defined` on every click, because
  `initUserProfile` runs outside the main IIFE's closure (a structural
  quirk present since the first commit) and `t` wasn't exported to
  `window`. Same root cause broke `setLanguage` when restoring a backup
  that included a language setting. Both are now exported alongside the
  existing `window.applyI18n` export that already solved this class of
  problem.
- Removed several clusters of dead code left over from earlier UI
  refactors (a defunct right-hand settings sidebar, orphaned header
  controls, and a ~131-line unreachable duplicate of the backup/import
  feature).
