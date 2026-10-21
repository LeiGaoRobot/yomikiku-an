// Cloud sync — Option A: explicit Push / Pull + a conflict prompt.
//
// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE CONTRACT (app side — this module never talks to a backend directly)
// ─────────────────────────────────────────────────────────────────────────────
// A host page (or a future `login.html`-style Firebase adapter) may install:
//
//   window.__yomikikuanCloudBridge = {
//     async get()                   // → { payload, updatedAt } | null
//     async set(payload, updatedAt) // → void   (updatedAt = epoch ms)
//   }
//
//   • `get()` resolves `null` when nothing has been stored in the cloud yet.
//   • `payload` is a backup schema v3 object (see modules/backup/index.js).
//   • `updatedAt` is epoch milliseconds (numbers also accepted as numeric
//     strings / ISO strings / Firestore-Timestamp-like objects by
//     `normalizeTimestamp`).
//
// BRIDGE INSTALLATION — `./firebase.js` (the Firebase adapter)
// When NO bridge is present AND a Firebase config exists (config.js
// `window.YOMIKIKUAN_CONFIG.firebaseConfig`, or the JSON copy in
// localStorage `yomikikuan_firebase_config` persisted by index.html's config
// sync IIFE), push/pull lazily `import('./firebase.js')`, reuse/sign in an
// anonymous auth user and install the bridge over
// `users/{uid}/sync/main`. Nothing is fetched while unconfigured.
//
// Install failures are classified and surfaced as a specific error toast
// (`cloudSyncConfigInvalid` / `cloudSyncSdkLoadFailed` / `cloudSyncAuthFailed`
// / `cloudSyncFirestoreFailed`); when there is no config at all, or the
// specific-reason path does not apply, the legacy graceful degradation below
// still runs. A host-injected bridge always wins over the lazy install, and
// no failure ever throws. See firebase.js's module header for the real
// Firebase project setup (enable Anonymous auth + deploy Firestore rules).
//
// Wiring a real backend later requires ONLY assigning the bridge object, e.g.
// after Firebase init:
//
//   window.__yomikikuanCloudBridge = {
//     async get() {
//       const snap = await getDoc(doc(db, 'users', uid, 'sync', 'main'));
//       return snap.exists() ? snap.data() : null;
//     },
//     async set(payload, updatedAt) {
//       await setDoc(doc(db, 'users', uid, 'sync', 'main'), { payload, updatedAt });
//     },
//   };
//
// No changes are needed in this module for that.
//
// ─────────────────────────────────────────────────────────────────────────────
// SEMANTICS (fixed here + covered by index.test.html)
// ─────────────────────────────────────────────────────────────────────────────
// Meta: localStorage `yomikikuan_cloud_sync_meta` = { lastSyncedAt: epochMs }.
//   `lastSyncedAt` is the baseline used for conflict detection.
//
// Push (local → cloud), local wins:
//   1. `bridge.get()` (needed for conflict detection).
//   2. If BOTH the cloud copy and the local documents changed after
//      `lastSyncedAt` → `confirm()` prompt. **Confirm = push (local overwrites
//      cloud). Cancel = pull the cloud copy instead (cloud wins).**
//   3. `collectBackupPayload({ getDocuments, getActiveId, getSettings })`
//      (DI mirrors the user-menu backup/export wiring in main-js.js).
//   4. `bridge.set(payload, updatedAt)`; meta.lastSyncedAt = updatedAt.
//
// Pull (cloud → local), cloud wins:
//   1. `bridge.get()`; `null` → info toast "nothing in the cloud", no throw.
//   2. Same conflict test → `confirm()` prompt. **Confirm = pull (cloud
//      overwrites local). Cancel = abort and keep local.**
//   3. `applyBackup(payload, { LS: { texts: 'texts', activeId: 'activeId' },
//      afterApply })` from modules/backup/index.js. `texts` / `activeId` are
//      the live `documentManager` storage keys (main-js.js `LS` constant);
//      using the prefixed aliases would write a key the app never reads.
//   4. meta.lastSyncedAt = cloud.updatedAt (or now if the bridge omitted it).
//
// "Changed since last sync" = `updatedAt > lastSyncedAt`; when there is no
// meta yet (never synced) any non-zero timestamp counts as changed, so the
// first push/pull against an existing cloud copy prompts before overwriting.
//
// Known limitation (accepted for Option A): deleted documents only move
// `lastSyncedAt`, not the newest document `updatedAt`, so a pure deletion
// between syncs is not detected as a local change. Explicit Push is the
// escape hatch, and the prompt covers the common edit-on-both-sides case.
//
// The confirm() prompt is a native `window.confirm` (via DI, overridable).
// The E2E scenario ⑫ handles the dialog with Playwright's dialog API.
//
// Pure helpers (`normalizeTimestamp` / `readCloudMeta` / `writeCloudMeta` /
// `newestLocalUpdatedAt` / `hasChangedSince` / `evaluateConflict` /
// `classifyCloudError` / `errorMessageKey` / `isValidBridge` / `isBackupPayload`)
// are side-effect free and fully unit-tested in the sibling page.

