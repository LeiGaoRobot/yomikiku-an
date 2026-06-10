// JLPT session / exam-simulation manager.
//
// A "session" is a timed batch of questions across one or more modes, with
// answers collected silently (exam mode — no inline feedback), then a
// scorecard on finish. Supports review-mode replay after finish.
//
// Storage: yomikikuan-analysis IDB store via analyzer/cache/idb.js
// namespace providerId='jlpt-session' schemaVersion=1. All dates are
// epoch-ms integers.

import * as cache from '../../cache/idb.js';
import { renderForMode, renderScorecard, injectCss as injectRendCss } from './renderers.js';
import { resetLocks, stopAll } from './audio.js';

const PROVIDER = 'jlpt-session';
const SCHEMA = 1;
const INDEX_KEY = JSON.stringify({ _index: true });

export function buildReport(answers, plan) {
  const byModeMap = {};
  let correct = 0;
  answers.forEach((a) => {
    const m = a.mode || 'unknown';
    if (!byModeMap[m]) byModeMap[m] = { mode: m, total: 0, correct: 0 };
    byModeMap[m].total += 1;
    if (a.correct) { byModeMap[m].correct += 1; correct += 1; }
  });
  const byMode = Object.values(byModeMap);
  return {
    sessionId: plan.sessionId,
    level: plan.level,
    modes: plan.modes,
    total: answers.length,
    correct,
    startedAt: plan.startedAt,
    finishedAt: plan.finishedAt,
    durationMs: plan.finishedAt - plan.startedAt,
    byMode,
    docId: plan.docId || '',
  };
}

export async function saveSessionRecord(record) {
  try {
    const key = JSON.stringify({ sessionId: record.sessionId });
    await cache.put(key, PROVIDER, SCHEMA, record);
  } catch (e) { console.warn('[jlpt-session] save failed', e); }
}

async function saveSessionIndex(ids) {
  try { await cache.put(INDEX_KEY, PROVIDER, SCHEMA, { ids, updatedAt: Date.now() }); }
  catch (_) {}
}
async function loadSessionIndex() {
  try {
    const v = await cache.get(INDEX_KEY, PROVIDER, SCHEMA);
    return (v && Array.isArray(v.ids)) ? v.ids : [];
  } catch (_) { return []; }
}
export async function listSessionHistory({ limit = 20 } = {}) {
  const ids = await loadSessionIndex();
  const tail = ids.slice(-limit).reverse();
  const out = [];
  for (const id of tail) {
    try {
      const rec = await cache.get(JSON.stringify({ sessionId: id }), PROVIDER, SCHEMA);
      if (rec) out.push(rec);
    } catch (_) {}
  }
  return out;
}

