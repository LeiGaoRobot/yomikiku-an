// Shared Kuromoji tokenizer helper for analyzer/local modules.
//
// Kuromoji is loaded as a classic script at `static/libs/kuromoji.js` which
// sets `window.kuromoji` (with `.builder()`). `static/segmenter.js` builds its
// own tokenizer inside `JapaneseSegmenter` (bundled with kuroshiro). The
// analyzer needs a leaner tokenizer without kuroshiro, so we memoize a single
// `window.kuromoji.builder().build(...)` call and reuse it across modules
// (difficulty.js, syntax.js, ...).
//
// Failing builds clear the cache so a later call can retry.

const DIC_PATH = '/static/libs/dict/';

let tokenizerPromise = null;

export function getTokenizer() {
  if (tokenizerPromise) return tokenizerPromise;
  tokenizerPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.kuromoji || typeof window.kuromoji.builder !== 'function') {
      reject(new Error('kuromoji not loaded on window'));
      return;
    }
    window.kuromoji.builder({ dicPath: DIC_PATH }).build((err, tokenizer) => {
      if (err) reject(err);
      else resolve(tokenizer);
    });
  });
  tokenizerPromise.catch(() => { tokenizerPromise = null; });
  return tokenizerPromise;
}

export async function tokenize(text) {
  const tokenizer = await getTokenizer();
  return tokenizer.tokenize(text);
}
