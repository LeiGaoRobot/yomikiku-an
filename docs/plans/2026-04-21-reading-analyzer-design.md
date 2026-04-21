# Reading Analyzer — Design

**Date:** 2026-04-21
**Status:** Approved, pending implementation plan
**Scope:** Add input-content parsing & reading-assistance features to YomiKiku-an

## Goals

Combine four analysis capabilities into a single feature family ("Reading Analyzer"):

- **A. Sentence-level syntax structure** — subject/predicate/object/modifier/conjunction tagging to help parse long sentences
- **B. AI explanation** — Gemini-generated translation + grammar notes + inline vocabulary for selected sentences
- **C. Difficulty analysis** — JLPT N1–N5 vocab distribution, kanji histogram, sentence length, reading time estimate
- **D. Contextual gloss** — AI-assisted word-sense disambiguation layered on top of existing JMdict lookup

## Decisions

| # | Decision | Chosen | Reason |
|---|----------|--------|--------|
| 1 | Trigger model | Hybrid: C auto on document load; A/B/D on-demand per sentence/word | Keep initial cost low, avoid surprising the user with LLM spend |
| 2 | UI surface | Inline expansion cards below clicked sentence | Preserves reading flow, mobile-friendly, avoids panel crowding |
| 3 | Backend | Reuse existing Gemini API key (`yomikikuan_gemini_api_key`); abstract `ReadingAnalyzer` provider interface for future Claude / OpenAI | Matches current infra, keeps migration path open |
| 4 | Cache | IndexedDB (`yomikikuan-analysis`) default + opt-in "pin to document" persistence in `doc.analysis.pinnedSentences` | Fast by default, deliberate for sync/backup payload growth |
| 5 | Difficulty surface | Document list color badge + header badge (click to expand detail) | Dual touchpoint: scanning docs and drilling into current one |

## Architecture

New module `static/js/modules/analyzer/`:

```
analyzer/
├── index.js                 # Public API: analyzeDocument, expandSentence, glossWord
├── providers/
│   ├── base.js              # ReadingAnalyzer abstract interface
│   ├── gemini.js            # MVP: analyzeSentence, glossWord via existing Gemini key
│   ├── mock.js              # Deterministic fixture for UI dev (?analyzer=mock)
│   └── registry.js          # Provider lookup + selection
├── local/
│   ├── difficulty.js        # Kuromoji + JMdict freq + JLPT kanji tables → level/vocab/kanji/stats
│   └── syntax.js            # POS + rule-based tagging: subject/predicate/object/modifier/conjunction
├── cache/
│   ├── idb.js               # yomikikuan-analysis store (30-day TTL, LRU 500)
│   └── pin.js               # Write/read doc.analysis.pinnedSentences
└── ui/
    ├── inlineCard.js        # Click-to-expand sentence card + tabs (Structure / Explanation / Vocab)
    ├── badge.js             # Header difficulty badge + detail popover
    └── listSwatch.js        # Document list difficulty color block
```

**Boundary rules:**

- Analyzer module writes to exactly two external locations: IndexedDB (`yomikikuan-analysis` store) and the optional `doc.analysis` field on documents. No playback state, no TTS coupling.
- Syntax (A) is local-only in MVP. LLM provides more accurate grammar notes as part of the "Explanation" tab.
- Public API consumed from `main-js.js` via `window.YomikikuanAnalyzer` (classic-script bridge pattern consistent with existing `YomikikuanDict`, `YomikikuanRuby`, etc.).

## Data Flow

### On document load (automatic, local only)

1. `app.js` calls `analyzer.analyzeDocument(doc)`.
2. `local/difficulty.js` runs synchronously after Kuromoji is ready (<200ms for ~1000 chars).
3. Result cached in memory + IndexedDB keyed by `hash(doc.content)`.
4. Header badge and document list swatch subscribe and refresh.

### On sentence click (on-demand)

1. Sentence DOM captures click → `analyzer.expandSentence(sentenceEl, text)`.
2. Inline card skeleton inserted below the sentence with loading state.
3. Parallel dispatch:
   - Local `syntax.js` (synchronous) populates **Structure** tab immediately.
   - `GeminiProvider.analyzeSentence({ text, context: [prev, next] })` (async) populates **Explanation** tab.
