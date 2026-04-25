// Browser-language sniffer — extracted from main-js.js (Phase 1 parallel).
// Maps navigator.language to one of the 3 supported UI locales.
//
// Pure when `nav` is dependency-injected (defaults to globalThis.navigator).
// Falls back to 'zh' when the browser language doesn't match any prefix —
// matches the historical default (the project's primary audience is CN).

const SUPPORTED = ['zh', 'ja', 'en'];
const DEFAULT = 'zh';

export function detectBrowserLanguage(nav) {
  const n = nav || (typeof navigator !== 'undefined' ? navigator : null);
  if (!n) return DEFAULT;
  const raw = n.language || n.userLanguage || '';
  const prefix = String(raw).slice(0, 2).toLowerCase();
  return SUPPORTED.includes(prefix) ? prefix : DEFAULT;
}

if (typeof window !== 'undefined') {
  window.YomikikuanI18nDetect = { detectBrowserLanguage };
}
