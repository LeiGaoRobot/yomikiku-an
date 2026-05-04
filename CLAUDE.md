# YomiKiku-an（読み聞く庵）

Browser-based Japanese reading + listening practice tool: Kuromoji.js segmentation, POS tagging, kana/romaji, Web Speech API TTS, JMdict integration, EasyMDE markdown editor, multi-document storage, PWA. Optional Google login + Firestore cloud sync (login.html). AI features (per-sentence analyzer, per-article summary, JLPT question generator, bilingual translation, vocab/mistake book) via Gemini API.

> **See also**: [`ROADMAP.md`](./ROADMAP.md) — extraction goal, next-wave queue, do-not-touch boundaries.
> **See also**: [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Phase-1/Phase-2 extraction recipe, test runner setup.
> **Auto-loaded rule**: `.claude/rules/playback-boundary.md` — globs to `static/main-js.js` + `static/js/tts.js`; enforces the playback / SW invariants documented below.

## Stack

- **Pure static site** — no build step, no framework. HTML + vanilla JS + CSS.
- Entry: `index.html` → `static/js/migrate-legacy-keys.js` → classic scripts (`main-js.js`, `dictionary.js`, `i18n.js`, `tts.js`, `segmenter.js`) → optional `config.js` (gitignored) + inline sync IIFE → `static/js/modules/app.js` (ESM bootstrap).
- Standalone: `login.html` — Google OAuth via Firebase + Firestore cloud sync.
- Styles: `static/styles.css` (base), `static/theme-apple.css` (override layer), `static/mobile.css` (loaded via `<link media="(max-width: 768px)">`).
- Service worker: `service-worker.js` (cache prefix `yomikikuan-cache`; sweeps legacy `fudoki-cache*` + older `yomikikuan-cache-v*` on activate).
- JMdict data: `static/libs/dict/chunks/jmdict_chunk_00[0-1].json`.
- `node_modules` is dev-only; runtime is fully client-side.

## Run

```bash
npm start   # python3 -m http.server 8000
# open http://localhost:8000
```

`?clear=1` purges cached localStorage (documents preserved).

## Local config (optional)

- `cp config.example.js config.js` and fill in `geminiApiKey` / `geminiStyle`.
- `config.js` is gitignored. An inline IIFE in `index.html` copies it into `localStorage` on every load (config.js is authoritative — UI-entered keys are overwritten on reload).
- SW special-cases `/config.js` as **networkFirst** so key rotation takes effect on reload without bumping `CACHE_VERSION`.
- **Not safe for public deploys** — any file served to the browser can be fetched by anyone who can reach the server.

## Active migration — `main-js.js` → `static/js/modules/`

`static/main-js.js` is ~8800 lines. Extractions under `static/js/modules/`:
- `app.js` (ESM entry), `analysis/`, `config/`, `docs/`, `editor/`, `i18n/`, `player/`, `settings/`, `ui/`
- `analyzer/` — `local/` (difficulty/syntax/tokenizer/JLPT tables), `providers/` (gemini/mock/registry/base), `cache/` (idb TTL+LRU, pin), `ui/` (badge, inlineCard, listSwatch, jlptPanel, articleSummary, vocabPanel, bilingual)
- `backup/` — `index.js` (payload assembly + v3 schema), `io.js` (downloadTextFile + formatNowForFile)
- `srs/store.js` — SM-2 spaced repetition over `yomikikuan-srs` IDB
- `ui/panel-triggers.js` — lazy-import wiring for the 4 header panel buttons

Bulk of logic still in `main-js.js`. When adding features, prefer extracting the touched area into a module.

## Conventions

- **No bundler/framework** — intentionally zero-build.
- **i18n** — route UI strings through `static/js/i18n.js` / `modules/i18n/index.js` (ja/en/zh).
- **Ad-hoc tests** live as `*.test.html` next to the module (e.g. `analyzer/local/difficulty.test.html`, `srs/store.test.html`, `analyzer/local/tokenizer.test.html`). Open in browser, PASS/FAIL renders in-page, zero deps.

### localStorage / sessionStorage

All keys prefixed `yomikikuan_`. Don't wipe them during cache resets. If you rename any, add the old→new pair to `static/js/migrate-legacy-keys.js`.

**Known localStorage keys**: `yomikikuan_texts` (documents), `yomikikuan_activeId`, `yomikikuan_theme`, `yomikikuan_lang`, `yomikikuan_fontSize`, `yomikikuan_gemini_api_key`, `yomikikuan_gemini_style`, `yomikikuan_ruby_mode` (`'true'` or absent), `yomikikuan_bilingual_mode` (`'true'` or absent), `yomikikuan_analyzer_autoplay_preanalyze`, TTS engine/voice prefs, user profile. Plus the backward-compat short keys (`text`, `voiceURI`, `rate`, `volume`, `activeId`, …) still used by main-js.js's `LS` constant — `migrate-legacy-keys.js` maps them.

**sessionStorage**: `yomikikuan_logging_out`, `yomikikuan_sw_reloading` (one-shot flag breaking SW controllerchange reload loop).

### IndexedDB

| Database | Store(s) | TTL / Eviction | Purpose |
|---|---|---|---|
| `yomikikuan-tokens` | segmenter cache | 60-day TTL | Kuromoji token cache |
| `yomikikuan-tts` | TTS blob cache | 30-day TTL + in-memory LRU-50 | Gemini TTS audio (mirrored in `tts.js` LRU that `URL.revokeObjectURL`s on eviction) |
| `yomikikuan-analysis` | `analysis` | 30-day TTL + LRU-500 | Analyzer cache. **Namespace via `providerId`**: `gemini` (per-sentence analyze), `jlpt` (question payloads), `article-summary`, `translate-zh` (bilingual per-line translation). All safe to drop. |
| `yomikikuan-srs` | `vocab`, `mistakes` | **No TTL, no eviction** | User-owned SM-2 learning data (词汇本 / 错题本). Only explicit `removeVocab/removeMistake` calls delete. Exposed via `window.__yomikikuanDumpSrs / RestoreSrs`. |

All dates stored as **epoch ms integers** inside records (`createdAt`, `lastReviewedAt`, `nextDueAt`). Only ISO-8601 date string in the codebase is the top-level `createdAt` on the backup-export payload.

### Classic-script globals

Set by ESM modules for legacy callers in `main-js.js`. Convention: stable APIs use `YomikikuanXxx`; internal hooks / one-shot triggers use `__yomikikuan*`.

**Stable APIs**:
- `window.YomikikuanDict` — from `js/dictionary.js`
- `window.YomikikuanGetText(key, fallback)` / `YomikikuanFormat(key, params)` — from `modules/i18n/index.js`
- `window.YomikikuanEvents` — from `modules/player/events.js`
- `window.YomikikuanRuby = { isEnabled/enable/disable/toggle }` — from `main-js.js`
- `window.YomikikuanAnalyzer = { analyzeDocument, expandSentence, glossWord }` — from `analyzer/index.js`
- `window.TTS` / `setTTSEngine` / `getTTSEngine` / `getGeminiApiKey` / `setGeminiApiKey` — from `tts.js`

**Internal hooks (`__yomikikuan*`)**:
- `__geminiSynth(text, voiceName)` → WAV URL — from `tts.js`
- `__prefetchGeminiTTS(text)` — read-ahead for next segment, silent on error
- `__applyLiveRate(r)` — mutates `Engine.audio.playbackRate` for live speed adjustment (the only approved narrow hook from `tts.js` into playback audio)
- `__yomikikuanAnalyzeLine(ev)` — inline onclick for per-line 🔍 button (`.analyze-line-btn`)
- `__yomikikuanRefreshDifficultyBadge()` — from `analyzer/ui/badge.js` (self-registered); called by `documentManager.loadActiveDocument`
- `__yomikikuanOpenJLPT()` / `__yomikikuanOpenArticleSummary()` / `__yomikikuanOpenVocab()` — panel modal entry points from respective UI modules
- `__yomikikuanToggleBilingual()` + `__yomikikuanBilingualState = { enabled }` — from `bilingual.js`
- `__yomikikuanAddVocab(entry)` / `__yomikikuanAddMistake(entry)` — SRS write hooks used by inlineCard AI-gloss save + jlptPanel wrong-answer auto-log
- `__yomikikuanDumpSrs()` / `__yomikikuanRestoreSrs(payload)` — backup schema v3 hooks
- `__yomikikuanKeyStatus = { hasKey, maskedKey }` — set on every page load by the config.js sync IIFE; also toggles `<html>.no-gemini-key` class (CSS shows a red dot on `#jlptBtn`)

### Playback pipeline boundary (load-bearing)

The playback state machine lives **only** in `main-js.js` — local `playSegments`, `speakWithPauses`, `playAllText`, `stopSpeaking`, `PLAY_STATE`, `isPlaying`, `currentSegments`, `currentSegmentIndex`, `currentUtterance`, `setHeaderProgress`, `updatePlayButtonStates` are IIFE-locals, **not** `window.*` exports.

`static/js/tts.js` is scoped to: engine selection, voice listing, Gemini synthesis (`geminiSynth`), Gemini-TTS settings-panel injection, and the `window.speechSynthesis` **shim** whose `.speak(utter)` transparently routes classic `SpeechSynthesisUtterance` calls to either native Web Speech or Gemini + `Audio` element (with utterance event bridging). **Do not** reintroduce mirror `window.playAllText/playSegments/speakWithPauses` exports — they previously existed and silently broke. `__applyLiveRate` is the only approved narrow hook into the `Audio` element.

**Safety filter auto-skip**: Gemini occasionally returns `PROHIBITED_CONTENT` on benign-but-short segments (e.g. `SpeechSynthesisAPIを使って、`). `splitTextByPunctuation` pre-filters segments with no speakable chars via `/[\p{L}\p{N}]/u`. `playSegments.onerror` additionally detects `PROHIBITED_CONTENT|SAFETY|no audio in response` in the error message and auto-advances to the next segment rather than aborting playback; the Gemini shim in `tts.js` suppresses the red toast for these recoverable errors.

### Service-worker deploy contract

`service-worker.js` deliberately does NOT call `self.skipWaiting()` in `install`. A new worker waits until the page posts `{ type: 'SKIP_WAITING' }`. `main-js.js` registers the SW on every load, shows an `.ap-update-toast` (right-bottom blue `刷新` button) when a new version reaches `installed` state while a current worker is still in control, then posts `SKIP_WAITING` and reloads on `controllerchange`.

**Every deploy that changes any cached asset MUST bump `CACHE_VERSION` in `service-worker.js`** (currently `v20`; bumped on every asset-affecting change) — otherwise the activate-sweep won't purge the stale bucket and users never see the new code.

Fetch strategy:
- Navigation → `networkFirst` (fallback to cached `index.html` offline)
- `/config.js` → `networkFirst` (key-rotation-friendly)
- Other same-origin → `cacheFirst`
- Cross-origin (Gemini API etc.) → no interception

### Backup schema

Filename: `yomikikuan-backup-<YYYYMMDD-HHMMSS>.json`. Current version: **v3**.

```jsonc
{
  "app": "YomiKiku-an",
  "version": 3,
  "createdAt": "<ISO 8601>",
  "data": {
    "documents": [...],
    "activeId": "<doc id>",
    "settings": { "<yomikikuan_*>": "<string>", ... },
    "srs": { "vocab": [...], "mistakes": [...] }   // added in v3
  }
}
```

**Import semantics**: `settings` and `documents` overwrite local; `srs.vocab` and `srs.mistakes` **merge by `id`** (existing rows kept — preserves local review state). v2 backups without `data.srs` import fine; SRS section silently skipped.

Bump `version` if the top-level shape changes. Export/import live in `modules/backup/index.js`; file I/O helpers in `modules/backup/io.js`.

### Header toolbar button IDs

Quick index for wiring new features into the header:
- `#diffBadgeMount` — difficulty pill (auto-populated by `analyzer/ui/badge.js`)
- `#articleSummaryBtn` — 📖 document-level summary
- `#jlptBtn` — 🎧 JLPT listening question generator
- `#vocabBtn` — 🧠 词汇本 / 错题本
- `#bilingualToggle` — 中/日 per-line translation toggle (carries `aria-pressed` state)
- `#rubyModeToggle`, `#readingScriptToggle` — existing ふりがな / かな script toggles
- All click handlers go through `modules/ui/panel-triggers.js` (lazy-imports the panel module + invokes `window.__yomikikuanOpen*`).

### UI module conventions

- Each panel module (jlptPanel, articleSummary, vocabPanel, bilingual) follows a common shape: `export function mountPanel(ctx)` + `unmountPanel()` + self-registers a `window.__yomikikuanOpen*` classic-script entry.
- **CSS-in-JS via `<style>` injection** with a module-level `__yomikikuan<Name>CssInjected` window flag for idempotency. Keeps panels self-contained without new `.css` files.
- Modal overlays use class `.<name>-overlay` + `.<name>-panel` pattern (z-index 9999, backdrop click to close, Esc to close).
- Per-line 🔍 analyze button uses `window.__yomikikuanAnalyzeLine(event)` via **inline onclick** — required because `.ruby-token` siblings call `event.stopPropagation()` on their own `playToken` handlers, which blocks bubble-up to the delegated `#content` listener.
- Mobile styles for new panels are appended to `static/mobile.css` (the file is already `media="(max-width: 768px)"`-gated at `<link>` load — no need for inner `@media` unless targeting ≤480px).

### Misc

- Mobile breakpoints: `768px` and `480px` — test both.
- Brand: display name `読み聞く庵` (JP UI) or `YomiKiku-an` (latin). Package: `yomikiku-an`. Repo: `github.com/LeiGaoRobot/yomikiku-an`.
