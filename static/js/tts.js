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
    let finalKey = '';
    try {
      if (key) {
        finalKey = String(key).trim();
        localStorage.setItem(API_KEY_LS, finalKey);
      } else {
        localStorage.removeItem(API_KEY_LS);
      }
    } catch (_) {}
    // Keep the unified AI-button key-status signal in sync with actual key
    // presence — otherwise the red dot (styles.css `:root.no-gemini-key`)
    // only updates on reload. Mask the key exactly like the config.js sync
    // IIFE in index.html so __yomikikuanKeyStatus stays consistent.
    try {
      const hasKey = !!finalKey;
      const masked = hasKey ? `${finalKey.slice(0, 4)}…${finalKey.slice(-4)}` : '';
      window.__yomikikuanKeyStatus = { hasKey, maskedKey: masked };
      const root = document.documentElement;
      if (root) {
        if (hasKey) root.classList.remove('no-gemini-key');
        else root.classList.add('no-gemini-key');
      }
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
  // LRU cap on in-memory Blob URLs. Each entry is a decoded WAV object URL
  // (~50–200 KB worth of GPU/audio-element reference). Long edit sessions
  // could otherwise accumulate hundreds and leak memory. IDB (30-day TTL)
  // remains the cold store — evicting from the Map just forces a cheap
  // IDB re-hydrate on next replay.
  const AUDIO_CACHE_MAX = 50;
  const audioCache = (() => {
    const map = new Map(); // insertion order = LRU order (oldest first)
    return {
      has(k) { return map.has(k); },
      get(k) {
        if (!map.has(k)) return undefined;
        const v = map.get(k);
        map.delete(k); map.set(k, v); // touch → most-recent
        return v;
      },
      set(k, v) {
        if (map.has(k)) map.delete(k);
        map.set(k, v);
        while (map.size > AUDIO_CACHE_MAX) {
          const oldestKey = map.keys().next().value;
          const oldestUrl = map.get(oldestKey);
          map.delete(oldestKey);
          try { if (oldestUrl) URL.revokeObjectURL(oldestUrl); } catch (_) {}
        }
        return v;
      },
      get size() { return map.size; },
    };
  })();
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
      if (!audioPart) {
        const cand = (json && json.candidates && json.candidates[0]) || {};
        const reason = cand.finishReason || 'UNKNOWN';
        const textPart = parts.find(pt => pt && typeof pt.text === 'string');
        const blockReason = (json && json.promptFeedback && json.promptFeedback.blockReason) || '';
        const extras = [
          `finishReason=${reason}`,
          blockReason ? `blockReason=${blockReason}` : '',
          textPart ? `text=${JSON.stringify(String(textPart.text).slice(0, 120))}` : '',
        ].filter(Boolean).join(', ');
        throw new Error(`Gemini TTS: no audio in response (${extras || 'empty candidates'})`);
      }
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

  // Read-ahead: warm the next segment's audio while the current one plays.
  // Idempotent (audioCache + inflight Maps dedupe). Silent on error — this
  // is a speculative fetch; real playback will surface errors if needed.
  //
  // Guardrails to avoid wasting Gemini quota on rapid skips:
  //   1. 150ms debounce — if the next call arrives within the grace window
  //      (user skips again), the pending prefetch is cancelled before it
  //      fires a network request. Typical skip is faster than 150ms.
  //   2. Cache-hit short-circuit — if audioCache already has the key, skip
  //      the timer AND the network entirely.
  //   3. Inflight reuse — geminiSynth already dedupes via `inflight`, so a
  //      new prefetch for the same text becomes a no-op naturally.
  let prefetchTimer = null;
  window.__prefetchGeminiTTS = function (text) {
    try {
      if (getEngine() !== 'gemini') return;
      const t = (text == null) ? '' : String(text).trim();
      if (!t) return;
      let apiKey = null;
      try { apiKey = localStorage.getItem(API_KEY_LS); } catch (_) {}
      if (!apiKey) return; // don't prompt; stay silent for a prefetch
      const voiceName = resolveVoiceName();
      const key = `${voiceName}|${t}`;

      // Cancel any pending prefetch that hasn't yet fired.
      if (prefetchTimer) { clearTimeout(prefetchTimer); prefetchTimer = null; }

      // Already cached (in-memory) — skip the timer and network entirely.
      if (audioCache.has(key)) return;

      prefetchTimer = setTimeout(() => {
        prefetchTimer = null;
        // Re-check cache at fire time in case a real play landed meanwhile.
        if (audioCache.has(key)) return;
        geminiSynth(t, voiceName).catch(() => { /* silent */ });
      }, 150);
    } catch (_) { /* silent */ }
  };

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

  // Live rate change: mutate the currently-playing Gemini audio's playbackRate
  // so slider drags take effect *during* a segment instead of only on the next
  // segment. Called from main-js.js's slider input handlers.
  window.__applyLiveRate = function (r) {
    const clamped = Math.max(0.25, Math.min(4, Number(r) || 1));
    if (Engine.audio) {
      try { Engine.audio.playbackRate = clamped; } catch (_) {}
      try { Engine.audio.preservesPitch = true; } catch (_) {}
    }
  };

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

  // NOTE: 播放状态机由 main-js.js 独占（本地 speakWithPauses/playSegments/
  // playAllText/stopSpeaking）。tts.js 只提供引擎选择、声音列表、Gemini 合成
  // 和 speechSynthesis shim（把 utterance 透明路由到 Gemini 或 Web Speech）。
  // 早期版本在这里镜像定义过 window.stopSpeaking / speakWithPauses / restart*
  // 等函数，但它们依赖 main-js.js 从未 export 的 PLAY_STATE / setHeaderProgress
  // / updatePlayButtonStates 等局部符号，调用即抛 TypeError —— 已移除。


  // ----------------- speechSynthesis shim (preserving native) -----------------
  // Save native reference for Web Speech fallback engine use.
  try { window.speechSynthesisNative = window.speechSynthesis; } catch (_) {}

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
    speak(utter) {
      // Route a classic SpeechSynthesisUtterance:
      //  - web engine: forward to native speechSynthesis
      //  - gemini engine: synthesize via Gemini, play via Audio, bridge
      //    the utterance's onstart/onend/onerror so legacy callers in
      //    main-js.js (playSegments) keep their state machine intact.
      if (!utter) return;
      if (getEngine() === 'web' && window.speechSynthesisNative) {
        try { window.speechSynthesisNative.speak(utter); }
        catch (e) { try { utter.onerror && utter.onerror({ error: String(e) }); } catch (_) {} }
        return;
      }
      const text = (utter.text != null) ? String(utter.text) : '';
      if (!text) return;
      const rateVal = (typeof utter.rate === 'number' && utter.rate > 0) ? utter.rate : (window.rate || 1);
      const volVal = (typeof utter.volume === 'number') ? utter.volume : getSafeVolume();
      const voiceName = resolveVoiceName();
      Engine.token++;
      teardownAudio();
      const token = Engine.token;
      (async () => {
        let url;
        try {
          url = await geminiSynth(text, voiceName);
        } catch (e) {
          if (token !== Engine.token) return;
          console.error('Gemini TTS failed:', e);
          // Safety-filter false-positives are per-segment recoverable (caller
          // skips to next segment). Don't block the UI with a red toast for
          // those; keep it for real errors (quota, network, bad key, etc.).
          const msg = (e && e.message) ? e.message : String(e);
          const isSafetySkip = /PROHIBITED_CONTENT|SAFETY|no audio in response/i.test(msg);
          if (!isSafetySkip && typeof window.showNotification === 'function') {
            window.showNotification('Gemini TTS: ' + msg, 'error');
          }
          try { utter.onerror && utter.onerror({ error: msg }); } catch (_) {}
          return;
        }
        if (token !== Engine.token) return;
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.volume = Number.isFinite(volVal) ? Math.max(0, Math.min(1, volVal)) : 1;
        try { audio.playbackRate = Math.max(0.25, Math.min(4, Number(rateVal) || 1)); } catch (_) {}
        try { audio.preservesPitch = true; } catch (_) {}
        Engine.audio = audio;
        audio.onplay = () => {
          if (token !== Engine.token) return;
          try { utter.onstart && utter.onstart({}); } catch (_) {}
        };
        audio.onended = () => {
          if (token !== Engine.token) return;
          try { utter.onend && utter.onend({}); } catch (_) {}
        };
        audio.onerror = () => {
          if (token !== Engine.token) return;
          try { utter.onerror && utter.onerror({ error: 'audio_error' }); } catch (_) {}
        };
        try { await audio.play(); }
        catch (e) {
          if (token !== Engine.token) return;
          console.error('Audio play failed:', e);
          try { utter.onerror && utter.onerror({ error: 'autoplay_blocked' }); } catch (_) {}
        }
      })();
    },
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
            <button type="button" id="geminiApiKeyTest"
                    style="padding:4px 12px;border:1px solid var(--border,#ccc);border-radius:6px;cursor:pointer;background:var(--btn-bg,transparent);color:inherit;">测试</button>
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
        <!-- ---- Reading Analyzer T16: autoplay preanalyze toggle (UI only) ----
             Persists yomikikuan_analyzer_autoplay_preanalyze ('true' | absent).
             Wiring this to playback requires a sentence-change event we cannot
             expose without modifying playback code (forbidden by CLAUDE.md
             "Playback pipeline boundary"). The setting is stored so a future
             playback hook can read it from localStorage without touching
             playback today. -->
        <div class="control-group full-width" id="analyzerPreanalyzeRow">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="analyzerPreanalyzeToggle">
            <span id="analyzerPreanalyzeLabel" class="label-text">Auto-analyze sentence during playback</span>
          </label>
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
    // #4 — Test button: ping Gemini with a trivial TTS request, report result.
    const testBtn = root.querySelector('#geminiApiKeyTest');
    testBtn && testBtn.addEventListener('click', async () => {
      const key = (input.value || '').trim() || (window.getGeminiApiKey ? window.getGeminiApiKey() : '');
      if (!key) { status.textContent = '未设置，无法测试'; return; }
      const prevLabel = testBtn.textContent;
      testBtn.disabled = true;
      testBtn.textContent = '测试中…';
      status.textContent = '正在请求 Gemini…';
      try {
        const res = await fetch(`${GEMINI_ENDPOINT(GEMINI_MODEL)}?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'こんにちは' }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
            },
          }),
        });
        if (res.ok) {
          status.textContent = `✓ 连接成功 (${key.slice(0, 6)}…${key.slice(-4)})`;
        } else if (res.status === 400) {
          status.textContent = `✗ HTTP 400：key 无效或请求格式错误`;
        } else if (res.status === 401 || res.status === 403) {
          status.textContent = `✗ HTTP ${res.status}：key 无权限或已吊销`;
        } else if (res.status === 429) {
          status.textContent = `✗ HTTP 429：配额超限，但 key 本身有效`;
        } else {
          const body = await res.text().catch(() => '');
          status.textContent = `✗ HTTP ${res.status}${body ? '：' + body.slice(0, 80) : ''}`;
        }
      } catch (err) {
        status.textContent = `✗ 网络错误：${(err && err.message) || String(err)}`;
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = prevLabel;
      }
    });
    styleInput && styleInput.addEventListener('change', () => {
      try {
        const v = (styleInput.value || '').trim();
        if (v) localStorage.setItem(STYLE_LS, v);
        else localStorage.removeItem(STYLE_LS);
      } catch (_) {}
    });

    // ---- Reading Analyzer T16: preanalyze toggle wiring (UI only) ----------
    // Persists localStorage.yomikikuan_analyzer_autoplay_preanalyze ('true' | absent).
    // No playback hook here on purpose — see comment in buildGeminiSettingsSection.
    const PREANALYZE_LS = 'yomikikuan_analyzer_autoplay_preanalyze';
    const preanalyzeToggle = root.querySelector('#analyzerPreanalyzeToggle');
    const preanalyzeLabel = root.querySelector('#analyzerPreanalyzeLabel');
    if (preanalyzeLabel && typeof window.YomikikuanGetText === 'function') {
      try {
        const localized = window.YomikikuanGetText('analyzer.settings.preanalyze',
          'Auto-analyze sentence during playback');
        if (typeof localized === 'string' && localized.length > 0) preanalyzeLabel.textContent = localized;
      } catch (_) {}
    }
    if (preanalyzeToggle) {
      try { preanalyzeToggle.checked = localStorage.getItem(PREANALYZE_LS) === 'true'; } catch (_) {}
      preanalyzeToggle.addEventListener('change', () => {
        try {
          if (preanalyzeToggle.checked) localStorage.setItem(PREANALYZE_LS, 'true');
          else localStorage.removeItem(PREANALYZE_LS);
        } catch (_) {}
      });
    }
    // ---- end T16 -----------------------------------------------------------
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

})();
