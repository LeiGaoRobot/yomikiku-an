// Pin/unpin analysis results onto a document's analysis.pinnedSentences map.
// Persists via window.documentManager.saveAllDocuments(docs) — the canonical
// method defined in static/main-js.js (DocumentManager class, ~L2912), which
// writes localStorage[yomikikuan_texts] AND triggers Firestore sync via
// window.markUnsyncedChanges(). Falls back to a direct localStorage write
// only if no known save method exists (bypasses Firestore sync).

const PIN_CAP = 200;

export async function pin(docId, hash, text, result) {
  const dm = window.documentManager;
  if (!dm) throw new Error('documentManager not ready');
  const docs = dm.getAllDocuments();
  const doc = docs.find((d) => d.id === docId);
  if (!doc) throw new Error('doc not found');
  doc.analysis = doc.analysis || {};
  doc.analysis.pinnedSentences = doc.analysis.pinnedSentences || {};
  const existing = doc.analysis.pinnedSentences[hash];
  const count = Object.keys(doc.analysis.pinnedSentences).length;
  if (count >= PIN_CAP && !existing) throw new Error('PIN_LIMIT');
  doc.analysis.pinnedSentences[hash] = { text, result, pinnedAt: Date.now() };
  await persistDocs(dm, docs);
}

export async function unpin(docId, hash) {
  const dm = window.documentManager;
  if (!dm) return;
  const docs = dm.getAllDocuments();
  const doc = docs.find((d) => d.id === docId);
  if (!doc?.analysis?.pinnedSentences) return;
  delete doc.analysis.pinnedSentences[hash];
  await persistDocs(dm, docs);
}

export function isPinned(docId, hash) {
  const dm = window.documentManager;
  if (!dm) return false;
  const doc = dm.getAllDocuments().find((d) => d.id === docId);
  return Boolean(doc?.analysis?.pinnedSentences?.[hash]);
}

async function persistDocs(dm, docs) {
  // Prefer DocumentManager's own persistence — it already fires Firestore sync.
  if (typeof dm.saveAllDocuments === 'function') return dm.saveAllDocuments(docs);
  if (typeof dm.save === 'function') return dm.save();
  if (typeof dm.persist === 'function') return dm.persist();
  if (typeof dm.persistAll === 'function') return dm.persistAll();
  if (typeof dm.saveAll === 'function') return dm.saveAll();
  if (typeof dm.flush === 'function') return dm.flush();
  // Last resort: direct write. Bypasses any Firestore sync hooks.
  localStorage.setItem('yomikikuan_texts', JSON.stringify(docs));
}
