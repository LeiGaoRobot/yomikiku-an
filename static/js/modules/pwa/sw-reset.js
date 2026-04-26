// Service-worker PWA reset coordinator — extracted from main-js.js Phase 1.
//
// Owns the request/response handshake between the page and the SW for a
// "reset everything" operation: posts { type: 'PWA_RESET', requestId,
// cachePrefix } to the controller, awaits a matching { type:
// 'PWA_RESET_DONE' | 'PWA_RESET_FAILED', requestId, message? } reply, and
// times out after timeoutMs.
//
// Pure factory — no DOM, no globals. Tests inject a mock controller and a
// deterministic makeRequestId. The original implementation in main-js.js
// keeps its Map-based resolver wiring; a Phase-2 dedup will replace the
// inline copy with a delegator to this coordinator.

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_PREFIX = 'yomikikuan-cache';

function defaultRequestId() {
  return `pwa-reset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createSwResetCoordinator(opts = {}) {
  const cachePrefix = opts.cachePrefix || DEFAULT_PREFIX;
  const timeoutMs = (typeof opts.timeoutMs === 'number') ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const makeRequestId = (typeof opts.makeRequestId === 'function')
    ? opts.makeRequestId
    : defaultRequestId;
  // Tests inject a setTimer/clearTimer pair to avoid real timers.
  const setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer || ((id) => clearTimeout(id));

  const resolvers = new Map();

  function request(controller) {
    return new Promise((resolve, reject) => {
      if (!controller || typeof controller.postMessage !== 'function') {
        reject(new Error('no-controller'));
        return;
      }
      const requestId = makeRequestId();
      const timer = setTimer(() => {
        if (resolvers.has(requestId)) {
          resolvers.delete(requestId);
          reject(new Error('reset-timeout'));
        }
      }, timeoutMs);

      resolvers.set(requestId, {
        resolve: () => {
          clearTimer(timer);
          resolvers.delete(requestId);
          resolve();
        },
        reject: (error) => {
          clearTimer(timer);
          resolvers.delete(requestId);
          const err = error instanceof Error
            ? error
            : new Error((error && error.message) || String(error || 'reset failed'));
          reject(err);
        }
      });

      controller.postMessage({
        type: 'PWA_RESET',
        requestId,
        cachePrefix,
      });
    });
  }

  // Returns true if the message was a PWA_RESET_* response (consumed),
  // false otherwise. main-js.js uses the boolean to decide whether to
  // fall through to the rest of its handler chain.
  function handleMessage(event) {
    const data = event && event.data;
    if (!data) return false;
    if (data.type !== 'PWA_RESET_DONE' && data.type !== 'PWA_RESET_FAILED') return false;
    const resolver = data.requestId ? resolvers.get(data.requestId) : null;
    if (resolver) {
      if (data.type === 'PWA_RESET_DONE') {
        resolver.resolve();
      } else {
        resolver.reject(new Error(data.message || 'reset failed'));
      }
    } else if (data.type === 'PWA_RESET_FAILED') {
      try {
        // eslint-disable-next-line no-console
        console.warn('[PWA] Reset failed without resolver', data.message);
      } catch (_) {}
    }
    return true;
  }

  function pendingCount() {
    return resolvers.size;
  }

  return { request, handleMessage, pendingCount };
}

if (typeof window !== 'undefined') {
  window.YomikikuanSwReset = { createSwResetCoordinator };
}
