// JLPT 听力题生成器 — takes the active document's text and asks Gemini to
// produce JLPT-style multiple-choice listening questions. Reuses the analyzer
// module's Gemini API key (localStorage 'yomikikuan_gemini_api_key').
//
// Public surface:
//   mountPanel(doc)        — opens the modal for the given document
//   unmountPanel()         — closes it
//   window.__yomikikuanOpenJLPT  — classic-script entry used by the toolbar button

import * as cache from '../cache/idb.js';
import { mountModalA11y } from './modalA11y.js';
import { recommendLevel } from '../local/jlptAdaptive.js';
import * as srs from '../../srs/store.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CSS_INJECTED = '__yomikikuanJlptCssInjected';
const JLPT_SCHEMA_VERSION = 1;
const JLPT_PROVIDER_ID = 'jlpt';

function cacheKey(doc, level, count, mode) {
  return JSON.stringify({ docId: doc && doc.id, level, count, mode: mode || 'normal' });
}

function apiKey() {
  try { return (localStorage.getItem('yomikikuan_gemini_api_key') || '').trim(); }
  catch (_) { return ''; }
}

function tr(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.YomikikuanGetText === 'function') {
      const v = window.YomikikuanGetText(key, fallback);
      if (typeof v === 'string') return v;
    }
  } catch (_) {}
  return fallback;
}
function trFmt(key, params, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.YomikikuanFormat === 'function') {
      const v = window.YomikikuanFormat(key, params || {});
      if (typeof v === 'string' && v !== key) return v;
    }
  } catch (_) {}
  let s = fallback || key;
  Object.entries(params || {}).forEach(([k, v]) => { s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)); });
  return s;
}

