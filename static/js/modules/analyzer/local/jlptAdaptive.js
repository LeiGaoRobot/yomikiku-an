// JLPT 自适应难度推荐
//
// Derives a recommended JLPT level ('N5'..'N1') from the user's recent
// JLPT-question answer history stored in the SRS mistake book. Uses a
// simple threshold rule against per-level accuracy so the result is
// easy to explain to users:
//
//   accuracy > 80%  → bump level up one (N3 → N2, N2 → N1, etc.)
//   accuracy < 50%  → bump level down one
//   otherwise       → hold at the current level
//
// Only acts when ≥ MIN_SAMPLES recent answered questions are available
// for the anchor level — otherwise returns the fallback (user's last
// confirmed recommendation, or N3 if none).
//
// Signal source: the SRS mistake book records every JLPT answer that
// gets written via __yomikikuanAddMistake — in the current UI that's
// only WRONG answers. So the "correct count" we derive from matching
// userAnswerIndex === correctIndex will typically be 0 in the anchor
// level. We treat that as a low-accuracy signal for the anchor but do
// NOT bump down on a single session — require MIN_SAMPLES records.
//
// Public surface:
//   deriveRecommendation({ mistakes, nowMs? }) -> {
//     level: 'N1'..'N5',
//     anchor: 'N1'..'N5',
//     accuracy: number | null,
//     sample: number,
//     confidence: 'low'|'med'|'high',
//     reason: string,   // i18n key for UI
//   }
//   loadCached() -> { level, ts } | null
//   saveCached(level) -> void
//   recommendLevel({ srs, nowMs? }) -> Promise<above>

const LS_KEY = 'yomikikuan_jlpt_recommended';
const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1']; // ascending difficulty
const DEFAULT_LEVEL = 'N3';
const MIN_SAMPLES = 3;
const WINDOW_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

function levelIndex(lv) { return LEVELS.indexOf(lv); }
function clampLevel(i) { return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))]; }

export function loadCached() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !LEVELS.includes(obj.level)) return null;
    return { level: obj.level, ts: Number(obj.ts) || 0 };
  } catch (_) { return null; }
}

export function saveCached(level) {
  if (!LEVELS.includes(level)) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ level, ts: Date.now() }));
  } catch (_) {}
}

/**
 * Pure derivation. No side effects. Inputs:
 *   mistakes — array matching srs.listMistakes() shape
 *   nowMs    — time reference (for testing)
 */
export function deriveRecommendation({ mistakes, nowMs = Date.now() } = {}) {
  const arr = Array.isArray(mistakes) ? mistakes : [];
  const cached = loadCached();
  const anchor = (cached && cached.level) || DEFAULT_LEVEL;

  const recent = arr.filter((m) => {
    const t = Number(m.createdAt) || 0;
    return t > 0 && nowMs - t <= WINDOW_MS;
  });

  const byLevel = {};
  recent.forEach((m) => {
    const lv = String(m.level || '').trim();
    if (!LEVELS.includes(lv)) return;
    if (!byLevel[lv]) byLevel[lv] = { total: 0, correct: 0 };
    byLevel[lv].total += 1;
    if (Number(m.userAnswerIndex) === Number(m.correctIndex)) {
      byLevel[lv].correct += 1;
    }
  });

  const anchorStats = byLevel[anchor];
  if (!anchorStats || anchorStats.total < MIN_SAMPLES) {
    return {
      level: anchor,
      anchor,
      accuracy: anchorStats ? anchorStats.correct / anchorStats.total : null,
      sample: anchorStats ? anchorStats.total : 0,
      confidence: 'low',
      reason: 'panel.jlpt.recommend.low_confidence',
    };
  }

  const acc = anchorStats.correct / anchorStats.total;
  const confidence = anchorStats.total >= 10 ? 'high' : 'med';

  let nextIdx = levelIndex(anchor);
  let reason = 'panel.jlpt.recommend.hold';
  if (acc > 0.8) {
    nextIdx += 1;
    reason = 'panel.jlpt.recommend.bump_up';
  } else if (acc < 0.5) {
    nextIdx -= 1;
    reason = 'panel.jlpt.recommend.bump_down';
  }
  const nextLevel = clampLevel(nextIdx);

  return {
    level: nextLevel,
    anchor,
    accuracy: acc,
    sample: anchorStats.total,
    confidence,
    reason,
  };
}

/**
 * Convenience wrapper: reads from the SRS store module and updates the
 * cached recommendation on its way out. Callers should treat the result
 * as advisory — the JLPT panel still lets the user override the level.
 */
export async function recommendLevel({ srs, nowMs = Date.now() } = {}) {
  if (!srs || typeof srs.listMistakes !== 'function') {
    return {
      level: DEFAULT_LEVEL, anchor: null, accuracy: null, sample: 0,
      confidence: 'low', reason: 'panel.jlpt.recommend.low_confidence',
    };
  }
  let mistakes = [];
  try { mistakes = await srs.listMistakes({ bucket: 'all' }); }
  catch (_) { /* fall through with empty */ }
  const rec = deriveRecommendation({ mistakes, nowMs });
  try { saveCached(rec.level); } catch (_) {}
  return rec;
}
