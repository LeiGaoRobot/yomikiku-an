// Pure helpers for `displayResults` (analyzer rendering).
//
// Phase-1 extraction: HTML-template builders + token/line classification
// predicates. No DOM access, no side effects, no globals. Phase-2 dedup
// (replacing the inline copies in `main-js.js → displayResults`) lands
// later.
//
// Boundary note: this module is *not* on the playback path. Safe to extract.

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
  };
}