function injectCss() {
  if (window[CSS_INJECTED]) return;
  window[CSS_INJECTED] = true;
  const css = `
    .jlpt-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      animation: jlptFadeIn 160ms ease;
    }
    @keyframes jlptFadeIn { from { opacity: 0; } to { opacity: 1; } }
    .jlpt-panel {
      background: var(--bg, #fff); color: var(--fg, #111);
      width: min(760px, 100%); max-height: calc(100vh - 48px);
      border-radius: 16px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.25);
      display: flex; flex-direction: column; overflow: hidden;
      border: 1px solid var(--border, rgba(0,0,0,0.1));
    }
    .jlpt-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 20px; border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
    }
    .jlpt-panel-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
    .jlpt-close {
      background: none; border: none; font-size: 22px; cursor: pointer;
      color: var(--muted, #888); line-height: 1; padding: 0 4px;
    }
    .jlpt-close:hover { color: var(--fg, #111); }
    .jlpt-controls {
      display: flex; align-items: center; flex-wrap: wrap; gap: 12px;
      padding: 14px 20px; border-bottom: 1px solid var(--border, rgba(0,0,0,0.08));
      font-size: 13px;
    }
    .jlpt-controls label { display: flex; align-items: center; gap: 6px; }
    .jlpt-controls select {
      font-size: 13px; padding: 4px 8px; border-radius: 6px;
      border: 1px solid var(--border, rgba(0,0,0,0.15));
      background: var(--elevated, #f7f7f7); color: inherit;
    }
    .jlpt-go {
      padding: 6px 14px; border-radius: 8px; border: none;
      background: var(--accent, #0071e3); color: #fff; font-weight: 500;
      cursor: pointer; font-size: 13px;
    }
    .jlpt-go:disabled { opacity: 0.5; cursor: wait; }
    .jlpt-status { font-size: 12px; color: var(--muted, #888); }
    .jlpt-list {
      padding: 16px 20px 24px; overflow-y: auto; flex: 1;
      display: flex; flex-direction: column; gap: 16px;
    }
    .jlpt-q {
      border: 1px solid var(--border, rgba(0,0,0,0.08));
      border-radius: 12px; padding: 14px 16px;
      background: var(--elevated, rgba(0,0,0,0.02));
    }
    .jlpt-q.answered.correct { border-color: #34c759; }
    .jlpt-q.answered.wrong { border-color: #ff3b30; }
    .jlpt-q-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 6px;
    }
    .jlpt-q-type {
      font-size: 11px; color: var(--muted, #888);
      background: var(--bg, #fff); border: 1px solid var(--border, rgba(0,0,0,0.1));
      padding: 2px 8px; border-radius: 999px;
    }
    .jlpt-q-play {
      background: none; border: 1px solid var(--border, rgba(0,0,0,0.15));
      border-radius: 6px; padding: 2px 10px; cursor: pointer;
      font-size: 12px; color: inherit;
    }
    .jlpt-q-play:hover { background: var(--bg, #fff); }
    .jlpt-q-stem {
      font-size: 15px; line-height: 1.6; margin: 4px 0 10px;
      font-weight: 500;
    }
    .jlpt-q-opts { display: flex; flex-direction: column; gap: 6px; }
    .jlpt-q-opt {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 6px 10px; border-radius: 8px; cursor: pointer;
      font-size: 14px; line-height: 1.5;
      transition: background 120ms ease;
    }
    .jlpt-q-opt:hover { background: var(--bg, rgba(0,0,0,0.04)); }
    .jlpt-q-opt input { margin-top: 4px; flex-shrink: 0; }
    .jlpt-q-show {
      margin-top: 10px;
      background: none; border: 1px solid var(--border, rgba(0,0,0,0.15));
      border-radius: 6px; padding: 4px 12px; cursor: pointer;
      font-size: 12px; color: inherit;
    }
    .jlpt-q-reveal {
      margin-top: 10px; padding: 10px 12px; border-radius: 8px;
      background: var(--bg, rgba(0,0,0,0.04));
      font-size: 13px; line-height: 1.6;
    }
    .jlpt-q-answer { font-size: 14px; margin-bottom: 6px; }
    .jlpt-q-cite { color: var(--muted, #888); font-size: 12px; margin-top: 6px; }
    :root[data-theme="dark"] .jlpt-panel { background: #1c1c1e; color: #f2f2f7; }
    :root[data-theme="dark"] .jlpt-q-reveal { background: rgba(255,255,255,0.06); }
    :root[data-theme="dark"] .jlpt-q-type { background: rgba(255,255,255,0.06); }
    :root[data-theme="dark"] .jlpt-controls select { background: rgba(255,255,255,0.08); }
  `;
  const style = document.createElement('style');
  style.id = 'jlpt-panel-css';
  style.textContent = css;
  document.head.appendChild(style);
}

function buildPromptDialogue(article, level, count) {
  return `You are a JLPT ${level} 聴解 item writer. Based on the article below, write a natural 2-person Japanese DIALOGUE (男性 A / 女性 B, 8–12 lines) on the same topic at ${level} level, then write ${count} multiple-choice comprehension questions about the dialogue (mix of 概要理解 / ポイント理解).

Source article (for topic reference only — the dialogue should NOT quote it):
"""
${article}
"""

Output strict JSON ONLY, no markdown, no fences:
{
  "level": "${level}",
  "mode": "dialogue",
  "dialogue": [
    { "speaker": "A", "text": "…" },
    { "speaker": "B", "text": "…" }
  ],
  "questions": [
    {
      "id": "q1",
      "type": "概要理解" | "ポイント理解",
      "stem": "日本語の問題文",
      "options": ["選択肢A","選択肢B","選択肢C","選択肢D"],
      "answerIndex": 0,
      "explanation": "簡潔な解説 / 简要解析",
      "citation": "引用した対話の発話"
    }
  ]
}`;
}

