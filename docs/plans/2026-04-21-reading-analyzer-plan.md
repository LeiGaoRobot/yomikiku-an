# Reading Analyzer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Reading Analyzer feature family (sentence syntax, AI explanation, difficulty scoring, contextual gloss) as documented in `docs/plans/2026-04-21-reading-analyzer-design.md`.

**Architecture:** New ESM module tree at `static/js/modules/analyzer/` with a `Provider` abstraction (Gemini MVP + mock), local analyzers (difficulty, syntax), IndexedDB cache, and three UI components (inline sentence card, header badge, document-list swatch). Integration via `window.YomikikuanAnalyzer` classic-script bridge consumed by `main-js.js`.

**Tech Stack:** Vanilla ESM (no bundler), IndexedDB, existing Kuromoji segmenter, existing Gemini REST (`generativelanguage.googleapis.com`), existing i18n layer, existing theme-apple CSS tokens.

---

## Pre-flight

Before starting, read:
- `docs/plans/2026-04-21-reading-analyzer-design.md` — full design rationale
- `CLAUDE.md` — especially the "Playback pipeline boundary (load-bearing)" warning. **Do not** touch playback code.
- `static/js/modules/app.js` — ESM bootstrap pattern
- `static/js/tts.js` — example of how existing code reads `yomikikuan_gemini_api_key` and calls Gemini REST

**Anchors you'll reuse:**
- Docs API: `window.documentManager.getAllDocuments()`, `.getActiveId()`, `.saveActiveContent(content)`. Do NOT touch raw `localStorage['yomikikuan_texts']` except during backup import/export paths.
- i18n: `YomikikuanGetText('key.path', fallback)` and `YomikikuanFormat('key', { var: val })` are globals set by `modules/i18n/index.js`.
- Kuromoji: after load, `window.kuromojiReady` resolves with the tokenizer instance (verify exact accessor in `static/segmenter.js` before use).
- PWA asset manifest: `static/pwa-assets.json` — **every new file served by the app must be listed here** so offline install works.
- Service worker: `service-worker.js` line 13, `const CACHE_VERSION = 'v2';` — bump to `'v3'` in the final task.

**Verification model:** This project has no test runner and intentionally stays zero-build. Each task's verification step is either (a) a small HTML fixture page under the file's directory, or (b) a manual browser smoke check. Keep `?analyzer=mock` working throughout so UI tasks never need a real Gemini key.

---

## Phase 1 — Local foundation (no network, no UI)

### Task 1: Scaffold module tree and public API stub

**Files:**
- Create: `static/js/modules/analyzer/index.js`
- Create: `static/js/modules/analyzer/README.md` (one-paragraph pointer to design doc)
- Modify: `static/js/modules/app.js` (add import)
- Modify: `static/pwa-assets.json` (register new file)

**Step 1: Create `static/js/modules/analyzer/index.js`**

```js
// Reading Analyzer — public API. See docs/plans/2026-04-21-reading-analyzer-design.md
// Classic-script consumers use window.YomikikuanAnalyzer (wired up at end of this file).

const SCHEMA_VERSION = 1;

const api = {
  SCHEMA_VERSION,
  async analyzeDocument(doc) { return null; },          // filled by Task 4
  async expandSentence(sentenceEl, text, context) { return null; }, // filled by Task 12
  async glossWord(word, sentence) { return null; },     // filled by Task 15
};

if (typeof window !== 'undefined') {
  window.YomikikuanAnalyzer = api;
}

export default api;
```

**Step 2: Create `static/js/modules/analyzer/README.md`**

```markdown
# analyzer

Reading Analyzer module. See `docs/plans/2026-04-21-reading-analyzer-design.md`.

- `index.js` — public API (`analyzeDocument`, `expandSentence`, `glossWord`)
- `providers/` — LLM provider abstraction
- `local/` — non-network analyzers (difficulty, syntax)
- `cache/` — IndexedDB + doc-pin persistence
- `ui/` — inline card, badge, list swatch
```

**Step 3: Import from `app.js`**

Edit `static/js/modules/app.js`: add `import './analyzer/index.js';` near the other module imports.

**Step 4: Register in PWA manifest**

