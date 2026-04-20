// yomikikuan-analysis IndexedDB store. 30-day TTL, LRU 500 entries.
const DB_NAME = 'yomikikuan';
const DB_VERSION = 1;
const STORE = 'analysis';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LRU_CAP = 500;

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
    req.onerror = () => reject(req.error);
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
    await evictIfNeeded();
  } catch (err) {
    console.warn('[analyzer/cache] put failed', err);
  }
}

async function evictIfNeeded() {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - LRU_CAP;
      if (excess <= 0) return resolve();
      const idx = store.index('lastAccess');
      let removed = 0;
      idx.openCursor().onsuccess = (ev) => {
        const cur = ev.target.result;
        if (!cur || removed >= excess) return resolve();
        cur.delete();
        removed++;
        cur.continue();
      };
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
