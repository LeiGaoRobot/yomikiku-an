// Display-layer token transformations — extracted from main-js.js
// `displayResults` (Phase 1). All four functions are pure: arrays of
// tokens in, arrays of tokens out, no DOM / I/O / closure capture.
// They prepare tokenizer output for rendering by:
//
//  1. mergeTokensForDisplay   — date phrases (数字+年/月/日) and verb/adj
//                               + て/で/た inflections collapse into one
//                               token with the correct compound reading.
//  2. splitKatakanaCompounds  — names like 「スマートフォンアプリ」 are
//                               split into smaller, more searchable pieces
//                               using suffix + inner-split tables.
//  3. splitLeadingParticleVerbTeDe — fixes mis-tokenization of
//                                    「を通じて／を通して」 etc. into a
//                                    proper を-particle + て/で-verb pair.
//  4. reflowLeadingPunctuation — moves any leading punctuation token of
//                                a line to the tail of the previous
//                                line (avoids 行頭禁則 punctuation).
//                                First-line punctuation is kept to avoid
//                                losing content.
//
// Token shape (informal): { surface, reading, lemma, pos: string|string[] }.
// All functions tolerate missing fields and never mutate inputs in place.

const KATAKANA_RE = /^[゠-ヿー・]+$/;
const DIGITS_RE   = /^[0-9０-９]+$/;
const FULLWIDTH_DIGIT_OFFSET = 0xFEE0;
const TE_DE_SET = new Set(['て', 'で']);
const TA_SET    = new Set(['た']);
const VERB_OR_ADJ = new Set(['動詞', '形容詞']);
const PUNCT_POS = new Set(['記号', '補助記号']);

const MONTH_READING = {
  1: 'いち', 2: 'に', 3: 'さん', 4: 'し', 5: 'ご', 6: 'ろく',
  7: 'しち', 8: 'はち', 9: 'く', 10: 'じゅう',
  11: 'じゅういち', 12: 'じゅうに',
};
const DAY_READING = {
  1:  'ついたち', 2:  'ふつか', 3:  'みっか', 4:  'よっか',
  5:  'いつか',   6:  'むいか', 7:  'なのか', 8:  'ようか',
  9:  'ここのか', 10: 'とおか',
  14: 'じゅうよっか', 20: 'はつか', 24: 'にじゅうよっか',
};

const KATAKANA_SUFFIXES = ['アプリ', 'サイト', 'サービス', 'システム', 'インターフェース'];
const KATAKANA_INNER_SPLITS = {
  'スマートフォン': ['スマート', 'フォン'],
};

function toAsciiDigits(s) {
  return String(s || '').replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - FULLWIDTH_DIGIT_OFFSET)
  );
}
function isDigitsOnly(s) {
  return DIGITS_RE.test(s || '');
}
function isKatakana(s) {
  return KATAKANA_RE.test(String(s || ''));
}
function getMainPos(tok) {
  if (!tok) return '';
  const p = Array.isArray(tok.pos) ? tok.pos : [tok.pos || ''];
  return p[0] || '';
}

/**
 * Merge digit + 年/月/日 and verb/adj + て/で/た token pairs into a single
 * token with a compound reading suitable for display.
 * Pure: returns a new array; never mutates inputs.
 */
export function mergeTokensForDisplay(tokens) {
  if (!Array.isArray(tokens)) return [];
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    const next = tokens[i + 1];

    if (next) {
      const curSurface  = (cur && cur.surface)  || '';
      const nextSurface = (next && next.surface) || '';

      // Rule 1: digit + 年/月/日
      if (isDigitsOnly(curSurface)
          && (nextSurface === '年' || nextSurface === '月' || nextSurface === '日')) {
        const n = parseInt(toAsciiDigits(curSurface), 10);
        let reading = '';
        if (nextSurface === '年') {
          const base = cur.reading || curSurface;
          reading = base + 'ねん';
        } else if (nextSurface === '月') {
          const base = (cur.reading && cur.reading !== curSurface)
            ? cur.reading
            : (MONTH_READING[n] || (cur.reading || curSurface));
          reading = base + 'がつ';
        } else if (nextSurface === '日') {
          if (DAY_READING[n]) reading = DAY_READING[n];
          else {
            const base = cur.reading || curSurface;
            reading = base + 'にち';
          }
        }
        out.push({
          surface: curSurface + nextSurface,
          reading,
          lemma: (cur.lemma) || (curSurface + nextSurface),
          pos: Array.isArray(next.pos) ? next.pos.slice() : [next.pos || '名'],
        });
        i++;
        continue;
      }

      // Rule 2: verb/adj + て/で (助詞) or verb/adj + た (助動詞)
      const curMain  = getMainPos(cur);
      const nextMain = getMainPos(next);
      const ruleTeDe = VERB_OR_ADJ.has(curMain) && nextMain === '助詞' && TE_DE_SET.has(nextSurface);
      const ruleTa   = VERB_OR_ADJ.has(curMain) && nextMain === '助動詞' && TA_SET.has(nextSurface);
      if (ruleTeDe || ruleTa) {
        out.push({
          surface: ((cur && cur.surface) || '') + nextSurface,
          reading: ((cur && cur.reading) || '') + ((next && next.reading) || nextSurface),
          lemma: (cur && cur.lemma) || (cur && cur.surface) || (((cur && cur.surface) || '') + nextSurface),
          pos: Array.isArray(cur && cur.pos) ? cur.pos.slice() : [(cur && cur.pos) || '動詞'],
        });
        i++;
        continue;
      }
    }

    out.push(cur);
  }
  return out;
}

