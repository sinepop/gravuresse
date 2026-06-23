# 更新日志 / Changelog

## 中文

#### v1.6.1 (2026-06-23)

**改进**
- NSIS 安装选项：支持选择安装目录（不再一键安装）
- Provider ID 别名去重：主进程统一从 config.js 导入，消除 main.js 重复定义
- Fallback Provider 列表同步：Chat 从 9 个扩展到 15 个，Image 新增 SiliconFlow
- 简化 store.js 写入队列（与 config.js 保持一致）
- .gitignore 增强：添加 OS/编辑器/崩溃转储/密钥文件防护

**清理**
- 移除过时文件：.codex/、CODEX_TASK.md、根目录残渣图片/docx

#### v1.6.0 (2026-06-21)

**Provider 架构重构**
- 统一 Provider 注册表：17 个 Provider 按平台组织（openai/anthropic/google/volcengine/alibaba/moonshot/zhipu/deepseek/siliconflow/groq/together/openrouter/xai/perplexity/lingyi/runway/happyhorse）
- 统一 Auth 层：支持 bearer/header/query/cookie/session 五种鉴权方式
- 统一 Request Pipeline：所有 API 调用走 `provider:call` IPC
- 每个平台可声明多种能力（chat/image/video），不再按轨道拆分 Provider
- 新增国内平台支持：硅基流动、零一万物、Groq、Together AI、xAI、Perplexity
- 废弃旧的 electron/api/chat.js / image.js / video.js

**UI 风格更新**
- 配色改为冷调蓝主题（#4A6CF7），替换原来的金色/琥珀色
- Notion 风格扁平化设计：减少阴影、边框，增加留白
- 增加 `--space-*` 间距 Token 体系
- 暗色模式改为深蓝灰底（#0D0D12），不再是暖灰
- 分辨率选项改为标准命名（标准/高清/超清/2K/4K）
- 绘图工具栏仅在自由画布模式下显示

**其他**
- 项目文件清理：移除仓库中旧 API 文件，更新 .gitignore

**安全与代码质量加固**
- **IPC 监听提升**：将窗口最小化/最大化/关闭及状态查询的 IPC 注册，从内部辅助函数范围提升至 `electron/main.js` 模块的顶级作用域，消除了潜在的内存泄露隐患，严格遵循 Electron 安全规范。
- **UI 样式规范统一**：增加了遮罩背景色、渐变与危险边框的 CSS 全局变量，移过了主要组件中的硬编码颜色与边框设置，全面替换为主题变量。
- **图标包装器统一**：在 `icons.jsx` 中增加了缺失窗口控件与画布工具图标的映射，将各组件中所有原生 `<svg>` 和 direct lucide 引用全部规范化替换为 `<Ic />`。

**状态与生命周期修复**
- **Ref 状态副作用清理**：移除了 `AssetDetail.jsx` 状态更新器内部直接修改 ref 的操作，引入了与其同步的 `offsetRef` 读取最新偏移量，保证了 React 状态的纯度。
- **卡片自由移动竞态修复**：在 `useCanvas.js` 中新增 `updateAssets` 批量更新函数；重构了 `CanvasPanel.jsx` 在 Free Mode 下的坐标初始化，将坐标分配采用单次原子批量更新，彻底消除了由于逐个卡片修改导致的顺次重渲染级联和无限循环隐患。
- **事件监听泄漏修复**：在 `CanvasPanel.jsx` 中引入 `dragCleanupRef` 与卸载清理 effect，保证在组件意外销毁时释放绑定在 window 上的拖拽监听事件，杜绝内存泄露。
- **i18n 缺陷修复与传播**：修复了 `MessageBubble.jsx` 排队中与查询视频状态的中英文转换 bug，使 `ContextMenu.jsx` (右键菜单) 与 `TaskQueue.jsx` (任务队列) 能够正确消费 `lang` 配置与 `t()` 函数翻译，完成底栏 model 轨道的翻译转换。

#### v1.5.0 (2026-06-08)

