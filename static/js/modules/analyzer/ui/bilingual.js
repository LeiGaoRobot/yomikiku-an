// Bilingual mode — renders a Chinese translation under each .line-container
// in the reading pane. Translations are batched into a single Gemini call
// (fast), then individually cached in the shared analyzer IDB store for
// later re-toggles to be instantaneous.
//
// Public surface:
//   toggle() / show() / hide()
//   window.__yomikikuanToggleBilingual
//   window.__yomikikuanBilingualState  { enabled: boolean }

import * as cache from '../cache/idb.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const PROVIDER_ID = 'translate-zh';
const SCHEMA_VERSION = 1;
const LS_KEY = 'yomikikuan_bilingual_mode';
const CSS_INJECTED = '__yomikikuanBilingualCssInjected';

let state = { enabled: false, mo: null };

function apiKey() {
  try { return (localStorage.getItem('yomikikuan_gemini_api_key') || '').trim(); }
  catch (_) { return ''; }
}

function injectCss() {
  if (window[CSS_INJECTED]) return;
  window[CSS_INJECTED] = true;
  const css = `
    .bilingual-row {
      margin-top: 4px;
      margin-bottom: 12px;
      padding: 6px 10px;
      border-left: 3px solid var(--accent, #0071e3);
      background: rgba(0,113,227,0.04);
      color: var(--muted, #555);
      font-size: 0.85em;
      line-height: 1.6;
      border-radius: 4px;
      white-space: pre-wrap;
    }
    .bilingual-row[data-state="loading"] { opacity: 0.55; font-style: italic; }
    .bilingual-row[data-state="error"] {
      border-left-color: #ff3b30;
      color: #ff3b30;
      background: rgba(255,59,48,0.04);
    }
    :root[data-theme="dark"] .bilingual-row {
      background: rgba(10,132,255,0.08);
      color: rgba(255,255,255,0.72);
    }
    :root[data-theme="dark"] .bilingual-row[data-state="error"] {
      background: rgba(255,69,58,0.08);
      color: #ff6961;
    }
    #bilingualToggle[aria-pressed="true"] { color: var(--accent, #0071e3); }
  `;
  const s = document.createElement('style');
  s.id = 'bilingual-css';
  s.textContent = css;
  document.head.appendChild(s);
}

function extractLineText(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('rt').forEach((rt) => rt.remove());
  clone.querySelectorAll('.play-line-btn, .analyze-line-btn, .ap-analyzer-card, .bilingual-row').forEach((n) => n.remove());
  return (clone.textContent || '').trim();
}

function getLineContainers() {
  const content = document.getElementById('content');
  if (!content) return [];
  return Array.from(content.querySelectorAll('.line-container'));
}

// --- Gemini batched translate ---

function buildPrompt(lines) {
  const numbered = lines.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return `Translate the following Japanese sentences into CONCISE Simplified Chinese (大陸 Mandarin). Preserve the original sentence count and order. Output strict JSON only: an array of strings, one translation per input sentence, same length as input. No markdown, no fences, no numbering in the output strings.

Input:
${numbered}

Expected output shape (length = ${lines.length}): ["…","…",…]`;
}

async function callGeminiBatch(lines, signal) {
  const key = apiKey();
  if (!key) throw new Error('NO_API_KEY');
  const TRANSIENT = new Set([429, 502, 503, 504]);
  const attempt = () => fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(lines) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
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
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP_${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('EMPTY_RESPONSE');
  let arr;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
    arr = JSON.parse(cleaned);
  } catch (_) { throw new Error('BAD_SHAPE'); }
  if (!Array.isArray(arr)) throw new Error('BAD_SHAPE');
  // Tolerate shape drift: if mismatched length, pad/truncate.
  if (arr.length < lines.length) {
    while (arr.length < lines.length) arr.push('');
  } else if (arr.length > lines.length) {
    arr.length = lines.length;
  }
  return arr.map((t) => String(t || ''));
}

// --- Row management on the DOM ---

function mountRow(lineEl, stateAttr, text) {
  let row = lineEl.nextElementSibling;
  if (!row || !row.classList || !row.classList.contains('bilingual-row')) {
    row = document.createElement('div');
    row.className = 'bilingual-row';
    lineEl.insertAdjacentElement('afterend', row);
  }
  row.setAttribute('data-state', stateAttr);
  row.textContent = text;
  return row;
}

