# YomiKiku-an（読み聞く庵）

Browser-based Japanese text analysis tool: Kuromoji.js segmentation, POS tagging, kana/romaji, Web Speech API TTS, JMdict integration, EasyMDE markdown editor, multi-document storage, PWA.

## Stack

- **Pure static site** — no build step, no framework. HTML + vanilla JS + CSS.
- Entry: `index.html` → loads `static/main-js.js` (monolith) + `static/js/modules/*` (new modular code) + `static/js/tts.js`, `static/js/i18n.js`, `static/segmenter.js`.
- Styles: `static/styles.css` (base), `static/theme-apple.css` (overlay), `static/mobile.css` (≤768px).
- Service worker: `service-worker.js`.
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
- localStorage keys of note: `texts` (documents), `activeId` (current doc). Don't wipe them during cache resets.
- Mobile styles gate on `max-width: 768px` and `max-width: 480px` — test both.
