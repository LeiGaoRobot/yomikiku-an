// General-purpose helpers — extracted from main-js.js (Phase 1 parallel).
// Distinct from modules/ui/utils.js which is UI-specific (debounce).
//
// All exports are pure / dependency-injectable for unit testing.

// Stable-prefixed unique id, e.g. "pwa-1714013123456-3a9c2".
// `now` and `random` are injected so tests can pin the output.
export function createRequestId(prefix, now, random) {
  const p = prefix == null ? 'pwa' : String(prefix);
  const t = (typeof now === 'function' ? now : Date.now)();
  const r = (typeof random === 'function' ? random : Math.random)();
  return `${p}-${t}-${r.toString(16).slice(2)}`;
}

// True if the given element is a form input or content-editable surface.
// Used by keyboard-shortcut handlers to skip when the user is typing.
//
// Renamed from main-js.js's isEditingFocus(): takes the element as a
// parameter so it's pure. The IIFE wrapper in main-js.js passes
// document.activeElement.
export function isEditingElement(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  if (el.closest && el.closest('.CodeMirror, .cm-editor, .EasyMDEContainer')) return true;
  return false;
}

// Promise wrapper around setTimeout. `setTimer` is injected so tests can
// resolve immediately or use fake timers.
export function sleep(ms, setTimer) {
  const fn = typeof setTimer === 'function' ? setTimer : setTimeout;
  return new Promise((resolve) => fn(resolve, ms));
}

if (typeof window !== 'undefined') {
  window.YomikikuanUtil = { createRequestId, isEditingElement, sleep };
}
