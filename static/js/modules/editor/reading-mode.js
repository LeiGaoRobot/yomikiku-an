// editor/reading-mode — canonical owner of reading-mode state + overlay.
// Extracted from static/main-js.js (lines 692-693, 887-896, 1309-1552, 5774-5788).
// Self-bootstraps on import and sets `window.__ESM_READING_MODE = true` so
// legacy main-js.js callers can short-circuit. Single-owner consolidation
// (2026-10-18): the old `window.__setMainReadingMode` reverse-sync was removed
// when main-js.js dropped its duplicate copy of this state.

import { t as i18nT } from '../i18n/index.js';

let isReadingMode = false;
let activeReadingLine = null;

function t(key, fallback) {
  try {
    const v = i18nT(key, fallback);
    return (v != null) ? v : (fallback != null ? fallback : key);
  } catch (_) {
    return fallback != null ? fallback : key;
  }
}

function clearReadingLineHighlight() {
  if (!activeReadingLine) return;
  const previous = activeReadingLine;
  activeReadingLine = null;
  previous.classList.remove('reading-line-active');
  previous.removeAttribute('aria-current');
  if (previous.hasAttribute('aria-pressed')) {
    previous.setAttribute('aria-pressed', 'false');
  }
}

function syncReadingLineAttributes(enabled) {
  const content = document.getElementById('content');
  if (!content) return;
  const lines = content.querySelectorAll('.line-container');
  lines.forEach((line) => {
    if (enabled) {
      line.setAttribute('tabindex', '0');
      line.setAttribute('role', 'button');
      const isActive = line.classList.contains('reading-line-active');
      line.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      if (isActive) line.setAttribute('aria-current', 'true');
      else line.removeAttribute('aria-current');
    } else {
      line.setAttribute('tabindex', '-1');
      if (line.getAttribute('role') === 'button') line.removeAttribute('role');
      line.removeAttribute('aria-pressed');
      line.removeAttribute('aria-current');
    }
  });
}

function setReadingLineActive(line) {
  if (!line || !isReadingMode) return;
  if (activeReadingLine === line) {
    clearReadingLineHighlight();
    syncReadingLineAttributes(true);
    return;
  }
  clearReadingLineHighlight();
  activeReadingLine = line;
  line.classList.add('reading-line-active');
  line.setAttribute('aria-pressed', 'true');
  line.setAttribute('aria-current', 'true');
  syncReadingLineAttributes(true);
}

function updateReadingToggleLabels() {
  const enterLabel = t('readingToggleEnter', '読書モード');
  const exitLabel  = t('readingToggleExit', '通常表示へ');
  const enterTip   = t('readingToggleTooltipEnter', enterLabel);
  const exitTip    = t('readingToggleTooltipExit', exitLabel);
  const label   = isReadingMode ? exitLabel : enterLabel;
  const tooltip = isReadingMode ? exitTip   : enterTip;
  const readingModeToggle   = document.getElementById('readingModeToggle');
  const editorReadingToggle = document.getElementById('editorReadingToggle');
  [readingModeToggle, editorReadingToggle].forEach((btn) => {
    if (!btn) return;
    btn.title = tooltip;
    btn.setAttribute('aria-label', tooltip);
    btn.setAttribute('aria-pressed', String(isReadingMode));
    btn.classList.toggle('is-active', isReadingMode);
  });
}

function bindReadingOverlayInteractions(container) {
  if (!container) return;
  container.addEventListener('click', (event) => {
    if (!isReadingMode) return;
    const line = event.target.closest('.line-container');
    if (!line) return;
    setReadingLineActive(line);
  });
  container.addEventListener('keydown', (event) => {
    if (!isReadingMode) return;
    const line = event.target.closest('.line-container');
    if (!line) return;
    if ((event.key === 'Enter' || event.key === ' ')
        && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      setReadingLineActive(line);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setReadingMode(false);
    }
  });
}

