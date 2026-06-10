# YomiKiku-an（読み聞く庵）

> 日本語を「見える化」する Web ツール（テキスト解析＆音声読み上げ）
>
> An interactive Japanese text analysis and speech synthesis web app
>
> 让日语结构可视化的 Web 工具（文本分析与语音朗读）

![Screenshot](static/yomikikuan.png)

[![Tests](https://github.com/LeiGaoRobot/yomikiku-an/actions/workflows/test.yml/badge.svg)](https://github.com/LeiGaoRobot/yomikiku-an/actions/workflows/test.yml)

---

## English

### Overview
YomiKiku-an is a browser-based tool for reading and listening practice in Japanese. It segments text, shows part-of-speech tags and readings, and reads text aloud via the Web Speech API.

### Features
- **Markdown Editor**: Built-in EasyMDE markdown editor for rich text formatting while maintaining full Japanese analysis capabilities.
- Text analysis: Kuromoji.js-based segmentation, POS tags, kana and romaji.
- Speech synthesis: play word/line/all; **live speed adjustment 0.25–4.0x** (Gemini audio reacts mid-playback); voice selection; seekable progress bar; keyboard shortcuts (Space play/pause, ←→ prev/next segment, ↑↓ rate ±0.05, J/K seek ±10s).
- Playback controls: separate Pause/Resume; Play button shows a stop icon while playing.
- Instant setting changes: changing voice or speed during playback pauses first and then resumes near the current position; settings persist in localStorage.
- Dictionary: JMdict integration; click a word card to view translations.
- Documents: multiple documents, autosave, quick switching; JSON backup export/import (schema v3 includes vocab + mistake book).
- **AI features (optional, Gemini API key required)**:
  - 🔍 Per-sentence analyzer — Structure / Explanation / Keywords tabs + AI gloss on any word
  - 📖 Article-level summary — gist, key sentences, recommended JLPT level, learning points
  - 🎧 JLPT listening questions — generate N5–N1 multiple-choice questions (normal / dialogue / dictation modes); plays through Gemini TTS voices
  - 中/日 bilingual toggle — per-line Simplified Chinese translation inline with the original
  - 🧠 Vocab + mistake book — SM-2 spaced repetition over saved AI glosses and auto-logged wrong JLPT answers
- UI: dark mode, toggle display options, multilingual interface, draggable toolbar, mobile-polished modal panels.
- Mobile: on small screens (≤768px) modals near-fullscreen, tap targets per WCAG 2.2; on ≤480px flashcard grade buttons reflow to 2×2 and filter pills wrap.

### Usage
Online: https://leigaorobot.github.io/yomikiku-an

Local:
```bash
python -m http.server 8000
# then open http://localhost:8000
```

### Tests
353 cases across 14 `*.test.html` pages, runnable headlessly:
```bash
npm test          # boots a local HTTP server + Playwright Chromium, prints
                  # per-page status + a TOTAL line, exits 0 on full pass.
```
The same suite runs on every push and PR via the
[Tests workflow](.github/workflows/test.yml). Opt in to a local pre-push
hook with `bash scripts/install-hooks.sh`.

If `playwright` isn't found, install it any of:
- `npm install --save-dev playwright` (project-local)
- `npm install -g @playwright/mcp` (Homebrew users get this for free)
- export `PLAYWRIGHT_NODE_PATH=/path/to/dir/containing/playwright`

### Local Config (optional)
AI features need a [Gemini API key](https://aistudio.google.com/apikey). For local development you can skip the in-app Settings panel and use a gitignored config file:

```bash
cp config.example.js config.js
# edit config.js and fill in geminiApiKey
```

`config.js` is loaded before `main-js.js` and synced into `localStorage` on every page load. **Do not deploy `config.js` to a public server** — anything served to the browser is fetchable by anyone.

### Part-of-Speech Colors
|  | POS |
|---|---|
| 🟢 | Noun |
| 🔵 | Verb |
| 🟠 | Adjective |
| 🟣 | Adverb |
| 🔴 | Particle |
| 🟡 | Interjection |

### Markdown Support

The app now features a built-in **EasyMDE** markdown editor that replaces the standard textarea while maintaining full compatibility with Japanese analysis features:

- **Rich text editing**: Use the toolbar for quick formatting (bold, italic, headers, lists, quotes, links, images)
- **Live preview**: Side-by-side markdown preview mode
- **Full-screen mode**: Distraction-free writing experience
- **Syntax highlighting**: Visual markdown syntax support
- **Seamless integration**: Japanese analysis works automatically on your markdown content

For detailed documentation about the markdown integration, see [MARKDOWN_README.md](./MARKDOWN_README.md).

### Development
```
yomikiku-an/
├── index.html
├── static/
│   ├── main-js.js
│   ├── segmenter.js
│   ├── styles.css
│   └── libs/
│       ├── kuromoji.js
│       └── dict/
│           ├── *.dat.gz
│           └── jmdict_*.json
└── README.md
```

- Update theme colors in `static/styles.css` via CSS variables.
- Place updated JMdict data under `static/libs/dict/`.

### License and Third-party
- MIT License
- Kuromoji.js — Apache License 2.0
- JMdict — Creative Commons Attribution-ShareAlike 3.0

### Contributing and Feedback
Pull requests are welcome. For issues and feature requests, use GitHub Issues: https://github.com/LeiGaoRobot/yomikiku-an/issues

---

## 日本語

### 概要
読み聞く庵（YomiKiku-an）はブラウザで動作する日本語の読解・リスニング練習ツールです。Kuromoji.js による分かち書き、品詞、読み（かな・ローマ字）を表示し、Web Speech API で朗読します。

### 主な機能
- **Markdown エディタ**：日本語解析機能を保ちながら、リッチテキスト編集ができる EasyMDE エディタを搭載。
- 形態素解析：分割、品詞、読み（かな／ローマ字）。
- 音声合成：単語・行・全文の再生、**話速 0.25–4.0 倍**（Gemini 再生中にリアルタイム反映）、音色選択、シーク可能な進捗バー、キーボードショートカット（Space 再生/停止、←→ 段落切替、↑↓ 話速 ±0.05、J/K ±10 秒シーク）。
- 再生制御：一時停止／再開は専用ボタン。再生中は再生ボタンが停止アイコンになります。
- 設定の即時反映：再生中に音色や話速を変更すると新設定で続行します。設定は localStorage に保存。
- 辞書：JMdict 連携、単語カードのクリックで訳語を表示。
- 文書管理：複数文書、自動保存、簡易切替、JSON バックアップのエクスポート／インポート（v3 スキーマで単語帳・ミス帳も含む）。
- **AI 機能（オプション、Gemini API Key 必要）**：
  - 🔍 センテンス単位アナライザー — 構造 / 解説 / キーワード タブ + 任意の単語の AI 訳注
  - 📖 文章解析 — 要約、キー文、推奨 JLPT レベル、学習ポイント
  - 🎧 JLPT リスニング問題生成 — N5–N1 の選択式問題（通常／対話／ディクテーション モード）、Gemini TTS で読み上げ
  - 中/日 バイリンガル切替 — 各行の下に簡体字中国語訳を表示
  - 🧠 単語帳 ＋ ミス帳 — SM-2 間隔反復、AI 訳注の保存 ＋ JLPT 誤答の自動記録
- UI：ダークモード、表示切替、多言語 UI、ツールバーのドラッグ、モバイル最適化モーダル。
- モバイル：768px 以下でモーダルがほぼ全画面、タップ領域は WCAG 2.2 準拠。480px 以下でフラッシュカード採点ボタンが 2×2 に折り返し。

### テスト
14 ページの `*.test.html` に 353 ケース、ヘッドレスで一括実行できます:
```bash
npm test          # ローカル HTTP サーバ + Playwright Chromium を起動して
                  # 全ページの結果と TOTAL を表示。失敗があれば非ゼロ終了。
```
push / PR ごとに [Tests workflow](.github/workflows/test.yml) で同じスイート
が走ります。ローカルの pre-push フックは `bash scripts/install-hooks.sh`。

### 使い方
オンライン：https://leigaorobot.github.io/yomikiku-an

ローカル：
```bash
python -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

### ローカル設定（任意）
AI 機能には [Gemini API Key](https://aistudio.google.com/apikey) が必要です。ローカル開発なら Settings パネルからではなく、gitignore 済みの設定ファイルで：

```bash
cp config.example.js config.js
# config.js を編集して geminiApiKey を記入
```

`config.js` は `main-js.js` より先に読み込まれ、ページロード毎に `localStorage` に同期されます。**公開サーバーに `config.js` をデプロイしないでください** — ブラウザに配信されるものは誰でも fetch できます。

### 品詞色分け
| 色 | 品詞 |
|---|---|
| 🟢 | 名詞 |
| 🔵 | 動詞 |
| 🟠 | 形容詞 |
| 🟣 | 副詞 |
| 🔴 | 助詞 |
| 🟡 | 感動詞 |

### Markdown サポート

標準的なテキストエリアを **EasyMDE** Markdown エディタに置き換えました。日本語解析機能とは完全に互換性があります：

- **リッチテキスト編集**：ツールバーでクイック書式設定（太字、斜体、見出し、リスト、引用、リンク、画像）
- **ライブプレビュー**：サイドバイサイドの Markdown プレビューモード
- **全画面モード**：集中執筆環境
- **シンタックスハイライト**：視覚的な Markdown 構文サポート
- **シームレスな統合**：Markdown コンテンツで日本語解析が自動的に機能

Markdown 統合の詳細なドキュメントは [MARKDOWN_README.md](./MARKDOWN_README.md) をご覧ください。

### 開発情報
- テーマカラー：`static/styles.css` の CSS 変数を編集。
- JMdict データ：`static/libs/dict/` に配置。

### ライセンスと利用ライブラリ
- MIT License
- Kuromoji.js — Apache License 2.0
- JMdict — Creative Commons Attribution-ShareAlike 3.0

### 貢献・フィードバック
Issue／PR を歓迎します。https://github.com/LeiGaoRobot/yomikiku-an/issues

---

## 中文

### 概述
YomiKiku-an（読み聞く庵）是一款基于浏览器的日语阅读与听力练习工具。使用 Kuromoji.js 进行分词与词性标注，显示假名和罗马音，并通过 Web Speech API 朗读文本。

### 功能
- **Markdown 编辑器**：内置 EasyMDE markdown 编辑器，支持富文本格式，同时保持完整的日语分析能力。
- 文本分析：分词、词性、假名与罗马音。
- 语音合成：按单词/按行/全文播放；**语速 0.25–4.0x 实时调节**（Gemini 音频播放过程中即时生效）；音色选择；可点击跳转的进度条；键盘快捷键（Space 播放/暂停、←→ 上下段、↑↓ 语速 ±0.05、J/K ±10s seek）。
- 播放控制：暂停/继续为独立按钮；播放中播放按钮显示"停止"图标。
- 即时设置生效：播放中更改语速或音色立即生效；设置持久化到 localStorage。
- 词典：整合 JMdict；点击词卡查看释义。
- 文档：多文档管理、自动保存、快速切换、JSON 备份导入导出（v3 schema 包含词汇本 + 错题本）。
- **AI 功能（可选，需 Gemini API Key）**：
  - 🔍 句级解析 — Structure / Explanation / Keywords 三个 Tab + 任意词的 AI 释义
  - 📖 文章解析 — 要约、关键句、推荐 JLPT 等级、学习要点
  - 🎧 JLPT 听力题生成 — N5–N1 多选题（通常 / 対話 / 听写 三种模式），Gemini TTS 朗读
  - 中/日 双语对照 — 每段下方插入简体中文翻译
  - 🧠 词汇本 + 错题本 — SM-2 间隔重复，AI 释义可一键收藏、JLPT 答错自动进错题本
- 界面：暗色模式、显示切换、多语言 UI、工具栏可拖拽、移动端打磨过的模态。
- 移动端：≤768px 时模态近全屏，tap 目标符合 WCAG 2.2；≤480px 时抽卡 4 档按钮 2×2 排版。

### 测试
14 个 `*.test.html` 页面共 353 个用例，一条命令跑完：
```bash
npm test          # 启动本地 HTTP 服务 + Playwright Chromium，打印每页
                  # 结果和 TOTAL 行；任何失败都返回非零退出码。
```
每次 push / PR 通过 [Tests workflow](.github/workflows/test.yml) 跑同一套
测试。本地接 pre-push 钩子: `bash scripts/install-hooks.sh`。

### 使用
在线版：https://leigaorobot.github.io/yomikiku-an

本地运行：
```bash
python -m http.server 8000
# 浏览器访问 http://localhost:8000
```

### 本地配置（可选）
AI 功能需要 [Gemini API Key](https://aistudio.google.com/apikey)。本地开发可以跳过应用内的 Settings 面板，改用一个被 gitignore 的本地配置文件：

```bash
cp config.example.js config.js
# 编辑 config.js 填入 geminiApiKey
```

`config.js` 在 `main-js.js` 之前加载，每次刷新页面时自动同步到 `localStorage`。**切勿将 `config.js` 部署到公网** —— 浏览器能访问的文件任何人都能 fetch。

### 词性颜色
| 颜色 | 词性 |
|---|---|
| 🟢 | 名词 |
| 🔵 | 动词 |
| 🟠 | 形容词 |
| 🟣 | 副词 |
| 🔴 | 助词 |
| 🟡 | 感叹词 |

### Markdown 支持

应用现在内置了 **EasyMDE** markdown 编辑器，替换了标准的 textarea，同时完全保持日语分析功能的兼容性：

- **富文本编辑**：使用工具栏快速格式化（粗体、斜体、标题、列表、引用、链接、图片）
- **实时预览**：并排 markdown 预览模式
- **全屏模式**：专注写作体验
- **语法高亮**：可视化 markdown 语法支持
- **无缝集成**：日语分析功能自动作用于 markdown 内容

有关 markdown 集成的详细文档，请参阅 [MARKDOWN_README.md](./MARKDOWN_README.md)。

### 开发信息
- 主题颜色：编辑 `static/styles.css` 中的 CSS 变量。
- JMdict 数据：放置在 `static/libs/dict/`。

### 许可与第三方
- MIT License
- Kuromoji.js — Apache License 2.0
- JMdict — Creative Commons Attribution-ShareAlike 3.0

### 贡献与反馈
欢迎 Issue／PR：https://github.com/LeiGaoRobot/yomikiku-an/issues

---

## Appendix (Brand & History)

### Brand
<div align="center">

Made with ❤️ for Japanese language learners worldwide

世界中の日本語学習者のために ❤️ を込めて

为全世界的日语学习者用心打造 ❤️

</div>

### Star History

[![Star History Chart](https://api.star-history.com/svg?repos=LeiGaoRobot/yomikiku-an&type=Date)](https://star-history.com/#LeiGaoRobot/yomikiku-an&Date)