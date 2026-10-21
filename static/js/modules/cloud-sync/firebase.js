// Cloud sync — Option A, FIREBASE side (bridge adapter).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS MODULE DOES
// ─────────────────────────────────────────────────────────────────────────────
// `modules/cloud-sync/index.js` never talks to a backend; it calls a host
// installed bridge:
//
//   window.__yomikikuanCloudBridge = {
//     async get()                   // → { payload, updatedAt } | null
//     async set(payload, updatedAt) // → void   (updatedAt = epoch ms)
//   }
//
// This module is the optional Firebase adapter that installs that bridge:
//
//   1. read the Firebase web config (`config.js` → `window.YOMIKIKUAN_CONFIG
//      .firebaseConfig`, or the JSON copy in
//      `localStorage['yomikikuan_firebase_config']`);
//   2. lazily import the Firebase v10 modular SDK from the gstatic CDN
//      (nothing is fetched unless a config actually exists);
//   3. reuse an existing Firebase app / auth user, or sign in anonymously;
//   4. install the bridge over
//      `users/{uid}/sync/main` = `{ payload, updatedAt }`.
//
// If any step fails, `installFirebaseBridge` returns
//   { ok:false, reason: 'config-missing' | 'config-invalid' |
//                        'sdk-load-failed' | 'auth-failed' |
//                        'firestore-failed' }
// and never throws. `index.js` maps those reasons to a toast and otherwise
// keeps the legacy "cloud sync not configured" graceful degradation.
//
// ─────────────────────────────────────────────────────────────────────────────
// REAL FIREBASE SETUP (not executable in this repo's CI — no project exists)
// ─────────────────────────────────────────────────────────────────────────────
// 1. Create a project at https://console.firebase.google.com and add a Web
//    app. Copy the "SDK setup and configuration" object into config.js:
//
//      window.YOMIKIKUAN_CONFIG = {
//        // …
//        firebaseConfig: {
//          apiKey: 'AIza…',
//          authDomain: '<project>.firebaseapp.com',
//          projectId: '<project>',
//          storageBucket: '<project>.appspot.com',
//          messagingSenderId: '1234567890',
//          appId: '1:1234567890:web:abcdef',
//        },
//      };
//
//    index.html copies a non-empty `firebaseConfig` to
//    `localStorage['yomikikuan_firebase_config']` (JSON), the same precedence
//    model as the Gemini key: config.js wins on every reload; to disable cloud
//    sync, blank `firebaseConfig` AND
//    `localStorage.removeItem('yomikikuan_firebase_config')`.
//
// 2. Authentication → Sign-in method → enable **Anonymous**. Without it,
//    `signInAnonymously()` fails with `auth/operation-not-allowed` and the app
//    shows the "cloud authentication failed" toast.
//    (Existing Firebase users are reused: `signInAnonymously` is only called
//    when `auth.currentUser` is null.)
//
// 3. Firestore Database → create the database, then deploy rules that scope
//    every read/write to the signed-in uid. Minimal rule:
//
//      rules_version = '2';
//      service cloud.firestore {
//        match /databases/{database}/documents {
//          match /users/{uid}/sync/{doc} {
//            allow read, write: if request.auth != null
//                               && request.auth.uid == uid;
//          }
//        }
//      }
//
//    The app only touches `users/{uid}/sync/main`; the wildcard keeps future
//    per-document keys possible without re-opening other users' data.
//
// 4. Reload index.html, open the user menu, and press 「クラウドへ保存」.
//    The first load needs network access to www.gstatic.com (the service
//    worker deliberately does not cache cross-origin SDK modules).
//
// Security / ops notes
//   • A Firebase web config is NOT a secret — it ships in every client that
//     talks to Firebase. The security boundary is Firestore rules (+ Auth),
//     so a public deploy MUST deploy the rules above; otherwise anyone can
//     read/write the whole database.
//   • Anonymous users are per-browser. Clearing site data creates a new uid,
//     so the previous cloud copy becomes unreachable — Push/Pull cannot
//     recover it. Warn single-browser users accordingly; real account
//     linking is out of scope for Option A.
//   • Enable Firebase App Check / usage quotas before a public deploy: the
//     push payload contains the user's full document set.
//   • The SDK version is PINNED (see FIREBASE_SDK_VERSION) so a `latest`
//     release cannot break the app silently. Bump it deliberately and re-run
//     firebase.test.html.
//
// Local testing without a real project
//   • Unit tests (`firebase.test.html`) inject `loadSdk` / the test hook and
//     never touch the network.
//   • For an emulator run, start
//       firebase emulators:start --only auth,firestore
//     and provide a loader that connects the emulators before install, e.g.
//       window.__yomikikuanFirebaseSdkLoader = async () => {
//         const [app, auth, fs] = await Promise.all([
//           import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
//           import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
//           import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'),
//         ]);
//         return {
//           getApps: app.getApps, initializeApp: app.initializeApp,
//           getAuth: auth.getAuth, signInAnonymously: auth.signInAnonymously,
//           getFirestore: fs.getFirestore, doc: fs.doc,
//           getDoc: fs.getDoc, setDoc: fs.setDoc,
//           __emulators: { auth: 'http://127.0.0.1:9099',
//                          firestore: ['127.0.0.1', 8080] },
//         };
//       };
//     (`__emulators` is advisory: connectAuthEmulator /
//     connectFirestoreEmulator must be called by the caller that builds the
//     SDK object if it wants emulator routing.)
//
// TEST HOOK: when `window.__yomikikuanFirebaseSdkLoader` is a function, the
// bridge uses it instead of the CDN imports. It exists for unit/e2e tests
// (and emulator smoke runs) only; production should leave it undefined.
//
// ─────────────────────────────────────────────────────────────────────────────
// END-TO-END FLOW
// ─────────────────────────────────────────────────────────────────────────────
//   readFirebaseConfig(win, storage)
//     → validateFirebaseConfig(config)                    [pure]
//   installFirebaseBridge({ win, loadSdk?, config? })
//     → loadSdk()/hook/CDN -> { getApps, initializeApp, getAuth,
//                              signInAnonymously, getFirestore, doc,
//                              getDoc, setDoc }
//     → getApps() || initializeApp(config)
//     → getAuth(app); auth.currentUser || signInAnonymously(auth)
//     → getFirestore(app); doc(db, ...firebaseSyncDocPath(uid))
//     → win.__yomikikuanCloudBridge = createFirebaseCloudBridge({ sdk, ref })
//   bridge.get()  → getDoc(ref); !exists → null
//                   else { payload, updatedAt: normalizeFirebaseTimestamp(…) }
//   bridge.set(p, t) → setDoc(ref, { payload: p, updatedAt: normalize(t) ?? now })
//
// All helpers in the first half of the file are pure and unit-tested; the
// installation function is async but side-effect scoped to the injected
// `win`/`loadSdk`.

