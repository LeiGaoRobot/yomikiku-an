// settings/font — font scale + input/content font-family controls.
// Extracted from static/main-js.js:7088-7177.
// Idempotent via __ESM_FONT_SETTINGS_INITED flag.

const LS_FONT_SCALE   = 'app:fontScale';
const LS_INPUT_FONT   = 'app:inputFont';
const LS_CONTENT_FONT = 'app:contentFont';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function getRangeEls() {
  return [
    document.getElementById('fontSizeRange'),
    document.getElementById('sidebarFontSizeRange'),
    document.getElementById('editorFontSizeRange'),
  ].filter(Boolean);
}
function getValueEls() {
  return [
    document.getElementById('fontSizeValue'),
    document.getElementById('sidebarFontSizeValue'),
    document.getElementById('editorFontSizeValue'),
  ].filter(Boolean);
}

function applyScale(v) {
  const scale = clamp(parseFloat(v) || 1, 0.8, 1.5);
  document.documentElement.style.setProperty('--font-scale', String(scale));
  getValueEls().forEach(el => { el.textContent = `${Math.round(scale * 100)}%`; });
  try { localStorage.setItem(LS_FONT_SCALE, String(scale)); } catch (_) {}
}

function applyFontScaleFromStorage() {
  try {
    const saved = localStorage.getItem(LS_FONT_SCALE);
    if (saved) {
      const scale = clamp(parseFloat(saved) || 1, 0.8, 1.5);
      document.documentElement.style.setProperty('--font-scale', String(scale));
    }
  } catch (_) {}
}

function applyFontFamilyFromStorage() {
  try {
    const inFont  = localStorage.getItem(LS_INPUT_FONT);
    const outFont = localStorage.getItem(LS_CONTENT_FONT);
    if (inFont)  document.documentElement.style.setProperty('--input-font-family', inFont);
    if (outFont) document.documentElement.style.setProperty('--content-font-family', outFont);
    const inSel  = document.getElementById('editorInputFontSelect');
    const outSel = document.getElementById('editorContentFontSelect');
    if (inSel  && inFont)  inSel.value  = inFont;
    if (outSel && outFont) outSel.value = outFont;
  } catch (_) {}
}

function initFontSizeControls() {
  const rangeEls = getRangeEls();

  let initial = 1;
  try {
    const saved = localStorage.getItem(LS_FONT_SCALE);
    if (saved) initial = parseFloat(saved) || 1;
  } catch (_) {}

  if (rangeEls.length > 0) {
    rangeEls.forEach(r => { r.value = String(initial); });
    rangeEls.forEach(r => {
      const handler = () => {
        const val = r.value;
        applyScale(val);
        rangeEls.forEach(other => { if (other !== r) other.value = val; });
      };
      r.addEventListener('input',  handler);
      r.addEventListener('change', handler);
    });
  }
  applyScale(initial);
}

function initFontFamilyControls() {
  const inputSelect   = document.getElementById('editorInputFontSelect');
  const contentSelect = document.getElementById('editorContentFontSelect');
  const applyInput = (val) => {
    if (!val) return;
    document.documentElement.style.setProperty('--input-font-family', val);
    try { localStorage.setItem(LS_INPUT_FONT, val); } catch (_) {}
  };
  const applyContent = (val) => {
    if (!val) return;
    document.documentElement.style.setProperty('--content-font-family', val);
    try { localStorage.setItem(LS_CONTENT_FONT, val); } catch (_) {}
  };
  if (inputSelect)   inputSelect.addEventListener('change',   () => applyInput(inputSelect.value));
  if (contentSelect) contentSelect.addEventListener('change', () => applyContent(contentSelect.value));
  applyFontFamilyFromStorage();
}

function bootstrap() {
  if (window.__ESM_FONT_SETTINGS_INITED) return;
  window.__ESM_FONT_SETTINGS_INITED = true;
  applyFontScaleFromStorage();
  applyFontFamilyFromStorage();
  initFontSizeControls();
  initFontFamilyControls();
}

window.__ESM_FONT_SETTINGS = true;
window.initFontSizeControls       = initFontSizeControls;
window.applyFontScaleFromStorage  = applyFontScaleFromStorage;
window.applyFontFamilyFromStorage = applyFontFamilyFromStorage;
window.initFontFamilyControls     = initFontFamilyControls;

// Self-bootstrap — modules run deferred, DOM is ready.
bootstrap();

export {
  initFontSizeControls,
  applyFontScaleFromStorage,
  applyFontFamilyFromStorage,
  initFontFamilyControls,
};