import { collectBackupPayload, applyBackup } from '../backup/index.js';
import { t } from '../i18n/index.js';

export const CLOUD_SYNC_META_KEY = 'yomikikuan_cloud_sync_meta';
export const CLOUD_SYNC_BRIDGE_KEY = '__yomikikuanCloudBridge';

export const CLOUD_SYNC_ERRORS = Object.freeze({
  NO_BRIDGE: 'no-bridge',
  NO_CLOUD_DATA: 'no-cloud-data',
  INVALID_PAYLOAD: 'invalid-payload',
  NETWORK: 'network',
  AUTH: 'auth',
  UNKNOWN: 'unknown',
});

// Backup keys written by applyBackup. These are the LIVE document-storage keys
// used by `documentManager` (main-js.js `LS.texts = 'texts'` / `LS.activeId =
// 'activeId'`, plus index.html's `?clear=1` preserve list), NOT the
// `yomikikuan_`-prefixed aliases the backup module defaults to. Writing the
// live keys is what makes a pull show up in the document list / active editor.
const BACKUP_LS = Object.freeze({
  texts: 'texts',
  activeId: 'activeId',
});

// Settings keys mirrored from main-js.js's user-menu collectBackupPayload DI.
const BACKUP_SETTINGS_KEYS = ['yomikikuan_theme', 'yomikikuan_lang', 'yomikikuan_fontSize'];

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (no DOM / network / module state)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise any timestamp-ish value to epoch ms, or `null`.
 * Accepts epoch-ms numbers, numeric strings, ISO-8601 strings, Date objects,
 * `{ toMillis() }` and `{ seconds }` (Firestore Timestamp shape).
 */
export function normalizeTimestamp(value) {
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

/** True when the object exposes the two documented bridge methods. */
export function isValidBridge(bridge) {
  return !!bridge
    && typeof bridge === 'object'
    && typeof bridge.get === 'function'
    && typeof bridge.set === 'function';
}

/** Read the bridge from a window-like object (never throws). */
export function getBridgeFrom(win) {
  try {
    const bridge = win && win[CLOUD_SYNC_BRIDGE_KEY];
    return isValidBridge(bridge) ? bridge : null;
  } catch (_) {
    return null;
  }
}

/**
 * Read + normalise `yomikikuan_cloud_sync_meta`.
 * Always returns `{ lastSyncedAt: number|null }`; malformed JSON / storage
 * errors degrade to the empty meta instead of throwing.
 */
export function readCloudMeta(storage) {
  const empty = { lastSyncedAt: null };
  if (!storage || typeof storage.getItem !== 'function') return empty;
  let raw = null;
  try {
    raw = storage.getItem(CLOUD_SYNC_META_KEY);
  } catch (_) {
    return empty;
  }
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
    return { lastSyncedAt: normalizeTimestamp(parsed.lastSyncedAt) };
  } catch (_) {
    return empty;
  }
}

/**
 * Persist `{ lastSyncedAt }` (extra fields dropped, value normalised).
 * Returns the normalised meta that was written. Storage errors are swallowed.
 */
