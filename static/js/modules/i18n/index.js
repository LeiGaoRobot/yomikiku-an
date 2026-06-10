// i18n — ESM surface for translations.
// Canonical dictionary lives in static/js/i18n.js (classic script) as `const I18N`.
// A one-line patch there attaches `window.I18N = I18N` so this module reads it.
// Current-language getter/setter live in main-js.js
// (window.getCurrentLang / window.setCurrentLang).
//
// This module:
//   • exposes `t(key)` / `format(key, params)` / `getCurrentLang()` as ESM exports
//   • registers `window.YomikikuanGetText = t` so classic scripts (tts.js, theme.js,
//     reading-mode.js, editor-toolbar.js) get real translations instead of the
//     current passthrough fallback.

function getI18nDict() {
  return (typeof window !== 'undefined' && window.I18N) ? window.I18N : {};
}

export function getCurrentLang() {
  try {
    if (typeof window.getCurrentLang === 'function') return window.getCurrentLang();
  } catch (_) {}
  try { return localStorage.getItem('lang') || 'ja'; } catch (_) { return 'ja'; }
}

export function t(key, fallback) {
  const dict = getI18nDict();
  const lang = getCurrentLang();
  const bundle = dict[lang] || dict.ja || {};
  if (bundle && Object.prototype.hasOwnProperty.call(bundle, key)) return bundle[key];
  // Fallback chain: ja → en → zh → (caller fallback) → raw key
  const fb = (dict.ja && dict.ja[key])
          ?? (dict.en && dict.en[key])
          ?? (dict.zh && dict.zh[key]);
  if (fb != null) return fb;
  return (fallback != null) ? fallback : key;
}

export function format(key, params = {}) {
  let s = t(key);
  for (const [k, v] of Object.entries(params)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return s;
}

// Classic-script bridge.
if (typeof window !== 'undefined') {
  window.YomikikuanGetText = t;
  window.YomikikuanFormat  = format;
  window.getI18nDict   = getI18nDict;
}
