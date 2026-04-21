// Reading Analyzer — document-list swatch (T14)
//
// Public API:
//   decorateListItem(liEl, doc) -> void
//
// Prepends a small colored dot to each sidebar document item reflecting the
// cached JLPT-ish difficulty level (N5..N1). If no cached analysis is
// present on the doc, schedules a background `analyzeDocument(doc)` via
// `requestIdleCallback`, persists the result via
// `documentManager.saveAllDocuments(...)`, then redecorates. If the level
// is `'n/a'` (non-Japanese) no dot is shown — keeps the list visually
// uncluttered for mixed corpora.
//
// Colors and CSS live in `./badge.css` (the `:root` custom properties
// `--ap-diff-n1..n5`, and the `.ap-diff-swatch--{level}` classes).

function persistDocs() {
  try {
    const dm = window.documentManager;
    if (!dm || typeof dm.saveAllDocuments !== 'function') return;
    const docs = typeof dm.getAllDocuments === 'function' ? dm.getAllDocuments() : null;
    if (Array.isArray(docs)) dm.saveAllDocuments(docs);
  } catch (err) {
    console.warn('[analyzer/listSwatch] persist failed', err);
  }
}

function scheduleIdle(cb) {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(cb, { timeout: 2000 });
  }
  return setTimeout(cb, 500);
}

// Tracks docs whose analysis is currently being computed so repeated list
// renders (triggered e.g. by favorite-toggle) don't pile up duplicate idle
// tasks for the same doc.
const inFlight = new Set();

function lazyCompute(doc, liEl) {
  if (!doc || !doc.id) return;
  if (inFlight.has(doc.id)) return;
  inFlight.add(doc.id);
  scheduleIdle(async () => {
    try {
      const analyzer = window.YomikikuanAnalyzer;
      if (!analyzer || typeof analyzer.analyzeDocument !== 'function') return;
      const result = await analyzer.analyzeDocument(doc);
      if (!result || !result.difficulty) return;
      doc.analysis = doc.analysis || {};
      doc.analysis.difficulty = result.difficulty;
      persistDocs();
      // Re-decorate if the element is still in the DOM (list may have
      // re-rendered by now — guard isConnected to avoid orphan mutations).
      if (liEl && liEl.isConnected) {
        decorateListItem(liEl, doc);
      }
      // Also fan out to any other list item showing the same doc, because
      // `render()` rebuilds the list and the element passed in may now be
      // detached even if a replacement exists under the same data-doc-id.
      try {
        const replacement = document.querySelector(`.doc-item[data-doc-id="${doc.id}"]`);
        if (replacement && replacement !== liEl) {
          decorateListItem(replacement, doc);
        }
      } catch (_) { /* querySelector can throw on invalid id chars */ }
    } catch (err) {
      console.warn('[analyzer/listSwatch] analyzeDocument failed', err);
    } finally {
      inFlight.delete(doc.id);
    }
  });
}

export function decorateListItem(liEl, doc) {
  if (!liEl || !doc) return;
  // Remove any prior swatch so repeated decorate calls stay idempotent.
  try {
    liEl.querySelectorAll('.ap-diff-swatch').forEach((el) => el.remove());
  } catch (_) { /* malformed node */ }

  const level = doc.analysis && doc.analysis.difficulty && doc.analysis.difficulty.level;
  if (level && level !== 'n/a') {
    const swatch = document.createElement('span');
    swatch.className = `ap-diff-swatch ap-diff-swatch--${level}`;
    swatch.title = `Difficulty: ${String(level).toUpperCase()}`;
    // Prepend into the title container when present so the dot sits inline
    // with the title text (not ahead of actions column).
    const titleHost = liEl.querySelector('.doc-item-title') || liEl;
    titleHost.prepend(swatch);
  } else if (!level) {
    // Level never computed — schedule a background pass. If level === 'n/a'
    // we intentionally skip both render AND recompute.
    lazyCompute(doc, liEl);
  }
}

export default decorateListItem;
