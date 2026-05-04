// PWA install/download orchestrator — extracted from main-js.js (Phase 1).
// Async multi-step flow:
//   1. Feature-detect (SW + caches) → error toast on miss
//   2. Online check  → error toast on offline
//   3. Already-installing check → progress toast + return
//   4. Reset PWA_STATE counters + show spinner
//   5. Clear local app cache + success toast
//   6. SW register + reset (via injected requestServiceWorkerReset)
//   7. Fetch + normalize manifest, post CACHE_ASSETS to SW
//   8. Caller's handleServiceWorkerMessage drives later progress toasts
//
// Pure DI: every host capability (DOM helpers, state, toast/spinner
// callbacks, fetch, navigator/window, sleep, ID factory) is injected
// via `ctx`, so tests can run the full async flow with stubs and
// assert on state mutations + call sequences.
//
// Boot-race contract: handler-only call site (install-button click).
// The dynamic-import block always resolves before any user click, so
// no inline fallback in main-js.js is required after Phase-2 dedup.
//
// IMPORTANT: this module DOES NOT touch the playback boundary. It only
// orchestrates SW + cache + toast; PWA progress handling stays in
// main-js.js's handleServiceWorkerMessage, which closure-mutates the
// same PWA_STATE object passed in via ctx.

/**
 * Context object expected by `startPwaDownload`.
 * @typedef {object} StartPwaDownloadCtx
 * @property {object} PWA_STATE      Mutable state — installing/total/completed/etc.
 * @property {{ value: boolean }} pwaListenerAttached  One-shot "did we attach listener" flag.
 * @property {string} PWA_MANIFEST_URL  URL passed to fetch() for the asset list.
 * @property {(state: string, opts?: object) => void} updatePwaToast
 * @property {(active: boolean) => void} toggleHeaderDownloadSpinner
 * @property {() => void} clearLocalAppCache
 * @property {(ms: number) => Promise<void>} sleep
 * @property {(controller: any) => Promise<void>} requestServiceWorkerReset
 * @property {(event: MessageEvent) => void} handleServiceWorkerMessage
 * @property {(prefix?: string) => string} createRequestId
 * @property {(key: string, params?: object) => string} formatMessage
 * @property {Navigator} [navigator]  Defaults to globalThis.navigator
 * @property {any} [window]           Defaults to globalThis.window (for caches check)
 * @property {typeof fetch} [fetch]   Defaults to globalThis.fetch
 * @property {(level: string, msg: any) => void} [logError]
 *        Defaults to console.error. Override in tests to silence noise.
 */

/**
 * Run the PWA install/download flow.
 * @param {Event|null} event  Click event (preventDefault'd if present).
 * @param {StartPwaDownloadCtx} ctx
 * @returns {Promise<{ outcome: string }>}
 *        outcome ∈ 'unsupported' | 'offline' | 'already-installing'
 *                 | 'reset-failed' | 'manifest-failed' | 'caching'
 */
