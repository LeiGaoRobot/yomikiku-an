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

// Pure helper: format an array of failed-asset URLs into a "失败文件: a, b, c"
// string with same-origin paths shortened to .pathname and an "(+N more)"
// suffix when the list exceeds `max`. Pulled out of main-js.js's
// formatFailedAssetsSummary so it can be unit-tested without PWA_STATE.
//
// baseHref is dependency-injected (defaults to window.location.href) so the
// same-origin shortening is testable.
export function formatFailedAssetsSummary(failedList, max = 3, baseHref) {
  const list = Array.isArray(failedList) ? failedList : [];
  if (!list.length) return '';

  // Surface the full list to the console (parity with the in-file version).
  try {
    console.group('[PWA] 缓存失败的文件列表:');
    list.forEach((url, index) => console.log(`${index + 1}. ${url}`));
    console.groupEnd();
  } catch (_) {}

  const base = baseHref || (typeof window !== 'undefined' ? window.location.href : '');
  let baseOrigin = '';
  try { baseOrigin = base ? new URL(base).origin : ''; } catch (_) {}

  const labels = list.slice(0, max).map((url) => {
    try {
      const u = base ? new URL(url, base) : new URL(url);
      return baseOrigin && u.origin === baseOrigin ? u.pathname : url;
    } catch (_) {
      return url;
    }
  });
  const more = list.length > max ? ` (+${list.length - max} more)` : '';
  return `失败文件: ${labels.join(', ')}${more}`;
}

// Window bridge: ESM implementation becomes authoritative for external callers.
// main-js.js's own closure references still exist (unchanged) and keep working.
if (typeof window !== 'undefined') {
  window.setPwaIcon     = setPwaIcon;
  window.updatePwaToast = updatePwaToast;
  window.hidePwaToast   = hidePwaToast;
  window.YomikikuanPwaFormat = { formatFailedAssetsSummary };
}