Edit `static/pwa-assets.json`: append `"static/js/modules/analyzer/index.js"` to the `assets` array. Do not bump `CACHE_VERSION` yet — batched at the end.

**Step 5: Verify**

Start `npm start`, open `http://localhost:8000/?clear=1`. In DevTools console run `window.YomikikuanAnalyzer.SCHEMA_VERSION`. Expected: `1`.

**Step 6: Commit**

```bash
git add static/js/modules/analyzer/ static/js/modules/app.js static/pwa-assets.json
git commit -m "feat(analyzer): scaffold module + public API stub"
```

---

### Task 2: IndexedDB cache store

**Files:**
- Create: `static/js/modules/analyzer/cache/idb.js`
- Create: `static/js/modules/analyzer/cache/idb.test.html` (dev fixture)

**Step 1: Write `cache/idb.js`**

```js
// yomikikuan-analysis IndexedDB store. 30-day TTL, LRU 500 entries.
const DB_NAME = 'yomikikuan';
const DB_VERSION = 1;
const STORE = 'analysis';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LRU_CAP = 500;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'key' });
        s.createIndex('lastAccess', 'lastAccess');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function hashKey(text, providerId, schemaVersion) {
  const enc = new TextEncoder().encode(`${text}|${providerId}|${schemaVersion}`);
  const buf = await crypto.subtle.digest('SHA-1', enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function get(text, providerId, schemaVersion) {
  try {
    const db = await openDb();
    const key = await hashKey(text, providerId, schemaVersion);
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        if (!row) return resolve(null);
        if (Date.now() - row.createdAt > TTL_MS) {
          store.delete(key);
          return resolve(null);
        }
        row.lastAccess = Date.now();
        store.put(row);
        resolve(row.result);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[analyzer/cache] get failed', err);
    return null;
  }
}

export async function put(text, providerId, schemaVersion, result) {
  try {
    const db = await openDb();
    const key = await hashKey(text, providerId, schemaVersion);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        key, text, providerId, schemaVersion, result,
        createdAt: Date.now(), lastAccess: Date.now(),
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await evictIfNeeded();
  } catch (err) {
    console.warn('[analyzer/cache] put failed', err);
  }
}

async function evictIfNeeded() {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - LRU_CAP;
      if (excess <= 0) return resolve();
      const idx = store.index('lastAccess');
      let removed = 0;
      idx.openCursor().onsuccess = (ev) => {
        const cur = ev.target.result;
        if (!cur || removed >= excess) return resolve();
        cur.delete();
        removed++;
        cur.continue();
      };
    };
  });
}

export async function clearAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
```

**Step 2: Write `cache/idb.test.html` fixture**

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>idb cache test</title></head>
<body>
<pre id="out">running…</pre>
<script type="module">
import { get, put, clearAll } from './idb.js';
const out = document.getElementById('out');
const log = (...a) => { out.textContent += '\n' + a.join(' '); };
try {
  await clearAll();
  console.assert(await get('hello', 'mock', 1) === null, 'empty miss');
  await put('hello', 'mock', 1, { translation: 'hi' });
  const r = await get('hello', 'mock', 1);
  console.assert(r && r.translation === 'hi', 'roundtrip');
  log('PASS');
} catch (e) { log('FAIL', e.message); }
</script>
</body></html>
```

**Step 3: Verify**

Open `http://localhost:8000/static/js/modules/analyzer/cache/idb.test.html`. Expected: `running…\nPASS`.

**Step 4: Add to PWA manifest**

Append `"static/js/modules/analyzer/cache/idb.js"`. Fixture HTML stays out.

**Step 5: Commit**

```bash
git add static/js/modules/analyzer/cache/ static/pwa-assets.json
git commit -m "feat(analyzer): IndexedDB cache store with TTL + LRU"
```

---

### Task 3: JLPT data tables

**Files:**
- Create: `static/js/modules/analyzer/local/jlpt-kanji.js`
- Create: `static/js/modules/analyzer/local/jlpt-vocab.js`
- Possibly modify: `static/js/dictionary.js` (expose `lookupFreq` if missing)

**Context:** JLPT level data is a one-time static drop. Vocab is large — use JMdict's existing frequency priority tags as a proxy and hand-curate the N4/N5 core list (~500 words) for accuracy at low levels. Full N1–N2 coverage comes from JMdict freq bands.