4. Result written to IndexedDB; subsequent clicks on same sentence hit cache instantly.
5. User may click **Pin to document** to persist into `doc.analysis.pinnedSentences[hash]`.

### On word click (existing flow + opt-in AI)

- Existing JMdict popup unchanged.
- Add "AI gloss" button → `GeminiProvider.glossWord({ word, sentence })` → appends contextual sense to popup.

### Concurrency & throttling

- Max 2 concurrent LLM requests; third request queues.
- During playback, auto AI requests are **disabled by default** (setting `yomikikuan_analyzer_autoplay_preanalyze`, default off). User-initiated clicks always execute.
- Each card holds an `AbortController`; closing the card or switching documents cancels in-flight requests.

## Inline Card UI

```
[▼ Highlighted clicked sentence]
  ├─ Tab: Structure   ← local syntax tagging, instant
  ├─ Tab: Explanation ← AI translation + grammar + vocab, on-demand
  └─ Tab: Keywords    ← N1/N2-level words + rare kanji from sentence
  [Pin to document]   ← persists into doc.analysis.pinnedSentences
```

- Mobile (≤480px): tabs become horizontally scrollable; card width matches reading area.
- Card animation: fade+slide 150ms; respects `prefers-reduced-motion`.

## Storage

### IndexedDB: `yomikikuan-analysis` store

- **Key:** `sha1(sentenceText + '|' + providerId + '|' + schemaVersion)`
- **Value:** `{ text, result: { translation, grammar, vocab, syntaxTree }, provider, createdAt, ttl }`
- **TTL:** 30 days (matches `yomikikuan-tts`)
- **LRU cap:** 500 entries
- Cohabits same IndexedDB database as `yomikikuan-tokens` and `yomikikuan-tts`; DB version bumps on first load.

### Document schema extension (`yomikikuan_texts[i]`)

```js
{
  id, title, content, createdAt, updatedAt,   // existing fields unchanged
  analysis: {                                  // new, optional
    difficulty: {
      level,              // 'n1' | 'n2' | 'n3' | 'n4' | 'n5' | 'n/a'
      vocab,              // { n1, n2, n3, n4, n5, unknown } counts
      kanjiHistogram,     // { jlpt_grade: count }
      avgSentenceLen,
      readingTimeMin,
      computedAt
    },
    pinnedSentences: {     // user explicitly pinned; bounded
      [hash]: { text, result, pinnedAt }
    }
  }
}
```

- **Pinned-sentence cap:** 200 per document. Exceeding prompts user to clean up. Prevents Firestore doc bloat.

### Backup compatibility

- `backup.version` incremented by 1.
- Old-version backup import: `analysis` field is `undefined`; UI shows "not analyzed"; first document open triggers local difficulty analysis.
- New-version backup into old code: unknown `analysis` field ignored, no data loss.

### localStorage additions

- `yomikikuan_analyzer_provider` — `'gemini'` (MVP; reserved for multi-provider)
- `yomikikuan_analyzer_autoplay_preanalyze` — `'true'` or absent (default off)
- Reuses `yomikikuan_gemini_api_key`.

### i18n

New strings added under `static/js/modules/i18n/` for ja/en/zh: tab titles, badge copy, error messages, settings labels, pin-limit warning.

## Error Handling & Degradation

| Scenario | Behavior |
|----------|----------|
| Gemini call fails | Structure tab still works; Explanation tab shows red retry banner; error detail in `title` attr |
| No API key | Explanation tab shows inline CTA linking to Settings' Gemini section |
| 429 / quota error | Pause all AI requests 5 min; one-shot top toast; local analysis unaffected |
| Kuromoji not yet loaded | Card shows "segmenter loading…", retries once when `window.kuromojiReady` resolves |
| Non-Japanese input | `difficulty.level = 'n/a'`; badge hidden; no error surfaced |
| Sentence text edited | Old hash key no longer matches → natural cache miss; old entry ages out via TTL/LRU |
| Provider switch / schema bump | Cache keys partition by `providerId` + `schemaVersion`; old buckets naturally LRU out |
| Card closed mid-request | `AbortController.abort()` cancels all in-flight requests for that card |
| Any local analysis exception | Silently swallowed + `console.warn`; **never blocks main reading flow** |

