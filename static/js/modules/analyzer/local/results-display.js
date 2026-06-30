// Pure helpers for `displayResults` (analyzer rendering).
//
// Phase-1 extraction: HTML-template builders + token/line classification
// predicates. No DOM access, no side effects, no globals (the orchestration
// functions below read window.YomikikuanDict — see note there — but build
// only strings, never touch the DOM).
//
// Boundary note: this module is *not* on the playback path. Safe to extract.
// The onclick="playToken(...)" / "playLine(...)" attributes embedded in the
// markup below are inert string literals resolved at click-time by globals
// defined elsewhere (main-js.js) — building this markup never calls into
// the playback state machine.

import { mergeTokensForDisplay, splitKatakanaCompounds, splitLeadingParticleVerbTeDe, reflowLeadingPunctuation } from './display-tokens.js';
import { formatReading } from '../../reading/reading.js';
import { buildRubyMarkup } from '../../reading/ruby.js';
import { escapeHtmlForRuby, getRomaji } from '../../reading/kana.js';

// Regex shared with main-js.js. Centralised here so test parity is exact.
export const JAPANESE_COMMON_PUNCT_RE = /^[。、！？「」『』（）【】〜・※…ー〇]$/;
export const MARKDOWN_SYMBOL_RE = /^[#*_`>~\-=\[\]]+$/;
export const DECORATIVE_SYMBOL_RE = /^[•·\/\s\u00A0\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000]+$/;
export const MIXED_PUNCT_RE = /[#*_`>~\-=\[\](){}|\\/:;,.<>!?'"@$%^&+：・×]/;
export const LATIN_OR_NUMBER_RE = /^[A-Za-z0-9 .,:;!?\-_/+()\[\]{}'"%&@#*]+$/;

// Filter lines whose tokens are all punctuation (POS [0] === '記号' or
// '補助記号'). Pure — input is `result.lines` (array of token arrays).
export function filterPunctuationOnlyLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.filter(line => {
    if (!Array.isArray(line) || line.length === 0) return false;
    const allPunct = line.every(token => {
      const pos = Array.isArray(token.pos) ? token.pos : [token.pos || ''];
      return pos[0] === '記号' || pos[0] === '補助記号';
    });
    return !allPunct;
  });
}

// Classify a token's surface for rendering. Returns one of:
// 'empty' | 'mixedPunct' | 'japaneseCommonPunct' | 'plainPos' | 'normal'
export function classifyTokenForDisplay(surface, pos) {
  const s = String(surface || '');
  const p0 = Array.isArray(pos) ? (pos[0] || '') : (pos || '');
  if (DECORATIVE_SYMBOL_RE.test(s) || MARKDOWN_SYMBOL_RE.test(s)) return 'empty';
  const containsPunctuation = MIXED_PUNCT_RE.test(s);
  if (containsPunctuation && !JAPANESE_COMMON_PUNCT_RE.test(s)) return 'mixedPunct';
  if (JAPANESE_COMMON_PUNCT_RE.test(s)) return 'japaneseCommonPunct';
  if (p0 === '記号' || p0 === '補助記号') return 'plainPos';
  return 'normal';
}

// Whether the reading should get romaji output.
export function shouldRenderRomaji(readingOrSurface) {
  return !LATIN_OR_NUMBER_RE.test(String(readingOrSurface || ''));
}

// Resolve play text with は→わ helper-particle rule.
export function resolvePlayText(token, haAsWaEnabled) {
  const surface = (token && token.surface) || '';
  const reading = (token && token.reading) || '';
  const pos = Array.isArray(token && token.pos) ? token.pos : [(token && token.pos) || ''];
  let playText = reading || surface;
  if (surface === 'は' && pos[0] === '助詞' && haAsWaEnabled) {
    playText = 'わ';
  }
  return playText;
}

// Escape for inline JS single-quoted string in `onclick=` attribute.
export function sanitizePlayText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, '\\n');
}

