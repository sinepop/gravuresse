# 更新日志 / Changelog

## 中文

#### v2.0.0 (2026-07-01)

**创作谱系与数据韧性**
- 新增资产生成谱系：记录 provider、模型、prompt、参数、父资产、参考资产与任务来源
- 切换/导入旧对话时会统一补全资产结构，缺少 generation 字段的旧资产也能进入同一条迭代链路
- 导入旧资产时会自动修复空 ID、空类型和空标签，避免谱系和选择状态因为无效资产身份断裂
- 导入会自动修复重复资产 ID，并兼容字符串形式的来源资产字段，避免谱系映射丢失或选择冲突
- 资产 ID、来源 ID 与任务 ID 会统一归一化为字符串，未知资产类型会回退为图片，同时保留 `generation.mode` 的真实生成方式，避免旧项目或外部导入污染创作谱系
- 导入会过滤非对象资产，并忽略非对象 generation 字段，避免坏项目文件污染创作档案
- 资产更新会深合并 generation 字段，避免局部回写分辨率、状态或坐标时丢失原 prompt、模型与父资产关系
- 导入会规范化消息与任务结构，过滤非对象消息、修复重复消息 ID，并把已中断的运行中任务标记为错误，避免旧项目导入后永久转圈
- 对话标题推断会跳过坏消息和空 user 内容，优先使用第一条有效用户提示，避免导入后出现空标题
- 本地历史加载也会复用同一套会话规范化，旧 store 中的坏消息、坏资产、数字 activeId/deletedIds 不再绕过导入防御
- 主进程会话 store 也会统一 conversation ID、activeId 与 deletedIds 为字符串，避免旧数据在删除/恢复/选中状态上失配
- 对话消息、任务状态与资产增删改的账本逻辑抽为纯函数，并纳入核心测试覆盖
- 对话账本工具会容错非数组 messages/assets，避免旧坏数据触发同步崩溃
- 新增 `npm run test:core`，覆盖资产结构归一化、旧项目导入兼容与错误提示格式

**对话导入/导出**
- 新增当前对话导入/导出 JSON，保留消息、资产与创作谱系，导入时创建新的本地对话而不复用外部 ID
- 导出对话时会尽量把远程图片/视频内联为 data URL，降低临时链接过期导致作品丢失的风险
- 新增项目级导出/导入，可一次迁移全部对话；导入项目时以新对话合并，不覆盖本地历史
- 导入会拒绝明显无效 JSON，并兼容直接由对话数组组成的旧项目文件
- 导入会过滤不含对话字段的对象；如果文件中没有可导入对话，会给出明确错误
- 导入/导出失败提示会显示具体错误原因，方便判断是文件过大、格式错误还是写入失败

**创作档案与资产操作**
- 创作档案新增生成方式字段，可直接查看 text-to-image、image-to-video 等真实 generation mode
- 资产详情升级为创作档案，支持复制 Prompt、同系列变体、换风格、重新生成与图片转视频
- 重新生成图片保留原始提示词不变，绕过 LLM 直接调用图像 API
- 同系列变体与换风格改为确定性图片任务，不再依赖 LLM 随机返回生成任务
- 资产详情与右键菜单新增”用作参考”，可直接把资产加入当前输入引用并聚焦输入框
- 资产详情与右键菜单新增”编辑 Prompt”，可把原 Prompt 填回输入框继续改写
- 通过”编辑 Prompt”继续生成的新结果会保留父资产关系，避免分叉创作断谱系

**素材系统**
- 资产可标记为个人素材，素材会在卡片与参考图选择器中标星并优先显示
- 画布与参考图选择器支持只看素材；创作档案中的来源资产支持悬停预览
- 标记素材、删除资产与自由画布拖动位置会即时同步到对话存储，减少快速切换/导出时的状态落后

**视频生成增强**
- 图片转视频会强制把当前图片作为视频 source image；视频资产不再提供绕过费用确认的重新生成捷径
- 从图片执行”做成视频”会自动切到视频工作区，让任务队列和完成结果保持可见

