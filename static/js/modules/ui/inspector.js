// Inspector drawer — Apple-style right-side panel that consolidates the four
// AI entry points (JLPT listening, article summary, vocab/mistake book,
// bilingual toggle) into one surface. Previously each lived as its own emoji
// button on the header toolbar; this module hides those buttons and opens
// their underlying modals via the existing __yomikikuanOpen* hooks.
//
// Boot: main-js.js does a dynamic import and calls mountInspector() once DOM
// is ready. Idempotent.
//
// Public hooks (classic-script globals):
//   window.__yomikikuanOpenInspector()  — slide the drawer in
//   window.__yomikikuanCloseInspector() — slide it out
//   window.__yomikikuanToggleInspector() — flip state

const OVERLAY_ID = 'inspectorOverlay';
const DRAWER_ID = 'inspectorDrawer';
const TRIGGER_ID = 'inspectorToggleBtn';
const CSS_FLAG = '__yomikikuanInspectorCssInjected';

function injectCss() {
  if (typeof window === 'undefined' || window[CSS_FLAG]) return;
  window[CSS_FLAG] = true;
  const style = document.createElement('style');
  style.id = 'inspector-css';
  style.textContent = `
    #${TRIGGER_ID} { position: relative; }
    #${TRIGGER_ID}[aria-expanded="true"] {
      background: rgba(0,113,227,.12) !important;
      color: var(--ap-blue, #0071e3) !important;
    }
    :root[data-theme="dark"] #${TRIGGER_ID}[aria-expanded="true"] {
      background: rgba(41,151,255,.18) !important;
      color: #2997ff !important;
    }
    #${TRIGGER_ID} .inspector-sparkle {
      font-size: 16px;
      line-height: 1;
      display: inline-block;
      transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    #${TRIGGER_ID}:hover .inspector-sparkle {
      transform: rotate(-12deg) scale(1.08);
    }

    .inspector-overlay {
      position: fixed;
      inset: 0;
      z-index: 9998;
      background: rgba(0,0,0,.12);
      opacity: 0;
      pointer-events: none;
      transition: opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .inspector-overlay.is-open { opacity: 1; pointer-events: auto; }
    :root[data-theme="dark"] .inspector-overlay { background: rgba(0,0,0,.35); }

    .inspector-drawer {
      position: fixed;
      top: 0; right: 0; bottom: 0;
      width: 380px;
      max-width: 92vw;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      background: rgba(255,255,255,.86);
      -webkit-backdrop-filter: saturate(180%) blur(24px);
      backdrop-filter: saturate(180%) blur(24px);
      border-left: 1px solid var(--ap-ink-08, rgba(29,29,31,.08));
      box-shadow: -12px 0 40px rgba(0,0,0,.08);
      transform: translateX(100%);
      transition: transform 320ms cubic-bezier(0.175, 0.885, 0.32, 1.15);
      font-family: var(--ap-font-text, -apple-system, "SF Pro Text", system-ui, sans-serif);
      color: var(--ap-ink, #1d1d1f);
    }
    .inspector-drawer.is-open { transform: translateX(0); }
    :root[data-theme="dark"] .inspector-drawer {
      background: rgba(20,20,22,.84);
      border-left-color: rgba(245,245,247,.10);
    }

    .inspector-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 18px 20px 12px;
      border-bottom: 1px solid var(--ap-ink-08, rgba(29,29,31,.08));
    }
    .inspector-head .inspector-title {
      font-family: var(--ap-font-display, -apple-system, "SF Pro Display", sans-serif);
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.018em;
      margin: 0;
      flex: 1;
      line-height: 1.2;
    }
    .inspector-head .inspector-subtitle {
      display: block;
      font-size: 11px;
      font-weight: 400;
      color: var(--ap-ink-48, rgba(29,29,31,.48));
      letter-spacing: 0.02em;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .inspector-close {
      background: var(--ap-surface-2, #f5f5f7);
      border: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--ap-ink-64, rgba(29,29,31,.64));
      transition: background 120ms cubic-bezier(0.4, 0, 0.2, 1), color 120ms;
    }
    .inspector-close:hover {
      background: var(--ap-surface-3, #ededf0);
      color: var(--ap-ink, #1d1d1f);
    }
    :root[data-theme="dark"] .inspector-close {
      background: rgba(245,245,247,.10);
      color: rgba(245,245,247,.72);
    }
    :root[data-theme="dark"] .inspector-close:hover {
      background: rgba(245,245,247,.18);
      color: #f5f5f7;
    }

    .inspector-body {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 12px 14px 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .inspector-card {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      background: rgba(255,255,255,.72);
      border: 1px solid var(--ap-ink-08, rgba(29,29,31,.08));
      border-radius: 12px;
      padding: 12px 14px;
      text-align: left;
      cursor: pointer;
      color: var(--ap-ink, #1d1d1f);
      transition: background 140ms cubic-bezier(0.4, 0, 0.2, 1),
                  border-color 140ms, transform 140ms;
      font-family: inherit;
    }
    .inspector-card:hover {
      background: rgba(0,113,227,.05);
      border-color: rgba(0,113,227,.22);
      transform: translateY(-1px);
    }
    .inspector-card:active { transform: translateY(0) scale(.99); }
    :root[data-theme="dark"] .inspector-card {
      background: rgba(245,245,247,.04);
      border-color: rgba(245,245,247,.10);
    }
    :root[data-theme="dark"] .inspector-card:hover {
      background: rgba(41,151,255,.10);
      border-color: rgba(41,151,255,.34);
    }

    .inspector-card .card-icon {
      flex: 0 0 auto;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      line-height: 1;
      background: linear-gradient(135deg, rgba(0,113,227,.14), rgba(0,113,227,.06));
      color: var(--ap-blue, #0071e3);
    }
    .inspector-card[data-kind="summary"] .card-icon {
      background: linear-gradient(135deg, rgba(175,82,222,.16), rgba(175,82,222,.06));
      color: #af52de;
    }
    .inspector-card[data-kind="vocab"] .card-icon {
      background: linear-gradient(135deg, rgba(52,199,89,.16), rgba(52,199,89,.06));
      color: #30a150;
    }
    .inspector-card[data-kind="bilingual"] .card-icon {
      background: linear-gradient(135deg, rgba(255,149,0,.16), rgba(255,149,0,.06));
      color: #cc7a00;
    }
    .inspector-card[data-kind="export"] .card-icon {
      background: linear-gradient(135deg, rgba(88,86,214,.16), rgba(88,86,214,.06));
      color: #5856d6;
    }
    :root[data-theme="dark"] .inspector-card[data-kind="vocab"] .card-icon { color: #30d158; }
    :root[data-theme="dark"] .inspector-card[data-kind="bilingual"] .card-icon { color: #ff9f0a; }
    :root[data-theme="dark"] .inspector-card[data-kind="export"] .card-icon { color: #5e5ce6; }

    .inspector-card .card-body { flex: 1 1 auto; min-width: 0; }
    .inspector-card .card-title {
      font-family: var(--ap-font-display, -apple-system, "SF Pro Display", sans-serif);
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.012em;
      color: var(--ap-ink, #1d1d1f);
      line-height: 1.25;
    }
    .inspector-card .card-desc {
      font-size: 12px;
      color: var(--ap-ink-64, rgba(29,29,31,.64));
      margin-top: 2px;
      line-height: 1.35;
      letter-spacing: -0.004em;
    }
    :root[data-theme="dark"] .inspector-card .card-title { color: #f5f5f7; }
    :root[data-theme="dark"] .inspector-card .card-desc { color: rgba(245,245,247,.64); }

    .inspector-card .card-chevron {
      flex: 0 0 auto;
      color: var(--ap-ink-48, rgba(29,29,31,.48));
      transition: transform 140ms;
    }
    .inspector-card:hover .card-chevron {
      transform: translateX(2px);
      color: var(--ap-blue, #0071e3);
    }

    .inspector-card[data-kind="bilingual"].is-on {
      background: rgba(255,149,0,.10);
      border-color: rgba(255,149,0,.40);
    }
    .inspector-card[data-kind="bilingual"] .card-state {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--ap-surface-2, #f5f5f7);
      color: var(--ap-ink-64, rgba(29,29,31,.64));
      letter-spacing: 0.02em;
    }
    .inspector-card[data-kind="bilingual"].is-on .card-state {
      background: #ff9500;
      color: #fff;
    }
    :root[data-theme="dark"] .inspector-card[data-kind="bilingual"].is-on {
      background: rgba(255,159,10,.16);
      border-color: rgba(255,159,10,.48);
    }

    html.no-gemini-key .inspector-card[data-kind="jlpt"] .card-desc::after,
    html.no-gemini-key .inspector-card[data-kind="summary"] .card-desc::after {
      content: " · ⚠️ 需要 Gemini Key";
      color: #ff3b30;
      font-weight: 500;
    }

    #vocabBtn,
    #articleSummaryBtn,
    #jlptBtn,
    #bilingualToggle { display: none !important; }

    @media (max-width: 480px) {
      .inspector-drawer { width: 100vw; max-width: 100vw; }
    }

    @media (prefers-reduced-motion: reduce) {
      .inspector-drawer,
      .inspector-overlay,
      .inspector-card,
      #${TRIGGER_ID} .inspector-sparkle {
        transition-duration: 0ms !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureDrawer() {
  let drawer = document.getElementById(DRAWER_ID);
  if (drawer) return drawer;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'inspector-overlay';
  overlay.addEventListener('click', closeInspector);

  drawer = document.createElement('aside');
  drawer.id = DRAWER_ID;
  drawer.className = 'inspector-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'false');
  drawer.setAttribute('aria-label', 'AI Inspector');
  drawer.setAttribute('tabindex', '-1');

  drawer.innerHTML = `
    <div class="inspector-head">
      <div style="flex:1;min-width:0;">
        <span class="inspector-subtitle">Inspector</span>
        <h2 class="inspector-title" id="inspectorTitleText">AI アシスタント</h2>
      </div>
      <button class="inspector-close" id="inspectorCloseBtn" aria-label="关闭" title="关闭">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div class="inspector-body">
      <button type="button" class="inspector-card" data-kind="summary" data-action="__yomikikuanOpenArticleSummary">
        <span class="card-icon" aria-hidden="true">📖</span>
        <span class="card-body">
          <span class="card-title">文章解析</span>
          <span class="card-desc">全篇摘要 · 关键句 · JLPT 等级推荐</span>
        </span>
        <svg class="card-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <button type="button" class="inspector-card" data-kind="jlpt" data-action="__yomikikuanOpenJLPT">
        <span class="card-icon" aria-hidden="true">🎧</span>
        <span class="card-body">
          <span class="card-title">JLPT 聴解练习</span>
          <span class="card-desc">6 种真题题型 · 模拟考试 · 成绩记录 · 词汇/语法/陷阱三层解析</span>
        </span>
        <svg class="card-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <button type="button" class="inspector-card" data-kind="vocab" data-action="__yomikikuanOpenVocab">
        <span class="card-icon" aria-hidden="true">🧠</span>
        <span class="card-body">
          <span class="card-title">词汇本 / 错题本</span>
          <span class="card-desc">SM-2 间隔复习 · 每日到期卡片</span>
        </span>
        <svg class="card-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <button type="button" class="inspector-card" data-kind="bilingual" data-action="__yomikikuanToggleBilingual">
        <span class="card-icon" aria-hidden="true">中</span>
        <span class="card-body">
          <span class="card-title">双语对照</span>
          <span class="card-desc">每行中日并排，按需延迟翻译</span>
        </span>
        <span class="card-state" id="inspectorBilingualState">OFF</span>
      </button>

      <button type="button" class="inspector-card" data-kind="export" data-action="__yomikikuanExportDocAsHtml">
        <span class="card-icon" aria-hidden="true">📄</span>
        <span class="card-body">
          <span class="card-title">导出 HTML</span>
          <span class="card-desc">单文档独立 HTML · 可在浏览器打印为 PDF</span>
        </span>
        <svg class="card-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  drawer.querySelector('#inspectorCloseBtn').addEventListener('click', closeInspector);
  drawer.querySelectorAll('.inspector-card').forEach((card) => {
    card.addEventListener('click', () => {
      const kind = card.getAttribute('data-kind');
      const actionName = card.getAttribute('data-action');

      const invoke = () => {
        try {
          const fn = actionName ? window[actionName] : null;
          if (typeof fn === 'function') fn();
        } catch (err) {
          console.warn('[inspector] action failed', actionName, err);
        }
      };

      if (kind === 'bilingual') {
        import('/static/js/modules/analyzer/ui/bilingual.js')
          .then(() => { invoke(); refreshBilingualState(); })
          .catch((err) => console.warn('[inspector] bilingual import failed', err));
        return;
      }

      const modulePathMap = {
        jlpt: '/static/js/modules/analyzer/ui/jlptPanel.js',
        summary: '/static/js/modules/analyzer/ui/articleSummary.js',
        vocab: '/static/js/modules/analyzer/ui/vocabPanel.js',
        export: '/static/js/modules/backup/doc-export.js',
      };
      const path = modulePathMap[kind];
      const openAndClose = () => { invoke(); closeInspector(); };
      if (path && typeof window[actionName] !== 'function') {
        import(path).then(openAndClose).catch((err) => {
          console.warn('[inspector] panel import failed', err);
          openAndClose();
        });
      } else {
        openAndClose();
      }
    });
  });

  return drawer;
}

