// editor/editor-toolbar — document header strip: date, char count, favorite star.
// Extracted from static/main-js.js:5794-5874.
// Expects window.documentManager (still provided by main-js.js classic scope).
// Idempotent bootstrap via __ESM_EDITOR_TOOLBAR_INITED flag.

function showInfoToastLocal(msg, dur = 2000) {
  if (typeof window.showInfoToast === 'function') return window.showInfoToast(msg, dur);
  const toast = document.getElementById('syncProgressToast');
  const text  = document.getElementById('syncProgressText');
  if (!toast || !text) return;
  text.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), dur);
}

function getTextInput() { return document.getElementById('textInput'); }

function updateEditorToolbar() {
  try {
    const dm = window.documentManager;
    if (!dm) return;
    const docs = dm.getAllDocuments();
    const activeId = dm.getActiveId();
    const doc = docs.find(d => d.id === activeId);

    const editorDocDate    = document.getElementById('editorDocDate');
    const editorCharCount  = document.getElementById('editorCharCount');
    const editorStarToggle = document.getElementById('editorStarToggle');
    const textInput        = getTextInput();

    if (editorDocDate) {
      const ts = doc ? (doc.updatedAt || doc.createdAt) : null;
      editorDocDate.textContent = ts ? dm.formatCreationTime(ts) : '';
    }
    if (editorCharCount) {
      const count = (textInput && textInput.value) ? textInput.value.length : 0;
      editorCharCount.textContent = `共 ${count} 字`;
    }
    if (editorStarToggle) {
      const isFav = !!(doc && doc.favorite);
      editorStarToggle.classList.toggle('is-active', isFav);
      editorStarToggle.setAttribute('aria-pressed', String(isFav));
      editorStarToggle.textContent = isFav ? '★' : '☆';
    }
  } catch (_) {}
}

function initEditorToolbar() {
  if (window.__ESM_EDITOR_TOOLBAR_INITED) return;
  window.__ESM_EDITOR_TOOLBAR_INITED = true;

  const editorStarToggle = document.getElementById('editorStarToggle');
  const textInput        = getTextInput();

  if (editorStarToggle) {
    editorStarToggle.addEventListener('click', () => {
      const dm = window.documentManager;
      if (!dm) return;
      const docs = dm.getAllDocuments();
      const activeId = dm.getActiveId();
      const docIndex = docs.findIndex(d => d.id === activeId);
      if (docIndex === -1) return;

      const doc = docs[docIndex];

      // Sample documents: copy-on-write to avoid mutating a shipped sample.
      if (doc.folder === 'samples') {
        const newDoc = {
          id: dm.generateId(),
          content: (textInput && textInput.value) || '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          locked: false,
          folder: null,
          folderId: null,
          favorite: true,
        };
        docs.push(newDoc);
        dm.saveAllDocuments(docs);
        dm.setActiveId(newDoc.id);
        dm.render();
        updateEditorToolbar();
        showInfoToastLocal('サンプル文書のコピーをお気に入りに追加しました', 2000);
        return;
      }

      doc.favorite = !doc.favorite;
      dm.saveAllDocuments(docs);
      dm.render();
      updateEditorToolbar();
    });
  }

  if (textInput) {
    textInput.addEventListener('input', () => updateEditorToolbar());
  }

  updateEditorToolbar();
}

window.__ESM_EDITOR_TOOLBAR = true;
window.updateEditorToolbar = updateEditorToolbar;
window.initEditorToolbar   = initEditorToolbar;

// Self-bootstrap. Guarded by the INITED flag against main-js.js's
// bootstrap call at line 5624 re-invoking us via the shim.
initEditorToolbar();

export { updateEditorToolbar, initEditorToolbar };
