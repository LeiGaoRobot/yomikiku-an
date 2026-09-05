// YouTube import panel — overlay shell + URL field + 3 tabs.
// Tab content modules (./tabs/import, ./tabs/companion, ./tabs/listening)
// are lazy-imported on first switch. No contact with the playback boundary
// in main-js.js / tts.js — (B) embeds the YouTube IFrame Player API and
// runs its own polling-based subtitle highlight.

import { parseYoutubeUrl } from './url.js';
import { fetchVideoMeta } from './oembed.js';

const CSS_FLAG = '__yomikikuanYoutubeCssInjected';
const MAX_DURATION_SEC = 600;  // hard cap for MVP
let overlayEl = null;
let currentParsed = null;       // { videoId, startSec?, endSec? }
let currentMeta   = null;       // { title, author, thumbnail }
let activeTab     = 'import';
const tabModules  = { import: null, companion: null, listening: null };

function injectCss() {
  if (window[CSS_FLAG]) return;
  window[CSS_FLAG] = true;
  const style = document.createElement('style');
  style.id = 'youtube-panel-css';
  style.textContent = `
    .youtube-overlay { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.4);
      display:flex; align-items:center; justify-content:center; padding:24px; backdrop-filter:blur(8px); }
    .youtube-panel { background:var(--bg,#fff); color:var(--text,#111);
      width:min(880px,100%); max-height:calc(100vh - 48px); border-radius:18px;
      box-shadow:0 24px 80px rgba(0,0,0,0.28); display:flex; flex-direction:column; overflow:hidden;
      border:1px solid var(--border,rgba(0,0,0,0.1)); }
    .youtube-panel-header { display:flex; align-items:center; justify-content:space-between;
      padding:14px 20px; border-bottom:1px solid var(--border,rgba(0,0,0,0.08)); }
    .youtube-panel-header h3 { margin:0; font-size:16px; font-weight:600; }
    .youtube-close { background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted,#888); padding:0 6px; }
    .youtube-url-row { display:flex; gap:8px; padding:14px 20px; }
    .youtube-url-row input { flex:1; padding:8px 12px; border:1px solid var(--border,rgba(0,0,0,0.15));
      border-radius:8px; font-size:14px; background:var(--input-bg,#fff); color:inherit; }
    .youtube-url-row button { padding:8px 14px; border:1px solid var(--border,rgba(0,0,0,0.15));
      border-radius:8px; background:var(--btn-bg,#f3f3f5); color:inherit; cursor:pointer; }
    .youtube-meta { display:flex; gap:12px; padding:0 20px 12px; align-items:flex-start; }
    .youtube-meta img { width:120px; border-radius:8px; }
    .youtube-tabs { display:flex; padding:0 20px; border-bottom:1px solid var(--border,rgba(0,0,0,0.08)); }
    .youtube-tab { background:none; border:none; padding:10px 14px; cursor:pointer;
      font-size:13px; color:var(--muted,#888); border-bottom:2px solid transparent; margin-bottom:-1px; }
    .youtube-tab.is-active { color:var(--text,#111); border-bottom-color:var(--ap-blue, #E63946); font-weight:600; }
    .youtube-tab-content { flex:1; overflow-y:auto; padding:14px 20px; min-height:200px; }
    .youtube-error { color:#ff3b30; font-size:13px; padding:0 20px 8px; }
  `;
  document.head.appendChild(style);
}

function buildShell() {
  const overlay = document.createElement('div');
  overlay.className = 'youtube-overlay';
  overlay.innerHTML = `
    <div class="youtube-panel" role="dialog" aria-modal="true" aria-label="YouTube import">
      <div class="youtube-panel-header">
        <h3>从 YouTube 导入</h3>
        <button type="button" class="youtube-close" aria-label="关闭">×</button>
      </div>
      <div class="youtube-url-row">
        <input type="url" id="ytUrlInput" placeholder="粘贴 YouTube URL（≤10 分钟）" />
        <button type="button" id="ytParseBtn">解析视频</button>
      </div>
      <div id="ytErrorBar" class="youtube-error" hidden></div>
      <div id="ytMeta" class="youtube-meta" hidden></div>
      <div class="youtube-tabs">
        <button type="button" class="youtube-tab is-active" data-tab="import">导入字幕</button>
        <button type="button" class="youtube-tab" data-tab="companion">视频伴读</button>
        <button type="button" class="youtube-tab" data-tab="listening">生成听力题</button>
      </div>
      <div id="ytTabContent" class="youtube-tab-content"></div>
    </div>`;
  return overlay;
}

