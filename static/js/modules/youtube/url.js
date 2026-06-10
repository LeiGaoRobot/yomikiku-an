// Pure URL parser for YouTube links. Returns { videoId, startSec?, endSec? }
// or null on any unrecognised input. No side effects, no DOM, no fetch —
// safe to import at module scope.

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function parseTimeParam(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

export function parseYoutubeUrl(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // Bare 11-char ID shortcut.
  if (VIDEO_ID_RE.test(raw)) return { videoId: raw };

  let url;
  try { url = new URL(raw); }
  catch (_) { return null; }

  const host = url.hostname.replace(/^www\./, '');
  let videoId = null;

  if (host === 'youtu.be') {
    videoId = url.pathname.slice(1).split('/')[0] || null;
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else {
      const parts = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'v', 'live'].includes(parts[0])) {
        videoId = parts[1] || null;
      }
    }
  }

  if (!videoId || !VIDEO_ID_RE.test(videoId)) return null;

  const out = { videoId };
  const startSec = parseTimeParam(url.searchParams.get('t'))
                ?? parseTimeParam(url.searchParams.get('start'));
  if (typeof startSec === 'number') out.startSec = startSec;
  const endSec = parseTimeParam(url.searchParams.get('end'));
  if (typeof endSec === 'number') out.endSec = endSec;
  return out;
}