**Step 1: Create `local/jlpt-kanji.js`**

Source: tanakh/jlpt-kanji-list (CC0). Flatten to `{ [kanji]: 'N5' | 'N4' | ... }`. Given ~2000 entries, inline as a JSON object literal.

```js
// JLPT kanji grade map. Source: jlpt-kanji-list (CC0).
export const KANJI_GRADE = Object.freeze({
  // N5 ~80 kanji (fill during implementation)
  '日': 'N5', '本': 'N5', '人': 'N5', /* ... */
});

export function kanjiGrade(ch) {
  return KANJI_GRADE[ch] || null;
}
```

**Step 2: Create `local/jlpt-vocab.js`**

```js
const CORE_N5 = new Set([
  'です', 'ます', '私', 'あなた', '学校', '先生', /* ~500 entries */
]);
const CORE_N4 = new Set([ /* ~500 entries */ ]);

export function classifyWord(lemma, posTag) {
  if (CORE_N5.has(lemma)) return 'N5';
  if (CORE_N4.has(lemma)) return 'N4';
  const freq = queryJMdictFreq(lemma);
  if (freq == null) return 'unknown';
  if (freq <= 10000) return 'N3';
  if (freq <= 25000) return 'N2';
  return 'N1';
}

function queryJMdictFreq(lemma) {
  try {
    const dict = window.YomikikuanDict;
    if (!dict || !dict.lookupFreq) return null;
    return dict.lookupFreq(lemma);
  } catch (_) {
    return null;
  }
}
```

**Step 3: Verify `YomikikuanDict.lookupFreq` exists**

If not exposed, add it. Read `static/js/dictionary.js`, find the existing lookup, expose a `lookupFreq(lemma)` returning freq rank or null. Same commit.

**Step 4: Quick console check**

```js
const { classifyWord } = await import('/static/js/modules/analyzer/local/jlpt-vocab.js');
classifyWord('です', '助動詞');   // → 'N5'
classifyWord('完璧', '名詞');     // → 'N2' or 'N1'
```

**Step 5: Register + commit**

```bash
git add static/js/modules/analyzer/local/jlpt-*.js static/pwa-assets.json static/js/dictionary.js
git commit -m "feat(analyzer): JLPT kanji + vocab grade tables"
```

---

### Task 4: Difficulty analyzer

**Files:**
- Create: `static/js/modules/analyzer/local/difficulty.js`
- Create: `static/js/modules/analyzer/local/difficulty.test.html`
- Modify: `static/js/modules/analyzer/index.js` (fill `analyzeDocument`)

**Step 1: Implement**

```js
import { classifyWord } from './jlpt-vocab.js';
import { kanjiGrade } from './jlpt-kanji.js';

const JAPANESE_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

export async function analyzeDifficulty(text) {
  if (!text || !JAPANESE_RE.test(text)) {
    return { level: 'n/a', vocab: null, kanjiHistogram: null, avgSentenceLen: 0, readingTimeMin: 0, computedAt: Date.now() };
  }
  const tokens = await tokenize(text);
  const vocab = { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0, unknown: 0 };
  for (const t of tokens) {
    const cls = classifyWord(t.basic_form || t.surface_form, t.pos);
    vocab[cls]++;
  }
  const kanjiHistogram = { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0, unknown: 0 };
  for (const ch of text) {
    if (ch >= '\u4E00' && ch <= '\u9FFF') {
      const g = kanjiGrade(ch);
      kanjiHistogram[g || 'unknown']++;
    }
  }
  const sentences = text.split(/[。！？\n]+/).filter((s) => s.trim());
  const avgSentenceLen = sentences.length ? Math.round(text.length / sentences.length) : 0;
  const readingTimeMin = Math.max(1, Math.round(text.length / 400));
  return {
    level: pickLevel(vocab, kanjiHistogram),
    vocab, kanjiHistogram, avgSentenceLen, readingTimeMin,
    computedAt: Date.now(),
  };
}

function pickLevel(vocab, kanji) {
  const total = Object.values(vocab).reduce((a, b) => a + b, 0) || 1;
  const share = (bucket) => bucket.reduce((a, k) => a + (vocab[k] || 0), 0) / total;
  if (share(['N1']) > 0.05 || (kanji.N1 || 0) > 3) return 'n1';
  if (share(['N1', 'N2']) > 0.1) return 'n2';
  if (share(['N1', 'N2', 'N3']) > 0.15) return 'n3';
  if (share(['N1', 'N2', 'N3', 'N4']) > 0.25) return 'n4';
  return 'n5';
}

async function tokenize(text) {
  const tokenizer = await window.kuromojiReady;
  return tokenizer.tokenize(text);
}
```