function refreshBilingualState() {
  const card = document.querySelector('.inspector-card[data-kind="bilingual"]');
  const state = document.getElementById('inspectorBilingualState');
  if (!card || !state) return;
  let on = false;
  try {
    on = !!(window.__yomikikuanBilingualState && window.__yomikikuanBilingualState.enabled);
  } catch (_) {}
  card.classList.toggle('is-on', on);
  state.textContent = on ? 'ON' : 'OFF';
}

function bindKeyShortcut() {
  if (window.__yomikikuanInspectorKeyBound) return;
  window.__yomikikuanInspectorKeyBound = true;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const d = document.getElementById(DRAWER_ID);
      if (d && d.classList.contains('is-open')) closeInspector();
    }
  });
}

export function openInspector() {
  injectCss();
  const d = ensureDrawer();
  const overlay = document.getElementById(OVERLAY_ID);
  d.classList.add('is-open');
  if (overlay) overlay.classList.add('is-open');
  const trigger = document.getElementById(TRIGGER_ID);
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  refreshBilingualState();
  try { d.focus({ preventScroll: true }); } catch (_) {}
}

export function closeInspector() {
  const d = document.getElementById(DRAWER_ID);
  const overlay = document.getElementById(OVERLAY_ID);
  if (d) d.classList.remove('is-open');
  if (overlay) overlay.classList.remove('is-open');
  const trigger = document.getElementById(TRIGGER_ID);
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

export function toggleInspector() {
  const d = document.getElementById(DRAWER_ID);
  if (d && d.classList.contains('is-open')) closeInspector();
  else openInspector();
}

export function mountInspector() {
  if (typeof window === 'undefined') return;
  injectCss();
  const trigger = document.getElementById(TRIGGER_ID);
  if (trigger && !trigger.__yomikikuanInspectorWired) {
    trigger.__yomikikuanInspectorWired = true;
    trigger.addEventListener('click', toggleInspector);
    trigger.setAttribute('aria-expanded', 'false');
  }
  bindKeyShortcut();
  // Wrap the bilingual toggle once it exists so ON/OFF badge stays accurate.
  const origToggle = window.__yomikikuanToggleBilingual;
  if (origToggle && !origToggle.__yomikikuanWrapped) {
    const wrapped = function () {
      const r = origToggle.apply(this, arguments);
      setTimeout(refreshBilingualState, 0);
      return r;
    };
    wrapped.__yomikikuanWrapped = true;
    window.__yomikikuanToggleBilingual = wrapped;
  }
}

if (typeof window !== 'undefined') {
  window.__yomikikuanOpenInspector = openInspector;
  window.__yomikikuanCloseInspector = closeInspector;
  window.__yomikikuanToggleInspector = toggleInspector;
}
