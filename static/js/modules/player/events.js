// player/events — tiny pub/sub for decoupling player ↔ analysis/render.
// Zero dependencies. In-memory only. Also exposed on window.YomikikuanEvents
// for classic scripts (main-js.js, tts.js) to emit/subscribe without ESM.
//
// Recognised events (contract grows as M3-11/12 proceed):
//   'play:start'        { text, totalSegments, totalChars }
//   'play:end'          { reason }            // reason ∈ 'finished'|'stopped'|'error'
//   'play:pause'        {}
//   'play:resume'       {}
//   'segment:change'    { index, text, charOffset }
//   'progress'          { fraction }          // 0..1
//   'token:highlight'   { surface, element? } // surface = kanji string
//   'token:clear'       {}
//   'voice:change'      { voiceName }
//   'rate:change'       { rate }
//   'volume:change'     { volume }
//   'engine:change'     { engine }            // 'gemini' | 'web'
//
// Listeners run synchronously in subscription order. Exceptions in one
// listener do NOT stop others (caught + logged).

const listeners = new Map(); // name -> Set<fn>

function on(name, fn) {
  if (typeof fn !== 'function') return () => {};
  let set = listeners.get(name);
  if (!set) { set = new Set(); listeners.set(name, set); }
  set.add(fn);
  return () => { set.delete(fn); if (set.size === 0) listeners.delete(name); };
}

function off(name, fn) {
  const set = listeners.get(name);
  if (!set) return;
  set.delete(fn);
  if (set.size === 0) listeners.delete(name);
}

function once(name, fn) {
  const unsub = on(name, (payload) => {
    try { fn(payload); } finally { unsub(); }
  });
  return unsub;
}

function emit(name, payload) {
  const set = listeners.get(name);
  if (!set || set.size === 0) return;
  // Snapshot to protect against re-entrant mutation.
  for (const fn of Array.from(set)) {
    try { fn(payload); }
    catch (e) { console.error(`[YomikikuanEvents] listener for "${name}" threw:`, e); }
  }
}

function clear(name) {
  if (name == null) { listeners.clear(); return; }
  listeners.delete(name);
}

function listNames() { return Array.from(listeners.keys()); }

const bus = Object.freeze({ on, off, once, emit, clear, listNames });

// ESM named exports + window bridge for classic callers.
export { on, off, once, emit, clear, listNames };
export default bus;

if (typeof window !== 'undefined') {
  window.YomikikuanEvents = bus;
}
