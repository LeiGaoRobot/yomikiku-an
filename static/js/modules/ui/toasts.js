// ui/toasts — toast notification primitives
// Migrated from static/main-js.js (showErrorToast / showSuccessToast / showInfoToast).
// Canonical implementation; re-binds to window.* for legacy callers.

export function showErrorToast(message) {
  const toast = document.getElementById('errorToast');
  const text  = document.getElementById('errorText');
  if (!toast || !text) return;
  text.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

export function showSuccessToast(message) {
  const toast = document.getElementById('syncProgressToast');
  const text  = document.getElementById('syncProgressText');
  if (!toast || !text) return;
  text.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

export function showInfoToast(message, duration = 3000) {
  const toast = document.getElementById('syncProgressToast');
  const text  = document.getElementById('syncProgressText');
  if (!toast || !text) return;
  text.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// Bridge to window.* for legacy callers inside main-js.js.
// ESM runs after classic scripts, so these overrides take effect last and
// become the canonical globals.
window.showErrorToast   = showErrorToast;
window.showSuccessToast = showSuccessToast;
window.showInfoToast    = showInfoToast;
