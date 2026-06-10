// PCM ↔ WAV utilities — extracted from static/js/tts.js (Phase 1 parallel).
//
// All three functions are pure: byte-in / blob-or-bytes-out. Used by the
// Gemini TTS path to wrap raw PCM16 mono samples into a playable WAV blob.
//
// NOTE: tts.js still keeps its in-file copies as the authoritative path
// per the playback-boundary discipline in CLAUDE.md. This module exists
// for future modules + dedicated unit tests; a Phase-2 dedup that swaps
// tts.js to delegate is a separate, deliberate operation.

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Parse "rate=24000" out of an audio/L16 mime-type string. Defaults to 24000
// if no `rate=` clause is present. Used to reconstruct the WAV header from
// Gemini's response Content-Type.
export function parseSampleRate(mime) {
  let rate = 24000;
  const m = /rate=(\d+)/i.exec(mime || '');
  if (m) rate = parseInt(m[1], 10) || 24000;
  return rate;
}

// Wrap raw 16-bit PCM samples (mono) in a minimal WAV container so the
// browser <audio> element will accept them.
//
// Header layout: 44 bytes
//   0   "RIFF"
//   4   uint32 LE  total file size - 8
//   8   "WAVE"
//   12  "fmt "
//   16  uint32 LE  16 (PCM chunk size)
//   20  uint16 LE  1 (PCM format)
//   22  uint16 LE  1 (mono)
//   24  uint32 LE  sampleRate
//   28  uint32 LE  byteRate (sampleRate * 2)
//   32  uint16 LE  block align (2)
//   34  uint16 LE  bits per sample (16)
//   36  "data"
//   40  uint32 LE  PCM byte length
//   44  PCM samples
export function pcm16ToWav(pcmBytes, sampleRate) {
  const dataLen = pcmBytes.byteLength;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);
  new Uint8Array(buffer, 44).set(pcmBytes);
  return new Blob([buffer], { type: 'audio/wav' });
}

if (typeof window !== 'undefined') {
  window.YomikikuanWav = { base64ToBytes, pcm16ToWav, parseSampleRate };
}
