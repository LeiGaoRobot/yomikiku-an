// Reading-script live-update walker — extracted from main-js.js (Phase 1).
// On script toggle (hiragana ⇄ katakana), iterates all rendered `.token-pill`
// nodes inside a root, parses each pill's `data-token` JSON payload, and
// rewrites the inner `.token-kana` text via the injected `formatReading`.
//
// Pure-ish: touches the DOM (by design — this *is* the DOM walker), but
// dependencies are injected so unit tests can supply a fake document
// fragment, deterministic `script`, and a stub `formatReading`. No reads
// from `window`, `localStorage`, or module-level singletons.
//
// Boot-race contract: the call site in `main-js.js` keeps an inline
// fallback (per the playback-boundary rule) at Phase-2. The module exists
// so future refactors and tests have a single source of truth.

const APOS_RE = /&apos;/g;

/**
 * Re-render every token pill's kana display under `root` for the given script.
 *
 * @param {object} options
 * @param {ParentNode} [options.root=document]  Subtree to walk.
 * @param {string}     options.script           'hiragana' | 'katakana'
 * @param {(token: object, script: string) => string} options.formatReading
 *        Pure formatter — returns the kana to render, or '' to clear.
 * @param {string}    [options.pillSelector='.token-pill']
 * @param {string}    [options.kanaSelector='.token-kana']
 * @param {string}    [options.dataAttr='data-token']
 * @returns {{ updated: number, skipped: number }}
 *        How many pills were rewritten vs. silently skipped (bad JSON,
 *        missing inner kana node, missing data attr, etc.).
 */
export function updateReadingScriptDisplay(options) {
  const opts = options || {};
  const root = opts.root || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.querySelectorAll !== 'function') {
    return { updated: 0, skipped: 0 };
  }
  const script = opts.script;
  const fmt = opts.formatReading;
  if (typeof fmt !== 'function') {
    return { updated: 0, skipped: 0 };
  }
  const pillSel = opts.pillSelector || '.token-pill';
  const kanaSel = opts.kanaSelector || '.token-kana';
  const dataAttr = opts.dataAttr || 'data-token';

  let updated = 0;
  let skipped = 0;
  const pills = root.querySelectorAll(pillSel);
  pills.forEach(el => {
    try {
      const raw = el.getAttribute(dataAttr) || '{}';
      const token = JSON.parse(raw.replace(APOS_RE, "'"));
      const kanaEl = el.querySelector(kanaSel);
      if (!kanaEl) { skipped += 1; return; }
      kanaEl.textContent = fmt(token, script);
      updated += 1;
    } catch (_) {
      skipped += 1;
    }
  });
  return { updated, skipped };
}

if (typeof window !== 'undefined') {
  window.YomikikuanReadingScriptDisplay = { updateReadingScriptDisplay };
}