function buildPromptDictation(article, level) {
  return `Pick 3–5 short Japanese sentences from the article below, suitable for JLPT ${level} dictation practice (10–25 chars each, clear pronunciation, minimal ambiguity). For each, provide a short Chinese hint (提示).

Article:
"""
${article}
"""

Output strict JSON ONLY, no markdown, no fences:
{
  "level": "${level}",
  "mode": "dictation",
  "items": [
    { "sentence": "原文中に現れる日本語の一文", "hint": "中文简短提示（主题/关键词）" }
  ]
}`;
}

function buildPrompt(article, level, count) {
  return `You are a JLPT ${level} 聴解 (listening comprehension) item writer. Read the Japanese article below and generate ${count} multiple-choice questions in the style of JLPT ${level} 聴解 (mix of 概要理解 / ポイント理解).

Article:
"""
${article}
"""

Strict rules:
- Each question has exactly 4 options.
- Only ONE correct answer; the other three must be plausible, article-grounded distractors.
- Questions MUST be answerable from the article alone. Do not invent facts.
- Write stems and options in natural Japanese at ${level} level.
- Write a brief explanation (bilingual: short Japanese + short Chinese) and a citation quoting the relevant sentence(s) from the article.

Output strict JSON ONLY, no markdown, no fences, matching this schema:
{
  "level": "${level}",
  "questions": [
    {
      "id": "q1",
      "type": "概要理解" | "ポイント理解",
      "stem": "日本語の問題文",
      "options": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"],
      "answerIndex": 0,
      "explanation": "簡潔な解説 / 简要解析",
      "citation": "本文から引用した関連文"
    }
  ]
}`;
}

async function callGemini(prompt, signal) {
  const key = apiKey();
  if (!key) throw new Error('NO_API_KEY');
  // Transient 429/5xx auto-retry once — Gemini 503s happen under load.
  const TRANSIENT = new Set([429, 502, 503, 504]);
  const attempt = () => fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    }),
    signal,
  });
  let res = await attempt();
  if (TRANSIENT.has(res.status)) {
    await new Promise(r => setTimeout(r, 1200));
    if (signal && signal.aborted) throw new Error('ABORTED');
    res = await attempt();
  }
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP_${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('EMPTY_RESPONSE');
  return text;
}

function parseJson(raw) {
  const cleaned = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  return JSON.parse(cleaned);
}

async function generate({ article, level, count, signal }) {
  const raw = await callGemini(buildPrompt(article, level, count), signal);
  const data = parseJson(raw);
  if (!data || !Array.isArray(data.questions)) throw new Error('BAD_SHAPE');
  return data;
}

// ---------- UI ----------

let activePanel = null;

// Module-owned Audio element for Gemini playback. Single-slot so a second
// ▶︎ click interrupts the first.
let activeAudio = null;

function resolveGeminiVoice() {
  // Prefer whatever voice the user picked in the header/sidebar voice select.
  try {
    const sel = document.getElementById('headerVoiceSelect') || document.getElementById('voiceSelect');
    if (sel && sel.value) {
      const v = sel.value.split('—')[0].trim();
      if (/^[A-Z][a-zA-Z]+$/.test(v)) return v;
    }
  } catch (_) {}
  return 'Zephyr';
}

async function speak(text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  stopSpeak();
  // Prefer Gemini TTS (sounds more like a real JLPT listening recording).
  // Falls back to Web Speech when the helper isn't loaded, no key, etc.
  if (typeof window.__geminiSynth === 'function') {
    try {
      const voice = resolveGeminiVoice();
      const url = await window.__geminiSynth(clean, voice);
      if (!url) throw new Error('no audio url');
      const audio = new Audio(url);
      audio.volume = 1;
      const r = Number(window.rate) || 1;
      try { audio.playbackRate = Math.max(0.25, Math.min(4, r)); } catch (_) {}
      try { audio.preservesPitch = true; } catch (_) {}
      activeAudio = audio;
      audio.onended = () => { if (activeAudio === audio) activeAudio = null; };
      audio.onerror = () => { if (activeAudio === audio) activeAudio = null; };
      await audio.play();
      return;
    } catch (err) {
      console.warn('[jlpt] Gemini TTS failed, falling back to Web Speech:', err);
    }
  }
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'ja-JP';
    const r = Number(window.rate) || 1;
    u.rate = Math.max(0.25, Math.min(4, r));
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

function stopSpeak() {
  if (activeAudio) {
    try { activeAudio.pause(); } catch (_) {}
    try { activeAudio.currentTime = 0; } catch (_) {}
    activeAudio = null;
  }
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) {}
}

