# analyzer

Reading Analyzer module. See `docs/plans/2026-04-21-reading-analyzer-design.md`.

- `index.js` — public API: `analyzeDocument(doc)`, `expandSentence(sentenceEl, text, context)`, `glossWord(word, sentence)`
- `providers/` — LLM provider abstraction
- `local/` — non-network analyzers (difficulty, syntax)
- `cache/` — IndexedDB + doc-pin persistence
- `ui/` — inline card, badge, list swatch
