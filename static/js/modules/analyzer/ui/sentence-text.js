// Sentence-text extractor — extracted from main-js.js (Phase 1 parallel).
//
// Pulls the visible sentence text out of a `.line-container` element by
// cloning, stripping ruby <rt> annotations, and removing UI buttons / the
// inline analyzer card so we don't include their text in the analyzer
// payload. Pure function: no global state, no side effects on the input.
//
// Mirrors the inline implementation at main-js.js:969 exactly so a Phase-2
// dedup can swap call sites to a delegator without behaviour change.

const STRIP_SELECTORS = '.play-line-btn, .analyze-line-btn, .ap-analyzer-card';

export function extractSentenceText(el) {
  if (!el) return '';
  if (typeof el.cloneNode !== 'function') return '';
  const clone = el.cloneNode(true);
  if (clone && typeof clone.querySelectorAll === 'function') {
    clone.querySelectorAll('rt').forEach((rt) => rt.remove());
    clone.querySelectorAll(STRIP_SELECTORS).forEach((n) => n.remove());
  }
  return (clone.textContent || '').trim();
}

if (typeof window !== 'undefined') {
  window.YomikikuanSentenceText = { extractSentenceText };
}