function renderDialogue(listEl, dialogue) {
  if (!Array.isArray(dialogue) || !dialogue.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'jlpt-q';
  wrap.style.background = 'transparent';
  const h = document.createElement('div');
  h.className = 'jlpt-q-header';
  h.innerHTML = `<span class="jlpt-q-type">${escapeHtml(tr('panel.jlpt.type.dialogue', '対話'))}</span>`;
  const playAll = document.createElement('button');
  playAll.className = 'jlpt-q-play';
  playAll.type = 'button';
  playAll.textContent = tr('panel.btn.play_all', '▶︎ 全对话朗读');
  playAll.addEventListener('click', () => {
    const line = dialogue.map(d => `${d.speaker}、${d.text}`).join('。');
    speak(line);
  });
  h.appendChild(playAll);
  wrap.appendChild(h);
  dialogue.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'jlpt-q-stem';
    row.style.fontWeight = '400';
    row.textContent = `${d.speaker || '?'}：${d.text || ''}`;
    const playOne = document.createElement('button');
    playOne.className = 'jlpt-q-play';
    playOne.type = 'button';
    playOne.style.marginLeft = '8px';
    playOne.textContent = '▶︎';
    playOne.addEventListener('click', () => speak(d.text || ''));
    row.appendChild(playOne);
    wrap.appendChild(row);
  });
  listEl.appendChild(wrap);
}

