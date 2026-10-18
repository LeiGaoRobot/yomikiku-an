// Best-effort video-duration probe via the YouTube IFrame Player API.
//
// Why this exists: the keyless oEmbed endpoint exposes no duration field, and
// an explicit ?start=&end= clip range (checked in ./index.js) is the only
// other free signal. The IFrame Player's getDuration() is the only keyless
// way to learn the real length of the whole video — but it is only available
// after a player has loaded, which is why the probe lives here and is awaited
// once at parse time (before any Gemini call) rather than per tab.
//
// The probe creates a hidden 1×1 player, waits for readiness, reads
// getDuration(), then destroys the player. Any failure/timeout resolves to
// `null` so callers fall back to the clip-range gate instead of blocking the
// user (offline / blocked iframe API / embed-disabled videos).
//
// This module must stay independent of the main-js.js playback boundary; it
// only talks to the YouTube IFrame API.

export const DEFAULT_MAX_DURATION_SEC = 600;

/** True only for a finite positive duration above the cap. `null` (unknown) is not "too long". */
export function exceedsMaxDuration(durationSec, maxSec = DEFAULT_MAX_DURATION_SEC) {
  return typeof durationSec === 'number'
    && Number.isFinite(durationSec)
    && durationSec > maxSec;
}

/** 62 → "1:02", 600 → "10:00". Used for user-facing messages; NaN → "". */
export function formatDurationMmSs(totalSec) {
  if (typeof totalSec !== 'number' || !Number.isFinite(totalSec) || totalSec < 0) return '';
  const s = Math.round(totalSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function ensureIframeApi() {
  return new Promise((resolve, reject) => {
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
      s.addEventListener('error', () => reject(new Error('iframe-api-load-failed')));
      document.head.appendChild(s);
    }
  });
}

/**
 * Resolve the full duration of a YouTube video in seconds, or `null` if it
 * cannot be determined within `timeoutMs`.
 *
 * @param {string} videoId
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<number|null>}
 */
export function probeVideoDuration(videoId, { timeoutMs = 8000 } = {}) {
  if (typeof document === 'undefined' || !videoId || typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let done = false;
    let player = null;
    let host = null;
    let timer = null;

    const finish = (value) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { if (player && typeof player.destroy === 'function') player.destroy(); } catch (_) {}
      try { if (host) host.remove(); } catch (_) {}
      resolve(value);
    };

    timer = setTimeout(() => finish(null), timeoutMs);

    ensureIframeApi().then(() => {
      if (done) return;
      host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;overflow:hidden;pointer-events:none;';
      document.body.appendChild(host);
      const mount = document.createElement('div');
      host.appendChild(mount);
      try {
        player = new window.YT.Player(mount, {
          videoId,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, rel: 0, playsinline: 1 },
          events: {
            onReady: (ev) => {
              let d = null;
              try { d = ev.target.getDuration(); } catch (_) {}
              finish(typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : null);
            },
            onError: () => finish(null),
          },
        });
      } catch (_) {
        finish(null);
      }
    }).catch(() => finish(null));
  });
}
