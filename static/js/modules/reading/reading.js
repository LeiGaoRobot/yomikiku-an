// Reading display formatter — extracted from main-js.js (Phase 2).
// Given a tokenizer token + target kana script, returns the string to show
// next to the token (e.g. small kana above the surface). Returns '' when
// no extra reading should be displayed (kana-only surface, missing reading,
// or reading equals surface).
//
// Pure: no DOM, no localStorage. The two host-environment lookups (the
// "は→わ" particle toggle and the dictionary's tech-term override) are
// dependency-injected via options so the function is fully unit-testable.

import { normalizeKanaByScript } from './kana.js';

export function formatReading(token, script, options) {
  const opts = options || {};
  const haAsWa = opts.haAsWa !== false; // default true
  const getTechOverride = typeof opts.getTechOverride === 'function'
    ? opts.getTechOverride : null;

  const surface = token && token.surface ? token.surface : '';
  const posArr = Array.isArray(token && token.pos)
    ? token.pos
    : [token && token.pos || ''];
  const readingRaw = token && token.reading ? token.reading : '';

  if (getTechOverride) {
    const override = getTechOverride(token);
    if (override && override.reading) {
      return normalizeKanaByScript(override.reading, script);
    }
  }
  if (!readingRaw) return '';
  if (surface === 'は' && posArr[0] === '助詞' && haAsWa) {
    return script === 'hiragana' ? 'わ' : 'ワ';
  }
  const normalized = normalizeKanaByScript(readingRaw, script);
  if (normalized === surface) return '';
  return normalized;
}

if (typeof window !== 'undefined') {
  window.YomikikuanReading = { formatReading };
}