**安全加固**
- URL 重定向安全：阻止 HTTPS→HTTP 协议降级，限制最大重定向次数，支持相对路径 redirect
- CSP 统一管理：移除 index.html 中的 CSP meta tag，由主进程 session header 统一控制
- API Key 加密存储：使用 Electron safeStorage 加密 API Key，解密失败时自动清空避免发送垃圾数据
- Electron 导航边界：阻止非应用内导航和 `window.open` 子窗口，Markdown 外链统一走主进程 HTTPS 校验后 `shell.openExternal`
- 渲染进程配置脱敏：`config:get` 只返回 redacted API Key，真实密钥保留在主进程并由 API IPC 读取
- 安全保存素材：移除高风险任意路径保存接口，图片/视频保存统一走主进程生成路径或保存对话框，强制 `.png`/`.mp4` 扩展名
- 下载与响应限制：素材下载增加 HTTPS 校验、redirect 复校验、100MB 大小上限、总超时和临时文件 rename；API 响应增加 25MB 上限
- 文件写入原子性：配置和对话数据写入使用 tmp+rename 原子模式，并发写操作通过队列序列化
- Gemini API Key URL 编码：修复含特殊字符时 URL 断裂的问题

**状态管理修复**
- 对话重命名持久化：修复重命名后刷新页面丢失的 bug
- 对话切换防丢：切换/新建/删除前 flush 当前对话，异步 chat/image/video 结果写回发起对话而不是丢弃或串到当前对话
- 对话存储恢复：损坏的 `conversations.json` 会备份后从空 store 恢复，删除 tombstone 在读取和写入时都生效
- 画布状态稳定性：useCanvas 返回值 memoization，避免级联重渲染
- 任务队列闭包修复：useTaskQueue 使用 canvasRef 消除 stale closure
- 视频任务轮询：视频提交接入任务队列，成功但无 `videoUrl` 时继续 running，完成后生成 video asset
- 写队列竞态修复：history:save 走统一写队列，防止并发覆盖

**稳定性**
- 崩溃恢复退避：renderer 崩溃后 5 秒退避重启，最多 3 次，超限提示手动操作
- 错误边界：新增 ErrorBoundary 组件，渲染崩溃时显示友好提示而非白屏
- Settings 弹窗 Escape 关闭、Lightbox Escape 关闭 + 点击背景关闭
- 视频预览 CSP：增加 `media-src 'self' https: data: blob:`，AssetCard/AssetDetail 使用 `<video controls>` 渲染视频
- 打包依赖升级：Electron 42.3.3、electron-builder 26.15.2、electron-vite 5.0.0、Vite 7.3.5，打包时复制运行时 helper 和图标进 `dist`

#### v1.3.1 (2026-06-05)

**画布生成动效**
- 生成图片时画布显示 shimmer 占位卡片，参考 Lovart 动效风格，渐变闪烁提示生成中

**多图生成支持**
- AI 返回多个生成任务时，画布正确显示所有图片，不再只显示第一张

**批量生成稳定性**
- 批量生成不再因单张失败而中断，全程显示占位符和进度，失败项自动清理

**保存弹窗修复**
- "保存到本地"不再弹出两次对话框，统一走 IPC 通道

**工具栏交互修复**
- 画布底部绘图工具栏按钮恢复正常响应，不再被画布拖拽事件拦截

**右键菜单接线**
- 画布资产右键菜单可正常打开，支持查看大图/下载/删除/重新生成

**对话命名编辑**
- 双击对话标题可重命名，支持 Enter 确认 / Escape 取消

**分辨率扩展**
- 新增 2K (2560) 和 4K (3840) 分辨率选项，尺寸按比例动态缩放

#### v1.3.0 (2026-06-04)

**对话生成设置**
- 对话输入栏新增「生成设置」面板，可直接调整图片比例、风格预设、分辨率（标准/高清/超清）
- 生成设置从 Settings 移至对话框，方便随时切换，无需打开设置页

**批量生成**
- 生成任务卡片新增「批量」按钮，支持一次生成 2/3/4 张图片
- 批量进度实时显示（如 2/4），失败项跳过继续

**计时器**
- AI 思考和图片/视频生成过程中显示实时计时（秒数），避免用户长久等待无反馈
- 生成完成后显示总用时

**API 可靠性修复**
- 修复切换 Provider 时 `protocol` 字段未保存到配置的 bug，导致图片生成始终失败
- 新增即梦/Seedream (`ark_image`) 专用图片生成端点，修正 URL 路径错误
- 图片生成新增自动重试机制（失败后间隔 2 秒重试 1 次）
- 视频生成同样修复 protocol 解析逻辑

**画布模式区分**
- 网格模式：结构化排列，自动分列，无缩放平移，纯滚动浏览
- 自由模式：无限画布，自由定位，4 列间距排布，支持缩放平移
- 新图片/视频生成时，边框金色呼吸闪烁动画提示用户

**参考图功能改为可选**
- 参考图按钮默认隐藏，在设置 > 其他中可开启
- 开启后对话框出现参考图按钮

**图片自动保存**
- 生成的图片自动保存到 `Pictures/Gravuresse/` 目录
- 支持 base64 和 URL 两种格式的图片下载保存