**Step 2: Fixture page** `difficulty.test.html` — loads Kuromoji, prints outputs for:
- `"これは本です。"` → `level: 'n5'`
- `"経済政策の根幹を揺るがす事態となった。"` → `level: 'n2'` or higher
- `"Hello world"` → `level: 'n/a'`

**Step 3: Wire into `analyzer/index.js`**

```js
import { analyzeDifficulty } from './local/difficulty.js';
// replace the stub:
async analyzeDocument(doc) {
  if (!doc || !doc.content) return null;
  const difficulty = await analyzeDifficulty(doc.content);
  return { difficulty };
}
```

**Step 4: Register + commit**

```bash
git add static/js/modules/analyzer/ static/pwa-assets.json
git commit -m "feat(analyzer): local difficulty analyzer"
```

---

### Task 5: Rule-based syntax tagger

**Files:**
- Create: `static/js/modules/analyzer/local/syntax.js`
- Create: `static/js/modules/analyzer/local/syntax.test.html`

**Step 1: Implement** (rule-based tagging only, not full parse)

Tag each token with one of: `subject | predicate | object | modifier | conjunction | other`. Rules:
- 助詞 `が`/`は` preceded by 名詞 → mark the 名詞 as `subject`
- 助詞 `を` preceded by 名詞 → mark 名詞 as `object`
- 動詞/形容詞 in sentence-final position → `predicate`
- 連体形 before 名詞 → whole phrase is `modifier`
- 接続助詞 (`が`, `ので`, `から`, `て`) or 接続詞 → `conjunction`
- Otherwise `other`

Return:

```js
{
  tokens: [{ surface, pos, role, readingKana }, ...],
  phrases: [],  // MVP empty; kept for future expansion
}
```

**Step 2: Fixture** — test a few sentences, eyeball output in a table.

**Step 3: Commit**

```bash
git commit -m "feat(analyzer): rule-based syntax tagger"
```

---

### Task 6: Provider base + registry

**Files:**
- Create: `static/js/modules/analyzer/providers/base.js`
- Create: `static/js/modules/analyzer/providers/registry.js`

**Step 1: `base.js`**

```js
/**
 * @typedef {Object} AnalyzeSentenceInput
 * @property {string} text
 * @property {{prev?: string, next?: string}=} context
 * @property {AbortSignal=} signal
 */
export function createProvider(config) {
  return Object.freeze(config);
}
```

**Step 2: `registry.js`**

```js
const providers = new Map();
let activeId = 'gemini';

export function register(provider) { providers.set(provider.id, provider); }
export function setActive(id) { activeId = id; }
export function getActive() {
  if (new URLSearchParams(location.search).get('analyzer') === 'mock' && providers.has('mock')) {
    return providers.get('mock');
  }
  return providers.get(activeId) || null;
}
```

**Step 3: Register + commit**

```bash
git commit -m "feat(analyzer): provider base + registry"
```

---

### Task 7: Mock provider

**Files:**
- Create: `static/js/modules/analyzer/providers/mock.js`
- Modify: `static/js/modules/analyzer/index.js` (import mock)

**Step 1: Implement**

```js
import { createProvider } from './base.js';
import { register } from './registry.js';

const mock = createProvider({
  id: 'mock',
  async analyzeSentence({ text, signal }) {
    await delay(500, signal);
    return {
      translation: `[mock translation] ${text}`,
      grammarPoints: ['mock: ～は～です pattern', 'mock: past tense'],
      vocab: [{ word: text.slice(0, 2), gloss: '[mock gloss]' }],
    };
  },
  async glossWord(word, _sentence, signal) {
    await delay(300, signal);
    return `[mock contextual gloss for ${word}]`;
  },
});

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
  });
}

register(mock);
export default mock;
```

**Step 2: Import from `analyzer/index.js`**

