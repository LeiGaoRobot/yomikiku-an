// Pure helpers extracted from analyzer/ui/vocabPanel.js for unit testing
// without spinning up the modal / DOM / IDB. Phase-1 — vocabPanel.js still
// holds an inline copy; Phase-2 dedup can delegate later.
//
// Both functions are deterministic, no DOM / network / storage access.

// Render an epoch-ms timestamp as a Chinese relative-time string.
// Anchor is `now` (defaults to Date.now()) so callers can pass a fixed
// reference for deterministic tests.
//
// Rules:
//   |diff| < 60s        → "刚刚" (past) or "马上" (future)
//   |diff| < 60min      → "<n> 分钟前 / 后"
//   |diff| < 24hr       → "<n> 小时前 / 后"
//   else                → "<n> 天前 / 后"
//
// `diff = ts - now`, so positive diff = future, negative = past.
export function fmtRelDate(ts, { now = Date.now() } = {}) {
  if (!ts) return '';
  const diff = ts - now;
  const abs = Math.abs(diff);
  if (abs < 60 * 1000) return diff < 0 ? '刚刚' : '马上';
  const min = Math.round(abs / 60000);
  if (min < 60) return `${min} 分钟${diff < 0 ? '前' : '后'}`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时${diff < 0 ? '前' : '后'}`;
  const d = Math.round(hr / 24);
  return `${d} 天${diff < 0 ? '前' : '后'}`;
}

// HTML entity escape — used to safely render user-derived vocab/mistake
// content inside innerHTML templates. Encodes the 5 standard XSS-vector
// characters (&, <, >, ", '). null / undefined → "".
export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