// Encode for `data-token='…'` attribute (single-quoted).
export function encodeTokenDataAttr(token) {
  return JSON.stringify(token).replace(/'/g, '&apos;');
}

// Build the inner markup for a normal (non-ruby) token-pill.
export function buildTokenPillMarkup(opts) {
  const {
    tokenForUi,
    surface,
    readingText,
    romaji,
    posDisplay,
    detailInfo,
    sanitizedPlayText,
    playLabel,
  } = opts;
  const dataToken = encodeTokenDataAttr(tokenForUi);
  return `
          <span class="token-pill" onclick="toggleTokenDetails(this)" data-token='${dataToken}' data-pos="${posDisplay}">
            <div class="token-content">
              <div class="token-kana display-kana">${readingText}</div>
              ${romaji ? `<div class="token-romaji display-romaji">${romaji}</div>` : ''}
              <div class="token-kanji display-kanji">${surface}</div>
              <div class="token-pos display-pos">${posDisplay}</div>
            </div>
            <div class="token-details" style="display: none;">
              ${detailInfo}
              <button class="play-token-btn" onclick="playToken('${sanitizedPlayText}', event)" title="${playLabel}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
            </div>
          </span>
        `;
}

// Build the inner markup for a ruby-mode token (no pill).
export function buildRubyTokenMarkup(opts) {
  const { rubyInner, posDisplay, sanitizedPlayText, escapedSurface } = opts;
  return `<span class="ruby-token" data-pos="${posDisplay}" onclick="playToken('${sanitizedPlayText}', event)" title="${escapedSurface}">${rubyInner}</span>`;
}

// Build the line-container wrapper.
export function buildLineContainerMarkup(opts) {
  const {
    lineHtml,
    lineIndex,
    rubyMode,
    analyzeLineLabel,
    playLineLabel,
  } = opts;
  const rubyCls = rubyMode ? ' ruby-line' : '';
  return `
        <div class="line-container${rubyCls}" data-line-index="${lineIndex}" tabindex="-1">
          ${lineHtml}
          <button class="analyze-line-btn" onclick="window.__yomikikuanAnalyzeLine(event)" title="${analyzeLineLabel}" aria-label="${analyzeLineLabel}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
          </button>
          <button class="play-line-btn" onclick="playLine(${lineIndex})" title="${playLineLabel}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
        </div>
      `;
}

// Build one token's markup (pill or ruby-mode span, or a bare punctuation
// passthrough). `ctx` carries the per-render settings that aren't derivable
// from the token itself: { haAsWa, readingScript, rubyMode, i18nDict, playLabel }.
//
// window.YomikikuanDict (static/js/dictionary.js) is a classic-script global
// loaded well before this module ever runs — displayResults (the only
// caller, via buildResultsHtml) is handler-only, reached from the
// async-analyze try/catch, never on the initial-render boot path. The
// defensive `&&` checks mirror the style of the main-js.js code this
// replaces rather than indicating a real boot-race risk.
export function buildTokenMarkup(token, ctx) {
  const c = ctx || {};
  const dict = (typeof window !== 'undefined') ? window.YomikikuanDict : null;

  const override = (dict && dict.getTechOverride) ? dict.getTechOverride(token) : null;
  const tokenForUi = (override && override.reading) ? { ...token, reading: override.reading } : token;
  const surface = tokenForUi.surface || '';
  const reading = tokenForUi.reading || '';
  const pos = Array.isArray(tokenForUi.pos) ? tokenForUi.pos : [tokenForUi.pos || ''];

  const posInfo = (dict && dict.parsePartOfSpeech) ? dict.parsePartOfSpeech(pos) : { main: '未知', details: [], original: pos };
  const posDisplay = posInfo.main || '未知';
  const detailInfo = (dict && dict.formatDetailInfo) ? dict.formatDetailInfo(tokenForUi, posInfo, c.i18nDict || {}) : '';

  const cls = classifyTokenForDisplay(surface, pos);
  if (cls === 'empty') return '';
  if (cls === 'mixedPunct' || cls === 'plainPos') return surface;
  if (cls === 'japaneseCommonPunct') return `<span class="punct">${surface}</span>`;

  const playText = resolvePlayText(tokenForUi, c.haAsWa);
  const romaji = shouldRenderRomaji(playText) ? getRomaji(playText) : '';
  const sanitizedPlayText = sanitizePlayText(playText);
  const readingText = formatReading(tokenForUi, c.readingScript, {
    haAsWa: c.haAsWa,
    getTechOverride: dict && dict.getTechOverride,
  });

  if (c.rubyMode) {
    return buildRubyTokenMarkup({
      rubyInner: buildRubyMarkup(surface, reading, c.readingScript),
      posDisplay,
      sanitizedPlayText,
      escapedSurface: escapeHtmlForRuby(surface),
    });
  }

  return buildTokenPillMarkup({
    tokenForUi,
    surface,
    readingText,
    romaji,
    posDisplay,
    detailInfo,
    sanitizedPlayText,
    playLabel: c.playLabel,
  });
}

// Build one line's full markup (token spans + the line-container wrapper),
// or '' if the line renders to nothing. `ctx` is forwarded to buildTokenMarkup
// and also supplies { analyzeLineLabel, playLineLabel } for the wrapper.
export function buildLineHtml(line, lineIndex, ctx) {
  const c = ctx || {};
  const preSplit = splitLeadingParticleVerbTeDe(line);
  const mergedTokens = mergeTokensForDisplay(preSplit);
  const tokensForDisplay = splitKatakanaCompounds(mergedTokens);
  const lineHtml = tokensForDisplay.map((token) => buildTokenMarkup(token, c)).join('');
  if (!lineHtml.trim()) return '';
  return buildLineContainerMarkup({
    lineHtml,
    lineIndex,
    rubyMode: c.rubyMode,
    analyzeLineLabel: c.analyzeLineLabel,
    playLineLabel: c.playLineLabel,
  });
}

// Full `result.lines` → HTML string. The single entry point displayResults
// delegates to. See buildTokenMarkup / buildLineHtml for the ctx shape.
export function buildResultsHtml(lines, ctx) {
  const nonEmptyLines = filterPunctuationOnlyLines(lines);
  const linesWithoutLeadingPunct = reflowLeadingPunctuation(nonEmptyLines);
  return linesWithoutLeadingPunct
    .map((line, lineIndex) => buildLineHtml(line, lineIndex, ctx))
    .filter((html) => html)
    .join('');
}

if (typeof window !== 'undefined') {
  window.YomikikuanResultsDisplay = {
    JAPANESE_COMMON_PUNCT_RE,
    MARKDOWN_SYMBOL_RE,
    DECORATIVE_SYMBOL_RE,
    MIXED_PUNCT_RE,
    LATIN_OR_NUMBER_RE,
    filterPunctuationOnlyLines,
    classifyTokenForDisplay,
    shouldRenderRomaji,
    resolvePlayText,
    sanitizePlayText,
    encodeTokenDataAttr,
    buildTokenPillMarkup,
    buildRubyTokenMarkup,
    buildLineContainerMarkup,
    buildTokenMarkup,
    buildLineHtml,
    buildResultsHtml,
  };
}