export async function startPwaDownload(event, ctx) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (!ctx) throw new Error('startPwaDownload: ctx is required');

  const nav = ctx.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const win = ctx.window    || (typeof window    !== 'undefined' ? window    : null);
  const fetchImpl = ctx.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  const logError  = ctx.logError || ((scope, msg) => {
    try { console.error(scope, msg); } catch (_) {}
  });

  if (!nav || !('serviceWorker' in nav) || !win || !('caches' in win)) {
    ctx.updatePwaToast('error', {
      title: ctx.formatMessage('pwaTitle'),
      message: ctx.formatMessage('pwaUnsupported'),
      icon: 'error',
    });
    return { outcome: 'unsupported' };
  }

  if (nav && 'onLine' in nav && !nav.onLine) {
    ctx.updatePwaToast('error', {
      title: ctx.formatMessage('pwaTitle'),
      message: ctx.formatMessage('pwaOffline'),
      icon: 'error',
    });
    return { outcome: 'offline' };
  }

  const ST = ctx.PWA_STATE;
  if (ST.installing) {
    const progressValue = ST.total ? ST.completed / ST.total : 0;
    ctx.updatePwaToast('progress', {
      title: ctx.formatMessage('pwaTitle'),
      message: ctx.formatMessage('pwaAlreadyCaching'),
      progress: progressValue,
      icon: 'download',
    });
    return { outcome: 'already-installing' };
  }

  ST.installing = true;
  ST.failed = 0;
  ST.lastError = '';
  ST.total = 0;
  ST.completed = 0;
  ST.failedAssets = [];
  ST.requestId = null;
  ctx.toggleHeaderDownloadSpinner(true);

  try {
    ctx.clearLocalAppCache();
    ctx.updatePwaToast('success', {
      title: ctx.formatMessage('pwaTitle'),
      message: ctx.formatMessage('localCacheCleared'),
      icon: 'success',
    });
    await ctx.sleep(1000);
  } catch (_) {}

  ctx.updatePwaToast('progress', {
    title: ctx.formatMessage('pwaTitle'),
    message: ctx.formatMessage('pwaResetting'),
    progress: null,
    icon: 'download',
  });

  let controller;
  let registration;
  try {
    registration = await nav.serviceWorker.register('./service-worker.js');
    ST.registration = registration;
    const ready = await nav.serviceWorker.ready;
    controller = nav.serviceWorker.controller || ready.active || registration.active;
    if (!controller) throw new Error('no-controller');

    if (!ctx.pwaListenerAttached.value) {
      nav.serviceWorker.addEventListener('message', ctx.handleServiceWorkerMessage);
      ctx.pwaListenerAttached.value = true;
    }

    await ctx.requestServiceWorkerReset(controller);
  } catch (error) {
    logError('PWA reset failed', error);
    ST.installing = false;
    ctx.toggleHeaderDownloadSpinner(false);
    ctx.updatePwaToast('error', {
      title: ctx.formatMessage('pwaTitle'),
      message: ctx.formatMessage('pwaResetFailed', { message: (error && error.message) || 'unknown' }),
      progress: 0,
      icon: 'error',
    });
    return { outcome: 'reset-failed' };
  }

  ctx.updatePwaToast('success', {
    title: ctx.formatMessage('pwaTitle'),
    message: ctx.formatMessage('pwaCacheCleared'),
    progress: null,
    icon: 'success',
  });
  await ctx.sleep(1000);

  ctx.updatePwaToast('progress', {
    title: ctx.formatMessage('pwaTitle'),
    message: ctx.formatMessage('pwaPreparing'),
    progress: 0,
    icon: 'download',
  });

  try {
    const manifestResponse = await fetchImpl(ctx.PWA_MANIFEST_URL, { cache: 'no-store' });
    if (!manifestResponse.ok) throw new Error(`manifest ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    if (!assets.length) throw new Error('no-assets');

    const normalizedAssets = assets.map((asset) => {
      if (typeof asset !== 'string') return '';
      if (/^https?:/i.test(asset)) return asset;
      return asset.startsWith('.') || asset.startsWith('/') ? asset : `./${asset}`;
    }).filter(Boolean);

    ST.total = normalizedAssets.length;
    ST.requestId = ctx.createRequestId('pwa');
    controller.postMessage({
      type: 'CACHE_ASSETS',
      assets: normalizedAssets,
      requestId: ST.requestId,
    });

    ctx.updatePwaToast('progress', {
      title: ctx.formatMessage('pwaTitle'),
      message: ctx.formatMessage('pwaProgress', { completed: 0, total: ST.total, percent: 0 }),
      progress: 0,
      icon: 'download',
    });
    return { outcome: 'caching' };
  } catch (error) {
    logError('PWA cache failed', error);
    ST.installing = false;
    ST.requestId = null;
    ctx.toggleHeaderDownloadSpinner(false);
    ctx.updatePwaToast('error', {
      title: ctx.formatMessage('pwaTitle'),
      message: ctx.formatMessage('pwaError', { message: (error && error.message) || 'unknown' }),
      progress: 0,
      icon: 'error',
    });
    return { outcome: 'manifest-failed' };
  }
}

if (typeof window !== 'undefined') {
  window.YomikikuanPwaStartDownload = { startPwaDownload };
}