## Testing

Project has no test framework and intentionally stays zero-build. Testing remains manual + fixture-based.

### Manual smoke checklist (PR self-check)

- [ ] Short document (<500 chars) → badge appears within 300ms, level reasonable
- [ ] Long document (>5000 chars) → no UI jank; analysis chunked via `requestIdleCallback`
- [ ] Non-Japanese document → badge hidden, no console errors
- [ ] No API key → click sentence → Structure tab renders, Explanation tab shows CTA
- [ ] With API key → click sentence → Explanation fills within 2–5s; second click hits cache instantly
- [ ] Click sentence during playback → TTS uninterrupted
- [ ] Pin a sentence → export backup → clear cache → import → pin persists
- [ ] List swatch level matches header badge level
- [ ] Switch ja/en/zh → all new copy follows language
- [ ] Mobile (≤480px) → inline card does not overflow; tabs scrollable
- [ ] Mobile (≤768px) → tap targets ≥44px

### Optional fixtures

- `static/js/modules/analyzer/local/difficulty.test.html` — plain browser page with fixed inputs to eyeball JLPT output stability. Matches project's no-runner convention.

### Provider mock

- `providers/mock.js` serves deterministic fake data. Enable via `?analyzer=mock` URL param. Lets UI work happen without burning tokens.

### Regression guardrails

- Bump `CACHE_VERSION` in `service-worker.js` (new JS files added to cache list).
- Bump backup `version` field.
- `migrate-legacy-keys.js` untouched (no renames).

## Out of scope (MVP)

- Multi-provider runtime switching UI — only structural provisioning
- Full dependency parsing — rule-based tagging only
- Batch "analyze all sentences" button — on-demand only, to control spend
- Cross-document analytics dashboard
- Export of pinned analyses as flashcards (candidate for later)

## Open items for implementation plan

- Exact JLPT vocab source (JMdict freq tags vs. external JLPT list file) — resolve during writing-plans phase
- Kanji JLPT grade table sourcing
- Prompt template for Gemini `analyzeSentence` — iterate during build
- Inline card CSS — match existing theme-apple.css tokens

## Deviations from original design

### 2026-04-21 — JLPT kanji data source

Original plan cited `tanakh/jlpt-kanji-list` (CC0). That GitHub repository no longer exists (all five raw-file URLs return 404; repo root 404; no forks or mirrors located under the same name). Switched Task 3 to **`davidluzgouveia/kanji-data`** (MIT license, actively maintained, JSON format with explicit JLPT levels). License-compatibility still permissive; schema equivalent once flattened to the `{ [kanji]: level }` shape the analyzer consumes. No impact on the design itself — only the sourcing step changes.

### 2026-04-21 — Click unit is `.line-container`, not sentence

Design prose refers to "click a sentence → mount card". The existing render pipeline (`static/segmenter.js` line 355; `main-js.js` line 4544) splits input **only on `\n`**, never on `。/!/?`. The DOM produces `.line-container` elements, one per source line. For the typical Japanese practice corpus (one sentence per line) this is identical to sentence-level granularity; for dense paragraph input a line may contain multiple sentences, and the card will analyze the whole line as the "sentence". The LLM prompt still receives `{ text, prev, next }` as three line strings — semantically equivalent context from Gemini's POV. Re-splitting on punctuation inside lines was considered and rejected for MVP because it would require restructuring `.line-container` rendering and the playback highlight path, and those are out of scope under the CLAUDE.md playback-boundary constraint. If line-level ever proves too coarse for user feedback, a follow-up can emit `.sentence` wrappers inside each `.line-container` without disturbing playback.

### 2026-04-21 — Kuromoji accessor

Plan assumed `window.kuromojiReady` promise. Actual global is `window.kuromoji.builder({dicPath}).build(cb)`. Analyzer builds and memoizes its own tokenizer in `static/js/modules/analyzer/local/tokenizer.js`. Acceptable memory cost (~30MB duplicate dict buffers); if constraint pressure later emerges, expose a tokenizer getter on `window.JapaneseSegmenter` and consume from there.