```js
import './providers/mock.js';
```

**Step 3: Verify** — `http://localhost:8000/?analyzer=mock`; console:

```js
import('/static/js/modules/analyzer/providers/registry.js').then(r => r.getActive().analyzeSentence({ text: 'テスト' })).then(console.log);
```

**Step 4: Commit**

```bash
git commit -m "feat(analyzer): mock provider for UI dev"
```

---

### Task 8: Gemini provider

**Files:**
- Create: `static/js/modules/analyzer/providers/gemini.js`
- Modify: `static/js/modules/analyzer/index.js` (import)

**Step 1: Implement**

```js
import { createProvider } from './base.js';
import { register } from './registry.js';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function apiKey() {
  return localStorage.getItem('yomikikuan_gemini_api_key') || '';
}

const PROMPT_ANALYZE = (text, ctx) => `You are a JLPT tutor. Analyze this Japanese sentence for a learner. Return strict JSON with keys: translation (English), grammarPoints (array of short strings), vocab (array of {word, gloss}).

Sentence: ${text}
${ctx?.prev ? `Previous sentence: ${ctx.prev}` : ''}
${ctx?.next ? `Next sentence: ${ctx.next}` : ''}

Return ONLY the JSON object, no markdown fences.`;

const PROMPT_GLOSS = (word, sentence) => `In this Japanese sentence, what does "${word}" mean IN CONTEXT? Be concise, one English sentence.

Sentence: ${sentence}
Return just the gloss, no quotes.`;

async function callGemini(prompt, signal) {
  const key = apiKey();
  if (!key) throw new Error('NO_API_KEY');
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    signal,
  });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseJson(raw) {
  const cleaned = raw.trim().replace(/^```json\s*|```$/g, '');
  return JSON.parse(cleaned);
}

const gemini = createProvider({
  id: 'gemini',
  async analyzeSentence({ text, context, signal }) {
    const raw = await callGemini(PROMPT_ANALYZE(text, context), signal);
    try { return parseJson(raw); }
    catch (_) { return { translation: raw, grammarPoints: [], vocab: [] }; }
  },
  async glossWord(word, sentence, signal) {
    return (await callGemini(PROMPT_GLOSS(word, sentence), signal)).trim();
  },
});

register(gemini);
export default gemini;
```

**Step 2: Register + verify** — with real API key set:

```js
import('/static/js/modules/analyzer/providers/registry.js').then(r => r.getActive().analyzeSentence({ text: '今日は良い天気です。' })).then(console.log);
```

**Step 3: Commit**

```bash
git commit -m "feat(analyzer): Gemini provider"
```

---

### Task 9: Cache + concurrency integration

**Files:**
- Create: `static/js/modules/analyzer/concurrency.js`
- Modify: `static/js/modules/analyzer/index.js`

**Step 1: Concurrency limiter**

```js
export function createLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];
  return async function run(fn, signal) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    if (active >= maxConcurrent) await new Promise((resolve) => queue.push(resolve));
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    active++;
    try { return await fn(); }
    finally { active--; const next = queue.shift(); if (next) next(); }
  };
}
```

**Step 2: Wire into `index.js`**

Import `cache/idb.js` + `providers/registry.js` + `concurrency.js`. Cache-check then provider-call wrapped in limiter(2). Use `SCHEMA_VERSION` constant from top of file, `providerId` from `registry.getActive().id`.

**Step 3: Commit**

```bash
git commit -m "feat(analyzer): cache + concurrency wiring"
```

---

### Task 10: Document-pin persistence

**Files:**
- Create: `static/js/modules/analyzer/cache/pin.js`

**Step 1: Implement**

