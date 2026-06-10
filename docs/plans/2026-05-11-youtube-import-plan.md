# YouTube 视频导入功能 — 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Header `▶️YouTube` button → modal panel (3 tabs: 字幕导入 / 视频伴读 / 听力题) backed by a Gemini-2.5 multimodal call that ingests a YouTube URL directly (`fileData` part), all on the existing pure-static architecture.

**Architecture:** New ESM module tree under `static/js/modules/youtube/`. Pure helpers (URL parsing, oembed, prompt builders) come first with unit tests; the Gemini wrapper and UI panel sit on top. Strictly no contact with the playback boundary in `main-js.js` / `tts.js` — (B) embeds the official YouTube IFrame Player API and runs its own polling-based subtitle highlight.

**Tech Stack:** Vanilla ESM, `fetch`, IndexedDB (reuses existing `analyzer/cache/idb.js`), YouTube oEmbed (`/oembed?format=json`), Gemini `gemini-2.5-flash` `:generateContent` with `fileData.fileUri` of the YouTube URL, YouTube IFrame Player API (`https://www.youtube.com/iframe_api`).

---

## Context every task assumes

Reading these once before Task 1 saves time:

- **Project type:** pure static site, no build step, no framework. Open `index.html` via `npm start` (which runs `python3 -m http.server 8000`).
- **Module pattern:** every panel module exports `mountPanel(ctx)` + `unmountPanel()` and self-registers `window.__yomikikuanOpen<Name>` for classic-script callers. CSS via `<style>` injection guarded by a `__yomikikuan<Name>CssInjected` window flag. Reference: [static/js/modules/analyzer/ui/jlptPanel.js](static/js/modules/analyzer/ui/jlptPanel.js) (lines 1-130 cover the shell).
- **Test pattern:** each module has a sibling `*.test.html` with a `#summary` div whose `<h3>` reads `✓ ALL PASS — N/M` or `✗ K FAILED — N/M`. Reference: [static/js/modules/analyzer/ui/sentence-text.test.html](static/js/modules/analyzer/ui/sentence-text.test.html).
- **Test runner:** `bash scripts/test.sh` walks the `TESTS` array in [scripts/test.sh](scripts/test.sh). Each new test page MUST be appended to that array or it won't run in CI.
- **Gemini call shape:** copy from [static/js/modules/analyzer/ui/jlptPanel.js:34-62](static/js/modules/analyzer/ui/jlptPanel.js) — `gemini-2.5-flash`, `:generateContent`, retry on 429/502/503/504, throws `NO_API_KEY` / `RATE_LIMITED` / `EMPTY_RESPONSE` / `HTTP_<status>: <body>`.
- **Cache:** `static/js/modules/analyzer/cache/idb.js` — keyed by SHA-1 of `${text}|${providerId}|${schemaVersion}`, 30d TTL, per-providerId LRU caps in `LRU_CAPS`.
- **Documents:** `static/js/modules/docs/store.js` exports `createDocument(content)` and `setActiveId(id)`. The newly created doc gets returned with an `id` field.
- **API key access:** `localStorage.getItem('yomikikuan_gemini_api_key')` directly OR via `window.getGeminiApiKey()` from `tts.js`.
- **Hard rule:** never touch `main-js.js` `playSegments` / `currentSegments` / `currentSegmentIndex`. See `.claude/rules/playback-boundary.md`.

---

## Task 1: `url.js` — URL parser (pure)

**Files:**
- Create: `static/js/modules/youtube/url.js`
- Create: `static/js/modules/youtube/url.test.html`

**Goal:** Parse any common YouTube URL form into `{videoId, startSec?, endSec?}`. Reject non-YouTube hosts.

### Step 1.1: Write failing test

Create `static/js/modules/youtube/url.test.html`. Copy the boilerplate from [static/js/modules/analyzer/ui/sentence-text.test.html](static/js/modules/analyzer/ui/sentence-text.test.html) (the `<style>`, `#summary`, `#results`, and the pass/fail rendering loop are reusable verbatim). Replace the body with:

