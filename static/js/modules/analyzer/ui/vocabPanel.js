// 词汇本 / 错题本 — list + flashcard-style review over the SRS store.
//
// Public surface:
//   mountPanel() / unmountPanel()
//   window.__yomikikuanOpenVocab
//   window.__yomikikuanAddVocab(entry)   — convenience for inlineCard hook
//   window.__yomikikuanAddMistake(entry) — convenience for jlptPanel hook

import * as srs from '../../srs/store.js';

const CSS_INJECTED = '__yomikikuanVocabCssInjected';

function tr(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.YomikikuanGetText === 'function') {
      const v = window.YomikikuanGetText(key, fallback);
      if (typeof v === 'string') return v;
    }
  } catch (_) {}
  return fallback;
}
function trFmt(key, params, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.YomikikuanFormat === 'function') {
      const v = window.YomikikuanFormat(key, params || {});
      if (typeof v === 'string' && v !== key) return v;
    }
  } catch (_) {}
  let s = fallback || key;
  Object.entries(params || {}).forEach(([k, v]) => { s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)); });
  return s;
}

function injectCss() {
  if (window[CSS_INJECTED]) return;
  window[CSS_INJECTED] = true;
  const css = `
    .vocab-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      animation: vocabFadeIn 160ms ease;
    }
    @keyframes vocabFadeIn { from { opacity: 0; } to { opacity: 1; } }
    .vocab-panel {
      background: var(--bg, #fff); color: var(--fg, #111);
      width: min(760px, 100%); max-height: calc(100vh - 48px);
      border-radius: 16px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.25);
      display: flex; flex-direction: column; overflow: hidden;
      border: 1px solid var(--border, rgba(0,0,0,0.1));
    }
    .vocab-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 20px; border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
    }
    .vocab-panel-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
    .vocab-close {
      background: none; border: none; font-size: 22px; cursor: pointer;
      color: var(--muted, #888); line-height: 1; padding: 0 4px;
    }
    .vocab-tabs {
      display: flex; gap: 4px; padding: 0 20px;
      border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
    }
    .vocab-tab {
      padding: 10px 14px; cursor: pointer;
      border: none; background: none; color: var(--muted, #666);
      font-size: 13px; font-weight: 500;
      border-bottom: 2px solid transparent;
    }
    .vocab-tab[aria-selected="true"] {
      color: var(--accent, #0071e3);
      border-bottom-color: var(--accent, #0071e3);
    }
    .vocab-filter {
      display: flex; gap: 8px; padding: 10px 20px;
      border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
      font-size: 12px; align-items: center;
    }
    .vocab-filter button {
      padding: 4px 10px; border-radius: 999px;
      border: 1px solid var(--border, rgba(0,0,0,0.15));
      background: transparent; color: var(--muted, #666);
      cursor: pointer; font-size: 12px;
    }
    .vocab-filter button[aria-pressed="true"] {
      background: var(--accent, #0071e3); color: #fff;
      border-color: var(--accent, #0071e3);
    }
    .vocab-filter .count { margin-left: auto; color: var(--muted, #888); }
    .vocab-list {
      overflow-y: auto; flex: 1;
      padding: 10px 20px 20px;
    }
    .vocab-empty { padding: 40px 20px; text-align: center; color: var(--muted, #888); font-size: 13px; }
    .vocab-item {
      border: 1px solid var(--border, rgba(0,0,0,0.08));
      border-radius: 10px; padding: 12px 14px;
      margin-bottom: 10px;
      display: flex; gap: 14px; align-items: flex-start;
    }
    .vocab-item .main { flex: 1; min-width: 0; }
    .vocab-item .word { font-size: 16px; font-weight: 600; margin-bottom: 2px; }
    .vocab-item .reading { color: var(--muted, #888); font-size: 12px; }
    .vocab-item .gloss { margin-top: 6px; font-size: 13px; line-height: 1.5; }
    .vocab-item .meta {
      margin-top: 6px; font-size: 11px; color: var(--muted, #888);
      display: flex; gap: 10px; flex-wrap: wrap;
    }
    .vocab-pill {
      display: inline-block; padding: 1px 8px; border-radius: 999px;
      font-size: 10px; background: var(--elevated, rgba(0,0,0,0.05));
    }
    .vocab-pill.due { background: #ff3b30; color: #fff; }
    .vocab-pill.learning { background: #ff9500; color: #fff; }
    .vocab-pill.mastered { background: #34c759; color: #fff; }
    .vocab-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
    .vocab-actions button {
      padding: 4px 10px; border-radius: 6px;
      border: 1px solid var(--border, rgba(0,0,0,0.15));
      background: transparent; color: inherit; cursor: pointer;
      font-size: 12px;
    }
    .vocab-actions button:hover { background: var(--elevated, rgba(0,0,0,0.04)); }
    .vocab-review {
      padding: 30px 24px; display: flex; flex-direction: column; gap: 18px;
      min-height: 320px;
    }
    .vocab-card {
      border: 1px solid var(--border, rgba(0,0,0,0.12));
      border-radius: 12px; padding: 24px; min-height: 140px;
      display: flex; flex-direction: column; justify-content: center;
      cursor: pointer; transition: background 120ms ease;
    }
    .vocab-card:hover { background: var(--elevated, rgba(0,0,0,0.02)); }
    .vocab-card .face { font-size: 26px; font-weight: 600; text-align: center; }
    .vocab-card .reading { font-size: 14px; color: var(--muted, #888); text-align: center; margin-top: 6px; }
    .vocab-card .back { margin-top: 12px; font-size: 14px; line-height: 1.7; }
    .vocab-card .hint { font-size: 12px; color: var(--muted, #888); text-align: center; margin-top: 10px; }
    .vocab-grade {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
    }
    .vocab-grade button {
      padding: 10px; border-radius: 8px;
      border: 1px solid var(--border, rgba(0,0,0,0.15));
      background: transparent; color: inherit; cursor: pointer;
      font-size: 13px; font-weight: 500;
    }
    .vocab-grade button[data-q="1"] { border-color: #ff3b30; color: #ff3b30; }
    .vocab-grade button[data-q="3"] { border-color: #ff9500; color: #ff9500; }
    .vocab-grade button[data-q="4"] { border-color: #0071e3; color: #0071e3; }
    .vocab-grade button[data-q="5"] { border-color: #34c759; color: #34c759; }
    .vocab-grade button:hover { background: var(--elevated, rgba(0,0,0,0.04)); }
    .vocab-review-meta {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 12px; color: var(--muted, #888);
    }
    .vocab-back-btn {
      padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border,rgba(0,0,0,.15));
      background: transparent; color: inherit; cursor: pointer; font-size: 12px;
    }
    :root[data-theme="dark"] .vocab-panel { background: #1c1c1e; color: #f2f2f7; }
  `;
  const s = document.createElement('style');
  s.id = 'vocab-panel-css';
  s.textContent = css;
  document.head.appendChild(s);
}

