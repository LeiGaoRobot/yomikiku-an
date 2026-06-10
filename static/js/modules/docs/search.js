// Pure search helpers extracted from main-js.js initSearchModal (Phase-1).
//
// The inline implementation lives in initSearchModal and stays as a boot-race
// fallback. This module owns the pure logic so it can be unit-tested without
// any DOM or documentManager dependency.

// SVG icon used by the empty/no-results states. Kept here so the markup is
// self-contained per the same convention used by results-display.js.
const SEARCH_ICON_SVG = '<svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity="0.3"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';

// Document icon used by every result card.
const DOC_ICON_SVG = '<svg class="search-result-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>';

// Escape regex specials before building a highlight RegExp.
export function escapeRegexSpecials(s) {
  return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wrap every case-insensitive match of `query` in `text` with
// <span class="search-highlight">…</span>. Returns input untouched when
// query is empty/null. Caller is responsible for trusting `text` (this
// helper does NOT escape HTML — preserves the original main-js.js semantics).
export function highlightText(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${escapeRegexSpecials(query)})`, 'gi');
  return String(text == null ? '' : text).replace(regex, '<span class="search-highlight">$1</span>');
}

// Pick the snippet shown under the title:
//  - first line that contains `query` (case-insensitive), truncated to 120 chars
//  - else first 120 chars of the joined text
//  - else empty string
export function pickSnippet(text, query) {
  const t = String(text == null ? '' : text);
  if (!t) return '';
  const ql = String(query || '').toLowerCase();
  if (ql) {
    const lines = t.split('\n');
    for (const line of lines) {
      if (line.toLowerCase().includes(ql)) {
        return line.substring(0, 120);
      }
    }
  }
  return t.substring(0, 120);
}

// Filter and shape user-owned documents by case-insensitive substring match
// against title + content. Skips sample documents and locked documents.
//
// Inputs:
//   docs    — array of raw document records (must expose .id, .content, .createdAt,
//             optionally .folder, .locked)
//   query   — search query string
//   getTitle — function(content) -> string. DI for documentManager.getDocumentTitle.
// Output: array of { id, title, snippet, createdAt }.
export function searchDocuments(docs, query, getTitle) {
  if (!Array.isArray(docs)) return [];
  const q = String(query == null ? '' : query);
  if (!q.trim()) return [];
  const ql = q.toLowerCase();
  const titleFn = typeof getTitle === 'function' ? getTitle : () => '';

  return docs.filter((doc) => {
    if (!doc) return false;
    if (doc.folder === 'samples' || doc.locked) return false;
    const text = Array.isArray(doc.content) ? doc.content.join('\n') : String(doc.content || '');
    const title = titleFn(doc.content) || '';
    return (title + '\n' + text).toLowerCase().includes(ql);
  }).map((doc) => {
    const text = Array.isArray(doc.content) ? doc.content.join('\n') : String(doc.content || '');
    const title = titleFn(doc.content) || '';
    return {
      id: doc.id,
      title: title || '无标题',
      snippet: pickSnippet(text, ql),
      createdAt: doc.createdAt,
    };
  });
}

// Build the empty-state HTML shown when the query is blank or yields 0 hits.
// `message` is the localized prompt shown beneath the icon.
export function buildEmptyStateMarkup(message) {
  const safeMessage = String(message == null ? '' : message);
  return `
        <div class="search-empty-state">
          ${SEARCH_ICON_SVG}
          <p>${safeMessage}</p>
        </div>
      `;
}

// Build the full results list HTML. selectedIndex < 0 means no row highlighted.
// `highlight` is the highlightText function (DI so tests can stub it).
export function buildResultsMarkup(results, selectedIndex, query, highlight) {
  if (!Array.isArray(results) || results.length === 0) return '';
  const hi = typeof highlight === 'function' ? highlight : highlightText;
  return results.map((result, index) => {
    const date = result.createdAt ? new Date(result.createdAt).toLocaleDateString() : '';
    const isSelected = index === selectedIndex;
    return `
          <div class="search-result-item ${isSelected ? 'selected' : ''}" data-index="${index}" data-doc-id="${result.id}">
            ${DOC_ICON_SVG}
            <div class="search-result-content">
              <div class="search-result-title">${hi(result.title, query)}</div>
              ${result.snippet ? `<div class="search-result-snippet">${hi(result.snippet, query)}</div>` : ''}
              ${date ? `<div class="search-result-meta">${date}</div>` : ''}
            </div>
          </div>
        `;
  }).join('');
}

if (typeof window !== 'undefined') {
  window.YomikikuanDocsSearch = {
    escapeRegexSpecials,
    highlightText,
    pickSnippet,
    searchDocuments,
    buildEmptyStateMarkup,
    buildResultsMarkup,
  };
}
