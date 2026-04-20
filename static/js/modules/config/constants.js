// config/constants — single source of truth for runtime constants.
// Mirrors the IIFE-scope constants in static/main-js.js so future ESM
// modules can `import { THEME, LIGHT_THEMES, LS } from '../config/constants.js'`.
// Also writes to window.FUDOKI_CONST for classic-script access.

export const THEME = Object.freeze({
  PAPER:  'paper',
  SAKURA: 'sakura',
  STICKY: 'sticky',
  GREEN:  'green',
  BLUE:   'blue',
  DARK:   'dark',
  AUTO:   'auto',
});

export const LIGHT_THEMES = Object.freeze([
  THEME.PAPER,
  THEME.SAKURA,
  THEME.STICKY,
  THEME.GREEN,
  THEME.BLUE,
]);

// localStorage key-name map (values are the key strings, not the stored data).
// Identical to main-js.js:80-103.
export const LS = Object.freeze({
  text:           'text',
  voiceURI:       'voiceURI',
  rate:           'rate',
  volume:         'volume',
  texts:          'texts',
  activeId:       'activeId',
  activeFolder:   'activeFolder',
  sortAsc:        'sortAsc',
  twoPane:        'twoPane',
  showKana:       'showKana',
  showRomaji:     'showRomaji',
  showPos:        'showPos',
  showDetails:    'showDetails',
  autoRead:       'autoRead',
  repeatPlay:     'repeatPlay',
  lang:           'lang',
  theme:          'theme',
  lightTheme:     'lightTheme',
  showUnderline:  'showUnderline',
  readingScript:  'readingScript',
  haAsWa:         'haAsWa',
  tokenAlignLeft: 'tokenAlignLeft',
});

// Expose a merged namespace to classic scripts that can't yet import ESM.
if (typeof window !== 'undefined') {
  window.FUDOKI_CONST = Object.freeze({ THEME, LIGHT_THEMES, LS });
}