function removeRows() {
  document.querySelectorAll('.bilingual-row').forEach((n) => n.remove());
}

async function renderOnce() {
  const containers = getLineContainers();
  if (!containers.length) return;

  const entries = containers.map((el) => ({ el, text: extractLineText(el) }))
                            .filter((e) => e.text);
  if (!entries.length) return;

  // Pass 1: fill cache hits immediately, collect misses
  const misses = [];
  for (const e of entries) {
    try {
      const hit = await cache.get(e.text, PROVIDER_ID, SCHEMA_VERSION);
      if (typeof hit === 'string' && hit) {
        mountRow(e.el, 'ok', hit);
        continue;
      }
    } catch (_) { /* fall through */ }
    mountRow(e.el, 'loading', '翻译中…');
    misses.push(e);
  }

  if (!misses.length) return;

  if (!apiKey()) {
    misses.forEach((m) => mountRow(m.el, 'error', '未配置 Gemini API key — 请在设置里填入后重试'));
    return;
  }

  // Pass 2: batched Gemini call for misses
  try {
    const translations = await callGeminiBatch(misses.map((m) => m.text));
    for (let i = 0; i < misses.length; i++) {
      const zh = translations[i] || '';
      if (!state.enabled) return; // user toggled off mid-flight
      if (zh) {
        mountRow(misses[i].el, 'ok', zh);
        try { await cache.put(misses[i].text, PROVIDER_ID, SCHEMA_VERSION, zh); } catch (_) {}
      } else {
        mountRow(misses[i].el, 'error', '翻译为空');
      }
    }
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const label = msg === 'NO_API_KEY' ? '未配置 Gemini API key'
      : msg === 'RATE_LIMITED' ? 'API 额度超限'
      : msg === 'BAD_SHAPE' ? '返回格式异常'
      : msg === 'ABORTED' ? '已取消'
      : `翻译失败：${msg}`;
    misses.forEach((m) => mountRow(m.el, 'error', label));
  }
}

// Re-render translations whenever the reading pane changes (e.g. user
// re-analyzes, switches doc, toggles ruby mode). We observe #content and
// re-run when a new batch of .line-container nodes appears.
function attachObserver() {
  if (state.mo) return;
  const content = document.getElementById('content');
  if (!content) return;
  let pending = null;
  state.mo = new MutationObserver((muts) => {
    // Filter out our own mutations: ignore childList mutations that only
    // added / removed .bilingual-row nodes (otherwise we'd loop forever).
    const onlyOurOwn = muts.every((m) => {
      const added = Array.from(m.addedNodes || []);
      const removed = Array.from(m.removedNodes || []);
      const isOurs = (n) => n && n.classList && n.classList.contains('bilingual-row');
      return (added.length === 0 || added.every(isOurs))
          && (removed.length === 0 || removed.every(isOurs));
    });
    if (onlyOurOwn) return;
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      if (state.enabled) renderOnce().catch((e) => console.warn('[bilingual] render failed', e));
    }, 150);
  });
  state.mo.observe(content, { childList: true, subtree: true });
}

function detachObserver() {
  if (state.mo) { try { state.mo.disconnect(); } catch (_) {} state.mo = null; }
}

// --- Public API ---

export function show() {
  if (state.enabled) return;
  state.enabled = true;
  window.__yomikikuanBilingualState = { enabled: true };
  try { localStorage.setItem(LS_KEY, 'true'); } catch (_) {}
  const btn = document.getElementById('bilingualToggle');
  if (btn) btn.setAttribute('aria-pressed', 'true');
  injectCss();
  attachObserver();
  renderOnce().catch((err) => console.warn('[bilingual] render failed', err));
}

export function hide() {
  state.enabled = false;
  window.__yomikikuanBilingualState = { enabled: false };
  try { localStorage.removeItem(LS_KEY); } catch (_) {}
  const btn = document.getElementById('bilingualToggle');
  if (btn) btn.setAttribute('aria-pressed', 'false');
  detachObserver();
  removeRows();
}

export function toggle() {
  if (state.enabled) hide(); else show();
}

if (typeof window !== 'undefined') {
  window.__yomikikuanToggleBilingual = toggle;
  window.__yomikikuanBilingualState = { enabled: false };
  // Auto-enable on load if persisted.
  try {
    if (localStorage.getItem(LS_KEY) === 'true') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => show());
      } else {
        show();
      }
    }
  } catch (_) {}
}
