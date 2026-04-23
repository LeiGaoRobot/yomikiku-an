// Spaced-repetition store for vocabulary (词汇本) and wrong answers (错题本).
// Two IDB object stores under the dedicated DB 'yomikikuan-srs' — this DB is
// distinct from 'yomikikuan-analysis' because SRS items are user-owned data
// and must NOT expire or be LRU-evicted like caches do.
//
// Public API:
//   addVocab({ word, reading, gloss, source? })                -> string id
//   addMistake({ stem, options, correctIndex, userAnswerIndex,
//                explanation, citation, level, source? })       -> string id
//   listVocab({ bucket?: 'due'|'learning'|'mastered'|'all' })   -> Promise<Entry[]>
//   listMistakes({ bucket? })                                   -> Promise<Entry[]>
//   gradeVocab(id, q)                                           -> Promise<void>
//   gradeMistake(id, q)                                         -> Promise<void>
//   removeVocab(id) / removeMistake(id)                         -> Promise<void>
//   stats()                                                     -> Promise<{ vocab, mistakes }>
//
// Grade q is 0..5 (SM-2). Convenience mapping from UI 4-button grading:
//   Again=1, Hard=3, Good=4, Easy=5.

const DB_NAME = 'yomikikuan-srs';
const DB_VERSION = 1;
const STORE_VOCAB = 'vocab';
const STORE_MIST  = 'mistakes';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_VOCAB)) {
        const s = db.createObjectStore(STORE_VOCAB, { keyPath: 'id' });
        s.createIndex('nextDueAt', 'nextDueAt');
      }
      if (!db.objectStoreNames.contains(STORE_MIST)) {
        const s = db.createObjectStore(STORE_MIST, { keyPath: 'id' });
        s.createIndex('nextDueAt', 'nextDueAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function rid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- SM-2 ----------

// Returns a new scheduling snapshot. Does NOT mutate input.
export function sm2Next(item, q) {
  const now = Date.now();
  q = Math.max(0, Math.min(5, Math.round(Number(q) || 0)));
  let { easiness = 2.5, interval = 0, repetitions = 0 } = item || {};
  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.max(1, Math.round(interval * easiness));
  }
  easiness = Math.max(1.3, easiness + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const nextDueAt = now + interval * DAY_MS;
  return {
    easiness: Number(easiness.toFixed(4)),
    interval,
    repetitions,
    lastReviewedAt: now,
    nextDueAt,
  };
}

export function bucketOf(item, now = Date.now()) {
  const interval = Number(item && item.interval || 0);
  const due = Number(item && item.nextDueAt || 0) <= now;
  if (due) return 'due';
  if (interval >= 21) return 'mastered';
  return 'learning';
}

// ---------- Vocab ----------

export async function addVocab(entry) {
  const db = await openDb();
  const id = entry && entry.id ? entry.id : rid('v');
  const now = Date.now();
  const row = {
    id,
    word: String(entry.word || '').trim(),
    reading: String(entry.reading || '').trim(),
    gloss: String(entry.gloss || '').trim(),
    source: entry.source || null,
    createdAt: now,
    lastReviewedAt: 0,
    easiness: 2.5,
    interval: 0,
    repetitions: 0,
    nextDueAt: now,
  };
  if (!row.word && !row.gloss) throw new Error('EMPTY_VOCAB');
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VOCAB, 'readwrite');
    tx.objectStore(STORE_VOCAB).put(row);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeVocab(id) {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VOCAB, 'readwrite');
    tx.objectStore(STORE_VOCAB).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function gradeVocab(id, q) {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VOCAB, 'readwrite');
    const s = tx.objectStore(STORE_VOCAB);
    const req = s.get(id);
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      Object.assign(cur, sm2Next(cur, q));
      s.put(cur);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function listVocab({ bucket = 'all', sort = 'due' } = {}) {
  return listFrom(STORE_VOCAB, bucket, sort);
}

// ---------- Mistakes ----------

export async function addMistake(entry) {
  const db = await openDb();
  const id = entry && entry.id ? entry.id : rid('m');
  const now = Date.now();
  const row = {
    id,
    stem: String(entry.stem || '').trim(),
    options: Array.isArray(entry.options) ? entry.options.map(String) : [],
    correctIndex: Number(entry.correctIndex) | 0,
    userAnswerIndex: Number.isFinite(Number(entry.userAnswerIndex)) ? Number(entry.userAnswerIndex) | 0 : -1,
    explanation: String(entry.explanation || '').trim(),
    citation: String(entry.citation || '').trim(),
    level: String(entry.level || '').trim(),
    source: entry.source || null,
    createdAt: now,
    lastReviewedAt: 0,
    easiness: 2.5,
    interval: 0,
    repetitions: 0,
    nextDueAt: now,
  };
  if (!row.stem) throw new Error('EMPTY_MISTAKE');
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MIST, 'readwrite');
    tx.objectStore(STORE_MIST).put(row);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeMistake(id) {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MIST, 'readwrite');
    tx.objectStore(STORE_MIST).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function gradeMistake(id, q) {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MIST, 'readwrite');
    const s = tx.objectStore(STORE_MIST);
    const req = s.get(id);
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      Object.assign(cur, sm2Next(cur, q));
      s.put(cur);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function listMistakes({ bucket = 'all', sort = 'due' } = {}) {
  return listFrom(STORE_MIST, bucket, sort);
}

// ---------- Shared helpers ----------

async function listFrom(storeName, bucket, sort = 'due') {
  const db = await openDb();
  const all = await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  const now = Date.now();
  const filtered = bucket === 'all' ? all : all.filter((e) => bucketOf(e, now) === bucket);
  // Three sort modes exposed to UI:
  //   'due'     — default: bucket priority (due → learning → mastered),
  //               then nextDueAt ascending. Best for actual review work.
  //   'created' — newest first. Useful when inspecting recently-added items.
  //   'random'  — in-place Fisher-Yates. Good for varied review sessions.
  if (sort === 'random') {
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = filtered[i]; filtered[i] = filtered[j]; filtered[j] = tmp;
    }
  } else if (sort === 'created') {
    filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else {
    const rank = { due: 0, learning: 1, mastered: 2 };
    filtered.sort((a, b) => {
      const ra = rank[bucketOf(a, now)] ?? 3;
      const rb = rank[bucketOf(b, now)] ?? 3;
      if (ra !== rb) return ra - rb;
      return (a.nextDueAt || 0) - (b.nextDueAt || 0);
    });
  }
  return filtered;
}

export async function stats() {
  const [vs, ms] = await Promise.all([listVocab({ bucket: 'all' }), listMistakes({ bucket: 'all' })]);
  const now = Date.now();
  const tally = (arr) => arr.reduce((acc, e) => {
    const b = bucketOf(e, now);
    acc[b] = (acc[b] || 0) + 1;
    acc.total = (acc.total || 0) + 1;
    return acc;
  }, { due: 0, learning: 0, mastered: 0, total: 0 });
  return { vocab: tally(vs), mistakes: tally(ms) };
}

// ---------- Backup helpers ----------

// Snapshot everything — used by backup-export to include SRS data in the
// standard yomikikuan-backup-*.json payload.
export async function dumpAll() {
  const db = await openDb();
  const readStore = (name) => new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readonly');
    const req = tx.objectStore(name).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror  = () => reject(req.error);
  });
  const [vocab, mistakes] = await Promise.all([readStore(STORE_VOCAB), readStore(STORE_MIST)]);
  return { vocab, mistakes };
}

