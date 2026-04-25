// JLPT listening prompt builders — one per real-exam question type.
// Each builder returns a string prompt for Gemini that enforces strict JSON
// output matching the schema consumed by renderers.js.
//
// Question types (real JLPT 聴解):
//   kadai        — 課題理解  (task comprehension: "what should X do next?")
//   point        — ポイント理解 (pick a specific detail: time/place/reason)
//   gist         — 概要理解  (overall theme / speaker's opinion)
//   hatsu        — 発話表現  (see situation → pick appropriate utterance, N3–N5)
//   sokuji       — 即時応答  (hear a short prompt → pick the best reply, N3+)
//   togo         — 統合理解  (long passage with 2 follow-up questions, N1/N2)
//   dialogue     — generic 2-speaker dialogue + MCQ (legacy compatibility)
//   dictation    — pick 3–5 short sentences for dictation practice

const LEVEL_DESCRIPTORS = {
  N5: 'elementary everyday topics (daily life, family, shopping, simple time expressions)',
  N4: 'basic workplace and school topics with simple keigo',
  N3: 'intermediate topics including public announcements, simple news, polite dialogues',
  N2: 'advanced topics including news segments, workplace discussions, opinion pieces',
  N1: 'expert-level topics including lectures, editorials, nuanced debate, abstract ideas',
};

function levelNote(level) {
  return LEVEL_DESCRIPTORS[level] || LEVEL_DESCRIPTORS.N3;
}