// Pinned Firebase JS SDK (modular, v10). Bump deliberately — the import
// URLs below are the only version-sensitive strings in the bridge.
export const FIREBASE_SDK_VERSION = '10.14.1';

export const FIREBASE_CONFIG_STORAGE_KEY = 'yomikikuan_firebase_config';
export const FIREBASE_BRIDGE_KEY = '__yomikikuanCloudBridge';
export const FIREBASE_SDK_LOADER_HOOK_KEY = '__yomikikuanFirebaseSdkLoader';

// Only these config fields are copied into the SDK config (Firebase tolerates
// extra keys, but keeping the object tiny makes logs/tests deterministic).
export const FIREBASE_CONFIG_KEYS = Object.freeze([
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
  'measurementId',
]);

// Minimum viable web-app config: initializeApp(), Auth and Firestore all fail
// without these. storageBucket / messagingSenderId are not used by this
// adapter (backup payloads live in Firestore, not Storage).
export const REQUIRED_FIREBASE_CONFIG_FIELDS = Object.freeze([
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
]);

// `users/{uid}/sync/main` — the single sync document for Option A.
const SYNC_COLLECTION_ROOT = 'users';
const SYNC_SUBCOLLECTION = 'sync';
const SYNC_DOC_ID = 'main';

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/** The three pinned CDN module URLs (overridable for tests/future versions). */
export function firebaseSdkUrls(version = FIREBASE_SDK_VERSION) {
  const trimmed = typeof version === 'string' ? version.trim() : '';
  const pinned = trimmed || FIREBASE_SDK_VERSION;
  const base = `https://www.gstatic.com/firebasejs/${pinned}`;
  return {
    app: `${base}/firebase-app.js`,
    auth: `${base}/firebase-auth.js`,
    firestore: `${base}/firebase-firestore.js`,
  };
}