function showError(msg) {
  const bar = overlayEl.querySelector('#ytErrorBar');
  bar.textContent = msg; bar.hidden = false;
}
function clearError() {
  const bar = overlayEl.querySelector('#ytErrorBar');
  bar.textContent = ''; bar.hidden = true;
}

async function onParseClick() {
  clearError();
  const input = overlayEl.querySelector('#ytUrlInput').value;
  const parsed = parseYoutubeUrl(input);
  if (!parsed) { showError('请输入有效的 YouTube URL'); return; }
  currentParsed = parsed;
  try {
    const meta = await fetchVideoMeta(parsed.videoId);
    currentMeta = meta;
    const m = overlayEl.querySelector('#ytMeta');
    m.innerHTML = `
      <img src="${meta.thumbnail}" alt="">
      <div>
        <div style="font-weight:600">${meta.title}</div>
        <div style="opacity:.7;font-size:12px">${meta.author}</div>
      </div>`;
    m.hidden = false;
    await renderTab(activeTab);
  } catch (e) {
    if (e.message === 'NOT_EMBEDDABLE') showError('视频不可用（私有或已删除）');
    else if (e.message === 'NETWORK')   showError('网络错误，请重试');
    else                                showError(`解析失败：${e.message}`);
  }
}

async function loadTabModule(name) {
  if (tabModules[name]) return tabModules[name];
  const mod = await import(`/static/js/modules/youtube/tabs/${name}.js`);
  tabModules[name] = mod;
  return mod;
}

async function renderTab(name) {
  if (!currentParsed) return;
  const prior = tabModules[activeTab];
  if (prior && typeof prior.teardown === 'function') {
    try { prior.teardown(); } catch (_) {}
  }
  activeTab = name;
  const root = overlayEl.querySelector('#ytTabContent');
  root.innerHTML = '<div style="opacity:.6">加载中…</div>';
  try {
    const mod = await loadTabModule(name);
    mod.render(root, { parsed: currentParsed, meta: currentMeta, maxDurationSec: MAX_DURATION_SEC });
  } catch (err) {
    root.innerHTML = `<div class="youtube-error">${err.message}</div>`;
  }
}

function onTabClick(ev) {
  const btn = ev.target.closest('.youtube-tab'); if (!btn) return;
  overlayEl.querySelectorAll('.youtube-tab').forEach(b => b.classList.toggle('is-active', b === btn));
  renderTab(btn.dataset.tab);
}

function onKeyDown(ev) {
  if (ev.key === 'Escape') unmountPanel();
}

export function mountPanel(doc) {
  if (overlayEl) return;
  injectCss();
  overlayEl = buildShell();
  (doc || document).body.appendChild(overlayEl);
  overlayEl.querySelector('.youtube-close').addEventListener('click', unmountPanel);
  overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) unmountPanel(); });
  overlayEl.querySelector('#ytParseBtn').addEventListener('click', onParseClick);
  overlayEl.querySelector('#ytUrlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onParseClick();
  });
  overlayEl.querySelector('.youtube-tabs').addEventListener('click', onTabClick);
  document.addEventListener('keydown', onKeyDown);
}

export function unmountPanel() {
  if (!overlayEl) return;
  const prior = tabModules[activeTab];
  if (prior && typeof prior.teardown === 'function') {
    try { prior.teardown(); } catch (_) {}
  }
  document.removeEventListener('keydown', onKeyDown);
  overlayEl.remove();
  overlayEl = null;
  currentParsed = null;
  currentMeta = null;
}

if (typeof window !== 'undefined') {
  window.__yomikikuanOpenYoutube = () => mountPanel(document);
}
