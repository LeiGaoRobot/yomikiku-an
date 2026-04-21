import { createProvider } from './base.js';
import { register } from './registry.js';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function apiKey() {
  return localStorage.getItem('yomikikuan_gemini_api_key') || '';
}

const PROMPT_ANALYZE = (text, ctx) => `You are a JLPT tutor. Analyze this Japanese sentence for a learner. Return strict JSON with keys: translation (English), grammarPoints (array of short strings), vocab (array of {word, gloss}).

Sentence: ${text}
${ctx?.prev ? `Previous sentence: ${ctx.prev}` : ''}
${ctx?.next ? `Next sentence: ${ctx.next}` : ''}

Return ONLY the JSON object, no markdown fences.`;

const PROMPT_GLOSS = (word, sentence) => `In this Japanese sentence, what does "${word}" mean IN CONTEXT? Be concise, one English sentence.

Sentence: ${sentence}
Return just the gloss, no quotes.`;

async function callGemini(prompt, signal) {
  const key = apiKey();
  if (!key) throw new Error('NO_API_KEY');
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    signal,
  });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseJson(raw) {
  const cleaned = raw.trim().replace(/^```json\s*|```$/g, '');
  return JSON.parse(cleaned);
}

const gemini = createProvider({
  id: 'gemini',
  async analyzeSentence({ text, context, signal }) {
    const raw = await callGemini(PROMPT_ANALYZE(text, context), signal);
    try { return parseJson(raw); }
    catch (_) { return { translation: raw, grammarPoints: [], vocab: [] }; }
  },
  async glossWord(word, sentence, signal) {
    return (await callGemini(PROMPT_GLOSS(word, sentence), signal)).trim();
  },
});

register(gemini);
export default gemini;
