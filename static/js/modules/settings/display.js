// settings/display — checkbox & dropdown display controls
// (kana / romaji / pos / details / underline / tokenAlignLeft / autoRead /
//  repeatPlay / haAsWa / readingScript).
// Extracted from static/main-js.js:5044-5346.
// Idempotent via __ESM_DISPLAY_SETTINGS_INITED flag.

import { LS } from '../config/constants.js';

function getBool(key, defaultVal) {
  const v = localStorage.getItem(key);
  return v === null ? defaultVal : v === 'true';
}
function getScript() {
  const v = localStorage.getItem(LS.readingScript);
  return (v === 'hiragana' || v === 'katakana') ? v : 'katakana';
}

// Main + sidebar checkbox pairs managed by this module.
const PAIRS = [
  ['showKana',       'sidebarShowKana',       LS.showKana,       true],
  ['showRomaji',     'sidebarShowRomaji',     LS.showRomaji,     true],
  ['showPos',        'sidebarShowPos',        LS.showPos,        true],
  ['showDetails',    'sidebarShowDetails',    LS.showDetails,    true],
  ['showUnderline',  'sidebarShowUnderline',  LS.showUnderline,  true],
  ['tokenAlignLeft', 'sidebarTokenAlignLeft', LS.tokenAlignLeft, false],
  ['autoRead',       'sidebarAutoRead',       LS.autoRead,       false],
  ['repeatPlay',     'sidebarRepeatPlay',     LS.repeatPlay,     false],
  ['haAsWa',         'sidebarHaAsWa',         LS.haAsWa,         true],
];

function updateDisplaySettings() {
  const state = {};
  for (const [mainId, sideId] of PAIRS) {
    const a = document.getElementById(mainId);
    const b = document.getElementById(sideId);
    state[mainId] = a ? a.checked : (b ? b.checked : undefined);
  }

  let styleElement = document.getElementById('display-control-styles');
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'display-control-styles';
    document.head.appendChild(styleElement);
  }
  let css = '';
  if (!state.showKana)        css += '.display-kana { display: none !important; }\n';
  if (!state.showRomaji)      css += '.display-romaji { display: none !important; }\n';
  if (!state.showPos)         css += '.display-pos { display: none !important; }\n';
  if (!state.showDetails)     css += '.token-details { display: none !important; }\n';
  if (!state.showUnderline)   css += '.token-pill { border-bottom: none !important; }\n';
  if (state.tokenAlignLeft)   css += '.token-content { align-items: flex-start !important; }\n';
  styleElement.textContent = css;

  if (!state.showDetails) {
    try {
      document.querySelectorAll('.token-details').forEach(d => { d.style.display = 'none'; });
      document.querySelectorAll('.token-pill').forEach(p => p.classList.remove('active'));
      if (typeof window.__clearActiveTokenDetails === 'function') {
        window.__clearActiveTokenDetails();
      }
    } catch (_) {}
  }
}

function wireCheckboxPair(mainId, sideId, lsKey, defaultVal, onChangeExtra) {
  const a = document.getElementById(mainId);
  const b = document.getElementById(sideId);
  const v = getBool(lsKey, defaultVal);
  if (a) a.checked = v;
  if (b) b.checked = v;

  const sync = (src, other) => {
    localStorage.setItem(lsKey, src.checked);
    if (other) other.checked = src.checked;
    if (typeof onChangeExtra === 'function') onChangeExtra();
  };
  if (a) a.addEventListener('change', () => sync(a, b));
  if (b) b.addEventListener('change', () => sync(b, a));
}

function initDisplayControls() {
  for (const [mainId, sideId, lsKey, def] of PAIRS) {
    const triggersRerender = !['autoRead', 'repeatPlay', 'haAsWa'].includes(mainId);
    wireCheckboxPair(mainId, sideId, lsKey, def, triggersRerender ? updateDisplaySettings : null);
  }

  // Expose repeatPlay checkbox globally (player/tts.js reads it)
  try {
    const rp  = document.getElementById('repeatPlay');
    const srp = document.getElementById('sidebarRepeatPlay');
    if (rp)  window.repeatPlayCheckbox        = rp;
    if (srp) window.sidebarRepeatPlayCheckbox = srp;
  } catch (_) {}

  // Reading-script select pair
  const rsMain = document.getElementById('readingScriptSelect');
  const rsSide = document.getElementById('sidebarReadingScriptSelect');
  const initialScript = getScript();
  if (rsMain) rsMain.value = initialScript;
  if (rsSide) rsSide.value = initialScript;
  const onScript = (src, other) => {
    const val = src.value === 'hiragana' ? 'hiragana' : 'katakana';
    localStorage.setItem(LS.readingScript, val);
    if (other) other.value = val;
    if (typeof window.updateReadingScriptDisplay === 'function') {
      window.updateReadingScriptDisplay();
    }
  };
  if (rsMain) rsMain.addEventListener('change', () => onScript(rsMain, rsSide));
  if (rsSide) rsSide.addEventListener('change', () => onScript(rsSide, rsMain));

  updateDisplaySettings();
  if (typeof window.updateReadingScriptDisplay === 'function') {
    try { window.updateReadingScriptDisplay(); } catch (_) {}
  }
}

function bootstrap() {
  if (window.__ESM_DISPLAY_SETTINGS_INITED) return;
  window.__ESM_DISPLAY_SETTINGS_INITED = true;
  initDisplayControls();
}

window.__ESM_DISPLAY_SETTINGS = true;
window.initDisplayControls   = initDisplayControls;
window.updateDisplaySettings = updateDisplaySettings;

// Self-bootstrap. Modules are deferred — DOM is ready.
bootstrap();

export { initDisplayControls, updateDisplaySettings };
