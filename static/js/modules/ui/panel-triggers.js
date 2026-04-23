// Header panel triggers — extracted from main-js.js (#13 ESM extraction, chunk 1).
//
// Wires four toolbar buttons (JLPT, article summary, vocab/mistake book,
// bilingual toggle) to lazy-import their respective ESM panel modules on
// first click, then invoke the classic-script entry point that each panel
// self-registers under window.__yomikikuan*.
//
// Behavior is identical to the previous in-line helpers in main-js.js; this
// file only moves the code into a dedicated ESM module to keep main-js.js
// shrinking.
//
// Public surface:
//   wirePanelTriggers()     — call once after the DOM has the toolbar buttons.
//                             Idempotent (each button is flagged after wiring).

const PANEL_MODULES = {
  jlpt: {
    btnId: 'jlptBtn',
    modulePath: '/static/js/modules/analyzer/ui/jlptPanel.js',
    openFn: '__yomikikuanOpenJLPT',
    logTag: 'jlpt',
  },
  summary: {
    btnId: 'articleSummaryBtn',
    modulePath: '/static/js/modules/analyzer/ui/articleSummary.js',
    openFn: '__yomikikuanOpenArticleSummary',
    logTag: 'article-summary',
  },
  vocab: {
    btnId: 'vocabBtn',
    modulePath: '/static/js/modules/analyzer/ui/vocabPanel.js',
    openFn: '__yomikikuanOpenVocab',
    logTag: 'vocab',
    // Preload so cross-module hooks (window.__yomikikuanAddVocab /
    // __yomikikuanAddMistake) are callable before the user opens the panel.
    preload: true,
  },
  bilingual: {
    btnId: 'bilingualToggle',
    modulePath: '/static/js/modules/analyzer/ui/bilingual.js',
    openFn: '__yomikikuanToggleBilingual',
    logTag: 'bilingual',
    // Auto-load if persisted state says bilingual mode was on.
    autoLoadIf: () => {
      try { return localStorage.getItem('yomikikuan_bilingual_mode') === 'true'; }
      catch (_) { return false; }
    },
  },
};

function wireOne(def) {
  const btn = document.getElementById(def.btnId);
  if (!btn || btn.__yomikikuanWired) return;
  btn.__yomikikuanWired = true;

  let loaded = false;
  btn.addEventListener('click', async () => {
    try {
      if (!loaded) {
        await import(/* @vite-ignore */ def.modulePath);
        loaded = true;
      }
      const fn = window[def.openFn];
      if (typeof fn === 'function') fn();
    } catch (err) {
      console.warn(`[${def.logTag}] panel import failed`, err);
    }
  });

  // Side-effect auto-loads (preload for vocab; persisted-on for bilingual).
  const shouldEager = def.preload || (typeof def.autoLoadIf === 'function' && def.autoLoadIf());
  if (shouldEager) {
    try {
      import(/* @vite-ignore */ def.modulePath)
        .then(() => { loaded = true; })
        .catch(() => {});
    } catch (_) {}
  }
}

export function wirePanelTriggers() {
  for (const key of Object.keys(PANEL_MODULES)) {
    try { wireOne(PANEL_MODULES[key]); }
    catch (err) { console.warn(`[panel-triggers] ${key} wire failed`, err); }
  }
}
