// JLPT 聴解 — orchestrator panel.
//
// Hosts the modal shell and delegates all rendering / prompt building / audio
// control / session management to submodules under ./jlpt/.
//
// Public surface (unchanged contract):
//   mountPanel(doc), unmountPanel()
//   window.__yomikikuanOpenJLPT

import * as cache from '../cache/idb.js';
import { mountModalA11y } from './modalA11y.js';
import { recommendLevel } from '../local/jlptAdaptive.js';
import * as srs from '../../srs/store.js';
import { promptFor, stripFences, MODE_META, MODE_LEVEL_SUPPORT } from './jlpt/prompts.js';
import { renderForMode, injectCss as injectRendererCss, stopAll } from './jlpt/renderers.js';
import { startSession, listSessionHistory } from './jlpt/session.js';
import { buildCoachBanner } from './jlpt/coach.js';
import { callGemini as callGeminiShared, textBody, getApiKey } from '../../gemini/client.js';

const JLPT_SCHEMA_VERSION = 1;
const JLPT_PROVIDER_ID = 'jlpt';
const CSS_INJECTED = '__yomikikuanJlptPanelCssInjected';

function apiKey() { return getApiKey(); }

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

function cacheKey(doc, level, count, mode) {
  return JSON.stringify({ docId: doc && doc.id, level, count, mode: mode || 'normal' });
}

function callGemini(prompt, signal) {
  return callGeminiShared(textBody(prompt, { temperature: 0.4 }), { signal });
}

function parseJson(raw) { return JSON.parse(stripFences(raw)); }

