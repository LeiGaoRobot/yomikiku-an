// ui/dialog — ESM surface for modal/dialog primitives.
// Canonical implementations:
//   - window.showDeleteConfirm: bound by static/js/ui-utils.js (classic)
//   - window.openSettingsModal:  bound by static/main-js.js (classic)
// This module is a named-export surface for future ESM migrations.

export function showDeleteConfirm(message, onConfirm, onCancel) {
  if (typeof window !== 'undefined' && typeof window.showDeleteConfirm === 'function') {
    return window.showDeleteConfirm(message, onConfirm, onCancel);
  }
  // Minimal fallback: native confirm().
  if (window.confirm(message)) {
    if (typeof onConfirm === 'function') onConfirm();
  } else if (typeof onCancel === 'function') {
    onCancel();
  }
}

export function openSettingsModal() {
  if (typeof window !== 'undefined' && typeof window.openSettingsModal === 'function') {
    return window.openSettingsModal();
  }
}
