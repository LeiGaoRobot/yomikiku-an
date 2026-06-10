// Gemini prompts for the YouTube panel. Pure string builders — no fetch,
// no DOM. The JLPT builder reuses the question-shape contract documented
// in modules/analyzer/ui/jlpt/prompts.js so the renderer can consume the
// output without changes.

import { promptFor as jlptPromptFor } from '../analyzer/ui/jlpt/prompts.js';

export function buildTranscriptPrompt() {
  return `Transcribe the Japanese audio of this YouTube video into plain Japanese text.
- One sentence per line. Include kanji and natural punctuation (。、？！).
- No timestamps, no speaker labels, no markdown, no code fences.
- Output plain text only.
- If the video has no Japanese audio, output exactly: NO_JAPANESE_AUDIO`;
}

export function buildTimedTranscriptPrompt() {
  return `Transcribe the Japanese audio of this YouTube video as strict JSON ONLY.
Output a JSON array of segments, one per natural sentence:
[
  { "start": 0.0, "end": 3.2, "text": "こんにちは、今日は…" },
  { "start": 3.2, "end": 6.8, "text": "次に、…" }
]
Constraints:
- "start"/"end" are seconds (number, 1 decimal place ok).
- "text" is the spoken Japanese with natural punctuation.
- Do NOT include speaker labels or English.
- Do NOT wrap in markdown or code fences. Strict JSON only.
- If the video has no Japanese audio, output: { "error": "NO_JAPANESE_AUDIO" }`;
}

export function buildJlptPrompt({ level, count, mode }) {
  // Reuse the existing JLPT prompt builder (article-based) by passing a
  // sentinel article that says "use the audio". The renderer contract
  // (item shape) is identical, so renderers/* needs no change.
  const article = `[USE_YOUTUBE_AUDIO]
Listen to the Japanese audio in the YouTube video provided as input.
Treat the spoken content as the source material. Do NOT make up content
that isn't in the audio. If the audio has no Japanese, return:
{ "error": "NO_JAPANESE_AUDIO" }`;
  const base = jlptPromptFor(mode, { article, level, count });
  return `${base}

NOTE: The "source article" above is a directive — your real source is the
YouTube video's audio track passed in as the multimodal input. Listen to
the audio and quote exact lines from it in the "citation" field.`;
}