function injectCss() {
  if (typeof window === 'undefined' || window[CSS_INJECTED]) return;
  window[CSS_INJECTED] = true;
  injectRendererCss();
  const css = `
    .jlpt-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      -webkit-backdrop-filter: blur(8px);
      backdrop-filter: blur(8px);
      animation: jlptFadeIn 180ms ease;
    }
    @keyframes jlptFadeIn { from { opacity: 0; } to { opacity: 1; } }
    .jlpt-panel {
      background: var(--bg, #fff); color: var(--text, #111);
      width: min(880px, 100%); max-height: calc(100vh - 48px);
      border-radius: 18px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.28);
      display: flex; flex-direction: column; overflow: hidden;
      border: 1px solid var(--border, rgba(0,0,0,0.1));
    }
    .jlpt-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 20px; border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
      gap: 10px;
    }
    .jlpt-panel-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
    .jlpt-close {
      background: none; border: none; font-size: 22px; cursor: pointer;
      color: var(--muted, #888); line-height: 1; padding: 0 4px;
    }
    .jlpt-close:hover { color: var(--text, #111); }

    .jlpt-tabs {
      display: flex; gap: 0;
      padding: 0 20px; border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
    }
    .jlpt-tab {
      background: none; border: none; padding: 10px 14px; cursor: pointer;
      font-size: 13px; color: var(--muted, #888);
      border-bottom: 2px solid transparent; margin-bottom: -1px;
    }
    .jlpt-tab.is-active { color: var(--text, #111); border-bottom-color: var(--ap-blue, #E63946); font-weight: 600; }
    .jlpt-tab:hover { color: var(--text, #111); }

    .jlpt-mode-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px; padding: 14px 20px;
    }
    .jlpt-mode-card {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 12px 14px; border: 1px solid var(--border, rgba(0,0,0,0.08));
      border-radius: 12px; background: var(--elevated, rgba(0,0,0,0.02));
      cursor: pointer; text-align: left; color: inherit; font: inherit;
      transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
      position: relative;
    }
    .jlpt-mode-card:hover { background: rgba(var(--ap-accent-rgb, 230,57,70),.06); border-color: rgba(var(--ap-accent-rgb, 230,57,70),.28); transform: translateY(-1px); }
    .jlpt-mode-card.is-selected { background: rgba(var(--ap-accent-rgb, 230,57,70),.10); border-color: rgba(var(--ap-accent-rgb, 230,57,70),.45); }
    .jlpt-mode-card .icon { font-size: 22px; line-height: 1; }
    .jlpt-mode-card .title { font-weight: 600; font-size: 14px; letter-spacing: -0.01em; }
    .jlpt-mode-card .sub { font-size: 11px; color: var(--muted, #888); margin-top: 2px; line-height: 1.4; }
    .jlpt-mode-card .level-chips { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; }
    .jlpt-mode-card .lchip {
      font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px;
      background: rgba(0,0,0,.06); color: var(--muted, #888); letter-spacing: .02em;
    }
    .jlpt-mode-card.is-unsupported { opacity: .4; pointer-events: none; }

    .jlpt-controls {
      display: flex; align-items: center; flex-wrap: wrap; gap: 12px;
      padding: 12px 20px; border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
      font-size: 13px;
    }
    .jlpt-controls label { display: flex; align-items: center; gap: 6px; }
    .jlpt-controls select {
      font-size: 13px; padding: 4px 8px; border-radius: 6px;
      border: 1px solid var(--border, rgba(0,0,0,0.15));
      background: var(--elevated, #f7f7f7); color: inherit;
    }
    .jlpt-go {
      padding: 6px 14px; border-radius: 8px; border: none;
      background: var(--ap-blue, #E63946); color: #fff; font-weight: 500;
      cursor: pointer; font-size: 13px;
    }
    .jlpt-go:disabled { opacity: 0.5; cursor: wait; }
    .jlpt-go.secondary { background: transparent; color: var(--ap-blue, #E63946); border: 1px solid var(--ap-blue, #E63946); }
    .jlpt-status { font-size: 12px; color: var(--muted, #888); }
    .jlpt-recommendation {
      padding: 8px 20px; border-bottom: 1px solid var(--border, rgba(0,0,0,0.06));
      font-size: 12px; color: var(--muted, #666); background: rgba(var(--ap-accent-rgb, 230,57,70),0.05);
    }
    .jlpt-list {
      padding: 16px 20px 24px; overflow-y: auto; flex: 1;
      display: flex; flex-direction: column; gap: 12px;
    }
    .jlpt-history {
      padding: 12px 20px 20px; overflow-y: auto; flex: 1;
      display: flex; flex-direction: column; gap: 8px;
    }
    .jlpt-hist-row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px; border: 1px solid var(--border, rgba(0,0,0,0.08));
      border-radius: 10px; font-size: 13px;
    }
    .jlpt-hist-row .pct { font-weight: 700; font-size: 16px; min-width: 50px; }
    .jlpt-hist-row .pct.good { color: #1d7d3f; }
    .jlpt-hist-row .pct.mid { color: #cc7a00; }
    .jlpt-hist-row .pct.low { color: #ff3b30; }
    .jlpt-hist-row .meta { color: var(--muted, #888); font-size: 11px; }
    .jlpt-hist-empty { text-align: center; color: var(--muted, #888); padding: 40px 0; }

    :root[data-theme="dark"] .jlpt-panel { background: #1c1c1e; color: #f2f2f7; }
    :root[data-theme="dark"] .jlpt-mode-card { background: rgba(255,255,255,.05); }
    :root[data-theme="dark"] .jlpt-mode-card.is-selected { background: rgba(255,107,117,.16); border-color: rgba(255,107,117,.5); }
    :root[data-theme="dark"] .jlpt-controls select { background: rgba(255,255,255,0.08); }
  `;
  const style = document.createElement('style');
  style.id = 'jlpt-panel-css';
  style.textContent = css;
  document.head.appendChild(style);
}

let activePanel = null;

