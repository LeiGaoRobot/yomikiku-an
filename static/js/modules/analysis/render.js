// analysis/render — ESM facade for the Japanese analysis + interaction surface.
// Canonical implementations still live in static/main-js.js:
//   analyzeText          (main-js.js:3961)
//   highlightToken       (main-js.js:3764)
//   clearTokenHighlight  (main-js.js:3808)
//   displayResults       (main-js.js:4024)
//   playLine             (main-js.js:4750)
//   playToken            (main-js.js:4348)
//   toggleTokenDetails   (main-js.js:4422)
//
// This file is a stable named-export surface. When analysis migrates to
// native ESM, only this file changes — callers stay put.

import * as events from '../player/events.js';

function callWindow(fnName, ...args) {
  const fn = (typeof window !== 'undefined') ? window[fnName] : null;
  if (typeof fn !== 'function') {
    console.warn(`analysis/render: window.${fnName} is not ready yet`);
    return undefined;
  }
  return fn.apply(null, args);
}

// ---- Entry points (facades) ----
export async function analyzeText() {
  return await callWindow('analyzeText');
}
export function playLine(lineIndex) {
  return callWindow('playLine', lineIndex);
}
export function playToken(text, event, tokenData) {
  return callWindow('playToken', text, event, tokenData);
}
export function toggleTokenDetails(element) {
  return callWindow('toggleTokenDetails', element);
}

// ---- Token highlight helpers — also emit on the bus for subscribers ----
export function highlightToken(surface, targetElement = null, opts = {}) {
  events.emit('token:highlight', { surface, element: targetElement });
  return callWindow('highlightToken', surface, targetElement, opts);
}
export function clearTokenHighlight() {
  events.emit('token:clear', {});
  return callWindow('clearTokenHighlight');
}

// ---- State helpers ----
export function hasAnalysis() {
  try {
    const content = document.getElementById('content');
    if (!content) return false;
    return !!content.querySelector('.token-pill, .analysis-section, .line-container');
  } catch (_) { return false; }
}

// Pure facade — no bootstrap, no side effects beyond the two event emits above.