**其他修复**
- 修复画布编辑工具栏「文字」图标缺失（TOOL_ICONS 键名 type→text）
- 修复网格模式多张图片只显示一张的布局问题
- 设置新增「自动保存图片到本地」和「启用参考图」开关

#### v1.2.0 (2026-06-04)

**无限画布**
- 参考 Figma/Lovart 的画布交互，鼠标滚轮以光标为中心缩放，拖拽平移
- 浮动缩放控件：放大、缩小、适应画布、缩放比例显示

**画布编辑工具栏**
- 底部居中 Figma 风格工具栏：选择、移动、铅笔、矩形、圆形、直线、文字
- 工具激活时内联显示颜色盘和线宽选项
- HTML5 Canvas overlay 实时预览绘制形状

**深度思考**
- 对话输入栏新增「深度思考」开关，开启后调用 Anthropic extended thinking
- 思考过程可折叠展示，独立于正文内容

**参考图/视频**
- 对话输入栏新增「参考图」按钮，可从素材画廊选取多张参考图
- 参考图缩略图预览，支持单独移除
- 参考内容注入系统 prompt，AI 结合上下文理解意图

**图片缩放预览**
- 素材详情面板图片支持滚轮缩放、拖拽平移、双击重置
- 独立 lightbox 模式全屏查看

**UI 全面优化**
- 标题栏窗口按钮改为精致 SVG 图标，关闭按钮悬停红色高亮
- 发送按钮加大、渐变金色、悬停放大带阴影
- 底部模型栏按钮加大，标签大写+金色分隔线，版本号胶囊样式
- 设置面板输入框加宽，保存按钮渐变+悬停上浮
- 全组件迁移至 Lucide React 图标库
- 自定义应用图标

**其他**
- 修复对话切换时内容丢失的 bug（stale closure + sync race condition）
- 修复 ZoomableImage 拖拽偏移闭包问题

#### v1.1.0 (2026-06-03)

**生成流程优化**
- 图片生成改为「先出提示词 → 确认 → 再生成」，用户可在生成前审阅和调整 prompt
- 生成后支持自然语言迭代修改，AI 基于上次 prompt 增量调整，保留满意的部分
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

## English

#### v1.6.1 (2026-06-23)

**Improvements**
- NSIS installer: added install-directory selection (no longer one-click)
- Provider ID aliases deduplicated: main process imports from config.js
- Fallback provider lists synced: Chat expanded from 9 to 15 providers, Image added SiliconFlow
- Simplified store.js write queue (aligned with config.js pattern)
- .gitignore enhanced: OS/editor/crash dump/secret file patterns

**Cleanup**
- Removed obsolete files: .codex/, CODEX_TASK.md, stray images/docx in root

#### v1.6.0 (2026-06-21)

**Provider Architecture Refactor**
- Unified provider registry: 17 providers are organized by platform (openai/anthropic/google/volcengine/alibaba/moonshot/zhipu/deepseek/siliconflow/groq/together/openrouter/xai/perplexity/lingyi/runway/happyhorse).
- Unified auth layer: supports bearer, header, query, cookie, and session authentication modes.
- Unified request pipeline: all API calls now go through the `provider:call` IPC channel.
- Each platform can declare multiple capabilities (chat/image/video), instead of splitting providers by track.
- Added platform support for SiliconFlow, Lingyi Wanwu, Groq, Together AI, xAI, and Perplexity.
- Deprecated the legacy `electron/api/chat.js`, `electron/api/image.js`, and `electron/api/video.js` modules.

**UI Style Refresh**
- Updated the palette to a cool blue theme (`#4A6CF7`), replacing the previous gold/amber accents.
- Moved toward a flatter Notion-style surface treatment with fewer shadows, fewer borders, and more whitespace.
- Added the `--space-*` spacing token system.
- Changed dark mode to a deep blue-gray base (`#0D0D12`) instead of warm gray.
- Renamed resolution options to standard labels (Standard/HD/Ultra HD/2K/4K).
- Drawing tools now appear only in Free Canvas mode.

**Other**
- Cleaned project files by removing old API files from the repository and updating `.gitignore`.

**Security & Code Quality Hardening**
- **IPC Scoping**: Lifted window minimize/maximize/close and status query IPC registration from an internal helper scope to the top-level scope of `electron/main.js`, removing a potential memory leak risk and aligning with Electron security practices.
- **UI Style Consistency**: Added global CSS variables for overlay background, gradients, and danger borders, and migrated major components away from hardcoded colors and border values.
- **Icon Wrapper Standardization**: Added missing window control and canvas tool icon mappings in `icons.jsx`, replacing raw `<svg>` and direct lucide imports with `<Ic />`.