/**
 * Validate + normalise a Firebase web config.
 * Returns `{ ok:true, config }` (known fields only, trimmed) or
 * `{ ok:false, reason:'config-missing'|'config-invalid', missing? }`.
 */
export function validateFirebaseConfig(config) {
  if (config == null) return { ok: false, reason: 'config-missing' };
  if (typeof config !== 'object' || Array.isArray(config)) {
    return { ok: false, reason: 'config-invalid', missing: [...REQUIRED_FIREBASE_CONFIG_FIELDS] };
  }
  const missing = REQUIRED_FIREBASE_CONFIG_FIELDS.filter(
    (field) => typeof config[field] !== 'string' || !config[field].trim(),
  );
  if (missing.length) return { ok: false, reason: 'config-invalid', missing };
  const normalized = {};
  for (const key of FIREBASE_CONFIG_KEYS) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) normalized[key] = value.trim();
  }
  return { ok: true, config: normalized };
}

function safeLocalStorage(win) {
  try {
    const storage = win && win.localStorage;
    if (storage && typeof storage.getItem === 'function') return storage;
  } catch (_) { /* access denied (private mode / sandboxed iframe) */ }
  return null;
}

/**
 * Resolve the Firebase config, in documented precedence order:
 *   1. `win.YOMIKIKUAN_CONFIG.firebaseConfig` (config.js — authoritative),
 *   2. `localStorage['yomikikuan_firebase_config']` (JSON persisted by
 *      index.html's config sync IIFE).
 * A present-but-invalid window config is reported as `config-invalid` instead
 * of silently falling back, so a typo in config.js is visible.
 * Never throws (storage access errors degrade to "config missing").
 */
export function readFirebaseConfig(win, storage) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  let fromWindow;
  try {
    const cfg = w && w.YOMIKIKUAN_CONFIG;
    fromWindow = cfg && typeof cfg === 'object' ? cfg.firebaseConfig : undefined;
  } catch (_) {
    fromWindow = undefined;
  }
  if (fromWindow !== undefined) {
    if (fromWindow === null) return { ok: false, reason: 'config-missing' };
    return validateFirebaseConfig(fromWindow);
  }

  const st = storage && typeof storage.getItem === 'function' ? storage : safeLocalStorage(w);
  let raw = null;
  try {
    raw = st ? st.getItem(FIREBASE_CONFIG_STORAGE_KEY) : null;
  } catch (_) {
    raw = null;
  }
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'config-missing' };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return { ok: false, reason: 'config-invalid' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'config-invalid' };
  }
  return validateFirebaseConfig(parsed);
}

/**
 * Firestore document path segments for the sync doc: `users/{uid}/sync/main`.
 * Returns `null` for a missing/blank uid (the bridge cannot be built).
 */
export function firebaseSyncDocPath(uid) {
  if (typeof uid !== 'string') return null;
  const trimmed = uid.trim();
  if (!trimmed) return null;
  return [SYNC_COLLECTION_ROOT, trimmed, SYNC_SUBCOLLECTION, SYNC_DOC_ID];
}

/**
 * Normalise any timestamp-ish value to epoch ms, or `null`.
 * Accepts epoch-ms numbers, numeric strings, ISO-8601 strings, Date objects,
 * `{ toMillis() }` and `{ seconds }` (Firestore Timestamp shape).
 * Mirrors `cloud-sync/index.js normaliseTimestamp` so a bridge value always
 * feeds the conflict check in the shape it expects.
 */
export function normalizeFirebaseTimestamp(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (typeof value === 'object') {
    if (typeof value.toMillis === 'function') {
      try {
        const ms = value.toMillis();
        return Number.isFinite(ms) && ms > 0 ? ms : null;
      } catch (_) {
        return null;
      }
    }
    if (typeof value.seconds === 'number') {
      const ms = value.seconds * 1000;
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    }
  }
  return null;
}

const AUTH_ERROR_RE = /auth|credential|unauthori[sz]ed|operation-not-allowed|anonymous|api key/i;
const SDK_ERROR_RE = /import|dynamically imported|module|gstatic|sdk|initializeapp|firebase-app/i;
const FIRESTORE_ERROR_RE = /firestore|permission|denied|unavailable|failed to fetch|network|offline|timeout|not-found|not found/i;