**画布交互升级**
- 自由画布新增资产级撤销/重做、小地图定位与谱系线开关，拖动、删除、标记素材等用户操作可恢复
- 新增本地 Agent 动作队列：基于选中资产建议下一步动作，用户确认后复用现有资产动作执行
- Agent 队列支持复制可审查动作计划，并在切换资产时清理过期动作，避免误执行旧资产计划

**国际化与设置**
- 重新生成、编辑 Prompt、图片转视频与 Provider 预检错误会跟随当前语言显示，减少英文界面中的中文硬编码
- API 配置字段（Key/URL/Model）移至 Provider 卡片网格上方，无需滚到底部
- 订阅/套餐类 Provider 点击显示资料卡片（官网/文档/购买入口），不误写入调用配置
- 清理过时的统一 API 页面代码与重复 Provider 选择入口

#### v1.9.0 (2026-06-29)

**工作区与模型入口重构**
- 默认进入生图工作区，独立对话入口移除，但保留共享对话面板与多对话历史
- 模型选择入口移入对话框工具条，只显示设置中保存过的对话模型与当前媒体模型
- 画布按当前工作区自动过滤图片/视频资产，移除重复的全部/图片/视频筛选
- OpenNana 提示词库入口移到画布网格/自由切换旁

**API 设置与 Provider 梳理**
- 设置页 API 配置改为对话/图像/视频三栏目，视频栏目跟随实验视频开关显示
- Provider 列表精简为主流可用项，并按按量付费与订阅/套餐分区
- 火山方舟 Coding Plan 与 OpenCode Go 完全拆分为独立资料入口
- ChatGPT Plus/Pro、Claude Pro/Max 等网页订阅仅作为资料入口，不误写入调用配置
- 修复旧 provider id 迁移导致 API Key 被清空的问题

**稳定性与体验修复**
- 新用户默认浅色主题，并修复深色主题下 select/option 与弱文本可读性
- 修复首次启动或无 active conversation 时第一条消息无法发送的问题
- 强化多对话历史与图片资产留存，避免恢复会话第一条消息使用错误上下文
- 视频生成默认隐藏为实验功能，降低高成本误用风险

#### v1.8.0 (2026-06-25)

**Provider Profiles — 多配置切换**
- 新增 Provider Profiles 系统：每个轨道（chat/image/video）可保存多组 API Key + 模型组合
- 新增 `ModelSelector` 组件替代原 `ModelBar`：在聊天面板顶部快速切换已保存的模型配置
- 配置加密覆盖 Profile 中的 API Key（`safeStorage` 加密）
- 设置页大幅扩展：Profile 管理、模型测试、手动输入模型、比例/分辨率预览
- 删除模型去重：重复保存同一 Provider+Model 组合自动合并

**UI 调整**
- 侧栏精简：移除"对话"模块入口（聊天面板始终可见），默认进入"生图"
- 版本号标签移至标题栏
- 聊天面板根据当前模块（生图/视频）显示对应输入提示

#### v1.7.0 (2026-06-24)

**国内媒体 Provider 扩展**
- 新增阿里万相 / Wan：生图（wan2.6-t2i）+ 生视频（wan2.7-t2v），异步任务 submit/poll handler
- 新增百度千帆：生图（qwen-image）+ 生视频（qianfan-video-latest），异步任务 handler
- 新增腾讯混元 / TokenHub：生视频（hy-video-1.5），OpenAI 兼容 submit/query handler
- 新增 Vidu metadata 入口
- 新增火山方舟 Coding Plan / OpenCode 资料入口
- Custom Image/Video 新增千帆、混元、万相、Vidu 中转预设

**UI 重构**
- 布局从绝对定位+渐变网格背景重构为 flexbox 系统
- ModelBar 移到底部固定栏（48px），全局可见
- 侧栏改为固定结构（sidebar + 聊天面板 + 画布三栏）
- 移除 glass-floating 样式，统一为 elevated 卡片风格
- 设置页新增 Coding Plan / OpenCode / 即梦 链接按钮
- 国内 Provider 自动排序置顶

