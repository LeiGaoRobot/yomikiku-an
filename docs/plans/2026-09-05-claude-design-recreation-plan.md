# 用 Claude Design 重现 YomiKiku-an 界面 — 方案

日期：2026-09-05
目标：把现有 UI 以 Claude Design 画布（多 artboard）的形式重建为可编辑的设计源，供后续视觉迭代、回写代码、产出文档截图。不改动运行时代码。

## 1. 设计源（全部来自仓库，不凭记忆）

| 内容 | 位置 | 提取方式 |
|---|---|---|
| 颜色 / 圆角 / 间距 / 阴影 / 动效 token | `static/theme-apple.css` L13-76（`--ap-*`），L88-107（映射到 `--bg/--text/--primary/--toolbar-*`） | 逐条抄精确值 |
| 暗色模式 | `static/theme-apple.css` L111+ `:root[data-theme="dark"]` | 独立 artboard 或 dark tweak |
| 基础组件 | `static/styles.css`：`.folder-management`、`.list-panel`、`.doc-item*`、`.content-area`、`.editor-panels`、`.analyze-line-btn`、`.reading-mode-toggle`、`.line-container` | 复制 padding/字号/行高原值 |
| 面板 CSS-in-JS | `analyzer/ui/jlptPanel.js`、`vocabPanel.js`、`articleSummary.js`、`ui/inspector.js`（`.inspector-drawer`） | 从 `<style>` 字符串抄 |
| 移动端 | `static/mobile.css`（768 / 640 / 480 断点） | 390×844 artboard |
| 排版原则 | `DESIGN.md`（SF Pro 字阶表、980px 容器、8px 基准） | 参考 |
| 品牌资产 | `static/logo.png`、`static/favicon.svg` | 降采样后 `--image` 嵌入 |
| 页面骨架 | `index.html`（sidebar-stack → content-main → main-header → editor-panels → content-area → footer）、`login.html`（`.login-card`） | 结构对照 |

仓库没有截图。先 `npm start` + Playwright 抓各状态截图放到 `docs/screens/`，只作对照，不作绘制依据。

## 2. 画布结构

一个画布，5 个 Page，约 18 个 artboard。

### Page「Foundations」
- `Tokens.dc.html`：色板（light + dark 两列）、字阶（display / text / mono 三族，附日文字体栈 Hiragino Kaku Gothic ProN → Yu Gothic → Meiryo）、圆角 5/8/11/12/18/22/pill、阴影 1/2/3/card、间距 4-64。
- `Components.dc.html`：`theme-icon-btn`（默认 / hover / pressed / `--emoji` 变体）、`doc-item`（默认 / hover / active / 加星）、toolbar chip、`.ap-update-toast`、PWA 安装 toast、模态外壳（overlay + panel）、ruby token / `token-pill`、行级 🔍 与 ▶ 按钮、diff badge（N5–N1 色块）。

### Page「Desktop 1440×900」
- `Main.dc.html`：阅读主界面。左侧 sidebar（内容管理标题、排序按钮、文档列表、进度环）+ 顶部 main-header（logo、日期 / 字数、diff badge、vocab / summary / JLPT / YouTube 四按钮、星标、删除、reader-mode、inspector、sync、头像）+ 内容区（ふりがな 行、行级按钮、播放控制条 headerVoiceControls）。这是入口 artboard，也是 launch focus。
- `Editor.dc.html`：EasyMDE 编辑态（字号 / 字体控件 + 工具栏）。
- `ReaderMode.dc.html`：`#reading-mode` 叠层、`reading-line-active` 高亮。
- `Inspector.dc.html`：右侧 `.inspector-drawer` 打开态，叠在 Main 上。
- `MainDark.dc.html`：Main 的暗色版（artboard 间不共享 state，所以单独一份）。

### Page「Panels」
- `JlptPanel.dc.html`（题目卡、选项、答题反馈）
- `ArticleSummary.dc.html`
- `VocabPanel.dc.html`（词汇本 / 错题本双 tab、SM-2 到期标记）
- `Bilingual.dc.html`（中日对照行内布局，只画内容区）
- `YoutubeImport.dc.html`（URL 输入 + A/B/C 三入口）
- `Settings.dc.html`（`#settingsModal`，含 Gemini TTS 注入区）
- `Search.dc.html`（`#searchModal`）
- `UserMenu.dc.html`（头像下拉 + 主题 / 语言 / 数据管理子菜单）

### Page「Mobile 390×844」
- `MobileReader.dc.html`（折叠菜单、底部播放条、reading-mode 浮钮）
- `MobileSidebar.dc.html`（抽屉 + `sidebar-overlay`）
- `MobilePanel.dc.html`（面板全屏态，`inspector-drawer` 100vw）

### Page「Login」
- `Login.dc.html`（`.login-card`、Google 按钮、footer）

`canvas.json`：每行 ≥80px 间距，行间 ≥120px；`launch: {view: "canvas", page: "desktop"}`。