function fmtRelDate(ts) {
  if (!ts) return '';
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60 * 1000) return diff < 0 ? '刚刚' : '马上';
  const min = Math.round(abs / 60000);
  if (min < 60) return `${min} 分钟${diff < 0 ? '前' : '后'}`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时${diff < 0 ? '前' : '后'}`;
  const d = Math.round(hr / 24);
  return `${d} 天${diff < 0 ? '前' : '后'}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let activePanel = null;

export async function mountPanel() {
  injectCss();
  if (activePanel) return activePanel;

  const root = document.createElement('div');
  root.className = 'vocab-overlay';
  root.innerHTML = `
    <div class="vocab-panel" role="dialog" aria-label="词汇本 / 错题本">
      <header class="vocab-panel-header">
        <h3>🧠 词汇本 / 错题本</h3>
        <button class="vocab-close" type="button" aria-label="关闭">×</button>
      </header>
      <div class="vocab-tabs" role="tablist">
        <button class="vocab-tab" data-tab="vocab" role="tab" aria-selected="true">词汇本</button>
        <button class="vocab-tab" data-tab="mistakes" role="tab" aria-selected="false">错题本</button>
      </div>
      <div class="vocab-filter">
        <button type="button" data-bucket="all" aria-pressed="true">全部</button>
        <button type="button" data-bucket="due" aria-pressed="false">到期</button>
        <button type="button" data-bucket="learning" aria-pressed="false">学习中</button>
        <button type="button" data-bucket="mastered" aria-pressed="false">已掌握</button>
        <button type="button" data-role="review" style="margin-left:10px;padding:4px 14px;border-radius:6px;border:none;background:var(--accent,#0071e3);color:#fff;cursor:pointer;">开始复习</button>
        <span class="count" data-role="count"></span>
      </div>
      <div class="vocab-list" data-role="list"></div>
    </div>
  `;
  document.body.appendChild(root);

  let escHandler = null;
  const close = () => {
    if (escHandler) document.removeEventListener('keydown', escHandler);
    root.remove();
    activePanel = null;
  };
  root.querySelector('.vocab-close').addEventListener('click', close);
  root.addEventListener('click', (ev) => { if (ev.target === root) close(); });
  escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);

  let tab = 'vocab';
  let bucket = 'all';

  const list = root.querySelector('[data-role="list"]');
  const count = root.querySelector('[data-role="count"]');
  const reviewBtn = root.querySelector('[data-role="review"]');

  async function refresh() {
    const listEl = root.querySelector('[data-role="list"]') || list;
    listEl.innerHTML = '';
    const items = tab === 'vocab'
      ? await srs.listVocab({ bucket })
      : await srs.listMistakes({ bucket });

    count.textContent = trFmt('panel.vocab.count_fmt', { n: items.length }, `${items.length} 项`);

    if (!items.length) {
      const emptyKey = tab === 'vocab' ? 'panel.vocab.empty.vocab' : 'panel.vocab.empty.mistakes';
      const emptyFallback = tab === 'vocab'
        ? '还没有词汇。AI 释义后点「📎 加入词汇本」即可收藏。'
        : '还没有错题。JLPT 答错的题会自动加入。';
      listEl.innerHTML = `<div class="vocab-empty">${escapeHtml(tr(emptyKey, emptyFallback))}</div>`;
      return;
    }

    items.forEach((it) => {
      const b = srs.bucketOf(it);
      const card = document.createElement('div');
      card.className = 'vocab-item';
      const primary = tab === 'vocab'
        ? `<div class="word">${escapeHtml(it.word || tr('panel.vocab.review.no_word', '(无词)'))}</div>
           <div class="reading">${escapeHtml(it.reading || '')}</div>
           <div class="gloss">${escapeHtml(it.gloss || '')}</div>`
        : `<div class="word">${escapeHtml(it.stem || tr('panel.vocab.review.no_stem', '(无题干)'))}</div>
           <div class="gloss">正解：${String.fromCharCode(65 + (Number(it.correctIndex) || 0))} ｜ 你的：${it.userAnswerIndex >= 0 ? String.fromCharCode(65 + Number(it.userAnswerIndex)) : '-'}</div>
           <div class="gloss" style="color:var(--muted,#888);font-size:12px;">${escapeHtml(it.explanation || '')}</div>`;
      card.innerHTML = `
        <div class="main">
          ${primary}
          <div class="meta">
            <span class="vocab-pill ${b}">${b}</span>
            <span>下次复习：${fmtRelDate(it.nextDueAt)}</span>
            <span>间隔：${it.interval || 0} 天</span>
            <span>连续：${it.repetitions || 0}</span>
          </div>
        </div>
        <div class="vocab-actions">
          <button type="button" data-act="review">复习</button>
          <button type="button" data-act="delete">删除</button>
        </div>
      `;
      card.querySelector('[data-act="review"]').addEventListener('click', () => openReview([it]));
      card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (!confirm(tr('panel.confirm_delete', '删除这一项？'))) return;
        if (tab === 'vocab') await srs.removeVocab(it.id);
        else await srs.removeMistake(it.id);
        refresh();
      });
      listEl.appendChild(card);
    });
  }

  root.querySelectorAll('.vocab-tab').forEach((t) => {
    t.addEventListener('click', () => {
      tab = t.dataset.tab;
      root.querySelectorAll('.vocab-tab').forEach((x) =>
        x.setAttribute('aria-selected', x === t ? 'true' : 'false'));
      refresh();
    });
  });

  root.querySelectorAll('[data-bucket]').forEach((b) => {
    b.addEventListener('click', () => {
      bucket = b.dataset.bucket;
      root.querySelectorAll('[data-bucket]').forEach((x) =>
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      refresh();
    });
  });

  reviewBtn.addEventListener('click', async () => {
    const items = tab === 'vocab'
      ? await srs.listVocab({ bucket: bucket === 'all' ? 'due' : bucket })
      : await srs.listMistakes({ bucket: bucket === 'all' ? 'due' : bucket });
    if (!items.length) { alert(tr('panel.vocab.review.empty_filter', '当前筛选下没有可复习的卡片')); return; }
    openReview(items);
  });

  function openReview(items) {
    const origList = root.querySelector('[data-role="list"]');
    const review = document.createElement('div');
    review.className = 'vocab-review';
    review.setAttribute('data-role', 'list'); // keep selector stable for refresh()
    origList.replaceWith(review);

    let i = 0;
    let flipped = false;

    const exit = () => {
      const newList = document.createElement('div');
      newList.className = 'vocab-list';
      newList.setAttribute('data-role', 'list');
      review.replaceWith(newList);
      refresh();
    };

    function render() {
      if (i >= items.length) {
        review.innerHTML = `<div class="vocab-empty">${escapeHtml(tr('panel.vocab.review.done', '✓ 全部完成'))}</div>
          <div style="text-align:center;"><button class="vocab-back-btn">返回列表</button></div>`;
        review.querySelector('.vocab-back-btn').addEventListener('click', exit);
        return;
      }
      const it = items[i];
      const isVocab = tab === 'vocab';
      review.innerHTML = `
        <div class="vocab-review-meta">
          <span>${i + 1} / ${items.length}</span>
          <button class="vocab-back-btn" data-role="back">返回列表</button>
        </div>
        <div class="vocab-card" data-role="card">
          <div class="face"></div>
          <div class="reading"></div>
          <div class="back" hidden></div>
          <div class="hint">点击卡片查看答案</div>
        </div>
        <div class="vocab-grade" data-role="grade" hidden>
          <button type="button" data-q="1">Again</button>
          <button type="button" data-q="3">Hard</button>
          <button type="button" data-q="4">Good</button>
          <button type="button" data-q="5">Easy</button>
        </div>
      `;
      const face = review.querySelector('.face');
      const reading = review.querySelector('.reading');
      const back = review.querySelector('.back');
      const card = review.querySelector('[data-role="card"]');
      const grade = review.querySelector('[data-role="grade"]');
      const hint = review.querySelector('.hint');
      review.querySelector('[data-role="back"]').addEventListener('click', exit);

      if (isVocab) {
        face.textContent = it.word || tr('panel.vocab.review.no_word', '(无词)');
        reading.textContent = it.reading || '';
        back.textContent = it.gloss || tr('panel.vocab.review.no_gloss', '(无释义)');
      } else {
        face.textContent = it.stem || tr('panel.vocab.review.no_stem', '(无题干)');
        reading.textContent = '';
        back.innerHTML = `
          <div><b>正解：</b>${String.fromCharCode(65 + (Number(it.correctIndex) || 0))}</div>
          <div style="margin-top:6px;">${escapeHtml(it.explanation || '')}</div>
          ${it.citation ? `<div style="margin-top:6px;color:var(--muted,#888);font-size:12px;">出典：${escapeHtml(it.citation)}</div>` : ''}
        `;
      }

      flipped = false;
      card.addEventListener('click', () => {
        if (flipped) return;
        flipped = true;
        back.hidden = false;
        hint.textContent = tr('panel.vocab.review.hint', '评估你的掌握程度');
        grade.hidden = false;
      });

      grade.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const q = parseInt(btn.dataset.q, 10) || 0;
          if (isVocab) await srs.gradeVocab(it.id, q);
          else await srs.gradeMistake(it.id, q);
          i += 1;
          render();
        });
      });
    }

    render();
  }

  await refresh();
  activePanel = root;
  return root;
}

export function unmountPanel() {
  if (activePanel) { activePanel.remove(); activePanel = null; }
}

if (typeof window !== 'undefined') {
  window.__yomikikuanOpenVocab = () => mountPanel();
  window.__yomikikuanAddVocab = (entry) => srs.addVocab(entry);
  window.__yomikikuanAddMistake = (entry) => srs.addMistake(entry);
  // Backup hooks — used by main-js.js's collectBackupPayload / applyBackup.
  window.__yomikikuanDumpSrs = () => srs.dumpAll();
  window.__yomikikuanRestoreSrs = (payload) => srs.restoreAll(payload);
}
