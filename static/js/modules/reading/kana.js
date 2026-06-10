// Pure kana / romaji helpers — extracted from main-js.js as the canonical
// module. Phase 1: parallel module + tests + window.YomikikuanKana global.
// The in-file copies in main-js.js remain in place pending a Phase-2
// deduplication that updates call sites to delegate via the global.
//
// All functions are pure: string-in, string-out. No DOM, no storage, no network.

export function toHiragana(text) {
  if (!text) return '';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x30A1 && code <= 0x30F6) {
      out += String.fromCharCode(code - 0x60);
    } else {
      out += text[i];
    }
  }
  return out;
}

export function toKatakana(text) {
  if (!text) return '';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x3041 && code <= 0x3096) {
      out += String.fromCharCode(code + 0x60);
    } else {
      out += text[i];
    }
  }
  return out;
}

export function normalizeKanaByScript(text, script) {
  if (!text) return '';
  return script === 'hiragana' ? toHiragana(text) : toKatakana(text);
}

export function escapeHtmlForRuby(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Hepburn romaji with sokuon (っ), youon (きゃ), long vowels (ー), and
// ん assimilation before bilabials / vowels.
export function getRomaji(kana) {
  if (!kana) return '';

  const toHiraganaLocal = (text) => {
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0x30A1 && code <= 0x30FA) {
        out += String.fromCharCode(code - 0x60);
      } else {
        out += text[i];
      }
    }
    return out;
  };

  const macron = (v) => ({ a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' }[v] || v);

  const base = {
    'あ':'a','い':'i','う':'u','え':'e','お':'o',
    'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
    'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
    'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
    'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
    'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
    'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
    'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
    'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
    'や':'ya','ゆ':'yu','よ':'yo',
    'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
    'わ':'wa','ゐ':'wi','ゑ':'we','を':'wo','ん':'n',
    'ゔ':'vu',
    'ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o'
  };

  const yoonCluster = {
    'き':'ky','ぎ':'gy','し':'sh','じ':'j','ち':'ch','ぢ':'j',
    'に':'ny','ひ':'hy','び':'by','ぴ':'py','み':'my','り':'ry','ゔ':'vy'
  };

  const text = toHiraganaLocal(kana);
  let romaji = '';
  let pendingSokuon = false;

  const peekChunk = (s, idx) => {
    const ch = s[idx];
    if (!ch) return '';
    if (ch === 'っ') return '';
    const next = s[idx + 1];
    if ((next === 'ゃ' || next === 'ゅ' || next === 'ょ') && yoonCluster[ch]) {
      const v = next === 'ゃ' ? 'a' : (next === 'ゅ' ? 'u' : 'o');
      return yoonCluster[ch] + v;
    }
    return base[ch] || '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === 'っ') { pendingSokuon = true; continue; }

    if (ch === 'ー') {
      const m = romaji.match(/[aeiou]$/i);
      if (m) romaji = romaji.slice(0, -1) + macron(m[0].toLowerCase());
      continue;
    }

    if (ch === 'ん') {
      let j = i + 1;
      while (text[j] === 'っ') j++;
      const nextChunk = peekChunk(text, j);
      const init = (nextChunk[0] || '').toLowerCase();
      if (/^[bmp]$/.test(init)) {
        romaji += 'm';
      } else if (/^[aeiouy]$/.test(init)) {
        romaji += "n'";
      } else {
        romaji += 'n';
      }
      continue;
    }

    const next = text[i + 1];
    if ((next === 'ゃ' || next === 'ゅ' || next === 'ょ') && yoonCluster[ch]) {
      const v = next === 'ゃ' ? 'a' : (next === 'ゅ' ? 'u' : 'o');
      let chunk = yoonCluster[ch] + v;
      if (pendingSokuon) {
        pendingSokuon = false;
        const fc = chunk[0];
        if (/^[bcdfghjklmnpqrstvwxyz]$/i.test(fc)) romaji += fc.toLowerCase();
      }
      romaji += chunk;
      i++;
      continue;
    }

    let chunk = base[ch] || ch;
    if (pendingSokuon) {
      pendingSokuon = false;
      const fc = chunk[0] || '';
      if (/^[bcdfghjklmnpqrstvwxyz]$/i.test(fc)) romaji += fc.toLowerCase();
    }
    romaji += chunk;
  }

  return romaji;
}

if (typeof window !== 'undefined') {
  window.YomikikuanKana = {
    toHiragana,
    toKatakana,
    normalizeKanaByScript,
    escapeHtmlForRuby,
    getRomaji,
  };
}
