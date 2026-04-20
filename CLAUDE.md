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
- localStorage keys all prefixed `yomikikuan_` — documents (`yomikikuan_texts`), active doc (`yomikikuan_activeId`), theme, lang, fontSize, gemini API key / style, TTS engine, user profile. Don't wipe them during cache resets. If you rename any, add the old→new pair to `static/js/migrate-legacy-keys.js` (same for sessionStorage `yomikikuan_logging_out`).
- Classic-script globals set by ESM modules for legacy callers: `window.YomikikuanDict` (from `js/dictionary.js`), `YomikikuanGetText` / `YomikikuanFormat` (from `modules/i18n/index.js`), `YomikikuanEvents` (from `modules/player/events.js`). Use these when hooking from `main-js.js` into ESM-owned features.
- IndexedDB stores: `yomikikuan-tokens` (segmenter cache, 60-day TTL), `yomikikuan-tts` (TTS audio cache). Both are pure caches; safe to drop.
- Backup export filenames: `yomikikuan-backup-<timestamp>.json` (schema `{app, version, createdAt, ...}`). `version` is the schema compat key; bump if you change structure.
- Mobile styles gate on `max-width: 768px` and `max-width: 480px` — test both.
- Brand references: display name `読み聞く庵` (Japanese UI) or `YomiKiku-an` (latin contexts). Package/npm name is `yomikiku-an`. Repo: `github.com/LeiGaoRobot/yomikiku-an`.