/**
 * Split katakana compound nouns into smaller pieces using a suffix
 * dictionary and an "inner-split" lookup table. Useful for words like
 * 「スマートフォンアプリ」 → 「スマート」「フォン」「アプリ」.
 * Pure: returns a new array; never mutates inputs.
 */
export function splitKatakanaCompounds(tokens, options) {
  if (!Array.isArray(tokens)) return [];
  const opts = options || {};
  const suffixes    = Array.isArray(opts.suffixes)    ? opts.suffixes    : KATAKANA_SUFFIXES;
  const innerSplits = (opts.innerSplits && typeof opts.innerSplits === 'object')
    ? opts.innerSplits
    : KATAKANA_INNER_SPLITS;

  const out = [];
  for (const tok of tokens) {
    const surface = (tok && tok.surface) || '';
    const mainPos = getMainPos(tok);

    if (mainPos === '名詞' && isKatakana(surface)) {
      const readingFull = (tok && tok.reading) || surface;

      // Case A: full surface hits the inner-split table
      const directInner = innerSplits[surface];
      if (directInner) {
        const left  = directInner[0];
        const right = directInner[1];
        const leftReading  = readingFull.slice(0, left.length);
        const rightReading = readingFull.slice(left.length);
        out.push({ surface: left,  lemma: tok.lemma || left,  reading: leftReading,  pos: tok.pos });
        out.push({ surface: right, lemma: right,             reading: rightReading, pos: tok.pos });
        continue;
      }

      // Case B: suffix match → split prefix + suffix; prefix may further split
      const suf = suffixes.find((sf) => surface.endsWith(sf) && surface.length > sf.length);
      if (suf) {
        const prefix = surface.slice(0, surface.length - suf.length);
        const prefixReading = readingFull.slice(0, prefix.length);
        const suffixReading = readingFull.slice(prefix.length);

        const inner = innerSplits[prefix];
        if (inner) {
          const left  = inner[0];
          const right = inner[1];
          const leftReading  = prefixReading.slice(0, left.length);
          const rightReading = prefixReading.slice(left.length);
          out.push({ surface: left,  lemma: tok.lemma || left,  reading: leftReading,  pos: tok.pos });
          out.push({ surface: right, lemma: right,             reading: rightReading, pos: tok.pos });
        } else {
          out.push({ surface: prefix, lemma: tok.lemma || prefix, reading: prefixReading, pos: tok.pos });
        }
        out.push({ surface: suf, lemma: suf, reading: suffixReading || suf, pos: tok.pos });
        continue;
      }
    }

    out.push(tok);
  }
  return out;
}

/**
 * Split a leading-particle-verb mistake like 「を通じて」 (mis-tokenized
 * as a single 助詞) into 「を」 (助詞) + 「通じて」 (動詞). Triggers only
 * for tokens whose surface matches /^を.+[てで]$/ and whose main POS is
 * 助詞.
 * Pure: returns a new array; never mutates inputs.
 */
export function splitLeadingParticleVerbTeDe(tokens) {
  if (!Array.isArray(tokens)) return [];
  const out = [];
  for (const tok of tokens) {
    const surface = (tok && tok.surface) || '';
    const mainPos = getMainPos(tok);

    if (mainPos === '助詞' && /^を.+[てで]$/.test(surface) && surface.length > 2) {
      const readingFull = (tok && tok.reading) || surface;
      const headSurface = 'を';
      const tailSurface = surface.slice(1);
      const headReading = readingFull.slice(0, 1);
      const tailReading = readingFull.slice(1);

      out.push({
        surface: headSurface,
        lemma:   headSurface,
        reading: headReading,
        pos: ['助詞'],
      });
      out.push({
        surface: tailSurface,
        lemma:   tok.lemma || tailSurface,
        reading: tailReading,
        pos: ['動詞'],
      });
      continue;
    }
    out.push(tok);
  }
  return out;
}

/**
 * Move a line's leading punctuation tokens to the tail of the previous
 * line. Avoids 行頭禁則 punctuation. The first line keeps its leading
 * punctuation to avoid losing content.
 *
 * Token-level shallow-copy semantics: each line is sliced (`Array.slice`)
 * and original line arrays are never mutated. Token objects themselves
 * are not cloned (they're moved by reference).
 */
export function reflowLeadingPunctuation(lines) {
  if (!Array.isArray(lines)) return [];
  const adjusted = [];
  for (let i = 0; i < lines.length; i++) {
    const line = Array.isArray(lines[i]) ? lines[i].slice() : [];
    if (line.length === 0) { adjusted.push(line); continue; }

    while (line.length > 0) {
      const first = line[0];
      const posArr = Array.isArray(first && first.pos) ? first.pos : [(first && first.pos) || ''];
      const mainPos = posArr[0] || '';
      if (!PUNCT_POS.has(mainPos)) break;
      if (adjusted.length > 0 && Array.isArray(adjusted[adjusted.length - 1])) {
        adjusted[adjusted.length - 1].push(first);
        line.shift();
      } else {
        break;
      }
    }
    adjusted.push(line);
  }
  return adjusted;
}

if (typeof window !== 'undefined') {
  window.YomikikuanDisplayTokens = {
    mergeTokensForDisplay,
    splitKatakanaCompounds,
    splitLeadingParticleVerbTeDe,
    reflowLeadingPunctuation,
  };
}