export function startSession({ root, plan, itemsByMode, onFinish }) {
  injectRendCss();
  resetLocks();

  const queue = [];
  plan.modes.forEach((mode) => {
    const payload = itemsByMode[mode];
    if (!payload) return;
    if (Array.isArray(payload.items)) {
      payload.items.forEach((it, i) => queue.push({ mode, payload, q: it, qi: i }));
    } else if (Array.isArray(payload.questions)) {
      payload.questions.forEach((q, i) => queue.push({ mode, payload, q, qi: i }));
    }
  });
  plan.totalQuestions = queue.length;
  plan.startedAt = Date.now();
  plan.sessionId = `sess-${plan.startedAt}`;

  const answers = [];
  const shell = document.createElement('div');
  shell.className = 'jlpt-session-shell';
  shell.style.cssText = 'display:flex;flex-direction:column;gap:14px;padding:16px 20px;';

  const prog = document.createElement('div');
  prog.style.cssText = 'height:6px;border-radius:999px;background:rgba(0,0,0,.06);overflow:hidden;';
  const progBar = document.createElement('div');
  progBar.style.cssText = 'height:100%;background:#0071e3;width:0%;transition:width .2s ease;';
  prog.appendChild(progBar);
  shell.appendChild(prog);

  const meta = document.createElement('div');
  meta.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted,#888);';
  const timerEl = document.createElement('span');
  timerEl.textContent = '⏱ 00:00';
  const counter = document.createElement('span');
  const finishBtn = document.createElement('button');
  finishBtn.type = 'button';
  finishBtn.textContent = '提前交卷';
  finishBtn.style.cssText = 'border:1px solid var(--border,rgba(0,0,0,.15));border-radius:6px;padding:2px 10px;background:transparent;color:inherit;cursor:pointer;font-size:11px;';
  meta.append(timerEl, counter, finishBtn);
  shell.appendChild(meta);

  const stage = document.createElement('div');
  stage.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
  shell.appendChild(stage);

  const nav = document.createElement('div');
  nav.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:8px;border-top:1px solid var(--border,rgba(0,0,0,.08));';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button'; prevBtn.textContent = '← 上一题';
  prevBtn.style.cssText = 'padding:4px 12px;border:1px solid var(--border,rgba(0,0,0,.15));border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:12px;';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button'; nextBtn.textContent = '下一题 →';
  nextBtn.style.cssText = 'padding:6px 14px;border-radius:8px;border:none;background:var(--accent,#0071e3);color:#fff;cursor:pointer;font-size:13px;';
  nav.append(prevBtn, nextBtn);
  shell.appendChild(nav);

  root.innerHTML = '';
  root.appendChild(shell);

  let cursor = 0;
  const timerId = setInterval(() => {
    const s = Math.round((Date.now() - plan.startedAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    timerEl.textContent = `⏱ ${mm}:${ss}`;
  }, 1000);

  function renderOne(idx) {
    stage.innerHTML = '';
    const item = queue[idx];
    if (!item) return;
    const mini = { ...item.payload, items: [item.q], questions: [item.q] };
    renderForMode(stage, mini, {
      examMode: true,
      onAnswer: ({ chosen, correct }) => {
        answers[idx] = { mode: item.mode, qIndex: idx, chosen, correct };
      },
    });
    counter.textContent = `${idx + 1} / ${queue.length}`;
    progBar.style.width = `${Math.round(((idx + 1) / queue.length) * 100)}%`;
    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === queue.length - 1 ? '交卷 →' : '下一题 →';
  }

  prevBtn.addEventListener('click', () => {
    stopAll();
    if (cursor > 0) { cursor -= 1; renderOne(cursor); }
  });
  nextBtn.addEventListener('click', () => {
    stopAll();
    if (cursor < queue.length - 1) { cursor += 1; renderOne(cursor); }
    else finish();
  });
  finishBtn.addEventListener('click', finish);

  async function finish() {
    clearInterval(timerId);
    stopAll();
    plan.finishedAt = Date.now();
    const report = buildReport(answers.filter(Boolean), plan);
    await saveSessionRecord(report);
    const idx = await loadSessionIndex();
    idx.push(report.sessionId);
    await saveSessionIndex(idx.slice(-50));

    root.innerHTML = '';
    const scWrap = document.createElement('div');
    root.appendChild(scWrap);
    renderScorecard(scWrap, report, {
      onReview: () => {
        root.innerHTML = '';
        plan.modes.forEach((mode) => {
          const payload = itemsByMode[mode];
          if (!payload) return;
          const header = document.createElement('div');
          header.style.cssText = 'font-size:13px;font-weight:600;padding:10px 20px 4px;';
          header.textContent = `回看 · ${mode}`;
          root.appendChild(header);
          const listEl = document.createElement('div');
          listEl.style.cssText = 'padding: 0 20px 14px; display:flex; flex-direction: column; gap: 12px;';
          renderForMode(listEl, payload, { examMode: false });
          root.appendChild(listEl);
        });
      },
      onRetake: () => onFinish && onFinish({ retake: true }),
    });
    if (typeof onFinish === 'function') onFinish({ report });
  }

  renderOne(cursor);

  return { stop: () => { clearInterval(timerId); stopAll(); } };
}
