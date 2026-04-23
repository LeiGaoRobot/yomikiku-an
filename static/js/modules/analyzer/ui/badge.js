// Reading Analyzer — header difficulty badge (T13)
//
// Public API:
//   mountBadge(containerEl) -> { update(doc), destroy() }
//
// Renders a small pill next to the document title showing the JLPT-ish
// difficulty level (N5..N1) computed by `analyzeDocument`. Clicking the pill
// toggles a popover with the full histogram + reading time. If the level is
// `'n/a'` (non-Japanese) the badge hides itself entirely.
//
// `update(doc)`:
//   - If `doc.analysis.difficulty` is already cached on the doc, render it
//     synchronously.
//   - Otherwise schedule a background `analyzeDocument(doc)` via
//     `requestIdleCallback` (setTimeout fallback), persist the result onto
//     the doc via `documentManager.saveAllDocuments(...)`, then re-render.
//   - Idle handle is tracked so `destroy()` / a subsequent `update` can
//     cancel in-flight work.
//
// Strings go through `window.YomikikuanGetText(key, fallback)` when
// available so the i18n hand-off from T17 lands cleanly without rewiring.

function t(key, fallback) {
  if (typeof window !== 'undefined' && typeof window.YomikikuanGetText === 'function') {
    try {
      const v = window.YomikikuanGetText(key, fallback);
      if (typeof v === 'string' && v.length > 0) return v;
    } catch (_) { /* fall through */ }
  }
  return fallback;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function cancelIdle(handle) {
  if (handle == null) return;
  if (typeof window.cancelIdleCallback === 'function') {
    try { window.cancelIdleCallback(handle); return; } catch (_) {}
  }
  try { clearTimeout(handle); } catch (_) {}
}

function scheduleIdle(cb) {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(cb, { timeout: 2000 });
  }
  return setTimeout(cb, 300);
}

function persistDocs() {
  try {
    const dm = window.documentManager;
    if (!dm || typeof dm.saveAllDocuments !== 'function') return;
    const docs = typeof dm.getAllDocuments === 'function' ? dm.getAllDocuments() : null;
    if (Array.isArray(docs)) dm.saveAllDocuments(docs);
  } catch (err) {
    console.warn('[analyzer/badge] persist failed', err);
  }
}