export function writeCloudMeta(storage, meta = {}) {
  const normalized = { lastSyncedAt: normalizeTimestamp(meta && meta.lastSyncedAt) };
  if (!storage || typeof storage.setItem !== 'function') return normalized;
  try {
    storage.setItem(CLOUD_SYNC_META_KEY, JSON.stringify(normalized));
  } catch (_) { /* private mode / quota — sync still succeeded remotely */ }
  return normalized;
}

/** Newest `updatedAt` across the backup document set (0 when there is none). */
export function newestLocalUpdatedAt(documents) {
  if (!Array.isArray(documents)) return 0;
  let newest = 0;
  for (const doc of documents) {
    if (!doc || typeof doc !== 'object') continue;
    const ts = normalizeTimestamp(doc.updatedAt) || normalizeTimestamp(doc.createdAt);
    if (ts && ts > newest) newest = ts;
  }
  return newest;
}

/**
 * `updatedAt` strictly after the last-sync baseline.
 * No baseline (never synced) → any positive timestamp counts as changed.
 */
export function hasChangedSince(updatedAt, lastSyncedAt) {
  const ts = normalizeTimestamp(updatedAt) || 0;
  const baseline = normalizeTimestamp(lastSyncedAt);
  if (baseline == null) return ts > 0;
  return ts > baseline;
}

/**
 * Conflict decision shared by push and pull.
 *
 * Conflict = a cloud copy exists AND the cloud copy changed since the last
 * sync AND the local document set changed since the last sync. `direction` is
 * echoed back only — the confirm() wording differs per direction (see the
 * module header semantics), not the boolean.
 */
export function evaluateConflict({ direction = 'push', cloud = null, localDocuments = [], meta = null } = {}) {
  const lastSyncedAt = normalizeTimestamp(meta && meta.lastSyncedAt);
  const cloudExists = !!(cloud && typeof cloud === 'object');
  const cloudUpdatedAt = cloudExists ? normalizeTimestamp(cloud.updatedAt) : null;
  const localUpdatedAt = newestLocalUpdatedAt(localDocuments);
  const cloudChanged = cloudExists && hasChangedSince(cloudUpdatedAt, lastSyncedAt);
  const localChanged = hasChangedSince(localUpdatedAt, lastSyncedAt);
  return {
    direction,
    cloudExists,
    cloudUpdatedAt,
    localUpdatedAt,
    lastSyncedAt,
    cloudChanged,
    localChanged,
    conflict: cloudExists && cloudChanged && localChanged,
  };
}

/** A payload is importable when it is a backup object with a `data` object. */
export function isBackupPayload(payload) {
  return !!payload
    && typeof payload === 'object'
    && !!payload.data
    && typeof payload.data === 'object'
    && !Array.isArray(payload.data);
}

/** Classify an unknown bridge / backup failure into a stable error code. */
export function classifyCloudError(error) {
  if (error == null) return CLOUD_SYNC_ERRORS.UNKNOWN;
  const rawCode = typeof error === 'object' ? error.code : null;
  if (typeof rawCode === 'string') {
    const known = Object.values(CLOUD_SYNC_ERRORS);
    if (known.includes(rawCode)) return rawCode;
  }
  const message = typeof error === 'string'
    ? error
    : String((error && error.message) || error);
  if (/no[-\s_]?bridge|bridge[^.]*(missing|not configured)|not configured|firebase sdk/i.test(message)) {
    return CLOUD_SYNC_ERRORS.NO_BRIDGE;
  }
  if (/auth|permission|denied|unauthori[sz]ed|credential|token|401|403/i.test(message)) {
    return CLOUD_SYNC_ERRORS.AUTH;
  }
  if (/network|fetch|offline|timeout|timed out|unreachable|ECONN|connection/i.test(message)) {
    return CLOUD_SYNC_ERRORS.NETWORK;
  }
  if (/invalid|malformed|schema|payload|corrupt/i.test(message)) {
    return CLOUD_SYNC_ERRORS.INVALID_PAYLOAD;
  }
  return CLOUD_SYNC_ERRORS.UNKNOWN;
}

