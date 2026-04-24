/**
 * YomiKiku-an - 国际化（i18n）翻译词典
 * 支持语言：日语 (ja)、英语 (en)、中文 (zh)
 */

const I18N = {
  ja: {
    title: '読み聞く庵',
    navAnalyze: 'テキスト解析',
    navTTS: '音声読み上げ',
    navHelp: 'ヘルプ',
    sidebarDocsTitle: 'ドキュメント',
    newDoc: '＋ 新規ドキュメント',
    deleteDoc: 'ドキュメント削除',
    textareaPlaceholder: 'ここに日本語テキストを入力して解析…',
    analyzeBtn: '解析する',
    emptyText: '上の入力欄に日本語を入力すると、自動的に解析します',
    // グローバル検索（多言語）
    searchDocuments: 'ドキュメントを検索',
    voiceTitle: '音声設定',
    voiceSelectLabel: '音声を選択',
    selectVoice: '音声を選択...',
    speedLabel: '話速',
    playAll: '全文再生',
    displayTitle: '表示設定',
    showKana: 'ふりがなを表示',
    showRomaji: 'ローマ字を表示',
    showPos: '品詞を表示',
    showUnderline: '品詞の色下線',
    tokenAlignLeft: '左揃え',
    autoRead: '自動読み上げ',
    repeatPlay: 'リピート再生',
    readingToggleEnter: '読書モード',
    readingToggleExit: '通常表示へ',
    readingToggleTooltipEnter: '読書モードに入る',
    readingToggleTooltipExit: '通常表示に戻る',
    systemTitle: 'システム設定',
    themeLabel: 'テーマモード',
    themeLight: 'ライトモード',
    themePaper: '紙の白',
    themeSakura: '桜色',
    themeSticky: 'メモの黄',
    themeGreen: '目にやさしい緑',
    themeBlue: '爽やかな青',
    themeDark: 'ダークモード',
    themeAuto: 'システムに従う',
    langLabel: 'インターフェース言語',
    loading: 'テキストを解析中…',
    errorPrefix: '解析に失敗しました: '
    ,lbl_surface: '表層形'
    ,lbl_base: '基本形'
    ,lbl_reading: '読み'
    ,lbl_translation: '翻訳'
    ,lbl_pos: '品詞'
    ,lbl_pos_raw: '原始タグ'
    ,dict_init: '辞書を初期化中…'
    ,no_translation: '翻訳が見つかりません'
    ,translation_failed: '翻訳の読み込みに失敗しました'
    ,dlg_detail_translation: 'の詳細翻訳'
    ,lbl_field: '分野'
    ,lbl_note: '備考'
    ,lbl_chinese: '中文'
    ,    folderAll: 'すべて',
    folderFavorites: 'お気に入り',
    folderSamples: 'サンプル記事',
    reloadSamples: 'サンプル再読み込み',
    sidebarFolderTitle: 'コンテンツ管理',
    favorite: 'お気に入り',
    unfavorite: 'お気に入り解除',
    cannotDeleteDefault: 'デフォルトのドキュメントは削除できません',
    confirmDelete: 'ドキュメント「{title}」を削除しますか？',
    pleaseInputText: '先にテキストを入力してください',
    noJapaneseVoice: '日本語音声は利用できません',
    untitledDocument: '無題のドキュメント',
    play: '再生',
    stop: '停止',
    pause: '一時停止',
    playThisLine: 'この行を再生',
    expand: '展開',
    collapse: '折りたたむ',
    showUnderline: '品詞ラインを表示',
    showDetails: '詳細を表示',
    haAsWaLabel: '助詞「は」を「わ」と読む',
    readingScript: 'ふりがな表記',
    katakanaLabel: 'カタカナ',
    hiraganaLabel: 'ひらがな',
    fontSizeLabel: '文字サイズ',
    pwaTitle: 'オフラインダウンロード',
    pwaPreparing: 'オフライン用リソースを準備しています…',
    pwaProgress: 'キャッシュ中 {completed}/{total} 件（{percent}%）',
    pwaComplete: 'すべてのリソースを保存しました。オフラインでも利用できます。',
    pwaPartial: '一部のファイルを保存できませんでした。{failed} 件失敗しました。',
    pwaError: 'キャッシュに失敗しました: {message}',
    pwaUnsupported: 'このブラウザーはオフラインインストールに対応していません。',
    pwaAlreadyCaching: 'リソースをダウンロードしています…',
    pwaDismiss: '閉じる',
    pwaResetting: '古いオフラインデータを整理しています…',
    pwaResetFailed: 'キャッシュのリセットに失敗しました: {message}',
    pwaOffline: 'ネットワークに接続してからダウンロードしてください。',
    localCacheCleared: '一時キャッシュを削除しました（ドキュメントと設定保持）。',
    pwaCacheCleared: 'オフラインキャッシュを削除しました。',
    delete: '削除',
    cancel: 'キャンセル',
    newDocument: '新規ドキュメント',
    deleteDocument: 'ドキュメント削除',
    applications: 'アプリケーション',
    closeApplicationList: 'アプリケーションリストを閉じる',
    close: '閉じる',
    confirmExit: '終了しますか？',
    exitInDevelopment: '終了機能は開発中です...'
    ,backupTitle: 'バックアップとインポート'
    ,userMenuSyncData: 'データを同期'
    ,userMenuSettings: '設定'
    ,userMenuDataManagement: 'データ管理'
    ,userMenuExport: 'エクスポート'
    ,userMenuImport: 'インポート'
    ,userMenuDownload: 'アプリをインストール'
    ,userMenuSwitchAccount: 'アカウントを切り替え'
    ,installApp: 'アプリをインストール'
    ,installingApp: 'インストール中...'
    ,installSuccess: 'インストール完了！ホーム画面から開けます'
    ,installFailed: 'インストールに失敗しました'
    ,clearingCache: 'キャッシュをクリア中...'
    ,iosInstallHint: 'Safari の共有ボタン → ホーム画面に追加'
    ,alreadyInstalled: 'アプリはすでにインストールされています'
    ,userMenuLogout: 'ログアウト'
    ,exportBtn: 'データをエクスポート'
    ,importBtn: 'データをインポート'
    ,exporting: 'データをエクスポート中...'
    ,exportSuccess: 'バックアップJSONをエクスポートしました。'
    ,exportError: 'エクスポートに失敗しました。'
    ,importSuccess: 'バックアップをインポートしました。'
    ,importError: 'インポートに失敗しました。'
    ,importConfirmOverwrite: 'インポートすると現在のデータと設定が上書きされます。続行しますか？'
    ,resume: '再開'
    // ----- Reading Analyzer (T15+T16+T17) -----
    ,'analyzer.tab.structure': '構造'
    ,'analyzer.tab.explanation': '解説'
    ,'analyzer.tab.keywords': '重要語'
    ,'analyzer.pin': '固定'
    ,'analyzer.unpin': '固定解除'
    ,'analyzer.pin.limit': '固定上限(200)。先に削除してください'
    ,'analyzer.badge.detail': '読解難度'
    ,'analyzer.needsKey': 'Gemini キーが必要'
    ,'analyzer.error.quota': 'レート制限。しばらくお待ちください'
    ,'analyzer.error.generic': '解析失敗。再試行?'
    ,'analyzer.settings.preanalyze': '再生中に自動解析'
    ,'analyzer.loading': '解析中…'
    ,'analyzer.glossBtn': 'AI 文脈訳'
    ,'analyzer.vocab.heading': '語彙'
    ,'analyzer.grammar.heading': '文法'
    ,'analyzer.translation.heading': '訳'
    // ----- Phase D panels (articleSummary / jlptPanel / vocabPanel / bilingual) -----
    ,'panel.generating': '生成中…'
    ,'panel.regenerating': 'キャッシュを無視して再生成中…'
    ,'panel.generated': '生成完了'
    ,'panel.cache.loaded': 'キャッシュから読み込みました — "再生成"で Gemini を再呼び出し'
    ,'panel.cache.loaded.mode': 'キャッシュから読み込みました（{mode}）— "再生成"で再呼び出し'
    ,'panel.aborted': 'キャンセルしました'
    ,'panel.error.no_key': '設定で Gemini API key を入力してください'
    ,'panel.error.rate_limited': 'API 制限に達しました。後で再試行してください'
    ,'panel.error.bad_shape': 'モデル応答形式エラー、再試行してください'
    ,'panel.error.generic_fmt': '生成失敗：{msg}'
    ,'panel.error.doc_empty': '現在のドキュメントが空です'
    ,'panel.error.doc_empty_for_jlpt': '現在のドキュメントが空のため、問題を生成できません'
    ,'panel.error.no_doc': 'まずドキュメントを選択してください'
    ,'panel.error.no_docmgr': 'ドキュメントマネージャが準備できていません'
    ,'panel.btn.regenerate': '再生成'
    ,'panel.btn.play_all': '▶︎ 全体を読み上げ'
    ,'panel.btn.play': '▶︎ 読み上げ'
    ,'panel.btn.reveal': '解答・解説を表示'
    ,'panel.btn.check': '答え合わせ'
    ,'panel.jlpt.type.dialogue': '対話'
    ,'panel.jlpt.type.dictation': '聴写'
    ,'panel.jlpt.input.placeholder': '聞き取った内容を入力'
    ,'panel.jlpt.hint_fmt': 'ヒント：{hint}'
    ,'panel.jlpt.truth_label': '正解：'
    ,'panel.jlpt.user_label': '入力：'
    ,'panel.jlpt.empty.dialogue': '対話が生成されませんでした'
    ,'panel.jlpt.empty.dictation': '聴写問題が生成されませんでした'
    ,'panel.jlpt.empty.questions': '問題が生成されませんでした'
    ,'panel.jlpt.answer_label': '答え：'
    ,'panel.jlpt.cite_fmt': '出典：{src}'
    ,'panel.jlpt.mistake_added': ' · 誤答ノートに追加しました'
    ,'panel.vocab.count_fmt': '{n} 件'
    ,'panel.vocab.empty.vocab': '語彙帳は空です'
    ,'panel.vocab.empty.mistakes': '誤答ノートは空です'
    ,'panel.vocab.review.empty_filter': '現在の条件では復習カードがありません'
    ,'panel.vocab.review.done': '✓ 全て完了'
    ,'panel.vocab.review.hint': '習熟度を評価してください'
    ,'panel.vocab.review.no_word': '(語なし)'
    ,'panel.vocab.review.no_gloss': '(訳なし)'
    ,'panel.vocab.review.no_stem': '(題なし)'
    ,'panel.confirm_delete': 'この項目を削除しますか？'
    ,'panel.summary.empty': '結果なし'
    ,'panel.bilingual.loading': '翻訳中…'
    ,'panel.bilingual.no_key': 'Gemini API key が未設定 — 設定で入力してください'
    ,'panel.bilingual.empty': '翻訳が空です'
    ,'panel.bilingual.quota': 'API 制限に達しました'
    ,'panel.bilingual.bad_shape': '応答形式エラー'
    ,'panel.bilingual.aborted': 'キャンセルしました'
    ,'panel.bilingual.failed_fmt': '翻訳失敗：{msg}'
    // Decorative section headers (originally hardcoded in panel templates)
    ,'panel.summary.title': '📖 文章解析'
    ,'panel.summary.section.summary': '要約'
    ,'panel.summary.section.level': '推奨レベル'
    ,'panel.summary.section.key_sentences': 'キー文'
    ,'panel.summary.section.learning_points': '学習ポイント'
    ,'panel.jlpt.title': 'JLPT 聴解問題生成'
    ,'panel.vocab.title': '🧠 語彙帳 / 誤答ノート'
    ,'panel.vocab.tab.vocab': '語彙帳'
    ,'panel.vocab.tab.mistakes': '誤答ノート'
    ,'panel.vocab.filter.all': '全て'
    ,'panel.vocab.filter.due': '期限切れ'
    ,'panel.vocab.filter.learning': '学習中'
    ,'panel.vocab.filter.mastered': '習得済'
    ,'panel.vocab.btn.start_review': '復習開始'
    ,'panel.vocab.btn.back_to_list': '一覧に戻る'
    ,'panel.vocab.sort.due': '期限順'
    ,'panel.vocab.sort.created': '追加順'
    ,'panel.vocab.sort.random': 'ランダム'
    ,'panel.vocab.flip_hint': 'カードをクリックして解答'
    ,'panel.vocab.action.review': '復習'
    ,'panel.vocab.action.delete': '削除'
    ,'panel.common.close': '閉じる'
    ,'panel.jlpt.recommend.fmt': '推奨 {level}（直近 {sample} 問 {accuracy}% 正答率）'
    ,'panel.jlpt.recommend.low_confidence': 'データ不足：{level} から始めましょう'
    ,'panel.jlpt.recommend.bump_up': '正答率が高いので {level} に上げてみては？'
    ,'panel.jlpt.recommend.bump_down': '正答率が低いので {level} に下げてみては？'
    ,'panel.jlpt.recommend.hold': 'このレベルを継続中：{level}'
  },
  en: {
    title: '読み聞く庵',
    navAnalyze: 'Analyze',
    navTTS: 'TTS',
    navHelp: 'Help',
    sidebarDocsTitle: 'Documents',
    newDoc: '+ New Document',
    deleteDoc: 'Delete Document',
    textareaPlaceholder: 'Enter Japanese text here for analysis…',
    analyzeBtn: 'Analyze',
    emptyText: 'Type Japanese above; analysis runs automatically',
    searchDocuments: 'Search Documents',
    voiceTitle: 'Voice Settings',
    voiceSelectLabel: 'Voice',
    selectVoice: 'Select voice...',
    speedLabel: 'Speed',
    playAll: 'Play All',
    displayTitle: 'Display Settings',
    showKana: 'Show Kana',
    showRomaji: 'Show Romaji',
    showPos: 'Show POS',
    tokenAlignLeft: 'Left align token content',
    showDetails: 'Show token details',
    haAsWaLabel: 'Read particle "は" as "わ"',
    showUnderline: 'POS underline color',
    autoRead: 'Auto Read',
    repeatPlay: 'Repeat Play',
    readingToggleEnter: 'Reading Mode',
    readingToggleExit: 'Exit Reading',
    readingToggleTooltipEnter: 'Enable reading mode',
    readingToggleTooltipExit: 'Exit reading mode',
    systemTitle: 'System Settings',
    themeLabel: 'Theme Mode',
    themeLight: 'Light Mode',
    themePaper: 'Paper White',
    themeSakura: 'Sakura Pink',
    themeSticky: 'Sticky Note Yellow',
    themeGreen: 'Eye-Care Green',
    themeBlue: 'Fresh Breeze Blue',
    themeDark: 'Dark Mode',
    themeAuto: 'Follow System',
    langLabel: 'Interface Language',
    loading: 'Analyzing text…',
    errorPrefix: 'Analysis failed: '
    ,lbl_surface: 'Surface'
    ,lbl_base: 'Base'
    ,lbl_reading: 'Reading'
    ,lbl_translation: 'Translation'
    ,lbl_pos: 'Part of speech'
    ,lbl_pos_raw: 'Raw tags'
    ,dict_init: 'Initializing dictionary…'
    ,no_translation: 'No translation found'
    ,translation_failed: 'Failed to load translation'
    ,dlg_detail_translation: ' — details'
    ,lbl_field: 'Field'
    ,lbl_note: 'Note'
    ,lbl_chinese: 'Chinese'
    ,    folderAll: 'All',
    folderFavorites: 'Favorites',
    folderSamples: 'Sample Articles',
    reloadSamples: 'Reload samples',
    sidebarFolderTitle: 'Content Management',
    favorite: 'Favorite',
    unfavorite: 'Unfavorite',
    cannotDeleteDefault: 'Cannot delete the default document',
    confirmDelete: 'Delete document "{title}"?',
    pleaseInputText: 'Please enter text first',
    noJapaneseVoice: 'Japanese voice is unavailable',
    untitledDocument: 'Untitled Document',
    play: 'Play',
    stop: 'Stop',
    pause: 'Pause',
    resume: 'Resume',
    playThisLine: 'Play this line',
    expand: 'Expand',
    collapse: 'Collapse',
    showUnderline: 'Show POS underline',
    readingScript: 'Reading script',
    katakanaLabel: 'Katakana',
    hiraganaLabel: 'Hiragana',
    fontSizeLabel: 'Font Size',
    pwaTitle: 'Offline Pack',
    pwaPreparing: 'Preparing offline resources…',
    pwaProgress: 'Caching {completed}/{total} files ({percent}%)',
    pwaComplete: 'All resources cached. You can use YomiKiku-an offline now.',
    pwaPartial: '{failed} files could not be cached. Please retry.',
    pwaError: 'Caching failed: {message}',
    pwaUnsupported: 'This browser does not support offline installation.',
    pwaAlreadyCaching: 'Download in progress…',
    pwaDismiss: 'Dismiss',
    pwaResetting: 'Clearing old offline cache…',
    pwaResetFailed: 'Reset failed: {message}',
    pwaOffline: 'Connect to the internet before downloading.',
    localCacheCleared: 'Temporary cache cleared (documents and settings preserved).',
    pwaCacheCleared: 'Offline cache has been cleared.',
    delete: 'Delete',
    cancel: 'Cancel',
    newDocument: 'New Document',
    deleteDocument: 'Delete Document',
    applications: 'Applications',
    closeApplicationList: 'Close application list',
    close: 'Close',
    confirmExit: 'Are you sure you want to exit?',
    exitInDevelopment: 'Exit feature is under development...'
    ,backupTitle: 'Backup & Import'
    ,userMenuSyncData: 'Sync Data'
    ,userMenuSettings: 'Settings'
    ,userMenuDataManagement: 'Data Management'
    ,userMenuExport: 'Export'
    ,userMenuImport: 'Import'
    ,userMenuDownload: 'Install App'
    ,userMenuSwitchAccount: 'Switch Account'
    ,installApp: 'Install App'
    ,installingApp: 'Installing...'
    ,installSuccess: 'Installed! Open from home screen'
    ,installFailed: 'Installation failed'
    ,clearingCache: 'Clearing cache...'
    ,iosInstallHint: 'Safari Share → Add to Home Screen'
    ,alreadyInstalled: 'App is already installed'
    ,userMenuLogout: 'Logout'
    ,exportBtn: 'Export Data'
    ,importBtn: 'Import Data'
    ,exporting: 'Exporting data...'
    ,exportSuccess: 'Exported backup JSON.'
    ,exportError: 'Failed to export backup.'
    ,importSuccess: 'Backup imported.'
    ,importError: 'Failed to import backup.'
    ,importConfirmOverwrite: 'Import will overwrite current data and settings. Continue?'
    // ----- Reading Analyzer (T15+T16+T17) -----
    ,'analyzer.tab.structure': 'Structure'
    ,'analyzer.tab.explanation': 'Explanation'
    ,'analyzer.tab.keywords': 'Keywords'
    ,'analyzer.pin': 'Pin'
    ,'analyzer.unpin': 'Unpin'
    ,'analyzer.pin.limit': 'Pin limit reached (200). Remove some first.'
    ,'analyzer.badge.detail': 'Reading difficulty'
    ,'analyzer.needsKey': 'Requires Gemini API key'
    ,'analyzer.error.quota': 'Rate limit hit, try later'
    ,'analyzer.error.generic': 'Analysis failed. Retry?'
    ,'analyzer.settings.preanalyze': 'Auto-analyze during playback'
    ,'analyzer.loading': 'Analyzing…'
    ,'analyzer.glossBtn': 'AI contextual gloss'
    ,'analyzer.vocab.heading': 'Vocabulary'
    ,'analyzer.grammar.heading': 'Grammar'
    ,'analyzer.translation.heading': 'Translation'
    // ----- Phase D panels -----
    ,'panel.generating': 'Generating…'
    ,'panel.regenerating': 'Ignoring cache, regenerating…'
    ,'panel.generated': 'Generated'
    ,'panel.cache.loaded': 'Loaded from cache — click "Regenerate" to re-call Gemini'
    ,'panel.cache.loaded.mode': 'Loaded from cache ({mode}) — click "Regenerate" to re-call'
    ,'panel.aborted': 'Cancelled'
    ,'panel.error.no_key': 'Please set the Gemini API key in settings'
    ,'panel.error.rate_limited': 'API rate limit reached. Please try again later'
    ,'panel.error.bad_shape': 'Model returned malformed response, please retry'
    ,'panel.error.generic_fmt': 'Generation failed: {msg}'
    ,'panel.error.doc_empty': 'Current document is empty'
    ,'panel.error.doc_empty_for_jlpt': 'Current document is empty — cannot generate questions'
    ,'panel.error.no_doc': 'Please select a document first'
    ,'panel.error.no_docmgr': 'Document manager is not ready'
    ,'panel.btn.regenerate': 'Regenerate'
    ,'panel.btn.play_all': '▶︎ Play all'
    ,'panel.btn.play': '▶︎ Play'
    ,'panel.btn.reveal': 'Show answer / explanation'
    ,'panel.btn.check': 'Check answer'
    ,'panel.jlpt.type.dialogue': 'Dialogue'
    ,'panel.jlpt.type.dictation': 'Dictation'
    ,'panel.jlpt.input.placeholder': 'Type what you hear'
    ,'panel.jlpt.hint_fmt': 'Hint: {hint}'
    ,'panel.jlpt.truth_label': 'Correct: '
    ,'panel.jlpt.user_label': 'You: '
    ,'panel.jlpt.empty.dialogue': 'No dialogue was generated'
    ,'panel.jlpt.empty.dictation': 'No dictation items were generated'
    ,'panel.jlpt.empty.questions': 'No questions were generated'
    ,'panel.jlpt.answer_label': 'Answer: '
    ,'panel.jlpt.cite_fmt': 'Source: {src}'
    ,'panel.jlpt.mistake_added': ' · added to mistake book'
    ,'panel.vocab.count_fmt': '{n} items'
    ,'panel.vocab.empty.vocab': 'Vocabulary book is empty'
    ,'panel.vocab.empty.mistakes': 'Mistake book is empty'
    ,'panel.vocab.review.empty_filter': 'No cards match the current filter'
    ,'panel.vocab.review.done': '✓ All done'
    ,'panel.vocab.review.hint': 'Rate your mastery'
    ,'panel.vocab.review.no_word': '(no word)'
    ,'panel.vocab.review.no_gloss': '(no gloss)'
    ,'panel.vocab.review.no_stem': '(no prompt)'
    ,'panel.confirm_delete': 'Delete this item?'
    ,'panel.summary.empty': 'No result'
    ,'panel.bilingual.loading': 'Translating…'
    ,'panel.bilingual.no_key': 'Gemini API key missing — set it in settings'
    ,'panel.bilingual.empty': 'Translation is empty'
    ,'panel.bilingual.quota': 'API rate limit reached'
    ,'panel.bilingual.bad_shape': 'Response format error'
    ,'panel.bilingual.aborted': 'Cancelled'
    ,'panel.bilingual.failed_fmt': 'Translation failed: {msg}'
    // Decorative section headers
    ,'panel.summary.title': '📖 Article Analysis'
    ,'panel.summary.section.summary': 'Summary'
    ,'panel.summary.section.level': 'Recommended Level'
    ,'panel.summary.section.key_sentences': 'Key Sentences'
    ,'panel.summary.section.learning_points': 'Learning Points'
    ,'panel.jlpt.title': 'JLPT Listening Generator'
    ,'panel.vocab.title': '🧠 Vocab & Mistake Book'
    ,'panel.vocab.tab.vocab': 'Vocabulary'
    ,'panel.vocab.tab.mistakes': 'Mistakes'
    ,'panel.vocab.filter.all': 'All'
    ,'panel.vocab.filter.due': 'Due'
    ,'panel.vocab.filter.learning': 'Learning'
    ,'panel.vocab.filter.mastered': 'Mastered'
    ,'panel.vocab.btn.start_review': 'Start review'
    ,'panel.vocab.btn.back_to_list': 'Back to list'
    ,'panel.vocab.sort.due': 'By due date'
    ,'panel.vocab.sort.created': 'By date added'
    ,'panel.vocab.sort.random': 'Random'
    ,'panel.vocab.flip_hint': 'Click card to reveal answer'
    ,'panel.vocab.action.review': 'Review'
    ,'panel.vocab.action.delete': 'Delete'
    ,'panel.common.close': 'Close'
    ,'panel.jlpt.recommend.fmt': 'Recommended: {level} (last {sample} questions {accuracy}% correct)'
    ,'panel.jlpt.recommend.low_confidence': 'Not enough data — starting at {level}'
    ,'panel.jlpt.recommend.bump_up': 'Accuracy looks strong — try bumping up to {level}'
    ,'panel.jlpt.recommend.bump_down': 'Accuracy looks low — try dropping to {level}'
    ,'panel.jlpt.recommend.hold': 'Holding steady at {level}'
  },
  zh: {
    title: '読み聞く庵',
    navAnalyze: '文本分析',
    navTTS: '语音朗读',
    navHelp: '帮助',
    sidebarDocsTitle: '文档管理',
    newDoc: '+ 新建文档',
    deleteDoc: '删除文档',
    textareaPlaceholder: '在此输入日语文本进行分析...',
    analyzeBtn: '分析文本',
    emptyText: '请在上方输入日语文本，系统会自动分析',
    // 全局搜索（多语言）
    searchDocuments: '搜索文档',
    voiceTitle: '语音设置',
    voiceSelectLabel: '语音选择',
    selectVoice: '选择语音...',
    speedLabel: '语速调节',
    playAll: '播放全文',
    displayTitle: '显示设置',
    showKana: '显示假名',
    showRomaji: '显示罗马音',
    showPos: '显示词性',
    tokenAlignLeft: '词块左对齐',
    showDetails: '显示词汇详情',
    haAsWaLabel: '助词"は"读作"わ"',
    autoRead: '自动朗读',
    repeatPlay: '重复播放',
    readingToggleEnter: '阅读模式',
    readingToggleExit: '退出阅读',
    readingToggleTooltipEnter: '进入阅读模式',
    readingToggleTooltipExit: '退出阅读模式',
    systemTitle: '系统设置',
    themeLabel: '主题模式',
    themeLight: '浅色模式',
    themePaper: '纸张白',
    themeSakura: '樱花粉',
    themeSticky: '便签黄',
    themeGreen: '护眼绿',
    themeBlue: '清新蓝',
    themeDark: '深色模式',
    themeAuto: '跟随系统',
    langLabel: '界面语言',
    loading: '正在分析文本...',
    errorPrefix: '分析失败: '
    ,lbl_surface: '表层形'
    ,lbl_base: '基本形'
    ,lbl_reading: '读音'
    ,lbl_translation: '翻译'
    ,lbl_pos: '词性'
    ,lbl_pos_raw: '原始标签'
    ,dict_init: '正在初始化词典...'
    ,no_translation: '未找到翻译'
    ,translation_failed: '翻译加载失败'
    ,dlg_detail_translation: ' 的详细翻译'
    ,lbl_field: '领域'
    ,lbl_note: '备注'
    ,lbl_chinese: '中文'
    ,fontSizeLabel: '字号'
    ,folderAll: '全部',
    folderFavorites: '收藏',
    folderSamples: '示例文章',
    reloadSamples: '重新加载示例',
    sidebarFolderTitle: '内容管理',
    favorite: '收藏',
    unfavorite: '取消收藏',
    cannotDeleteDefault: '默认文档不能删除',
    confirmDelete: '确定要删除文档"{title}"吗？',
    pleaseInputText: '请先输入文本',
    noJapaneseVoice: '日语语音不可用',
    untitledDocument: '无标题文档',
    play: '播放',
    stop: '停止',
    pause: '暂停',
    resume: '继续',
    playThisLine: '播放这一行',
    expand: '展开',
    collapse: '收缩',
    showUnderline: '显示词性下划线',
    readingScript: '读音脚本',
    katakanaLabel: '片假名',
    hiraganaLabel: '平假名',
    pwaTitle: '离线资源包',
    pwaPreparing: '正在准备离线资源…',
    pwaProgress: '正在缓存 {completed}/{total} 个文件（{percent}%）',
    pwaComplete: '离线资源已就绪，可以断网使用。',
    pwaPartial: '有 {failed} 个文件缓存失败，请稍后重试。',
    pwaError: '缓存失败：{message}',
    pwaUnsupported: '当前浏览器不支持离线安装。',
    pwaAlreadyCaching: '正在下载离线资源…',
    pwaDismiss: '关闭提示',
    pwaResetting: '正在清理旧的离线缓存…',
    pwaResetFailed: '清理缓存失败：{message}',
    pwaOffline: '请联网后再下载离线资源。',
    localCacheCleared: '已清除临时缓存（保留文档与设置）。',
    pwaCacheCleared: '已清除离线程序缓存文件。',
    delete: '删除',
    cancel: '取消',
    newDocument: '新建文档',
    deleteDocument: '删除文档',
    applications: '应用程序',
    closeApplicationList: '关闭应用程序列表',
    close: '关闭',
    confirmExit: '确定要退出吗？',
    exitInDevelopment: '退出功能开发中...'
    ,backupTitle: '备份与导入'
    ,userMenuSyncData: '同步数据'
    ,userMenuSettings: '设置'
    ,userMenuDataManagement: '数据管理'
    ,userMenuExport: '导出'
    ,userMenuImport: '导入'
    ,userMenuDownload: '安装应用'
    ,userMenuSwitchAccount: '切换账户'
    ,installApp: '安装应用'
    ,installingApp: '正在安装...'
    ,installSuccess: '安装成功！可从主屏幕打开'
    ,installFailed: '安装失败'
    ,clearingCache: '正在清除缓存...'
    ,iosInstallHint: 'Safari 分享按钮 → 添加到主屏幕'
    ,alreadyInstalled: '应用已安装'
    ,userMenuLogout: '登出'
    ,exportBtn: '导出数据'
    ,importBtn: '导入数据'
    ,exporting: '正在导出数据...'
    ,exportSuccess: '已导出备份 JSON。'
    ,exportError: '导出失败。'
    ,importSuccess: '导入成功。'
    ,importError: '导入失败：文件格式或内容无效。'
    ,importConfirmOverwrite: '导入将覆盖当前数据与设置，是否继续？'
    // ----- Reading Analyzer (T15+T16+T17) -----
    ,'analyzer.tab.structure': '结构'
    ,'analyzer.tab.explanation': '讲解'
    ,'analyzer.tab.keywords': '重点词'
    ,'analyzer.pin': '固化'
    ,'analyzer.unpin': '取消固化'
    ,'analyzer.pin.limit': '已达固化上限(200)，请先清理'
    ,'analyzer.badge.detail': '阅读难度'
    ,'analyzer.needsKey': '需要 Gemini API Key'
    ,'analyzer.error.quota': '额度超限，稍后再试'
    ,'analyzer.error.generic': '解析失败，重试？'
    ,'analyzer.settings.preanalyze': '播放时自动解析'
    ,'analyzer.loading': '解析中…'
    ,'analyzer.glossBtn': 'AI 释义'
    ,'analyzer.vocab.heading': '词汇'
    ,'analyzer.grammar.heading': '语法'
    ,'analyzer.translation.heading': '翻译'
    // ----- Phase D panels -----
    ,'panel.generating': '生成中…'
    ,'panel.regenerating': '忽略缓存，重新生成中…'
    ,'panel.generated': '已生成'
    ,'panel.cache.loaded': '已从缓存加载 — 点"重新生成"可重新调用 Gemini'
    ,'panel.cache.loaded.mode': '已从缓存加载（{mode}）— 点"重新生成"可重新调用 Gemini'
    ,'panel.aborted': '已取消'
    ,'panel.error.no_key': '请先在设置中填写 Gemini API key'
    ,'panel.error.rate_limited': 'API 额度超限，稍后再试'
    ,'panel.error.bad_shape': '模型返回格式异常，请重试'
    ,'panel.error.generic_fmt': '生成失败：{msg}'
    ,'panel.error.doc_empty': '当前文档为空'
    ,'panel.error.doc_empty_for_jlpt': '当前文档为空，无法生成题目'
    ,'panel.error.no_doc': '请先选择一个文档'
    ,'panel.error.no_docmgr': '文档管理器未就绪'
    ,'panel.btn.regenerate': '重新生成'
    ,'panel.btn.play_all': '▶︎ 全对话朗读'
    ,'panel.btn.play': '▶︎ 朗读'
    ,'panel.btn.reveal': '查看答案/解析'
    ,'panel.btn.check': '对照答案'
    ,'panel.jlpt.type.dialogue': '対話'
    ,'panel.jlpt.type.dictation': '听写'
    ,'panel.jlpt.input.placeholder': '请输入听到的内容'
    ,'panel.jlpt.hint_fmt': '提示：{hint}'
    ,'panel.jlpt.truth_label': '正解：'
    ,'panel.jlpt.user_label': '你的：'
    ,'panel.jlpt.empty.dialogue': '未生成任何对话'
    ,'panel.jlpt.empty.dictation': '未生成任何听写题'
    ,'panel.jlpt.empty.questions': '未生成任何题目'
    ,'panel.jlpt.answer_label': '答え：'
    ,'panel.jlpt.cite_fmt': '出典：{src}'
    ,'panel.jlpt.mistake_added': ' · 已加入错题本'
    ,'panel.vocab.count_fmt': '{n} 项'
    ,'panel.vocab.empty.vocab': '词汇本为空'
    ,'panel.vocab.empty.mistakes': '错题本为空'
    ,'panel.vocab.review.empty_filter': '当前筛选下没有可复习的卡片'
    ,'panel.vocab.review.done': '✓ 全部完成'
    ,'panel.vocab.review.hint': '评估你的掌握程度'
    ,'panel.vocab.review.no_word': '(无词)'
    ,'panel.vocab.review.no_gloss': '(无释义)'
    ,'panel.vocab.review.no_stem': '(无题干)'
    ,'panel.confirm_delete': '删除这一项？'
    ,'panel.summary.empty': '无结果'
    ,'panel.bilingual.loading': '翻译中…'
    ,'panel.bilingual.no_key': '未配置 Gemini API key — 请在设置里填入后重试'
    ,'panel.bilingual.empty': '翻译为空'
    ,'panel.bilingual.quota': 'API 额度超限'
    ,'panel.bilingual.bad_shape': '返回格式异常'
    ,'panel.bilingual.aborted': '已取消'
    ,'panel.bilingual.failed_fmt': '翻译失败：{msg}'
    // Decorative section headers
    ,'panel.summary.title': '📖 文章解析'
    ,'panel.summary.section.summary': '摘要'
    ,'panel.summary.section.level': '推荐等级'
    ,'panel.summary.section.key_sentences': '关键句'
    ,'panel.summary.section.learning_points': '学习要点'
    ,'panel.jlpt.title': 'JLPT 听力题生成'
    ,'panel.vocab.title': '🧠 词汇本 / 错题本'
    ,'panel.vocab.tab.vocab': '词汇本'
    ,'panel.vocab.tab.mistakes': '错题本'
    ,'panel.vocab.filter.all': '全部'
    ,'panel.vocab.filter.due': '到期'
    ,'panel.vocab.filter.learning': '学习中'
    ,'panel.vocab.filter.mastered': '已掌握'
    ,'panel.vocab.btn.start_review': '开始复习'
    ,'panel.vocab.btn.back_to_list': '返回列表'
    ,'panel.vocab.sort.due': '按到期'
    ,'panel.vocab.sort.created': '按新增'
    ,'panel.vocab.sort.random': '随机'
    ,'panel.vocab.flip_hint': '点击卡片查看答案'
    ,'panel.vocab.action.review': '复习'
    ,'panel.vocab.action.delete': '删除'
    ,'panel.common.close': '关闭'
    ,'panel.jlpt.recommend.fmt': '推荐 {level}（最近 {sample} 题 {accuracy}% 正确率）'
    ,'panel.jlpt.recommend.low_confidence': '数据不足，从 {level} 开始练习'
    ,'panel.jlpt.recommend.bump_up': '正确率不错，试试升到 {level}'
    ,'panel.jlpt.recommend.bump_down': '正确率偏低，建议降到 {level}'
    ,'panel.jlpt.recommend.hold': '保持当前 {level}'
  }
};

// Expose to ESM modules via window bridge.
if (typeof window !== 'undefined') window.I18N = I18N;

