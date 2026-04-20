/**
 * @typedef {Object} AnalyzeSentenceInput
 * @property {string} text
 * @property {{prev?: string, next?: string}=} context
 * @property {AbortSignal=} signal
 *
 * @typedef {Object} AnalyzeSentenceResult
 * @property {string} translation
 * @property {string[]} grammarPoints
 * @property {{word: string, gloss: string}[]} vocab
 *
 * @typedef {Object} ReadingAnalyzer
 * @property {string} id
 * @property {(input: AnalyzeSentenceInput) => Promise<AnalyzeSentenceResult>} analyzeSentence
 * @property {(word: string, sentence: string, signal?: AbortSignal) => Promise<string>} glossWord
 */

export function createProvider(config) {
  return Object.freeze(config);
}
