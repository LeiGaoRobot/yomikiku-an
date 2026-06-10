// Daily-progress rings + streak counter for the sidebar.
//
// Storage: localStorage key `yomikikuan_daily_log`
//   { [YYYY-MM-DD]: { docs: string[], minutes: int, vocabAdded: int } }
// Dates are local calendar-day strings (not epoch) because streaks require
// day-level bucketing; documented inline; appropriate only for day-granular
// data. All other timestamp-bearing code in the project remains epoch-ms.

const LS_KEY = 'yomikikuan_daily_log';
const GOALS = { docs: 3, minutes: 15, vocab: 10 };

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadLog() {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : {}; }
  catch (_) { return {}; }
}
function saveLog(log) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(log)); } catch (_) {}
}
function ensureTodayEntry(log) {
  const k = todayKey();
  if (!log[k]) log[k] = { docs: [], minutes: 0, vocabAdded: 0 };
  return log[k];
}

export function logDocOpen(docId) {
  if (!docId) return;
  const log = loadLog();
  const today = ensureTodayEntry(log);
  if (!today.docs.includes(docId)) {
    today.docs.push(docId);
    saveLog(log);
    refreshAll();
  }
}

export function logMinutes(n) {
  const m = Number(n) || 0;
  if (m <= 0) return;
  const log = loadLog();
  const today = ensureTodayEntry(log);
  today.minutes = Math.round(today.minutes + m);
  saveLog(log);
  refreshAll();
}

export function logVocabAdded() {
  const log = loadLog();
  const today = ensureTodayEntry(log);
  today.vocabAdded += 1;
  saveLog(log);
  refreshAll();
}

function streak(log) {
  let count = 0;
  const d = new Date();
  let grace = false;
  while (count < 365) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const entry = log[k];
    const active = entry && ((entry.docs && entry.docs.length) || entry.minutes > 0 || entry.vocabAdded > 0);
    if (active) { count += 1; d.setDate(d.getDate() - 1); grace = false; }
    else if (!grace && count === 0) { grace = true; d.setDate(d.getDate() - 1); }
    else break;
  }
  return count;
}

function ringSvg(pct, color, label, value, target) {
  const r = 28; const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, pct));
  const offset = c - c * clamped;
  return `
    <div class="pr-ring">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="rgba(0,0,0,.08)" stroke-width="6"/>
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="6"
                stroke-dasharray="${c}" stroke-dashoffset="${offset}"
                stroke-linecap="round" transform="rotate(-90 36 36)"/>
      </svg>
      <div class="pr-ring-center">
        <div class="pr-ring-val">${value}</div>
        <div class="pr-ring-target">/ ${target}</div>
      </div>
      <div class="pr-ring-label">${label}</div>
    </div>
  `;
}

let mountEl = null;
const CSS_FLAG = '__yomikikuanProgressCssInjected';

function injectCss() {
  if (window[CSS_FLAG]) return;
  window[CSS_FLAG] = true;
  const style = document.createElement('style');
  style.id = 'progress-rings-css';
  style.textContent = `
    .progress-rings {
      display: flex; flex-direction: column; gap: 10px;
      padding: 14px 10px;
      border-top: 1px solid var(--ap-ink-08, rgba(29,29,31,.08));
      margin-top: auto;
    }
    .pr-streak {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 10px;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(255,149,0,.10), rgba(255,69,58,.06));
      border: 1px solid rgba(255,149,0,.22);
      font-size: 12px;
    }
    .pr-streak .flame { font-size: 18px; }
    .pr-streak .val { font-weight: 700; font-size: 14px; color: #cc7a00; }
    .pr-rings { display: flex; gap: 4px; justify-content: space-around; }
    .pr-ring {
      position: relative;
      width: 72px; text-align: center;
      color: var(--ap-ink, #1d1d1f);
    }
    .pr-ring svg { display: block; margin: 0 auto; }
    .pr-ring-center {
      position: absolute; top: 18px; left: 0; right: 0;
      display: flex; flex-direction: column; align-items: center; line-height: 1;
    }
    .pr-ring-val { font-size: 14px; font-weight: 700; }
    .pr-ring-target { font-size: 9px; color: var(--ap-ink-48, rgba(29,29,31,.48)); margin-top: 2px; }
    .pr-ring-label {
      font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
      color: var(--ap-ink-48, rgba(29,29,31,.48));
      margin-top: 4px;
    }
    :root[data-theme="dark"] .pr-streak .val { color: #ff9f0a; }
  `;
  document.head.appendChild(style);
}

function render() {
  if (!mountEl) return;
  const log = loadLog();
  const today = log[todayKey()] || { docs: [], minutes: 0, vocabAdded: 0 };
  const s = streak(log);
  const docsP = (today.docs?.length || 0) / GOALS.docs;
  const minP = (today.minutes || 0) / GOALS.minutes;
  const vocP = (today.vocabAdded || 0) / GOALS.vocab;

  mountEl.innerHTML = `
    <div class="pr-streak" title="连续学习天数">
      <span class="flame">🔥</span>
      <span>连续 <span class="val">${s}</span> 天</span>
    </div>
    <div class="pr-rings">
      ${ringSvg(docsP, '#0071e3', '阅读', today.docs?.length || 0, GOALS.docs)}
      ${ringSvg(minP,  '#34c759', '听音频', today.minutes || 0, GOALS.minutes)}
      ${ringSvg(vocP,  '#af52de', '新词',   today.vocabAdded || 0, GOALS.vocab)}
    </div>
  `;
}

function refreshAll() { try { render(); } catch (_) {} }

export function mountProgressRings(container) {
  injectCss();
  if (!container) return;
  mountEl = container;
  mountEl.classList.add('progress-rings');
  render();
}

(function hookVocabAdd() {
  if (typeof window === 'undefined') return;
  const orig = window.__yomikikuanAddVocab;
  if (!orig || orig.__progressWrapped) return;
  const wrapped = function () {
    const r = orig.apply(this, arguments);
    try { logVocabAdded(); } catch (_) {}
    return r;
  };
  wrapped.__progressWrapped = true;
  window.__yomikikuanAddVocab = wrapped;
})();

if (typeof window !== 'undefined') {
  window.__yomikikuanLogDocOpen = logDocOpen;
  window.__yomikikuanLogMinutes = logMinutes;
  window.__yomikikuanMountProgressRings = mountProgressRings;
}
