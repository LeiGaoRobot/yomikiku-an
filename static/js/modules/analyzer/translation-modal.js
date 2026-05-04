// Translation modal — JMdict lookup + detailed translation popup.
// Extracted from main-js.js (Phase 1).
//
//   1. loadTranslation(element, ctx)         — async; reads `data-token`
//      from a `.token-pill`, resolves a query (lemma → reading → alias),
//      hits `window.dictionaryService`, then writes the main translation
//      into the inline `.translation-content` host. If multiple senses,
//      adds an "expand" button that mounts the detailed modal.
//
//   2. showDetailedTranslation(detailedInfo, container, ctx)  — async;
//      builds the full senses modal, mounts an AI-gloss button via
//      `window.YomikikuanAnalyzer.glossWord`, observes future
//      translation-modal mounts to keep token-detail panels hidden,
//      wires close + click-outside teardown.
//
// Pure DI for the moving pieces; reads stable `window.*` APIs directly:
//   - window.dictionaryService           (JMdict client, mounted at boot)
//   - window.YomikikuanDict.getTechOverride
//   - window.YomikikuanGetText           (i18n)
//   - window.YomikikuanAnalyzer.glossWord (AI gloss)
//   - window.__yomikikuanAddVocab         (vocab-book hook)
//   - window.documentManager.getActiveId
//
// Boot-race contract: handler-only (called from token-pill click handler),
// so when this code runs the dynamic-import block has long resolved.
//
// IMPORTANT: this module touches no playback boundary state.