/**
 * Decide which install-stage failure a thrown error belongs to.
 * An explicit `phase` ('sdk' | 'auth' | 'firestore') always wins; otherwise
 * the error code / message is inspected. Always returns one of the documented
 * install reasons (never throws).
 */
export function classifyFirebaseError(error, phase = '') {
  const explicit = typeof phase === 'string' ? phase.toLowerCase() : '';
  if (explicit === 'sdk' || explicit === 'sdk-load') return 'sdk-load-failed';
  if (explicit === 'auth') return 'auth-failed';
  if (explicit === 'firestore') return 'firestore-failed';
  if (error == null) return 'sdk-load-failed';
  const code = typeof error === 'object' ? String(error.code || '') : '';
  if (code.startsWith('auth/')) return 'auth-failed';
  if (code.startsWith('firestore/')
      || code === 'permission-denied'
      || code === 'unavailable'
      || code === 'not-found') {
    return 'firestore-failed';
  }
  const message = typeof error === 'string' ? error : String((error && error.message) || error);
  if (AUTH_ERROR_RE.test(message)) return 'auth-failed';
  if (SDK_ERROR_RE.test(message)) return 'sdk-load-failed';
  if (FIRESTORE_ERROR_RE.test(message)) return 'firestore-failed';
  return 'sdk-load-failed';
}

