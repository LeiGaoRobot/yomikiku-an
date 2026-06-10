// (C) 听力题 — Gemini generates JLPT-style questions FROM the video's
// Japanese audio (the prompt directs the model to listen rather than read
// a source article). Renders via the existing analyzer/ui/jlpt/renderers
// module so the question-shape contract stays identical.

import { callGeminiYoutube } from '../gemini-yt.js';
import { buildJlptPrompt } from '../prompts.js';
import { MODE_META, stripFences } from '../../analyzer/ui/jlpt/prompts.js';
import { renderForMode, injectCss as injectRenderersCss, stopAll }
  from '../../analyzer/ui/jlpt/renderers.js';
import * as cache from '../../analyzer/cache/idb.js';

const PROVIDER_ID = 'yt-jlpt';
const SCHEMA_VERSION = 1;

function urlFor(id) { return `https://www.youtube.com/watch?v=${id}`; }
function cacheKey({ parsed, mode, level, count }) {
  return JSON.stringify({
    id: parsed.videoId,
    s: parsed.startSec || 0,
    e: parsed.endSec || 0,
    mode, level, count,
  });
}

export function render(root, ctx) {
  injectRenderersCss();
  const modeOpts = Object.entries(MODE_META)
    .map(([k, v]) => `<option value="${k}">${v.emoji} ${v.nameJa} — ${v.nameZh}</option>`)
    .join('');
  root.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
      <select id="ytLisMode" style="padding:6px 8px">${modeOpts}</select>
      <select id="ytLisLevel" style="padding:6px 8px">
        ${['N5','N4','N3','N2','N1'].map(l => `<option value="${l}"${l==='N3'?' selected':''}>${l}</option>`).join('')}
      </select>
      <input type="number" id="ytLisCount" min="1" max="5" value="3" style="width:64px;padding:6px 8px">
      <button id="ytLisGo" type="button"
              style="padding:6px 14px;border:1px solid var(--border,rgba(0,0,0,0.15));
                     border-radius:8px;background:var(--btn-bg,#f3f3f5);cursor:pointer">
        生成听力题
      </button>
    </div>
    <div id="ytLisStatus" style="font-size:13px;opacity:.7"></div>
    <div id="ytLisOut"></div>`;

  const status = root.querySelector('#ytLisStatus');
  const out    = root.querySelector('#ytLisOut');
  const go     = root.querySelector('#ytLisGo');

  go.addEventListener('click', async () => {
    const mode  = root.querySelector('#ytLisMode').value;
    const level = root.querySelector('#ytLisLevel').value;
    const count = Math.max(1, Math.min(5, Number(root.querySelector('#ytLisCount').value) || 3));
    go.disabled = true;
    status.textContent = '生成中…（约 30–90 秒）';
    out.innerHTML = '';
    try {
      const key = cacheKey({ parsed: ctx.parsed, mode, level, count });
      let raw = await cache.get(key, PROVIDER_ID, SCHEMA_VERSION);
      if (!raw) {
        raw = await callGeminiYoutube(
          urlFor(ctx.parsed.videoId),
          buildJlptPrompt({ level, count, mode }),
          { startSec: ctx.parsed.startSec, endSec: ctx.parsed.endSec }
        );
        await cache.put(key, PROVIDER_ID, SCHEMA_VERSION, raw);
      }
      const data = JSON.parse(stripFences(raw));
      if (data && data.error === 'NO_JAPANESE_AUDIO') throw new Error('NO_JAPANESE_AUDIO');
      // The prompt template includes `"mode": "<mode>"` in its JSON, but a
      // defensive override keeps renderForMode happy when models drift.
      if (data && !data.mode) data.mode = mode;
      status.textContent = '';
      renderForMode(out, data);
    } catch (err) {
      status.textContent =
        err.message === 'NO_API_KEY'        ? '❌ 缺少 Gemini API key'
      : err.message === 'NO_JAPANESE_AUDIO' ? '❌ 视频没有日语音轨'
      : err.message === 'RATE_LIMITED'      ? '❌ 速率受限，请稍后再试'
      : `❌ ${err.message}`;
    } finally {
      go.disabled = false;
    }
  });
}

export function teardown() {
  try { stopAll(); } catch (_) {}
}
