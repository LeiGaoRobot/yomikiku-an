// Inline sentence analysis card. Mounts directly below a clicked sentence and
// surfaces three tabs: Structure (local rule-based syntax), Explanation (LLM),
// Keywords (vocab list derived from Explanation).
//
// Public API:
//   mountCard(sentenceEl, sentenceText, context) -> { destroy(), el }
//
// `destroy()` removes the DOM and aborts the local AbortController. NOTE: in
// the current API surface, `window.YomikikuanAnalyzer.expandSentence(...)` does
// NOT accept an AbortSignal, so a request still in flight will resolve into a
// noop branch that checks `destroyed` before touching DOM. T12 is expected to
// extend `expandSentence` to forward `signal`; until then, "destroy mid-fetch"
// just means the result is silently discarded (not actually cancelled).
//
// All visible text routed through window.YomikikuanGetText(key, fallback).
// If that helper is unavailable the call sites fall back to the literal
// fallback string — see `t()` below.

import { analyzeSyntax } from '../local/syntax.js';
import { pin, unpin, isPinned } from '../cache/pin.js';

function t(key, fallback) {
  if (typeof window !== 'undefined' && typeof window.YomikikuanGetText === 'function') {
    try {
      const v = window.YomikikuanGetText(key, fallback);
      if (typeof v === 'string' && v.length > 0) return v;
    } catch (_) { /* fall through */ }
  }
  return fallback;
}

