// Rule-based syntax tagger for a single Japanese sentence.
//
// `analyzeSyntax(text)` returns `{ tokens, phrases }` where each token carries
// a `role` in: subject | predicate | object | modifier | conjunction | other.
// This is a shallow left-to-right pass over Kuromoji output — NOT a real parse.
// `phrases` is an empty array in MVP (kept for future expansion).
//
// The caller is expected to split multi-sentence input before invocation.
//
// Rule order (first match wins on the initial pass; rules 4 and 5 may reassign
// afterwards):
//   1. Conjunction       — pos starts with 接続詞, OR 接続助詞 particle
//                          (が/ので/から/て/けど/のに)
//   2. Subject marker    — current token is 助詞 は/が → tag PREVIOUS token
//                          as subject (unless it was already `conjunction`)
//   3. Object marker     — current token is 助詞 を     → tag PREVIOUS token
//                          as object (unless it was already `conjunction`)
//   4. Predicate         — last non-punctuation token whose pos starts with
//                          動詞/形容詞/助動詞 → predicate
//   5. Modifier          — 連体詞, or 形容詞 immediately preceding a 名詞 →
//                          that 連体詞/形容詞 is a modifier
//   6. Fallback          — other

import { tokenize } from './tokenizer.js';

const CONJ_PARTICLE_SURFACES = new Set(['が', 'ので', 'から', 'て', 'けど', 'のに']);

function startsWith(pos, prefix) {
  return typeof pos === 'string' && pos.startsWith(prefix);
}

function isParticle(token) {
  return startsWith(token.pos, '助詞');
}

function isPunctuation(token) {
  return startsWith(token.pos, '記号');
}

function readingKanaOf(token) {
  return token.reading || token.surface_form || '';
}

export async function analyzeSyntax(text) {
  if (!text || !text.trim()) {
    return { tokens: [], phrases: [] };
  }
  const raw = await tokenize(text);

  // Build the result entries up front so later rules can rewrite .role.
  const tokens = raw.map((t) => ({
    surface: t.surface_form,
    pos: t.pos,
    role: 'other',
    readingKana: readingKanaOf(t),
  }));

  // Pass 1: rules 1–3 left-to-right.
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    const surface = t.surface_form;

    // Rule 1 — conjunction
    if (startsWith(t.pos, '接続詞')) {
      tokens[i].role = 'conjunction';
      continue;
    }
    if (isParticle(t) && CONJ_PARTICLE_SURFACES.has(surface)) {
      tokens[i].role = 'conjunction';
      continue;
    }

    // Rule 2 — subject marker は/が tags the previous token
    if (isParticle(t) && (surface === 'は' || surface === 'が')) {
      if (i > 0 && tokens[i - 1].role !== 'conjunction') {
        tokens[i - 1].role = 'subject';
      }
      continue;
    }

    // Rule 3 — object marker を tags the previous token
    if (isParticle(t) && surface === 'を') {
      if (i > 0 && tokens[i - 1].role !== 'conjunction') {
        tokens[i - 1].role = 'object';
      }
      continue;
    }
  }

  // Rule 4 — predicate: last non-punctuation token, if 動詞/形容詞/助動詞.
  let lastContentIdx = -1;
  for (let i = raw.length - 1; i >= 0; i--) {
    if (!isPunctuation(raw[i])) { lastContentIdx = i; break; }
  }
  if (lastContentIdx >= 0) {
    const last = raw[lastContentIdx];
    if (
      startsWith(last.pos, '動詞') ||
      startsWith(last.pos, '形容詞') ||
      startsWith(last.pos, '助動詞')
    ) {
      tokens[lastContentIdx].role = 'predicate';
    }
  }

  // Rule 5 — modifier:
  //   (a) 連体詞 anywhere → modifier
  //   (b) 形容詞 immediately followed by 名詞 → that 形容詞 is a modifier
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (startsWith(t.pos, '連体詞')) {
      tokens[i].role = 'modifier';
      continue;
    }
    if (startsWith(t.pos, '形容詞') && i + 1 < raw.length && startsWith(raw[i + 1].pos, '名詞')) {
      tokens[i].role = 'modifier';
    }
  }

  return { tokens, phrases: [] };
}