**Provider 注册表完善**
- 火山方舟链接全面更新为中文文档
- 阿里万相 integrationStatus 从 metadata → handler
- 各 Provider 补充中文名称和国内友好链接

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

#### v2.0.0 (2026-07-01)

**Creative Lineage & Data Resilience**
- Assets now keep generation lineage: provider, model, prompt, parameters, parent asset, references, and task source
- Switching or importing older conversations now normalizes asset shape, so legacy assets without generation fields still enter the same iteration flow
- Imported legacy assets with empty IDs, types, or labels are repaired automatically so lineage and selection state keep a valid asset identity
- Import now repairs duplicate asset IDs and accepts string-form source asset fields, avoiding lineage loss or selection conflicts
- Asset IDs, source IDs, and task IDs are normalized to strings, while unknown asset types fall back to images and `generation.mode` keeps the real generation mode, preventing old projects or external imports from corrupting lineage
- Import now filters non-object assets and ignores non-object generation fields, avoiding corrupted project files polluting creative records
- Asset updates now deep-merge generation fields, preventing partial resolution, status, or position updates from dropping the original prompt, model, and parent asset relationship
- Import now normalizes message and task shape, filters non-object messages, repairs duplicate message IDs, and marks interrupted running tasks as errors so old projects do not spin forever after import
- Conversation title inference now skips malformed messages and empty user content, using the first valid user prompt instead of producing blank imported titles
- Local history loading now reuses the same conversation normalization, so malformed stored messages/assets and numeric activeId/deletedIds no longer bypass import safeguards
- The main-process conversation store now normalizes conversation IDs, activeId, and deletedIds to strings, avoiding selection/deletion mismatches from legacy data
- Conversation ledger updates for messages, task status, and asset add/update/remove are now pure helpers covered by core tests
- Conversation ledger helpers tolerate non-array messages/assets so malformed legacy data does not crash synchronization
- Added `npm run test:core` covering asset normalization, legacy project import compatibility, and error-alert formatting

**Conversation Import/Export**
- Added current-conversation JSON import/export for messages, assets, and creative lineage; imported files create a new local conversation instead of reusing external IDs
- Conversation export now tries to inline remote image/video media as data URLs to reduce loss from expired temporary links
- Added project-level export/import for all conversations; imported projects merge as new local conversations without overwriting history
- Import now rejects obviously invalid JSON payloads and supports older project files that are plain conversation arrays
- Import filters objects without conversation fields; files with no importable conversations now show an explicit error
- Import/export failure alerts now include the concrete error reason, making file-size, format, and write failures easier to diagnose

**Creative Records & Asset Operations**
- Creative records now show generation mode directly, making text-to-image, image-to-video, and other generation modes visible
- Asset details are now creative records with Copy Prompt, Series Variant, Restyle, Regenerate, and Image-to-Video actions
- Regenerate now preserves the original prompt — bypasses LLM and calls the image API directly
- Series Variant and Restyle now create deterministic image tasks instead of depending on the chat model to return a task
- Asset details and context menus now support Use as Reference, adding the asset to the current input references and focusing the composer
- Asset details and context menus now support Edit Prompt, loading the original prompt back into the composer for quick edits
- Results generated after Edit Prompt keep the source asset as their parent so branched work remains traceable

**Material System**
- Assets can be marked as personal materials; marked items show a star badge and appear first in the reference picker
- Canvas and reference picker can filter to materials only; source asset chips in creative records show hover previews
- Marking materials, deleting assets, and dragging assets on the free canvas now sync immediately into conversation storage, reducing stale state during quick switching or export

**Video Generation Enhancements**
- Image-to-Video now forces the selected image as the video source image; video assets no longer expose a regenerate shortcut that bypasses cost confirmation
- Running Generate Video from an image now switches to the video workspace so the task queue and completed result stay visible

