// settings/theme — canonical theme preference + application.
// Extracted from static/main-js.js:2050-2168.
// Self-bootstraps on import: reads saved preference, applies to
// <html data-theme>, wires event handlers on theme selects and toggle.

import { THEME, LIGHT_THEMES, LS } from '../config/constants.js';

function normalizeThemeValue(value) {
  if (!value) return THEME.PAPER;
  if (value === 'light') return THEME.PAPER;
  if (LIGHT_THEMES.includes(value)) return value;
  if (value === THEME.DARK || value === THEME.AUTO) return value;
  return THEME.PAPER;
}

let savedThemePreference = normalizeThemeValue(localStorage.getItem(LS.theme));
let lastLightTheme = normalizeThemeValue(localStorage.getItem(LS.lightTheme));
if (!LIGHT_THEMES.includes(lastLightTheme)) lastLightTheme = THEME.PAPER;
if (!LIGHT_THEMES.includes(savedThemePreference)
    && savedThemePreference !== THEME.DARK
    && savedThemePreference !== THEME.AUTO) {
  savedThemePreference = THEME.PAPER;
}
if (!localStorage.getItem(LS.lightTheme)) {
  try { localStorage.setItem(LS.lightTheme, lastLightTheme); } catch (_) {}
}

const prefersDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function resolveTheme(pref) {
  if (pref === THEME.AUTO) {
    return prefersDarkQuery.matches
      ? THEME.DARK
      : (LIGHT_THEMES.includes(lastLightTheme) ? lastLightTheme : THEME.PAPER);
  }
  if (pref === THEME.DARK) return THEME.DARK;
  if (LIGHT_THEMES.includes(pref)) return pref;
  return THEME.PAPER;
}

function syncThemeSelects(pref) {
  const themeSelect = document.getElementById('themeSelect');
  const sidebarThemeSelect = document.getElementById('sidebarThemeSelect');
  if (themeSelect) themeSelect.value = pref;
  if (sidebarThemeSelect) sidebarThemeSelect.value = pref;
}

function labelSwitchToDark() {
  const lang = (typeof window.getCurrentLang === 'function' && window.getCurrentLang()) || 'ja';
  switch (lang) {
    case 'ja': return 'ダークモードに切り替え';
    case 'en': return 'Switch to Dark Theme';
    default:   return '切换到暗色主题';
  }
}
function labelSwitchToLight() {
  const lang = (typeof window.getCurrentLang === 'function' && window.getCurrentLang()) || 'ja';
  switch (lang) {
    case 'ja': return 'ライトモードに切り替え';
    case 'en': return 'Switch to Light Theme';
    default:   return '切换到浅色主题';
  }
}

function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  syncThemeSelects(pref);

  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    const nextTheme = resolved === THEME.DARK
      ? (LIGHT_THEMES.includes(lastLightTheme) ? lastLightTheme : THEME.PAPER)
      : THEME.DARK;
    const icon = themeToggleBtn.querySelector('.theme-icon');
    if (icon) icon.textContent = nextTheme === THEME.DARK ? '🌙' : '☀️';
    const label = nextTheme === THEME.DARK ? labelSwitchToDark() : labelSwitchToLight();
    themeToggleBtn.setAttribute('aria-label', label);
    themeToggleBtn.title = label;
  }
}

function setThemePreference(pref) {
  const normalized = normalizeThemeValue(pref);
  savedThemePreference = normalized;
  if (LIGHT_THEMES.includes(normalized)) {
    lastLightTheme = normalized;
    try { localStorage.setItem(LS.lightTheme, lastLightTheme); } catch (_) {}
  }
  try { localStorage.setItem(LS.theme, savedThemePreference); } catch (_) {}
  applyTheme(savedThemePreference);
}

function wireHandlers() {
  applyTheme(savedThemePreference);

  const themeSelect = document.getElementById('themeSelect');
  const sidebarThemeSelect = document.getElementById('sidebarThemeSelect');
  const themeToggleBtn = document.getElementById('theme-toggle');

  if (themeSelect) themeSelect.addEventListener('change', () => setThemePreference(themeSelect.value));
  if (sidebarThemeSelect) sidebarThemeSelect.addEventListener('change', () => setThemePreference(sidebarThemeSelect.value));

  prefersDarkQuery.addEventListener('change', () => {
    if (savedThemePreference === THEME.AUTO) applyTheme(savedThemePreference);
  });

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const resolved = resolveTheme(savedThemePreference);
      if (resolved === THEME.DARK) {
        const target = LIGHT_THEMES.includes(lastLightTheme) ? lastLightTheme : THEME.PAPER;
        setThemePreference(target);
      } else {
        setThemePreference(THEME.DARK);
      }
    });
  }
}

// Expose to classic scripts (main-js.js callers use window.*).
if (typeof window !== 'undefined') {
  window.applyTheme          = applyTheme;
  window.setThemePreference  = setThemePreference;
  window.syncThemeSelects    = syncThemeSelects;
  window.resolveTheme        = resolveTheme;
  window.normalizeThemeValue = normalizeThemeValue;
}

// Modules are deferred: DOM is ready by the time this runs.
wireHandlers();

export {
  THEME,
  LIGHT_THEMES,
  applyTheme,
  setThemePreference,
  syncThemeSelects,
  resolveTheme,
  normalizeThemeValue,
};
