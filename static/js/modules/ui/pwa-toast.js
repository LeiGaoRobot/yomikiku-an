// ui/pwa-toast — real implementation of the PWA install/progress toast
// render primitives. Extracted from static/main-js.js:903-996.
// Does NOT touch the larger PWA installer / service-worker download flow —
// that still lives in main-js.js and calls these primitives via window.*.

let hideTimer = null;

function el(id) { return document.getElementById(id); }

function refs() {
  return {
    toast:    el('pwaInstallToast'),
    icon:     el('pwaInstallIcon'),
    title:    el('pwaInstallTitle'),
    message:  el('pwaInstallMessage'),
    progress: el('pwaInstallProgress'),
    bar:      el('pwaInstallProgressBar'),
  };
}

export function setPwaIcon(kind) {
  const { icon } = refs();
  if (!icon) return;
  const icons = {
    download: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 18h16"/></svg>',
    success:  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    error:    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6"/><path d="M15 9l-6 6"/></svg>',
  };
  icon.innerHTML = icons[kind] || icons.download;
}

export function updatePwaToast(state, { title, message, progress, icon } = {}) {
  const r = refs();
  if (!r.toast) return;

  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

  if (icon) setPwaIcon(icon);
  if (title   && r.title)   r.title.textContent   = title;
  if (message && r.message) r.message.textContent = message;

  if (r.progress) {
    if (typeof progress === 'number' && !Number.isNaN(progress)) {
      const safe = Math.max(0, Math.min(1, progress));
      r.progress.style.display = 'block';
      r.progress.setAttribute('aria-valuenow', String(Math.round(safe * 100)));
      if (r.bar) r.bar.style.width = `${Math.round(safe * 100)}%`;
    } else {
      r.progress.style.display = 'none';
      if (r.bar) r.bar.style.width = '0%';
    }
  }

  r.toast.classList.remove('is-success', 'is-error');
  if (state === 'success') r.toast.classList.add('is-success');
  else if (state === 'error') r.toast.classList.add('is-error');

  r.toast.removeAttribute('hidden');
  requestAnimationFrame(() => r.toast.classList.add('is-visible'));
}

export function hidePwaToast(delay = 0) {
  const r = refs();
  if (!r.toast) return;
  if (delay) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hidePwaToast(0), delay);
    return;
  }
  r.toast.classList.remove('is-visible');
  hideTimer = setTimeout(() => {
    r.toast.setAttribute('hidden', 'hidden');
    r.toast.classList.remove('is-success', 'is-error');
    if (r.bar) r.bar.style.width = '0%';
    hideTimer = null;
  }, 320);
}

// Window bridge: ESM implementation becomes authoritative for external callers.
// main-js.js's own closure references still exist (unchanged) and keep working.
if (typeof window !== 'undefined') {
  window.setPwaIcon     = setPwaIcon;
  window.updatePwaToast = updatePwaToast;
  window.hidePwaToast   = hidePwaToast;
}
