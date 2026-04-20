// docs/store — ESM facade over the legacy window.documentManager instance.
// Canonical class `DocumentManager` still lives in static/main-js.js:2682-3478.
// This facade provides a stable named-import surface so future ESM modules
// can migrate incrementally without depending on window.* directly.
// When the class is fully extracted, only this file changes — callers stay.

function dm() { return window.documentManager || null; }

function assertDm() {
  const m = dm();
  if (!m) console.warn('docs/store: window.documentManager is not ready yet');
  return m;
}

// ---- Queries ----
export function getAllDocuments() {
  const m = dm(); return m ? m.getAllDocuments() : [];
}
export function getActiveId() {
  const m = dm(); return m ? m.getActiveId() : '';
}
export function getActiveDocument() {
  const m = dm(); if (!m) return null;
  const id = m.getActiveId();
  return m.getAllDocuments().find(d => d.id === id) || null;
}
export function getDocumentTitle(content) {
  const m = dm(); return m ? m.getDocumentTitle(content) : '';
}
export function stripMarkdown(text) {
  const m = dm(); return m ? m.stripMarkdown(text) : text;
}
export function truncateTitle(title, maxLen) {
  const m = dm(); return m ? m.truncateTitle(title, maxLen) : title;
}
export function formatCreationTime(ts) {
  const m = dm(); return m ? m.formatCreationTime(ts) : '';
}

// ---- Mutations ----
export function saveAllDocuments(docs) {
  const m = assertDm(); if (m) m.saveAllDocuments(docs);
}
export function setActiveId(id) {
  const m = assertDm(); if (m) m.setActiveId(id);
}
export function createDocument(content = '') {
  const m = assertDm(); return m ? m.createDocument(content) : null;
}
export function deleteDocument(id, skipConfirm = false, targetElement = null) {
  const m = assertDm(); return m ? m.deleteDocument(id, skipConfirm, targetElement) : false;
}
export function generateId() {
  const m = dm(); return m ? m.generateId() : 'doc-' + Date.now() + '-x';
}

// ---- Lifecycle ----
export function render() {
  const m = dm(); if (m) m.render();
}
export function loadActiveDocument() {
  const m = dm(); if (m) m.loadActiveDocument();
}

// Convenience: grab the full instance (for edge cases migrating incrementally).
export function getStore() { return dm(); }

// No bootstrap work — the legacy class owns init. This file is pure facade.
