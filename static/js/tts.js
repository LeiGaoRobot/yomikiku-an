// Gemini TTS 朗读模块
// 使用 gemini-3.1-flash-tts-preview 替代 Web Speech API。
// 保留原有 window.* 入口以兼容 static/main-js.js；并提供 window.speechSynthesis 的 HTMLAudio 代理。

(() => {
  'use strict';

  // ----------------- Gemini config -----------------
  const GEMINI_MODEL = 'gemini-3.1-flash-tts-preview';
  const GEMINI_ENDPOINT = (model) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const API_KEY_LS = 'yomikikuan_gemini_api_key';

  const GEMINI_VOICES_DEF = [
    ['Zephyr', 'Female'], ['Puck', 'Male'], ['Charon', 'Male'], ['Kore', 'Female'],
    ['Fenrir', 'Male'], ['Leda', 'Female'], ['Orus', 'Male'], ['Aoede', 'Female'],
    ['Callirrhoe', 'Female'], ['Autonoe', 'Female'], ['Enceladus', 'Male'],
    ['Iapetus', 'Male'], ['Umbriel', 'Male'], ['Algieba', 'Male'], ['Despina', 'Female'],
    ['Erinome', 'Female'], ['Algenib', 'Male'], ['Rasalgethi', 'Male'],
    ['Laomedeia', 'Female'], ['Achernar', 'Female'], ['Alnilam', 'Male'],
    ['Schedar', 'Male'], ['Gacrux', 'Female'], ['Pulcherrima', 'Female'],
    ['Achird', 'Male'], ['Zubenelgenubi', 'Male'], ['Vindemiatrix', 'Female'],
    ['Sadachbia', 'Male'], ['Sadaltager', 'Male'], ['Sulafar', 'Female'],
  ];
  const GEMINI_VOICES = GEMINI_VOICES_DEF.map(([name, gender]) => ({
    name,
    voiceURI: `gemini:${name}`,
    lang: 'ja-JP',
    gender,
    default: name === 'Kore',
  }));

  // ----------------- API key helpers -----------------
  function getApiKey(promptIfMissing) {
    let k = null;
    try { k = localStorage.getItem(API_KEY_LS); } catch (_) {}
    if (!k && promptIfMissing) {
      try {
        const entered = window.prompt(
          'Gemini API Key が必要です / 需要 Gemini API Key / Enter Gemini API Key:\n' +
          'https://aistudio.google.com/apikey'
        );
        if (entered && entered.trim()) {
          k = entered.trim();
          try { localStorage.setItem(API_KEY_LS, k); } catch (_) {}
        }
      } catch (_) {}
    }
    return k || null;
  }
  window.setGeminiApiKey = function (key) {
    try {
      if (key) localStorage.setItem(API_KEY_LS, String(key).trim());
      else localStorage.removeItem(API_KEY_LS);
    } catch (_) {}
  };
  window.getGeminiApiKey = function () {
    try { return localStorage.getItem(API_KEY_LS) || ''; } catch (_) { return ''; }
  };

  // ----------------- PCM → WAV helpers -----------------
  function base64ToBytes(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function pcm16ToWav(pcmBytes, sampleRate) {
    const dataLen = pcmBytes.byteLength;
    const buffer = new ArrayBuffer(44 + dataLen);
    const view = new DataView(buffer);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
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
  function parseSampleRate(mime) {
    let rate = 24000;
    const m = /rate=(\d+)/i.exec(mime || '');
    if (m) rate = parseInt(m[1], 10) || 24000;
    return rate;
  }

  // ----------------- IndexedDB persistent cache -----------------
  const IDB_NAME = 'yomikikuan-tts';
  const IDB_STORE = 'audio';
  const IDB_VERSION = 1;
  const IDB_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  function openIDB() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            const store = db.createObjectStore(IDB_STORE, { keyPath: 'key' });
            store.createIndex('ts', 'ts', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }

  async function idbGet(key) {
    try {
      const db = await openIDB();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (_) { return null; }
  }

  async function idbPut(key, blob) {
    try {
      const db = await openIDB();
      await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put({ key, blob, ts: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    } catch (_) {}
  }

  async function idbPruneExpired() {
    try {
      const db = await openIDB();
      const cutoff = Date.now() - IDB_TTL_MS;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const idx = tx.objectStore(IDB_STORE).index('ts');
      const range = IDBKeyRange.upperBound(cutoff);
      idx.openCursor(range).onsuccess = (e) => {
        const c = e.target.result;
        if (c) { c.delete(); c.continue(); }
      };
    } catch (_) {}
  }
  idbPruneExpired();

  // ----------------- Gemini fetch + memory cache -----------------
  const audioCache = new Map();   // key -> object URL (session-scoped)
  const inflight = new Map();

  async function geminiSynth(text, voiceName) {
    let style = '';
    try { style = (localStorage.getItem('yomikikuan_gemini_style') || '').trim(); } catch (_) {}
    const key = `${voiceName}|${style}|${text}`;
    if (audioCache.has(key)) return audioCache.get(key);
    if (inflight.has(key)) return inflight.get(key);

    // IndexedDB cache hit → hydrate in-memory & return
    const hit = await idbGet(key);
    if (hit && hit.blob instanceof Blob) {
      const url = URL.createObjectURL(hit.blob);
      audioCache.set(key, url);
      return url;
    }

    const apiKey = getApiKey(true);
    if (!apiKey) throw new Error('Gemini API key not set');

    // Gemini TTS style prompt: directive + payload. Directive describes how to read; 只有冒号之后的文本会被朗读。
    const promptText = style ? `${style}: ${text}` : String(text);
    const body = {
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    };

    const p = (async () => {
      const resp = await fetch(`${GEMINI_ENDPOINT(GEMINI_MODEL)}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const errTxt = await resp.text().catch(() => '');
        throw new Error(`Gemini TTS ${resp.status}: ${errTxt.slice(0, 300)}`);
      }
      const json = await resp.json();
      const parts =
        (json && json.candidates && json.candidates[0] &&
         json.candidates[0].content && json.candidates[0].content.parts) || [];
      const audioPart = parts.find(pt => pt && pt.inlineData && pt.inlineData.data);
      if (!audioPart) throw new Error('Gemini TTS: no audio in response');
      const { data, mimeType } = audioPart.inlineData;
      const pcm = base64ToBytes(data);
      const wav = pcm16ToWav(pcm, parseSampleRate(mimeType));
      const url = URL.createObjectURL(wav);
      audioCache.set(key, url);
      idbPut(key, wav); // persist for future sessions (fire & forget)
      return url;
    })().finally(() => { inflight.delete(key); });

    inflight.set(key, p);
    return p;
  }
  window.__geminiSynth = geminiSynth;

  // Wire native voiceschanged → refresh list when in Web Speech mode
  try {
    if (window.speechSynthesis && window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        try { if (typeof window.refreshVoices === 'function') window.refreshVoices(); } catch (_) {}
      });
    }
  } catch (_) {}

  // ----------------- Engine mode (gemini | web) -----------------
  const ENGINE_LS = 'yomikikuan_tts_engine';
  function getEngine() {
    try {
      const v = localStorage.getItem(ENGINE_LS);
      return (v === 'web') ? 'web' : 'gemini';
    } catch (_) { return 'gemini'; }
  }
  window.setTTSEngine = function (mode) {
    try {
      const v = (mode === 'web') ? 'web' : 'gemini';
      localStorage.setItem(ENGINE_LS, v);
      if (typeof window.refreshVoices === 'function') window.refreshVoices();
    } catch (_) {}
  };
  window.getTTSEngine = getEngine;

  // ----------------- Web Speech fallback voice list -----------------
  function listWebSpeechJaVoices() {
    const all = (window.speechSynthesisNative && window.speechSynthesisNative.getVoices())
             || (typeof SpeechSynthesis !== 'undefined' && [])
             || [];
    return all.filter(v => (v.lang || '').toLowerCase().startsWith('ja'))
              .map(v => ({ name: v.name, voiceURI: `web:${v.voiceURI || v.name}`, lang: v.lang, gender: '', default: v.default }));
  }

  // ----------------- Public voice API (branches on engine) -----------------
  function listVoicesFiltered() {
    if (getEngine() === 'web') return listWebSpeechJaVoices();
    return GEMINI_VOICES.slice();
  }
  function applyVoice() { /* Gemini: 音色在请求时绑定；Web Speech 在 speak 时 apply */ }
  window.TTS = Object.freeze({ listVoicesFiltered, applyVoice });

  // ----------------- i18n -----------------
  const t = (key) => {
    try { return window.YomikikuanGetText ? window.YomikikuanGetText(key) : key; } catch (_) { return key; }
  };

  // ----------------- volume helpers -----------------
  function getSafeVolume() {
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const v = Number(window.volume);
    if (Number.isFinite(v)) return clamp01(v);
    try {
      const lsKey = window.LS && window.LS.volume;
      if (typeof lsKey === 'string' && lsKey) {
        const raw = localStorage.getItem(lsKey);
        const fromLS = Number(raw);
        if (Number.isFinite(fromLS)) return clamp01(fromLS);
      }
    } catch (_) {}
    return 1;
  }
  if (!Number.isFinite(Number(window.volume))) window.volume = getSafeVolume();

  // ----------------- voices on window -----------------
  window.listVoicesFiltered = listVoicesFiltered;

  window.refreshVoices = function refreshVoices() {
    window.voices = listVoicesFiltered();
    const ids = ['voiceSelect', 'sidebarVoiceSelect', 'headerVoiceSelect'];
    const selects = ids.map(id => document.getElementById(id));
    selects.forEach(el => { if (el) el.innerHTML = ''; });
    (window.voices || []).forEach((v, i) => {
      selects.forEach(el => {
        if (!el) return;
        const o = document.createElement('option');
        o.value = v.voiceURI || v.name || String(i);
        o.textContent = `${v.name}${v.gender ? ' — ' + v.gender : ''}${v.default ? ' (默认)' : ''}`;
        el.appendChild(o);
      });
    });
    let pref = null;
    try { pref = (window.LS && window.LS.voiceURI) ? localStorage.getItem(window.LS.voiceURI) : null; } catch (_) {}
    const chosen =
      (window.voices || []).find(v => (v.voiceURI || v.name) === pref) ||
      (window.voices || []).find(v => v.default) ||
      (window.voices || [])[0];
    if (chosen) {
      window.currentVoice = chosen;
      selects.forEach(el => { if (el) el.value = chosen.voiceURI || chosen.name; });
    }
  };

  window.applyVoice = applyVoice;

  // ----------------- Progress helpers -----------------
  window.setHeaderProgress = function (p) {
    const bar = document.getElementById('headerPlayProgressFill');
    const track = document.getElementById('headerPlayProgress');
    if (!bar || !track) return;
    const safe = Math.max(0, Math.min(1, Number(p) || 0));
    bar.style.width = `${Math.round(safe * 100)}%`;
    track.setAttribute('aria-valuenow', String(Math.round(safe * 100)));
  };
  window.clearProgressTimer = function () {
    if (window.progressTimer) { try { clearInterval(window.progressTimer); } catch (_) {} window.progressTimer = null; }
  };
  window.estimateSegmentDuration = function (text, rateVal) {
    const avgCharsPerSec = 8;
    const len = Math.max(1, (text || '').length);
    const r = Math.max(0.5, Number(rateVal) || window.rate || 1);
    return Math.max(0.6, Math.min(6, len / (avgCharsPerSec * r)));
  };

  // ----------------- Engine -----------------
  const Engine = { audio: null, token: 0 };

  function teardownAudio() {
    if (!Engine.audio) return;
    const a = Engine.audio;
    try { a.onended = null; a.onerror = null; a.ontimeupdate = null; a.onplay = null; a.onpause = null; } catch (_) {}
    try { a.pause(); } catch (_) {}
    try { a.removeAttribute('src'); if (typeof a.load === 'function') a.load(); } catch (_) {}
    Engine.audio = null;
  }

  function resolveVoiceName() {
    const v = window.currentVoice;
    if (!v) return 'Kore';
    const raw = (typeof v === 'string') ? v : (v.name || v.voiceURI || 'Kore');
    return String(raw).replace(/^gemini:/, '');
  }

  window.safeCancelCurrentUtterance = function () {
    Engine.token++;
    teardownAudio();
    window.currentUtterance = null;
  };

  window.stopSpeaking = function () {
    Engine.token++;
    teardownAudio();
    window.isPlaying = false;
    window.isPaused = false;
    window.currentUtterance = null;
    window.currentPlayingText = null;
    window.clearTokenHighlight && window.clearTokenHighlight();
    window.clearProgressTimer && window.clearProgressTimer();
    window.updatePlayButtonStates && window.updatePlayButtonStates();
  };

  window.restartPlaybackWithNewSettings = function () {
    if (!window.isPlaying || !window.currentSegments) return;
    try {
      const segmentIndex = window.currentSegmentIndex || 0;
      Engine.token++;
      teardownAudio();
      window.clearProgressTimer();
      window.playSegments(window.currentSegments, segmentIndex, undefined);
    } catch (e) { console.error(e); }
  };

  // Gemini 返回整段音频，无法按字符精确定位；从当前段起点重播。
  window.restartCurrentSegmentAt = function () {
    if (!window.currentSegments) return;
    Engine.token++;
    teardownAudio();
    window.playSegments(window.currentSegments, window.currentSegmentIndex || 0, undefined);
  };

  window.speakWithPauses = function (text, rateOverride) {
    if (window.isPlaying) { window.stopSpeaking(); return; }
    const stripped = String(text || '')
      .replace(/（[^）]*）|\([^)]*\)/g, '')
      .replace(/[\s\u00A0]+/g, ' ')
      .trim();
    if (!stripped) return;
    const segments = (window.splitTextByPunctuation ? window.splitTextByPunctuation(stripped) : [{ text: stripped, pause: 0 }]);
    window.currentPlayingText = stripped;
    const charPrefix = [0];
    for (let i = 0; i < segments.length; i++) charPrefix.push(charPrefix[charPrefix.length - 1] + (segments[i].text || '').length);
    window.PLAY_STATE = { totalSegments: segments.length, totalChars: charPrefix[charPrefix.length - 1], charPrefix, current: 0 };
    window.setHeaderProgress(0);
    window.playSegments(segments, 0, rateOverride);
  };

  window.playSegments = async function playSegments(segments, index, rateOverride) {
    if (index >= segments.length) {
      window.isPlaying = false;
      window.currentUtterance = null;
      window.updatePlayButtonStates && window.updatePlayButtonStates();
      if (window.repeatPlayCheckbox && window.repeatPlayCheckbox.checked && window.currentPlayingText) {
        setTimeout(() => {
          if (window.repeatPlayCheckbox && window.repeatPlayCheckbox.checked && window.currentPlayingText && !window.isPlaying) {
            window.speakWithPauses(window.currentPlayingText, rateOverride);
          }
        }, 1000);
      } else {
        window.currentPlayingText = null;
        window.clearTokenHighlight && window.clearTokenHighlight();
      }
      return;
    }

    const segment = segments[index];
    window.currentSegments = segments;
    window.currentSegmentIndex = index;
    window.currentSegmentText = segment.text || '';
    window.lastBoundaryCharIndex = 0;
    window.segmentStartTs = 0;

    const token = ++Engine.token;
    teardownAudio();

    // ---- Engine: Web Speech API fallback ----
    if (getEngine() === 'web' && window.speechSynthesisNative) {
      const synth = window.speechSynthesisNative;
      try { synth.cancel(); } catch (_) {}
      const utter = new SpeechSynthesisUtterance(segment.text);
      const rateVal = typeof rateOverride === 'number' ? rateOverride : (window.rate || 1);
      utter.rate = Math.max(0.5, Math.min(2, Number(rateVal) || 1));
      utter.volume = getSafeVolume();
      utter.pitch = 1.0;
      const pick = resolveVoiceName();
      const voices = synth.getVoices() || [];
      const matched = voices.find(v => v.name === pick || v.voiceURI === pick) ||
                      voices.find(v => (v.lang || '').toLowerCase().startsWith('ja'));
      if (matched) { utter.voice = matched; utter.lang = matched.lang || 'ja-JP'; }
      else { utter.lang = 'ja-JP'; }
      window.currentUtterance = utter;
      currentWebUtter = utter;
      utter.onstart = () => {
        if (token !== Engine.token) return;
        window.isPlaying = true; window.isPaused = false;
        window.PLAY_STATE.current = index;
        window.segmentStartTs = Date.now();
        window.updatePlayButtonStates && window.updatePlayButtonStates();
      };
      utter.onboundary = (event) => {
        if (token !== Engine.token) return;
        const segLen = Math.max(1, (segment.text || '').length);
        const charIdx = typeof event.charIndex === 'number' ? event.charIndex : 0;
        window.lastBoundaryCharIndex = charIdx;
        const passed = (window.PLAY_STATE.charPrefix[index] || 0) + Math.min(segLen, charIdx);
        if (window.PLAY_STATE.totalChars > 0) {
          window.setHeaderProgress(Math.max(0, Math.min(1, passed / window.PLAY_STATE.totalChars)));
        }
      };
      utter.onend = () => {
        if (token !== Engine.token) return;
        const nextIndex = index + 1;
        const nextChars = window.PLAY_STATE.charPrefix[nextIndex] || window.PLAY_STATE.totalChars;
        if (window.PLAY_STATE.totalChars > 0) {
          window.setHeaderProgress(Math.max(0, Math.min(1, nextChars / window.PLAY_STATE.totalChars)));
        }
        setTimeout(() => { window.playSegments(segments, nextIndex, rateOverride); }, segment.pause || 0);
      };
      utter.onerror = () => {
        if (token !== Engine.token) return;
        window.isPlaying = false; window.currentUtterance = null; window.currentPlayingText = null;
        window.clearTokenHighlight && window.clearTokenHighlight();
        window.clearProgressTimer && window.clearProgressTimer();
        window.setHeaderProgress(0);
        window.updatePlayButtonStates && window.updatePlayButtonStates();
      };
      try { synth.speak(utter); } catch (e) { console.error('Web Speech failed:', e); }
      return;
    }

    // ---- Engine: Gemini (default) ----
    const voiceName = resolveVoiceName();
    let url;
    try {
      url = await geminiSynth(segment.text, voiceName);
    } catch (e) {
      if (token !== Engine.token) return;
      console.error('Gemini TTS failed:', e);
      if (typeof window.showNotification === 'function') {
        window.showNotification('Gemini TTS: ' + (e && e.message ? e.message : String(e)), 'error');
      }
      window.isPlaying = false;
      window.currentUtterance = null;
      window.clearTokenHighlight && window.clearTokenHighlight();
      window.clearProgressTimer && window.clearProgressTimer();
      window.setHeaderProgress(0);
      window.updatePlayButtonStates && window.updatePlayButtonStates();
      return;
    }
    if (token !== Engine.token) return;

    const audio = new Audio(url);
    audio.preload = 'auto';
    const vol = getSafeVolume();
    audio.volume = Number.isFinite(vol) ? vol : 1;
    const rateVal = typeof rateOverride === 'number' ? rateOverride : (window.rate || 1);
    try { audio.playbackRate = Math.max(0.25, Math.min(4, Number(rateVal) || 1)); } catch (_) {}
    try { audio.preservesPitch = true; } catch (_) {}
    Engine.audio = audio;
    window.currentUtterance = audio;

    audio.onplay = () => {
      if (token !== Engine.token) return;
      window.isPlaying = true;
      window.isPaused = false;
      window.PLAY_STATE.current = index;
      window.segmentStartTs = Date.now();
      window.updatePlayButtonStates && window.updatePlayButtonStates();
    };
    audio.onpause = () => {
      if (token !== Engine.token) return;
      if (!audio.ended) {
        window.isPaused = true;
        window.updatePlayButtonStates && window.updatePlayButtonStates();
      }
    };
    audio.ontimeupdate = () => {
      if (token !== Engine.token) return;
      const dur = (audio.duration && isFinite(audio.duration))
        ? audio.duration
        : window.estimateSegmentDuration(segment.text, rateVal);
      const frac = dur > 0 ? Math.max(0, Math.min(1, audio.currentTime / dur)) : 0;
      const segLen = Math.max(1, (segment.text || '').length);
      window.lastBoundaryCharIndex = Math.round(frac * segLen);
      const passedChars = (window.PLAY_STATE.charPrefix[index] || 0) + Math.round(frac * segLen);
      if (window.PLAY_STATE.totalChars > 0) {
        window.setHeaderProgress(Math.max(0, Math.min(1, passedChars / window.PLAY_STATE.totalChars)));
      }
    };
    audio.onended = () => {
      if (token !== Engine.token) return;
      const nextIndex = index + 1;
      const nextChars = window.PLAY_STATE.charPrefix[nextIndex] || window.PLAY_STATE.totalChars;
      if (window.PLAY_STATE.totalChars > 0) {
        window.setHeaderProgress(Math.max(0, Math.min(1, nextChars / window.PLAY_STATE.totalChars)));
      }
      setTimeout(() => { window.playSegments(segments, nextIndex, rateOverride); }, segment.pause || 0);
    };
    audio.onerror = () => {
      if (token !== Engine.token) return;
      console.warn('Gemini TTS audio element error');
      window.isPlaying = false;
      window.currentUtterance = null;
      window.currentPlayingText = null;
      window.clearTokenHighlight && window.clearTokenHighlight();
      window.clearProgressTimer && window.clearProgressTimer();
      window.setHeaderProgress(0);
      window.updatePlayButtonStates && window.updatePlayButtonStates();
    };

    try { await audio.play(); }
    catch (e) { if (token === Engine.token) console.error('Audio play failed:', e); }
  };

  window.speak = function (text, rateOverride) { window.speakWithPauses(text, rateOverride); };

  // ----------------- speechSynthesis shim (preserving native) -----------------
  // Save native reference for Web Speech fallback engine use.
  try { window.speechSynthesisNative = window.speechSynthesis; } catch (_) {}

  let currentWebUtter = null;

  const shim = {
    pause()  {
      try {
        if (getEngine() === 'web' && window.speechSynthesisNative) window.speechSynthesisNative.pause();
        else if (Engine.audio) Engine.audio.pause();
      } catch (_) {}
    },
    resume() {
      try {
        if (getEngine() === 'web' && window.speechSynthesisNative) window.speechSynthesisNative.resume();
        else if (Engine.audio) Engine.audio.play();
      } catch (_) {}
    },
    cancel() {
      Engine.token++;
      teardownAudio();
      try { if (window.speechSynthesisNative) window.speechSynthesisNative.cancel(); } catch (_) {}
    },
    speak()  { /* noop: 路由走 window.speak */ },
    getVoices() { return listVoicesFiltered(); },
    get speaking() {
      if (getEngine() === 'web' && window.speechSynthesisNative) {
        return !!window.speechSynthesisNative.speaking;
      }
      return !!(Engine.audio && !Engine.audio.paused && !Engine.audio.ended);
    },
    get pending()  {
      if (getEngine() === 'web' && window.speechSynthesisNative) {
        return !!window.speechSynthesisNative.pending;
      }
      return false;
    },
    get paused()   {
      if (getEngine() === 'web' && window.speechSynthesisNative) {
        return !!window.speechSynthesisNative.paused;
      }
      return !!(Engine.audio && Engine.audio.paused && !Engine.audio.ended);
    },
    addEventListener() {}, removeEventListener() {},
  };
  try {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: shim });
  } catch (_) {
    try { window.speechSynthesis = shim; } catch (__) {}
  }

  // ----------------- Highlighting -----------------
  window.highlightToken = function highlightToken(text, targetElement) {
    window.clearTokenHighlight && window.clearTokenHighlight();
    if (!text) return;
    if (targetElement) {
      targetElement.classList.add('playing');
      window.currentHighlightedToken = targetElement;
      try { targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch (_) {}
      return;
    }
    const tokenPills = document.querySelectorAll('.token-pill');
    for (const pill of tokenPills) {
      const kanjiEl = pill.querySelector('.token-kanji');
      if (kanjiEl && kanjiEl.textContent.trim() === String(text).trim()) {
        pill.classList.add('playing');
        window.currentHighlightedToken = pill;
        try { pill.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch (_) {}
        break;
      }
    }
  };
  window.clearTokenHighlight = function clearTokenHighlight() {
    if (window.currentHighlightedToken) {
      window.currentHighlightedToken.classList.remove('playing');
      window.currentHighlightedToken = null;
    }
    document.querySelectorAll('.token-pill.playing').forEach(pill => pill.classList.remove('playing'));
    if (window.highlightTimeout) { try { clearTimeout(window.highlightTimeout); } catch (_) {} window.highlightTimeout = null; }
  };

  // ----------------- Button state -----------------
  window.updateButtonIcon = function updateButtonIcon(button, playing) {
    if (!button) return;
    const svg = button.querySelector('svg');
    if (!svg) return;
    if (playing) {
      svg.innerHTML = '<rect x="6" y="6" width="12" height="12" fill="currentColor"/>';
      if (button.classList.contains('play-all-btn') || button.id === 'playAllBtn') {
        button.title = (typeof window.playAllLabel === 'function') ? window.playAllLabel(true) : '停止';
      } else {
        button.title = t('stop') || '停止';
      }
    } else {
      svg.innerHTML = '<path d="M8 5v14l11-7z" fill="currentColor"/>';
      if (button.classList.contains('play-all-btn') || button.id === 'playAllBtn') {
        button.title = (typeof window.playAllLabel === 'function') ? window.playAllLabel(false) : '播放';
      } else {
        button.title = t('play') || '播放';
      }
    }
  };
  window.updatePauseButtonIcon = function updatePauseButtonIcon(button, playing, paused) {
    if (!button) return;
    const svg = button.querySelector('svg');
    if (!svg) return;
    const showPlay = paused && playing;
    const title = showPlay ? (t('resume') || '恢复') : (t('pause') || '暂停');
    button.setAttribute('aria-label', title);
    button.title = title;
    if (showPlay) { svg.innerHTML = '<path d="M8 5v14l11-7z" fill="currentColor"></path>'; }
    else { svg.innerHTML = '<path d="M6 5h4v14H6z" fill="currentColor"></path><path d="M14 5h4v14h-4z" fill="currentColor"></path>'; }
    button.classList.toggle('disabled', !playing);
  };
  window.updatePlayButtonStates = function updatePlayButtonStates() {
    window.updateButtonIcon(window.playAllBtn, window.isPlaying);
    window.updateButtonIcon(document.getElementById('headerPlayToggle'), window.isPlaying);
    window.updatePauseButtonIcon(document.getElementById('headerPauseToggle'), window.isPlaying, window.isPaused);
    document.querySelectorAll('.play-line-btn').forEach(btn => window.updateButtonIcon(btn, window.isPlaying));
    document.querySelectorAll('.play-token-btn').forEach(btn => window.updateButtonIcon(btn, window.isPlaying));
  };

  // ----------------- Line/all playback -----------------
  window.playLine = window.playLine || function (lineIndex) {
    if (window.isPlaying) { window.stopSpeaking(); return; }
    const lineContainer = document.querySelectorAll('.line-container')[lineIndex];
    if (lineContainer) {
      const tokens = lineContainer.querySelectorAll('.token-pill');
      const lineText = Array.from(tokens).map(token => {
        const tokenDataAttr = token.getAttribute('data-token');
        if (tokenDataAttr) {
          try {
            const tokenData = JSON.parse(tokenDataAttr);
            let textToSpeak = tokenData.reading || tokenData.surface || '';
            if (tokenData.surface === 'は' && tokenData.pos && Array.isArray(tokenData.pos) && tokenData.pos[0] === '助詞' && typeof window.isHaParticleReadingEnabled === 'function' && window.isHaParticleReadingEnabled()) {
              textToSpeak = 'わ';
            }
            return textToSpeak;
          } catch (e) {
            const kanjiEl = token.querySelector('.token-kanji');
            return kanjiEl ? kanjiEl.textContent : '';
          }
        } else {
          const kanjiEl = token.querySelector('.token-kanji');
          return kanjiEl ? kanjiEl.textContent : '';
        }
      }).join('');
      window.speak(lineText);
    }
  };

  // ----------------- Settings panel injection -----------------
  function buildGeminiSettingsSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    section.id = 'geminiSettingsSection';
    section.innerHTML = `
      <div class="sidebar-title">朗读引擎 / TTS Engine</div>
      <div class="voice-controls">
        <div class="control-group full-width">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <label style="display:flex;gap:6px;align-items:center;cursor:pointer;">
              <input type="radio" name="ttsEngine" value="gemini" id="ttsEngineGemini"> Gemini (online)
            </label>
            <label style="display:flex;gap:6px;align-items:center;cursor:pointer;">
              <input type="radio" name="ttsEngine" value="web" id="ttsEngineWeb"> Web Speech (offline)
            </label>
          </div>
          <div style="font-size:12px;opacity:.65;margin-top:4px;">Gemini: 高质量，需 API Key；Web Speech: 浏览器内置，无网络也可用。</div>
        </div>
      </div>
      <div class="sidebar-title" style="margin-top:12px;">Gemini 配置</div>
      <div class="voice-controls">
        <div class="control-group full-width">
          <label class="control-label" for="geminiApiKeyInput">
            <span class="label-text">API Key</span>
          </label>
          <input type="password" id="geminiApiKeyInput" autocomplete="off" spellcheck="false"
                 placeholder="Paste Gemini API key (aistudio.google.com/apikey)"
                 style="width:100%;padding:6px 8px;box-sizing:border-box;border:1px solid var(--border,#ccc);border-radius:6px;background:var(--input-bg,transparent);color:inherit;font-family:monospace;">
          <div style="display:flex;gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap;">
            <button type="button" id="geminiApiKeySave"
                    style="padding:4px 12px;border:1px solid var(--border,#ccc);border-radius:6px;cursor:pointer;background:var(--btn-bg,transparent);color:inherit;">保存</button>
            <button type="button" id="geminiApiKeyClear"
                    style="padding:4px 12px;border:1px solid var(--border,#ccc);border-radius:6px;cursor:pointer;background:var(--btn-bg,transparent);color:inherit;">清除</button>
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="geminiApiKeyShow"> 显示
            </label>
            <span id="geminiApiKeyStatus" style="font-size:12px;opacity:.75;"></span>
          </div>
        </div>
        <div class="control-group full-width">
          <label class="control-label" for="geminiStyleInput">
            <span class="label-text">朗读风格提示 (可选)</span>
          </label>
          <input type="text" id="geminiStyleInput" autocomplete="off"
                 placeholder="e.g. Read slowly and clearly in a calm tone"
                 style="width:100%;padding:6px 8px;box-sizing:border-box;border:1px solid var(--border,#ccc);border-radius:6px;background:var(--input-bg,transparent);color:inherit;">
          <div style="font-size:12px;opacity:.65;margin-top:4px;">该提示以 Gemini styled-prompt 的形式注入，不会被朗读。留空则按默认风格。</div>
        </div>
      </div>
    `;
    return section;
  }

  function bindGeminiSettings(root) {
    if (!root) return;
    // Engine radio
    const eGem = root.querySelector('#ttsEngineGemini');
    const eWeb = root.querySelector('#ttsEngineWeb');
    if (eGem && eWeb) {
      const cur = getEngine();
      eGem.checked = cur === 'gemini';
      eWeb.checked = cur === 'web';
      eGem.addEventListener('change', () => { if (eGem.checked) window.setTTSEngine('gemini'); });
      eWeb.addEventListener('change', () => { if (eWeb.checked) window.setTTSEngine('web'); });
    }

    const input = root.querySelector('#geminiApiKeyInput');
    const saveBtn = root.querySelector('#geminiApiKeySave');
    const clearBtn = root.querySelector('#geminiApiKeyClear');
    const showChk = root.querySelector('#geminiApiKeyShow');
    const status = root.querySelector('#geminiApiKeyStatus');
    const styleInput = root.querySelector('#geminiStyleInput');
    if (!input || !saveBtn) return;

    const STYLE_LS = 'yomikikuan_gemini_style';
    const current = window.getGeminiApiKey ? window.getGeminiApiKey() : '';
    if (current) {
      input.value = current;
      status.textContent = `✓ 已保存 (${current.slice(0, 6)}…${current.slice(-4)})`;
    } else {
      status.textContent = '未设置';
    }
    try { styleInput.value = localStorage.getItem(STYLE_LS) || ''; } catch (_) {}

    showChk && showChk.addEventListener('change', () => {
      input.type = showChk.checked ? 'text' : 'password';
    });
    saveBtn.addEventListener('click', () => {
      const v = (input.value || '').trim();
      window.setGeminiApiKey(v);
      status.textContent = v ? `✓ 已保存 (${v.slice(0, 6)}…${v.slice(-4)})` : '未设置';
    });
    clearBtn && clearBtn.addEventListener('click', () => {
      input.value = '';
      window.setGeminiApiKey('');
      status.textContent = '已清除';
    });
    styleInput && styleInput.addEventListener('change', () => {
      try {
        const v = (styleInput.value || '').trim();
        if (v) localStorage.setItem(STYLE_LS, v);
        else localStorage.removeItem(STYLE_LS);
      } catch (_) {}
    });
  }

  window.__getGeminiStylePrompt = function () {
    try { return localStorage.getItem('yomikikuan_gemini_style') || ''; } catch (_) { return ''; }
  };

  function ensureGeminiSectionIn(container) {
    if (!container || container.querySelector('#geminiSettingsSection')) return;
    const section = buildGeminiSettingsSection();
    container.appendChild(section);
    bindGeminiSettings(section);
  }

  function initSettingsInjection() {
    const tryInject = () => {
      document.querySelectorAll('.toolbar-content[data-context], #settingsModalBody').forEach(el => {
        if (el.childElementCount > 0) ensureGeminiSectionIn(el);
      });
    };
    tryInject();
    // settings modal content is mounted lazily — observe and re-inject
    const mo = new MutationObserver(() => tryInject());
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsInjection);
  } else {
    initSettingsInjection();
  }

  window.playAllText = window.playAllText || function () {
    if (window.isPlaying) { window.stopSpeaking(); return; }
    const content = document.getElementById('content');
    if (content && content.innerHTML.trim()) {
      const tokens = content.querySelectorAll('.token-pill');
      if (tokens.length > 0) {
        const readingText = Array.from(tokens).map(token => {
          const tokenDataAttr = token.getAttribute('data-token');
          if (tokenDataAttr) {
            try {
              const tokenData = JSON.parse(tokenDataAttr);
              let textToSpeak = tokenData.reading || tokenData.surface || '';
              if (tokenData.surface === 'は' && tokenData.pos && Array.isArray(tokenData.pos) && tokenData.pos[0] === '助詞' && typeof window.isHaParticleReadingEnabled === 'function' && window.isHaParticleReadingEnabled()) {
                textToSpeak = 'わ';
              }
              return textToSpeak;
            } catch (e) {
              const kanjiEl = token.querySelector('.token-kanji');
              return kanjiEl ? kanjiEl.textContent : '';
            }
          } else {
            const kanjiEl = token.querySelector('.token-kanji');
            return kanjiEl ? kanjiEl.textContent : '';
          }
        }).join('');
        if (!/[。！？]/.test(readingText)) {
          const textInput = document.getElementById('textInput');
          const text = textInput ? textInput.value.trim() : '';
          if (text) { window.speak(text); return; }
        }
        window.speak(readingText); return;
      }
    }
    const textInput = document.getElementById('textInput');
    const text = textInput ? textInput.value.trim() : '';
    if (text) { window.speak(text); }
    else if (typeof window.showNotification === 'function') {
      window.showNotification(t('pleaseInputText') || '请先输入文本', 'warning');
    }
  };
})();
