// player/controls — ESM facade for TTS control entry points.
// Canonical implementations live in static/js/tts.js and static/main-js.js.
// Delegates all calls through window.* so legacy and ESM stay in sync.

import * as events from './events.js';
import * as state  from './state.js';

function callWindow(name, ...args) {
  const fn = (typeof window !== 'undefined') ? window[name] : null;
  if (typeof fn !== 'function') {
    console.warn(`player/controls: window.${name} is not ready yet`);
    return undefined;
  }
  return fn.apply(null, args);
}

// ---- Playback ----
export function speak(text, rateOverride) {
  return callWindow('speak', text, rateOverride);
}
export function speakWithPauses(text, rateOverride) {
  return callWindow('speakWithPauses', text, rateOverride);
}
export function playAllText() {
  return callWindow('playAllText');
}
export function stopSpeaking() {
  const result = callWindow('stopSpeaking');
  events.emit('play:end', { reason: 'stopped' });
  return result;
}

// ---- Settings pass-through ----
export function setRate(v) {
  const next = state.setRate(v);
  events.emit('rate:change', { rate: next });
  return next;
}
export function setVolume(v) {
  const next = state.setVolume(v);
  events.emit('volume:change', { volume: next });
  return next;
}

// ---- Engine / API key ----
export function getTTSEngine() {
  return (typeof window.getTTSEngine === 'function') ? window.getTTSEngine() : 'gemini';
}
export function setTTSEngine(mode) {
  callWindow('setTTSEngine', mode);
  events.emit('engine:change', { engine: getTTSEngine() });
}
export function getGeminiApiKey() {
  return (typeof window.getGeminiApiKey === 'function') ? window.getGeminiApiKey() : '';
}
export function setGeminiApiKey(key) {
  return callWindow('setGeminiApiKey', key);
}

// ---- Voice list ----
export function listVoices() {
  if (typeof window.listVoicesFiltered === 'function') {
    try { return window.listVoicesFiltered() || []; } catch (_) { return []; }
  }
  return [];
}
export function refreshVoices() {
  return callWindow('refreshVoices');
}

// No bootstrap; pure facade.
