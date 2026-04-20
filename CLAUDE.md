# YomiKiku-an（読み聞く庵）

Browser-based Japanese reading + listening practice tool: Kuromoji.js segmentation, POS tagging, kana/romaji, Web Speech API TTS, JMdict integration, EasyMDE markdown editor, multi-document storage, PWA. Optional Google login + Firestore cloud sync (login.html).

## Stack

- **Pure static site** — no build step, no framework. HTML + vanilla JS + CSS.
- Entry: `index.html` → loads (in order) `static/js/migrate-legacy-keys.js` → `static/main-js.js` (monolith) + `static/js/dictionary.js` + `static/js/i18n.js` + `static/js/tts.js` + `static/segmenter.js` → `static/js/modules/app.js` (ESM bootstrap).
- Standalone: `login.html` — Google OAuth via Firebase + Firestore cloud sync. Needs the project's own `firebaseConfig`.
- Styles: `static/styles.css` (base), `static/theme-apple.css` (Apple-inspired override layer — see `DESIGN.md`), `static/mobile.css` (≤768px).
- Service worker: `service-worker.js` (cache prefix `yomikikuan-cache`; activate sweeps stale `fudoki-cache` legacy buckets).
- JMdict data: `static/libs/dict/chunks/jmdict_chunk_00[0-1].json` (~110MB total, chunk 0 is 81MB — flagged by GitHub's 50MB warning).
- `node_modules` exists only for local Kuromoji/JMdict dev helpers; runtime is fully client-side.

## Run

```bash
npm start   # python3 -m http.server 8000
# open http://localhost:8000
```

Append `?clear=1` to the URL to purge cached localStorage (documents are preserved).

## Active migration — `main-js.js` → `static/js/modules/`

`static/main-js.js` is ~8170 lines. Currently extracting into modules under `static/js/modules/`:
- `app.js` (entry, skeleton so far)
- `analysis/`, `config/`, `docs/`, `editor/`, `i18n/`, `player/`, `settings/`, `ui/`

Bulk of logic still lives in `main-js.js`. When adding features, prefer extracting the touched area into a module rather than growing the monolith further.

## Conventions

- Do not introduce a bundler/framework — this project is intentionally zero-build.
- Keep UI strings routed through `static/js/i18n.js` / `modules/i18n/index.js` (ja/en/zh).
- localStorage keys all prefixed `yomikikuan_` — documents (`yomikikuan_texts`), active doc (`yomikikuan_activeId`), theme, lang, fontSize, gemini API key / style, TTS engine, user profile, **ruby display mode** (`yomikikuan_ruby_mode`: `'true'` / absent). Don't wipe them during cache resets. If you rename any, add the old→new pair to `static/js/migrate-legacy-keys.js`. sessionStorage keys: `yomikikuan_logging_out` (logout in progress), `yomikikuan_sw_reloading` (one-shot flag the SW-update flow uses to break the `controllerchange` reload loop).
- Classic-script globals set by ESM modules for legacy callers: `window.YomikikuanDict` (from `js/dictionary.js`), `YomikikuanGetText` / `YomikikuanFormat` (from `modules/i18n/index.js`), `YomikikuanEvents` (from `modules/player/events.js`), `window.YomikikuanRuby = { isEnabled/enable/disable/toggle }` (from `main-js.js` — toggles ふりがな render mode). Debug helpers exposed by `tts.js`: `window.__geminiSynth(text, voiceName)`, `window.__prefetchGeminiTTS(text)` (read-ahead for next segment). Use these when hooking from `main-js.js` into ESM-owned features.
- **Playback pipeline boundary (load-bearing).** The playback state machine lives **only** in `main-js.js` — local `playSegments`, `speakWithPauses`, `playAllText`, `stopSpeaking`, `PLAY_STATE`, `isPlaying`, `setHeaderProgress`, `updatePlayButtonStates`, etc. are IIFE-locals, not `window.*` exports. `static/js/tts.js` is scoped to: engine selection (`window.setTTSEngine`/`getTTSEngine`), voice listing (`window.TTS`), Gemini synthesis (`geminiSynth` → `window.__geminiSynth`/`__prefetchGeminiTTS`), Gemini-TTS settings-panel injection, and the `window.speechSynthesis` **shim** whose `.speak(utter)` transparently routes classic `SpeechSynthesisUtterance` calls to either native Web Speech or Gemini + Audio element (with utterance event bridging). Do **not** reintroduce mirror `window.playAllText`/`playSegments`/`speakWithPauses` exports in `tts.js` — they previously existed and silently broke because they depended on locals `main-js.js` never exposed. If you need to influence playback from `tts.js`, extend the shim or the Gemini prefetch helper.
- IndexedDB stores: `yomikikuan-tokens` (segmenter cache, 60-day TTL), `yomikikuan-tts` (TTS audio cache, 30-day TTL; also mirrored by an in-memory LRU of 50 entries in `tts.js` that `URL.revokeObjectURL`s on eviction). Both are pure caches; safe to drop.
- **Service-worker deploy contract.** `service-worker.js` deliberately does NOT call `self.skipWaiting()` in `install` — a new worker waits until the page posts `{ type: 'SKIP_WAITING' }`. `main-js.js` runs an update watcher that registers the SW on every load, shows an Apple-style `.ap-update-toast` (right-bottom, blue `刷新` button) when a new version reaches `installed` state while a current worker is still in control, then posts `SKIP_WAITING` and reloads on `controllerchange`. **Every deploy that changes any cached asset MUST bump `CACHE_VERSION` in `service-worker.js` (`'v2'` → `'v3'` → …)**, otherwise the activate-sweep won't purge the stale bucket and users never see the new code.
- Backup export filenames: `yomikikuan-backup-<timestamp>.json` (schema `{app, version, createdAt, ...}`). `version` is the schema compat key; bump if you change structure.
- Mobile styles gate on `max-width: 768px` and `max-width: 480px` — test both.
- Brand references: display name `読み聞く庵` (Japanese UI) or `YomiKiku-an` (latin contexts). Package/npm name is `yomikiku-an`. Repo: `github.com/LeiGaoRobot/yomikiku-an`.
