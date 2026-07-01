# Changelog

All notable changes to this project are documented in this file.

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