function renderDictation(listEl, payload) {
  listEl.innerHTML = '';
  const items = (payload && Array.isArray(payload.items)) ? payload.items : [];
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'jlpt-status';
    empty.textContent = tr('panel.jlpt.empty.dictation', '未生成任何听写题');
    listEl.appendChild(empty);
    return;
  }
  items.forEach((it, i) => {
    const card = document.createElement('div');
    card.className = 'jlpt-q';

    const h = document.createElement('div');
    h.className = 'jlpt-q-header';
    h.innerHTML = `<span class="jlpt-q-type">${escapeHtml(tr('panel.jlpt.type.dictation', '听写'))}</span>`;
    const play = document.createElement('button');
    play.className = 'jlpt-q-play';
    play.type = 'button';
    play.textContent = tr('panel.btn.play', '▶︎ 朗读');
    play.addEventListener('click', () => speak(it.sentence || ''));
    h.appendChild(play);
    card.appendChild(h);

    const hint = document.createElement('div');
    hint.className = 'jlpt-q-cite';
    hint.textContent = trFmt('panel.jlpt.hint_fmt', { hint: it.hint || '' }, `提示：${it.hint || ''}`);
    card.appendChild(hint);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = tr('panel.jlpt.input.placeholder', '请输入听到的内容');
    input.style.cssText = 'width:100%;padding:8px 10px;margin-top:10px;border:1px solid var(--border,#ccc);border-radius:8px;background:var(--bg,#fff);color:inherit;font-size:14px;';
    card.appendChild(input);

    const check = document.createElement('button');
    check.className = 'jlpt-q-show';
    check.type = 'button';
    check.textContent = tr('panel.btn.check', '对照答案');
    card.appendChild(check);

    const diff = document.createElement('div');
    diff.className = 'jlpt-q-reveal';
    diff.hidden = true;
    card.appendChild(diff);

    check.addEventListener('click', () => {
      const user = (input.value || '').trim();
      const truth = (it.sentence || '').trim();
      diff.hidden = false;
      diff.innerHTML = '';
      const truthLine = document.createElement('div');
      truthLine.innerHTML = `<b>${escapeHtml(tr('panel.jlpt.truth_label', '正解：'))}</b>${escapeHtml(truth)}`;
      const userLine = document.createElement('div');
      userLine.style.marginTop = '6px';
      userLine.innerHTML = `<b>${escapeHtml(tr('panel.jlpt.user_label', '你的：'))}</b>${diffHighlight(user, truth)}`;
      diff.appendChild(truthLine);
      diff.appendChild(userLine);
      const correct = user === truth;
      card.classList.add('answered');
      card.classList.toggle('correct', correct);
      card.classList.toggle('wrong', !correct);
    });

    listEl.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Character-level diff highlight. Mismatched chars get a red underline via
// <u> wrapping. Not a full LCS — just positional compare, which is fine for
// short JLPT dictation sentences (10–25 chars).
function diffHighlight(user, truth) {
  const u = String(user || '');
  const t = String(truth || '');
  const n = Math.max(u.length, t.length);
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = u[i];
    const b = t[i];
    if (a === b) out += escapeHtml(a || '');
    else if (a == null) out += `<u style="color:#ff3b30;">＿</u>`;
    else out += `<u style="color:#ff3b30;">${escapeHtml(a)}</u>`;
  }
  return out || '<i style="opacity:.5;">(未输入)</i>';
}

function renderQuestions(listEl, payload) {
  listEl.innerHTML = '';
  // Dialogue mode: render dialogue transcript first, then the MCQs below.
  if (payload && Array.isArray(payload.dialogue) && payload.dialogue.length) {
    renderDialogue(listEl, payload.dialogue);
  }
  if (!payload || !Array.isArray(payload.questions) || payload.questions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'jlpt-status';
    empty.textContent = tr('panel.jlpt.empty.questions', '未生成任何题目');
    listEl.appendChild(empty);
    return;
  }

  payload.questions.forEach((q, qi) => {
    const card = document.createElement('div');
    card.className = 'jlpt-q';

    const header = document.createElement('div');
    header.className = 'jlpt-q-header';
    const type = document.createElement('span');
    type.className = 'jlpt-q-type';
    type.textContent = q.type || 'JLPT';

    const playBtn = document.createElement('button');
    playBtn.className = 'jlpt-q-play';
    playBtn.type = 'button';
    playBtn.title = '朗读题干+选项';
    playBtn.textContent = tr('panel.btn.play', '▶︎ 朗读');
    playBtn.addEventListener('click', () => {
      const text = [q.stem, ...(q.options || []).map((o, i) => `${String.fromCharCode(65 + i)}、${o}`)].join('。');
      speak(text);
    });
    header.append(type, playBtn);

    const stem = document.createElement('div');
    stem.className = 'jlpt-q-stem';
    stem.textContent = `${qi + 1}. ${q.stem || ''}`;

    const opts = document.createElement('div');
    opts.className = 'jlpt-q-opts';

    const reveal = document.createElement('div');
    reveal.className = 'jlpt-q-reveal';
    reveal.hidden = true;
    const answerLine = document.createElement('div');
    answerLine.className = 'jlpt-q-answer';
    const correctIdx = Number(q.answerIndex);
    answerLine.innerHTML = `<b>${escapeHtml(tr('panel.jlpt.answer_label', '答え：'))}${String.fromCharCode(65 + (isFinite(correctIdx) ? correctIdx : 0))}</b>`;
    const explainLine = document.createElement('div');
    explainLine.className = 'jlpt-q-explain';
    explainLine.textContent = q.explanation || '';
    const citeLine = document.createElement('div');
    citeLine.className = 'jlpt-q-cite';
    citeLine.textContent = q.citation ? trFmt('panel.jlpt.cite_fmt', { src: q.citation }, `出典：${q.citation}`) : '';
    reveal.append(answerLine, explainLine, citeLine);

    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.className = 'jlpt-q-show';
    revealBtn.textContent = tr('panel.btn.reveal', '查看答案/解析');
    revealBtn.hidden = true;
    revealBtn.addEventListener('click', () => { reveal.hidden = !reveal.hidden; });

    (q.options || []).forEach((opt, i) => {
      const label = document.createElement('label');
      label.className = 'jlpt-q-opt';
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = `jlpt-q-${qi}`;
      r.value = String(i);
      const span = document.createElement('span');
      span.textContent = `${String.fromCharCode(65 + i)}. ${opt}`;
      label.append(r, span);
      r.addEventListener('change', () => {
        const correct = Number(q.answerIndex) === i;
        card.classList.add('answered');
        card.classList.toggle('correct', correct);
        card.classList.toggle('wrong', !correct);
        revealBtn.hidden = false;
        reveal.hidden = false;
        // #5 — Log wrong answers to the mistake book (once per question).
        if (!correct && !card.__loggedMistake && typeof window.__yomikikuanAddMistake === 'function') {
          card.__loggedMistake = true;
          try {
            window.__yomikikuanAddMistake({
              stem: q.stem || '',
              options: Array.isArray(q.options) ? q.options : [],
              correctIndex: Number(q.answerIndex) || 0,
              userAnswerIndex: i,
              explanation: q.explanation || '',
              citation: q.citation || '',
              level: (payload && payload.level) || '',
              source: {
                docId: (window.documentManager && window.documentManager.getActiveId && window.documentManager.getActiveId()) || '',
              },
            });
            const note = document.createElement('span');
            note.textContent = tr('panel.jlpt.mistake_added', ' · 已加入错题本');
            note.style.cssText = 'font-size:11px;color:var(--muted,#888);margin-left:8px;';
            const type = card.querySelector('.jlpt-q-type');
            if (type && type.parentElement) type.parentElement.appendChild(note);
          } catch (e) {
            console.warn('[jlpt] addMistake failed', e);
          }
        }
      });
      opts.append(label);
    });

    card.append(header, stem, opts, revealBtn, reveal);
    listEl.append(card);
  });
}

export function mountPanel(doc) {
  injectCss();
  if (activePanel) return activePanel;
  const article = Array.isArray(doc?.content) ? doc.content.join('\n') : String(doc?.content || '');
  if (!article.trim()) {
    alert(tr('panel.error.doc_empty_for_jlpt', '当前文档为空，无法生成题目'));
    return null;
  }

  const root = document.createElement('div');
  root.className = 'jlpt-overlay';
  root.innerHTML = `
    <div class="jlpt-panel" role="dialog" aria-label="${tr('panel.jlpt.title', 'JLPT 听力题生成').replace(/"/g, '&quot;')}">
      <header class="jlpt-panel-header">
        <h3 data-role="title"></h3>
        <button class="jlpt-close" type="button" aria-label="${tr('panel.common.close', '关闭').replace(/"/g, '&quot;')}">×</button>
      </header>
      <div class="jlpt-controls">
        <label>模式
          <select data-role="mode">
            <option value="normal" selected>通常（文章出题）</option>
            <option value="dialogue">対話（2人对话）</option>
            <option value="dictation">ディクテーション（听写）</option>
          </select>
        </label>
        <label>等级
          <select data-role="level">
            <option value="N5">N5</option>
            <option value="N4">N4</option>
            <option value="N3" selected>N3</option>
            <option value="N2">N2</option>
            <option value="N1">N1</option>
          </select>
        </label>
        <label data-role="count-wrap">题量
          <select data-role="count">
            <option value="3">3</option>
            <option value="5" selected>5</option>
            <option value="10">10</option>
          </select>
        </label>
        <button class="jlpt-go" data-role="go" type="button">生成</button>
        <button class="jlpt-go" data-role="regen" type="button" style="background:transparent;color:var(--accent,#0071e3);border:1px solid var(--accent,#0071e3);">重新生成</button>
        <span class="jlpt-status" data-role="status"></span>
      </div>
      <div class="jlpt-recommendation" data-role="recommendation" hidden style="padding:8px 20px;border-bottom:1px solid var(--border,rgba(0,0,0,0.06));font-size:12px;color:var(--muted,#666);background:var(--elev,rgba(0,113,227,0.04));"></div>
      <div class="jlpt-list" data-role="list"></div>
    </div>
  `;
  document.body.appendChild(root);
  const titleEl = root.querySelector('[data-role="title"]');
  if (titleEl) titleEl.textContent = tr('panel.jlpt.title', 'JLPT 听力题生成');
  const a11y = mountModalA11y(root.querySelector('.jlpt-panel'), {
    initialFocus: root.querySelector('.jlpt-close'),
  });

  let controller = null;
  let escHandler = null;

  const close = () => {
    try { controller && controller.abort(); } catch (_) {}
    stopSpeak();
    if (escHandler) document.removeEventListener('keydown', escHandler);
    a11y.release();
    root.remove();
    activePanel = null;
  };

  root.querySelector('.jlpt-close').addEventListener('click', close);
  root.addEventListener('click', (ev) => { if (ev.target === root) close(); });
  escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);

  // Preset level from existing difficulty badge if present.
  try {
    const badge = document.querySelector('#diffBadgeMount .diff-badge, #diffBadgeMount [data-level]');
    const preLevel = badge && (badge.dataset?.level || badge.textContent || '').trim().toUpperCase();
    if (preLevel && /^N[1-5]$/.test(preLevel)) {
      const sel = root.querySelector('[data-role="level"]');
      if (sel) sel.value = preLevel;
    }
  } catch (_) {}

  // Adaptive recommendation — overrides the badge preset above once the
  // async derivation completes. We display a small banner so the user
  // sees why the level was chosen, and they can still change the select
  // manually before generating.
  (async () => {
    try {
      const rec = await recommendLevel({ srs });
      if (!rec || !rec.level) return;
      const levelSel = root.querySelector('[data-role="level"]');
      if (levelSel) levelSel.value = rec.level;
      const banner = root.querySelector('[data-role="recommendation"]');
      if (banner) {
        const acc = rec.accuracy == null ? null : Math.round(rec.accuracy * 100);
        const msg = (rec.confidence === 'low' || acc == null)
          ? trFmt(rec.reason || 'panel.jlpt.recommend.low_confidence', { level: rec.level }, `推荐 ${rec.level}`)
          : trFmt('panel.jlpt.recommend.fmt', { level: rec.level, sample: rec.sample, accuracy: acc }, `推荐 ${rec.level}（最近 ${rec.sample} 题 ${acc}% 正确率）`);
        banner.textContent = msg;
        banner.hidden = false;
      }
    } catch (e) { console.warn('[jlpt] recommendLevel failed', e); }
  })();

  const go = root.querySelector('[data-role="go"]');
  const status = root.querySelector('[data-role="status"]');
  const list = root.querySelector('[data-role="list"]');

  const regen = root.querySelector('[data-role="regen"]');

  async function runGenerate({ bypassCache = false } = {}) {
    go.disabled = true;
    regen.disabled = true;
    const mode = root.querySelector('[data-role="mode"]').value || 'normal';
    const level = root.querySelector('[data-role="level"]').value || 'N3';
    const count = parseInt(root.querySelector('[data-role="count"]').value, 10) || 5;
    const cKey = cacheKey(doc, level, count, mode);
    list.innerHTML = '';

    // Toggle the count selector — dictation mode doesn't use it.
    const countWrap = root.querySelector('[data-role="count-wrap"]');
    if (countWrap) countWrap.style.display = (mode === 'dictation') ? 'none' : '';

    const hasResult = (p) => {
      if (!p) return false;
      if (mode === 'dictation') return Array.isArray(p.items) && p.items.length;
      return Array.isArray(p.questions) && p.questions.length;
    };
    const renderResult = (p) => {
      if (mode === 'dictation') renderDictation(list, p);
      else renderQuestions(list, p);
    };
    const resultLabel = (p) => {
      if (mode === 'dictation') return `已生成 ${p.items.length} 道听写题（${p.level || level}）`;
      return `已生成 ${p.questions.length} 道题（${p.level || level}）`;
    };

    if (!bypassCache) {
      try {
        const hit = await cache.get(cKey, JLPT_PROVIDER_ID, JLPT_SCHEMA_VERSION);
        if (hasResult(hit)) {
          renderResult(hit);
          status.textContent = trFmt('panel.cache.loaded.mode', { mode }, `已从缓存加载（${mode}）— 点"重新生成"可重新调用 Gemini`);
          go.disabled = false;
          regen.disabled = false;
          return;
        }
      } catch (_) { /* cache miss falls through to Gemini */ }
    }

    if (!apiKey()) {
      status.textContent = tr('panel.error.no_key', '请先在设置中填写 Gemini API key');
      go.disabled = false;
      regen.disabled = false;
      return;
    }
    status.textContent = bypassCache ? tr('panel.regenerating', '忽略缓存，重新生成中…') : tr('panel.generating', '生成中…');
    try { controller && controller.abort(); } catch (_) {}
    controller = new AbortController();
    try {
      let prompt;
      if (mode === 'dialogue') prompt = buildPromptDialogue(article, level, count);
      else if (mode === 'dictation') prompt = buildPromptDictation(article, level);
      else prompt = buildPrompt(article, level, count);
      const raw = await callGemini(prompt, controller.signal);
      const result = parseJson(raw);
      if (!hasResult(result)) throw new Error('BAD_SHAPE');
      renderResult(result);
      status.textContent = resultLabel(result);
      try { await cache.put(cKey, JLPT_PROVIDER_ID, JLPT_SCHEMA_VERSION, result); } catch (_) {}
    } catch (err) {
      console.warn('[jlpt] generate failed', err);
      const msg = err && err.message ? err.message : String(err);
      if (msg === 'NO_API_KEY') status.textContent = tr('panel.error.no_key', '请先在设置中填写 Gemini API key');
      else if (msg === 'RATE_LIMITED') status.textContent = tr('panel.error.rate_limited', 'API 额度超限，稍后再试');
      else if (msg === 'BAD_SHAPE' || msg === 'EMPTY_RESPONSE') status.textContent = tr('panel.error.bad_shape', '模型返回格式异常，请重试');
      else if (err && err.name === 'AbortError') status.textContent = tr('panel.aborted', '已取消');
      else status.textContent = trFmt('panel.error.generic_fmt', { msg }, `生成失败：${msg}`);
    } finally {
      go.disabled = false;
      regen.disabled = false;
    }
  }

  go.addEventListener('click', () => runGenerate({ bypassCache: false }));
  regen.addEventListener('click', () => runGenerate({ bypassCache: true }));

  activePanel = root;
  return root;
}

export function unmountPanel() {
  if (activePanel) {
    activePanel.remove();
    activePanel = null;
  }
}

if (typeof window !== 'undefined') {
  window.__yomikikuanOpenJLPT = function () {
    const dm = window.documentManager;
    if (!dm || typeof dm.getAllDocuments !== 'function') {
      alert(tr('panel.error.no_docmgr', '文档管理器未就绪'));
      return;
    }
    const activeId = typeof dm.getActiveId === 'function' ? dm.getActiveId() : null;
    const doc = dm.getAllDocuments().find((d) => d && d.id === activeId);
    if (!doc) { alert(tr('panel.error.no_doc', '请先选择一个文档')); return; }
    mountPanel(doc);
  };
}
