// Pure text helpers extracted from main-js.js (Phase-1).
// - filterParentheses: strips kana-only parentheticals from analyzer input text.
//   Kanji- or English-bearing parentheticals are kept (they carry semantic content
//   the analyzer / TTS still wants).
// - computeStructureSignature: cheap fingerprint over line + sentence counts; used
//   by the textarea focus/blur handlers to decide whether structural changes warrant
//   a re-analysis.
// Both are pure (input -> string) and have no DOM / window dependencies.

const ZENKAKU_PAREN = /（([^）]+)）/g;
const HANKAKU_PAREN = /\(([^)]+)\)/g;
const KANJI_RE = /[一-龯]/;
const ENGLISH_RE = /[a-zA-Z]/;

function shouldKeepContent(content) {
  return KANJI_RE.test(content) || ENGLISH_RE.test(content);
}

export function filterParentheses(text) {
  if (text == null) return text;
  const result = String(text).replace(ZENKAKU_PAREN, (match, content) => {
    const hasKanji = KANJI_RE.test(content);
    const hasEnglish = ENGLISH_RE.test(content);
    console.log(`括号内容: "${content}", 包含汉字: ${hasKanji}, 包含英文: ${hasEnglish}, 保留: ${hasKanji || hasEnglish}`);
    return shouldKeepContent(content) ? match : '';
  });
  const finalResult = result.replace(HANKAKU_PAREN, (match, content) => {
    const hasKanji = KANJI_RE.test(content);
    const hasEnglish = ENGLISH_RE.test(content);
    console.log(`半角括号内容: "${content}", 包含汉字: ${hasKanji}, 包含英文: ${hasEnglish}, 保留: ${hasKanji || hasEnglish}`);
    return shouldKeepContent(content) ? match : '';
  });
  console.log(`原文本: "${text}"\n过滤后: "${finalResult}"`);
  return finalResult;
}

const SENTENCE_SPLIT_RE = /[。．\.!？!?；;]+/;

export function computeStructureSignature(text) {
  const s = (text || '').trim();
  if (!s) return '0|0';
  const lines = s.split(/\n+/).length;
  const sentences = s.split(SENTENCE_SPLIT_RE).filter((x) => x.trim().length > 0).length;
  return `${lines}|${sentences}`;
}

if (typeof window !== 'undefined') {
  window.YomikikuanTextPreprocess = { filterParentheses, computeStructureSignature };
}
