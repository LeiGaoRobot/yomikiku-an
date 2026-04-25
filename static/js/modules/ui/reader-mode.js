// Reader Mode — distraction-free full-screen overlay that mirrors the
// currently-rendered content area (ruby tokens, translations, etc.) with
// generous typography and a floating playback control.
//
// Keyboard:
//   Space          play / pause (routes to existing header play toggle)
//   ← / →          previous / next line
//   Esc            exit
//   +  / -         font size up/down
//
// Public hooks:
//   window.__yomikikuanEnterReaderMode()
//   window.__yomikikuanExitReaderMode()

const CSS_FLAG = '__yomikikuanReaderCssInjected';
const BTN_ID = 'readerModeBtn';
const OVERLAY_ID = 'readerModeOverlay';

function injectCss() {
  if (window[CSS_FLAG]) return;
  window[CSS_FLAG] = true;
  const style = document.createElement('style');
  style.id = 'reader-mode-css';
  style.textContent = `
    .reader-overlay {
      position: fixed; inset: 0; z-index: 9998;
      background: var(--ap-bg, #fbfbfd);
      display: flex; flex-direction: column;
      opacity: 0; pointer-events: none;
      transition: opacity 280ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .reader-overlay.is-open { opacity: 1; pointer-events: auto; }
    :root[data-theme="dark"] .reader-overlay { background: #000; }

    .reader-topbar {
      position: absolute; top: 0; left: 0; right: 0;
      display: flex; align-items: center; gap: 12px;
      padding: 16px 24px;
      opacity: 0; transition: opacity 240ms ease;
      pointer-events: none;
    }
    .reader-overlay:hover .reader-topbar {
      opacity: 1; pointer-events: auto;
    }
    .reader-topbar .title {
      font-family: "SF Pro Display", -apple-system, sans-serif;
      font-size: 13px; font-weight: 500;
      color: var(--ap-ink-64, rgba(29,29,31,.64));
      flex: 1; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      letter-spacing: -0.008em;
    }
    .reader-topbar .exit-btn {
      background: var(--ap-surface-2, #f5f5f7);
      border: 1px solid var(--ap-ink-08, rgba(29,29,31,.08));
      border-radius: 999px;
      padding: 6px 14px;
      font-size: 12px; cursor: pointer; color: inherit;
      font-family: inherit;
    }
    .reader-topbar .exit-btn:hover { background: var(--ap-surface-3, #ededf0); }

    .reader-content {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 80px max(40px, calc((100vw - 760px) / 2)) 120px;
      font-family: "SF Pro Display", -apple-system, "Hiragino Mincho Pro", serif;
      font-size: var(--reader-font, 22px);
      line-height: 2.0;
      color: var(--ap-ink, #1d1d1f);
      letter-spacing: 0.012em;
    }
    :root[data-theme="dark"] .reader-content { color: #e5e5e7; }

    .reader-content .reader-line {
      padding: 10px 14px;
      margin: 4px -14px;
      border-radius: 8px;
      transition: background 120ms ease;
      cursor: pointer;
      position: relative;
    }
    .reader-content .reader-line:hover { background: var(--ap-ink-04, rgba(29,29,31,.04)); }
    .reader-content .reader-line.active { background: rgba(0,113,227,.08); }
    .reader-content .reader-line.active::before {
      content: ""; position: absolute; left: -14px; top: 14px; bottom: 14px;
      width: 3px; background: #0071e3; border-radius: 2px;
    }
    :root[data-theme="dark"] .reader-content .reader-line:hover { background: rgba(255,255,255,.06); }
    :root[data-theme="dark"] .reader-content .reader-line.active { background: rgba(41,151,255,.16); }

    .reader-content ruby { ruby-position: over; ruby-align: center; }
    .reader-content rt {
      font-size: 0.42em; font-weight: 400;
      color: var(--ap-ink-48, rgba(29,29,31,.48));
      letter-spacing: 0;
    }
    :root[data-theme="dark"] .reader-content rt { color: rgba(245,245,247,.48); }

    .reader-floater {
      position: fixed;
      bottom: 24px;
      left: 50%; transform: translateX(-50%);
      display: inline-flex; align-items: center; gap: 10px;
      padding: 10px 18px;
      border-radius: 999px;
      background: rgba(255,255,255,.88);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      backdrop-filter: saturate(180%) blur(20px);
      border: 1px solid var(--ap-ink-08, rgba(29,29,31,.08));
      box-shadow: 0 8px 32px rgba(0,0,0,.12);
      z-index: 10000;
    }
    :root[data-theme="dark"] .reader-floater {
      background: rgba(28,28,30,.88);
      border-color: rgba(245,245,247,.10);
    }
    .reader-floater button {
      background: transparent; border: none;
      width: 36px; height: 36px;
      border-radius: 999px;
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; color: var(--ap-ink, #1d1d1f);
      transition: background 120ms ease, transform 120ms ease;
      font-size: 14px;
    }
    :root[data-theme="dark"] .reader-floater button { color: #e5e5e7; }
    .reader-floater button:hover { background: var(--ap-ink-08, rgba(29,29,31,.08)); }
    .reader-floater button:active { transform: scale(.95); }
    .reader-floater .play-main {
      width: 44px; height: 44px;
      background: #0071e3; color: #fff !important;
      font-size: 16px;
    }
    .reader-floater .play-main:hover { background: #0077ed; }
    .reader-floater .sep {
      width: 1px; height: 20px; background: var(--ap-ink-08, rgba(29,29,31,.08));
    }
    .reader-floater .size-indicator {
      font-size: 11px; color: var(--ap-ink-48, rgba(29,29,31,.48));
      font-family: "SF Pro Text", monospace;
      min-width: 32px; text-align: center;
    }
  `;
  document.head.appendChild(style);
}

