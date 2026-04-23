// Article-level Explanation — full-document summary, key sentences, learning
// points, and a JLPT-level recommendation. Uses the same Gemini key + IDB
// cache as jlptPanel.js (different providerId namespace).
//
// Public surface:
//   mountPanel(doc) / unmountPanel()
//   window.__yomikikuanOpenArticleSummary

import * as cache from '../cache/idb.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const SCHEMA_VERSION = 1;
const PROVIDER_ID = 'article-summary';
const CSS_INJECTED = '__yomikikuanSummaryCssInjected';

function apiKey() {
  try { return (localStorage.getItem('yomikikuan_gemini_api_key') || '').trim(); }
  catch (_) { return ''; }
}

function tr(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.YomikikuanGetText === 'function') {
      const v = window.YomikikuanGetText(key, fallback);
      if (typeof v === 'string') return v;
    }
  } catch (_) {}
  return fallback;
}

function injectCss() {
  if (window[CSS_INJECTED]) return;
  window[CSS_INJECTED] = true;
  const css = `
    .summary-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      animation: summaryFadeIn 160ms ease;
    }
    @keyframes summaryFadeIn { from { opacity: 0; } to { opacity: 1; } }
    .summary-panel {
      background: var(--bg, #fff); color: var(--fg, #111);
      width: min(720px, 100%); max-height: calc(100vh - 48px);
      border-radius: 16px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.25);
      display: flex; flex-direction: column; overflow: hidden;
      border: 1px solid var(--border, rgba(0,0,0,0.1));
    }
    .summary-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 20px; border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
    }
    .summary-panel-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
    .summary-close {
      background: none; border: none; font-size: 22px; cursor: pointer;
      color: var(--muted, #888); line-height: 1; padding: 0 4px;
    }
    .summary-controls {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
      font-size: 13px;
    }
    .summary-go {
      padding: 6px 14px; border-radius: 8px; border: none;
      background: var(--accent, #0071e3); color: #fff; font-weight: 500;
      cursor: pointer; font-size: 13px;
    }
    .summary-go:disabled { opacity: 0.5; cursor: wait; }
    .summary-regen {
      padding: 6px 14px; border-radius: 8px;
      background: transparent; color: var(--accent, #0071e3);
      border: 1px solid var(--accent, #0071e3);
      cursor: pointer; font-size: 13px;
    }
    .summary-status { font-size: 12px; color: var(--muted, #888); }
    .summary-body {
      padding: 18px 22px 24px; overflow-y: auto; flex: 1;
      display: flex; flex-direction: column; gap: 18px;
      font-size: 14px; line-height: 1.7;
    }
    .summary-section h4 {
      margin: 0 0 8px; font-size: 13px; font-weight: 600;
      color: var(--muted, #666); text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .summary-section .summary-text { white-space: pre-wrap; }
    .summary-section ul { margin: 0; padding-left: 20px; }
    .summary-section ul li { margin-bottom: 6px; }
    .summary-level-pill {
      display: inline-block;
      padding: 3px 10px; border-radius: 999px;
      background: var(--accent, #0071e3); color: #fff;
      font-weight: 600; font-size: 12px;
    }
    :root[data-theme="dark"] .summary-panel { background: #1c1c1e; color: #f2f2f7; }
  `;
  const s = document.createElement('style');
  s.id = 'summary-panel-css';
  s.textContent = css;
  document.head.appendChild(s);
}

function buildPrompt(article) {
  return `You are a senior Japanese-language teacher. Read the article below and produce a structured summary for a learner.

Article:
"""
${article}
"""

Output strict JSON only (no markdown, no fences), matching this schema:
{
  "summary": "一段日文要约（3–5 句），以学习者视角概括文章主旨",
  "keySentences": ["原文中最值得精读的 3–5 句话（必须是原文句子的逐字引用）"],
  "recommendedLevel": "N5" | "N4" | "N3" | "N2" | "N1",
  "learningPoints": ["3–6 条学习重点，中日双语，每条形如「語彙：〇〇（意味）／ 句型：〇〇（用法）」"]
}`;
}

async function callGemini(prompt, signal) {
  const key = apiKey();
  if (!key) throw new Error('NO_API_KEY');
  const TRANSIENT = new Set([429, 502, 503, 504]);
  const attempt = () => fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
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
  return text;
}

function parseJson(raw) {
  const cleaned = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  return JSON.parse(cleaned);
}

function render(bodyEl, payload) {
  bodyEl.innerHTML = '';
  if (!payload) { bodyEl.textContent = tr('panel.summary.empty', '无结果'); return; }

  if (payload.summary) {
    const sec = document.createElement('div');
    sec.className = 'summary-section';
    sec.innerHTML = `<h4>要約</h4><div class="summary-text"></div>`;
    sec.querySelector('.summary-text').textContent = payload.summary;
    bodyEl.appendChild(sec);
  }

  if (payload.recommendedLevel) {
    const sec = document.createElement('div');
    sec.className = 'summary-section';
    sec.innerHTML = `<h4>推奨レベル</h4>`;
    const pill = document.createElement('span');
    pill.className = 'summary-level-pill';
    pill.textContent = payload.recommendedLevel;
    sec.appendChild(pill);
    bodyEl.appendChild(sec);
  }

  if (Array.isArray(payload.keySentences) && payload.keySentences.length) {
    const sec = document.createElement('div');
    sec.className = 'summary-section';
    sec.innerHTML = `<h4>キー文</h4>`;
    const ul = document.createElement('ul');
    payload.keySentences.forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    bodyEl.appendChild(sec);
  }

  if (Array.isArray(payload.learningPoints) && payload.learningPoints.length) {
    const sec = document.createElement('div');
    sec.className = 'summary-section';
    sec.innerHTML = `<h4>学習ポイント</h4>`;
    const ul = document.createElement('ul');
    payload.learningPoints.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p;
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    bodyEl.appendChild(sec);
  }
}

