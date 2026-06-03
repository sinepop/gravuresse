# Gravuresse Desktop

[![中文](https://img.shields.io/badge/语言-中文-blue?style=flat-square)](#gravuresse--对话驱动的-ai-创意设计工具) [![English](https://img.shields.io/badge/lang-English-gray?style=flat-square)](#english)

## Gravuresse — 对话驱动的 AI 创意设计工具

一款集对话与设计于一体的 AI 创意桌面工具。通过自然对话让 AI 理解你的灵感与想法，自动转化为精准提示词，调用图像与视频生成模型，将脑海中的画面变为现实。

### 为什么做这个？

作为一名设计专业的在读研究生，常与设计工具打交道。随着 AI 工具的兴起和迅猛发展，我将目光转到 AI 工具上。经过一段时间的摸索，发现了几个问题：

1. **AI 模型迭代太快** — 各家模型能力不同，今天刚熟悉一个工具，过几天又听说另一个更好用，来回尝试耗费太多财力、人力和时间。
2. **提示词使用不当** — 虽然提示词概念已经兴起很久，但大多数同学（包括我自己）有时还是会下意识地直接说一段话让 AI 生图或改图，导致 AI 无法准确理解意图，生成一堆不尽人意的内容。
3. **费用门槛** — 好用的设计 AI 费用偏高，作为普通学生难以长期支撑，所以需要另寻他法。

带着点研究的想法和执着，我搜了很多资料。一位网友的话点醒了我：**没有如愿的，那就自己搓。** 于是边学边做，做出了这个桌面版本。还有很多问题待解决，后续有空会继续维护。

### 功能

- **对话生成** — 支持多家大模型，理解意图后自动调度图像/视频任务
- **图像生成** — 支持主流图像生成模型，先出提示词再确认生成
- **视频生成** — 支持多家视频生成服务，含任务队列与进度追踪
- **迭代修改** — 生成后用自然语言描述修改，AI 增量调整 prompt，保留满意部分
- **多对话管理** — 多对话并行，独立记忆互不干扰，支持切换/新建/删除
- **素材画廊** — 网格/自由布局切换，右键菜单操作，图片点击放大预览
- **设置面板** — 左侧导航布局，通用设置 + API 配置分组，模型自动获取下拉选择
- **主题与国际化** — 深色/浅色/跟随系统 + 中英文切换 + 字体大小调节
- **消息可复制** — 对话内容支持选中复制，Shift+Enter 换行

### 快速开始

1. 下载 `gravuresse-Setup-1.1.0.exe` 并安装
2. 打开程序，点击标题栏齿轮图标（或按 `Ctrl+,`）进入设置
3. 在 API 配置中选择 Provider，输入 API Key，模型自动获取
4. 在聊天框输入需求，AI 先出提示词，确认后自动生成

### 开发

```bash
npm install
npm run dev
npm run build
npm run package
```

### 更新日志

#### v1.1.0 (2026-06-03)

**生成流程优化**
- 图片生成改为「先出提示词 → 确认 → 再生成」，用户可在生成前审阅和调整 prompt
- 生成后支持自然语言迭代修改，AI 基于上次 prompt 增量调整，保留用户满意的部分
- 任务卡片实时显示状态：待确认 → 生成中 → 已完成/失败

**多对话管理**
- 支持多对话并行，每个对话独立消息和画布资产
- 对话列表栏：新建、切换、删除对话
- 对话数据自动持久化，切换不丢失

**设置页面重构**
- 左侧导航布局：通用设置（外观/语言/其他）+ API 配置（对话/图像/视频）
- 模型字段自动获取：输入 API Key 后自动拉取可用模型列表，下拉选择
- Base URL 增加「恢复默认」按钮
- API 配置增加「清空配置」按钮
- 高级选项：Chat 自定义 System Prompt，Image 自定义 Negative Prompt
- 去除免费 Pollinations API（质量不佳）

**主题与国际化**
- 深色主题完整实现（CSS 变量全覆盖，含系统偏好媒体查询）
- 中英文切换，设置页/标题栏/底栏/聊天面板文案跟随语言
- 字体大小可调（小/中/大）
- 设置组件改用 CSS 变量，跟随主题切换

**体验改进**
- 设置齿轮图标替换为更精致的 Lucide Settings 图标
- 消息气泡支持文本选中复制
- 对话输入框 Shift+Enter 换行，自动增高
- 图片资产详情增加「保存到本地」按钮
- 图片点击放大预览（lightbox）
- 修复图片/视频生成失败时无反馈的问题
- 修复描述画面时误触发图片生成的逻辑问题
- 废弃模型自动迁移（如旧配置中的 pollinations 自动重置）

#### v1.0.0 (2026-06-03)

- 对话驱动的多模态生成：输入自然语言，AI 自动识别意图并调度图像/视频任务
- 支持多家对话、图像、视频 Provider
- 素材画廊支持网格/自由布局，右键菜单操作
- 视频生成任务队列，支持进度追踪与重试
- 设置面板按轨道独立配置 Provider、API Key、Base URL、模型
- 一键连接测试验证 API Key
- 白色主题，支持深色/浅色/跟随系统
- NSIS 安装包，支持 Windows x64

---

<a id="english"></a>

# Gravuresse Desktop

[![中文](https://img.shields.io/badge/语言-中文-gray?style=flat-square)](#gravuresse--对话驱动的-ai-创意设计工具) [![English](https://img.shields.io/badge/lang-English-blue?style=flat-square)](#english)

## Gravuresse — Conversation-Driven AI Design Tool

A creative AI desktop tool that unites conversation and design. Share your ideas through natural dialogue — Gravuresse converts them into precise prompts and calls image/video generation models to bring your vision to life.

### Why I Built This

As a graduate student in design, I work with design tools on a daily basis. With the rapid rise of AI tools, I turned my attention to this space. After some exploration, I ran into a few problems:

1. **AI models iterate too fast** — Different providers have different capabilities. Just when you get familiar with one tool, you hear about another that works better. Switching back and forth costs a lot of time, energy, and money.
2. **Poor prompt habits** — Although the concept of prompt engineering has been around for a while, most of my classmates (myself included) still tend to casually describe what they want in plain language, leading to poor AI understanding and disappointing outputs.
3. **Cost barriers** — Good design AI tools are expensive, hard for an ordinary student to sustain long-term. I had to find another way.

Driven by a research mindset and sheer persistence, I dug through tons of resources. One netizen's comment hit home: **"If what you want doesn't exist, build it yourself."** So I learned as I went and built this desktop app from scratch. It's still an early version with plenty of issues to fix — I'll keep iterating whenever I have time.

### Features

- **Chat Generation** — Supports multiple LLM providers, auto-dispatches image/video tasks based on intent
- **Image Generation** — Shows prompt for review before generation, supports iterative modification
- **Video Generation** — Supports multiple video services with task queue and progress tracking
- **Iterative Editing** — Describe changes in natural language, AI incrementally adjusts the prompt
- **Multi-Conversation** — Parallel conversations with isolated memory, switch/create/delete
- **Asset Gallery** — Grid/free layout, right-click menu, click-to-zoom preview
- **Settings Panel** — Sidebar navigation layout, auto-fetch models, grouped by General + API
- **Theme & i18n** — Dark/light/system themes, Chinese/English, adjustable font size
- **Copy & Paste** — Message text selectable and copyable, Shift+Enter for newlines

### Quick Start

1. Download `gravuresse-Setup-1.1.0.exe` and install
2. Open the app, click the gear icon in the title bar (or press `Ctrl+,`) to open Settings
3. Select a Provider in API Configuration, enter your API Key — models are auto-fetched
4. Type your request in chat, AI shows the prompt first, confirm to generate

### Development

```bash
npm install
npm run dev
npm run build
npm run package
```

### Changelog

#### v1.1.0 (2026-06-03)

**Generation Flow**
- Image generation now shows prompt for review before execution — confirm to generate
- Iterative modification via natural language — AI incrementally adjusts prompt, preserves what you like
- Task cards show real-time status: pending → generating → done/error

**Multi-Conversation**
- Parallel conversations with isolated messages and canvas assets
- Conversation bar: create, switch, delete conversations
- Auto-persist conversation data across sessions

**Settings Redesign**
- Sidebar navigation: General (Appearance/Language/Other) + API Config (Chat/Image/Video)
- Auto-fetch model list on API Key entry, dropdown selection
- Base URL restore-to-default button
- Clear config button per provider
- Advanced options: custom system prompt, default negative prompt
- Removed free Pollinations API (low quality)

**Theme & i18n**
- Full dark theme implementation (CSS variables, system preference media query)
- Chinese/English language switching across all UI
- Adjustable font size (small/medium/large)
- Settings component uses CSS variables, follows theme

**UX Improvements**
- Replaced gear icon with refined Lucide Settings icon
- Message text is selectable and copyable
- Chat input auto-resizes, Shift+Enter for newlines
- Asset detail panel: save-to-file button, click-to-zoom preview
- Fixed silent failures on image/video generation errors
- Fixed accidental image generation on descriptive text
- Auto-migrate deprecated models (e.g. pollinations → provider default)

#### v1.0.0 (2026-06-03)

- Conversation-driven multimodal generation: AI auto-identifies intent and dispatches image/video tasks
- Supports multiple chat, image, and video providers
- Asset gallery with grid/free layout and right-click context menu
- Video task queue with progress tracking and retry
- Settings panel with per-track provider, API key, base URL, and model configuration
- One-click connection test for API key validation
- Light theme with dark/light/system switching
- NSIS installer for Windows x64

## License

MIT
