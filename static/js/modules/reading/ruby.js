// Ruby <ruby><rt> markup builder — extracted from main-js.js (Phase 2).
// Given a token's surface (e.g. "書き出す") + reading (e.g. "かきだす") + target
// kana script ("hiragana" | "katakana"), splits surface into kanji/kana segments
// and aligns the reading per-segment so each kanji span gets its own ruby tag,
// not just one big ruby for the whole surface.
//
// All functions are pure: string-in, HTML-string-out. Depend only on kana.js.
//
// Note: window.YomikikuanRuby (toggle API) lives in main-js.js — different
// concern. This module registers as window.YomikikuanRubyMarkup.

import { escapeHtmlForRuby, normalizeKanaByScript } from './kana.js';

const KANA_RE = /[ぁ-ゖァ-ヺーー]/;
const KANJI_RE = /[一-鿿㐀-䶿]/;
const LEAD_KANA_RE = /^[ぁ-ゖァ-ヺーー]+/;
const TAIL_KANA_RE = /[ぁ-ゖァ-ヺーー]+$/;

const toHira = (x) => normalizeKanaByScript(x, 'hiragana');

export function buildRubyMarkup(surface, reading, script) {
  const s = String(surface || '');
  if (!s) return '';
  if (!KANJI_RE.test(s)) return escapeHtmlForRuby(s);

  const r = normalizeKanaByScript(String(reading || ''), script);
  if (!r) return escapeHtmlForRuby(s);

  // 1) split surface into kanji / kana segments
  const segs = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const isKana = KANA_RE.test(ch);
    let j = i + 1;
    while (j < s.length && KANA_RE.test(s[j]) === isKana) j++;
    segs.push({ type: isKana ? 'kana' : 'kanji', text: s.slice(i, j) });
    i = j;
  }

  // 2) anchor kana segments inside reading; if any anchor fails, fall back
  const rHira = toHira(r);
  const kanaSpans = [];
  let cursor = 0;
  for (let k = 0; k < segs.length; k++) {
    if (segs[k].type !== 'kana') continue;
    const needle = toHira(segs[k].text);
    if (!needle) continue;
    const found = rHira.indexOf(needle, cursor);
    if (found < 0) return fallbackRuby(s, r, script);
    kanaSpans.push({ segIdx: k, start: found, end: found + needle.length });
    cursor = found + needle.length;
  }

  // 3) emit per-segment, kanji segments take whatever reading sits between
  // the surrounding kana anchors
  let out = '';
  let rPos = 0;
  let spanCur = 0;
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k];
    if (seg.type === 'kana') {
      const sp = kanaSpans[spanCur++];
      out += escapeHtmlForRuby(seg.text);
      rPos = sp.end;
      continue;
    }
    const nextKana = kanaSpans[spanCur];
    const end = nextKana ? nextKana.start : rHira.length;
    const chunkHira = rHira.slice(rPos, end);
    if (!chunkHira) {
      out += escapeHtmlForRuby(seg.text);
      continue;
    }
    const chunk = normalizeKanaByScript(chunkHira, script);
    out += `<ruby>${escapeHtmlForRuby(seg.text)}<rt>${escapeHtmlForRuby(chunk)}</rt></ruby>`;
    rPos = end;
  }
  return out;
}

// Fallback: strip leading + trailing kana from surface, attach the leftover
// reading to the kanji middle. Used when per-segment alignment fails.
export function fallbackRuby(surface, reading, script) {
  const s = String(surface || '');
  const r = String(reading || '');
  const lead = (s.match(LEAD_KANA_RE) || [''])[0];
  const rest = s.slice(lead.length);
  const tail = (rest.match(TAIL_KANA_RE) || [''])[0];
  const base = rest.slice(0, rest.length - tail.length);
  if (!base) return escapeHtmlForRuby(s);
  let rb = toHira(r);
  const leadH = toHira(lead);
  const tailH = toHira(tail);
  if (leadH && rb.startsWith(leadH)) rb = rb.slice(leadH.length);
  if (tailH && rb.endsWith(tailH)) rb = rb.slice(0, rb.length - tailH.length);
  if (!rb) return escapeHtmlForRuby(s);
  const rbOut = normalizeKanaByScript(rb, script);
  return `${escapeHtmlForRuby(lead)}<ruby>${escapeHtmlForRuby(base)}<rt>${escapeHtmlForRuby(rbOut)}</rt></ruby>${escapeHtmlForRuby(tail)}`;
}

if (typeof window !== 'undefined') {
  window.YomikikuanRubyMarkup = { buildRubyMarkup, fallbackRuby };
}