async function generatePayload({ article, level, count, mode, signal, doc }) {
  const cKey = cacheKey(doc, level, count, mode);
  try {
    const hit = await cache.get(cKey, JLPT_PROVIDER_ID, JLPT_SCHEMA_VERSION);
    if (hit && (Array.isArray(hit.items) || Array.isArray(hit.questions))) {
      return { payload: hit, cacheHit: true };
    }
  } catch (_) {}
  if (!apiKey()) throw new Error('NO_API_KEY');
  const prompt = promptFor(mode, { article, level, count });
  const raw = await callGemini(prompt, signal);
  const payload = parseJson(raw);
  try { await cache.put(cKey, JLPT_PROVIDER_ID, JLPT_SCHEMA_VERSION, payload); } catch (_) {}
  return { payload, cacheHit: false };
}

function buildModeGrid(level, selectedModes) {
  const grid = document.createElement('div');
  grid.className = 'jlpt-mode-grid';
  Object.entries(MODE_META).forEach(([mode, meta]) => {
    const supported = (MODE_LEVEL_SUPPORT[mode] || []).includes(level);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'jlpt-mode-card';
    card.dataset.mode = mode;
    if (!supported) card.classList.add('is-unsupported');
    if (selectedModes.has(mode)) card.classList.add('is-selected');
    const levelChips = (MODE_LEVEL_SUPPORT[mode] || []).map(l => `<span class="lchip">${l}</span>`).join('');
    card.innerHTML = `
      <div class="icon">${meta.emoji}</div>
      <div style="flex:1;min-width:0;">
        <div class="title">${meta.nameJa}</div>
        <div class="sub">${tr(`panel.jlpt.modeDesc.${mode}`, meta.nameZh)}</div>
        <div class="level-chips">${levelChips}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      if (!supported) return;
      if (selectedModes.has(mode)) selectedModes.delete(mode);
      else selectedModes.add(mode);
      card.classList.toggle('is-selected');
    });
    grid.appendChild(card);
  });
  return grid;
}

export function mountPanel(doc) {
  injectCss();
  if (activePanel) return activePanel;
  const article = Array.isArray(doc?.content) ? doc.content.join('\n') : String(doc?.content || '');
  if (!article.trim()) { alert(tr('panel.error.doc_empty_for_jlpt', '当前文档为空，无法生成题目')); return null; }

  const root = document.createElement('div');
  root.className = 'jlpt-overlay';
  root.innerHTML = `
    <div class="jlpt-panel" role="dialog" aria-label="${tr('panel.jlpt.dialogAriaLabel', 'JLPT 聴解').replace(/"/g, '&quot;')}">
      <header class="jlpt-panel-header">
        <h3>${tr('panel.jlpt.title', 'JLPT 聴解练习')}</h3>
        <button class="jlpt-close" type="button" aria-label="${tr('panel.common.close', '关闭').replace(/"/g, '&quot;')}">×</button>
      </header>
      <nav class="jlpt-tabs">
        <button class="jlpt-tab is-active" data-tab="practice">${tr('panel.jlpt.tab.practice', '单题练习')}</button>
        <button class="jlpt-tab" data-tab="exam">${tr('panel.jlpt.tab.exam', '模拟考试')}</button>
        <button class="jlpt-tab" data-tab="history">${tr('panel.jlpt.tab.history', '成绩记录')}</button>
      </nav>
      <div class="jlpt-controls">
        <label>${tr('panel.jlpt.levelLabel', '等级')}
          <select data-role="level">
            <option value="N5">N5</option>
            <option value="N4">N4</option>
            <option value="N3" selected>N3</option>
            <option value="N2">N2</option>
            <option value="N1">N1</option>
          </select>
        </label>
        <label>${tr('panel.jlpt.countLabel', '每类题量')}
          <select data-role="count">
            <option value="3">3</option>
            <option value="5" selected>5</option>
            <option value="10">10</option>
          </select>
        </label>
        <button class="jlpt-go" data-role="go" type="button">${tr('panel.jlpt.generateBtn', '生成')}</button>
        <button class="jlpt-go secondary" data-role="regen" type="button">${tr('panel.jlpt.regenBtn', '忽略缓存重新生成')}</button>
        <span class="jlpt-status" data-role="status"></span>
      </div>
      <div class="jlpt-recommendation" data-role="recommendation" hidden></div>
      <div data-role="mode-grid-mount"></div>
      <div class="jlpt-list" data-role="list"></div>
    </div>
  `;
  document.body.appendChild(root);

  const a11y = mountModalA11y(root.querySelector('.jlpt-panel'), {
    initialFocus: root.querySelector('.jlpt-close'),
  });

  let controller = null;
  let escHandler = null;

  const close = () => {
    try { controller && controller.abort(); } catch (_) {}
    stopAll();
    if (escHandler) document.removeEventListener('keydown', escHandler);
    a11y.release();
    root.remove();
    activePanel = null;
  };

  root.querySelector('.jlpt-close').addEventListener('click', close);
  root.addEventListener('click', (ev) => { if (ev.target === root) close(); });
  escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);

  let currentTab = 'practice';
  const selectedModes = new Set(['kadai', 'point']);

  const levelSel = root.querySelector('[data-role="level"]');
  const countSel = root.querySelector('[data-role="count"]');
  const go = root.querySelector('[data-role="go"]');
  const regen = root.querySelector('[data-role="regen"]');
  const status = root.querySelector('[data-role="status"]');
  const list = root.querySelector('[data-role="list"]');
  const gridMount = root.querySelector('[data-role="mode-grid-mount"]');
  const controls = root.querySelector('.jlpt-controls');

  function rebuildGrid() {
    gridMount.innerHTML = '';
    gridMount.appendChild(buildModeGrid(levelSel.value, selectedModes));
  }
  rebuildGrid();
  levelSel.addEventListener('change', rebuildGrid);

  try {
    const badge = document.querySelector('#diffBadgeMount .diff-badge, #diffBadgeMount [data-level]');
    const preLevel = badge && (badge.dataset?.level || badge.textContent || '').trim().toUpperCase();
    if (preLevel && /^N[1-5]$/.test(preLevel)) { levelSel.value = preLevel; rebuildGrid(); }
  } catch (_) {}

  (async () => {
    try {
      const rec = await recommendLevel({ srs });
      if (!rec || !rec.level) return;
      levelSel.value = rec.level;
      rebuildGrid();
      const banner = root.querySelector('[data-role="recommendation"]');
      if (banner) {
        const acc = rec.accuracy == null ? null : Math.round(rec.accuracy * 100);
        const msg = (rec.confidence === 'low' || acc == null)
          ? trFmt('panel.jlpt.recommend.lowConfidenceSample_fmt', { level: rec.level }, `📈 推荐 ${rec.level}（样本不足，请多做几题后再推荐）`)
          : trFmt('panel.jlpt.recommend.accuracy_fmt', { level: rec.level, sample: rec.sample, acc }, `📈 推荐 ${rec.level}（最近 ${rec.sample} 题 ${acc}% 正确率）`);
        banner.textContent = msg;
        banner.hidden = false;
      }
    } catch (_) {}
  })();

  root.querySelectorAll('.jlpt-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      root.querySelectorAll('.jlpt-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      currentTab = tab.dataset.tab;
      if (currentTab === 'history') {
        gridMount.style.display = 'none';
        controls.style.display = 'none';
        list.innerHTML = '';
        list.classList.add('jlpt-history');
        list.classList.remove('jlpt-list');
        renderHistory(list);
      } else {
        gridMount.style.display = '';
        controls.style.display = '';
        list.classList.remove('jlpt-history');
        list.classList.add('jlpt-list');
        list.innerHTML = '';
        status.textContent = currentTab === 'exam'
          ? tr('panel.jlpt.tabStatus.exam', '选择题型 → 点击"开始考试"进入 exam 模式')
          : tr('panel.jlpt.tabStatus.practice', '选择题型 → 点击"生成"开始练习');
        go.textContent = currentTab === 'exam' ? tr('panel.jlpt.exam.start', '开始考试') : tr('panel.jlpt.generateBtn', '生成');
      }
    });
  });

  function runTargeted(diag) {
    // Switch to Practice tab, replace mode selection with just the weak mode, generate.
    selectedModes.clear();
    selectedModes.add(diag.mode);
    if (diag.level && /^N[1-5]$/.test(diag.level)) {
      levelSel.value = diag.level;
    }
    rebuildGrid();
    // Switch to practice tab programmatically
    const practiceTab = root.querySelector('.jlpt-tab[data-tab="practice"]');
    if (practiceTab) practiceTab.click();
    setTimeout(() => runPractice({ bypassCache: false }), 50);
  }

  async function renderHistory(container) {
    container.innerHTML = `<div class="jlpt-hist-empty">${tr('panel.jlpt.history.loading', '加载中…')}</div>`;
    const rows = await listSessionHistory({ limit: 20 });
    container.innerHTML = '';
    const coach = buildCoachBanner(rows, { onTarget: runTargeted });
    if (coach) container.appendChild(coach);
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'jlpt-hist-empty';
      empty.textContent = tr('panel.jlpt.history.empty', '还没有考试记录——在"📝 模拟考试"做一套吧。');
      container.appendChild(empty);
      return;
    }
    rows.forEach((r) => {
      const pct = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
      const cls = pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'low';
      const date = new Date(r.startedAt);
      const dstr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
      const modesTxt = (r.modes || []).map(m => MODE_META[m]?.emoji || '').join('');
      const tookStr = trFmt('panel.jlpt.history.took_fmt', { s: Math.round((r.durationMs||0)/1000) }, `用时 ${Math.round((r.durationMs||0)/1000)}s`);
      const row = document.createElement('div');
      row.className = 'jlpt-hist-row';
      row.innerHTML = `
        <span class="pct ${cls}">${pct}%</span>
        <span style="flex:1;min-width:0;">
          <div>${r.level || ''} · ${r.correct}/${r.total} · ${modesTxt}</div>
          <div class="meta">${dstr} · ${tookStr}</div>
        </span>
      `;
      container.appendChild(row);
    });
  }

  async function runPractice({ bypassCache }) {
    if (!selectedModes.size) { status.textContent = tr('panel.jlpt.error.noModeSelected', '请先选择至少一种题型'); return; }
    if (!apiKey()) { status.textContent = tr('panel.error.no_key', '请先在设置中填写 Gemini API key'); return; }
    go.disabled = true; regen.disabled = true;
    list.innerHTML = '';
    try { controller && controller.abort(); } catch (_) {}
    controller = new AbortController();

    const level = levelSel.value || 'N3';
    const count = parseInt(countSel.value, 10) || 5;

    try {
      const modeList = Array.from(selectedModes);
      for (let mi = 0; mi < modeList.length; mi++) {
        const mode = modeList[mi];
        const cacheSuffix = bypassCache ? tr('panel.jlpt.status.cacheSuffix', ' · 忽略缓存') : '';
        status.textContent = trFmt('panel.jlpt.status.generating_fmt', { i: mi+1, n: modeList.length, mode: MODE_META[mode]?.nameJa || mode, cacheSuffix }, `生成中 ${mi+1}/${modeList.length}（${MODE_META[mode]?.nameJa || mode}${cacheSuffix}）…`);
        let payload;
        if (bypassCache) {
          const prompt = promptFor(mode, { article, level, count });
          const raw = await callGemini(prompt, controller.signal);
          payload = parseJson(raw);
          try { await cache.put(cacheKey(doc, level, count, mode), JLPT_PROVIDER_ID, JLPT_SCHEMA_VERSION, payload); } catch (_) {}
        } else {
          const r = await generatePayload({ article, level, count, mode, signal: controller.signal, doc });
          payload = r.payload;
        }
        const sec = document.createElement('div');
        sec.style.cssText = 'font-size:13px;font-weight:600;padding:4px 2px;margin-top:4px;display:flex;align-items:center;gap:8px;';
        sec.innerHTML = `<span style="font-size:16px;">${MODE_META[mode]?.emoji || ''}</span><span>${MODE_META[mode]?.nameJa || mode}</span><span style="color:var(--muted,#888);font-weight:400;font-size:11px;">· ${tr(`panel.jlpt.modeDesc.${mode}`, MODE_META[mode]?.nameZh || '')}</span>`;
        list.appendChild(sec);
        const secList = document.createElement('div');
        secList.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
        list.appendChild(secList);
        renderForMode(secList, payload, { examMode: false });
      }
      status.textContent = '✓ ' + tr('panel.generated', '已生成');
    } catch (err) {
      console.warn('[jlpt] practice failed', err);
      const msg = err && err.message ? err.message : String(err);
      if (msg === 'NO_API_KEY') status.textContent = tr('panel.error.no_key', '请先在设置中填写 Gemini API key');
      else if (msg === 'RATE_LIMITED') status.textContent = tr('panel.error.rate_limited', 'API 额度超限，稍后再试');
      else if (err?.name === 'AbortError') status.textContent = tr('panel.aborted', '已取消');
      else status.textContent = trFmt('panel.error.generic_fmt', { msg }, `生成失败：${msg}`);
    } finally {
      go.disabled = false; regen.disabled = false;
    }
  }

  async function runExam() {
    if (!selectedModes.size) { status.textContent = tr('panel.jlpt.error.noModeSelected', '请先选择至少一种题型'); return; }
    if (!apiKey()) { status.textContent = tr('panel.error.no_key', '请先在设置中填写 Gemini API key'); return; }
    go.disabled = true; regen.disabled = true;
    list.innerHTML = '';
    try { controller && controller.abort(); } catch (_) {}
    controller = new AbortController();

    const level = levelSel.value || 'N3';
    const count = parseInt(countSel.value, 10) || 5;
    const itemsByMode = {};

    try {
      const modeList = Array.from(selectedModes);
      for (let mi = 0; mi < modeList.length; mi++) {
        const mode = modeList[mi];
        status.textContent = trFmt('panel.jlpt.status.preparing_fmt', { i: mi+1, n: modeList.length, mode: MODE_META[mode]?.nameJa || mode }, `准备中 ${mi+1}/${modeList.length}（${MODE_META[mode]?.nameJa || mode}）…`);
        const { payload } = await generatePayload({ article, level, count, mode, signal: controller.signal, doc });
        itemsByMode[mode] = payload;
      }
      status.textContent = tr('panel.jlpt.status.examStart', '考试开始 — 请专注听音频');
      const plan = { level, modes: modeList, docId: doc?.id || '' };
      startSession({
        root: list,
        plan,
        itemsByMode,
        onFinish: ({ retake }) => { if (retake) runExam(); },
      });
    } catch (err) {
      console.warn('[jlpt] exam prep failed', err);
      const msg = err && err.message ? err.message : String(err);
      status.textContent = (msg === 'NO_API_KEY') ? tr('panel.error.no_key', '请先在设置中填写 Gemini API key') : trFmt('panel.jlpt.error.examPrep_fmt', { msg }, `准备失败：${msg}`);
    } finally {
      go.disabled = false; regen.disabled = false;
    }
  }

  go.addEventListener('click', () => {
    if (currentTab === 'exam') runExam();
    else runPractice({ bypassCache: false });
  });
  regen.addEventListener('click', () => runPractice({ bypassCache: true }));

  activePanel = root;
  return root;
}

export function unmountPanel() {
  if (activePanel) { stopAll(); activePanel.remove(); activePanel = null; }
}

if (typeof window !== 'undefined') {
  window.__yomikikuanOpenJLPT = function () {
    const dm = window.documentManager;
    if (!dm || typeof dm.getAllDocuments !== 'function') { alert(tr('panel.error.no_docmgr', '文档管理器未就绪')); return; }
    const activeId = typeof dm.getActiveId === 'function' ? dm.getActiveId() : null;
    const doc = dm.getAllDocuments().find((d) => d && d.id === activeId);
    if (!doc) { alert(tr('panel.error.no_doc', '请先选择一个文档')); return; }
    mountPanel(doc);
  };
}