```js
const PIN_CAP = 200;

export async function pin(docId, hash, text, result) {
  const dm = window.documentManager;
  if (!dm) throw new Error('documentManager not ready');
  const doc = dm.getAllDocuments().find((d) => d.id === docId);
  if (!doc) throw new Error('doc not found');
  doc.analysis = doc.analysis || {};
  doc.analysis.pinnedSentences = doc.analysis.pinnedSentences || {};
  const count = Object.keys(doc.analysis.pinnedSentences).length;
  if (count >= PIN_CAP && !doc.analysis.pinnedSentences[hash]) {
    throw new Error('PIN_LIMIT');
  }
  doc.analysis.pinnedSentences[hash] = { text, result, pinnedAt: Date.now() };
  await persistDocs(dm);
}

export async function unpin(docId, hash) {
  const dm = window.documentManager;
  const doc = dm?.getAllDocuments().find((d) => d.id === docId);
  if (!doc?.analysis?.pinnedSentences) return;
  delete doc.analysis.pinnedSentences[hash];
  await persistDocs(dm);
}

export function isPinned(docId, hash) {
  const dm = window.documentManager;
  const doc = dm?.getAllDocuments().find((d) => d.id === docId);
  return Boolean(doc?.analysis?.pinnedSentences?.[hash]);
}

async function persistDocs(dm) {
  // Call documentManager's existing persistence. Verify method name before use.
  if (typeof dm.save === 'function') return dm.save();
  if (typeof dm.persist === 'function') return dm.persist();
  // Last resort: direct write via the manager's storageKey
  localStorage.setItem('yomikikuan_texts', JSON.stringify(dm.getAllDocuments()));
}
```

**Step 2: Verify `documentManager` persistence method name**

Read `static/main-js.js` around line 2883 (`this.storageKey = LS.texts`) to find the save method. Adjust `persistDocs` accordingly.

**Step 3: Commit**

```bash
git commit -m "feat(analyzer): doc-pin persistence"
```

---

## Phase 2 — UI integration

### Task 11: Inline sentence card component

**Files:**
- Create: `static/js/modules/analyzer/ui/inlineCard.js`
- Create: `static/js/modules/analyzer/ui/inlineCard.css`
- Modify: `index.html` (link stylesheet)
- Modify: `static/pwa-assets.json`

**Step 1: `inlineCard.js`**

Exports `mountCard(sentenceEl, sentenceText, context)` → `{ destroy() }`.

Structure:
- `<div class="ap-analyzer-card">` inserted as sibling after `sentenceEl`
- Tabs: Structure / Explanation / Keywords (buttons + content panels)
- Pin button in footer
- Holds `AbortController`; `destroy()` aborts all requests + removes DOM
- Local `syntax.js` fills Structure immediately
- `window.YomikikuanAnalyzer` provider call fills Explanation
- All strings via `YomikikuanGetText`

**Step 2: CSS** — scoped to `.ap-analyzer-card`. Use existing `theme-apple.css` CSS variables. 150ms fade+slide; respect `prefers-reduced-motion`.

**Step 3: Mobile styles** — add a block in `static/mobile.css` (`@media (max-width: 480px)`): tabs horizontally scrollable; tap targets ≥44px.

**Step 4: Link CSS from `index.html`**

`<link rel="stylesheet" href="static/js/modules/analyzer/ui/inlineCard.css">` in `<head>` after `theme-apple.css`.

**Step 5: Commit**

```bash
git commit -m "feat(analyzer): inline sentence card UI"
```

---

### Task 12: Wire `expandSentence` + sentence click handler

**Files:**
- Modify: `static/js/modules/analyzer/index.js`
- Modify: `static/main-js.js` (sentence-rendering region; do NOT alter playback code)

**Step 1: Fill `expandSentence`**

```js
async expandSentence(sentenceEl, text, context) {
  const { mountCard } = await import('./ui/inlineCard.js');
  return mountCard(sentenceEl, text, context);
}
```

**Step 2: Add click delegation in `main-js.js`**

Locate the sentence-level DOM element in the analysis rendering section (grep for the element that wraps tokens into a sentence). Add a single delegated click listener on the reading container:

- Ignore clicks when `window.getSelection().toString()` is non-empty
- Ignore clicks inside `.ap-analyzer-card`
- Extract sentence text and neighbouring sentences
- Toggle card via `window.YomikikuanAnalyzer.expandSentence(...)` — second click destroys

**Forbidden**: do NOT add `window.playAllText` mirrors, do NOT touch `PLAY_STATE`, `playSegments`, or `speakWithPauses` (CLAUDE.md "Playback pipeline boundary").

**Step 3: Smoke check**

- `?analyzer=mock`: click a sentence → card appears, Structure populated, Explanation loads in 500ms
- Click same sentence again → card closes
- Start playback → click sentence → card opens; TTS continues uninterrupted
- With real Gemini key → real translation appears