export function mountBadge(containerEl) {
  if (!containerEl) throw new Error('mountBadge: containerEl required');

  let destroyed = false;
  let idleHandle = null;
  let currentDoc = null;
  let popover = null;

  const pill = el('button', 'ap-diff-badge');
  pill.type = 'button';
  pill.setAttribute('aria-haspopup', 'dialog');
  pill.setAttribute('aria-expanded', 'false');
  pill.setAttribute('aria-label', t('analyzer.badge.detail', 'Reading difficulty'));
  pill.style.display = 'none';
  containerEl.appendChild(pill);

  function closePopover() {
    if (!popover) return;
    try { popover.remove(); } catch (_) {}
    popover = null;
    pill.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onDocKey, true);
  }

  function onDocDown(ev) {
    if (!popover) return;
    if (popover.contains(ev.target) || pill.contains(ev.target)) return;
    closePopover();
  }
  function onDocKey(ev) {
    if (ev.key === 'Escape') closePopover();
  }

  function fmt(n) {
    return (typeof n === 'number' && Number.isFinite(n)) ? String(n) : '0';
  }

  function buildPopover(diff) {
    const pop = el('div', 'ap-diff-badge__popover');
    pop.setAttribute('role', 'dialog');
    pop.appendChild(el('div', 'ap-diff-badge__popover-title', t('analyzer.badge.detail', 'Reading difficulty')));

    const level = String(diff.level || 'n/a').toUpperCase();
    const head = el('div', 'ap-diff-badge__popover-level');
    head.appendChild(el('span', `ap-diff-badge__chip ap-diff-badge--${diff.level || 'na'}`, level));
    pop.appendChild(head);

    // Vocab histogram
    if (diff.vocab) {
      const row = el('div', 'ap-diff-badge__row');
      row.appendChild(el('div', 'ap-diff-badge__row-label', t('analyzer.badge.vocab', 'Vocabulary')));
      const bars = el('div', 'ap-diff-badge__bars');
      ['N5', 'N4', 'N3', 'N2', 'N1'].forEach((k) => {
        const cell = el('span', `ap-diff-badge__bar ap-diff-badge__bar--${k.toLowerCase()}`);
        cell.textContent = `${k} ${fmt(diff.vocab[k])}`;
        bars.appendChild(cell);
      });
      row.appendChild(bars);
      pop.appendChild(row);
    }

    // Kanji histogram
    if (diff.kanjiHistogram) {
      const row = el('div', 'ap-diff-badge__row');
      row.appendChild(el('div', 'ap-diff-badge__row-label', t('analyzer.badge.kanji', 'Kanji')));
      const bars = el('div', 'ap-diff-badge__bars');
      ['N5', 'N4', 'N3', 'N2', 'N1'].forEach((k) => {
        const cell = el('span', `ap-diff-badge__bar ap-diff-badge__bar--${k.toLowerCase()}`);
        cell.textContent = `${k} ${fmt(diff.kanjiHistogram[k])}`;
        bars.appendChild(cell);
      });
      row.appendChild(bars);
      pop.appendChild(row);
    }

    // Avg sentence length + reading time
    const meta = el('div', 'ap-diff-badge__meta');
    const sentenceLabel = t('analyzer.badge.avgSentence', 'Avg sentence');
    const timeLabel = t('analyzer.badge.readingTime', 'Reading time');
    const minUnit = t('analyzer.badge.min', 'min');
    const charUnit = t('analyzer.badge.chars', 'chars');
    meta.appendChild(el('div', null, `${sentenceLabel}: ${fmt(diff.avgSentenceLen)} ${charUnit}`));
    meta.appendChild(el('div', null, `${timeLabel}: ${fmt(diff.readingTimeMin)} ${minUnit}`));
    pop.appendChild(meta);

    return pop;
  }

  function openPopover() {
    if (popover) { closePopover(); return; }
    const diff = currentDoc && currentDoc.analysis && currentDoc.analysis.difficulty;
    if (!diff) return;
    popover = buildPopover(diff);
    // Popover positions itself via CSS (`position: absolute; top: 100%`) —
    // the pill is `position: relative` so this anchors under it.
    pill.appendChild(popover);
    pill.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      if (popover) popover.classList.add('ap-diff-badge__popover--open');
    });
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onDocKey, true);
  }

  pill.addEventListener('click', (ev) => {
    ev.stopPropagation();
    openPopover();
  });

  function render() {
    if (destroyed) return;
    closePopover();
    const diff = currentDoc && currentDoc.analysis && currentDoc.analysis.difficulty;
    // Reset level classes.
    pill.className = 'ap-diff-badge';
    if (!diff || diff.level === 'n/a') {
      pill.style.display = 'none';
      pill.textContent = '';
      return;
    }
    pill.style.display = '';
    pill.classList.add(`ap-diff-badge--${diff.level}`);
    pill.textContent = String(diff.level).toUpperCase();
    pill.title = t('analyzer.badge.detail', 'Reading difficulty');
  }

  function scheduleCompute(doc) {
    if (idleHandle != null) { cancelIdle(idleHandle); idleHandle = null; }
    idleHandle = scheduleIdle(async () => {
      idleHandle = null;
      if (destroyed) return;
      // Doc might have changed between scheduling and running.
      if (currentDoc !== doc) return;
      try {
        const analyzer = window.YomikikuanAnalyzer;
        if (!analyzer || typeof analyzer.analyzeDocument !== 'function') return;
        const result = await analyzer.analyzeDocument(doc);
        if (destroyed) return;
        if (currentDoc !== doc) return;
        if (!result || !result.difficulty) return;
        doc.analysis = doc.analysis || {};
        doc.analysis.difficulty = result.difficulty;
        persistDocs();
        render();
      } catch (err) {
        console.warn('[analyzer/badge] analyzeDocument failed', err);
      }
    });
  }

  function update(doc) {
    if (destroyed) return;
    currentDoc = doc || null;
    // Cancel any in-flight compute from a previous doc.
    if (idleHandle != null) { cancelIdle(idleHandle); idleHandle = null; }
    if (!doc) {
      render();
      return;
    }
    const cached = doc.analysis && doc.analysis.difficulty;
    if (cached) {
      render();
      return;
    }
    // No cached analysis — hide pill while scheduling background compute.
    pill.style.display = 'none';
    pill.textContent = '';
    scheduleCompute(doc);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    closePopover();
    if (idleHandle != null) { cancelIdle(idleHandle); idleHandle = null; }
    try { pill.remove(); } catch (_) {}
    currentDoc = null;
  }

  return { update, destroy };
}

export default mountBadge;

// --- Wire-and-refresh glue (extracted from main-js.js, #13 chunk 4) -------
//
// Encapsulates the one-time mount + repeated refresh lifecycle of the
// header difficulty badge. wireAndRefresh() is idempotent: first call
// mounts the instance (if #diffBadgeMount exists), subsequent calls just
// refresh the active doc.
//
// Also self-registers window.__yomikikuanRefreshDifficultyBadge so
// classic-script callers (e.g. documentManager.loadActiveDocument) can
// request a refresh without touching module internals.

let _instance = null;

export function wireAndRefresh() {
  const mount = document.getElementById('diffBadgeMount');
  if (!mount) return;
  if (!_instance) {
    try { _instance = mountBadge(mount); }
    catch (err) { console.warn('[analyzer] mountBadge failed', err); return; }
  }
  try {
    const dm = (typeof window !== 'undefined') ? window.documentManager : null;
    if (!dm || typeof dm.getAllDocuments !== 'function') { _instance.update(null); return; }
    const activeId = typeof dm.getActiveId === 'function' ? dm.getActiveId() : null;
    const doc = dm.getAllDocuments().find((d) => d && d.id === activeId);
    _instance.update(doc || null);
  } catch (err) {
    console.warn('[analyzer] refreshDifficultyBadge failed', err);
  }
}

if (typeof window !== 'undefined') {
  window.__yomikikuanRefreshDifficultyBadge = wireAndRefresh;
}
