// ui/utils — ESM surface for generic UI utilities.
// Canonical implementation lives in static/js/ui-utils.js (classic script)
// which attaches to window.debounce. This module provides a named ESM
// export for future migrations to import cleanly.

export function debounce(fn, wait) {
  // Prefer the canonical window-bound version if present.
  const w = typeof window !== 'undefined' ? window.debounce : null;
  if (typeof w === 'function' && w !== debounce) {
    return w(fn, wait);
  }
  // Fallback (identical behaviour).
  let tid = null;
  return function (...args) {
    clearTimeout(tid);
    tid = setTimeout(() => fn.apply(this, args), wait);
  };
}