**Step 4: Commit**

```bash
git commit -m "feat(analyzer): wire inline card to sentence clicks"
```

---

### Task 13: Header difficulty badge

**Files:**
- Create: `static/js/modules/analyzer/ui/badge.js`
- Create: `static/js/modules/analyzer/ui/badge.css`
- Modify: `index.html` (attach mount point in header if needed)

**Step 1: `badge.js`** — small pill (e.g. `N2 · 中級`) next to document title. Click → popover with vocab/kanji histogram + reading time.

**Step 2: Subscribe to doc-change** — grep `main-js.js` for the function that runs when the active document changes (look for `loadDocument`, `switchDoc`, or similar). On each change, call `window.YomikikuanAnalyzer.analyzeDocument(activeDoc)` and update badge.

**Step 3: Commit**

```bash
git commit -m "feat(analyzer): header difficulty badge"
```

---

### Task 14: Document list swatch

**Files:**
- Create: `static/js/modules/analyzer/ui/listSwatch.js`
- Modify: `static/main-js.js` (document list render — grep `folder-item` or the list rendering function)

**Step 1: Implement** — add a colored dot/pill to each sidebar list item by `doc.analysis.difficulty.level`. Colors N5 green → N1 red (define 5 CSS vars in `inlineCard.css` or a shared `analyzer/ui/tokens.css`).

**Step 2: Lazy compute** — any doc without cached `analysis.difficulty` → background `analyzer.analyzeDocument(doc)` via `requestIdleCallback`; write back via pin-style persist.

**Step 3: Commit**

```bash
git commit -m "feat(analyzer): document list difficulty swatch"
```

---

### Task 15: AI gloss button in JMdict popup

**Files:**
- Modify: `static/main-js.js` (JMdict popup rendering — grep `YomikikuanDict` usage)

**Step 1: Add "AI 释义" button** in the dictionary popup footer. On click → spinner → call `window.YomikikuanAnalyzer.glossWord(word, sentence)` → append result row.

**Step 2: Fill `glossWord` in analyzer index.js** — delegate to active provider's `glossWord`, with cache lookup first.

**Step 3: No-API-key fallback** — button disabled with tooltip via `YomikikuanGetText('analyzer.needsKey')`.

**Step 4: Commit**

```bash
git commit -m "feat(analyzer): AI contextual gloss button in JMdict popup"
```

---

### Task 16: Settings panel — autoplay preanalyze toggle

**Files:**
- Modify: `static/main-js.js` (settings modal — grep the Gemini section)

**Step 1: Add checkbox** "Auto-analyze sentence during playback" in Gemini section. Reads/writes `localStorage.yomikikuan_analyzer_autoplay_preanalyze` (value `'true'` or absent).

**Step 2: Hook into playback** — at the playback per-sentence boundary (CLAUDE.md forbids touching `playAllText`, so add a tiny non-invasive hook): listen for existing `YomikikuanEvents` sentence events and, when the flag is `'true'`, prefetch analysis silently (no UI mount). If no suitable event exists, skip — feature can ship without preanalyze.

**Step 3: Commit**

```bash
git commit -m "feat(analyzer): autoplay preanalyze toggle"
```

---

### Task 17: i18n strings

**Files:**
- Modify: `static/js/modules/i18n/index.js` (or wherever the dict maps live — inspect first)
- Modify: `static/js/i18n.js` (classic-script mirror if it has its own dict)

**Step 1: Add keys for ja/en/zh:**

| Key | ja | en | zh |
|---|---|---|---|
| `analyzer.tab.structure` | 構造 | Structure | 结构 |
| `analyzer.tab.explanation` | 解説 | Explanation | 讲解 |
| `analyzer.tab.keywords` | 重要語 | Keywords | 重点词 |
| `analyzer.pin` | 固定 | Pin | 固化 |
| `analyzer.unpin` | 固定解除 | Unpin | 取消固化 |
| `analyzer.pin.limit` | 固定上限(200)。先に削除してください | Pin limit reached (200). Remove some first. | 已达固化上限(200)，请先清理 |
| `analyzer.badge.detail` | 読解難度 | Reading difficulty | 阅读难度 |
| `analyzer.needsKey` | Gemini キーが必要 | Requires Gemini API key | 需要 Gemini API Key |
| `analyzer.error.quota` | レート制限 | Rate limit hit, try later | 额度超限，稍后再试 |
| `analyzer.error.generic` | 解析失敗。再試行? | Analysis failed. Retry? | 解析失败，重试？ |
| `analyzer.settings.preanalyze` | 再生中に自動解析 | Auto-analyze during playback | 播放时自动解析 |

