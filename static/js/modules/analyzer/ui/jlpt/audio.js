// JLPT audio controller — dual-voice, staged-replay, one-shot-lockable playback
// wrapper around window.__geminiSynth (preferred) with Web Speech fallback.
//
// Exports:
//   voiceForSpeaker(speaker)         — map A/B/narrator to distinct voices
//   speak(text, opts)                — play once; cancels any active audio
//   speakQueue(lines, opts)          — sequential playback with voice switching
//   speakStaged(lines, opts)         — fast → slow → reveal stages (immersive)
//   stopAll()                        — cancel + reset chain flag
//   lock/unlock/isLocked/resetLocks  — one-shot exam-sim locks

let activeAudio = null;
let cancelChain = false;
const oneShotLocks = new Set();

const SPEAKER_VOICE_MAP = {
  A: 'Zephyr',
  B: 'Kore',
  男: 'Zephyr',
  女: 'Kore',
  narrator: 'Puck',
  N: 'Puck',
};

function resolveHeaderVoice() {
  try {
    const sel = document.getElementById('headerVoiceSelect') || document.getElementById('voiceSelect');
    if (sel && sel.value) {
      const v = sel.value.split('—')[0].trim();
      if (/^[A-Z][a-zA-Z]+$/.test(v)) return v;
    }
  } catch (_) {}
  return null;
}

export function voiceForSpeaker(speaker, fallback) {
  const key = String(speaker || '').trim();
  if (SPEAKER_VOICE_MAP[key]) return SPEAKER_VOICE_MAP[key];
  return fallback || resolveHeaderVoice() || 'Zephyr';
}

export function stopAll() {
  cancelChain = true;
  if (activeAudio) {
    try { activeAudio.pause(); } catch (_) {}
    try { activeAudio.currentTime = 0; } catch (_) {}
    activeAudio = null;
  }
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) {}
}

export function lock(key) { if (key) oneShotLocks.add(String(key)); }
export function unlock(key) { if (key) oneShotLocks.delete(String(key)); }
export function isLocked(key) { return !!key && oneShotLocks.has(String(key)); }
export function resetLocks() { oneShotLocks.clear(); }

function playAudio(url, { rate = 1 } = {}) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.volume = 1;
    try { audio.playbackRate = Math.max(0.25, Math.min(4, Number(rate) || 1)); } catch (_) {}
    try { audio.preservesPitch = true; } catch (_) {}
    activeAudio = audio;
    audio.onended = () => { if (activeAudio === audio) activeAudio = null; resolve(); };
    audio.onerror = (e) => { if (activeAudio === audio) activeAudio = null; reject(e); };
    audio.play().catch(reject);
  });
}

async function geminiOrFallback(text, voice, rate) {
  const clean = String(text || '').trim();
  if (!clean) return;
  if (typeof window.__geminiSynth === 'function') {
    try {
      const url = await window.__geminiSynth(clean, voice || resolveHeaderVoice() || 'Zephyr');
      if (url) { await playAudio(url, { rate }); return; }
    } catch (err) {
      console.warn('[jlpt-audio] gemini failed, fallback to webspeech', err);
    }
  }
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'ja-JP';
    u.rate = Math.max(0.25, Math.min(4, Number(rate) || 1));
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

export async function speak(text, opts = {}) {
  const { voice, rate = 1, lockKey } = opts;
  if (lockKey && isLocked(lockKey)) return { refused: true, reason: 'one-shot-locked' };
  stopAll();
  cancelChain = false;
  await geminiOrFallback(text, voice, rate);
  if (lockKey) lock(lockKey);
  return { refused: false };
}

export async function speakQueue(lines, opts = {}) {
  const { rate = 1, interLineDelay = 240, lockKey } = opts;
  if (lockKey && isLocked(lockKey)) return { refused: true, reason: 'one-shot-locked' };
  stopAll();
  cancelChain = false;
  for (let i = 0; i < lines.length; i++) {
    if (cancelChain) break;
    const ln = lines[i] || {};
    const voice = voiceForSpeaker(ln.speaker);
    await geminiOrFallback(ln.text || '', voice, rate);
    if (i < lines.length - 1 && !cancelChain) {
      await new Promise(r => setTimeout(r, interLineDelay));
    }
  }
  if (lockKey) lock(lockKey);
  return { refused: false };
}

export async function speakStaged(payload, opts = {}) {
  const { onStage, lockKey } = opts;
  if (lockKey && isLocked(lockKey)) return { refused: true };
  const lines = Array.isArray(payload) ? payload : [{ speaker: '', text: String(payload || '') }];
  stopAll();
  cancelChain = false;
  if (typeof onStage === 'function') onStage('fast');
  await speakQueue(lines, { rate: 1 });
  if (cancelChain) return { refused: false, stage: 'fast' };
  await new Promise(r => setTimeout(r, 400));
  if (typeof onStage === 'function') onStage('slow');
  await speakQueue(lines, { rate: 0.75 });
  if (cancelChain) return { refused: false, stage: 'slow' };
  if (typeof onStage === 'function') onStage('reveal');
  if (lockKey) lock(lockKey);
  return { refused: false, stage: 'reveal' };
}
