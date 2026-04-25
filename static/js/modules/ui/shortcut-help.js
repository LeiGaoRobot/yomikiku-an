// Keyboard shortcut help overlay — invoked by pressing `?`.

const CSS_FLAG = '__yomikikuanShortcutCssInjected';
const OVERLAY_ID = 'shortcutHelpOverlay';

const SHORTCUTS = [
  { group: '全局', items: [
    { keys: ['?'], desc: '显示 / 隐藏此快捷键面板' },
    { keys: ['Esc'], desc: '关闭当前弹窗 / 阅读模式' },
    { keys: ['⌘', 'F'], desc: '搜索文档' },
    { keys: ['⌘', 'N'], desc: '新建文档' },
  ]},
  { group: '播放', items: [
    { keys: ['Space'], desc: '播放 / 暂停（阅读模式）' },
    { keys: ['←'], desc: '上一段' },
    { keys: ['→'], desc: '下一段' },
    { keys: ['↑'], desc: '加速 +0.1×' },
    { keys: ['↓'], desc: '减速 -0.1×' },
    { keys: ['J'], desc: '上一段' },
    { keys: ['K'], desc: '下一段' },
  ]},
  { group: '阅读模式', items: [
    { keys: ['+'], desc: '放大字体' },
    { keys: ['-'], desc: '缩小字体' },
  ]},
  { group: '面板', items: [
    { keys: ['I'], desc: '打开 / 关闭 AI Inspector' },
    { keys: ['R'], desc: '进入阅读模式' },
  ]},
];

function injectCss() {
  if (window[CSS_FLAG]) return;
  window[CSS_FLAG] = true;
  const style = document.createElement('style');
  style.id = 'shortcut-help-css';
  style.textContent = `
    .sk-overlay {
      position: fixed; inset: 0; z-index: 10001;
      background: rgba(0,0,0,.35);
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
      display: none; align-items: center; justify-content: center;
      padding: 40px;
    }
    .sk-overlay.is-open { display: flex; }
    .sk-panel {
      background: var(--ap-surface, #fff);
      border: 1px solid var(--ap-ink-08, rgba(29,29,31,.08));
      border-radius: 18px;
      box-shadow: 0 24px 80px rgba(0,0,0,.28);
      width: min(520px, 100%); max-height: 80vh;
      display: flex; flex-direction: column; overflow: hidden;
      animation: skIn 240ms cubic-bezier(0.175, 0.885, 0.32, 1.15);
    }
    @keyframes skIn { from { opacity:0; transform: translateY(10px) scale(.98); } to { opacity:1; transform: none; } }
    :root[data-theme="dark"] .sk-panel { background: #1d1d1f; color: #f2f2f7; }
    .sk-head { padding: 14px 20px; border-bottom: 1px solid var(--ap-ink-08, rgba(29,29,31,.08)); display:flex; align-items:center; gap:10px; }
    .sk-head h3 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; flex: 1; }
    .sk-close { background: var(--ap-surface-2,#f5f5f7); border: none; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; color: var(--ap-ink-64,rgba(29,29,31,.64)); font-size: 14px; }
    .sk-body { padding: 12px 20px 20px; overflow-y: auto; }
    .sk-group { margin-top: 12px; }
    .sk-group:first-child { margin-top: 0; }
    .sk-group h4 {
      margin: 0 0 6px; font-size: 10.5px; letter-spacing: .05em;
      text-transform: uppercase; color: var(--ap-ink-48,rgba(29,29,31,.48)); font-weight: 600;
    }
    .sk-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; font-size: 13px; }
    .sk-row .desc { flex: 1; }
    .sk-row .keys { display: inline-flex; gap: 4px; }
    .sk-key {
      display: inline-block; padding: 2px 8px;
      background: var(--ap-surface-2, #f5f5f7);
      border: 1px solid var(--ap-ink-08, rgba(29,29,31,.08));
      border-radius: 6px; font-size: 11.5px; font-family: "SF Pro Text", monospace;
      color: var(--ap-ink, #1d1d1f); min-width: 14px; text-align: center;
    }
    :root[data-theme="dark"] .sk-key { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.10); color: #f2f2f7; }
  `;
  document.head.appendChild(style);
}

export function showShortcutHelp() {
  injectCss();
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'sk-overlay';
    const body = SHORTCUTS.map(g => `
      <div class="sk-group">
        <h4>${g.group}</h4>
        ${g.items.map(it => `
          <div class="sk-row">
            <span class="desc">${it.desc}</span>
            <span class="keys">${it.keys.map(k => `<kbd class="sk-key">${k}</kbd>`).join('')}</span>
          </div>
        `).join('')}
      </div>
    `).join('');
    overlay.innerHTML = `
      <div class="sk-panel" role="dialog" aria-label="键盘快捷键">
        <div class="sk-head">
          <span aria-hidden="true" style="font-size:16px;">⌨️</span>
          <h3>键盘快捷键</h3>
          <button class="sk-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="sk-body">${body}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hideShortcutHelp(); });
    overlay.querySelector('.sk-close').addEventListener('click', hideShortcutHelp);
  }
  overlay.classList.add('is-open');
}
export function hideShortcutHelp() {
  const o = document.getElementById(OVERLAY_ID);
  if (o) o.classList.remove('is-open');
}
export function toggleShortcutHelp() {
  const o = document.getElementById(OVERLAY_ID);
  if (o && o.classList.contains('is-open')) hideShortcutHelp();
  else showShortcutHelp();
}

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const t = el.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || el.isContentEditable;
}

export function wireShortcutHelp() {
  if (window.__yomikikuanShortcutWired) return;
  window.__yomikikuanShortcutWired = true;
  document.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      toggleShortcutHelp();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      if (typeof window.__yomikikuanEnterReaderMode === 'function') {
        e.preventDefault();
        window.__yomikikuanEnterReaderMode();
      }
    }
    if (e.key === 'i' || e.key === 'I') {
      if (typeof window.__yomikikuanToggleInspector === 'function') {
        e.preventDefault();
        window.__yomikikuanToggleInspector();
      }
    }
    if (e.key === 'Escape') hideShortcutHelp();
  });
}

if (typeof window !== 'undefined') {
  window.__yomikikuanShowShortcutHelp = showShortcutHelp;
  window.__yomikikuanHideShortcutHelp = hideShortcutHelp;
  window.__yomikikuanToggleShortcutHelp = toggleShortcutHelp;
}
