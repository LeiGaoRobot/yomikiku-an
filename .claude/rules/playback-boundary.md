---
globs:
  - "static/main-js.js"
  - "static/js/tts.js"
description: >
  Hard rules for the playback pipeline. Violating these has historically caused
  silent regressions (mirror exports racing the IIFE, audio element life-cycle
  leaks, infinite SW reload loops). Treated as load-bearing — do not relax
  without an ADR.
---

# Playback boundary — load-bearing rules

This is the only red line in the codebase. The reading/listening pipeline
spans two classic scripts (`static/main-js.js` + `static/js/tts.js`) plus the
`window.speechSynthesis` shim. The boundary between them is intentional and
fragile. Most other extractions in this project are safe; this one is not.

Authoritative narrative: see `CLAUDE.md` → "Playback pipeline boundary
(load-bearing)" and "Service-worker deploy contract".

## Invariants (must hold)

1. **State machine stays in `main-js.js` IIFE locals.**
   `playSegments`, `speakWithPauses`, `playAllText`, `stopSpeaking`,
   `setHeaderProgress`, `updatePlayButtonStates`, `currentSegments`,
   `currentSegmentIndex`, `currentUtterance`, `PLAY_STATE`, `isPlaying` —
   none of these may be mirrored onto `window.*`. They are local on purpose.

2. **`tts.js` scope is fixed.** Engine selection, voice listing,
   `geminiSynth`, the Gemini-TTS settings-panel injection, and the
   `window.speechSynthesis` shim — and nothing else. Don't push playback
   orchestration down into `tts.js`.

3. **Only one approved cross-file hook into the audio element:**
   `__applyLiveRate(r)` (mutates `Engine.audio.playbackRate`). New hooks
   into the `Audio` element from outside `tts.js` are forbidden — extend the
   shim or add a new `__yomikikuan*` accessor with an explicit comment
   explaining the boundary crossing.

4. **Safety filter auto-skip must keep working.**
   `splitTextByPunctuation` filters segments with no `[\p{L}\p{N}]`
   (`modules/player/segment.js`). `playSegments.onerror` matches
   `PROHIBITED_CONTENT|SAFETY|no audio in response` and advances rather
   than aborting. The Gemini shim suppresses the red toast for these.
   Don't rip any of these three layers out — they cooperate.

5. **Service-worker contract is part of this boundary.**
   - Do **not** call `self.skipWaiting()` in `install`. The page posts
     `{ type: 'SKIP_WAITING' }` after the user clicks the update toast.
   - **Every commit that changes any cached asset MUST bump
     `CACHE_VERSION` in `service-worker.js`.** The `pre-commit` hook warns
     when this is missed; do not bypass it without checking.
   - `/config.js` stays `networkFirst`. Navigation stays `networkFirst`
     with cached `index.html` fallback. Other same-origin stays
     `cacheFirst`.

## Extraction rules

When extracting helpers used by the playback path:

- **Phase-1 lands a parallel module + tests** (no behaviour change in
  `main-js.js`). Module is pure / DOM-only — no `window.speechSynthesis`,
  no audio element references.
- **Phase-2 dedup must keep an inline fallback** for boot-race safety —
  the classic-script call site has to work even if the ESM module hasn't
  finished loading yet. Pattern:
  `const fn = window.YomikikuanXxx?.fn ?? inlineFallback;`
- Cross-reference `ROADMAP.md` "Do-not-touch boundaries" before touching
  anything in this file's globs.

## Anti-patterns (do not do)

- ❌ `window.playAllText = playAllText;` (or any of the listed locals).
  Existed once, silently broke playback state. Removed deliberately.
- ❌ Calling `self.skipWaiting()` inside the SW `install` event.
- ❌ Shipping a cached-asset change without bumping `CACHE_VERSION`.
- ❌ Reading/writing the `Audio` element from outside `tts.js` via
  anything other than `__applyLiveRate`.
- ❌ Aborting playback on a `PROHIBITED_CONTENT` / `SAFETY` /
  `no audio in response` error instead of advancing.
- ❌ Moving voice listing or `geminiSynth` into `main-js.js` — keeps the
  classic-script load order working.
- ❌ Removing `splitTextByPunctuation`'s `[\p{L}\p{N}]` filter.

## When in doubt

Open `ROADMAP.md` and pick a non-playback extraction instead. The
`main-js.js → 5000 lines` goal has plenty of safe surface area left.