**State & Lifecycle Fixes**
- **Ref State Side Effect Cleanup**: Removed direct ref mutation from the `AssetDetail.jsx` state updater and introduced synchronized `offsetRef` reads for latest drag offsets.
- **Free-Move Card State Fix**: Added `updateAssets` batch updates in `useCanvas.js` and refactored Free Mode coordinate initialization in `CanvasPanel.jsx` to assign coordinates in one atomic batch, eliminating cascading rerenders and infinite loop risk.
- **Event Listener Leak Fix**: Added `dragCleanupRef` and unmount cleanup in `CanvasPanel.jsx` so window drag listeners are released if the component unmounts mid-drag.
- **i18n Gap Fixes & Propagation**: Fixed queued/polling video status translations in `MessageBubble.jsx`, passed `lang` into `ContextMenu.jsx` and `TaskQueue.jsx`, and completed model track label translation mapping.

#### v1.5.1 (2026-06-16)

**Security & Quality Hardening**
- **IPC Scoping**: Lifted all window control IPC listeners (minimize, maximize, close, and status query) to the top-level module scope of `electron/main.js`, satisfying Electron secure registry requirements.
- **Theme Consistency**: Replaced hardcoded literal colors and card borders across UI components with central CSS variables from `global.css` (overlay-dark, danger-border, accent-gradient).
- **Icon wrapper `<Ic />` Integration**: Expanded `icons.jsx` to map missing window controls and tools, and refactored components to replace raw SVGs and direct lucide imports with `<Ic />`.

**State & Lifecycle Fixes**
- **State Purity**: Removed state setter side effects in `AssetDetail.jsx` by implementing a synchronized `offsetRef` to read current mouse drag offsets.
- **Coordinate Assignment Batching**: Added the `updateAssets` batch action to `useCanvas.js` and optimized `CanvasPanel.jsx` Free Mode initial coordinates assignment to run in a single atomic update, eliminating infinite loop risks.
- **Memory Leak Prevention**: Created a `dragCleanupRef` in `CanvasPanel.jsx` with an unmount cleanup effect to properly release window mouse move and up event listeners if the panel unmounts mid-drag.
- **i18n Mappings & Propagation**: Resolved translate-to-English bugs for queued and polling states in `MessageBubble.jsx`, propagated `lang` prop to `ContextMenu.jsx` and `TaskQueue.jsx` to render fully translated action menus and queue labels, and mapped model track categories in `ModelBar.jsx`.

#### v1.5.0 (2026-06-08)

**Security Hardening**
- URL redirect safety: blocks HTTPS→HTTP protocol downgrade, limits redirect depth, supports relative redirects
- CSP unification: removed CSP meta tag from index.html, managed exclusively via main process session header
- API key encryption: Electron safeStorage encrypts API keys at rest; decryption failure clears key to avoid sending garbage
- Electron navigation boundary: blocks unexpected app navigation and `window.open` child windows; Markdown external links go through main-process HTTPS validation before `shell.openExternal`
- Renderer config redaction: `config:get` returns redacted API keys; raw secrets stay in the main process and are read by API IPC handlers
- Safe asset saving: removed high-risk arbitrary-path save API; image/video saves go through main-owned paths or save dialog with enforced `.png`/`.mp4` extensions
- Download and response guards: asset downloads enforce HTTPS, revalidate redirects, cap size at 100MB, use wall-clock timeout and temp-file rename; API responses are capped at 25MB
- Atomic file writes: config and conversation data use tmp+rename pattern; concurrent writes serialized via queue
- Gemini API key URL encoding: fixes URL breakage with special characters

**State Management Fixes**
- Conversation rename persistence: fixed bug where renames were lost on page reload
- Conversation switch data safety: switch/new/delete flush the active conversation first; async chat/image/video results write back to the origin conversation
- Conversation store recovery: corrupt `conversations.json` is backed up and replaced with an empty writable store; delete tombstones are enforced on read and write
- Canvas state stability: useCanvas return value memoized, prevents cascading re-renders
- Task queue closure fix: useTaskQueue uses canvasRef to eliminate stale closures
- Video task polling: video submission is wired into the task queue; succeeded-without-`videoUrl` stays running, and completion creates a video asset
- Write queue race fix: history:save routes through unified write queue, prevents concurrent overwrites

