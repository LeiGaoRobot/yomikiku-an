// Pure helpers extracted from analyzer/ui/articleSummary.js for unit
// testing without spinning up the modal / DOM. Phase-1 — articleSummary.js
// still holds an inline copy of each; Phase-2 dedup can delegate later.
//
// All four are deterministic, no DOM / network / storage access.

// Builds the strict-JSON prompt fed into gemini-2.5-flash for a full
// article summary. Output schema:
//   { summary, keySentences[], recommendedLevel, learningPoints[],
//     vocabulary[{surface, reading, meaning_zh, example_ja}],
//     grammarPoints[{point, note_zh, example_ja}] }
export function buildPrompt(article) {
  return `You are a senior Japanese-language teacher. Read the article below and produce a structured summary for a learner.

Article:
"""
${article}
"""

Output strict JSON only (no markdown, no fences), matching this schema:
{
  "summary": "一段日文要约（3–5 句），以学习者视角概括文章主旨",
  "keySentences": ["原文中最值得精读的 3–5 句话（必须是原文句子的逐字引用）"],
  "recommendedLevel": "N5" | "N4" | "N3" | "N2" | "N1",
  "learningPoints": ["3–6 条学习重点，中日双语，每条形如「語彙：〇〇（意味）／ 句型：〇〇（用法）」"],
  "vocabulary": [
    { "surface": "単語", "reading": "かな", "meaning_zh": "中文义", "example_ja": "原文中的例句" }
  ],
  "grammarPoints": [
    { "point": "〜わけではない", "note_zh": "并非…", "example_ja": "本文中的例句" }
  ]
}
- vocabulary: 5–10 important words at recommendedLevel, pulled from the article.
- grammarPoints: 2–5 notable sentence patterns with article-grounded examples.`;
}

// Fence-tolerant JSON parser — Gemini sometimes returns the JSON wrapped
// in ```json ... ``` fences despite the strict-JSON instruction. Strips
// them before parsing. Throws SyntaxError on malformed body.
export function parseJson(raw) {
  const cleaned = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  return JSON.parse(cleaned);
}

// Markdown export for the summary payload. Deterministic — same payload +
// same `now` always yields the same byte sequence. `doc` is the source
// document (uses .title; tolerates missing). `payload` is the parsed
// Gemini JSON (all sections optional — empty/missing arrays just skip).
export function toMarkdown(doc, payload, { now = new Date() } = {}) {
  const lines = [];
  const title = doc?.title || 'Article';
  const date = now.toISOString().slice(0, 10);
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`> Exported from YomiKiku-an · ${date}${payload.recommendedLevel ? ` · JLPT ${payload.recommendedLevel}` : ''}`);
  lines.push('');
  if (payload.summary) {
    lines.push('## 要約');
    lines.push('');
    lines.push(payload.summary);
    lines.push('');
  }
  if (Array.isArray(payload.keySentences) && payload.keySentences.length) {
    lines.push('## キー文');
    lines.push('');
    payload.keySentences.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }
  if (Array.isArray(payload.vocabulary) && payload.vocabulary.length) {
    lines.push('## 重要語彙');
    lines.push('');
    lines.push('| 単語 | 読み | 意味 | 例文 |');
    lines.push('|------|------|------|------|');
    payload.vocabulary.forEach((v) => {
      const surface = (v.surface || '').replace(/\|/g, '\\|');
      const reading = (v.reading || '').replace(/\|/g, '\\|');
      const meaning = (v.meaning_zh || v.meaning || '').replace(/\|/g, '\\|');
      const ex = (v.example_ja || '').replace(/\|/g, '\\|');
      lines.push(`| ${surface} | ${reading} | ${meaning} | ${ex} |`);
    });
    lines.push('');
  }
  if (Array.isArray(payload.grammarPoints) && payload.grammarPoints.length) {
    lines.push('## 文法ポイント');
    lines.push('');
    payload.grammarPoints.forEach((g) => {
      lines.push(`- **${g.point || ''}** — ${g.note_zh || g.note || ''}`);
      if (g.example_ja) lines.push(`  - 例：${g.example_ja}`);
    });
    lines.push('');
  }
  if (Array.isArray(payload.learningPoints) && payload.learningPoints.length) {
    lines.push('## 学習ポイント');
    lines.push('');
    payload.learningPoints.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
  }
  return lines.join('\n');
}

// Filename-safe slug from a title — keeps word chars + CJK ideographs +
// hiragana/katakana + hyphens; collapses everything else to underscores;
// truncates to 60 chars. Used by the Markdown download filename.
export function safeFilenameSlug(title) {
  return String(title || 'article').replace(/[^\w一-龥぀-ヿ-]+/g, '_').slice(0, 60);
}