**Canvas Interaction Upgrades**
- Free canvas now includes asset-level undo/redo, a minimap, and lineage-line toggles; user actions like moving, deleting, and marking materials can be restored
- Added a local Agent action queue: suggested next steps are generated from the selected asset and executed only after user confirmation through existing asset actions
- Agent Queue can now copy a reviewable action plan and clears stale queued actions when switching assets, avoiding accidental execution against the wrong asset

**i18n & Settings**
- Regenerate, Edit Prompt, Image-to-Video, and provider preflight errors now follow the active language, reducing Chinese hardcoded copy in the English UI
- API config fields (Key/URL/Model) moved above the provider card grid; no more scrolling to the bottom
- Subscription/plan providers show an info card (homepage/docs/purchase) instead of silently doing nothing
- Removed obsolete unified API page code and duplicate Provider selection controls

#### v1.9.0 (2026-06-29)

**Workspace and Model Entry Refactor**
- Defaults to the Image workspace; the standalone Chat module is removed while the shared chat panel and conversation history remain
- Model selection moved into the chat toolbar and only shows saved chat/current media model candidates
- Canvas now follows the active workspace and filters image/video assets automatically
- OpenNana prompt gallery entry moved next to the Grid/Free canvas controls

**API Settings and Provider Cleanup**
- API settings are split into Chat/Image/Video columns; Video settings follow the experimental video toggle
- Provider lists are trimmed to mainstream entries and separated into usage billing vs subscription/plan sections
- Volcengine Coding Plan and OpenCode Go are fully separated as independent reference entries
- ChatGPT Plus/Pro and Claude Pro/Max are listed as web subscription references only, not callable API providers
- Fixed legacy provider id migration so existing API keys are preserved

**Stability and UX Fixes**
- New users default to the light theme; dark theme select/option and weak text readability improved
- Fixed first-message failures when no active conversation exists
- Strengthened multi-conversation history and image asset retention, including restored-conversation first-send context
- Video generation is hidden by default as an experimental feature to reduce high-cost mistakes

#### v1.8.0 (2026-06-25)

**Provider Profiles — Multi-Configuration Switching**
- New Provider Profiles system: each track (chat/image/video) can save multiple API Key + model combinations
- New `ModelSelector` component replaces `ModelBar`: quick-switch saved model configs in the chat panel header
- Profile API Keys encrypted via `safeStorage`
- Settings page expanded: profile management, model testing, manual model entry, ratio/resolution preview
- Dedup: saving the same Provider+Model combo auto-merges instead of duplicating

**UI Adjustments**
- Sidebar streamlined: removed "Chat" module (chat panel always visible), defaults to "Image"
- Version badge relocated to title bar
- Chat panel shows mode-specific placeholder (image/video)

#### v1.7.0 (2026-06-24)

**China Media Provider Expansion**
- Added Alibaba Wan: image (wan2.6-t2i) + video (wan2.7-t2v), async submit/poll handlers
- Added Baidu Qianfan: image (qwen-image) + video (qianfan-video-latest), async task handlers
- Added Tencent Hunyuan / TokenHub: video (hy-video-1.5), OpenAI-compatible submit/query handler
- Added Vidu metadata entry
- Added Volcengine Coding Plan / OpenCode reference entry
- Custom Image/Video presets expanded: Qianfan, Hunyuan, Wan, Vidu relay templates

**UI Refactor**
- Layout rebuilt from absolute-positioned gradient mesh to flexbox system
- ModelBar relocated to fixed bottom bar (48px), always visible
- Sidebar restructured: sidebar nav + chat panel + canvas as three-column layout
- Removed glass-floating styles; unified elevated card design
- Settings: added Coding Plan / OpenCode / Jimeng link buttons
- Domestic providers auto-sorted to top

**Provider Registry Polish**
- Volcengine links fully updated to Chinese docs
- Alibaba Wan integrationStatus promoted from metadata → handler
- Chinese display names and domestic-friendly links across providers

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
