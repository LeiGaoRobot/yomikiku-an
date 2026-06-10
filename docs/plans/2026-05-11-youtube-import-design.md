# YouTube 视频导入功能 — 设计文档

**日期**: 2026-05-11
**状态**: 设计已确认，待出实施计划
**作者**: brainstorming session

## 目标

在 YomiKiku-an 中加入「从 YouTube 视频导入」入口，支持三种用法：

- **(A) 字幕导入** — 提取转录文本并保存为新文档（接现有文档体系）
- **(B) 视频伴读** — YouTube IFrame 播放器 + 时间戳化字幕 + 每句 🔍 调用现有分析器
- **(C) 听力题** — 转录后直接生成 JLPT 风格题，渲染走现有 jlpt 面板

技术路径统一：**Gemini 2.5 API 直接吃 YouTube URL**（多模态 `fileData` part），无需后端、无 CORS 问题，符合纯静态架构。

## 入口与 UX

- header 工具栏新增 `▶️YouTube` 按钮（ID: `#youtubeBtn`），位于 `#jlptBtn` 旁
- 点击 → 弹出 `youtube-overlay` 模态（沿用现有 `*-overlay/*-panel` 约定）
- 面板顶部：URL 输入框 + 默认硬上限 10 分钟（超长拒绝）
- URL 通过校验后展示一行视频元信息（标题 / 时长 / 缩略图，通过 oEmbed `https://www.youtube.com/oembed?url=…&format=json` 拿，无需 API key）
- 下方 3 个 Tab：📥 导入字幕 / 🎬 视频伴读 / 🎧 生成听力题
- 每个 Tab 内独立 CTA 按钮，点击触发 Gemini 调用 + 显示 loading + 结果

## 架构与边界

### 新模块（`static/js/modules/youtube/`）

| 文件 | 职责 |
|------|------|
| `index.js` | `mountPanel(ctx)` / `unmountPanel()` + 注册 `window.__yomikikuanOpenYoutube` |
| `url.js` | `parseYoutubeUrl(input)` → `{videoId, startSec?, endSec?}`，纯函数 |
| `oembed.js` | `fetchVideoMeta(videoId)` → `{title, author, thumbnail, durationSec?}` |
| `gemini-yt.js` | Gemini API 封装：`transcribeVideo(url, mode)` 三个 mode |
| `tabs/import.js` | (A) 导入逻辑，调用 `documentManager.create(text, title)` |
| `tabs/companion.js` | (B) 伴读 UI：iframe + 字幕列表 + currentTime 轮询高亮 |
| `tabs/listening.js` | (C) 听力题，复用 `modules/analyzer/ui/jlpt/` 渲染器 |

### 接入点

- `modules/ui/panel-triggers.js` 增加 `#youtubeBtn` 懒加载 + 调 `__yomikikuanOpenYoutube`
- `index.html` 增加 header 按钮
- i18n key 三语补齐（ja/en/zh）

### Playback boundary 处理

完全不碰 `main-js.js` 播放状态机。(B) 用 YouTube IFrame Player API 自己的 `getCurrentTime()` + `setInterval(250ms)` 高亮当前句；点击句子 → `player.seekTo(startSec)`。(B) 内的 🔍 直接调 `window.__yomikikuanAnalyzeLine` 兼容现有 hook。

## 数据流（Gemini）

Gemini 2.5 接受 `fileData` part 直接吃 YouTube URL：

```js
contents: [{
  parts: [
    { fileData: { fileUri: 'https://youtube.com/watch?v=…', mimeType: 'video/*' },
      videoMetadata: { startOffset: '0s', endOffset: '600s' } },
    { text: PROMPT_BY_MODE[mode] }
  ]
}]
```

三个 prompt 模板：

- **transcript** — 纯文本转录（含标点、按句子换行）
- **transcript-timed** — JSON `[{start, end, text}]`（用于 (B) 时间戳同步）
- **jlpt-questions** — 复用 `analyzer/ui/jlpt/prompts.js` 的题目 schema

### 缓存

复用 `yomikikuan-analysis` IDB（30d TTL + LRU-500）。

- key = `youtube:${videoId}:${mode}:${startSec}-${endSec}`
- 三个 providerId namespace：`yt-transcript` / `yt-transcript-timed` / `yt-jlpt`
- 安全可丢

### API key

复用 `getGeminiApiKey()`。无 key 时面板顶部红字提示，按钮禁用（沿用现有 `__yomikikuanKeyStatus` 模式）。

## 错误处理

| 场景 | 行为 |
|------|------|
| URL 解析失败 | toast「请输入有效的 YouTube URL」 |
| oEmbed 404（私有/已删除） | 同上 |
| 视频时长 > 10 分钟 | 拒绝 + 提示 |
| Gemini 网络/超时 | 现有 toast + 重试按钮 |
| `PROHIBITED_CONTENT`（仅 C 整次） | 整次失败 + 提示换素材 |

## 测试（`modules/youtube/*.test.html`）

- `url.test.html` — `parseYoutubeUrl` 各种格式（`youtu.be/` / `?v=` / `&t=` 时间戳 / 无效）
- `oembed.test.html` — mock fetch
- `gemini-yt.test.html` — mock Gemini call，断言 prompt 构造正确
- `tabs/companion.test.html` — 时间戳→句子高亮的纯函数提取

加入 `scripts/test.sh` 测试列表。

## SW / 缓存契约

新增模块文件 → `service-worker.js` 的 `CACHE_VERSION` 必须 bump 一格（v20 → v21），按现有规则。

## 非目标（YAGNI）

- ❌ 视频下载 / 离线
- ❌ 视频内容审核 / 翻译（除非 Gemini 自带）
- ❌ 字幕编辑器（导入即只读文档）
- ❌ 多视频批量
- ❌ token 级高亮（违反 boundary）

## 风险

- **Gemini YouTube 配额/计费** — 转录+生成题目对 10 分钟视频估算 ~10k input tokens，用户 key 自负
- **YouTube 嵌入策略** — 部分视频禁止嵌入；检测并 fallback 到「打开新标签页 + 仅显示字幕」
- **iOS Safari iframe 自动播放** — 已知不允许，UI 上提示用户手动按播放
