// JLPT renderers — one per question type, plus shared scaffolding
// (transcript blur mask, 3-layer depth explanation, option cards).

import { speak, speakQueue, speakStaged, stopAll, voiceForSpeaker } from './audio.js';
import { MODE_META } from './prompts.js';

const CSS_FLAG = '__yomikikuanJlptRenderersCssInjected';

export function injectCss() {
  if (typeof window === 'undefined' || window[CSS_FLAG]) return;
  window[CSS_FLAG] = true;
  const style = document.createElement('style');
  style.id = 'jlpt-renderers-css';
  style.textContent = `
    .jlpt-q {
      border: 1px solid var(--border, rgba(0,0,0,0.08));
      border-radius: 12px; padding: 14px 16px;
      background: var(--elevated, rgba(0,0,0,0.02));
      position: relative;
    }
    .jlpt-q.answered.correct { border-color: #34c759; box-shadow: 0 0 0 3px rgba(52,199,89,.12); }
    .jlpt-q.answered.wrong { border-color: #ff3b30; box-shadow: 0 0 0 3px rgba(255,59,48,.12); }
    .jlpt-q-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; gap:8px; flex-wrap:wrap; }
    .jlpt-q-type-wrap { display:inline-flex; align-items:center; gap:6px; }
    .jlpt-q-type {
      font-size: 11px; color: var(--muted, #888);
      background: var(--bg, #fff); border: 1px solid var(--border, rgba(0,0,0,0.1));
      padding: 2px 8px; border-radius: 999px;
    }
    .jlpt-q-level {
      font-size: 10px; font-weight: 700;
      padding: 1px 6px; border-radius: 4px;
      background: rgba(0,113,227,.10); color: #0071e3; letter-spacing: .02em;
    }
    .jlpt-play-group {
      display: inline-flex; gap: 4px; padding: 2px; border-radius: 10px;
      background: var(--bg, #f5f5f7);
    }
    .jlpt-play-group button {
      background: transparent; border: none; padding: 4px 10px; border-radius: 6px;
      font-size: 12px; cursor: pointer; color: inherit;
    }
    .jlpt-play-group button:hover { background: var(--elevated, rgba(0,0,0,0.04)); }
    .jlpt-q-situation {
      font-size: 13px; color: var(--muted, #555); background: rgba(0,113,227,.04);
      padding: 8px 10px; border-radius: 8px; margin-bottom: 10px; line-height: 1.5;
    }
    .jlpt-q-stem { font-size: 15px; line-height: 1.6; margin: 8px 0 10px; font-weight: 500; }

    .jlpt-transcript {
      border: 1px dashed var(--border, rgba(0,0,0,0.1));
      border-radius: 10px; padding: 10px 12px; margin: 10px 0;
      background: var(--bg, #fff); font-size: 13.5px; line-height: 1.7;
      position: relative;
    }
    .jlpt-transcript.is-blurred .jlpt-transcript-body {
      filter: blur(8px) saturate(.5);
      user-select: none; pointer-events: none;
      transition: filter .28s ease;
    }
    .jlpt-transcript-toolbar {
      display:flex; align-items:center; gap:8px; margin-bottom:6px;
      font-size: 11px; color: var(--muted, #888); flex-wrap: wrap;
    }
    .jlpt-transcript-toolbar button {
      background: transparent; border: 1px solid var(--border, rgba(0,0,0,.15));
      border-radius: 6px; padding: 2px 10px; font-size: 11px; cursor: pointer; color: inherit;
    }
    .jlpt-transcript-toolbar button:hover { background: var(--elevated, rgba(0,0,0,.04)); }
    .jlpt-stage-badge {
      display: inline-block; font-size: 10px; font-weight: 700;
      padding: 1px 7px; border-radius: 10px; background: rgba(0,113,227,.14); color: #0071e3;
      letter-spacing: .02em;
    }
    .jlpt-stage-badge[data-stage="slow"] { background: rgba(255,149,0,.18); color: #cc7a00; }
    .jlpt-stage-badge[data-stage="reveal"] { background: rgba(52,199,89,.18); color: #1d7d3f; }

    .jlpt-line {
      display:flex; gap:10px; margin: 4px 0; padding: 4px 0;
      border-bottom: 1px dashed var(--border, rgba(0,0,0,0.05));
    }
    .jlpt-line:last-child { border-bottom: none; }
    .jlpt-line .sp {
      flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%;
      display: inline-flex; align-items:center; justify-content:center;
      font-size: 11px; font-weight: 700; color: #fff;
    }
    .jlpt-line .sp[data-speaker="A"], .jlpt-line .sp[data-speaker="男"] { background: #0071e3; }
    .jlpt-line .sp[data-speaker="B"], .jlpt-line .sp[data-speaker="女"] { background: #af52de; }
    .jlpt-line .sp[data-speaker="N"], .jlpt-line .sp[data-speaker="narrator"] { background: #8e8e93; }
    .jlpt-line .tx { flex: 1 1 auto; }
    .jlpt-line .play-one {
      flex: 0 0 auto; background: transparent; border: 1px solid var(--border, rgba(0,0,0,.15));
      border-radius: 6px; padding: 0 6px; font-size: 11px; cursor: pointer; color: inherit; height: 22px;
    }

    .jlpt-q-opts { display: flex; flex-direction: column; gap: 6px; }
    .jlpt-q-opt {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 8px 12px; border-radius: 10px; cursor: pointer;
      font-size: 14px; line-height: 1.5;
      border: 1px solid transparent;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .jlpt-q-opt:hover { background: var(--bg, rgba(0,0,0,0.04)); }
    .jlpt-q-opt input { margin-top: 4px; flex-shrink: 0; }
    .jlpt-q-opt.is-correct { background: rgba(52,199,89,.10); border-color: rgba(52,199,89,.40); }
    .jlpt-q-opt.is-wrong { background: rgba(255,59,48,.08); border-color: rgba(255,59,48,.35); }

    .jlpt-q-show {
      margin-top: 10px;
      background: none; border: 1px solid var(--border, rgba(0,0,0,0.15));
      border-radius: 6px; padding: 4px 12px; cursor: pointer;
      font-size: 12px; color: inherit;
    }
    .jlpt-q-reveal {
      margin-top: 10px; padding: 12px 14px; border-radius: 10px;
      background: var(--bg, rgba(0,0,0,0.04));
      font-size: 13px; line-height: 1.6;
    }
    .jlpt-q-answer { font-size: 14px; margin-bottom: 6px; }
    .jlpt-q-cite { color: var(--muted, #888); font-size: 12px; margin-top: 6px; font-style: italic; }

    .jlpt-depth { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
    .jlpt-depth-section {
      border-left: 3px solid var(--ap-blue, #0071e3);
      padding: 6px 10px; background: rgba(0,113,227,.04);
      border-radius: 0 6px 6px 0;
    }
    .jlpt-depth-section[data-k="grammar"] { border-left-color: #af52de; background: rgba(175,82,222,.05); }
    .jlpt-depth-section[data-k="traps"]   { border-left-color: #ff9500; background: rgba(255,149,0,.05); }
    .jlpt-depth-label {
      font-size: 10px; font-weight: 700; letter-spacing: .04em;
      text-transform: uppercase; opacity: .7; margin-bottom: 2px;
    }
    .jlpt-depth-row { font-size: 13px; line-height: 1.5; padding: 2px 0; display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
    .jlpt-depth-row .surface { font-weight: 600; }
    .jlpt-depth-row .reading { font-size: 11px; color: var(--muted, #888); }
    .jlpt-depth-row .meaning { color: var(--muted, #555); }
    .jlpt-depth-row .addv {
      margin-left: auto; background: transparent; border: 1px solid var(--border, rgba(0,0,0,.15));
      border-radius: 999px; padding: 0 8px; height: 20px; font-size: 10.5px; cursor: pointer; color: inherit;
    }
    .jlpt-depth-row .addv:hover { background: rgba(52,199,89,.14); border-color: #34c759; color: #1d7d3f; }

    .jlpt-dict-input {
      width:100%; padding:8px 10px; margin-top:10px; border:1px solid var(--border, rgba(0,0,0,0.15));
      border-radius:8px; background:var(--bg,#fff); color:inherit; font-size:14px;
    }

    .jlpt-scorecard { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
    .jlpt-scorecard .sc-total {
      font-size: 48px; font-weight: 700; letter-spacing: -0.02em;
      text-align: center; color: var(--text, #1d1d1f); line-height: 1;
    }
    .jlpt-scorecard .sc-subtitle { text-align: center; color: var(--muted, #888); font-size: 13px; }
    .jlpt-scorecard .sc-breakdown {
      display: flex; flex-direction: column; gap: 6px;
      background: var(--bg, #fff); border: 1px solid var(--border, rgba(0,0,0,.08));
      border-radius: 10px; padding: 12px;
    }
    .jlpt-scorecard .sc-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
    .jlpt-scorecard .sc-row .bar {
      flex: 1 1 auto; height: 6px; border-radius: 999px; background: rgba(0,0,0,.06); overflow: hidden;
    }
    .jlpt-scorecard .sc-row .bar > span { display: block; height: 100%; background: #34c759; }
    .jlpt-scorecard .sc-row .bar.low > span { background: #ff3b30; }
    .jlpt-scorecard .sc-row .bar.mid > span { background: #ff9500; }
    .jlpt-scorecard .sc-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

    :root[data-theme="dark"] .jlpt-transcript { background: rgba(255,255,255,.04); }
    :root[data-theme="dark"] .jlpt-q-opt.is-correct { background: rgba(52,199,89,.16); }
    :root[data-theme="dark"] .jlpt-q-opt.is-wrong { background: rgba(255,59,48,.14); }
    :root[data-theme="dark"] .jlpt-q-reveal { background: rgba(255,255,255,.06); }
    :root[data-theme="dark"] .jlpt-depth-section { background: rgba(0,113,227,.10); }
    :root[data-theme="dark"] .jlpt-play-group { background: rgba(255,255,255,.06); }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function speakerBadge(sp) {
  const s = String(sp || '').trim() || 'N';
  return `<span class="sp" data-speaker="${escapeHtml(s)}">${escapeHtml(s)}</span>`;
}

function transcriptBlock({ lines, rawText, examMode, lockKey }) {
  const wrap = document.createElement('div');
  wrap.className = 'jlpt-transcript is-blurred';

  const toolbar = document.createElement('div');
  toolbar.className = 'jlpt-transcript-toolbar';

  const stageBadge = document.createElement('span');
  stageBadge.className = 'jlpt-stage-badge';
  stageBadge.dataset.stage = 'fast';
  stageBadge.textContent = '🔊 ready';

  const playFast = document.createElement('button');
  playFast.type = 'button';
  playFast.textContent = '▶︎ 1.0×';

  const playSlow = document.createElement('button');
  playSlow.type = 'button';
  playSlow.textContent = '🐢 0.75×';

  const staged = document.createElement('button');
  staged.type = 'button';
  staged.textContent = '🎧 一键三阶段';

  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.textContent = '👁 查看文本';

  toolbar.append(stageBadge, playFast, playSlow, staged, revealBtn);
  wrap.appendChild(toolbar);

  const body = document.createElement('div');
  body.className = 'jlpt-transcript-body';
  if (Array.isArray(lines) && lines.length) {
    lines.forEach((ln) => {
      const row = document.createElement('div');
      row.className = 'jlpt-line';
      row.innerHTML = `
        ${speakerBadge(ln.speaker || 'N')}
        <span class="tx">${escapeHtml(ln.text || '')}</span>
        <button type="button" class="play-one" aria-label="朗读这行">▶︎</button>
      `;
      row.querySelector('.play-one').addEventListener('click', () => {
        speak(ln.text || '', { voice: voiceForSpeaker(ln.speaker), lockKey: examMode ? lockKey : null });
      });
      body.appendChild(row);
    });
  } else if (rawText) {
    body.textContent = rawText;
  }
  wrap.appendChild(body);

  const reveal = () => {
    wrap.classList.remove('is-blurred');
    stageBadge.dataset.stage = 'reveal';
    stageBadge.textContent = '✓ revealed';
  };
  revealBtn.addEventListener('click', reveal);

  const payload = Array.isArray(lines) && lines.length
    ? lines
    : [{ speaker: 'N', text: String(rawText || '') }];

  playFast.addEventListener('click', () => {
    stageBadge.dataset.stage = 'fast';
    stageBadge.textContent = '🔊 1.0×';
    speakQueue(payload, { rate: 1, lockKey: examMode ? lockKey : null });
  });
  playSlow.addEventListener('click', () => {
    stageBadge.dataset.stage = 'slow';
    stageBadge.textContent = '🐢 0.75×';
    speakQueue(payload, { rate: 0.75, lockKey: examMode ? lockKey : null });
  });
  staged.addEventListener('click', () => {
    speakStaged(payload, {
      lockKey: examMode ? lockKey : null,
      onStage: (st) => {
        stageBadge.dataset.stage = st;
        stageBadge.textContent = st === 'fast' ? '🔊 1.0×' : st === 'slow' ? '🐢 0.75×' : '✓ reveal';
        if (st === 'reveal') reveal();
      },
    });
  });

  if (examMode) {
    playSlow.style.display = 'none';
    staged.style.display = 'none';
  }

  return wrap;
}

function depthPanel(depth, { stem, level } = {}) {
  if (!depth || typeof depth !== 'object') return null;
  const vocab = Array.isArray(depth.vocab) ? depth.vocab : [];
  const grammar = Array.isArray(depth.grammar) ? depth.grammar : [];
  const traps = Array.isArray(depth.traps) ? depth.traps : [];
  if (!vocab.length && !grammar.length && !traps.length) return null;

  const box = document.createElement('div');
  box.className = 'jlpt-depth';

  if (vocab.length) {
    const sec = document.createElement('div');
    sec.className = 'jlpt-depth-section';
    sec.dataset.k = 'vocab';
    sec.innerHTML = `<div class="jlpt-depth-label">📚 词汇</div>`;
    vocab.forEach((v) => {
      const row = document.createElement('div');
      row.className = 'jlpt-depth-row';
      row.innerHTML = `
        <span class="surface">${escapeHtml(v.surface || '')}</span>
        <span class="reading">${escapeHtml(v.reading || '')}</span>
        <span class="meaning">${escapeHtml(v.meaning_zh || v.meaning || '')}</span>
        <button type="button" class="addv" title="加入词汇本">＋</button>
      `;
      row.querySelector('.addv').addEventListener('click', (ev) => {
        ev.stopPropagation();
        try {
          if (typeof window.__yomikikuanAddVocab === 'function') {
            window.__yomikikuanAddVocab({
              surface: v.surface || '',
              reading: v.reading || '',
              meaning_zh: v.meaning_zh || v.meaning || '',
              source_stem: stem || '',
              level: level || '',
            });
            const btn = ev.currentTarget;
            btn.textContent = '✓';
            btn.disabled = true;
            btn.style.background = 'rgba(52,199,89,.16)';
          }
        } catch (e) { console.warn('[jlpt] addVocab failed', e); }
      });
      sec.appendChild(row);
    });
    box.appendChild(sec);
  }

  if (grammar.length) {
    const sec = document.createElement('div');
    sec.className = 'jlpt-depth-section';
    sec.dataset.k = 'grammar';
    sec.innerHTML = `<div class="jlpt-depth-label">📐 语法点</div>`;
    grammar.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'jlpt-depth-row';
      row.innerHTML = `<span class="surface">${escapeHtml(g.point || '')}</span><span class="meaning">${escapeHtml(g.note_zh || g.note || '')}</span>`;
      sec.appendChild(row);
    });
    box.appendChild(sec);
  }

  if (traps.length) {
    const sec = document.createElement('div');
    sec.className = 'jlpt-depth-section';
    sec.dataset.k = 'traps';
    sec.innerHTML = `<div class="jlpt-depth-label">⚠️ 陷阱分析</div>`;
    traps.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'jlpt-depth-row';
      const optLabel = t.option != null ? `${String.fromCharCode(65 + Number(t.option))}: ` : '';
      row.innerHTML = `<span class="meaning">${escapeHtml(optLabel)}${escapeHtml(t.why_zh || t.why || '')}</span>`;
      sec.appendChild(row);
    });
    box.appendChild(sec);
  }

  return box;
}

function mcqCard({ q, qi, payload, examMode, onAnswer, skipTranscript }) {
  const card = document.createElement('div');
  card.className = 'jlpt-q';
  const level = payload.level || '';
  const lockKey = `${payload.mode}-${q.id || qi}`;

  const header = document.createElement('div');
  header.className = 'jlpt-q-header';
  header.innerHTML = `
    <div class="jlpt-q-type-wrap">
      <span class="jlpt-q-level">${escapeHtml(level)}</span>
      <span class="jlpt-q-type">${escapeHtml(q.type || MODE_META[payload.mode]?.nameJa || 'JLPT')}</span>
    </div>
  `;
  card.appendChild(header);

  if (q.situation) {
    const sit = document.createElement('div');
    sit.className = 'jlpt-q-situation';
    sit.textContent = q.situation;
    card.appendChild(sit);
  }

  const hasDialogue = Array.isArray(q.dialogue) && q.dialogue.length > 0;
  const hasPassage = !!q.passage;
  if (!skipTranscript && (hasDialogue || hasPassage)) {
    card.appendChild(transcriptBlock({
      lines: hasDialogue ? q.dialogue : null,
      rawText: hasPassage ? q.passage : '',
      examMode,
      lockKey,
    }));
  }

  const stem = document.createElement('div');
  stem.className = 'jlpt-q-stem';
  stem.textContent = `${qi + 1}. ${q.stem || ''}`;
  card.appendChild(stem);

  const opts = document.createElement('div');
  opts.className = 'jlpt-q-opts';

  const correctIdx = Number(q.answerIndex);

  const reveal = document.createElement('div');
  reveal.className = 'jlpt-q-reveal';
  reveal.hidden = true;
  const answerLine = document.createElement('div');
  answerLine.className = 'jlpt-q-answer';
  answerLine.innerHTML = `<b>正解：${String.fromCharCode(65 + (isFinite(correctIdx) ? correctIdx : 0))}</b>`;
  const explainLine = document.createElement('div');
  explainLine.className = 'jlpt-q-explain';
  explainLine.textContent = q.explanation || '';
  const citeLine = document.createElement('div');
  citeLine.className = 'jlpt-q-cite';
  citeLine.textContent = q.citation ? `出典：${q.citation}` : '';
  reveal.append(answerLine, explainLine, citeLine);

  const depth = depthPanel(q.depth, { stem: q.stem, level });
  if (depth) reveal.appendChild(depth);

  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'jlpt-q-show';
  revealBtn.textContent = '查看答案/解析';
  revealBtn.hidden = true;
  revealBtn.addEventListener('click', () => { reveal.hidden = !reveal.hidden; });

  (q.options || []).forEach((opt, i) => {
    const label = document.createElement('label');
    label.className = 'jlpt-q-opt';
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = `jlpt-q-${payload.mode}-${qi}-${q.id || ''}`;
    r.value = String(i);
    const span = document.createElement('span');
    span.textContent = `${String.fromCharCode(65 + i)}. ${opt}`;
    label.append(r, span);
    r.addEventListener('change', () => {
      const correct = correctIdx === i;
      card.classList.add('answered');
      card.classList.toggle('correct', correct);
      card.classList.toggle('wrong', !correct);
      if (!examMode) {
        opts.querySelectorAll('.jlpt-q-opt').forEach((el, ei) => {
          el.classList.remove('is-correct', 'is-wrong');
          if (ei === correctIdx) el.classList.add('is-correct');
          else if (ei === i && !correct) el.classList.add('is-wrong');
        });
        revealBtn.hidden = false;
        reveal.hidden = false;
      }
      if (typeof onAnswer === 'function') {
        onAnswer({ qi, chosen: i, correct, question: q, lockKey });
      }
      if (!correct && !card.__loggedMistake && typeof window.__yomikikuanAddMistake === 'function') {
        card.__loggedMistake = true;
        try {
          window.__yomikikuanAddMistake({
            stem: q.stem || '',
            options: Array.isArray(q.options) ? q.options : [],
            correctIndex: correctIdx || 0,
            userAnswerIndex: i,
            explanation: q.explanation || '',
            citation: q.citation || '',
            level,
            source: {
              docId: (window.documentManager && window.documentManager.getActiveId && window.documentManager.getActiveId()) || '',
              mode: payload.mode,
              type: q.type || '',
            },
          });
        } catch (e) { console.warn('[jlpt] addMistake failed', e); }
      }
    });
    opts.append(label);
  });

  card.append(opts, revealBtn, reveal);
  return card;
}

function renderKadaiOrPointOrGist(listEl, payload, ctx) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) { emptyEl(listEl, '未生成任何题目'); return; }
  items.forEach((q, qi) => {
    listEl.appendChild(mcqCard({ q, qi, payload, examMode: ctx?.examMode, onAnswer: ctx?.onAnswer }));
  });
}

function renderHatsuOrSokuji(listEl, payload, ctx) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) { emptyEl(listEl, '未生成任何题目'); return; }
  items.forEach((q, qi) => {
    const card = document.createElement('div');
    card.className = 'jlpt-q';
    const level = payload.level || '';
    const lockKey = `${payload.mode}-${q.id || qi}`;

    const header = document.createElement('div');
    header.className = 'jlpt-q-header';
    header.innerHTML = `
      <div class="jlpt-q-type-wrap">
        <span class="jlpt-q-level">${escapeHtml(level)}</span>
        <span class="jlpt-q-type">${escapeHtml(q.type || MODE_META[payload.mode]?.nameJa)}</span>
      </div>
      <div class="jlpt-play-group">
        <button type="button" data-act="play">▶︎ 朗读 ${payload.mode === 'sokuji' ? '问句' : '情境'}</button>
      </div>
    `;
    card.appendChild(header);

    const situation = document.createElement('div');
    situation.className = 'jlpt-q-situation';
    situation.textContent = payload.mode === 'sokuji'
      ? `問題：${q.prompt || ''}`
      : (q.situation || '');
    card.appendChild(situation);

    header.querySelector('[data-act="play"]').addEventListener('click', () => {
      const text = payload.mode === 'sokuji' ? (q.prompt || '') : (q.situation || '');
      speak(text, { lockKey: ctx?.examMode ? lockKey : null });
    });

    const opts = document.createElement('div');
    opts.className = 'jlpt-q-opts';
    const correctIdx = Number(q.answerIndex);

    const reveal = document.createElement('div');
    reveal.className = 'jlpt-q-reveal';
    reveal.hidden = true;
    reveal.innerHTML = `<div class="jlpt-q-answer"><b>正解：${String.fromCharCode(65 + (isFinite(correctIdx) ? correctIdx : 0))}</b></div>`;
    const note = payload.mode === 'sokuji' ? q.reasoning_zh : q.pragmatic_zh;
    if (note) {
      const p = document.createElement('div');
      p.textContent = note;
      reveal.appendChild(p);
    }
    const depth = depthPanel(q.depth, { stem: q.prompt || q.situation || '', level });
    if (depth) reveal.appendChild(depth);

    (q.options || []).forEach((opt, i) => {
      const label = document.createElement('label');
      label.className = 'jlpt-q-opt';
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = `jlpt-q-${payload.mode}-${qi}-${q.id || ''}`;
      r.value = String(i);
      const span = document.createElement('span');
      span.innerHTML = `${String.fromCharCode(65 + i)}. ${escapeHtml(opt)} <button type="button" class="play-one" style="margin-left:6px;">▶︎</button>`;
      label.append(r, span);
      span.querySelector('.play-one').addEventListener('click', (ev) => {
        ev.preventDefault();
        speak(opt, { voice: voiceForSpeaker('B') });
      });
      r.addEventListener('change', () => {
        const correct = correctIdx === i;
        card.classList.add('answered');
        card.classList.toggle('correct', correct);
        card.classList.toggle('wrong', !correct);
        if (!ctx?.examMode) {
          opts.querySelectorAll('.jlpt-q-opt').forEach((el, ei) => {
            el.classList.remove('is-correct', 'is-wrong');
            if (ei === correctIdx) el.classList.add('is-correct');
            else if (ei === i && !correct) el.classList.add('is-wrong');
          });
          reveal.hidden = false;
        }
        if (typeof ctx?.onAnswer === 'function') {
          ctx.onAnswer({ qi, chosen: i, correct, question: q, lockKey });
        }
        if (!correct && !card.__loggedMistake && typeof window.__yomikikuanAddMistake === 'function') {
          card.__loggedMistake = true;
          try {
            window.__yomikikuanAddMistake({
              stem: q.prompt || q.situation || '',
              options: Array.isArray(q.options) ? q.options : [],
              correctIndex: correctIdx || 0,
              userAnswerIndex: i,
              explanation: note || '',
              citation: '',
              level,
              source: {
                docId: (window.documentManager && window.documentManager.getActiveId && window.documentManager.getActiveId()) || '',
                mode: payload.mode,
                type: q.type || '',
              },
            });
          } catch (_) {}
        }
      });
      opts.append(label);
    });
    card.append(opts, reveal);
    listEl.appendChild(card);
  });
}

function renderTogo(listEl, payload, ctx) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) { emptyEl(listEl, '未生成任何题目'); return; }
  items.forEach((unit, ui) => {
    const wrap = document.createElement('div');
    wrap.className = 'jlpt-q';
    wrap.innerHTML = `<div class="jlpt-q-header"><div class="jlpt-q-type-wrap">
      <span class="jlpt-q-level">${escapeHtml(payload.level || '')}</span>
      <span class="jlpt-q-type">${escapeHtml(unit.type || '統合理解')} · ${ui + 1}</span></div></div>`;
    wrap.appendChild(transcriptBlock({
      lines: Array.isArray(unit.dialogue) && unit.dialogue.length ? unit.dialogue : null,
      rawText: unit.passage || '',
      examMode: ctx?.examMode,
      lockKey: `togo-${unit.id || ui}`,
    }));
    (unit.questions || []).forEach((sq, si) => {
      const sub = mcqCard({
        q: { ...sq, type: `統合 Q${si + 1}` },
        qi: si,
        payload,
        examMode: ctx?.examMode,
        onAnswer: ctx?.onAnswer,
        skipTranscript: true,
      });
      wrap.appendChild(sub);
    });
    listEl.appendChild(wrap);
  });
}

function renderDialogue(listEl, payload, ctx) {
  if (Array.isArray(payload.dialogue) && payload.dialogue.length) {
    const wrap = document.createElement('div');
    wrap.className = 'jlpt-q';
    wrap.innerHTML = `<div class="jlpt-q-header"><div class="jlpt-q-type-wrap">
      <span class="jlpt-q-level">${escapeHtml(payload.level || '')}</span>
      <span class="jlpt-q-type">対話</span></div></div>`;
    wrap.appendChild(transcriptBlock({
      lines: payload.dialogue,
      examMode: ctx?.examMode,
      lockKey: 'dialogue-main',
    }));
    listEl.appendChild(wrap);
  }
  const qs = Array.isArray(payload.questions) ? payload.questions : [];
  qs.forEach((q, qi) => {
    listEl.appendChild(mcqCard({ q, qi, payload, examMode: ctx?.examMode, onAnswer: ctx?.onAnswer, skipTranscript: true }));
  });
}

function renderDictation(listEl, payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) { emptyEl(listEl, '未生成任何听写题'); return; }
  items.forEach((it) => {
    const card = document.createElement('div');
    card.className = 'jlpt-q';
    card.innerHTML = `
      <div class="jlpt-q-header">
        <div class="jlpt-q-type-wrap">
          <span class="jlpt-q-level">${escapeHtml(payload.level || '')}</span>
          <span class="jlpt-q-type">听写</span>
        </div>
        <div class="jlpt-play-group">
          <button type="button" data-act="play">▶︎ 朗读</button>
          <button type="button" data-act="slow">🐢 0.75×</button>
        </div>
      </div>
      <div class="jlpt-q-cite">提示：${escapeHtml(it.hint || '')}</div>
    `;
    card.querySelector('[data-act="play"]').addEventListener('click', () => speak(it.sentence || '', { rate: 1 }));
    card.querySelector('[data-act="slow"]').addEventListener('click', () => speak(it.sentence || '', { rate: 0.75 }));

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'jlpt-dict-input';
    input.placeholder = '请输入听到的内容';
    card.appendChild(input);

    const check = document.createElement('button');
    check.className = 'jlpt-q-show';
    check.type = 'button';
    check.textContent = '对照答案';
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
      truthLine.innerHTML = `<b>正解：</b>${escapeHtml(truth)}`;
      const userLine = document.createElement('div');
      userLine.style.marginTop = '6px';
      userLine.innerHTML = `<b>你的：</b>${diffHighlight(user, truth)}`;
      diff.append(truthLine, userLine);
      const correct = user === truth;
      card.classList.add('answered');
      card.classList.toggle('correct', correct);
      card.classList.toggle('wrong', !correct);
    });

    // Shadowing — record user's spoken rendition via Web Speech Recognition.
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const shadow = document.createElement('div');
      shadow.className = 'jlpt-shadow';
      shadow.innerHTML = `
        <button type="button" data-act="rec">🎤 跟读</button>
        <span class="shadow-hint">Shadowing：点击后用嘴重复这句话，系统对比字符差异</span>
        <span class="shadow-transcript" hidden></span>
      `;
      const recBtn = shadow.querySelector('[data-act="rec"]');
      const hint = shadow.querySelector('.shadow-hint');
      const transcriptEl = shadow.querySelector('.shadow-transcript');
      let rec = null;
      recBtn.addEventListener('click', () => {
        if (rec) { try { rec.stop(); } catch (_) {} rec = null; return; }
        try {
          rec = new SR();
          rec.lang = 'ja-JP';
          rec.interimResults = false;
          rec.continuous = false;
          recBtn.classList.add('is-recording');
          recBtn.textContent = '⏺ 录音中…';
          hint.hidden = true;
          transcriptEl.hidden = false;
          transcriptEl.textContent = '';
          rec.onresult = (e) => {
            const txt = Array.from(e.results).map(r => r[0]?.transcript || '').join('').trim();
            const confs = Array.from(e.results).map(r => Number(r[0]?.confidence) || 0).filter(n => n > 0);
            const avgConf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
            const truth = (it.sentence || '').trim();
            let matched = 0;
            const n = Math.min(txt.length, truth.length);
            for (let i = 0; i < n; i++) if (txt[i] === truth[i]) matched += 1;
            const charScore = truth.length > 0 ? matched / truth.length : 0;
            const score = Math.round((charScore * 0.6 + avgConf * 0.4) * 100);
            const medal = score >= 90 ? '🏆' : score >= 75 ? '🥈' : score >= 60 ? '🥉' : '💪';
            const color = score >= 75 ? '#1d7d3f' : score >= 60 ? '#cc7a00' : '#ff3b30';
            transcriptEl.innerHTML = `
              <div>你说：${diffHighlight(txt, truth)}</div>
              <div style="margin-top:4px;font-size:11px;color:${color};">
                ${medal} <b>${score}分</b>
                · 字符匹配 ${Math.round(charScore*100)}%
                · 识别置信度 ${Math.round(avgConf*100)}%
              </div>
            `;
          };
          rec.onerror = (e) => {
            transcriptEl.textContent = `识别错误：${e.error || e.message || 'unknown'}`;
          };
          rec.onend = () => {
            recBtn.classList.remove('is-recording');
            recBtn.textContent = '🎤 再录一遍';
            rec = null;
          };
          rec.start();
        } catch (err) {
          recBtn.classList.remove('is-recording');
          recBtn.textContent = '🎤 跟读';
          transcriptEl.hidden = false;
          transcriptEl.textContent = `无法启动识别：${err.message || err}`;
        }
      });
      card.appendChild(shadow);
    }

    listEl.appendChild(card);
  });
}

function diffHighlight(user, truth) {
  const u = String(user || ''); const t = String(truth || '');
  const n = Math.max(u.length, t.length);
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = u[i]; const b = t[i];
    if (a === b) out += escapeHtml(a || '');
    else if (a == null) out += `<u style="color:#ff3b30;">＿</u>`;
    else out += `<u style="color:#ff3b30;">${escapeHtml(a)}</u>`;
  }
  return out || '<i style="opacity:.5;">(未输入)</i>';
}

function emptyEl(listEl, msg) {
  const d = document.createElement('div');
  d.className = 'jlpt-status';
  d.textContent = msg;
  d.style.cssText = 'padding:20px;text-align:center;color:var(--muted,#888);';
  listEl.appendChild(d);
}

export function renderForMode(listEl, payload, ctx = {}) {
  injectCss();
  listEl.innerHTML = '';
  const mode = payload?.mode;
  switch (mode) {
    case 'kadai':
    case 'point':
    case 'gist':
      return renderKadaiOrPointOrGist(listEl, payload, ctx);
    case 'hatsu':
    case 'sokuji':
      return renderHatsuOrSokuji(listEl, payload, ctx);
    case 'togo':
      return renderTogo(listEl, payload, ctx);
    case 'dialogue':
      return renderDialogue(listEl, payload, ctx);
    case 'dictation':
      return renderDictation(listEl, payload);
    default:
      if (Array.isArray(payload?.questions)) return renderDialogue(listEl, payload, ctx);
      emptyEl(listEl, `未知模式 ${mode}`);
  }
}

export function renderScorecard(container, report, ctx = {}) {
  injectCss();
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'jlpt-scorecard';

  const pct = report.total > 0 ? Math.round((report.correct / report.total) * 100) : 0;

  const total = document.createElement('div');
  total.className = 'sc-total';
  total.textContent = `${pct}%`;

  const sub = document.createElement('div');
  sub.className = 'sc-subtitle';
  sub.textContent = `答对 ${report.correct} / ${report.total}  ·  用时 ${formatDuration(report.durationMs)}  ·  ${report.level || ''} 级`;

  const breakdown = document.createElement('div');
  breakdown.className = 'sc-breakdown';
  (report.byMode || []).forEach((row) => {
    const p = row.total > 0 ? row.correct / row.total : 0;
    const barClass = p >= 0.8 ? '' : p >= 0.5 ? 'mid' : 'low';
    const el = document.createElement('div');
    el.className = 'sc-row';
    el.innerHTML = `
      <span style="flex:0 0 auto;min-width:120px;">${escapeHtml(MODE_META[row.mode]?.emoji || '')} ${escapeHtml(MODE_META[row.mode]?.nameJa || row.mode)}</span>
      <span class="bar ${barClass}"><span style="width:${Math.round(p * 100)}%"></span></span>
      <span style="flex:0 0 auto;min-width:52px;text-align:right;">${row.correct}/${row.total}</span>
    `;
    breakdown.appendChild(el);
  });

  const actions = document.createElement('div');
  actions.className = 'sc-actions';
  const reviewBtn = document.createElement('button');
  reviewBtn.type = 'button';
  reviewBtn.className = 'jlpt-q-show';
  reviewBtn.textContent = '📋 查看逐题详解';
  reviewBtn.addEventListener('click', () => ctx.onReview && ctx.onReview());
  const retakeBtn = document.createElement('button');
  retakeBtn.type = 'button';
  retakeBtn.style.cssText = 'padding:6px 14px;border-radius:8px;border:none;background:var(--accent,#0071e3);color:#fff;cursor:pointer;font-size:13px;';
  retakeBtn.textContent = '🔁 再来一套';
  retakeBtn.addEventListener('click', () => ctx.onRetake && ctx.onRetake());
  actions.append(reviewBtn, retakeBtn);

  root.append(total, sub, breakdown, actions);
  container.appendChild(root);
}

function formatDuration(ms) {
  const s = Math.round((Number(ms) || 0) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export { stopAll };
