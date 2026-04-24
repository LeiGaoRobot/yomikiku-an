// docs/store — ESM facade over the legacy window.documentManager instance.
// Canonical class `DocumentManager` still lives in static/main-js.js.
// This facade provides a stable named-import surface so future ESM modules
// can migrate incrementally without depending on window.* directly.
// When the class is fully extracted, only this file changes — callers stay.
//
// Pure helpers (getDocumentTitle, stripMarkdown, truncateTitle,
// formatCreationTime, generateId) are re-exported from ./pure.js so
// callers don't need to wait for window.documentManager to be mounted.

import * as pure from './pure.js';

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
// Pure helpers — no dependency on window.documentManager.
export const getDocumentTitle   = pure.getDocumentTitle;
export const stripMarkdown      = pure.stripMarkdown;
export const truncateTitle      = pure.truncateTitle;
export const formatCreationTime = pure.formatCreationTime;

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
// Pure — matches the class method's id shape exactly. See pure.js.
export const generateId = pure.generateId;

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