// Restore rows from a backup payload. Merge-by-id: rows with an existing id
// are left alone (the local copy may have newer review state), rows with new
// ids are appended. This is a non-destructive import — nothing gets deleted.
// Returns counts of inserted rows.
export async function restoreAll(payload) {
  const db = await openDb();
  const vocab = Array.isArray(payload && payload.vocab) ? payload.vocab : [];
  const mistakes = Array.isArray(payload && payload.mistakes) ? payload.mistakes : [];

  const insertInto = (storeName, rows) => new Promise((resolve, reject) => {
    if (!rows.length) return resolve(0);
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    let added = 0;
    let pending = rows.length;
    rows.forEach((row) => {
      if (!row || typeof row !== 'object' || !row.id) { pending--; if (pending === 0) resolve(added); return; }
      const getReq = store.get(row.id);
      getReq.onsuccess = () => {
        if (!getReq.result) { // only add if not already present
          store.add(row);
          added++;
        }
        pending--;
        if (pending === 0) resolve(added);
      };
      getReq.onerror = () => { pending--; if (pending === 0) resolve(added); };
    });
    tx.onerror = () => reject(tx.error);
  });

  const vocabAdded = await insertInto(STORE_VOCAB, vocab);
  const mistakesAdded = await insertInto(STORE_MIST, mistakes);
  return { vocabAdded, mistakesAdded };
}
