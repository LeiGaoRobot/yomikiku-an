# Changelog

All notable changes to this project are documented in this file.

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
