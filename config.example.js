// ============================================================================
//  YomiKiku-an local config — template
// ----------------------------------------------------------------------------
//  HOW TO USE
//    1. cp config.example.js config.js
//    2. Edit config.js and fill in your values below.
//    3. config.js is gitignored, so your keys never leave your machine.
//
//  WHAT THIS FILE DOES
//    index.html loads config.js BEFORE main-js.js. A tiny inline IIFE right
//    after the <script src="config.js"> tag copies any non-empty values
//    from window.YOMIKIKUAN_CONFIG into localStorage, using the same keys
//    the rest of the app already reads from:
//        geminiApiKey  -> localStorage['yomikikuan_gemini_api_key']
//        geminiStyle   -> localStorage['yomikikuan_gemini_style']
//    After that, all consumers (tts.js, analyzer providers, jlptPanel.js)
//    just read localStorage as usual. No other code changes needed.
//
//  PRECEDENCE
//    config.js is authoritative when values are non-empty: it runs on every
//    page load and overwrites whatever was in localStorage. If you change
//    the key via the Settings UI, that change is lost on the next reload
//    (config.js wins). Clear or blank the field here to let the UI win.
//
//  SECURITY — READ THIS
//    This is a pure client-side static site. ANY file served to the browser
//    can be fetched by anyone who can reach the server. Using config.js is
//    only safe for:
//        - LOCAL DEVELOPMENT on your own machine (e.g. `npm start`)
//        - SINGLE-USER self-hosted deploys behind auth (VPN, HTTP basic,
//          Tailscale, etc.)
//    It is NOT safe for public deploys. The only truly safe pattern for
//    a public deploy is a server-side proxy that holds the key server-
//    side and forwards requests — but that requires running server code,
//    which contradicts this project's zero-build principle (see CLAUDE.md).
// ============================================================================

window.YOMIKIKUAN_CONFIG = {
  // Gemini API key — https://aistudio.google.com/apikey
  // Used by: analyzer/providers/gemini.js, analyzer/ui/jlptPanel.js, tts.js
  geminiApiKey: '',

  // Optional Gemini TTS style prompt. The string (if non-empty) is prepended
  // as `${style}: ${text}` before each TTS request to bias the voice toward
  // a reading style. See CLAUDE.md for how this gets used.
  // Example: 'Read calmly in a newscaster voice'
  geminiStyle: '',
};