export function stripFences(s) {
  return String(s || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function enrichmentClause(level) {
  return `
Every question MUST include a deep explanation object:
  "depth": {
    "vocab":   [ { "surface": "単語", "reading": "かな", "meaning_zh": "中文义" } ],
    "grammar": [ { "point": "〜わけではない", "note_zh": "并非…" } ],
    "traps":   [ { "option": 1, "why_zh": "时间陷阱：原文提到的是明天，不是今天" } ]
  }
- vocab: 2–5 JLPT-${level}-relevant words from the stem/options.
- grammar: 1–3 key grammar points being tested.
- traps: short Chinese reason for WHY each wrong option is wrong (omit the correct one).`;
}

export function buildKadaiPrompt({ article, level, count }) {
  return `You are a JLPT ${level} 聴解 item writer specializing in 課題理解 (task comprehension).
For this task type: learner hears a short situation + dialogue, and must identify WHAT THE SPEAKER WILL DO NEXT.
Level guidance: ${levelNote(level)}.

Based on the source article below (use as topic reference only — do NOT quote it), write ${count} 課題理解 items. Each item has:
  - a natural situation-setup line ("大学で、男の学生と女の先生が話しています。男の学生はこのあとまず何をしますか。")
  - a 4–8 line dialogue (speakers A/B)
  - stem: "男の人/女の人はこのあと（まず）何をしますか / どうしますか"
  - exactly 4 options phrased as action verbs or short noun-phrases
  - exactly one correct; three plausible article-adjacent distractors
  - citation quoting the decisive dialogue line

Source article:
"""
${article}
"""
${enrichmentClause(level)}

Output strict JSON ONLY, no markdown, no fences:
{
  "level": "${level}",
  "mode": "kadai",
  "items": [
    {
      "id": "k1",
      "type": "課題理解",
      "situation": "冒頭のシチュエーション説明文",
      "dialogue": [ { "speaker": "A", "text": "…" }, { "speaker": "B", "text": "…" } ],
      "stem": "男の人はこのあと何をしますか。",
      "options": ["1.電話をかける","2.メールを送る","3.資料をコピーする","4.部長に会う"],
      "answerIndex": 0,
      "citation": "正解の根拠となる台詞",
      "depth": { "vocab":[], "grammar":[], "traps":[] }
    }
  ]
}`;
}

export function buildPointPrompt({ article, level, count }) {
  return `You are a JLPT ${level} 聴解 item writer specializing in ポイント理解.
For this type: learner hears a question FIRST, then a dialogue/monologue, then chooses a specific detail (time, place, reason, number, feeling).
Level guidance: ${levelNote(level)}.

Based on the source article, write ${count} ポイント理解 items. Each item:
  - situation-setup line that names the focus ("〜はどうして遅れましたか" / "〜はいつですか")
  - stem MUST match the focus exactly
  - 5–9 line dialogue or 3–4 sentence monologue
  - exactly 4 options, one correct, three trap distractors that mention details that ARE in the audio but don't answer the specific focus, or numbers/times that were corrected later in the audio
  - citation quoting the decisive line

Source article:
"""
${article}
"""
${enrichmentClause(level)}

Output strict JSON ONLY, no markdown, no fences:
{
  "level": "${level}",
  "mode": "point",
  "items": [
    {
      "id": "p1",
      "type": "ポイント理解",
      "situation": "…",
      "dialogue": [ { "speaker": "A", "text": "…" } ],
      "stem": "男の人はなぜ会議に遅れましたか。",
      "options": ["…","…","…","…"],
      "answerIndex": 2,
      "citation": "…",
      "depth": { "vocab":[], "grammar":[], "traps":[] }
    }
  ]
}`;
}

export function buildGistPrompt({ article, level, count }) {
  return `You are a JLPT ${level} 聴解 item writer specializing in 概要理解.
Learner hears a full passage (monologue/dialogue) WITHOUT a preview question; only afterward do they hear the stem and must identify the speaker's main point / attitude / theme.
Level guidance: ${levelNote(level)}.

Based on the article, write ${count} 概要理解 items. Each item:
  - a monologue (6–10 sentences) OR a brief dialogue (6–10 turns) expressing an OPINION/THEME
  - stem AFTER the passage: "話の主題は何ですか" / "この人は何について話していますか" / "この人の意見はどれですか"
  - 4 options; wrong ones must each echo A DIFFERENT SURFACE DETAIL (typical gist-trap)
  - one correct answer stating the abstract theme/opinion

Source article:
"""
${article}
"""
${enrichmentClause(level)}

Output strict JSON ONLY, no markdown, no fences:
{
  "level": "${level}",
  "mode": "gist",
  "items": [
    {
      "id": "g1",
      "type": "概要理解",
      "passageKind": "monologue",
      "passage": "…",
      "dialogue": [],
      "stem": "この人が一番伝えたいことは何ですか。",
      "options": ["…","…","…","…"],
      "answerIndex": 1,
      "citation": "主題を示す一文",
      "depth": { "vocab":[], "grammar":[], "traps":[] }
    }
  ]
}`;
}

export function buildHatsuPrompt({ article, level, count }) {
  return `You are a JLPT ${level} 聴解 item writer specializing in 発話表現.
Learner reads/hears a SITUATION DESCRIPTION + a short narrator cue, then chooses which of 3 candidate utterances is most appropriate.
This type appears in N3/N4/N5 only. Level guidance: ${levelNote(level)}.

Based on the source article's topic, write ${count} 発話表現 items. Each item:
  - situation: a 1-2 sentence everyday scene ("友達に宿題を手伝ってほしい時、何と言いますか。")
  - exactly 3 utterance options (not 4 — this type uniquely has 3)
  - one is pragmatically correct; two are common learner mistakes (wrong formality, wrong direction of giving/receiving, wrong aspect)
  - pragmatic_zh: short Chinese note explaining the PRAGMATIC rule being tested

Source article:
"""
${article}
"""
${enrichmentClause(level)}

Output strict JSON ONLY, no markdown, no fences:
{
  "level": "${level}",
  "mode": "hatsu",
  "items": [
    {
      "id": "h1",
      "type": "発話表現",
      "situation": "友達が新しいカバンを持っています。何と言いますか。",
      "options": ["そのカバン、いいですね。","そのカバン、いいですよ。","そのカバン、いいですか。"],
      "answerIndex": 0,
      "pragmatic_zh": "「いいですね」= 赞美；「いいですよ」= 允许对方做；「いいですか」= 询问是否可以。",
      "depth": { "vocab":[], "grammar":[], "traps":[] }
    }
  ]
}`;
}

export function buildSokujiPrompt({ article, level, count }) {
  return `You are a JLPT ${level} 聴解 item writer specializing in 即時応答.
Learner hears a SHORT utterance (one sentence, 5–15 chars), then chooses the best REPLY from 3 candidates.
This type is N3/N2/N1. Level guidance: ${levelNote(level)}.

Based on the article's topic, write ${count} 即時応答 items. Each item:
  - prompt: ONE short Japanese utterance a native might say
  - exactly 3 reply options; one natural, two plausible but mismatch formality/intent/direction
  - reasoning_zh: short Chinese explanation of the pragmatic key

Source article:
"""
${article}
"""
${enrichmentClause(level)}

Output strict JSON ONLY, no markdown, no fences:
{
  "level": "${level}",
  "mode": "sokuji",
  "items": [
    {
      "id": "s1",
      "type": "即時応答",
      "prompt": "お先に失礼します。",
      "options": ["お疲れさまでした。","どういたしまして。","いってらっしゃい。"],
      "answerIndex": 0,
      "reasoning_zh": "「お先に失礼します」= 我先走了（职场），对应「お疲れさまでした」。",
      "depth": { "vocab":[], "grammar":[], "traps":[] }
    }
  ]
}`;
}

export function buildTogoPrompt({ article, level, count }) {
  return `You are a JLPT ${level} 聴解 item writer specializing in 統合理解 (N1/N2 only).
Learner hears a LONG passage (news/announcement/lecture/3-person discussion, 15–25 sentences) and answers 2 sequential questions testing synthesis and inference.
Level guidance: ${levelNote(level)}.

Based on the article, write ${count} 統合 units. Each unit has ONE long passage + exactly 2 questions:
  - question 1 tests explicit/global understanding
  - question 2 tests inference / speaker attitude / comparative judgment
  - 4 options per question

Source article:
"""
${article}
"""
${enrichmentClause(level)}

Output strict JSON ONLY, no markdown, no fences:
{
  "level": "${level}",
  "mode": "togo",
  "items": [
    {
      "id": "t1",
      "type": "統合理解",
      "passageKind": "monologue",
      "passage": "長めの独白 15–25文",
      "questions": [
        { "stem": "…", "options": ["…","…","…","…"], "answerIndex": 0, "citation": "…", "depth": { "vocab":[], "grammar":[], "traps":[] } },
        { "stem": "…", "options": ["…","…","…","…"], "answerIndex": 2, "citation": "…", "depth": { "vocab":[], "grammar":[], "traps":[] } }
      ]
    }
  ]
}`;
}

export function buildDialoguePrompt({ article, level, count }) {
  return `You are a JLPT ${level} 聴解 item writer. Based on the article below, write a natural 2-person Japanese DIALOGUE (男性 A / 女性 B, 8–12 lines) on the same topic at ${level} level, then write ${count} multiple-choice comprehension questions about the dialogue (mix of 概要理解 / ポイント理解).
Level guidance: ${levelNote(level)}.

Source article:
"""
${article}
"""
${enrichmentClause(level)}

Output strict JSON ONLY, no markdown, no fences:
{
  "level": "${level}",
  "mode": "dialogue",
  "dialogue": [ { "speaker": "A", "text": "…" }, { "speaker": "B", "text": "…" } ],
  "questions": [
    {
      "id": "d1",
      "type": "概要理解",
      "stem": "…",
      "options": ["…","…","…","…"],
      "answerIndex": 0,
      "citation": "…",
      "depth": { "vocab":[], "grammar":[], "traps":[] }
    }
  ]
}`;
}

export function buildDictationPrompt({ article, level }) {
  return `Pick 3–5 short Japanese sentences from the article below, suitable for JLPT ${level} dictation practice (10–25 chars each, clear pronunciation, minimal ambiguity). For each, provide a short Chinese hint.

Article:
"""
${article}
"""

Output strict JSON ONLY, no markdown, no fences:
{
  "level": "${level}",
  "mode": "dictation",
  "items": [ { "sentence": "…", "hint": "…" } ]
}`;
}

export const MODE_LEVEL_SUPPORT = {
  kadai:     ['N5','N4','N3','N2','N1'],
  point:     ['N5','N4','N3','N2','N1'],
  gist:      ['N3','N2','N1'],
  hatsu:     ['N5','N4','N3'],
  sokuji:    ['N3','N2','N1'],
  togo:      ['N2','N1'],
  dialogue:  ['N5','N4','N3','N2','N1'],
  dictation: ['N5','N4','N3','N2','N1'],
};

export const MODE_META = {
  kadai:     { emoji: '🎯', nameJa: '課題理解',   nameZh: '任务理解（接下来做什么）' },
  point:     { emoji: '📍', nameJa: 'ポイント理解', nameZh: '要点理解（具体细节）' },
  gist:      { emoji: '💡', nameJa: '概要理解',   nameZh: '概要理解（整体主旨）' },
  hatsu:     { emoji: '💬', nameJa: '発話表現',   nameZh: '发话表现（情境选句）' },
  sokuji:    { emoji: '⚡', nameJa: '即時応答',   nameZh: '即时应答（短句快答）' },
  togo:      { emoji: '🧩', nameJa: '統合理解',   nameZh: '综合理解（长音频 2 题）' },
  dialogue:  { emoji: '👥', nameJa: '対話練習',   nameZh: '双人对话练习' },
  dictation: { emoji: '📝', nameJa: 'ディクテーション', nameZh: '听写练习' },
};

export function promptFor(mode, args) {
  switch (mode) {
    case 'kadai':     return buildKadaiPrompt(args);
    case 'point':     return buildPointPrompt(args);
    case 'gist':      return buildGistPrompt(args);
    case 'hatsu':     return buildHatsuPrompt(args);
    case 'sokuji':    return buildSokujiPrompt(args);
    case 'togo':      return buildTogoPrompt(args);
    case 'dialogue':  return buildDialoguePrompt(args);
    case 'dictation': return buildDictationPrompt(args);
    default: throw new Error(`unknown mode: ${mode}`);
  }
}
