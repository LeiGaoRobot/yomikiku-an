// JLPT Weakness Coach — pure analytics over session history records.
//
// Input: array of session report objects (session.js buildReport shape —
//   { level, byMode: [{mode,total,correct}], total, correct, startedAt, ... }).
//
// Output: either null (no verdict) or { mode, accuracy, sample, level, reason }
// for weakness; { fromLevel, toLevel } for upgrade.
//
// Rendering: buildCoachBanner(history, { onTarget }) returns a DOM element or null.

import { MODE_META } from './prompts.js';

const MIN_SAMPLE_PER_MODE = 3;
const WEAKNESS_THRESHOLD = 0.55;
const LOOKBACK_SESSIONS = 5;

export function diagnoseWeakness(history) {
  if (!Array.isArray(history) || history.length === 0) return null;

  const recent = history.slice(0, LOOKBACK_SESSIONS);
  const agg = {};
  recent.forEach((sess) => {
    (sess.byMode || []).forEach((row) => {
      if (!row.mode) return;
      if (!agg[row.mode]) agg[row.mode] = { mode: row.mode, total: 0, correct: 0, level: sess.level || '' };
      agg[row.mode].total += Number(row.total) || 0;
      agg[row.mode].correct += Number(row.correct) || 0;
    });
  });

  let worst = null;
  Object.values(agg).forEach((row) => {
    if (row.total < MIN_SAMPLE_PER_MODE) return;
    const acc = row.correct / row.total;
    if (acc >= WEAKNESS_THRESHOLD) return;
    if (!worst || acc < worst.accuracy) {
      worst = {
        mode: row.mode,
        accuracy: acc,
        sample: row.total,
        level: row.level,
        reason: acc < 0.35 ? 'critical' : 'weak',
      };
    }
  });

  return worst;
}

export function buildCoachBanner(history, { onTarget } = {}) {
  const diag = diagnoseWeakness(history);
  if (!diag) return null;

  const meta = MODE_META[diag.mode] || { emoji: '🎯', nameJa: diag.mode, nameZh: '' };
  const pct = Math.round(diag.accuracy * 100);

  const wrap = document.createElement('div');
  wrap.className = 'jlpt-coach';

  wrap.innerHTML = `
    <div class="coach-icon">${meta.emoji}</div>
    <div class="coach-body">
      <div class="coach-title">薄弱题型：${meta.nameJa}</div>
      <div class="coach-detail">
        最近 ${diag.sample} 道 · 正确率 <b style="color:#ff3b30;">${pct}%</b>
        ${diag.reason === 'critical' ? ' · <b>需要强化练习</b>' : ''}
        <br><span style="opacity:.8;">${meta.nameZh}</span>
      </div>
      <button type="button" class="coach-cta" data-role="target">🎯 专项练习 · ${diag.level || 'N3'}</button>
    </div>
  `;

  wrap.querySelector('[data-role="target"]').addEventListener('click', () => {
    if (typeof onTarget === 'function') onTarget(diag);
  });

  return wrap;
}

export function checkUpgrade(history) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const last2 = history.slice(0, 2);
  const allHigh = last2.every((s) => {
    const p = s.total > 0 ? s.correct / s.total : 0;
    return p >= 0.85 && s.total >= 5;
  });
  if (!allHigh) return null;
  const cur = last2[0].level;
  const UP = { N5: 'N4', N4: 'N3', N3: 'N2', N2: 'N1', N1: null };
  const next = UP[cur];
  if (!next) return null;
  return { fromLevel: cur, toLevel: next };
}