// Error code → i18n key (all three language blocks carry every key).
const ERROR_MESSAGE_KEYS = Object.freeze({
  [CLOUD_SYNC_ERRORS.NO_BRIDGE]: 'cloudSyncNotConfigured',
  [CLOUD_SYNC_ERRORS.NO_CLOUD_DATA]: 'cloudSyncNoCloudData',
  [CLOUD_SYNC_ERRORS.INVALID_PAYLOAD]: 'cloudSyncInvalidPayload',
  [CLOUD_SYNC_ERRORS.NETWORK]: 'cloudSyncNetworkError',
  [CLOUD_SYNC_ERRORS.AUTH]: 'cloudSyncAuthError',
  [CLOUD_SYNC_ERRORS.UNKNOWN]: 'cloudSyncError',
});

/** i18n key for an error code (unknown codes fall back to `cloudSyncError`). */
export function errorMessageKey(code) {
  return ERROR_MESSAGE_KEYS[code] || 'cloudSyncError';
}

// ─────────────────────────────────────────────────────────────────────────────
// Lazy Firebase bridge installation (Option A — see ./firebase.js)
// ─────────────────────────────────────────────────────────────────────────────
// Only attempted when (a) no bridge is installed and (b) a Firebase config
// candidate exists. The adapter module itself is imported dynamically so an
// unconfigured app never even downloads the local adapter (and never touches
// the Firebase CDN).

// Mirrors `FIREBASE_CONFIG_STORAGE_KEY` in ./firebase.js (duplicated so this
// module can gate on the config WITHOUT importing the adapter).
export const CLOUD_SYNC_FIREBASE_CONFIG_KEY = 'yomikikuan_firebase_config';

// Firebase install reason → i18n key (all three language blocks carry every key).
const BRIDGE_INSTALL_ERROR_KEYS = Object.freeze({
  'config-invalid': 'cloudSyncConfigInvalid',
  'sdk-load-failed': 'cloudSyncSdkLoadFailed',
  'auth-failed': 'cloudSyncAuthFailed',
  'firestore-failed': 'cloudSyncFirestoreFailed',
});

/** i18n key for a firebase.js install failure reason, or `null`. */
export function bridgeInstallMessageKey(reason) {
  return BRIDGE_INSTALL_ERROR_KEYS[reason] || null;
}

let firebaseModulePromise = null;

function importFirebaseModule() {
  if (!firebaseModulePromise) {
    firebaseModulePromise = import('./firebase.js').catch((error) => {
      // Allow a later click to retry the import.
      firebaseModulePromise = null;
      throw error;
    });
  }
  return firebaseModulePromise;
}

/**
 * Cheap sync check: is there anything that *looks like* a Firebase config?
 * Precedence mirrors `readFirebaseConfig` (window config wins). An empty /
 * malformed object still counts as a candidate so the adapter can report
 * `config-invalid` instead of silently showing "not configured".
 */
export function hasFirebaseConfigCandidate(win, storage) {
  try {
    const wrapper = win && win.YOMIKIKUAN_CONFIG;
    const firebaseConfig = wrapper && typeof wrapper === 'object' ? wrapper.firebaseConfig : undefined;
    if (firebaseConfig !== undefined && firebaseConfig !== null) return true;
  } catch (_) { /* unreadable window */ }
  try {
    const raw = storage && typeof storage.getItem === 'function'
      ? storage.getItem(CLOUD_SYNC_FIREBASE_CONFIG_KEY)
      : null;
    if (typeof raw === 'string' && raw.trim()) return true;
  } catch (_) { /* storage denied */ }
  return false;
}

function classifyInstallException(error) {
  const reason = error && typeof error === 'object' ? error.reason : null;
  if (typeof reason === 'string' && bridgeInstallMessageKey(reason)) return reason;
  return 'sdk-load-failed';
}

/**
 * Resolve the bridge for an action: existing host bridge first, then a lazy
 * Firebase install when configured. Never throws.
 * @returns {Promise<{bridge: object|null, installReason: string|null}>}
 */
