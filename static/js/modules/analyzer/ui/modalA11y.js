// Shared a11y helpers for Phase D panel modals (jlptPanel, vocabPanel,
// articleSummary). The existing modals already set `role="dialog"` +
// `aria-label` + Esc-to-close, but they were missing three things that
// screen-reader and keyboard users depend on:
//
//   1. `aria-modal="true"` — tells AT this dialog is modal (content
//      outside it should be ignored while the dialog is open).
//   2. Focus trap — Tab / Shift+Tab should cycle within the dialog;
//      otherwise focus escapes into the background page.
//   3. Focus restore — when the dialog closes, focus should return to
//      the element that opened it (the header button), not the <body>.
//
// Public surface:
//   mountModalA11y(dialogEl, { initialFocus? })
//     -> { release() }
//
// `release()` undoes everything this helper installed (no DOM leaks) and
// restores focus to the pre-mount activeElement. Callers invoke it from
// their existing `close()` function.

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE))
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function mountModalA11y(dialogEl, opts = {}) {
  if (!dialogEl || typeof dialogEl.querySelector !== 'function') {
    return { release() {} };
  }

  // 1. Remember who opened us so we can restore focus on close.
  const trigger = (document.activeElement instanceof HTMLElement)
    ? document.activeElement : null;

  // 2. Mark as modal. Use setAttribute so it appears in DOM inspector.
  dialogEl.setAttribute('aria-modal', 'true');
  // Ensure the dialog itself is focusable even when no children are yet.
  if (!dialogEl.hasAttribute('tabindex')) {
    dialogEl.setAttribute('tabindex', '-1');
  }

  // 3. Initial focus — caller-provided element or first focusable child.
  const initial = opts.initialFocus || getFocusable(dialogEl)[0] || dialogEl;
  // Schedule after the current tick so the browser has painted the modal
  // (some browsers ignore .focus() on freshly-inserted detached nodes).
  setTimeout(() => {
    try { initial.focus({ preventScroll: false }); } catch (_) {}
  }, 0);

  // 4. Focus trap. Only Tab / Shift+Tab are intercepted — Esc handling is
  // owned by the caller (each panel already wires its own Esc listener).
  const onKey = (ev) => {
    if (ev.key !== 'Tab') return;
    const items = getFocusable(dialogEl);
    if (!items.length) {
      ev.preventDefault();
      try { dialogEl.focus(); } catch (_) {}
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey) {
      if (active === first || !dialogEl.contains(active)) {
        ev.preventDefault();
        try { last.focus(); } catch (_) {}
      }
    } else {
      if (active === last || !dialogEl.contains(active)) {
        ev.preventDefault();
        try { first.focus(); } catch (_) {}
      }
    }
  };
  document.addEventListener('keydown', onKey, true);

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      document.removeEventListener('keydown', onKey, true);
      try { dialogEl.removeAttribute('aria-modal'); } catch (_) {}
      // Restore focus only if still in document and not already refocused
      // onto something outside (e.g. user clicked elsewhere mid-close).
      if (trigger && document.contains(trigger)) {
        try { trigger.focus({ preventScroll: true }); } catch (_) {}
      }
    },
  };
}