let keyHandler = null;
let fontScale = 1.0;
let currentLineIdx = 0;

function cloneContentToReader(dest) {
  const src = document.getElementById('content');
  if (!src) return;
  dest.innerHTML = '';
  const lines = src.querySelectorAll('.line-container, .ruby-line');
  if (!lines.length) {
    dest.innerHTML = '<div style="opacity:.5;text-align:center;padding:60px;">没有内容可供阅读</div>';
    return;
  }
  lines.forEach((ln, i) => {
    const clone = document.createElement('div');
    clone.className = 'reader-line';
    clone.dataset.idx = String(i);
    const inner = ln.cloneNode(true);
    inner.querySelectorAll('.analyze-line-btn, .play-line-btn').forEach(el => el.remove());
    while (inner.firstChild) clone.appendChild(inner.firstChild);
    clone.addEventListener('click', () => activateLine(clone, i));
    dest.appendChild(clone);
  });
}

function activateLine(el, idx) {
  const parent = el.parentElement;
  if (!parent) return;
  parent.querySelectorAll('.reader-line.active').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  currentLineIdx = idx;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function moveLine(dir) {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  const lines = overlay.querySelectorAll('.reader-line');
  if (!lines.length) return;
  const next = Math.max(0, Math.min(lines.length - 1, currentLineIdx + dir));
  if (next !== currentLineIdx || !overlay.querySelector('.reader-line.active')) {
    activateLine(lines[next], next);
  }
}

function applyFontScale() {
  const content = document.querySelector('.reader-content');
  if (!content) return;
  content.style.setProperty('--reader-font', `${Math.round(22 * fontScale)}px`);
  const ind = document.querySelector('.reader-floater .size-indicator');
  if (ind) ind.textContent = `${Math.round(100 * fontScale)}%`;
}

function togglePlay() {
  const btn = document.getElementById('headerPlayToggle') || document.getElementById('playAllBtn');
  if (btn) btn.click();
}

export function enterReaderMode() {
  injectCss();
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'reader-overlay';
    overlay.innerHTML = `
      <div class="reader-topbar">
        <span class="title" id="readerTitle"></span>
        <button type="button" class="exit-btn" data-act="exit">✕ 退出 (Esc)</button>
      </div>
      <div class="reader-content"></div>
      <div class="reader-floater">
        <button type="button" data-act="prev" title="上一段 (←)">⏮</button>
        <button type="button" class="play-main" data-act="play" title="播放 / 暂停 (Space)">▶︎</button>
        <button type="button" data-act="next" title="下一段 (→)">⏭</button>
        <div class="sep"></div>
        <button type="button" data-act="size-down" title="缩小字体 (-)">A-</button>
        <span class="size-indicator">100%</span>
        <button type="button" data-act="size-up" title="放大字体 (+)">A+</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-act="exit"]').addEventListener('click', exitReaderMode);
    overlay.querySelector('[data-act="prev"]').addEventListener('click', () => moveLine(-1));
    overlay.querySelector('[data-act="next"]').addEventListener('click', () => moveLine(1));
    overlay.querySelector('[data-act="play"]').addEventListener('click', togglePlay);
    overlay.querySelector('[data-act="size-up"]').addEventListener('click', () => { fontScale = Math.min(2.0, fontScale + 0.1); applyFontScale(); });
    overlay.querySelector('[data-act="size-down"]').addEventListener('click', () => { fontScale = Math.max(0.7, fontScale - 0.1); applyFontScale(); });
  }
  const titleEl = overlay.querySelector('#readerTitle');
  if (titleEl) {
    try {
      const dm = window.documentManager;
      const activeId = dm?.getActiveId?.();
      const doc = dm?.getAllDocuments?.().find(d => d && d.id === activeId);
      titleEl.textContent = doc?.title || '';
    } catch (_) {}
  }
  cloneContentToReader(overlay.querySelector('.reader-content'));
  applyFontScale();
  overlay.classList.add('is-open');
  currentLineIdx = 0;
  const first = overlay.querySelector('.reader-line');
  if (first) activateLine(first, 0);

  keyHandler = (e) => {
    if (e.key === 'Escape') { exitReaderMode(); return; }
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveLine(1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveLine(-1); return; }
    if (e.key === '+' || e.key === '=') { fontScale = Math.min(2.0, fontScale + 0.1); applyFontScale(); }
    if (e.key === '-' || e.key === '_') { fontScale = Math.max(0.7, fontScale - 0.1); applyFontScale(); }
  };
  document.addEventListener('keydown', keyHandler);
}

export function exitReaderMode() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.classList.remove('is-open');
  if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
}

export function wireReaderButton() {
  const btn = document.getElementById(BTN_ID);
  if (!btn || btn.__wired) return;
  btn.__wired = true;
  btn.addEventListener('click', enterReaderMode);
}

if (typeof window !== 'undefined') {
  window.__yomikikuanEnterReaderMode = enterReaderMode;
  window.__yomikikuanExitReaderMode = exitReaderMode;
}
