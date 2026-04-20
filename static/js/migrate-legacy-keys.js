// One-time migration: rename legacy `fudoki_*` storage keys to `yomikikuan_*`.
// Runs on every page load; idempotent — no-op once old keys are gone.
(function () {
  'use strict';
  var LS_MAP = {
    'fudoki_user': 'yomikikuan_user',
    'fudoki_texts': 'yomikikuan_texts',
    'fudoki_activeId': 'yomikikuan_activeId',
    'fudoki_theme': 'yomikikuan_theme',
    'fudoki_lang': 'yomikikuan_lang',
    'fudoki_fontSize': 'yomikikuan_fontSize',
    'fudoki_gemini_api_key': 'yomikikuan_gemini_api_key',
    'fudoki_gemini_style': 'yomikikuan_gemini_style',
    'fudoki_tts_engine': 'yomikikuan_tts_engine'
  };
  var SS_MAP = {
    'fudoki_logging_out': 'yomikikuan_logging_out'
  };
  try {
    Object.keys(LS_MAP).forEach(function (oldK) {
      var newK = LS_MAP[oldK];
      var v = localStorage.getItem(oldK);
      if (v === null) return;
      if (localStorage.getItem(newK) === null) localStorage.setItem(newK, v);
      localStorage.removeItem(oldK);
    });
  } catch (_) {}
  try {
    Object.keys(SS_MAP).forEach(function (oldK) {
      var newK = SS_MAP[oldK];
      var v = sessionStorage.getItem(oldK);
      if (v === null) return;
      if (sessionStorage.getItem(newK) === null) sessionStorage.setItem(newK, v);
      sessionStorage.removeItem(oldK);
    });
  } catch (_) {}
})();
