// yomikikuan-analysis IndexedDB store. 30-day TTL, per-namespace LRU.
//
// Previously a single LRU-500 shared across all providerIds — which was bad
// under mixed workloads: one long-document summary or a handful of JLPT
// payloads (each ~5–30 KB of JSON) could evict hundreds of cheap
// per-sentence `gemini` entries even though there was plenty of room in the
// "summary" bucket. The per-namespace caps below roughly match each
// provider's entry size × user-visible reuse pattern:
//
//   gemini          — per-sentence analyses, small & reused heavily
//   translate-zh    — one entry per line, small
//   article-summary — one entry per document, medium
//   jlpt            — one entry per (doc,level,count,mode), medium-large
//   mock            — dev fixture; keep a few around
//   default         — fallback bucket for unknown providers
//
// Total implicit budget ≈ 600 entries. TTL and the underlying IDB schema
// are unchanged — existing records continue to work without migration.
const DB_NAME = 'yomikikuan-analysis';
const DB_VERSION = 1;
const STORE = 'analysis';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LRU_CAPS = Object.freeze({
  'gemini':          400,
  'translate-zh':    100,
  'article-summary':  50,
  'jlpt':             30,
  'mock':             20,
  'default':         100,
});
function capForProvider(id) {
  return Object.prototype.hasOwnProperty.call(LRU_CAPS, id) ? LRU_CAPS[id] : LRU_CAPS.default;
}

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'key' });
        s.createIndex('lastAccess', 'lastAccess');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

async function hashKey(text, providerId, schemaVersion) {
  const enc = new TextEncoder().encode(`${text}|${providerId}|${schemaVersion}`);
  const buf = await crypto.subtle.digest('SHA-1', enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function get(text, providerId, schemaVersion) {
  try {
    const db = await openDb();
    const key = await hashKey(text, providerId, schemaVersion);
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        if (!row) return resolve(null);
        if (Date.now() - row.createdAt > TTL_MS) {
          store.delete(key);
          return resolve(null);
        }
        row.lastAccess = Date.now();
        store.put(row);
        resolve(row.result);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[analyzer/cache] get failed', err);
    return null;
  }
}

export async function put(text, providerId, schemaVersion, result) {
  try {
    const db = await openDb();
    const key = await hashKey(text, providerId, schemaVersion);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        key, text, providerId, schemaVersion, result,
        createdAt: Date.now(), lastAccess: Date.now(),
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await evictIfNeeded(providerId);
  } catch (err) {
    console.warn('[analyzer/cache] put failed', err);
  }
}

// Evict oldest entries within the given providerId namespace until its
// population is at-or-below `capForProvider(providerId)`. Eviction is
// namespace-scoped so one high-churn provider can never squeeze out the
// working set of another. The function is best-effort — any IDB error
// resolves silently so put() never hangs.
async function evictIfNeeded(providerId) {
  const db = await openDb();
  const cap = capForProvider(providerId);
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.onerror = () => resolve();
    const store = tx.objectStore(STORE);
    const idx = store.index('lastAccess');
    // First pass: count entries in this namespace (cursor over lastAccess
    // index, filtered by providerId). This is O(namespace size) but with
    // per-namespace caps ≤ 400 it's effectively constant.
    let count = 0;
    const countReq = idx.openCursor();
    countReq.onerror = () => resolve();
    countReq.onsuccess = (ev) => {
      const cur = ev.target.result;
      if (!cur) {
        const excess = count - cap;
        if (excess <= 0) return resolve();
        // Second pass: delete `excess` oldest entries in this namespace.
        let removed = 0;
        const delReq = idx.openCursor();
        delReq.onerror = () => resolve();
        delReq.onsuccess = (e2) => {
          const c2 = e2.target.result;
          if (!c2 || removed >= excess) return resolve();
          if (c2.value && c2.value.providerId === providerId) {
            c2.delete();
            removed++;
          }
          c2.continue();
        };
        return;
      }
      if (cur.value && cur.value.providerId === providerId) count++;
      cur.continue();
    };
  });
}

export async function clearAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Delete every row whose providerId matches. Useful when a provider's
// prompt/schema changes and existing cached payloads become stale — e.g.
// after tweaking the article-summary prompt you can drop only summaries
// without wiping per-sentence `gemini` analyses. Returns number removed.
// Best-effort: any IDB error resolves 0 rather than rejecting.
export async function clearByNamespace(providerId) {
  if (!providerId) return 0;
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.onerror = () => resolve(0);
    const store = tx.objectStore(STORE);
    let removed = 0;
    const req = store.openCursor();
    req.onerror = () => resolve(0);
    req.onsuccess = (ev) => {
      const cur = ev.target.result;
      if (!cur) return resolve(removed);
      if (cur.value && cur.value.providerId === providerId) {
        cur.delete();
        removed++;
      }
      cur.continue();
    };
  });
}
