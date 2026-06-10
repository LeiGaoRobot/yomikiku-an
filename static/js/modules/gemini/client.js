// Shared Gemini client — single source of truth for model name, endpoint
// URL, API-key lookup, retry policy, and error contract used by the four
// panels (jlptPanel, articleSummary, bilingual, gemini-yt) and the
// per-sentence analyzer provider (providers/gemini.js).
//
// NOT used by tts.js — TTS targets a different model (gemini-3.1-flash-tts-
// preview) and is part of the playback boundary; see CLAUDE.md.
//
// Error contract (Error.message):
//   NO_API_KEY       — localStorage `yomikikuan_gemini_api_key` blank / unreadable
//   RATE_LIMITED     — HTTP 429 after one transient-retry attempt
//   ABORTED          — opts.signal aborted during sleep between retries
//   HTTP_<status>: <body-prefix>  — any non-OK response after retry
//   EMPTY_RESPONSE   — body parsed OK but no candidate text (unless opts.allowEmpty)
//
// Retry policy: a single retry with 1200 ms backoff for {429, 502, 503, 504}.
// Past that, 429 maps to RATE_LIMITED; other non-OK statuses surface verbatim.

export const MODEL_TEXT = 'gemini-2.5-flash';
export const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TEXT}:generateContent`;
export const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
export const RETRY_DELAY_MS = 1200;

const API_KEY_STORAGE = 'yomikikuan_gemini_api_key';

export function getApiKey() {
  try {
    if (typeof localStorage === 'undefined') return '';
    return (localStorage.getItem(API_KEY_STORAGE) || '').trim();
  } catch (_) { return ''; }
}

// Sleep with abort support. Resolves after `ms` or rejects with Error('ABORTED')
// if the AbortSignal fires first.
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Error('ABORTED'));
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => { clearTimeout(t); reject(new Error('ABORTED')); };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

// Convenience body builder for text-only prompts. The 4 dedup'd panels
// pass strict-JSON prompts at varying temperatures; providers/gemini.js
// passes free-form text. Call with `{ json: false }` for the latter.
export function textBody(prompt, { temperature = 0.4, json = true } = {}) {
  const generationConfig = { temperature };
  if (json) generationConfig.responseMimeType = 'application/json';
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
  };
}

// callGemini(body, opts) → resolves to the extracted candidate text.
//
// `body` is the full :generateContent request body — each caller crafts
// its own (multimodal callers pass fileData, batch callers pass numbered
// prompts, etc.). The shared logic is: key lookup → POST → retry on
// transient → map errors → extract candidates[0].content.parts[0].text.
//
// opts:
//   signal       AbortSignal — passed to fetch + sleep-between-retries.
//   fetchImpl    Override (for tests). Defaults to globalThis.fetch.
//   endpoint     Override endpoint URL (for tests / alt model in future).
//   key          Override key (for tests). Default: getApiKey().
//   allowEmpty   Return '' instead of throwing EMPTY_RESPONSE.
//   errorBodySlice  Max chars from response body in HTTP_<status>: error
//                   message. Default 200; 0 = omit body. providers/gemini.js
//                   used to throw bare HTTP_<status> with no body — pass 0
//                   to preserve that contract.
export async function callGemini(body, opts = {}) {
  const {
    signal,
    fetchImpl,
    endpoint = ENDPOINT,
    key: keyOverride,
    allowEmpty = false,
    errorBodySlice = 200,
  } = opts;

  const key = (keyOverride === undefined) ? getApiKey() : keyOverride;
  if (!key) throw new Error('NO_API_KEY');

  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) throw new Error('NO_FETCH');

  const url = `${endpoint}?key=${encodeURIComponent(key)}`;
  const attempt = () => doFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  let res = await attempt();
  if (TRANSIENT_STATUSES.has(res.status)) {
    await sleep(RETRY_DELAY_MS, signal);
    res = await attempt();
  }
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) {
    let msg = `HTTP_${res.status}`;
    if (errorBodySlice > 0) {
      const txt = await res.text().catch(() => '');
      msg += `: ${txt.slice(0, errorBodySlice)}`;
    }
    throw new Error(msg);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) {
    if (allowEmpty) return '';
    throw new Error('EMPTY_RESPONSE');
  }
  return text;
}
