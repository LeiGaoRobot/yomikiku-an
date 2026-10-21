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
//        bootAnalysisMode -> localStorage['yomikikuan_boot_analysis']
//        firebaseConfig -> localStorage['yomikikuan_firebase_config'] (JSON)
//    After that, all consumers (tts.js, analyzer providers, jlptPanel.js,
//    modules/cloud-sync/firebase.js) just read localStorage as usual. No
//    other code changes needed.
//
//  CLOUD SYNC (Firebase — Option A) — see the firebaseConfig field below.
//    • Firebase web config is NOT a secret (it ships in every client), but it
//      enables writes to your Firestore project. ALWAYS deploy scoped
//      security rules; never leave the database in test mode on a public host.
//    • Requirements: Authentication → Anonymous sign-in enabled, a Firestore
//      database, and rules scoping users/{uid}/sync/* to request.auth.uid.
//    • The app touches only users/{uid}/sync/main = { payload, updatedAt }.
//    • The Firebase JS SDK is loaded lazily from www.gstatic.com (pinned
//      version in modules/cloud-sync/firebase.js) only when a config exists.
//    • Anonymous auth is per-browser: clearing site data makes the previous
//      cloud copy unreachable (new uid). Fine for single-device use; account
//      linking is out of scope for Option A.
//    • Local testing: `firebase emulators:start --only auth,firestore` and
//      supply window.__yomikikuanFirebaseSdkLoader (see firebase.js header) to
//      connect the emulators — the production loader always uses the CDN.
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

  // Boot-analysis mode (A/B switch): 'immediate' | 'idle' | 'manual'.
  //   immediate — legacy: analyze ~100ms after boot
  //   idle      — default: analyze after the load event, in an idle callback
  //   manual    — never auto-analyze; show an Analyze button in the reading pane
  // Empty string keeps the stored/local default ('idle').
  bootAnalysisMode: '',

  // ── Cloud sync (Firebase — Option A) ──────────────────────────────────────
  //
  // null = cloud sync stays disabled: Push/Pull show the graceful
  // "cloud sync is not configured" toast and nothing else happens (default,
  // no SDK is fetched).
  //
  // Set this to the web-app config from:
  //   Firebase console → Project settings → General → Your apps →
  //   SDK setup and configuration → Config.
  //
  // firebaseConfig: {
  //   apiKey: 'AIzaSy…',                                  // required
  //   authDomain: 'my-project.firebaseapp.com',           // required
  //   projectId: 'my-project',                            // required
  //   storageBucket: 'my-project.appspot.com',            // optional here
  //   messagingSenderId: '1234567890',                    // optional here
  //   appId: '1:1234567890:web:abcdef123456',             // required
  // },
  //
  // Setup checklist (details in static/js/modules/cloud-sync/firebase.js):
  //   1. Authentication → Sign-in method → enable **Anonymous**.
  //      (Existing users are reused; signInAnonymously runs only when no user.)
  //   2. Firestore Database → create it in production mode, deploy:
  //
  //        rules_version = '2';
  //        service cloud.firestore {
  //          match /databases/{database}/documents {
  //            match /users/{uid}/sync/{doc} {
  //              allow read, write: if request.auth != null
  //                                 && request.auth.uid == uid;
  //            }
  //          }
  //        }
  //
  //      This is the ONLY security boundary — the web config is public, so a
  //      public deploy MUST use scoped rules (otherwise anyone can read/write
  //      the whole database).
  //   3. Reload the app; the config is cached as
  //      localStorage['yomikikuan_firebase_config'] (JSON). config.js wins on
  //      every reload: blank this field AND remove that localStorage key to
  //      fully disable cloud sync again.
  //   4. Reload → user menu → 「クラウドへ保存」 / 「クラウドから復元」.
  //      First use needs network access to www.gstatic.com (SDK is imported
  //      lazily from the CDN, pinned in firebase.js).
  //
  // Before a PUBLIC deploy also consider Firebase App Check / usage quotas:
  // the pushed backup contains every user document.
  firebaseConfig: null,
};
