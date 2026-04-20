// player/state — ESM facade over the player state that lives as IIFE-scope
// `let` vars in static/main-js.js (lines ~2120-2144) and is mirrored onto
// window.* so tts.js and future ESM modules can share it.
//
// Canonical named-import surface:
//   import { getRate, setRate, isPlaying, getPlayState } from '../player/state.js';
// Reads/writes all go through window.*, so legacy and ESM stay in sync.

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// ---- rate ----
export function getRate() {
  const n = Number(window.rate);
  return Number.isFinite(n) ? n : 1;
}
export function setRate(v) {
  const n = clamp(Number(v) || 1, 0.25, 4);
  window.rate = n;
  return n;
}

// ---- volume ----
export function getVolume() {
  const n = Number(window.volume);
  return Number.isFinite(n) ? clamp(n, 0, 1) : 1;
}
export function setVolume(v) {
  const n = clamp(Number(v) || 0, 0, 1);
  window.volume = n;
  return n;
}

// ---- voices ----
export function getVoices() {
  return Array.isArray(window.voices) ? window.voices : [];
}
export function getCurrentVoice() {
  return window.currentVoice || null;
}
export function setCurrentVoice(v) {
  window.currentVoice = v || null;
  return window.currentVoice;
}

// ---- playback flags ----
export function isPlaying() { return !!window.isPlaying; }
export function isPaused()  { return !!window.isPaused; }

// ---- utterance / segments ----
export function getCurrentUtterance()      { return window.currentUtterance      || null; }
export function getCurrentPlayingText()    { return window.currentPlayingText    || ''; }
export function getCurrentSegments()       { return window.currentSegments       || null; }
export function getCurrentSegmentIndex()   { return window.currentSegmentIndex   || 0; }
export function getCurrentSegmentText()    { return window.currentSegmentText    || ''; }
export function getLastBoundaryCharIndex() { return window.lastBoundaryCharIndex || 0; }
export function getSegmentStartTs()        { return window.segmentStartTs        || 0; }

// ---- aggregate progress state ----
export function getPlayState() {
  return window.PLAY_STATE
      || { totalSegments: 0, totalChars: 0, charPrefix: [], current: 0 };
}

// ---- read-only snapshot (debugging / telemetry) ----
export function snapshot() {
  const cv = getCurrentVoice();
  return {
    rate:                getRate(),
    volume:              getVolume(),
    voicesCount:         getVoices().length,
    currentVoiceName:    cv ? cv.name : null,
    isPlaying:           isPlaying(),
    isPaused:            isPaused(),
    currentSegmentIndex: getCurrentSegmentIndex(),
    currentSegmentText:  getCurrentSegmentText(),
    playState:           getPlayState(),
  };
}

// Debug helper — reachable from DevTools.
if (typeof window !== 'undefined') {
  window.__playerStateSnapshot = snapshot;
}
