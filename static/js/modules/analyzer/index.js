// Reading Analyzer — public API. See docs/plans/2026-04-21-reading-analyzer-design.md
// Classic-script consumers use window.YomikikuanAnalyzer (wired up at end of this file).

const SCHEMA_VERSION = 1;

const api = {
  SCHEMA_VERSION,
  async analyzeDocument(doc) { return null; },          // filled by Task 4
  async expandSentence(sentenceEl, text, context) { return null; }, // filled by Task 12
  async glossWord(word, sentence) { return null; },     // filled by Task 15
};

if (typeof window !== 'undefined') {
  window.YomikikuanAnalyzer = api;
}

export default api;
