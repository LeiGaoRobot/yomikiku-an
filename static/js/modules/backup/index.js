// Backup / restore — extracted from main-js.js (#13 ESM chunk 3).
//
// The pre-existing code had two near-identical copies of collectBackupPayload
// and applyBackup in main-js.js (different settings-key enumeration strategy,
// same payload shape). This module consolidates them behind a dependency-
// injection API so each call site can supply its own settings-key strategy
// without duplicating the payload-building / SRS dump logic.
//
// Public surface:
//   collectBackupPayload({ getDocuments, getActiveId, getSettings })
//     -> Promise<{ app, version: 3, createdAt: ISO8601, data: {…, srs} }>
//   applyBackup(payload, { LS, afterApply?, onSrsRestored? })
//     -> Promise<void>
//
// Schema v3 adds `data.srs = { vocab, mistakes }`. Older v2 backups without
// this field import fine — the SRS restore path is skipped silently.

const BACKUP_SCHEMA_VERSION = 3;

function safeCall(fn, fallback) {
  try { return typeof fn === 'function' ? fn() : fallback; }
  catch (_) { return fallback; }
}

export async function collectBackupPayload(ctx = {}) {
  const rawDocs = safeCall(ctx.getDocuments, []);
  const documents = Array.isArray(rawDocs) ? rawDocs : [];
  const rawActive = safeCall(ctx.getActiveId, '');
  const activeId = typeof rawActive === 'string' ? rawActive : '';
  const rawSettings = safeCall(ctx.getSettings, {});
  const settings = (rawSettings && typeof rawSettings === 'object') ? rawSettings : {};

  let srs = { vocab: [], mistakes: [] };
  if (typeof window.__yomikikuanDumpSrs === 'function') {
    try { srs = await window.__yomikikuanDumpSrs(); }
    catch (e) { console.warn('[backup] dumpSrs failed', e); }
  }

  return {
    app: 'YomiKiku-an',
    version: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    data: { documents, activeId, settings, srs },
  };
}

export async function applyBackup(payload, ctx = {}) {
  if (!payload || !payload.data) throw new Error('invalid');

  const docs = Array.isArray(payload.data.documents) ? payload.data.documents : [];
  const activeId = typeof payload.data.activeId === 'string' ? payload.data.activeId : '';
  const settings = (payload.data.settings && typeof payload.data.settings === 'object') ? payload.data.settings : {};

  const LS = ctx.LS || {};
  const textsKey  = LS.texts    || 'yomikikuan_texts';
  const activeKey = LS.activeId || 'yomikikuan_activeId';

  try { localStorage.setItem(textsKey, JSON.stringify(docs)); } catch (_) {}
  try { localStorage.setItem(activeKey, activeId); } catch (_) {}
  Object.keys(settings).forEach((k) => {
    if (!k || typeof settings[k] === 'undefined') return;
    try { localStorage.setItem(k, settings[k]); } catch (_) {}
  });

  // Schema v3: merge-restore SRS data if present. Silent no-op on older v2
  // backups — we never wipe existing vocab/mistakes.
  try {
    const srs = payload.data.srs;
    if (srs && typeof window.__yomikikuanRestoreSrs === 'function') {
      const res = await window.__yomikikuanRestoreSrs(srs);
      if (typeof ctx.onSrsRestored === 'function') {
        try { ctx.onSrsRestored(res); } catch (_) {}
      }
    }
  } catch (e) { console.warn('[backup] restoreSrs failed', e); }

  // Caller-supplied post-restore side effects (render documents, apply
  // theme/lang, re-run i18n). Kept as a callback so we don't hard-code
  // which main-js.js helpers to call from here.
  if (typeof ctx.afterApply === 'function') {
    try { await ctx.afterApply({ docs, activeId, settings }); }
    catch (e) { console.warn('[backup] afterApply callback failed', e); }
  }
}