function createOverlay() {
  const existing = document.getElementById('readingOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'reading-overlay';
  overlay.id = 'readingOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('readingToggleEnter', '読書モード'));

  const backdrop = document.createElement('div');
  backdrop.className = 'overlay-backdrop';
  const contentWrap = document.createElement('div');
  contentWrap.className = 'overlay-content';

  const toolbar = document.createElement('div');
  toolbar.className = 'overlay-toolbar';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'overlay-close';
  closeBtn.type = 'button';
  closeBtn.title = t('readingToggleExit', '通常表示へ');
  closeBtn.setAttribute('aria-label', closeBtn.title);
  closeBtn.innerHTML = '&times;';
  toolbar.appendChild(closeBtn);

  try {
    const original = document.getElementById('content');
    const textInput = document.getElementById('textInput');
    if (original) {
      const hasAnalysis = original.querySelector('.token-pill, .analysis-section, .line-container');
      if (hasAnalysis) {
        contentWrap.innerHTML = original.innerHTML;
      } else {
        const inputText = textInput ? textInput.value : '';
        if (inputText && inputText.trim()) {
          const hasMarkdown = /[#*_\[\]`]/.test(inputText)
                           || /^[-*+]\s/m.test(inputText)
                           || /^\d+\.\s/m.test(inputText)
                           || /^>\s/m.test(inputText);
          if (hasMarkdown && typeof marked !== 'undefined') {
            try {
              contentWrap.innerHTML = marked.parse(inputText);
              contentWrap.classList.add('markdown-content');
            } catch (_) {
              contentWrap.innerHTML = original.innerHTML || `<p class="empty-state">${t('readingMode.empty', '暂无内容')}</p>`;
            }
          } else {
            contentWrap.innerHTML = inputText.split('\n')
              .map(line => `<p>${line || '<br>'}</p>`).join('');
          }
        } else {
          contentWrap.innerHTML = original.innerHTML || `<p class="empty-state">${t('readingMode.empty', '暂无内容')}</p>`;
        }
      }
    }
  } catch (_) {}

  overlay.appendChild(backdrop);
  overlay.appendChild(contentWrap);
  overlay.appendChild(toolbar);
  document.body.appendChild(overlay);

  const dismiss = () => setReadingMode(false);
  backdrop.addEventListener('click', dismiss);
  closeBtn.addEventListener('click', dismiss);
  bindReadingOverlayInteractions(contentWrap);
}

function removeOverlay() {
  try {
    const overlay = document.getElementById('readingOverlay');
    if (overlay) overlay.remove();
  } catch (_) {}
  clearReadingLineHighlight();
}

function setReadingMode(enabled, options = {}) {
  if (!document.body) return;
  const shouldEnable = Boolean(enabled);
  const updateUrl = options.updateUrl !== false;
  const sameState = shouldEnable === isReadingMode;

  if (sameState && !options.force) {
    if (updateUrl) {
      try {
        const url = new URL(window.location.href);
        if (shouldEnable) url.searchParams.set('read', '1');
        else url.searchParams.delete('read');
        window.history.replaceState({}, '', url);
      } catch (_) {}
    }
    return;
  }

  const readingModeToggle = document.getElementById('readingModeToggle');
  if (readingModeToggle) {
    if (shouldEnable) {
      readingModeToggle.classList.add('click-animation');
      setTimeout(() => readingModeToggle.classList.remove('click-animation'), 150);
    } else if (isReadingMode) {
      readingModeToggle.classList.add('exit-animation');
      setTimeout(() => readingModeToggle.classList.remove('exit-animation'), 300);
    }
  }

  isReadingMode = shouldEnable;

  const updateButtons = () => {
    const btns = [
      document.getElementById('readingModeToggle'),
      document.getElementById('editorReadingToggle'),
    ];
    btns.forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle('is-active', shouldEnable);
      btn.setAttribute('aria-pressed', String(shouldEnable));
    });
    updateReadingToggleLabels();
  };

  requestAnimationFrame(() => {
    if (shouldEnable) createOverlay();
    else removeOverlay();
    updateButtons();
    syncReadingLineAttributes(shouldEnable);
  });

  if (updateUrl) {
    try {
      const url = new URL(window.location.href);
      if (shouldEnable) url.searchParams.set('read', '1');
      else url.searchParams.delete('read');
      window.history.replaceState({}, '', url);
    } catch (_) {}
  }
}

function initReadingModeToggle() {
  // Seed from URL
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('read')) {
      isReadingMode = true;
    }
  } catch (_) {}

  setReadingMode(isReadingMode, { updateUrl: false, force: true });

  [document.getElementById('readingModeToggle'),
   document.getElementById('editorReadingToggle')].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('click', () => setReadingMode(!isReadingMode));
  });

  window.addEventListener('popstate', () => {
    try {
      const url = new URL(window.location.href);
      setReadingMode(url.searchParams.has('read'), { updateUrl: false, force: true });
    } catch (_) {}
  });
}

// Mark ownership BEFORE window bridge so main-js.js guards can early-return.
window.__ESM_READING_MODE = true;

window.setReadingMode            = setReadingMode;
window.updateReadingToggleLabels = updateReadingToggleLabels;
window.syncReadingLineAttributes = syncReadingLineAttributes;
window.clearReadingLineHighlight = clearReadingLineHighlight;
window.isReadingModeActive       = () => isReadingMode;
window.initReadingModeToggle     = initReadingModeToggle;

// Self-bootstrap — modules are deferred; DOM is ready.
initReadingModeToggle();

export {
  clearReadingLineHighlight,
  syncReadingLineAttributes,
  setReadingLineActive,
  updateReadingToggleLabels,
  setReadingMode,
  initReadingModeToggle,
};
