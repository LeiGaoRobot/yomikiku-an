// YomiKiku-an ESM bootstrap
// Loads side-effect modules that re-bind window.* globals with canonical
// implementations. Classic scripts (main-js.js, tts.js, segmenter.js, …)
// run BEFORE this module; window.* overrides here take final precedence.

import './config/constants.js';
import './i18n/index.js';
import './ui/toasts.js';
import './ui/utils.js';
import './ui/dialog.js';
import './ui/pwa-toast.js';
import './settings/theme.js';
import './settings/font.js';
import './settings/display.js';
import './docs/store.js';
import './player/state.js';
import './player/events.js';
import './player/controls.js';
import './editor/reading-mode.js';
import './editor/editor-toolbar.js';
import './analysis/render.js';

// As modules migrate out of main-js.js, add their imports here.
// Each module is expected to self-register its window.* bridge on import.