```html
<script type="module">
  import { parseYoutubeUrl } from './url.js';

  const results = [];
  const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || '' });
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Standard watch?v=
  check('watch?v= → videoId',
    eq(parseYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
       { videoId: 'dQw4w9WgXcQ' }));

  // youtu.be short link
  check('youtu.be/ → videoId',
    eq(parseYoutubeUrl('https://youtu.be/dQw4w9WgXcQ'),
       { videoId: 'dQw4w9WgXcQ' }));

  // /shorts/
  check('/shorts/ → videoId',
    eq(parseYoutubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
       { videoId: 'dQw4w9WgXcQ' }));

  // /embed/
  check('/embed/ → videoId',
    eq(parseYoutubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'),
       { videoId: 'dQw4w9WgXcQ' }));

  // ?t=90 timestamp (numeric seconds)
  check('?t=90 numeric → startSec=90',
    eq(parseYoutubeUrl('https://youtu.be/dQw4w9WgXcQ?t=90'),
       { videoId: 'dQw4w9WgXcQ', startSec: 90 }));

  // ?t=1m30s composite
  check('?t=1m30s → startSec=90',
    eq(parseYoutubeUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s'),
       { videoId: 'dQw4w9WgXcQ', startSec: 90 }));

  // ?t=1h2m3s composite
  check('?t=1h2m3s → startSec=3723',
    eq(parseYoutubeUrl('https://youtu.be/dQw4w9WgXcQ?t=1h2m3s'),
       { videoId: 'dQw4w9WgXcQ', startSec: 3723 }));

  // start= query
  check('?start=42 → startSec=42',
    eq(parseYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=42'),
       { videoId: 'dQw4w9WgXcQ', startSec: 42 }));

  // bare videoId (11 chars [a-zA-Z0-9_-])
  check('bare 11-char id → videoId',
    eq(parseYoutubeUrl('dQw4w9WgXcQ'),
       { videoId: 'dQw4w9WgXcQ' }));

  // Whitespace tolerance
  check('whitespace tolerated',
    eq(parseYoutubeUrl('  https://youtu.be/dQw4w9WgXcQ  '),
       { videoId: 'dQw4w9WgXcQ' }));

  // Rejections → null
  check('non-youtube host → null',
    parseYoutubeUrl('https://vimeo.com/12345') === null);
  check('empty string → null', parseYoutubeUrl('') === null);
  check('null → null', parseYoutubeUrl(null) === null);
  check('non-string → null', parseYoutubeUrl(12345) === null);
  check('youtube without id → null',
    parseYoutubeUrl('https://www.youtube.com/') === null);
  check('id with bad length → null',
    parseYoutubeUrl('https://youtu.be/abc') === null);

  // (Render results — copy from sentence-text.test.html)
  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;
  document.getElementById('summary').innerHTML =
    `<h3 style="color:${fail===0?'#1d7d3f':'#ff3b30'};">
      ${fail === 0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED'} — ${pass}/${results.length}
    </h3>`;
  const root = document.getElementById('results');
  results.forEach(r => {
    const row = document.createElement('div');
    row.className = 'row ' + (r.pass ? 'pass' : 'fail');
    row.innerHTML = `<span class="name">${r.pass ? '✓' : '✗'} ${r.name}</span>${r.detail ? ` <span class="detail">${r.detail}</span>` : ''}`;
    root.appendChild(row);
  });
</script>
```

### Step 1.2: Verify test fails

```bash
npm start &  # starts python http server on 8000
# Open http://localhost:8000/static/js/modules/youtube/url.test.html
```

Expected: page errors loading `./url.js` (404 / not found).

### Step 1.3: Implement `url.js`

```js
// static/js/modules/youtube/url.js
//
// Pure URL parser for YouTube links. Returns { videoId, startSec?, endSec? }
// or null on any unrecognised input. No side effects, no DOM, no fetch —
// safe to import at module scope.

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function parseTimeParam(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

export function parseYoutubeUrl(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // Bare 11-char ID shortcut.
  if (VIDEO_ID_RE.test(raw)) return { videoId: raw };

  let url;
  try { url = new URL(raw); }
  catch (_) { return null; }

  const host = url.hostname.replace(/^www\./, '');
  let videoId = null;

  if (host === 'youtu.be') {
    videoId = url.pathname.slice(1).split('/')[0] || null;
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else {
      const parts = url.pathname.split('/').filter(Boolean);
      // /shorts/<id>, /embed/<id>, /v/<id>, /live/<id>
      if (['shorts', 'embed', 'v', 'live'].includes(parts[0])) {
        videoId = parts[1] || null;
      }
    }
  }

  if (!videoId || !VIDEO_ID_RE.test(videoId)) return null;

  const out = { videoId };
  const startSec = parseTimeParam(url.searchParams.get('t'))
                ?? parseTimeParam(url.searchParams.get('start'));
  if (typeof startSec === 'number') out.startSec = startSec;
  const endSec = parseTimeParam(url.searchParams.get('end'));
  if (typeof endSec === 'number') out.endSec = endSec;
  return out;
}
```

### Step 1.4: Verify test passes

Reload the test page. Expected: `✓ ALL PASS — 16/16`.

### Step 1.5: Register test in CI runner

Edit [scripts/test.sh](scripts/test.sh): append to the `TESTS` array (insert after the last `analyzer` line):

```js
  'static/js/modules/youtube/url.test.html',
```

Run: `bash scripts/test.sh`
Expected: full suite passes, including the new line.

### Step 1.6: Commit

```bash
git add static/js/modules/youtube/url.js static/js/modules/youtube/url.test.html scripts/test.sh
git commit -m "feat(youtube): URL parser + 16 tests"
```

---

## Task 2: `oembed.js` — video metadata fetch

**Files:**
- Create: `static/js/modules/youtube/oembed.js`
- Create: `static/js/modules/youtube/oembed.test.html`

**Goal:** Fetch `https://www.youtube.com/oembed?url=…&format=json` to display title / thumbnail in the panel header. Returns `{title, author, thumbnail}` or throws `NOT_EMBEDDABLE` (404) / `NETWORK` (fetch failure).

### Step 2.1: Write failing test

`oembed.test.html` (boilerplate same as Task 1):

```html
<script type="module">
  import { fetchVideoMeta } from './oembed.js';

  const results = [];
  const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || '' });

  // Stub global fetch
  const origFetch = window.fetch;
  function withFetch(impl, fn) { window.fetch = impl; return fn().finally(() => { window.fetch = origFetch; }); }

  await withFetch(
    async (url) => ({
      ok: true, status: 200,
      json: async () => ({
        title: 'Test Video', author_name: 'Tester',
        thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      }),
    }),
    async () => {
      const meta = await fetchVideoMeta('dQw4w9WgXcQ');
      check('happy path → fields mapped', meta.title === 'Test Video'
        && meta.author === 'Tester'
        && meta.thumbnail === 'https://i.ytimg.com/vi/abc/hqdefault.jpg');
    }
  );

  await withFetch(
    async () => ({ ok: false, status: 404, json: async () => ({}) }),
    async () => {
      let err;
      try { await fetchVideoMeta('zzzzzzzzzzz'); } catch (e) { err = e; }
      check('404 → NOT_EMBEDDABLE', err && err.message === 'NOT_EMBEDDABLE');
    }
  );

  await withFetch(
    async () => { throw new TypeError('Failed to fetch'); },
    async () => {
      let err;
      try { await fetchVideoMeta('aaaaaaaaaaa'); } catch (e) { err = e; }
      check('network failure → NETWORK', err && err.message === 'NETWORK');
    }
  );

  let badIdErr;
  try { await fetchVideoMeta(''); } catch (e) { badIdErr = e; }
  check('rejects bad id', badIdErr && badIdErr.message === 'BAD_ID');

  // (Render block — same as url.test.html)
</script>
```

### Step 2.2: Verify failure (404 on `./oembed.js`).

### Step 2.3: Implement

```js
// static/js/modules/youtube/oembed.js
//
// YouTube oEmbed lookup — title / author / thumbnail. No API key required.
// Public endpoint returns 404 for private/deleted videos AND for videos the
// uploader disabled embedding for; we surface that uniformly as
// NOT_EMBEDDABLE so the UI can show the same toast.

const ENDPOINT = 'https://www.youtube.com/oembed';

export async function fetchVideoMeta(videoId) {
  if (!videoId || typeof videoId !== 'string') throw new Error('BAD_ID');
  const url = `${ENDPOINT}?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`;
  let res;
  try { res = await fetch(url); }
  catch (_) { throw new Error('NETWORK'); }
  if (res.status === 404) throw new Error('NOT_EMBEDDABLE');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const data = await res.json();
  return {
    title: data.title || '',
    author: data.author_name || '',
    thumbnail: data.thumbnail_url || '',
  };
}
```

### Step 2.4: Verify pass + register in `scripts/test.sh` + commit

```bash
git add static/js/modules/youtube/oembed.js static/js/modules/youtube/oembed.test.html scripts/test.sh
git commit -m "feat(youtube): oEmbed metadata fetch + 4 tests"
```

---

## Task 3: `prompts.js` — three Gemini prompt builders (pure)

**Files:**
- Create: `static/js/modules/youtube/prompts.js`
- Create: `static/js/modules/youtube/prompts.test.html`

**Goal:** Three pure functions returning prompt strings: `buildTranscriptPrompt()`, `buildTimedTranscriptPrompt()`, `buildJlptPrompt({level, count, mode})`. The JLPT prompt delegates to the existing JLPT prompt builders by composing their output with a "use the YouTube audio as source instead of an article" preamble.

### Step 3.1: Write failing test

```html
<script type="module">
  import { buildTranscriptPrompt, buildTimedTranscriptPrompt, buildJlptPrompt }
    from './prompts.js';

  const results = [];
  const check = (n, c, d) => results.push({name:n, pass:!!c, detail:d||''});

  const t = buildTranscriptPrompt();
  check('transcript: mentions Japanese transcript', /日本語|Japanese/i.test(t));
  check('transcript: requests plain text', /plain text|純粋|プレーン/i.test(t)
    || /no markdown|no fences/i.test(t));

  const tt = buildTimedTranscriptPrompt();
  check('timed: requests JSON array', /\[\s*\{/.test(tt) && /start.*end.*text/is.test(tt));
  check('timed: forbids markdown fences', /no markdown|no fences|strict json/i.test(tt));

  const j = buildJlptPrompt({ level: 'N3', count: 3, mode: 'kadai' });
  check('jlpt: includes level', /N3/.test(j));
  check('jlpt: includes count', /\b3\b/.test(j));
  check('jlpt: instructs to listen to YouTube audio',
    /listen|video|audio|聴いて/i.test(j));
  check('jlpt: contains 課題理解', /課題理解/.test(j));

  // unknown mode throws
  let err;
  try { buildJlptPrompt({ level: 'N3', count: 3, mode: 'BOGUS' }); }
  catch (e) { err = e; }
  check('jlpt: unknown mode throws', err && /unknown mode/i.test(err.message));

  // (Render block)
</script>
```

### Step 3.2: Verify failure.

### Step 3.3: Implement

```js
// static/js/modules/youtube/prompts.js
//
// Gemini prompts for the YouTube panel. Pure string builders — no fetch,
// no DOM. The JLPT builder reuses the question-shape contract documented
// in modules/analyzer/ui/jlpt/prompts.js so the renderer can consume the
// output without changes.

import { promptFor as jlptPromptFor } from '../analyzer/ui/jlpt/prompts.js';

export function buildTranscriptPrompt() {
  return `Transcribe the Japanese audio of this YouTube video into plain Japanese text.
- One sentence per line. Include kanji and natural punctuation (。、？！).
- No timestamps, no speaker labels, no markdown, no code fences.
- If the video has no Japanese audio, output exactly: NO_JAPANESE_AUDIO`;
}

export function buildTimedTranscriptPrompt() {
  return `Transcribe the Japanese audio of this YouTube video as strict JSON ONLY.
Output a JSON array of segments, one per natural sentence:
[
  { "start": 0.0, "end": 3.2, "text": "こんにちは、今日は…" },
  { "start": 3.2, "end": 6.8, "text": "次に、…" }
]
Constraints:
- "start"/"end" are seconds (number, 1 decimal place ok).
- "text" is the spoken Japanese with natural punctuation.
- Do NOT include speaker labels or English.
- Do NOT wrap in markdown or code fences.
- If the video has no Japanese audio, output: { "error": "NO_JAPANESE_AUDIO" }`;
}

export function buildJlptPrompt({ level, count, mode }) {
  // Reuse the existing JLPT prompt builder (article-based) by passing a
  // sentinel article that says "use the audio". The renderer contract
  // (item shape) is identical, so renderers/* needs no change.
  const article = `[USE_YOUTUBE_AUDIO]
Listen to the Japanese audio in the YouTube video provided as input.
Treat the spoken content as the source material. Do NOT make up content
that isn't in the audio. If the audio has no Japanese, return:
{ "error": "NO_JAPANESE_AUDIO" }`;
  const base = jlptPromptFor(mode, { article, level, count });
  return `${base}

NOTE: The "source article" above is a directive — your real source is the
YouTube video's audio track passed in as the multimodal input. Quote
exact lines from the audio in the "citation" field.`;
}
```

### Step 3.4: Verify + register + commit

```bash
git add static/js/modules/youtube/prompts.js static/js/modules/youtube/prompts.test.html scripts/test.sh
git commit -m "feat(youtube): three Gemini prompt builders + tests"
```

---

## Task 4: `gemini-yt.js` — multimodal API wrapper

**Files:**
- Create: `static/js/modules/youtube/gemini-yt.js`
- Create: `static/js/modules/youtube/gemini-yt.test.html`

**Goal:** Single function `callGeminiYoutube(youtubeUrl, prompt, { startSec?, endSec?, signal? })` → string (raw model text). Wraps `gemini-2.5-flash`'s `:generateContent` with a `fileData` part for the URL.

### Step 4.1: Write failing test

```html
<script type="module">
  import { callGeminiYoutube } from './gemini-yt.js';

  const results = [];
  const check = (n, c, d) => results.push({name:n, pass:!!c, detail:d||''});

  // Seed API key
  localStorage.setItem('yomikikuan_gemini_api_key', 'TEST_KEY_123');

  const orig = window.fetch;
  let lastBody = null, lastUrl = null;

  // Happy path
  window.fetch = async (url, opts) => {
    lastUrl = url; lastBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({
      candidates: [{ content: { parts: [{ text: 'TRANSCRIPT_OUT' }] } }]
    })};
  };
  const out = await callGeminiYoutube(
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'PROMPT_X');
  check('returns model text', out === 'TRANSCRIPT_OUT');
  check('endpoint is gemini-2.5-flash', /gemini-2\.5-flash:generateContent/.test(lastUrl));
  check('passes API key as query param', /key=TEST_KEY_123/.test(lastUrl));
  check('body has fileData with YouTube URL',
    lastBody.contents[0].parts[0].fileData?.fileUri ===
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  check('body has prompt text part',
    !!lastBody.contents[0].parts.find(p => p.text === 'PROMPT_X'));

  // With time window
  await callGeminiYoutube(
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'P',
    { startSec: 30, endSec: 90 });
  check('startOffset/endOffset emitted',
    lastBody.contents[0].parts[0].videoMetadata?.startOffset === '30s' &&
    lastBody.contents[0].parts[0].videoMetadata?.endOffset === '90s');

  // No key
  localStorage.removeItem('yomikikuan_gemini_api_key');
  let err;
  try { await callGeminiYoutube('https://youtu.be/x', 'P'); } catch (e) { err = e; }
  check('throws NO_API_KEY', err && err.message === 'NO_API_KEY');

  // 429 throws RATE_LIMITED (after one retry)
  localStorage.setItem('yomikikuan_gemini_api_key', 'K');
  let calls = 0;
  window.fetch = async () => { calls++; return { ok: false, status: 429, text: async () => '' }; };
  err = null;
  try { await callGeminiYoutube('https://youtu.be/x', 'P'); } catch (e) { err = e; }
  check('429 retried then throws RATE_LIMITED', err && err.message === 'RATE_LIMITED' && calls === 2);

  // Empty response
  window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [] }) });
  err = null;
  try { await callGeminiYoutube('https://youtu.be/x', 'P'); } catch (e) { err = e; }
  check('empty candidates → EMPTY_RESPONSE', err && err.message === 'EMPTY_RESPONSE');

  window.fetch = orig;
  // (Render block)
</script>
```

### Step 4.2: Verify failure.

### Step 4.3: Implement

```js
// static/js/modules/youtube/gemini-yt.js
//
// Wraps gemini-2.5-flash :generateContent for multimodal YouTube input.
// Mirrors the retry / error-shape contract of analyzer/ui/jlptPanel.js
// callGemini so callers can handle errors uniformly.

const GEMINI_MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TRANSIENT = new Set([429, 502, 503, 504]);

function apiKey() {
  try { return (localStorage.getItem('yomikikuan_gemini_api_key') || '').trim(); }
  catch (_) { return ''; }
}

export async function callGeminiYoutube(youtubeUrl, prompt, opts = {}) {
  const key = apiKey();
  if (!key) throw new Error('NO_API_KEY');
  const { startSec, endSec, signal } = opts;

  const filePart = {
    fileData: { fileUri: youtubeUrl, mimeType: 'video/*' },
  };
  if (typeof startSec === 'number' || typeof endSec === 'number') {
    filePart.videoMetadata = {};
    if (typeof startSec === 'number') filePart.videoMetadata.startOffset = `${startSec}s`;
    if (typeof endSec === 'number')   filePart.videoMetadata.endOffset   = `${endSec}s`;
  }

  const body = {
    contents: [{ parts: [filePart, { text: prompt }] }],
    generationConfig: { temperature: 0.4 },
  };

  const attempt = () => fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  let res = await attempt();
  if (TRANSIENT.has(res.status)) {
    await new Promise(r => setTimeout(r, 1200));
    if (signal && signal.aborted) throw new Error('ABORTED');
    res = await attempt();
  }
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP_${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('EMPTY_RESPONSE');
  return text;
}
```

### Step 4.4: Verify + register + commit

```bash
git add static/js/modules/youtube/gemini-yt.js static/js/modules/youtube/gemini-yt.test.html scripts/test.sh
git commit -m "feat(youtube): Gemini multimodal call wrapper + tests"
```

---

## Task 5: Extend `analyzer/cache/idb.js` LRU caps for YouTube providerIds

**Files:**
- Modify: `static/js/modules/analyzer/cache/idb.js:23-30`

**Goal:** Add three new providerId buckets so the cache doesn't fall back to the `default` bucket (which would cause cross-bucket eviction churn).

### Step 5.1: Edit `LRU_CAPS`

Find:
```js
const LRU_CAPS = Object.freeze({
  'gemini':          400,
  'translate-zh':    100,
  'article-summary':  50,
  'jlpt':             30,
  'mock':             20,
  'default':         100,
});
```

Replace with:
```js
const LRU_CAPS = Object.freeze({
  'gemini':              400,
  'translate-zh':        100,
  'article-summary':      50,
  'jlpt':                 30,
  'yt-transcript':        20,
  'yt-transcript-timed':  20,
  'yt-jlpt':              10,
  'mock':                 20,
  'default':             100,
});
```

Also extend the comment block above explaining the new buckets (one line each: `yt-transcript` for plain text per video, `yt-transcript-timed` for timed JSON segments per video, `yt-jlpt` for generated questions per video×mode×level×count).

### Step 5.2: Run test suite

There is no formal test for `idb.js` (per `scripts/test.sh` comment: `analyzer/cache/idb.test.html` uses `console.assert`). Just confirm `bash scripts/test.sh` still passes (no regression).

### Step 5.3: Commit

```bash
git add static/js/modules/analyzer/cache/idb.js
git commit -m "feat(cache): per-bucket LRU caps for yt-transcript/yt-transcript-timed/yt-jlpt"
```

---

## Task 6: Header button + i18n + panel-trigger wiring

**Files:**
- Modify: `index.html` — insert button after `#jlptBtn` (around line 254)
- Modify: `static/js/modules/ui/panel-triggers.js` — add `youtube` entry to `PANEL_MODULES`

**Goal:** Header button exists, click triggers lazy-import + calls `window.__yomikikuanOpenYoutube`. (The function will be a no-op for now — Task 7 mounts the actual panel.)

### Step 6.1: Add header button (`index.html`)

After [index.html:252-254](index.html) (the `jlptBtn` block), insert:

```html
            <!-- YouTube import: paste URL → transcribe / companion player / listening Qs -->
            <button type="button" class="theme-icon-btn theme-icon-btn--emoji" id="youtubeBtn" title="从 YouTube 导入" aria-label="从 YouTube 导入">
              <span aria-hidden="true">▶️</span>
            </button>
```

### Step 6.2: Wire in `panel-triggers.js`

Add to the `PANEL_MODULES` object (after the `bilingual` entry):

```js
  youtube: {
    btnId: 'youtubeBtn',
    modulePath: '/static/js/modules/youtube/index.js',
    openFn: '__yomikikuanOpenYoutube',
    logTag: 'youtube',
  },
```

### Step 6.3: i18n (defer)

Match the way `#jlptBtn` does it — most other emoji header buttons hardcode Chinese in `index.html` `title` / `aria-label` and don't go through `static/js/i18n.js`. Match that pattern; full localisation is a follow-up.

### Step 6.4: Smoke test

Run `npm start`, open `http://localhost:8000`, hard-reload (Cmd-Shift-R to bypass SW), confirm:
- ▶️ button appears next to 🎧
- Clicking does nothing visible yet but **no console errors** about missing module (the import returns a 404 because `index.js` doesn't exist yet — expected; the lazy-import catches it via `console.warn`).

### Step 6.5: Commit

```bash
git add index.html static/js/modules/ui/panel-triggers.js
git commit -m "feat(youtube): header button + panel-triggers wiring"
```

---

## Task 7: `index.js` — panel shell (overlay + URL input + tabs)

**Files:**
- Create: `static/js/modules/youtube/index.js`
- Create: `static/js/modules/youtube/index.test.html` (smoke-only — confirms `mountPanel()` injects DOM and `unmountPanel()` removes it)

**Goal:** Modal opens. URL field + "解析视频" button → on click runs `parseYoutubeUrl` + `fetchVideoMeta`, displays title + thumbnail. Three tab buttons sit below an empty content `<div id="ytTabContent">`. Each tab button just toggles classes for now; tab content modules slot in over Tasks 8/9/10.

### Step 7.1: Write failing test

```html
<script type="module">
  import { mountPanel, unmountPanel } from './index.js';
  const results = [];
  const check = (n, c, d) => results.push({name:n, pass:!!c, detail:d||''});

  mountPanel(document);
  check('overlay mounted', !!document.querySelector('.youtube-overlay'));
  check('URL input present', !!document.querySelector('#ytUrlInput'));
  check('parse button present', !!document.querySelector('#ytParseBtn'));
  check('three tabs present', document.querySelectorAll('.youtube-tab').length === 3);

  unmountPanel();
  check('overlay removed', !document.querySelector('.youtube-overlay'));

  check('window.__yomikikuanOpenYoutube registered',
    typeof window.__yomikikuanOpenYoutube === 'function');

  // (Render block)
</script>
```

### Step 7.2: Verify failure.

### Step 7.3: Implement (sketch — adapt from jlptPanel structure)

```js
// static/js/modules/youtube/index.js
//
// YouTube import panel — overlay shell + URL field + 3 tabs.
// Tab content modules (./tabs/import, ./tabs/companion, ./tabs/listening)
// are lazy-imported on first switch. No contact with the playback boundary.

import { parseYoutubeUrl } from './url.js';
import { fetchVideoMeta } from './oembed.js';

const CSS_FLAG = '__yomikikuanYoutubeCssInjected';
const MAX_DURATION_SEC = 600;  // hard cap for MVP
let overlayEl = null;
let currentParsed = null;       // { videoId, startSec?, endSec? }
let currentMeta   = null;       // { title, author, thumbnail }
let activeTab     = 'import';
const tabModules  = { import: null, companion: null, listening: null };

function injectCss() {
  if (window[CSS_FLAG]) return;
  window[CSS_FLAG] = true;
  const style = document.createElement('style');
  style.id = 'youtube-panel-css';
  style.textContent = `
    .youtube-overlay { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.4);
      display:flex; align-items:center; justify-content:center; padding:24px; backdrop-filter:blur(8px); }
    .youtube-panel { background:var(--bg,#fff); color:var(--text,#111);
      width:min(880px,100%); max-height:calc(100vh - 48px); border-radius:18px;
      box-shadow:0 24px 80px rgba(0,0,0,0.28); display:flex; flex-direction:column; overflow:hidden;
      border:1px solid var(--border,rgba(0,0,0,0.1)); }
    .youtube-panel-header { display:flex; align-items:center; justify-content:space-between;
      padding:14px 20px; border-bottom:1px solid var(--border,rgba(0,0,0,0.08)); }
    .youtube-panel-header h3 { margin:0; font-size:16px; font-weight:600; }
    .youtube-close { background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted,#888); }
    .youtube-url-row { display:flex; gap:8px; padding:14px 20px; }
    .youtube-url-row input { flex:1; padding:8px 12px; border:1px solid var(--border,rgba(0,0,0,0.15));
      border-radius:8px; font-size:14px; }
    .youtube-meta { display:flex; gap:12px; padding:0 20px 12px; align-items:flex-start; }
    .youtube-meta img { width:120px; border-radius:8px; }
    .youtube-tabs { display:flex; padding:0 20px; border-bottom:1px solid var(--border,rgba(0,0,0,0.08)); }
    .youtube-tab { background:none; border:none; padding:10px 14px; cursor:pointer;
      font-size:13px; color:var(--muted,#888); border-bottom:2px solid transparent; margin-bottom:-1px; }
    .youtube-tab.is-active { color:var(--text,#111); border-bottom-color:#0071e3; font-weight:600; }
    .youtube-tab-content { flex:1; overflow-y:auto; padding:14px 20px; }
    .youtube-error { color:#ff3b30; font-size:13px; padding:0 20px 8px; }
  `;
  document.head.appendChild(style);
}

function buildShell() {
  const overlay = document.createElement('div');
  overlay.className = 'youtube-overlay';
  overlay.innerHTML = `
    <div class="youtube-panel" role="dialog" aria-modal="true" aria-label="YouTube import">
      <div class="youtube-panel-header">
        <h3>从 YouTube 导入</h3>
        <button type="button" class="youtube-close" aria-label="关闭">×</button>
      </div>
      <div class="youtube-url-row">
        <input type="url" id="ytUrlInput" placeholder="粘贴 YouTube URL（≤10 分钟）" />
        <button type="button" id="ytParseBtn">解析视频</button>
      </div>
      <div id="ytErrorBar" class="youtube-error" hidden></div>
      <div id="ytMeta" class="youtube-meta" hidden></div>
      <div class="youtube-tabs">
        <button type="button" class="youtube-tab is-active" data-tab="import">📥 导入字幕</button>
        <button type="button" class="youtube-tab" data-tab="companion">🎬 视频伴读</button>
        <button type="button" class="youtube-tab" data-tab="listening">🎧 生成听力题</button>
      </div>
      <div id="ytTabContent" class="youtube-tab-content"></div>
    </div>`;
  return overlay;
}

function showError(msg) {
  const bar = overlayEl.querySelector('#ytErrorBar');
  bar.textContent = msg; bar.hidden = false;
}
function clearError() {
  const bar = overlayEl.querySelector('#ytErrorBar');
  bar.textContent = ''; bar.hidden = true;
}

async function onParseClick() {
  clearError();
  const input = overlayEl.querySelector('#ytUrlInput').value;
  const parsed = parseYoutubeUrl(input);
  if (!parsed) { showError('请输入有效的 YouTube URL'); return; }
  currentParsed = parsed;
  try {
    const meta = await fetchVideoMeta(parsed.videoId);
    currentMeta = meta;
    const m = overlayEl.querySelector('#ytMeta');
    m.innerHTML = `
      <img src="${meta.thumbnail}" alt="">
      <div>
        <div style="font-weight:600">${meta.title}</div>
        <div style="opacity:.7;font-size:12px">${meta.author}</div>
      </div>`;
    m.hidden = false;
    await renderTab(activeTab);
  } catch (e) {
    if (e.message === 'NOT_EMBEDDABLE') showError('视频不可用（私有或已删除）');
    else if (e.message === 'NETWORK')   showError('网络错误，请重试');
    else                                showError(`解析失败：${e.message}`);
  }
}

async function loadTabModule(name) {
  if (tabModules[name]) return tabModules[name];
  const mod = await import(`/static/js/modules/youtube/tabs/${name}.js`);
  tabModules[name] = mod;
  return mod;
}

async function renderTab(name) {
  if (!currentParsed) return;
  // Tear down the previous tab if it cares (companion stops its poller / player).
  const prior = tabModules[activeTab];
  if (prior && typeof prior.teardown === 'function') {
    try { prior.teardown(); } catch (_) {}
  }
  activeTab = name;
  const root = overlayEl.querySelector('#ytTabContent');
  root.innerHTML = '<div style="opacity:.6">加载中…</div>';
  try {
    const mod = await loadTabModule(name);
    mod.render(root, { parsed: currentParsed, meta: currentMeta, maxDurationSec: MAX_DURATION_SEC });
  } catch (err) {
    root.innerHTML = `<div class="youtube-error">${err.message}</div>`;
  }
}

function onTabClick(ev) {
  const btn = ev.target.closest('.youtube-tab'); if (!btn) return;
  overlayEl.querySelectorAll('.youtube-tab').forEach(b => b.classList.toggle('is-active', b === btn));
  renderTab(btn.dataset.tab);
}

function onKeyDown(ev) {
  if (ev.key === 'Escape') unmountPanel();
}

export function mountPanel(doc) {
  if (overlayEl) return;
  injectCss();
  overlayEl = buildShell();
  (doc || document).body.appendChild(overlayEl);
  overlayEl.querySelector('.youtube-close').addEventListener('click', unmountPanel);
  overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) unmountPanel(); });
  overlayEl.querySelector('#ytParseBtn').addEventListener('click', onParseClick);
  overlayEl.querySelector('.youtube-tabs').addEventListener('click', onTabClick);
  document.addEventListener('keydown', onKeyDown);
}

export function unmountPanel() {
  if (!overlayEl) return;
  // Tear down whichever tab is mounted.
  const prior = tabModules[activeTab];
  if (prior && typeof prior.teardown === 'function') {
    try { prior.teardown(); } catch (_) {}
  }
  document.removeEventListener('keydown', onKeyDown);
  overlayEl.remove();
  overlayEl = null;
  currentParsed = null;
  currentMeta = null;
}

if (typeof window !== 'undefined') {
  window.__yomikikuanOpenYoutube = () => mountPanel(document);
}
```

### Step 7.4: Verify + smoke check in browser

`bash scripts/test.sh` (test page passes). Then `npm start`, open app, click ▶️ → modal opens, paste a real Japanese YouTube URL, click "解析视频" → see thumbnail + title. Then click each tab — should show "加载中…" then a 404 from missing tab module (expected; Tasks 8-10 add them).

### Step 7.5: Commit

```bash
git add static/js/modules/youtube/index.js static/js/modules/youtube/index.test.html scripts/test.sh
git commit -m "feat(youtube): panel shell + URL parsing + oembed display + tabs"
```

---

## Task 8: `tabs/import.js` — A 字幕导入

**Files:**
- Create: `static/js/modules/youtube/tabs/import.js`
- Create: `static/js/modules/youtube/tabs/import.test.html`

**Goal:** Render a "提取字幕并保存为新文档" CTA. On click: call `callGeminiYoutube` with `buildTranscriptPrompt()`, cache via `analyzer/cache/idb` under providerId `yt-transcript`, then call `docs/store.createDocument(text)` and switch to it. Show progress + final status.

### Step 8.1: Write test (DOM smoke + happy path with stubbed fetch + stubbed documentManager)

```html
<script type="module">
  import { render } from './import.js';

  const results = [];
  const check = (n, c, d) => results.push({name:n,pass:!!c,detail:d||''});

  // Stub the doc store
  let createdContent = null;
  window.documentManager = {
    createDocument: (c) => { createdContent = c; return { id: 'new1' }; },
    setActiveId: () => {}, render: () => {}, loadActiveDocument: () => {},
    getAllDocuments: () => [], getActiveId: () => '',
  };
  // Stub fetch (Gemini)
  localStorage.setItem('yomikikuan_gemini_api_key', 'K');
  window.fetch = async () => ({ ok: true, status: 200, json: async () => ({
    candidates:[{content:{parts:[{text:'これはテスト。\n二行目。'}]}}]
  })});

  const root = document.createElement('div');
  document.body.appendChild(root);
  render(root, { parsed: { videoId: 'abc12345678' }, meta: { title: 'T', author: 'A' }, maxDurationSec: 600 });
  check('CTA button rendered', !!root.querySelector('#ytImportBtn'));

  root.querySelector('#ytImportBtn').click();
  // Wait for the click handler chain to settle (cache lookup + fetch + create).
  await new Promise(r => setTimeout(r, 100));
  check('createDocument called with transcript (title prefixed)',
    typeof createdContent === 'string'
    && createdContent.includes('これはテスト。\n二行目。'));

  // (Render block)
</script>
```

### Step 8.2: Verify failure → implement → verify pass.

```js
// static/js/modules/youtube/tabs/import.js
import { callGeminiYoutube } from '../gemini-yt.js';
import { buildTranscriptPrompt } from '../prompts.js';
import * as cache from '../../analyzer/cache/idb.js';
import * as docs  from '../../docs/store.js';

const PROVIDER_ID = 'yt-transcript';
const SCHEMA_VERSION = 1;

function urlFor(videoId) { return `https://www.youtube.com/watch?v=${videoId}`; }
function cacheKey(parsed) {
  return JSON.stringify({ id: parsed.videoId, s: parsed.startSec || 0, e: parsed.endSec || 0 });
}

export function render(root, ctx) {
  const { parsed, meta } = ctx;
  root.innerHTML = `
    <p style="opacity:.7;font-size:13px">把视频字幕转录后保存为新文档，可立即用 TTS / 分析器 / JLPT 工具阅读。</p>
    <button id="ytImportBtn" style="padding:8px 14px">📥 提取字幕并保存为文档</button>
    <div id="ytImportStatus" style="margin-top:10px;font-size:13px"></div>`;
  const status = root.querySelector('#ytImportStatus');
  root.querySelector('#ytImportBtn').addEventListener('click', async () => {
    status.textContent = '正在转录…（首次约需 30–60 秒）';
    try {
      const key = cacheKey(parsed);
      let text = await cache.get(key, PROVIDER_ID, SCHEMA_VERSION);
      if (!text) {
        text = await callGeminiYoutube(urlFor(parsed.videoId), buildTranscriptPrompt(),
          { startSec: parsed.startSec, endSec: parsed.endSec });
        if (text.trim() === 'NO_JAPANESE_AUDIO') throw new Error('NO_JAPANESE_AUDIO');
        await cache.set(key, PROVIDER_ID, SCHEMA_VERSION, text);
      }
      const titleLine = meta?.title ? `# ${meta.title}\n\n` : '';
      const created = docs.createDocument(titleLine + text);
      if (created) {
        docs.setActiveId(created.id);
        docs.render();
        docs.loadActiveDocument();
        status.innerHTML = `✓ 已保存为文档 <strong>${meta?.title || created.id}</strong>`;
      } else {
        status.textContent = '✓ 已保存（请在文档列表查看）';
      }
    } catch (err) {
      status.textContent = err.message === 'NO_API_KEY' ? '❌ 缺少 Gemini API key'
        : err.message === 'NO_JAPANESE_AUDIO' ? '❌ 视频没有日语音轨'
        : `❌ ${err.message}`;
    }
  });
}
```

> **Note:** verify `cache/idb.js` exposes `get(key, providerId, schemaVersion)` and `set(key, providerId, schemaVersion, value)` with these exact arities. If the actual signature differs (e.g. it hashes a `text` arg instead of a key arg), adapt the wrapper to feed the key string in. The contract you ultimately want is "namespace `yt-transcript`, key includes videoId+range, value is the raw transcript string".

### Step 8.3: Register test + commit

```bash
git add static/js/modules/youtube/tabs/import.js static/js/modules/youtube/tabs/import.test.html scripts/test.sh
git commit -m "feat(youtube): A-tab — transcript import as document"
```

---

## Task 9: `tabs/companion.js` — B 视频伴读

**Files:**
- Create: `static/js/modules/youtube/tabs/companion.js`
- Create: `static/js/modules/youtube/tabs/companion-sync.js` (pure helper for "find current segment by time")
- Create: `static/js/modules/youtube/tabs/companion-sync.test.html`

**Goal:** Render a YouTube IFrame player + a synchronized subtitle list. The player owns the audio (no contact with `tts.js` / `main-js.js`). A `setInterval(250)` polls `player.getCurrentTime()`, uses the pure helper to find the active segment index, toggles a class.

### Step 9.1: Pure-helper test

```html
<script type="module">
  import { findActiveIndex } from './companion-sync.js';
  const results = [];
  const check = (n,c,d)=>results.push({name:n,pass:!!c,detail:d||''});
  const segs = [
    { start: 0,   end: 3.2,  text: 'a' },
    { start: 3.2, end: 6.8,  text: 'b' },
    { start: 6.8, end: 10.0, text: 'c' },
  ];
  check('before first',  findActiveIndex(segs, -1)  === -1);
  check('inside first',  findActiveIndex(segs,  1.5) === 0);
  check('boundary start exclusive of next', findActiveIndex(segs, 3.2) === 1);
  check('inside last',   findActiveIndex(segs,  9.0) === 2);
  check('past end',      findActiveIndex(segs, 99)   === -1);
  check('empty array',   findActiveIndex([], 5)      === -1);
  check('non-array',     findActiveIndex(null, 5)    === -1);
  // (Render block)
</script>
```

### Step 9.2: Pure helper

```js
// static/js/modules/youtube/tabs/companion-sync.js
// Binary-searches the active segment by currentTime.
export function findActiveIndex(segments, t) {
  if (!Array.isArray(segments) || !segments.length) return -1;
  if (typeof t !== 'number' || Number.isNaN(t)) return -1;
  let lo = 0, hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid];
    if (t < s.start)      hi = mid - 1;
    else if (t >= s.end)  lo = mid + 1;
    else                  return mid;
  }
  return -1;
}
```

### Step 9.3: `companion.js` (no separate test — integration via manual smoke)

```js
// static/js/modules/youtube/tabs/companion.js
//
// (B) 视频伴读 — embed YouTube IFrame Player + timed subtitles.
// Independent of main-js.js playback state. The player owns its own audio;
// we only read currentTime to highlight the active subtitle line.

import { callGeminiYoutube } from '../gemini-yt.js';
import { buildTimedTranscriptPrompt } from '../prompts.js';
import * as cache from '../../analyzer/cache/idb.js';
import { findActiveIndex } from './companion-sync.js';

const PROVIDER_ID = 'yt-transcript-timed';
const SCHEMA_VERSION = 1;
let pollTimer = null;
let player = null;
let segments = [];

function urlFor(id) { return `https://www.youtube.com/watch?v=${id}`; }
function cacheKey(parsed) { return JSON.stringify({ id: parsed.videoId, s: parsed.startSec||0, e: parsed.endSec||0 }); }

function ensureIframeApi() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve();
    const cb = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (typeof cb === 'function') cb(); resolve(); };
    if (!document.querySelector('script[data-yt-iframe]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.dataset.ytIframe = '1';
      document.head.appendChild(s);
    }
  });
}

function renderSubtitleList(root) {
  const list = root.querySelector('#ytSubs');
  list.innerHTML = segments.map((s, i) => `
    <div class="yt-sub" data-i="${i}" data-start="${s.start}">
      <button type="button" class="yt-analyze" data-text="${(s.text||'').replace(/"/g,'&quot;')}">🔍</button>
      <span class="yt-sub-text">${s.text || ''}</span>
    </div>`).join('');
  list.addEventListener('click', (e) => {
    const sub = e.target.closest('.yt-sub'); if (!sub) return;
    if (e.target.classList.contains('yt-analyze')) {
      const text = e.target.dataset.text;
      const fn = window.__yomikikuanAnalyzeLine;
      if (typeof fn === 'function') {
        // The handler reads sentence text via extractSentenceText from the
        // line container around the click target. Build a temporary carrier
        // shaped like a real `.line-container` so the handler grabs `text`.
        const carrier = document.createElement('div');
        carrier.className = 'line-container';
        carrier.textContent = text;
        document.body.appendChild(carrier);
        try { fn({ stopPropagation(){}, target: carrier, currentTarget: carrier }); }
        finally { setTimeout(() => carrier.remove(), 200); }
      }
      return;
    }
    if (player && typeof player.seekTo === 'function') {
      player.seekTo(Number(sub.dataset.start), true);
    }
  });
}

function startPolling(root) {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!player || typeof player.getCurrentTime !== 'function') return;
    const t = player.getCurrentTime();
    const i = findActiveIndex(segments, t);
    root.querySelectorAll('.yt-sub.is-active').forEach(el => el.classList.remove('is-active'));
    if (i >= 0) {
      const el = root.querySelector(`.yt-sub[data-i="${i}"]`);
      if (el) { el.classList.add('is-active'); el.scrollIntoView({block:'center', behavior:'smooth'}); }
    }
  }, 250);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

export async function render(root, ctx) {
  stopPolling();
  const { parsed } = ctx;
  root.innerHTML = `
    <style>
      .yt-companion { display:grid; grid-template-rows:auto 1fr; gap:12px; height:100%; }
      .yt-player-wrap { aspect-ratio: 16/9; background:#000; border-radius:8px; overflow:hidden; }
      #ytPlayer { width:100%; height:100%; border:0; }
      #ytSubs { max-height:50vh; overflow-y:auto; border:1px solid var(--border,rgba(0,0,0,0.08));
                border-radius:8px; padding:6px; }
      .yt-sub { display:flex; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; }
      .yt-sub:hover { background:rgba(0,0,0,0.04); }
      .yt-sub.is-active { background:rgba(0,113,227,.12); font-weight:600; }
      .yt-analyze { background:none; border:none; cursor:pointer; opacity:.6; }
      .yt-analyze:hover { opacity:1; }
    </style>
    <div class="yt-companion">
      <div class="yt-player-wrap"><div id="ytPlayer"></div></div>
      <div id="ytSubs">加载字幕中…</div>
    </div>`;

  // 1. Fetch (or load from cache) the timed transcript.
  let json;
  try {
    const key = cacheKey(parsed);
    let raw = await cache.get(key, PROVIDER_ID, SCHEMA_VERSION);
    if (!raw) {
      raw = await callGeminiYoutube(urlFor(parsed.videoId), buildTimedTranscriptPrompt(),
        { startSec: parsed.startSec, endSec: parsed.endSec });
      await cache.set(key, PROVIDER_ID, SCHEMA_VERSION, raw);
    }
    const stripped = String(raw).trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
    json = JSON.parse(stripped);
  } catch (err) {
    root.querySelector('#ytSubs').innerHTML = `<div style="color:#ff3b30">字幕加载失败：${err.message}</div>`;
    return;
  }
  if (json && json.error === 'NO_JAPANESE_AUDIO') {
    root.querySelector('#ytSubs').innerHTML = `<div style="color:#ff3b30">视频没有日语音轨</div>`;
    return;
  }
  segments = Array.isArray(json) ? json : [];

  // 2. Mount player.
  await ensureIframeApi();
  player = new window.YT.Player(root.querySelector('#ytPlayer'), {
    videoId: parsed.videoId,
    playerVars: { start: parsed.startSec || 0 },
    events: { onReady: () => startPolling(root), onStateChange: () => {/* no-op */} },
  });

  // 3. Render subtitle list.
  renderSubtitleList(root);
}

export function teardown() {
  stopPolling();
  if (player && typeof player.destroy === 'function') { try { player.destroy(); } catch(_) {} }
  player = null; segments = [];
}
```

### Step 9.4: Verify pure-helper test passes + register + smoke

```bash
bash scripts/test.sh   # companion-sync passes
```

Browser smoke: open app, ▶️ button, parse a real JP YouTube video, click 🎬 视频伴读 — see player + subtitles, scrub the video, the active line should highlight.

### Step 9.5: Commit

```bash
git add static/js/modules/youtube/tabs/companion.js \
        static/js/modules/youtube/tabs/companion-sync.js \
        static/js/modules/youtube/tabs/companion-sync.test.html \
        scripts/test.sh
git commit -m "feat(youtube): B-tab — IFrame player + timed-subtitle highlight (no playback boundary contact)"
```

---

## Task 10: `tabs/listening.js` — C 听力题

**Files:**
- Create: `static/js/modules/youtube/tabs/listening.js`
- Create: `static/js/modules/youtube/tabs/listening.test.html`

**Goal:** Render a small mode/level/count form (reuse `MODE_META` from JLPT prompts). On submit: call `callGeminiYoutube` with `buildJlptPrompt()`, parse JSON, then call `renderForMode(root, json, mode)` from `analyzer/ui/jlpt/renderers.js`.

### Step 10.1: Test (form rendering smoke)

```html
<script type="module">
  import { render } from './listening.js';
  const results = [];
  const check = (n,c,d)=>results.push({name:n,pass:!!c,detail:d||''});

  const root = document.createElement('div'); document.body.appendChild(root);
  render(root, { parsed:{videoId:'abc12345678'}, meta:{title:'T'}, maxDurationSec:600 });

  check('mode select rendered',  !!root.querySelector('#ytLisMode'));
  check('level select rendered', !!root.querySelector('#ytLisLevel'));
  check('count input rendered',  !!root.querySelector('#ytLisCount'));
  check('generate button',       !!root.querySelector('#ytLisGo'));
  // (Render block)
</script>
```

### Step 10.2: Implement

```js
// static/js/modules/youtube/tabs/listening.js
import { callGeminiYoutube } from '../gemini-yt.js';
import { buildJlptPrompt } from '../prompts.js';
import { MODE_META, stripFences } from '../../analyzer/ui/jlpt/prompts.js';
import { renderForMode, injectCss as injectRenderersCss, stopAll }
  from '../../analyzer/ui/jlpt/renderers.js';
import * as cache from '../../analyzer/cache/idb.js';

const PROVIDER_ID = 'yt-jlpt';
const SCHEMA_VERSION = 1;

function urlFor(id) { return `https://www.youtube.com/watch?v=${id}`; }
function cacheKey({ parsed, mode, level, count }) {
  return JSON.stringify({ id: parsed.videoId, s: parsed.startSec||0, e: parsed.endSec||0, mode, level, count });
}

export function render(root, ctx) {
  injectRenderersCss();
  const modeOpts = Object.entries(MODE_META)
    .map(([k, v]) => `<option value="${k}">${v.emoji} ${v.nameJa} — ${v.nameZh}</option>`).join('');
  root.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <select id="ytLisMode" style="padding:6px 8px">${modeOpts}</select>
      <select id="ytLisLevel" style="padding:6px 8px">
        ${['N5','N4','N3','N2','N1'].map(l => `<option value="${l}"${l==='N3'?' selected':''}>${l}</option>`).join('')}
      </select>
      <input type="number" id="ytLisCount" min="1" max="5" value="3" style="width:64px;padding:6px 8px">
      <button id="ytLisGo" style="padding:6px 14px">生成听力题</button>
    </div>
    <div id="ytLisStatus" style="font-size:13px;opacity:.7"></div>
    <div id="ytLisOut"></div>`;

  const status = root.querySelector('#ytLisStatus');
  const out    = root.querySelector('#ytLisOut');
  root.querySelector('#ytLisGo').addEventListener('click', async () => {
    const mode  = root.querySelector('#ytLisMode').value;
    const level = root.querySelector('#ytLisLevel').value;
    const count = Math.max(1, Math.min(5, Number(root.querySelector('#ytLisCount').value) || 3));
    status.textContent = '生成中…（约 30–90 秒）';
    out.innerHTML = '';
    try {
      const key = cacheKey({ parsed: ctx.parsed, mode, level, count });
      let raw = await cache.get(key, PROVIDER_ID, SCHEMA_VERSION);
      if (!raw) {
        raw = await callGeminiYoutube(urlFor(ctx.parsed.videoId),
          buildJlptPrompt({ level, count, mode }),
          { startSec: ctx.parsed.startSec, endSec: ctx.parsed.endSec });
        await cache.set(key, PROVIDER_ID, SCHEMA_VERSION, raw);
      }
      const data = JSON.parse(stripFences(raw));
      if (data && data.error === 'NO_JAPANESE_AUDIO') throw new Error('NO_JAPANESE_AUDIO');
      status.textContent = '';
      renderForMode(out, data, mode);
    } catch (err) {
      status.textContent = err.message === 'NO_API_KEY' ? '❌ 缺少 Gemini API key'
        : err.message === 'NO_JAPANESE_AUDIO' ? '❌ 视频没有日语音轨'
        : `❌ ${err.message}`;
    }
  });
}

export function teardown() { try { stopAll(); } catch(_){} }
```

### Step 10.3: Register test + commit

```bash
git add static/js/modules/youtube/tabs/listening.js \
        static/js/modules/youtube/tabs/listening.test.html scripts/test.sh
git commit -m "feat(youtube): C-tab — Gemini-generated JLPT listening from video"
```

---

## Task 11: Bump `CACHE_VERSION` (mandatory per playback-boundary rule)

**Files:**
- Modify: `service-worker.js:13`

### Step 11.1: Edit

Change `const CACHE_VERSION = 'v57';` → `const CACHE_VERSION = 'v58';`.

### Step 11.2: Smoke

Hard-reload the running app. The PWA update toast (right-bottom blue 刷新) should appear; click to apply.

### Step 11.3: Commit

```bash
git add service-worker.js
git commit -m "chore(sw): bump CACHE_VERSION v57 → v58 for YouTube panel"
```

---

## Task 12: Final pass — full test run, ROADMAP/CLAUDE.md notes

**Files:**
- Modify: `ROADMAP.md` — add a "Done (this session)" line
- Modify: `CLAUDE.md` — add 2 lines: header button (`#youtubeBtn`), mention the new IDB cache buckets

### Step 12.1: Full test run

```bash
bash scripts/test.sh
```

Expected: full pass, including the new YouTube tests (`url`, `oembed`, `prompts`, `gemini-yt`, `index`, `companion-sync`, `tabs/import`, `tabs/listening`).

### Step 12.2: Doc updates

`CLAUDE.md` → "Header toolbar button IDs" section: append `- #youtubeBtn — ▶️ YouTube import (paste URL → A 字幕导入 / B 视频伴读 / C 听力题)`.

`CLAUDE.md` → IndexedDB table `yomikikuan-analysis` row: append after the existing list of providerIds:
```
`yt-transcript`, `yt-transcript-timed`, `yt-jlpt` (YouTube import — videoId-keyed)
```

`ROADMAP.md` → "Done (this session)" table: append a row for `modules/youtube/*`.

### Step 12.3: Commit

```bash
git add CLAUDE.md ROADMAP.md
git commit -m "docs: note YouTube panel module + new cache providerIds"
```

---

## Out-of-scope (do NOT do as part of this plan)

- ❌ Token-level highlighting in (B) (would touch playback boundary)
- ❌ Mirror `playSegments` / `currentSegments` to `window.*`
- ❌ Adding a YouTube transcript editor UI
- ❌ Multi-video batch
- ❌ Storing YouTube URL → document linkage in document schema (current implementation only stores transcript text — relink is a separate feature)
- ❌ Service-worker interception of YouTube assets (cross-origin, intentionally bypassed)

## Risks already accepted (don't re-litigate during execution)

- **Cost**: 10-min video ≈ 10k input tokens. User key, user money.
- **Embedding**: some videos disable embed; (B) should display "无法嵌入" if `onError` from IFrame fires (file as follow-up if it bites in smoke).
- **iOS autoplay**: iframe won't autoplay on iOS Safari; user must tap play.

## Rollback

Each task is one commit. To roll back the entire feature:
```bash
git revert --no-commit <first-task-sha>..<last-task-sha>
git commit -m "revert: remove YouTube import feature"
# Then bump CACHE_VERSION again (v58 → v59) so SW invalidates.
```
