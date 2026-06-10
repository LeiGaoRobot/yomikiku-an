// docs/pure — stateless helpers extracted from main-js.js `class DocumentManager`.
//
// Phase 2 of the extraction. These five functions don't touch `this`, DOM,
// localStorage, or IDB, so they're safe to pull out now and lets ESM
// callers (modules/docs/store.js, future panel modules) use them without
// round-tripping through `window.documentManager` — which may not yet be
// mounted during early boot.
//
// The class in main-js.js keeps its methods for now; delegating them to
// these imports is a follow-up. Phase 3 will move the whole class out.

/** doc-<epoch-ms>-<base36 random> — collision-safe enough for per-user docs. */
export function generateId() {
  return 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/** First non-empty line of `content`, or fallback '无标题文档'. Accepts string or string[]. */
export function getDocumentTitle(content) {
  if (Array.isArray(content)) {
    const firstLine = (content[0] || '').trim();
    return firstLine || '无标题文档';
  }
  const firstLine = ((content || '').split('\n')[0] || '').trim();
  return firstLine || '无标题文档';
}

/** Strip common Markdown markers — headings, emphasis, strike, fences,
 *  inline code, links, images, list/quote/hr markers — for title display. */
export function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/^#+\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*_]{3,}$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip markdown then ellipsize to `maxLength` chars. Default 20. */
export function truncateTitle(title, maxLength = 20) {
  const cleanTitle = stripMarkdown(title);
  if (cleanTitle.length <= maxLength) return cleanTitle;
  return cleanTitle.slice(0, maxLength - 1) + '…';
}

/** YYYY-MM-DD HH:mm:ss in local time zone. Accepts epoch-ms integer. */
export function formatCreationTime(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