// Stable hash for the sentence — used as the pin key inside doc.analysis.
async function sentenceHash(text) {
  try {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-1', enc);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (_) {
    // Fallback: cheap djb2 — only reached if SubtleCrypto is unavailable.
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return `djb2_${(h >>> 0).toString(16)}`;
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildShell() {
  const card = el('div', 'ap-analyzer-card');
  card.setAttribute('role', 'region');

  const tabs = el('div', 'ap-analyzer-card__tabs');
  tabs.setAttribute('role', 'tablist');

  const mkTab = (id, label) => {
    const btn = el('button', `ap-analyzer-card__tab ap-analyzer-card__tab--${id}`, label);
    btn.type = 'button';
    btn.dataset.tab = id;
    btn.setAttribute('role', 'tab');
    return btn;
  };
  const tabStructure = mkTab('structure', t('analyzer.tab.structure', '結構'));
  const tabExplanation = mkTab('explanation', t('analyzer.tab.explanation', '解説'));
  const tabKeywords = mkTab('keywords', t('analyzer.tab.keywords', '重要語'));
  tabs.appendChild(tabStructure);
  tabs.appendChild(tabExplanation);
  tabs.appendChild(tabKeywords);

  const body = el('div', 'ap-analyzer-card__body');
  const panelStructure = el('div', 'ap-analyzer-card__panel ap-analyzer-card__panel--structure');
  panelStructure.dataset.panel = 'structure';
  panelStructure.setAttribute('role', 'tabpanel');
  const panelExplanation = el('div', 'ap-analyzer-card__panel ap-analyzer-card__panel--explanation');
  panelExplanation.dataset.panel = 'explanation';
  panelExplanation.setAttribute('role', 'tabpanel');
  const panelKeywords = el('div', 'ap-analyzer-card__panel ap-analyzer-card__panel--keywords');
  panelKeywords.dataset.panel = 'keywords';
  panelKeywords.setAttribute('role', 'tabpanel');
  body.appendChild(panelStructure);
  body.appendChild(panelExplanation);
  body.appendChild(panelKeywords);

  const footer = el('div', 'ap-analyzer-card__footer');
  const pinBtn = el('button', 'ap-analyzer-card__pin', '');
  pinBtn.type = 'button';
  footer.appendChild(pinBtn);

  card.appendChild(tabs);
  card.appendChild(body);
  card.appendChild(footer);

  return {
    card,
    tabs: { structure: tabStructure, explanation: tabExplanation, keywords: tabKeywords },
    panels: { structure: panelStructure, explanation: panelExplanation, keywords: panelKeywords },
    pinBtn,
  };
}

function loading() {
  const wrap = el('div', 'ap-analyzer-card__loading');
  wrap.appendChild(el('span', 'ap-analyzer-card__spinner'));
  wrap.appendChild(el('span', null, t('analyzer.loading', '解析中…')));
  return wrap;
}

function renderStructure(panel, syntax) {
  panel.textContent = '';
  if (!syntax || !Array.isArray(syntax.tokens) || syntax.tokens.length === 0) {
    panel.appendChild(el('div', 'ap-analyzer-card__empty', t('analyzer.empty', '解析結果なし')));
    return;
  }
  const table = el('table', 'ap-analyzer-card__table');
  const thead = el('thead');
  const trh = el('tr');
  ['surface', 'pos', 'role', 'reading'].forEach((label) => {
    trh.appendChild(el('th', null, label));
  });
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = el('tbody');
  for (const tok of syntax.tokens) {
    const tr = el('tr');
    tr.appendChild(el('td', 'ap-analyzer-card__cell--surface', tok.surface || ''));
    tr.appendChild(el('td', 'ap-analyzer-card__cell--pos', tok.pos || ''));
    const roleTd = el('td', `ap-analyzer-card__cell--role ap-analyzer-card__role--${tok.role || 'other'}`, tok.role || 'other');
    tr.appendChild(roleTd);
    tr.appendChild(el('td', 'ap-analyzer-card__cell--reading', tok.readingKana || ''));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  panel.appendChild(table);
}

function renderExplanation(panel, result) {
  panel.textContent = '';
  if (!result) {
    panel.appendChild(el('div', 'ap-analyzer-card__empty', t('analyzer.empty', '解析結果なし')));
    return;
  }
  if (result.translation) {
    const tr = el('div', 'ap-analyzer-card__translation');
    tr.appendChild(el('div', 'ap-analyzer-card__section-title', t('analyzer.section.translation', 'Translation')));
    tr.appendChild(el('div', 'ap-analyzer-card__translation-body', result.translation));
    panel.appendChild(tr);
  }
  const grammar = Array.isArray(result.grammarPoints) ? result.grammarPoints : [];
  if (grammar.length) {
    const wrap = el('div', 'ap-analyzer-card__grammar');
    wrap.appendChild(el('div', 'ap-analyzer-card__section-title', t('analyzer.section.grammar', 'Grammar')));
    const ul = el('ul', 'ap-analyzer-card__grammar-list');
    for (const g of grammar) ul.appendChild(el('li', null, String(g)));
    wrap.appendChild(ul);
    panel.appendChild(wrap);
  }
  const vocab = Array.isArray(result.vocab) ? result.vocab : [];
  if (vocab.length) {
    const wrap = el('div', 'ap-analyzer-card__vocab');
    wrap.appendChild(el('div', 'ap-analyzer-card__section-title', t('analyzer.section.vocab', 'Vocabulary')));
    const dl = el('dl', 'ap-analyzer-card__vocab-list');
    for (const v of vocab) {
      const term = (v && (v.word || v.term || v.lemma)) || '';
      const gloss = (v && (v.gloss || v.meaning || v.definition)) || '';
      const dt = el('dt', null, String(term));
      const dd = el('dd', null, String(gloss));
      dl.appendChild(dt);
      dl.appendChild(dd);
    }
    wrap.appendChild(dl);
    panel.appendChild(wrap);
  }
}

function renderKeywords(panel, result) {
  panel.textContent = '';
  const vocab = result && Array.isArray(result.vocab) ? result.vocab : null;
  if (!vocab) {
    panel.appendChild(el('div', 'ap-analyzer-card__loading-text', t('analyzer.loading', '解析中…')));
    return;
  }
  if (vocab.length === 0) {
    panel.appendChild(el('div', 'ap-analyzer-card__empty', t('analyzer.empty.keywords', '重点詞なし')));
    return;
  }
  const wrap = el('div', 'ap-analyzer-card__pills');
  for (const v of vocab) {
    const word = (v && (v.word || v.term || v.lemma)) || '';
    if (!word) continue;
    const gloss = (v && (v.gloss || v.meaning || v.definition)) || '';
    const pill = el('span', 'ap-analyzer-card__pill', String(word));
    if (gloss) pill.title = String(gloss);
    wrap.appendChild(pill);
  }
  panel.appendChild(wrap);
}

function renderError(panel, kind) {
  panel.textContent = '';
  const box = el('div', `ap-analyzer-card__error ap-analyzer-card__error--${kind}`);
  if (kind === 'no-key') {
    box.appendChild(el('div', null, t('analyzer.needsKey', 'Gemini API key required')));
    const a = document.createElement('a');
    a.href = '#settings';
    a.className = 'ap-analyzer-card__error-link';
    a.textContent = t('analyzer.openSettings', 'Open Settings');
    box.appendChild(a);
  } else if (kind === 'quota') {
    box.appendChild(el('div', null, t('analyzer.error.quota', '额度超限，稍后再试')));
  } else {
    box.appendChild(el('div', null, t('analyzer.error.generic', '解析失败，重试？')));
    const retryBtn = el('button', 'ap-analyzer-card__retry', t('analyzer.retry', 'Retry'));
    retryBtn.type = 'button';
    retryBtn.dataset.retry = '1';
    box.appendChild(retryBtn);
  }
  panel.appendChild(box);
}

export function mountCard(sentenceEl, sentenceText, context) {
  if (!sentenceEl || !sentenceEl.parentNode) {
    throw new Error('mountCard: sentenceEl must be in the DOM');
  }
  const text = String(sentenceText || '').trim();

  const ctrl = new AbortController();
  let destroyed = false;

  const { card, tabs, panels, pinBtn } = buildShell();

  // Insert as next sibling so reading layout stays intact.
  sentenceEl.parentNode.insertBefore(card, sentenceEl.nextSibling);

  // Animation hook (CSS handles the fade+slide from this class).
  requestAnimationFrame(() => { card.classList.add('ap-analyzer-card--mounted'); });

  // ---- Tab switching --------------------------------------------------------
  let activeTab = 'structure';
  let explanationLoaded = false;
  let explanationLoading = false;
  let explanationResult = null;

  function setActiveTab(name) {
    activeTab = name;
    for (const key of Object.keys(tabs)) {
      const isActive = key === name;
      tabs[key].classList.toggle('ap-analyzer-card__tab--active', isActive);
      tabs[key].setAttribute('aria-selected', isActive ? 'true' : 'false');
      panels[key].classList.toggle('ap-analyzer-card__panel--active', isActive);
    }
    if (name === 'explanation' && !explanationLoaded && !explanationLoading) {
      void loadExplanation();
    }
    if (name === 'keywords') {
      renderKeywords(panels.keywords, explanationResult);
      if (!explanationLoaded && !explanationLoading) void loadExplanation();
    }
  }

  for (const key of Object.keys(tabs)) {
    tabs[key].addEventListener('click', () => setActiveTab(key));
  }

  // ---- Structure (eager, local) --------------------------------------------
  panels.structure.appendChild(loading());
  (async () => {
    try {
      const syntax = await analyzeSyntax(text);
      if (destroyed) return;
      renderStructure(panels.structure, syntax);
    } catch (err) {
      if (destroyed) return;
      panels.structure.textContent = '';
      panels.structure.appendChild(el('div', 'ap-analyzer-card__empty', t('analyzer.error.generic', '解析失败，重试？')));
      // eslint-disable-next-line no-console
      console.warn('[analyzer/ui] syntax failed', err);
    }
  })();

  // ---- Explanation (lazy, network) -----------------------------------------
  async function loadExplanation() {
    if (explanationLoaded || explanationLoading) return;
    explanationLoading = true;
    panels.explanation.textContent = '';
    panels.explanation.appendChild(loading());
    try {
      // NOTE: analyzer.expandSentence currently doesn't accept signal — see
      // file-level comment. When T12 extends the signature, pass ctrl.signal.
      const api = window && window.YomikikuanAnalyzer;
      if (!api || typeof api.expandSentence !== 'function') {
        throw new Error('NO_PROVIDER');
      }
      const result = await api.expandSentence(sentenceEl, text, context);
      if (destroyed) return;
      explanationResult = result || null;
      explanationLoaded = true;
      renderExplanation(panels.explanation, explanationResult);
      // Keywords tab feeds off the same payload — refresh if it's the visible tab.
      if (activeTab === 'keywords') renderKeywords(panels.keywords, explanationResult);
    } catch (err) {
      if (destroyed) return;
      const msg = err && (err.message || String(err));
      let kind = 'generic';
      if (msg === 'NO_API_KEY') kind = 'no-key';
      else if (msg === 'RATE_LIMITED') kind = 'quota';
      renderError(panels.explanation, kind);
      const retryBtn = panels.explanation.querySelector('[data-retry="1"]');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          explanationLoaded = false;
          explanationLoading = false;
          void loadExplanation();
        });
      }
      // eslint-disable-next-line no-console
      console.warn('[analyzer/ui] explanation failed', err);
    } finally {
      explanationLoading = false;
    }
  }

  // ---- Keywords (initial placeholder) --------------------------------------
  renderKeywords(panels.keywords, explanationResult);

  // ---- Pin / Unpin ---------------------------------------------------------
  let pinHash = null;
  let pinned = false;

  function paintPin() {
    pinBtn.textContent = pinned
      ? `✓ ${t('analyzer.unpin', 'Pinned')}`
      : `📌 ${t('analyzer.pin', 'Pin')}`;
    pinBtn.classList.toggle('ap-analyzer-card__pin--on', pinned);
    pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
  }

  function activeDocId() {
    const dm = window && window.documentManager;
    if (!dm || typeof dm.getActiveId !== 'function') return null;
    try { return dm.getActiveId(); } catch (_) { return null; }
  }

  (async () => {
    pinHash = await sentenceHash(text);
    if (destroyed) return;
    const docId = activeDocId();
    if (docId) {
      try { pinned = isPinned(docId, pinHash); } catch (_) { pinned = false; }
    }
    paintPin();
  })();
  paintPin();

  pinBtn.addEventListener('click', async () => {
    if (destroyed) return;
    const docId = activeDocId();
    if (!docId || !pinHash) return;
    pinBtn.disabled = true;
    try {
      if (pinned) {
        await unpin(docId, pinHash);
        pinned = false;
      } else {
        await pin(docId, pinHash, text, explanationResult || { pinnedSyntaxOnly: true });
        pinned = true;
      }
      paintPin();
    } catch (err) {
      const msg = err && err.message;
      if (msg === 'PIN_LIMIT') {
        // Inline notice — no modal dependency.
        const note = el('div', 'ap-analyzer-card__pin-note', t('analyzer.pin.limit', '已达固化上限(200)，请先清理'));
        pinBtn.parentNode.appendChild(note);
        setTimeout(() => { try { note.remove(); } catch (_) {} }, 4000);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[analyzer/ui] pin toggle failed', err);
      }
    } finally {
      if (!destroyed) pinBtn.disabled = false;
    }
  });

  // Default visible tab
  setActiveTab('structure');

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    try { ctrl.abort(); } catch (_) {}
    try { card.remove(); } catch (_) {}
  }

  return { destroy, el: card };
}

export default mountCard;
