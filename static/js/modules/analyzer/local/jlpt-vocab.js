// JLPT vocab grade stubs. Curated 2026-04-21.
// Hand-curated from widely-published N5/N4 core word lists
// (Genki textbook vocab, Tae Kim Grammar Guide basic vocab, Anki Core 2k N5 subset).
// These are stubs; N3/N2/N1 fall back to the JMdict `common` priority flag via
// `window.YomikikuanDict` (see lookupFreq in static/js/dictionary.js).

// Core N5 vocab (~100 entries): greetings, copulas, pronouns, numerals,
// time/days, family, colors, particles-as-words, basic verbs/adjectives.
const CORE_N5 = new Set([
  // copulas / aux
  'です', 'ます', 'だ', 'である',
  // demonstratives / pronouns
  '私', 'わたし', '僕', 'ぼく', '俺', 'あなた', '彼', '彼女',
  'これ', 'それ', 'あれ', 'どれ', 'ここ', 'そこ', 'あそこ', 'どこ',
  'この', 'その', 'あの', 'どの',
  // question words
  '何', 'なに', 'なん', '誰', 'だれ', 'いつ', 'なぜ', 'どう', 'いくら', 'いくつ',
  // numerals
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '百', '千', '万',
  // time / days
  '今日', '昨日', '明日', '今', '朝', '昼', '夜', '今晩', '毎日',
  '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日',
  '年', '月', '日', '時', '分', '週',
  // family
  '父', '母', '兄', '姉', '弟', '妹', '家族', '子供', '友達',
  // places / things
  '学校', '先生', '学生', '会社', '家', '店', '駅', '銀行', '病院',
  '本', '車', '水', 'お茶', '茶', 'コーヒー', 'ご飯', 'パン', '肉', '魚', '野菜',
  '机', '椅子', 'ドア', '窓', '電話', 'テレビ',
  // basic verbs (dictionary form)
  '行く', '来る', '帰る', '見る', '聞く', '話す', '読む', '書く', '食べる', '飲む',
  '買う', '売る', '作る', '会う', '持つ', '立つ', '座る', '寝る', '起きる',
  'する', 'なる', 'ある', 'いる', '分かる', '知る', '思う', '言う',
  // adjectives
  '大きい', '小さい', '新しい', '古い', '高い', '安い', '良い', 'いい', '悪い',
  '暑い', '寒い', '熱い', '冷たい', '多い', '少ない', '早い', '遅い', '長い', '短い',
  '好き', '嫌い', '元気', '静か', 'にぎやか', '有名', '親切', '便利',
  // colors
  '赤', '青', '白', '黒', '黄色', '緑', '茶色',
  // greetings / fixed phrases (function words)
  'はい', 'いいえ', 'ありがとう', 'すみません', 'おはよう', 'こんにちは', 'こんばんは', 'さようなら',
]);

// Core N4 vocab (~100 entries): intermediate daily words, conjugated helpers,
// extended verbs / adjectives / connectors common in Genki II.
const CORE_N4 = new Set([
  // verbs
  '教える', '習う', '答える', '質問', '説明', '意味', '始める', '終わる',
  '開ける', '閉める', '開く', '閉じる', '上げる', '下げる', '集める', '探す',
  '送る', '受ける', '渡す', '借りる', '貸す', '返す', '払う', '選ぶ',
  '使う', '止まる', '止める', '動く', '働く', '休む', '遊ぶ', '急ぐ',
  '待つ', '歩く', '走る', '登る', '降りる', '泳ぐ', '運ぶ', '捨てる',
  '覚える', '忘れる', '考える', '感じる', '決める', '試す', '守る', '調べる',
  '比べる', '呼ぶ', '笑う', '泣く', '怒る', '困る', '驚く',
  // nouns
  '仕事', '会議', '約束', '意見', '計画', '予定', '準備', '用意',
  '旅行', '自転車', '地下鉄', '空港', '港', '海', '山', '川', '森', '町', '村',
  '社会', '世界', '国', '文化', '歴史', '政治', '経済', '科学',
  '趣味', '音楽', '映画', '小説', '新聞', '雑誌', '手紙', '写真', '絵',
  '言葉', '漢字', '辞書', '教科書',
  // adjectives
  '易しい', '難しい', '簡単', '大切', '必要', '十分', '危ない', '安全',
  '強い', '弱い', '優しい', '厳しい', '珍しい', '恥ずかしい', '嬉しい', '悲しい',
  '楽しい', '面白い', 'つまらない', '素敵', '立派', '残念', '特別', '一般',
  // adverbs / connectors
  'もう', 'まだ', 'ずっと', 'きっと', 'たぶん', 'やはり', 'やっぱり', 'しかし',
  'それで', 'だから', 'けれども', 'でも', 'なぜなら',
]);

export function classifyWord(lemma, _posTag) {
  if (!lemma) return 'unknown';
  if (CORE_N5.has(lemma)) return 'N5';
  if (CORE_N4.has(lemma)) return 'N4';
  const freq = queryJMdictFreq(lemma);
  if (freq == null) return 'unknown';
  // lookupFreq returns 5000 (common) / 20000 (uncommon) / null — see dictionary.js.
  // <=10000 → common-tagged → N3; <=25000 → uncommon-tagged → N2; else → N1.
  if (freq <= 10000) return 'N3';
  if (freq <= 25000) return 'N2';
  return 'N1';
}

function queryJMdictFreq(lemma) {
  try {
    const dict = typeof window !== 'undefined' ? window.YomikikuanDict : null;
    if (!dict || typeof dict.lookupFreq !== 'function') return null;
    return dict.lookupFreq(lemma);
  } catch (_) {
    return null;
  }
}