## 3. Tweaks（只留杠杆，不做文案）
- `dark`（boolean）：仅在 Tokens / Components 上，用来核对两套色值。
- `accent`（color，候选 `#0071e3 / #0077ed / #006edb`）：贯穿全部按钮 / 链接 / focus ring。
- `fontSize`（enum：小 / 中 / 大）：对应 `yomikikuan_fontSize` 三档，只在 Main 上。
文案一律写死在标记里，让人直接点选改字。

## 4. 执行步骤

1. **盘点（0.5 天）**：抓截图；用脚本把 `--ap-*` 和各组件规则导成一张 token 表；列出所有 emoji 图标（🧠 📖 🎧 ▶️ ✨ ☆ 等）。
2. **Foundations（0.5 天）**：`Tokens` + `Components` 两张板，先让色值 / 字阶 / 圆角与 CSS 完全一致，这是后面所有板的基准。
3. **Main 桌面（1 天）**：像素对齐 `index.html` 主界面，flex/grid + gap 布局，不用 margin 堆间距；再派生 `MainDark`、`Editor`、`ReaderMode`、`Inspector`。
4. **Panels（1 天）**：8 张面板，从各模块 `<style>` 字符串抄值。
5. **Mobile + Login（0.5 天）**。
6. **发布与校对**：每次 `--check` 通过后保存；对照截图逐板复核；导出 PNG 到 `docs/screens/design/` 作为文档配图。
7. **回写（按需）**：画布上确认的视觉改动回写到 `theme-apple.css` / `mobile.css` / 面板 `<style>`，不动 `main-js.js` 播放链路；任何缓存资产改动都要 bump `service-worker.js` 的 `CACHE_VERSION`。

## 5. 约束与风险

- **字体**：SF Pro 无法嵌入，用 `-apple-system, BlinkMacSystemFont` 回退；PNG/PDF 导出不带 Google Fonts，日文导出建议加 Noto Sans JP 作为度量相近的回退。
- **图标**：现有 UI 用 emoji 作为工具栏图标，Claude Design 规范要求 inline SVG。方案：画布上用 20px 描边 SVG 一套替代，同时保留一张「现状（emoji）」对照板；是否回写到代码是独立决策。
- **artboard 间不共享状态**：暗色、双语、reader mode 各需独立板，不能靠开关切换。
- **静态 vs 原型**：建议静态 mockup，播放 / 面板打开等交互用多张板表示，成本低、可编辑性好。
- **CSS-in-JS 面板**：值散在 JS 字符串里，抄写时容易漏 hover / dark 分支；每张面板板要同时核对 `:root[data-theme="dark"]` 规则。
- **画布保存**：多人同时编辑会冲突（后保存者被重载），设计迭代期建议单人编辑。

## 状态（2026-09-05）

全部 21 张板已完成并做过一轮截图校对：桌面 5（阅读 / Inspector / 编辑 / 沉浸阅读 / 墨夜）、面板 8、手机 3、登录、Components、Tokens、备选方向 2。画布：https://claude.ai/code/artifact/0b1da224-6654-4981-84ec-bca444a1829d 。源文件 `docs/design/yomikikuan-redesign/*.dc.html` + `canvas.json`。回写已完成（同日）：`theme-apple.css` 换成纸/墨/朱印 token（含墨夜暗色），阅读行改明朝体，emoji 图标换 SVG，播放条改为底部固定 dock，五个 AI 入口移到右侧 `.ai-rail`（手机端变为底部 tab 条），`CACHE_VERSION` v76→v77。42 个测试页 1132 例全部通过。第二轮（同日）补齐：`login.html` 改为纸墨 token + 左侧墨色品牌区（三语文案）；全部面板共用一套外壳（墨色 32% 遮罩、18px 圆角、墨色下划线 Tab）；设置弹窗去掉渐变色带；更新提示 toast 改为墨底朱红「刷新」；文档列表当前项去掉左侧色条；面板标题和 Tab 去掉 emoji；12 个模块里的 CSS-in-JS 硬编码 Apple 蓝全部换成 `--ap-blue` / `--ap-accent-rgb`；移除 inspector.js 隐藏四个 AI 按钮的注入规则。`CACHE_VERSION` v78。画布对应项全部落地。

## 6. 需要决定的点

1. ~~1:1 复刻还是重设计~~ → **已定：重设计**（2026-09-05）。方向 A「和纸书斋」：取色自 favicon.svg（纸 #FAF7F2 / 墨 #0B1623 / 朱印 #E63946），阅读列限宽 720px 明朝体，播放条改为底部 dock，AI 入口移到右侧竖栏。画布源文件在 `docs/design/yomikikuan-redesign/`。
2. 范围是否含 Login、YouTube 导入、Settings 三张低频页面？默认含。
3. 图标策略：emoji 保留 / 全部换 SVG / 只在画布换。默认画布换 SVG、代码不动。
4. 静态 mockup 还是可点击原型？默认静态。
