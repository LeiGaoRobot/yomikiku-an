// Max-N concurrent limiter with abort support.
// Consumed by static/js/modules/analyzer/index.js (runAnalyze + glossWord).
// Pure in-memory state — no persistence.
export function createLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];
  return async function run(fn, signal) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    if (active >= maxConcurrent) {
      await new Promise((resolve, reject) => {
        const onAbort = () => { reject(new DOMException('aborted', 'AbortError')); };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        queue.push(() => {
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve();
        });
      });
    }
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    active++;
    try { return await fn(); }
    finally {
      active--;
      const next = queue.shift();
      if (next) next();
    }
  };
}
