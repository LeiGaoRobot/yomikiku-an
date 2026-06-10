import { createProvider } from './base.js';
import { register } from './registry.js';
import { callGemini, textBody } from '../../gemini/client.js';

const PROMPT_ANALYZE = (text, ctx) => `You are a JLPT tutor. Analyze this Japanese sentence for a learner. Return strict JSON with keys: translation (English), grammarPoints (array of short strings), vocab (array of {word, gloss}).

Sentence: ${text}
${ctx?.prev ? `Previous sentence: ${ctx.prev}` : ''}
${ctx?.next ? `Next sentence: ${ctx.next}` : ''}

Return ONLY the JSON object, no markdown fences.`;

const PROMPT_GLOSS = (word, sentence) => `In this Japanese sentence, what does "${word}" mean IN CONTEXT? Be concise, one English sentence.

Sentence: ${sentence}
Return just the gloss, no quotes.`;

// Preserve provider's looser contract vs. the strict-JSON panels:
//   - no responseMimeType (free-form text)
//   - tolerate empty candidates (return '' rather than throw EMPTY_RESPONSE)
//   - bare HTTP_<status> error (no body slice)
const CALL_OPTS = { allowEmpty: true, errorBodySlice: 0 };

function parseJson(raw) {
  const cleaned = raw.trim().replace(/^```json\s*|```$/g, '');
  return JSON.parse(cleaned);
}

const gemini = createProvider({
  id: 'gemini',
  async analyzeSentence({ text, context, signal }) {
    const body = textBody(PROMPT_ANALYZE(text, context), { json: false });
    const raw = await callGemini(body, { ...CALL_OPTS, signal });
    try { return parseJson(raw); }
    catch (_) { return { translation: raw, grammarPoints: [], vocab: [] }; }
  },
  async glossWord(word, sentence, signal) {
    const body = textBody(PROMPT_GLOSS(word, sentence), { json: false });
    return (await callGemini(body, { ...CALL_OPTS, signal })).trim();
  },
});

register(gemini);
export default gemini;
