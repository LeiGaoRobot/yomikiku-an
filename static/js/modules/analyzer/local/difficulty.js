// Local difficulty analyzer. No network. Returns JLPT-ish level + histograms.
// Kuromoji accessor: the plan assumed `window.kuromojiReady` but this project
// does NOT expose that. Kuromoji is loaded as a classic script at
// `static/libs/kuromoji.js` which sets `window.kuromoji` (with `.builder()`).
// The shared `./tokenizer.js` helper memoizes a single builder build and is
// reused across analyzer/local modules (difficulty, syntax, ...).
import { classifyWord } from './jlpt-vocab.js';
import { kanjiGrade } from './jlpt-kanji.js';
import { tokenize } from './tokenizer.js';

const JAPANESE_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

export async function analyzeDifficulty(text) {
  if (!text || !JAPANESE_RE.test(text)) {
    return {
      level: 'n/a',
      vocab: null,
      kanjiHistogram: null,
      avgSentenceLen: 0,
      readingTimeMin: 0,
      computedAt: Date.now(),
    };
  }
  const tokens = await tokenize(text);
  const vocab = { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0, unknown: 0 };
  for (const t of tokens) {
    const cls = classifyWord(t.basic_form || t.surface_form, t.pos);
    vocab[cls]++;
  }
  const kanjiHistogram = { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0, unknown: 0 };
  for (const ch of text) {
    if (ch >= '\u4E00' && ch <= '\u9FFF') {
      const g = kanjiGrade(ch);
      kanjiHistogram[g || 'unknown']++;
    }
  }
  const sentences = text.split(/[。！？\n]+/).filter((s) => s.trim());
  const avgSentenceLen = sentences.length ? Math.round(text.length / sentences.length) : 0;
  const readingTimeMin = Math.max(1, Math.round(text.length / 400));
  return {
    level: pickLevel(vocab, kanjiHistogram),
    vocab,
    kanjiHistogram,
    avgSentenceLen,
    readingTimeMin,
    computedAt: Date.now(),
  };
}

function pickLevel(vocab, kanji) {
  const total = Object.values(vocab).reduce((a, b) => a + b, 0) || 1;
  // If classifier couldn't bucket most tokens (dict not loaded, or very rare text),
  // don't misreport as beginner — return n/a so UI can hide the badge.
  if ((vocab.unknown || 0) / total > 0.9) return 'n/a';
  const share = (bucket) => bucket.reduce((a, k) => a + (vocab[k] || 0), 0) / total;
  if (share(['N1']) > 0.05 || (kanji.N1 || 0) > 3) return 'n1';
  if (share(['N1', 'N2']) > 0.1) return 'n2';
  if (share(['N1', 'N2', 'N3']) > 0.15) return 'n3';
  if (share(['N1', 'N2', 'N3', 'N4']) > 0.25) return 'n4';
  return 'n5';
}
