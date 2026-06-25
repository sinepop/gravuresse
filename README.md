# Gravuresse Desktop

[![中文](https://img.shields.io/badge/语言-中文-blue?style=flat-square)](#gravuresse--对话驱动的-ai-创意设计工具) [![English](https://img.shields.io/badge/lang-English-gray?style=flat-square)](#english)

## Gravuresse — 对话驱动的 AI 创意设计工具

一款集对话与设计于一体的 AI 创意桌面工具。通过自然对话让 AI 理解你的灵感与想法，自动转化为精准提示词，调用图像与视频生成模型，将脑海中的画面变为现实。

### 为什么做这个？

作为一名设计专业的在读研究生，常与设计工具打交道。随着 AI 工具的兴起和迅猛发展，我将目光转到 AI 工具上。经过一段时间的摸索，发现了几个问题：

1. **AI 模型迭代太快** — 各家模型能力不同，刚熟悉一个工具，又听说另一个更好用，来回尝试耗费太多财力、人力和时间。
2. **提示词使用不当** — 虽然提示词概念已经兴起很久，但大多数同学（包括我自己）有时还是会下意识地直接说一段话让 AI 生图或改图，导致 AI 无法准确理解意图，生成一堆不尽人意的内容。
3. **费用门槛** — 好用的设计 AI 费用偏高，作为普通学生难以长期支撑，所以需要另寻他法。

带着点研究的想法和执着，我搜了很多资料。一位网友的话点醒了我：**没有如愿的，那就自己搓。** 于是边学边做，做出了这个桌面版本。还有很多问题待解决，后续有空会继续维护。

### 功能

- **对话生成** — 支持多家大模型，理解意图后自动调度图像/视频任务
- **深度思考** — 开启思考开关后，模型进入 extended thinking 模式，推理更深入
- **图像生成** — 支持主流图像生成模型，先出提示词再确认生成
- **视频生成** — 支持多家视频生成服务，含任务队列与进度追踪
- **迭代修改** — 生成后用自然语言描述修改，AI 增量调整 prompt，保留满意部分
- **无限画布** — 参考 Figma/Lovart 的缩放平移体验，鼠标滚轮缩放、拖拽平移
- **画布编辑工具栏** — 选择、移动、铅笔、矩形、圆形、直线、文字等绘图工具
- **参考图/视频** — 对话中附加多张参考图或视频，AI 结合上下文理解意图
- **图片缩放预览** — 生成图片支持滚轮缩放、拖拽平移、双击重置
- **多对话管理** — 多对话并行，独立记忆互不干扰，支持切换/新建/删除
- **素材画廊** — 网格/自由布局切换，右键菜单操作，图片点击放大预览
- **设置面板** — 左侧导航布局，通用设置 + API 配置分组，模型自动获取下拉选择
- **主题与国际化** — 深色/浅色/跟随系统 + 中英文切换 + 字体大小调节
- **Lucide 图标** — 全组件采用 Lucide React 图标库，精致统一
- **消息可复制** — 对话内容支持选中复制，Shift+Enter 换行

### 快速开始

1. 下载 `gravuresse-Setup-1.7.0.exe` 并安装
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

Windows 打包如果遇到 Electron / NSIS 下载超时，可临时设置镜像后重试：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run package
```

### 更新日志

完整更新日志请查看 [CHANGES.md](CHANGES.md) 或 [GitHub Releases](https://github.com/sinepop/gravuresse/releases)

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
- **Deep Thinking** — Toggle extended thinking mode for deeper reasoning with Anthropic models
- **Image Generation** — Shows prompt for review before generation, supports iterative modification
- **Video Generation** — Supports multiple video services with task queue and progress tracking
- **Iterative Editing** — Describe changes in natural language, AI incrementally adjusts the prompt
- **Infinite Canvas** — Figma/Loveart-style zoom/pan: scroll to zoom on cursor, drag to pan
- **Canvas Edit Toolbar** — Select, move, pencil, rectangle, circle, line, text drawing tools
- **Reference Images/Videos** — Attach multiple reference images from the asset gallery to chat
- **Image Zoom Preview** — Scroll-zoom, drag-pan, double-click reset for generated images
- **Multi-Conversation** — Parallel conversations with isolated memory, switch/create/delete
- **Workspace Canvas** — Grid/free layout, right-click menu, click-to-zoom preview, auto-filters by image/video workspace
- **Settings + Inline Model Switching** — Configure providers in Settings, then switch saved chat/image/video models directly from the chat toolbar
- **Theme & i18n** — Dark/light/system themes, Chinese/English, adjustable font size
- **Lucide Icons** — Unified icon system across all components using Lucide React
- **Copy & Paste** — Message text selectable and copyable, Shift+Enter for newlines

### Quick Start

1. Download `gravuresse-Setup-1.7.0.exe` and install
2. Open the app, click the gear icon in the title bar (or press `Ctrl+,`) to open Settings
3. Configure your provider credentials and save the models you want to use in Settings
4. Type your request in chat and switch saved models from the toolbar when needed

### Development

```bash
npm install
npm run dev
npm run build
npm run package
```

If Windows packaging times out while downloading Electron or NSIS assets, retry with mirrors:

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run package
```

### Changelog

Full changelog available at [CHANGES.md](CHANGES.md) or [GitHub Releases](https://github.com/sinepop/gravuresse/releases)

## License

MIT
