// Folder management — extracted from main-js.js (Phase 1 parallel).
//
// The full folder UI (renderFolders / selectFolder) stays in main-js.js
// because it's tightly DOM-coupled. Only the storage helpers + the pure
// per-doc folder-filter predicate are extracted here so they can be unit-
// tested without spinning up the whole sidebar.
//
// All functions are pure when storage is dependency-injected.

const STORAGE_KEY = 'activeFolder';
const DEFAULT_FOLDER = 'all';

function defaultStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function getActiveFolderId(storage) {
  const s = storage || defaultStorage();
  if (!s) return DEFAULT_FOLDER;
  try {
    return s.getItem(STORAGE_KEY) || DEFAULT_FOLDER;
  } catch (_) {
    return DEFAULT_FOLDER;
  }
}

export function setActiveFolderId(id, storage) {
  const s = storage || defaultStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, id || DEFAULT_FOLDER);
  } catch (_) {}
}

// Per-doc folder-filter predicate matching the inline rules in main-js.js's
// documentManager.render():
//   'all'         → all docs except those marked as samples
//   'favorites'   → only docs with .favorite truthy
//   'samples'     → only docs with .folder === 'samples'
//   anything else → permissive (include all docs)
//
// Returns true when the doc should be shown for the given folderId.
export function filterDocByFolder(doc, folderId) {
  if (!doc) return false;
  if (folderId === 'favorites') return !!doc.favorite;
  if (folderId === 'samples') return doc.folder === 'samples';
  if (folderId === 'all') return doc.folder !== 'samples';
  return true;
}

if (typeof window !== 'undefined') {
  window.YomikikuanFolders = {
    getActiveFolderId,
    setActiveFolderId,
    filterDocByFolder,
  };
}