let activePanel = null;

export function mountPanel(doc) {
  injectCss();
  if (activePanel) return activePanel;
  const article = Array.isArray(doc?.content) ? doc.content.join('\n') : String(doc?.content || '');
  if (!article.trim()) { alert(tr('panel.error.doc_empty', '当前文档为空')); return null; }

  const root = document.createElement('div');
  root.className = 'summary-overlay';
  root.innerHTML = `
    <div class="summary-panel" role="dialog" aria-label="文章解析">
      <header class="summary-panel-header">
        <h3>📖 文章解析</h3>
        <button class="summary-close" type="button" aria-label="关闭">×</button>
      </header>
      <div class="summary-controls">
        <button class="summary-go" data-role="go" type="button">生成</button>
        <button class="summary-regen" data-role="regen" type="button">重新生成</button>
        <span class="summary-status" data-role="status"></span>
      </div>
      <div class="summary-body" data-role="body"></div>
    </div>
  `;
  document.body.appendChild(root);

  let controller = null;
  let escHandler = null;
  const close = () => {
    try { controller && controller.abort(); } catch (_) {}
    if (escHandler) document.removeEventListener('keydown', escHandler);
    root.remove();
    activePanel = null;
  };
  root.querySelector('.summary-close').addEventListener('click', close);
  root.addEventListener('click', (ev) => { if (ev.target === root) close(); });
  escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);

  const go = root.querySelector('[data-role="go"]');
  const regen = root.querySelector('[data-role="regen"]');
  const status = root.querySelector('[data-role="status"]');
  const body = root.querySelector('[data-role="body"]');
  const ckey = JSON.stringify({ docId: doc && doc.id });

  async function run({ bypassCache } = {}) {
    go.disabled = true; regen.disabled = true;
    body.innerHTML = '';
    if (!bypassCache) {
      try {
        const hit = await cache.get(ckey, PROVIDER_ID, SCHEMA_VERSION);
        if (hit && (hit.summary || hit.keySentences)) {
          render(body, hit);
          status.textContent = tr('panel.cache.loaded', '已从缓存加载 — 点"重新生成"可重新调用 Gemini');
          go.disabled = false; regen.disabled = false;
          return;
        }
      } catch (_) {}
    }
    if (!apiKey()) {
      status.textContent = tr('panel.error.no_key', '请先在设置中填写 Gemini API key');
      go.disabled = false; regen.disabled = false;
      return;
    }
    status.textContent = bypassCache ? tr('panel.regenerating', '忽略缓存，重新生成中…') : tr('panel.generating', '生成中…');
    try { controller && controller.abort(); } catch (_) {}
    controller = new AbortController();
    try {
      const raw = await callGemini(buildPrompt(article), controller.signal);
      const payload = parseJson(raw);
      if (!payload || (!payload.summary && !Array.isArray(payload.keySentences))) throw new Error('BAD_SHAPE');
      render(body, payload);
      status.textContent = tr('panel.generated', '已生成');
      try { await cache.put(ckey, PROVIDER_ID, SCHEMA_VERSION, payload); } catch (_) {}
    } catch (err) {
      console.warn('[article-summary] failed', err);
      const msg = err && err.message ? err.message : String(err);
      if (msg === 'NO_API_KEY') status.textContent = tr('panel.error.no_key', '请先在设置中填写 Gemini API key');
      else if (msg === 'RATE_LIMITED') status.textContent = tr('panel.error.rate_limited', 'API 额度超限，稍后再试');
      else if (msg === 'BAD_SHAPE' || msg === 'EMPTY_RESPONSE') status.textContent = tr('panel.error.bad_shape', '模型返回格式异常，请重试');
      else if (err && err.name === 'AbortError') status.textContent = tr('panel.aborted', '已取消');
      else status.textContent = (window.YomikikuanFormat ? window.YomikikuanFormat('panel.error.generic_fmt', { msg }) : `生成失败：${msg}`);
    } finally {
      go.disabled = false; regen.disabled = false;
    }
  }

  go.addEventListener('click', () => run({ bypassCache: false }));
  regen.addEventListener('click', () => run({ bypassCache: true }));

  // Auto-run on open — feels better than an extra click for most users.
  run({ bypassCache: false });

  activePanel = root;
  return root;
}

export function unmountPanel() {
  if (activePanel) { activePanel.remove(); activePanel = null; }
}

if (typeof window !== 'undefined') {
  window.__yomikikuanOpenArticleSummary = function () {
    const dm = window.documentManager;
    if (!dm || typeof dm.getAllDocuments !== 'function') { alert(tr('panel.error.no_docmgr', '文档管理器未就绪')); return; }
    const activeId = typeof dm.getActiveId === 'function' ? dm.getActiveId() : null;
    const doc = dm.getAllDocuments().find((d) => d && d.id === activeId);
    if (!doc) { alert(tr('panel.error.no_doc', '请先选择一个文档')); return; }
    mountPanel(doc);
  };
}
