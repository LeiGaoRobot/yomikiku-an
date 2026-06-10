// PWA install-button wiring — extracted from main-js.js (Phase 1).
// Wires the header download button + optional toast-close button, with a
// feature-detect fallback that swaps the click handler for an "unsupported"
// toast when neither `serviceWorker` nor `caches` is available.
//
// Pure DI: the host environment supplies DOM nodes and callbacks. No reads
// from `window`, `navigator`, or `document` happen unless `isPwaSupported`
// is omitted (the default detector is the only env coupling, and it can
// be overridden in tests).
//
// Boot-race contract: the call site in `main-js.js` keeps an inline
// fallback (per the playback-boundary rule) at Phase-2.

/**
 * Wire the PWA install button. Returns a small report so callers (and
 * tests) can assert what wiring actually happened.
 *
 * @param {object} options
 * @param {EventTarget|null} options.headerDownloadBtn  Required — the install button.
 * @param {EventTarget|null} [options.pwaToastClose]    Optional toast-close button.
 * @param {() => void}       [options.hidePwaToast]     Called on toast-close click.
 * @param {(level: string, payload: object) => void} [options.updatePwaToast]
 *        Invoked when the unsupported click-handler fires.
 * @param {(key: string) => string} [options.formatMessage]
 *        i18n lookup used for the unsupported-toast strings.
 * @param {(event: Event) => void} [options.startPwaDownload]
 *        Click handler attached when PWA APIs are present.
 * @param {() => boolean} [options.isPwaSupported]
 *        Override for env detection. Default checks
 *        `'serviceWorker' in navigator && 'caches' in window`.
 * @returns {{ wired: 'unsupported' | 'supported' | 'noop', toastClose: boolean }}
 */
export function setupPwaInstaller(options) {
  const opts = options || {};
  const btn = opts.headerDownloadBtn;
  if (!btn || typeof btn.addEventListener !== 'function') {
    return { wired: 'noop', toastClose: false };
  }

  let toastClose = false;
  if (opts.pwaToastClose && typeof opts.pwaToastClose.addEventListener === 'function') {
    const hide = typeof opts.hidePwaToast === 'function' ? opts.hidePwaToast : null;
    if (hide) {
      opts.pwaToastClose.addEventListener('click', () => hide(0));
      toastClose = true;
    }
  }

  const supported = typeof opts.isPwaSupported === 'function'
    ? !!opts.isPwaSupported()
    : (typeof navigator !== 'undefined'
        && 'serviceWorker' in navigator
        && typeof window !== 'undefined'
        && 'caches' in window);

  if (!supported) {
    btn.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      const updateToast = typeof opts.updatePwaToast === 'function' ? opts.updatePwaToast : null;
      const fmt = typeof opts.formatMessage === 'function'
        ? opts.formatMessage
        : (k) => k;
      if (updateToast) {
        updateToast('error', {
          title: fmt('pwaTitle'),
          message: fmt('pwaUnsupported'),
          icon: 'error',
        });
      }
    });
    return { wired: 'unsupported', toastClose };
  }

  if (typeof opts.startPwaDownload === 'function') {
    btn.addEventListener('click', opts.startPwaDownload);
  }
  return { wired: 'supported', toastClose };
}

if (typeof window !== 'undefined') {
  window.YomikikuanPwaInstaller = { setupPwaInstaller };
}
