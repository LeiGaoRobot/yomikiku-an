// (B) 视频伴读 — embed YouTube IFrame Player + timed subtitles.
// Independent of main-js.js playback state. The player owns its own audio;
// we only read currentTime to highlight the active subtitle line. The 🔍
// per-line analyze button delegates to window.__yomikikuanAnalyzeLine via
// a temporary `.line-container` carrier, since the handler reads sentence
// text via extractSentenceText() over the surrounding line container.

import { callGeminiYoutube } from '../gemini-yt.js';
import { buildTimedTranscriptPrompt } from '../prompts.js';
import * as cache from '../../analyzer/cache/idb.js';
import { findActiveIndex } from './companion-sync.js';

const PROVIDER_ID = 'yt-transcript-timed';
const SCHEMA_VERSION = 1;

let pollTimer = null;
let player    = null;
let segments  = [];

function urlFor(id) { return `https://www.youtube.com/watch?v=${id}`; }
function cacheKey(parsed) {
  return JSON.stringify({ id: parsed.videoId, s: parsed.startSec || 0, e: parsed.endSec || 0 });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function ensureIframeApi() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve();
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try { if (typeof prior === 'function') prior(); } catch (_) {}
      resolve();
    };
    if (!document.querySelector('script[data-yt-iframe]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.dataset.ytIframe = '1';
      document.head.appendChild(s);
    }
  });
}

function renderSubtitleList(root) {
  const list = root.querySelector('#ytSubs');
  list.innerHTML = segments.map((s, i) => `
    <div class="yt-sub" data-i="${i}" data-start="${s.start}">
      <button type="button" class="yt-analyze" data-text="${escapeHtml(s.text || '')}" title="分析这一句">🔍</button>
      <span class="yt-sub-text">${escapeHtml(s.text || '')}</span>
    </div>`).join('');
  list.addEventListener('click', (e) => {
    const sub = e.target.closest('.yt-sub'); if (!sub) return;
    if (e.target.classList.contains('yt-analyze')) {
      const text = e.target.dataset.text;
      const fn = window.__yomikikuanAnalyzeLine;
      if (typeof fn === 'function') {
        const carrier = document.createElement('div');
        carrier.className = 'line-container';
        carrier.textContent = text;
        document.body.appendChild(carrier);
        try { fn({ stopPropagation() {}, target: carrier, currentTarget: carrier }); }
        finally { setTimeout(() => carrier.remove(), 200); }
      }
      return;
    }
    if (player && typeof player.seekTo === 'function') {
      player.seekTo(Number(sub.dataset.start), true);
    }
  });
}

function startPolling(root) {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!player || typeof player.getCurrentTime !== 'function') return;
    const t = player.getCurrentTime();
    const i = findActiveIndex(segments, t);
    root.querySelectorAll('.yt-sub.is-active').forEach(el => el.classList.remove('is-active'));
    if (i >= 0) {
      const el = root.querySelector(`.yt-sub[data-i="${i}"]`);
      if (el) {
        el.classList.add('is-active');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, 250);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

export async function render(root, ctx) {
  stopPolling();
  const { parsed } = ctx;
  root.innerHTML = `
    <style>
      .yt-companion { display:grid; grid-template-rows:auto 1fr; gap:12px; height:100%; }
      .yt-player-wrap { aspect-ratio: 16/9; background:#000; border-radius:8px; overflow:hidden; }
      #ytPlayer { width:100%; height:100%; border:0; }
      #ytSubs { max-height:50vh; overflow-y:auto;
                border:1px solid var(--border,rgba(0,0,0,0.08)); border-radius:8px; padding:6px; }
      .yt-sub { display:flex; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer;
                align-items:center; }
      .yt-sub:hover { background:rgba(0,0,0,0.04); }
      .yt-sub.is-active { background:rgba(0,113,227,.12); font-weight:600; }
      .yt-analyze { background:none; border:none; cursor:pointer; opacity:.6; padding:0 4px; }
      .yt-analyze:hover { opacity:1; }
    </style>
    <div class="yt-companion">
      <div class="yt-player-wrap"><div id="ytPlayer"></div></div>
      <div id="ytSubs">加载字幕中…</div>
    </div>`;

  // 1. Fetch (or load from cache) the timed transcript.
  let json;
  try {
    const key = cacheKey(parsed);
    let raw = await cache.get(key, PROVIDER_ID, SCHEMA_VERSION);
    if (!raw) {
      raw = await callGeminiYoutube(
        urlFor(parsed.videoId),
        buildTimedTranscriptPrompt(),
        { startSec: parsed.startSec, endSec: parsed.endSec }
      );
      await cache.put(key, PROVIDER_ID, SCHEMA_VERSION, raw);
    }
    const stripped = String(raw).trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    json = JSON.parse(stripped);
  } catch (err) {
    const msg = err.message === 'NO_API_KEY' ? '缺少 Gemini API key'
              : err.message === 'RATE_LIMITED' ? '速率受限，请稍后再试'
              : err.message;
    root.querySelector('#ytSubs').innerHTML =
      `<div style="color:#ff3b30">字幕加载失败：${escapeHtml(msg)}</div>`;
    return;
  }
  if (json && json.error === 'NO_JAPANESE_AUDIO') {
    root.querySelector('#ytSubs').innerHTML =
      `<div style="color:#ff3b30">视频没有日语音轨</div>`;
    return;
  }
  segments = Array.isArray(json) ? json : [];

  // 2. Mount the YouTube IFrame Player.
  try {
    await ensureIframeApi();
    player = new window.YT.Player(root.querySelector('#ytPlayer'), {
      videoId: parsed.videoId,
      playerVars: { start: parsed.startSec || 0 },
      events: {
        onReady:        () => startPolling(root),
        onStateChange:  () => { /* no-op */ },
        onError:        () => {
          root.querySelector('#ytSubs').insertAdjacentHTML('afterbegin',
            `<div style="color:#ff3b30;padding:6px 8px">⚠️ 视频无法嵌入（uploader 禁用 embed）</div>`);
        },
      },
    });
  } catch (err) {
    root.querySelector('#ytSubs').insertAdjacentHTML('afterbegin',
      `<div style="color:#ff3b30;padding:6px 8px">播放器初始化失败：${escapeHtml(err.message)}</div>`);
  }

  // 3. Render subtitle list.
  renderSubtitleList(root);
}

export function teardown() {
  stopPolling();
  if (player && typeof player.destroy === 'function') {
    try { player.destroy(); } catch (_) {}
  }
  player = null;
  segments = [];
}
