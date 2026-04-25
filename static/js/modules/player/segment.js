// Text → playable segments — extracted from main-js.js (Phase 2).
// Splits a body of text into TTS segments at punctuation boundaries with
// per-boundary pause durations. Pure: text-in, segment-array-out. The
// playback state machine itself stays in main-js.js per CLAUDE.md, but the
// upstream segmentation is safely separable and unit-testable.
//
// Output shape: [{ text: string, pause: number /* ms */ }, ...]
//
// Whitespace-only or pure-punctuation segments are dropped: Gemini TTS
// returns PROHIBITED_CONTENT on inputs with no L/N codepoints (the safety
// classifier hits high-confidence prohibited on inputs like "、").

const HEAVY_PAUSE = 800;     // 。！？!?, '\n'
const MEDIUM_PAUSE = 400;    // 、，,;；
const LIGHT_PAUSE = 200;     // :：
const ELLIPSIS_PAUSE = 1000; // … or ...
const CHUNK_PAUSE = 260;     // fallback when no punctuation matched
const CHUNK_MAX_LEN = 60;

const HAS_SPEAKABLE = /[\p{L}\p{N}]/u;

export function splitTextByPunctuation(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  const segments = [];
  let buffer = '';

  const pushSegment = (pause) => {
    const segmentText = buffer.trim();
    if (segmentText && HAS_SPEAKABLE.test(segmentText)) {
      segments.push({ text: segmentText, pause });
    }
    buffer = '';
  };

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1] || '';
    const next2 = normalized[i + 2] || '';

    if (ch === '\n') {
      pushSegment(HEAVY_PAUSE);
      continue;
    }

    buffer += ch;

    if (ch === '…') {
      while (normalized[i + 1] === '…') {
        buffer += normalized[++i];
      }
      pushSegment(ELLIPSIS_PAUSE);
      continue;
    }

    if (ch === '.' && next === '.' && next2 === '.') {
      buffer += next + next2;
      i += 2;
      pushSegment(ELLIPSIS_PAUSE);
      continue;
    }

    if ('。！？!?？！'.includes(ch)) {
      pushSegment(HEAVY_PAUSE);
      continue;
    }

    if ('、，,;；'.includes(ch)) {
      pushSegment(MEDIUM_PAUSE);
      continue;
    }

    if (':：'.includes(ch)) {
      pushSegment(LIGHT_PAUSE);
      continue;
    }
  }

  if (buffer.trim() && HAS_SPEAKABLE.test(buffer)) {
    segments.push({ text: buffer.trim(), pause: 0 });
  }

  if (!segments.length && normalized.trim() && HAS_SPEAKABLE.test(normalized)) {
    segments.push({ text: normalized.trim(), pause: 0 });
  }

  if (!segments.length) {
    const plain = normalized.trim();
    for (let i = 0; i < plain.length; i += CHUNK_MAX_LEN) {
      const part = plain.slice(i, i + CHUNK_MAX_LEN).trim();
      // Same speakable-only filter as the main + secondary paths — without
      // this, pure-punctuation input would produce a Gemini-rejected segment.
      // (Pre-existing bug in the original main-js.js implementation.)
      if (part && HAS_SPEAKABLE.test(part)) {
        segments.push({ text: part, pause: CHUNK_PAUSE });
      }
    }
  }

  return segments;
}

if (typeof window !== 'undefined') {
  window.YomikikuanSegment = { splitTextByPunctuation };
}
