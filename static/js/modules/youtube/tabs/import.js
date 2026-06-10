// (A) 字幕导入 — Gemini transcribes the video's Japanese audio to plain
// text, then docs.createDocument() saves it as a new document. From there
// the user gets full TTS / analyzer / JLPT integration "for free" — this
// tab does not touch the playback boundary.

import { callGeminiYoutube } from '../gemini-yt.js';
import { buildTranscriptPrompt } from '../prompts.js';
import * as cache from '../../analyzer/cache/idb.js';
import * as docs  from '../../docs/store.js';

const PROVIDER_ID = 'yt-transcript';
const SCHEMA_VERSION = 1;

function urlFor(videoId) { return `https://www.youtube.com/watch?v=${videoId}`; }
function cacheKey(parsed) {
  return JSON.stringify({ id: parsed.videoId, s: parsed.startSec || 0, e: parsed.endSec || 0 });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export function render(root, ctx) {
  const { parsed, meta } = ctx;
  root.innerHTML = `
    <p style="opacity:.7;font-size:13px;margin-top:0">
      把视频字幕转录后保存为新文档，可立即用 TTS / 分析器 / JLPT 工具阅读。
    </p>
    <button id="ytImportBtn" type="button"
            style="padding:8px 14px;border:1px solid var(--border,rgba(0,0,0,0.15));
                   border-radius:8px;background:var(--btn-bg,#f3f3f5);cursor:pointer">
      📥 提取字幕并保存为文档
    </button>
    <div id="ytImportStatus" style="margin-top:10px;font-size:13px"></div>`;

  const status = root.querySelector('#ytImportStatus');
  const btn = root.querySelector('#ytImportBtn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.textContent = '正在转录…（首次约需 30–60 秒）';
    try {
      const key = cacheKey(parsed);
      let text = await cache.get(key, PROVIDER_ID, SCHEMA_VERSION);
      if (!text) {
        text = await callGeminiYoutube(
          urlFor(parsed.videoId),
          buildTranscriptPrompt(),
          { startSec: parsed.startSec, endSec: parsed.endSec }
        );
        if (typeof text === 'string' && text.trim() === 'NO_JAPANESE_AUDIO') {
          throw new Error('NO_JAPANESE_AUDIO');
        }
        await cache.put(key, PROVIDER_ID, SCHEMA_VERSION, text);
      }
      const titleLine = meta && meta.title ? `# ${meta.title}\n\n` : '';
      const created = docs.createDocument(titleLine + text);
      if (created && created.id) {
        docs.setActiveId(created.id);
        try { docs.render(); } catch (_) {}
        try { docs.loadActiveDocument(); } catch (_) {}
        status.innerHTML =
          `✓ 已保存为文档 <strong>${escapeHtml((meta && meta.title) || created.id)}</strong>`;
      } else {
        status.textContent = '✓ 已保存（请在文档列表查看）';
      }
    } catch (err) {
      status.textContent =
        err.message === 'NO_API_KEY'        ? '❌ 缺少 Gemini API key'
      : err.message === 'NO_JAPANESE_AUDIO' ? '❌ 视频没有日语音轨'
      : err.message === 'RATE_LIMITED'      ? '❌ 速率受限，请稍后再试'
      : `❌ ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });
}

export function teardown() { /* nothing async to clean up */ }