/** Short human-readable error summary for console warnings (never throws). */
function errorSummary(error) {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  try {
    return String(error.message || error.code || error);
  } catch (_) {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SDK loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default SDK loader: dynamic ESM imports from the pinned gstatic CDN.
 * Only called once a valid config exists, so an unconfigured app never
 * requests Firebase assets.
 */
export async function defaultLoadSdk(version = FIREBASE_SDK_VERSION) {
  const urls = firebaseSdkUrls(version);
  const [appModule, authModule, firestoreModule] = await Promise.all([
    import(urls.app),
    import(urls.auth),
    import(urls.firestore),
  ]);
  return {
    getApps: appModule.getApps,
    initializeApp: appModule.initializeApp,
    getAuth: authModule.getAuth,
    signInAnonymously: authModule.signInAnonymously,
    getFirestore: firestoreModule.getFirestore,
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    setDoc: firestoreModule.setDoc,
  };
}

/** The already-installed bridge on a window-like object, or `null`. */
export function getInstalledBridge(win) {
  try {
    const bridge = win && win[FIREBASE_BRIDGE_KEY];
    if (bridge && typeof bridge.get === 'function' && typeof bridge.set === 'function') return bridge;
  } catch (_) { /* unreadable window */ }
  return null;
}

/**
 * Build the documented bridge object over a Firestore document reference.
 * `getDoc` / `setDoc` failures propagate unchanged so `cloud-sync/index.js`
 * can classify them (auth / network / unknown) with its own taxonomy.
 */
export function createFirebaseCloudBridge({ sdk, ref }) {
  return {
    async get() {
      const snap = await sdk.getDoc(ref);
      if (!snap) return null;
      const exists = typeof snap.exists === 'function' ? !!snap.exists() : !!snap.exists;
      if (!exists) return null;
      const data = (typeof snap.data === 'function' ? snap.data() : null) || {};
      return {
        payload: data.payload === undefined ? null : data.payload,
        updatedAt: normalizeFirebaseTimestamp(data.updatedAt),
      };
    },
    async set(payload, updatedAt) {
      const normalized = normalizeFirebaseTimestamp(updatedAt);
      await sdk.setDoc(ref, {
        payload,
        updatedAt: normalized == null ? Date.now() : normalized,
      });
    },
  };
}

// One in-flight install per window-like object: two rapid clicks cannot
// initialize two Firebase apps / two anonymous users.
const installInflight = typeof WeakMap === 'function' ? new WeakMap() : null;

async function performInstall(win, config, loadSdkOption) {
  let loader;
  if (typeof loadSdkOption === 'function') {
    loader = loadSdkOption;
  } else {
    let hook = null;
    try {
      hook = win && win[FIREBASE_SDK_LOADER_HOOK_KEY];
    } catch (_) { hook = null; }
    loader = typeof hook === 'function' ? hook.bind(win) : defaultLoadSdk;
  }

  // 1. SDK modules ---------------------------------------------------------
  let sdk = null;
  try {
    sdk = await loader();
  } catch (error) {
    return { ok: false, reason: 'sdk-load-failed', error: errorSummary(error) };
  }
  if (!sdk || typeof sdk !== 'object') {
    return { ok: false, reason: 'sdk-load-failed', error: 'loader returned no SDK object' };
  }

  // 2. Firebase app (reuse an existing default app when present) -----------
  let app = null;
  try {
    let apps = [];
    if (typeof sdk.getApps === 'function') apps = sdk.getApps();
    if (Array.isArray(apps) && apps.length) {
      app = apps[0];
    } else {
      app = sdk.initializeApp(config);
    }
  } catch (error) {
    return { ok: false, reason: classifyFirebaseError(error, 'sdk'), error: errorSummary(error) };
  }
  if (!app) return { ok: false, reason: 'sdk-load-failed', error: 'initializeApp returned no app' };

  // 3. Auth — reuse the current user, anonymous sign-in only when absent ---
  let user = null;
  try {
    const auth = sdk.getAuth(app);
    user = (auth && auth.currentUser) || null;
    if (!user) {
      const credential = await sdk.signInAnonymously(auth);
      user = (credential && credential.user) || null;
    }
  } catch (error) {
    return { ok: false, reason: classifyFirebaseError(error, 'auth'), error: errorSummary(error) };
  }
  if (!user || typeof user.uid !== 'string' || !user.uid.trim()) {
    return { ok: false, reason: 'auth-failed', error: 'anonymous sign-in returned no user' };
  }

  // 4. Firestore document reference ---------------------------------------
  const path = firebaseSyncDocPath(user.uid);
  let ref = null;
  try {
    if (!path) throw new Error('auth user has no uid');
    const db = sdk.getFirestore(app);
    ref = sdk.doc(db, ...path);
  } catch (error) {
    return { ok: false, reason: classifyFirebaseError(error, 'firestore'), error: errorSummary(error) };
  }
  if (!ref) return { ok: false, reason: 'firestore-failed', error: 'doc() returned no reference' };

  // 5. Install ------------------------------------------------------------
  const bridge = createFirebaseCloudBridge({ sdk, ref });
  try {
    win[FIREBASE_BRIDGE_KEY] = bridge;
  } catch (_) {
    return { ok: false, reason: 'sdk-load-failed', error: 'window is not writable' };
  }
  return { ok: true, bridge, alreadyInstalled: false, uid: user.uid };
}

/**
 * Lazily install the cloud-sync Firebase bridge.
 *
 * @param {object}  [options]
 * @param {object}  [options.win]      window-like object (default: global window)
 * @param {Function} [options.loadSdk] DI SDK loader (default: test hook, then CDN)
 * @param {object}  [options.config]   explicit Firebase config (skips storage read)
 * @param {object}  [options.storage]  storage-like object for config read
 *                                     (default: `win.localStorage`) — extra DI
 *                                     seam used by tests
 * @returns {Promise<{ok:true, bridge:object, alreadyInstalled:boolean, uid?:string}
 *                 | {ok:false, reason:string, missing?:string[], error?:string}>}
 *          Never throws, never installs a partial bridge.
 */
export async function installFirebaseBridge(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const win = opts.win || (typeof window !== 'undefined' ? window : null);

  const existing = getInstalledBridge(win);
  if (existing) return { ok: true, bridge: existing, alreadyInstalled: true };

  const hasExplicitConfig = Object.prototype.hasOwnProperty.call(opts, 'config');
  const resolved = hasExplicitConfig
    ? validateFirebaseConfig(opts.config)
    : readFirebaseConfig(win, opts.storage);
  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason,
      ...(resolved.missing ? { missing: resolved.missing } : {}),
    };
  }

  const run = () => performInstall(win, resolved.config, opts.loadSdk);
  if (!win || (typeof win !== 'object' && typeof win !== 'function')) return run();

  if (installInflight) {
    const pending = installInflight.get(win);
    if (pending) return pending;
    const promise = run().finally(() => installInflight.delete(win));
    installInflight.set(win, promise);
    return promise;
  }
  return run();
}
