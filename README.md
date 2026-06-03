# StudioAI Desktop

[![中文](https://img.shields.io/badge/语言-中文-blue?style=flat-square)](#studioai--对话驱动的-ai-创意设计工具) [![English](https://img.shields.io/badge/lang-English-gray?style=flat-square)](#english)

## StudioAI — 对话驱动的 AI 创意设计工具

一款集对话与设计于一体的 AI 创意桌面工具。通过自然对话让 AI 理解你的灵感与想法，自动转化为精准提示词，调用图像与视频生成模型，将脑海中的画面变为现实。

### 为什么做这个？

作为一名设计专业的在读研究生，常与设计工具打交道。随着 AI 工具的兴起和迅猛发展，我将目光转到 AI 工具上。经过一段时间的摸索，发现了几个问题：

1. **AI 模型迭代太快** — 各家模型能力不同，今天刚熟悉一个工具，过几天又听说另一个更好用，来回尝试耗费太多财力、人力和时间。
2. **提示词使用不当** — 虽然提示词概念已经兴起很久，但大多数同学（包括我自己）有时还是会下意识地直接说一段话让 AI 生图或改图，导致 AI 无法准确理解意图，生成一堆不尽人意的内容。
3. **费用门槛** — 好用的设计 AI 费用偏高，作为普通学生难以长期支撑，所以需要另寻他法。

带着点研究的想法和执着，我搜了很多资料。一位网友的话点醒了我：**没有如愿的，那就自己搓。** 于是边学边做，做出了这个桌面版本。还有很多问题待解决，后续有空会继续维护。

### 功能

- **对话生成** — 支持多家大模型，理解意图后自动调度图像/视频任务
- **图像生成** — 支持主流图像生成模型
- **视频生成** — 支持多家视频生成服务，含任务队列与进度追踪
- **素材画廊** — 网格/自由布局切换，右键菜单操作
- **设置面板** — 标题栏齿轮图标或 `Ctrl+,` 打开，按对话/图像/视频分别配置
- **白色主题** — 支持深色/浅色/跟随系统切换

### 快速开始

1. 下载 `studio-ai-Setup-1.0.0.exe` 并安装
2. 打开程序，点击标题栏齿轮图标（或按 `Ctrl+,`）进入设置
3. 在对话/图像/视频标签页配置对应的 API Key
4. 在聊天框输入需求，AI 自动完成创作

### 开发

```bash
npm install
npm run dev
npm run build
npm run package
```

### 更新日志

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

# StudioAI Desktop

[![中文](https://img.shields.io/badge/语言-中文-gray?style=flat-square)](#studioai--对话驱动的-ai-创意设计工具) [![English](https://img.shields.io/badge/lang-English-blue?style=flat-square)](#english)

## StudioAI — Conversation-Driven AI Design Tool

A creative AI desktop tool that unites conversation and design. Share your ideas through natural dialogue — StudioAI converts them into precise prompts and calls image/video generation models to bring your vision to life.

### Why I Built This

As a graduate student in design, I work with design tools on a daily basis. With the rapid rise of AI tools, I turned my attention to this space. After some exploration, I ran into a few problems:

1. **AI models iterate too fast** — Different providers have different capabilities. Just when you get familiar with one tool, you hear about another that works better. Switching back and forth costs a lot of time, energy, and money.
2. **Poor prompt habits** — Although the concept of prompt engineering has been around for a while, most of my classmates (myself included) still tend to casually describe what they want in plain language, leading to poor AI understanding and disappointing outputs.
3. **Cost barriers** — Good design AI tools are expensive, hard for an ordinary student to sustain long-term. I had to find another way.

Driven by a research mindset and sheer persistence, I dug through tons of resources. One netizen's comment hit home: **"If what you want doesn't exist, build it yourself."** So I learned as I went and built this desktop app from scratch. It's still an early version with plenty of issues to fix — I'll keep iterating whenever I have time.

### Features

- **Chat Generation** — Supports multiple LLM providers, auto-dispatches image/video tasks based on intent
- **Image Generation** — Supports mainstream image generation models
- **Video Generation** — Supports multiple video services with task queue and progress tracking
- **Asset Gallery** — Grid/free layout toggle, right-click context menu
- **Settings Panel** — Gear icon in title bar or `Ctrl+,` to open, configure per track
- **Light Theme** — Supports dark/light/system theme switching

### Quick Start

1. Download `studio-ai-Setup-1.0.0.exe` and install
2. Open the app, click the gear icon in the title bar (or press `Ctrl+,`) to open Settings
3. Configure your API keys for Chat/Image/Video
4. Type your request in the chat box and let AI create for you

### Development

```bash
npm install
npm run dev
npm run build
npm run package
```

### Changelog

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