const LATIN_RE = /^[A-Za-z0-9 .,:;!?\-_/+()\[\]{}'"%&@#*]+$/;

const DEFAULT_ALIASES = {
  'アプリ': 'アプリケーション',
  'web': 'ウェブ',
  'Web': 'ウェブ',
  'WEB': 'ウェブ',
};

function isLatinish(s) {
  return LATIN_RE.test(String(s || ''));
}

/**
 * Resolve the dictionary query string for a token.
 * Pure: lemma/reading/surface in, query string out.
 *
 * Order:
 *   1. lemma (if it's a real value, not '*')
 *   2. reading (when 1 is missing)
 *   3. surface (when 2 is missing)
 * Then if the chosen query is Latin-ish AND a reading exists, switch to
 * the reading (so 'API' → 'エーピーアイ', etc.).
 */
export function resolveDictionaryQuery(token) {
  if (!token) return '';
  const lemma = token.lemma;
  const surface = token.surface;
  const reading = token.reading;
  let query = (lemma && lemma !== '*') ? lemma : (reading || surface);
  if (isLatinish(query) && reading) query = reading;
  return query || '';
}

/**
 * Apply the alias-substitution table when the primary query yields no
 * results. Returns the alias query, or '' when no alias is configured.
 */
export function aliasFor(query, aliases) {
  const table = aliases || DEFAULT_ALIASES;
  return (query && Object.prototype.hasOwnProperty.call(table, query))
    ? table[query]
    : '';
}

/**
 * Async: populate `.translation-content` for an active token-pill.
 *
 * @param {Element} element  The token-pill DOM node carrying `data-token`.
 * @param {object} ctx
 * @param {() => string} [ctx.getCurrentLang]  Defaults to () => 'ja'.
 * @param {() => any} [ctx.getActiveTokenDetails]  Defaults to () => null.
 * @param {(key: string, fallback?: string) => string} [ctx.t]
 *        i18n; defaults to identity-or-fallback.
 * @param {object} [ctx.aliases]  Override the alias table (testing).
 * @param {object} [ctx.dict]     Inject the dictionary service (testing);
 *        defaults to window.dictionaryService.
 * @param {(token: object) => any} [ctx.getTechOverride]
 *        Defaults to window.YomikikuanDict?.getTechOverride.
 * @param {(detailedInfo: object, container: Element) => any} [ctx.showDetailed]
 *        Defaults to the local showDetailedTranslation.
 * @returns {Promise<{ outcome: string }>}
 *        outcome ∈ 'no-host' | 'override' | 'main' | 'no-result' | 'error'
 */
export async function loadTranslation(element, ctx) {
  const c = ctx || {};
  const t = (typeof c.t === 'function') ? c.t : ((k, fb) => fb || k);
  const getCurrentLang = (typeof c.getCurrentLang === 'function') ? c.getCurrentLang : (() => 'ja');
  const getActive = (typeof c.getActiveTokenDetails === 'function') ? c.getActiveTokenDetails : (() => null);
  const dict = c.dict || (typeof window !== 'undefined' ? window.dictionaryService : null);
  const getTechOverride = (typeof c.getTechOverride === 'function')
    ? c.getTechOverride
    : ((tok) => (typeof window !== 'undefined' && window.YomikikuanDict && window.YomikikuanDict.getTechOverride)
        ? window.YomikikuanDict.getTechOverride(tok) : null);
  const aliases = c.aliases || DEFAULT_ALIASES;
  const showDetailed = (typeof c.showDetailed === 'function')
    ? c.showDetailed
    : ((info, host) => showDetailedTranslation(info, host, ctx));

  if (!element || typeof element.getAttribute !== 'function') return { outcome: 'no-host' };
  let tokenData;
  try { tokenData = JSON.parse(element.getAttribute('data-token') || '{}'); }
  catch (_) { return { outcome: 'no-host' }; }

  let translationContent = element.querySelector
    ? element.querySelector('.translation-content')
    : null;
  const active = getActive();
  if (!translationContent && active && active.element === element && active.details) {
    translationContent = active.details.querySelector('.translation-content');
  }
  if (!translationContent) return { outcome: 'no-host' };

  try {
    // Tech-term override (multi-language)
    const override = getTechOverride(tokenData);
    if (override && override.translations) {
      const lang = getCurrentLang() || 'ja';
      const text = override.translations[lang] || override.translations.ja || '';
      if (text) {
        translationContent.textContent = text;
        return { outcome: 'override' };
      }
    }

    if (!dict || typeof dict.isReady !== 'function' || typeof dict.getDetailedInfo !== 'function') {
      translationContent.textContent = t('translation_failed', '翻译加载失败');
      return { outcome: 'error' };
    }

    if (!dict.isReady()) {
      translationContent.textContent = t('dict_init', '正在初始化词典...');
      if (typeof dict.init === 'function') await dict.init();
    }

    const query = resolveDictionaryQuery(tokenData);
    let detailedInfo = await dict.getDetailedInfo(query);
    if (!detailedInfo) {
      const alias = aliasFor(query, aliases);
      if (alias) detailedInfo = await dict.getDetailedInfo(alias);
    }

    if (detailedInfo && detailedInfo.senses && detailedInfo.senses.length > 0) {
      const mainTranslation = detailedInfo.senses[0].gloss;
      translationContent.innerHTML = `<span class="main-translation">${mainTranslation}</span>`;

      if (detailedInfo.senses.length > 1) {
        const expandBtn = document.createElement('button');
        expandBtn.className = 'expand-translation-btn';
        expandBtn.textContent = `(+${detailedInfo.senses.length - 1}个词义)`;
        expandBtn.onclick = (e) => {
          e.stopPropagation();
          showDetailed(detailedInfo, translationContent);
        };
        translationContent.appendChild(expandBtn);
      }

      if (detailedInfo.kana && detailedInfo.kana.length > 0) {
        const kanaInfo = detailedInfo.kana.map((k) => k.text).join('、');
        const kanaElement = document.createElement('div');
        kanaElement.className = 'translation-kana';
        kanaElement.textContent = `${t('lbl_reading', '读音')}: ${kanaInfo}`;
        translationContent.appendChild(kanaElement);
      }
      return { outcome: 'main' };
    } else {
      translationContent.textContent = t('no_translation', '未找到翻译');
      return { outcome: 'no-result' };
    }
  } catch (error) {
    try { console.error('加载翻译失败:', error); } catch (_) {}
    translationContent.textContent = t('translation_failed', '翻译加载失败');
    return { outcome: 'error' };
  }
}

/**
 * Build the modal HTML markup for a detailed-info payload.
 * Pure: data in, string out. Used by showDetailedTranslation.
 */
export function buildDetailedTranslationMarkup(detailedInfo, t) {
  const tt = (typeof t === 'function') ? t : ((k, fb) => fb || k);
  const word = (detailedInfo && detailedInfo.word) ? String(detailedInfo.word) : '';
  const senses = Array.isArray(detailedInfo && detailedInfo.senses) ? detailedInfo.senses : [];

  const sensesHtml = senses.map((sense, index) => {
    const partOfSpeech = Array.isArray(sense && sense.partOfSpeech) ? sense.partOfSpeech : [];
    const field = Array.isArray(sense && sense.field) ? sense.field : [];
    const misc = Array.isArray(sense && sense.misc) ? sense.misc : [];
    return `
            <div class="sense-item">
              <div class="sense-number">${index + 1}.</div>
              <div class="sense-content">
                <div class="sense-gloss">${(sense && sense.gloss) || ''}</div>
                ${partOfSpeech.length > 0 ? `<div class="sense-pos">${tt('lbl_pos', '词性')}: ${partOfSpeech.join(', ')}</div>` : ''}
                ${field.length > 0 ? `<div class="sense-field">${tt('lbl_field', '领域')}: ${field.join(', ')}</div>` : ''}
                ${misc.length > 0 ? `<div class="sense-misc">${tt('lbl_note', '备注')}: ${misc.join(', ')}</div>` : ''}
                ${(sense && sense.chineseSource) ? `<div class="sense-chinese">${tt('lbl_chinese', '中文')}: ${sense.chineseSource}</div>` : ''}
              </div>
            </div>`;
  }).join('');

  return `
      <div class="translation-modal-content">
        <div class="translation-modal-header">
          <h3>${word} ${tt('dlg_detail_translation', '的详细翻译')}</h3>
          <button class="close-modal-btn" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="translation-modal-body">
          ${sensesHtml}
          <div class="dict-ai-gloss-footer"></div>
        </div>
      </div>
    `;
}

/**
 * Show the detailed-translation modal. Mounts on document.body, wires
 * close handlers, and attaches an AI-gloss button.
 */
export async function showDetailedTranslation(detailedInfo, container, ctx) {
  const c = ctx || {};
  const t = (typeof c.t === 'function') ? c.t : ((k, fb) => fb || k);
  const setActive = (typeof c.setActiveTokenDetails === 'function') ? c.setActiveTokenDetails : (() => {});
  const doc = c.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { outcome: 'no-document' };

  // Hide existing token-detail popups (avoid overlap)
  doc.querySelectorAll('.token-details').forEach((d) => { d.style.display = 'none'; });
  doc.querySelectorAll('.token-pill').forEach((p) => { p.classList.remove('active'); });

  // If an active panel was floated to <body>, return it to its host before opening modal
  try {
    const prev = (typeof c.getActiveTokenDetails === 'function') ? c.getActiveTokenDetails() : null;
    if (prev && prev.details && prev.element && prev.details.parentNode === doc.body) {
      prev.details.style.display = 'none';
      prev.details.style.visibility = 'hidden';
      try { prev.element.appendChild(prev.details); } catch (_) {}
    }
  } catch (_) {}
  setActive(null);

  const modal = doc.createElement('div');
  modal.className = 'translation-modal';
  modal.innerHTML = buildDetailedTranslationMarkup(detailedInfo, t);

  // ---- Reading Analyzer T15: AI-contextual-gloss button ----
  (function attachAiGlossButton() {
    const footer = modal.querySelector('.dict-ai-gloss-footer');
    if (!footer) return;
    const tt = (key, fb) => {
      try {
        if (typeof window !== 'undefined' && typeof window.YomikikuanGetText === 'function') {
          const v = window.YomikikuanGetText(key, fb);
          if (typeof v === 'string' && v.length > 0) return v;
        }
      } catch (_) {}
      return fb;
    };

    function resolveSentence() {
      let pill = null;
      try {
        if (container && container.closest) pill = container.closest('.token-pill');
        if (!pill && container) {
          const detailsHost = container.closest && container.closest('.token-details');
          if (detailsHost && detailsHost.__ownerTokenElement) pill = detailsHost.__ownerTokenElement;
        }
      } catch (_) {}
      const lineEl = pill && pill.closest ? pill.closest('.line-container') : null;
      if (!lineEl) return '';
      const clone = lineEl.cloneNode(true);
      clone.querySelectorAll('rt, .play-line-btn, .ap-analyzer-card').forEach((n) => n.remove());
      return (clone.textContent || '').trim();
    }

    const word = (detailedInfo && detailedInfo.word) ? String(detailedInfo.word) : '';
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'dict-ai-gloss-btn';
    btn.textContent = tt('analyzer.glossBtn', 'AI 释义');
    footer.appendChild(btn);

    const resultBox = doc.createElement('div');
    resultBox.className = 'dict-ai-gloss';
    resultBox.style.display = 'none';
    footer.appendChild(resultBox);

    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = tt('analyzer.loading', '解析中...');
      resultBox.style.display = '';
      resultBox.classList.remove('dict-ai-gloss--error');
      resultBox.textContent = '';
      const sentence = resolveSentence() || word;
      try {
        const api = (typeof window !== 'undefined') ? window.YomikikuanAnalyzer : null;
        if (!api || typeof api.glossWord !== 'function') throw new Error('NO_PROVIDER');
        const result = await api.glossWord(word, sentence);
        let text = '';
        if (typeof result === 'string') text = result;
        else if (result && typeof result === 'object') {
          text = result.gloss || result.translation || result.text || '';
        }
        if (!text) text = tt('analyzer.error.generic', '解析失败，重试？');
        resultBox.textContent = text;

        try {
          if (typeof window !== 'undefined' && typeof window.__yomikikuanAddVocab === 'function' && word) {
            const saveBtn = doc.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'dict-ai-gloss-save-btn';
            saveBtn.textContent = '📎 加入词汇本';
            saveBtn.style.cssText = 'display:block;margin-top:8px;padding:3px 10px;border:1px solid var(--border,#ccc);border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:12px;';
            saveBtn.addEventListener('click', async () => {
              if (saveBtn.disabled) return;
              saveBtn.disabled = true;
              try {
                await window.__yomikikuanAddVocab({
                  word,
                  reading: (detailedInfo && detailedInfo.reading) || '',
                  gloss: text,
                  source: {
                    docId: (window.documentManager && window.documentManager.getActiveId && window.documentManager.getActiveId()) || '',
                    sentence: sentence || '',
                  },
                });
                saveBtn.textContent = '✓ 已加入';
              } catch (e) {
                console.warn('[vocab] addVocab failed', e);
                saveBtn.textContent = '加入失败';
                saveBtn.disabled = false;
              }
            });
            resultBox.appendChild(saveBtn);
          }
        } catch (_) {}
      } catch (err) {
        const msg = err && (err.message || String(err));
        let label;
        if (msg === 'NO_API_KEY' || msg === 'NO_PROVIDER') {
          label = tt('analyzer.needsKey', 'Requires Gemini API key');
        } else if (msg === 'RATE_LIMITED') {
          label = tt('analyzer.error.quota', '额度超限，稍后再试');
        } else {
          label = tt('analyzer.error.generic', '解析失败，重试？');
        }
        resultBox.classList.add('dict-ai-gloss--error');
        resultBox.textContent = label;
        try { console.warn('[analyzer] glossWord failed', err); } catch (_) {}
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  })();

  doc.body.appendChild(modal);

  // Hide token-detail popups whenever any future translation-modal mounts.
  let observer = null;
  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node && node.nodeType === 1 && node.classList && node.classList.contains('translation-modal')) {
              doc.querySelectorAll('.token-details').forEach((d) => { d.style.display = 'none'; });
              doc.querySelectorAll('.token-pill').forEach((p) => { p.classList.remove('active'); });
              setActive(null);
            }
          });
        }
      });
    });
    observer.observe(doc.body, { childList: true, subtree: true });
  }

  const originalRemove = modal.remove;
  modal.remove = function () {
    try { if (observer) observer.disconnect(); } catch (_) {}
    originalRemove.call(this);
  };

  function tearDown() {
    modal.remove();
    doc.querySelectorAll('.token-details').forEach((d) => {
      if (d.parentNode === doc.body && d.__ownerTokenElement) {
        try { d.__ownerTokenElement.appendChild(d); } catch (_) {}
      }
      d.style.display = 'none';
      d.style.visibility = 'hidden';
    });
    doc.querySelectorAll('.token-pill').forEach((p) => p.classList.remove('active'));
    setActive(null);
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) tearDown();
  });

  const closeBtn = modal.querySelector('.close-modal-btn');
  if (closeBtn) closeBtn.addEventListener('click', tearDown);

  return { outcome: 'mounted', modal };
}

if (typeof window !== 'undefined') {
  window.YomikikuanTranslationModal = {
    loadTranslation,
    showDetailedTranslation,
    buildDetailedTranslationMarkup,
    resolveDictionaryQuery,
    aliasFor,
  };
}