**Stability**
- Crash recovery backoff: renderer crashes restart after 5s delay, max 3 attempts, then prompts manual restart
- Error boundary: new ErrorBoundary component shows friendly fallback instead of white screen on render crash
- Settings modal Escape to close, Lightbox Escape to close + click backdrop to close
- Video preview CSP: added `media-src 'self' https: data: blob:`; AssetCard/AssetDetail render video assets with `<video controls>`
- Build dependency refresh: Electron 42.3.3, electron-builder 26.15.2, electron-vite 5.0.0, Vite 7.3.5; packaged builds copy runtime helpers and icon into `dist`

#### v1.3.1 (2026-06-05)

**Canvas Generation Effects**
- Shimmer placeholder cards appear on canvas during image generation, inspired by Lovart's visual style

**Multi-Task Image Support**
- When AI returns multiple generation tasks, all images now display correctly on canvas

**Batch Generation Stability**
- Batch generation no longer stops on single-item failure; placeholders and progress shown throughout

**Save Dialog Fix**
- "Save to file" no longer opens the dialog twice; unified IPC-only save path

**Toolbar Interaction Fix**
- Canvas bottom toolbar buttons now respond correctly, no longer intercepted by canvas drag events

**Context Menu Wired Up**
- Right-click menu on canvas assets works properly: view, download, delete, regenerate

**Conversation Rename**
- Double-click conversation title to rename, with Enter to confirm / Escape to cancel

**Resolution Expansion**
- Added 2K (2560) and 4K (3840) resolution options with proportional dynamic scaling

#### v1.3.0 (2026-06-04)

**Generation Settings in Chat**
- New "Gen Settings" panel in chat toolbar: adjust aspect ratio, style preset, and resolution (Standard/HD/Ultra HD) inline
- Moved from Settings page to chat toolbar for quick access

**Batch Generation**
- New "Batch" button on task cards — generate 2/3/4 images at once
- Real-time batch progress (e.g. 2/4), failed items skipped

**Elapsed Timer**
- Real-time timer during AI thinking and image/video generation
- Total elapsed time shown on completion

**API Reliability Fix**
- Fixed critical bug: `protocol` field was never saved to config on provider switch, causing image generation to always fail
- Added dedicated Seedream/即梦 (`ark_image`) image generation endpoint with correct URL path
- Added auto-retry for image generation (1 retry after 2s delay)
- Fixed video generation protocol resolution

**Canvas Mode Redesign**
- Grid mode: structured auto-arranged layout, scrollable, no zoom/pan
- Free mode: infinite canvas with absolute positioning in 4-column spread, zoom/pan enabled
- Pulsing gold border animation on assets being generated

**Reference Images Now Optional**
- Reference button hidden by default, toggle in Settings > Other
- Only appears in chat toolbar when enabled

**Auto-Save Images**
- Generated images auto-saved to `Pictures/Gravuresse/` directory
- Supports both base64 and URL image download

**Other Fixes**
- Fixed missing "Text" tool icon in canvas toolbar (TOOL_ICONS key: type→text)
- Fixed grid mode only showing one image (layout issue)
- Added "Auto-save images" and "Enable reference images" toggles in Settings

#### v1.2.0 (2026-06-04)

**Infinite Canvas**
- Figma/Loveart-style canvas interaction: scroll-zoom centered on cursor, drag to pan
- Floating zoom controls: zoom in, zoom out, fit canvas, zoom percentage display

**Canvas Edit Toolbar**
- Bottom-centered Figma-style toolbar: select, move, pencil, rectangle, circle, line, text
- Inline color palette and stroke width options when drawing tool is active
- HTML5 Canvas overlay with real-time shape preview

**Deep Thinking**
- New "Think" toggle in chat input, enables Anthropic extended thinking mode
- Collapsible thinking process display, separate from response content

**Reference Images/Videos**
- New "Reference" button to pick multiple images from the asset gallery
- Thumbnail preview with individual remove support
- References injected into system prompt for contextual understanding

**Image Zoom Preview**
- Asset detail image supports scroll-zoom, drag-pan, double-click reset
- Standalone lightbox mode for fullscreen viewing

**UI Overhaul**
- Title bar window buttons replaced with refined SVG icons, close button red highlight on hover
- Send button enlarged with gradient gold, hover scale-up with shadow
- Model bar buttons enlarged, accent uppercase labels with divider, version pill badge
- Settings input fields wider, save button gradient with hover lift
- Migrated all components to Lucide React icon library
- Custom application icon

**Other**
- Fixed conversation disappearing bug on switch (stale closure + sync race condition)
- Fixed ZoomableImage drag offset closure issue

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
