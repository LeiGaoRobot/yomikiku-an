// Reading Analyzer — public API. See docs/plans/2026-04-21-reading-analyzer-design.md
// Classic-script consumers use window.YomikikuanAnalyzer (wired up at end of this file).
import { analyzeDifficulty } from './local/difficulty.js';
import './providers/mock.js';
import './providers/gemini.js';
import * as cache from './cache/idb.js';
import { getActive } from './providers/registry.js';
import { createLimiter } from './concurrency.js';

const SCHEMA_VERSION = 1;

// Module-level 2-concurrent limiter shared by expandSentence + glossWord.
const limit = createLimiter(2);

async function runAnalyze(text, context, signal) {
  const provider = getActive();
  if (!provider) throw new Error('NO_PROVIDER');
  const cached = await cache.get(text, provider.id, SCHEMA_VERSION);
  if (cached) return cached;
  const result = await limit(() => provider.analyzeSentence({ text, context, signal }), signal);
  await cache.put(text, provider.id, SCHEMA_VERSION, result);
  return result;
}

const api = {
  SCHEMA_VERSION,
  async analyzeDocument(doc) {
    if (!doc || !doc.content) return null;
    const difficulty = await analyzeDifficulty(doc.content);
    return { difficulty };
  },
  async expandSentence(sentenceEl, text, context) {
    // UI mounting comes in T12; for now just return the analysis payload.
    return await runAnalyze(text, context);
  },
  async glossWord(word, sentence, signal) {
    const provider = getActive();
    if (!provider) throw new Error('NO_PROVIDER');
    // Gloss results aren't cached separately in MVP; keep it simple.
    return limit(() => provider.glossWord(word, sentence, signal), signal);
  },
};

if (typeof window !== 'undefined') {
  window.YomikikuanAnalyzer = api;
}

export default api;
