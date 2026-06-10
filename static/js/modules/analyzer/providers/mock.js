import { createProvider } from './base.js';
import { register } from './registry.js';

const mock = createProvider({
  id: 'mock',
  async analyzeSentence({ text, signal }) {
    await delay(500, signal);
    return {
      translation: `[mock translation] ${text}`,
      grammarPoints: ['mock: ～は～です pattern', 'mock: past tense'],
      vocab: [{ word: text.slice(0, 2), gloss: '[mock gloss]' }],
    };
  },
  async glossWord(word, _sentence, signal) {
    await delay(300, signal);
    return `[mock contextual gloss for ${word}]`;
  },
});

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
  });
}

register(mock);
export default mock;
