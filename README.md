# Gravuresse Desktop

[![中文](https://img.shields.io/badge/语言-中文-blue?style=flat-square)](#gravuresse--对话驱动的-ai-创意设计工具) [![English](https://img.shields.io/badge/lang-English-gray?style=flat-square)](#english)

## Gravuresse — 对话驱动的 AI 创意设计工具

一款集对话与设计于一体的 AI 创意桌面工具。通过自然对话让 AI 理解你的灵感与想法，自动转化为精准提示词，调用图像与视频生成模型，将脑海中的画面变为现实。

### 为什么做这个？

创意生成工具的模型、供应商和调用方式变化很快，用户往往需要在多个界面间切换、重复配置，并手动把自然语言整理成适合不同模型的提示词。Gravuresse 将这些步骤集中到一个本地桌面工作区，在保留供应商选择权的同时，降低从想法到图像或视频任务的操作成本。

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
- **提供商设置** — 4 子页面：账号（OAuth/设备码连接）、API 密钥（自动拉取模型）、自定义中转、默认模型搭配
- **主题与国际化** — 深色/浅色/跟随系统 + 中英文切换 + 字体大小调节
- **Lucide 图标** — 全组件采用 Lucide React 图标库，精致统一
- **消息可复制** — 对话内容支持选中复制，Shift+Enter 换行

### 快速开始

1. 下载 `gravuresse-Setup-2.4.0.exe` 并安装
2. 打开程序，点击标题栏齿轮图标（或按 `Ctrl+,`）进入设置
3. 在提供商设置 → API 密钥中输入 API Key，模型自动拉取
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

发布包会在 `release/SHA256SUMS.txt` 生成 SHA256 校验和。正式发布时请同时上传安装包和校验和，便于用户核对下载文件。

`npm run package` 会依次执行受保护清理、核心测试、类型检查、生产构建、运行时检查、Windows 打包、ASAR 检查、SHA-256、秘密审计、解包应用冒烟和 NSIS 安装程序冒烟。完成后 `release` 仅保留 2.4.0 安装包、blockmap、`latest.yml`、`SHA256SUMS.txt` 与 `win-unpacked`。

### 更新日志

近期变更摘要请查看 [CHANGES.md](CHANGES.md)；完整逐版本记录请查看 [GitHub Releases](https://github.com/sinepop/gravuresse/releases)。

---

<a id="english"></a>

# Gravuresse Desktop

[![中文](https://img.shields.io/badge/语言-中文-gray?style=flat-square)](#gravuresse--对话驱动的-ai-创意设计工具) [![English](https://img.shields.io/badge/lang-English-blue?style=flat-square)](#english)

## Gravuresse — Conversation-Driven AI Design Tool

A creative AI desktop tool that unites conversation and design. Share your ideas through natural dialogue — Gravuresse converts them into precise prompts and calls image/video generation models to bring your vision to life.

### Why This Exists

Creative-generation models, providers, and APIs change quickly. Users often have to switch between tools, repeat configuration, and manually reshape natural-language ideas for each model. Gravuresse brings those steps into one local desktop workspace, preserving provider choice while reducing the friction between an idea and an image or video task.

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
- **Provider Settings** — 4 sub-pages: Accounts (OAuth/device-code), API Keys (auto-fetch models), Custom Relays, Default Model Pairing
- **Theme & i18n** — Dark/light/system themes, Chinese/English, adjustable font size
- **Lucide Icons** — Unified icon system across all components using Lucide React
- **Copy & Paste** — Message text selectable and copyable, Shift+Enter for newlines

### Quick Start

1. Download `gravuresse-Setup-2.4.0.exe` and install
2. Open the app, click the gear icon in the title bar (or press `Ctrl+,`) to open Settings
3. In Provider Settings → API Keys, enter your API key — models are fetched automatically
4. Type your request in chat, review the prompt, and confirm to generate

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

Release builds should be signed when certificate environment variables are available. `npm run package` writes `release/SHA256SUMS.txt`; publish it with the installer so users can verify the download.

`npm run package` runs protected cleanup, core tests, type checking, the production build, runtime checks, Windows packaging, ASAR verification, SHA-256 generation, secret auditing, unpacked-app smoke, and an NSIS installer smoke. On completion, `release` contains only the 2.4.0 installer, blockmap, `latest.yml`, `SHA256SUMS.txt`, and `win-unpacked`.

### Changelog

See [CHANGES.md](CHANGES.md) for recent highlights and [GitHub Releases](https://github.com/sinepop/gravuresse/releases) for the complete version history.

## License

MIT