async function ensureCloudBridge(deps) {
  const existing = deps.getBridge();
  if (existing) return { bridge: existing, installReason: null };
  if (!hasFirebaseConfigCandidate(deps.win, deps.storage)) {
    return { bridge: null, installReason: null };
  }

  let firebase = null;
  try {
    firebase = await importFirebaseModule();
  } catch (error) {
    console.warn('[cloud-sync] could not load the Firebase adapter', error);
    return { bridge: null, installReason: 'sdk-load-failed' };
  }

  let result = null;
  try {
    const resolved = typeof firebase.readFirebaseConfig === 'function'
      ? firebase.readFirebaseConfig(deps.win, deps.storage)
      : { ok: false, reason: 'config-invalid' };
    if (!resolved || resolved.ok !== true) {
      const reason = (resolved && resolved.reason) || 'config-invalid';
      // A config that vanished between the candidate check and the read keeps
      // the legacy "not configured" toast (no half-specific message).
      return { bridge: null, installReason: reason === 'config-missing' ? null : reason };
    }
    result = await firebase.installFirebaseBridge({ win: deps.win, config: resolved.config });
  } catch (error) {
    console.warn('[cloud-sync] Firebase bridge install failed', error);
    return { bridge: null, installReason: classifyInstallException(error) };
  }

  if (result && result.ok === true && result.bridge) {
    return { bridge: result.bridge, installReason: null };
  }
  const reason = (result && result.reason) || 'sdk-load-failed';
  return { bridge: null, installReason: reason === 'config-missing' ? null : reason };
}