`analyzer.level.n1..n5` stay as-is across locales.

**Step 2: Grep new files for hardcoded strings** — anything Chinese/English/Japanese hardcoded in `static/js/modules/analyzer/**` gets replaced with `YomikikuanGetText(...)`.

**Step 3: Manual switch** — change language in Settings; all new copy translates.

**Step 4: Commit**

```bash
git commit -m "feat(analyzer): i18n strings for all new UI"
```

---

## Phase 3 — Compat, cache, ship

### Task 18: Backup schema bump

**Files:**
- Modify: `static/main-js.js` (backup export/import — grep `yomikikuan-backup`)

**Step 1: Bump `version`** in backup JSON from current value (check current) to next integer.

**Step 2: Import tolerance** — existing import logic already tolerates unknown fields; `analysis` passes through. Verify.

**Step 3: Manual test:**
- Create a doc, pin a sentence, export backup.
- `?clear=1`, import backup, verify pinned sentence still pinned and cached analysis still renders.

**Step 4: Commit**

```bash
git commit -m "feat(analyzer): bump backup schema version for analysis field"
```

---

### Task 19: Service worker cache bump

**Files:**
- Modify: `service-worker.js` (line 13: `CACHE_VERSION = 'v2'` → `'v3'`)
- Verify: `static/pwa-assets.json` lists every new file

**Step 1: Bump version**

**Step 2: Cross-check manifest** — run:

```bash
git diff --name-only master~20 -- 'static/js/modules/analyzer/*.js' 'static/js/modules/analyzer/**/*.js' | sort
```

Compare against `static/pwa-assets.json` entries. Any missing entries → add. Fixture `*.test.html` files stay out.

**Step 3: Hard-reload check**
- Open in incognito → DevTools → Application → Cache storage
- `yomikikuan-cache-v3` should contain all analyzer JS + CSS
- Toggle offline, navigate, app still loads, analyzer still works (local features only; LLM calls naturally fail)

**Step 4: Commit**

```bash
git commit -m "chore(sw): bump CACHE_VERSION to v3 for analyzer assets"
```

---

### Task 20: Full smoke checklist walkthrough

**Files:** None (verification only)

Run the full checklist from `docs/plans/2026-04-21-reading-analyzer-design.md` (Testing section). Check every box.

**Mandatory passes:**

- [ ] Short document (<500 chars) → badge appears in <300ms
- [ ] Long document (>5000 chars) → no UI jank; analysis uses `requestIdleCallback`
- [ ] Non-Japanese document → badge hidden, no console errors
- [ ] No API key → Structure tab renders, Explanation tab shows CTA
- [ ] With API key → Explanation fills in 2–5s; second click hits cache instantly
- [ ] Click sentence during playback → TTS uninterrupted
- [ ] Pin → export → `?clear=1` → import → pin persists
- [ ] List swatch level matches header badge level
- [ ] ja/en/zh switching updates all new copy
- [ ] ≤480px: card doesn't overflow, tabs scrollable
- [ ] ≤768px: tap targets ≥44px
- [ ] DevTools Performance: analyzer work idle-scheduled, not blocking main thread

If any fail → open follow-up tasks; do NOT mark the plan complete.

**Final commit:**

```bash
git commit -am "docs(plan): mark Reading Analyzer smoke checklist complete"
```

---

## Deviation protocol

If any task reveals a design flaw (Kuromoji accessor is different, `documentManager.save()` has a different name, Gemini API contract changed, etc.):

1. **Stop.** Do not patch around the gap.
2. Update `docs/plans/2026-04-21-reading-analyzer-design.md` with the revised approach.
3. Update this plan's affected tasks.
4. Commit the doc changes, then proceed.

Never expand scope silently. Never reintroduce the `window.playAllText` mirror pattern forbidden by CLAUDE.md.