function failWithBridgeInstallReason(deps, reason) {
  const messageKey = bridgeInstallMessageKey(reason);
  if (!messageKey) return fail(deps, CLOUD_SYNC_ERRORS.NO_BRIDGE);
  deps.notify.error(deps.translate(messageKey));
  return { ok: false, action: null, reason };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency resolution (everything is DI so unit tests never touch a network)
// ─────────────────────────────────────────────────────────────────────────────

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

function defaultStorage(win) {
  try {
    if (win && win.localStorage) return win.localStorage;
  } catch (_) { /* access denied */ }
  return memoryStorage();
}

// Mirrors main-js.js's user-menu backup DI: skip bundled sample docs and
// locked docs from what we push to the cloud. Prefers the live documentManager
// store (`texts`), falling back to the read-only prefixed alias.
function defaultGetDocuments(win, storage) {
  let all = [];
  try {
    if (win && win.documentManager && typeof win.documentManager.getAllDocuments === 'function') {
      all = win.documentManager.getAllDocuments();
    } else {
      all = JSON.parse(
        (storage && (storage.getItem(BACKUP_LS.texts) || storage.getItem('yomikikuan_texts'))) || '[]',
      );
    }
  } catch (_) {
    all = [];
  }
  return (Array.isArray(all) ? all : []).filter((doc) => doc && doc.folder !== 'samples' && !doc.locked);
}

function defaultGetActiveId(win, storage) {
  try {
    if (win && win.documentManager && typeof win.documentManager.getActiveId === 'function') {
      return win.documentManager.getActiveId() || '';
    }
  } catch (_) { /* fall through to storage */ }
  try {
    return (storage && (storage.getItem(BACKUP_LS.activeId) || storage.getItem('yomikikuan_activeId'))) || '';
  } catch (_) {
    return '';
  }
}

function defaultGetSettings(storage) {
  const settings = {};
  for (const key of BACKUP_SETTINGS_KEYS) {
    try {
      const value = storage && storage.getItem(key);
      if (value != null) settings[key] = value;
    } catch (_) { /* ignore */ }
  }
  return settings;
}

function defaultNotifier(win, level) {
  const toastName = level === 'error'
    ? 'showErrorToast'
    : level === 'success'
      ? 'showSuccessToast'
      : 'showInfoToast';
  return function notify(message) {
    try {
      const fn = win && win[toastName];
      if (typeof fn === 'function') {
        fn(message);
        return;
      }
    } catch (_) { /* fall through to console */ }
    try {
      if (typeof console !== 'undefined') {
        if (level === 'error') console.warn('[cloud-sync]', message);
        else console.log('[cloud-sync]', message);
      }
    } catch (_) { /* nowhere left to report */ }
  };
}

function resolveNotifier(rawNotify, win) {
  const pick = (level) => {
    const custom = rawNotify && typeof rawNotify[level] === 'function' ? rawNotify[level] : null;
    if (custom) {
      return (message) => {
        try { custom(message); } catch (_) { /* a broken toast must not break sync */ }
      };
    }
    return defaultNotifier(win, level);
  };
  return { success: pick('success'), error: pick('error'), info: pick('info') };
}

/**
 * Build the full dependency object. Exported for tests / future adapters;
 * production callers normally pass nothing.
 */
export function resolveCloudSyncDeps(rawDeps = {}) {
  const win = rawDeps.win || (typeof window !== 'undefined' ? window : null);
  const storage = rawDeps.storage || defaultStorage(win);
  const ls = { ...BACKUP_LS, ...(rawDeps.ls && typeof rawDeps.ls === 'object' ? rawDeps.ls : {}) };
  return {
    win,
    storage,
    getBridge: rawDeps.getBridge || (() => getBridgeFrom(win)),
    getDocuments: rawDeps.getDocuments || (() => defaultGetDocuments(win, storage)),
    getActiveId: rawDeps.getActiveId || (() => defaultGetActiveId(win, storage)),
    getSettings: rawDeps.getSettings || (() => defaultGetSettings(storage)),
    ls,
    collectBackupPayload: rawDeps.collectBackupPayload || collectBackupPayload,
    applyBackup: rawDeps.applyBackup || applyBackup,
    confirm: rawDeps.confirm || ((message) => {
      try {
        if (win && typeof win.confirm === 'function') return !!win.confirm(message);
      } catch (_) { /* denied */ }
      return false;
    }),
    notify: resolveNotifier(rawDeps.notify, win),
    translate: rawDeps.translate || ((key) => t(key)),
    now: rawDeps.now || (() => Date.now()),
    afterApply: typeof rawDeps.afterApply === 'function' ? rawDeps.afterApply : undefined,
  };
}

function fail(deps, code, level = 'error') {
  const message = deps.translate(errorMessageKey(code));
  if (level === 'info') deps.notify.info(message);
  else deps.notify.error(message);
  return { ok: false, action: null, reason: code };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a cloud snapshot to local storage (the "pull" half, also used by
 * Push's cancel branch, i.e. cancel = cloud wins).
 * Returns `{ ok, action, reason?, conflict, updatedAt? }`; never throws.
 */
async function applyCloudSnapshot(deps, cloud, { conflict = false } = {}) {
  const payload = cloud && cloud.payload;
  if (!isBackupPayload(payload)) return fail(deps, CLOUD_SYNC_ERRORS.INVALID_PAYLOAD);
  try {
    await deps.applyBackup(payload, {
      LS: { texts: deps.ls.texts, activeId: deps.ls.activeId },
      afterApply: deps.afterApply,
    });
  } catch (error) {
    console.warn('[cloud-sync] applyBackup failed', error);
    return fail(deps, classifyCloudError(error));
  }
  const cloudUpdatedAt = normalizeTimestamp(cloud && cloud.updatedAt);
  const syncedAt = cloudUpdatedAt != null
    ? cloudUpdatedAt
    : (normalizeTimestamp(deps.now()) || Date.now());
  writeCloudMeta(deps.storage, { lastSyncedAt: syncedAt });
  deps.notify.success(deps.translate('cloudSyncPullSuccess'));
  return { ok: true, action: 'pull', conflict, updatedAt: syncedAt };
}

/**
 * Explicit Push: collect the local backup v3 payload and write it to the
 * bridge. Conflict prompt semantics: confirm = local wins (push), cancel =
 * pull the cloud copy instead.
 */
export async function pushToCloud(rawDeps = {}) {
  const deps = resolveCloudSyncDeps(rawDeps);
  const bridgeState = await ensureCloudBridge(deps);
  const bridge = bridgeState.bridge;
  if (!bridge) {
    if (bridgeState.installReason) return failWithBridgeInstallReason(deps, bridgeState.installReason);
    return fail(deps, CLOUD_SYNC_ERRORS.NO_BRIDGE);
  }

  try {
    // 1. Cloud copy + baseline — needed for the conflict decision.
    let cloud = null;
    try {
      cloud = await bridge.get();
    } catch (error) {
      console.warn('[cloud-sync] bridge.get failed during push', error);
      return fail(deps, classifyCloudError(error));
    }

    const localDocuments = deps.getDocuments();
    const meta = readCloudMeta(deps.storage);
    const decision = evaluateConflict({ direction: 'push', cloud, localDocuments, meta });

    if (decision.conflict) {
      const localWins = await deps.confirm(deps.translate('cloudSyncPushConflictConfirm'));
      if (!localWins) {
        // Cancel = cloud wins → behave like an explicit pull.
        return await applyCloudSnapshot(deps, cloud, { conflict: true });
      }
    }

    // 2. Collect the same v3 payload the user-menu export produces.
    let payload = null;
    try {
      payload = await deps.collectBackupPayload({
        getDocuments: deps.getDocuments,
        getActiveId: deps.getActiveId,
        getSettings: deps.getSettings,
      });
    } catch (error) {
      console.warn('[cloud-sync] collectBackupPayload failed', error);
      return fail(deps, classifyCloudError(error));
    }
    if (!isBackupPayload(payload)) return fail(deps, CLOUD_SYNC_ERRORS.INVALID_PAYLOAD);

    // 3. Write through the bridge.
    const updatedAt = normalizeTimestamp(deps.now()) || Date.now();
    try {
      await bridge.set(payload, updatedAt);
    } catch (error) {
      console.warn('[cloud-sync] bridge.set failed', error);
      return fail(deps, classifyCloudError(error));
    }

    writeCloudMeta(deps.storage, { lastSyncedAt: updatedAt });
    deps.notify.success(deps.translate('cloudSyncPushSuccess'));
    return { ok: true, action: 'push', conflict: decision.conflict, updatedAt };
  } catch (error) {
    // Belt-and-braces: an unexpected failure must still surface as a toast,
    // never as an unhandled rejection from a click handler.
    console.warn('[cloud-sync] push failed', error);
    return fail(deps, classifyCloudError(error));
  }
}

/**
 * Explicit Pull: read the cloud snapshot and restore it locally via
 * `applyBackup`. Conflict prompt semantics: confirm = cloud wins (pull),
 * cancel = abort and keep local.
 */
export async function pullFromCloud(rawDeps = {}) {
  const deps = resolveCloudSyncDeps(rawDeps);
  const bridgeState = await ensureCloudBridge(deps);
  const bridge = bridgeState.bridge;
  if (!bridge) {
    if (bridgeState.installReason) return failWithBridgeInstallReason(deps, bridgeState.installReason);
    return fail(deps, CLOUD_SYNC_ERRORS.NO_BRIDGE);
  }

  try {
    let cloud = null;
    try {
      cloud = await bridge.get();
    } catch (error) {
      console.warn('[cloud-sync] bridge.get failed during pull', error);
      return fail(deps, classifyCloudError(error));
    }
    if (!cloud) return fail(deps, CLOUD_SYNC_ERRORS.NO_CLOUD_DATA, 'info');

    const decision = evaluateConflict({
      direction: 'pull',
      cloud,
      localDocuments: deps.getDocuments(),
      meta: readCloudMeta(deps.storage),
    });

    if (decision.conflict) {
      const cloudWins = await deps.confirm(deps.translate('cloudSyncPullConflictConfirm'));
      if (!cloudWins) {
        deps.notify.info(deps.translate('cloudSyncPullCancelled'));
        return { ok: false, action: null, reason: 'cancelled', conflict: true };
      }
    }

    return await applyCloudSnapshot(deps, cloud, { conflict: decision.conflict });
  } catch (error) {
    console.warn('[cloud-sync] pull failed', error);
    return fail(deps, classifyCloudError(error));
  }
}
