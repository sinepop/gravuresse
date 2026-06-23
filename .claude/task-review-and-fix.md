# 任务：全项目代码审查 + 修复

## 项目背景

Gravuresse — Electron + Vite + React 18 AI 创意设计桌面工具（v1.6.0）。
对话驱动：用户自然语言 → AI 理解意图 → 调度图像/视频生成模型 → 产出在无限画布管理。

## 审查范围

审查以下所有源文件，不遗漏：

### 主进程 (electron/)
- `main.js` — 入口、IPC 注册、窗口创建
- `config.js` — 配置读写
- `store.js` — 对话持久化
- `api/models.js`
- `api/http.js`
- `providers/auth.js`
- `providers/handler.js`
- `providers/pipeline.js`
- `providers/registry.js`
- `providers/handlers/*.js`（anthropic, ark, gemini, happyhorse, openai, runway）

### 渲染进程 (src/)
- `App.jsx` — 状态编排
- `components/CanvasPanel.jsx`
- `components/ChatPanel.jsx`
- `components/Settings.jsx`
- `components/MessageBubble.jsx`
- `components/AssetDetail.jsx`
- `components/ModelBar.jsx`
- `components/TitleBar.jsx`
- `components/TaskQueue.jsx`
- `components/AssetCard.jsx`
- `components/ContextMenu.jsx`
- `components/ErrorBoundary.jsx`
- `components/icons.jsx`
- `hooks/useChat.js`
- `hooks/useCanvas.js`
- `hooks/useConfig.js`
- `hooks/useTaskQueue.js`
- `providers/chatProviders.js`
- `providers/imageProviders.js`
- `providers/videoProviders.js`
- `i18n.js`
- `styles/global.css`

### 配置文件
- `package.json`
- `electron.vite.config.mjs`
- `electron-builder.yml`

### 预构建产物
- `electron/preload.js`
- `dist/preload/preload.js`

## 审查维度（按优先级）

### 1. 🔴 安全漏洞（最高优先级先修）
- API Key 存储和传输：主进程 → 渲染进程是否有泄露路径？
- IPC handler 是否都在模块级注册（不在 createWindow 内）？
- 外部 URL 是否都经过 `assertHttpsUrl()` 校验？
- 文件写入是否走原子模式（.tmp → renameSync）？
- 并发写是否通过 enqueueWrite 队列序列化？
- 渲染进程获取的配置是否经过脱敏（redacted API Key）？
- asset 保存是否走主进程安全流程（saveAssetToDisk / saveAssetWithDialog）？

### 2. 🔴 运行时错误 / Bug
- State 更新：setState 内是否有副作用（违反 CLAUDE.md 红线）？
- 对话切换：switchLoading ref 是否正确防止 sync effect 覆盖刚加载数据？
- 异步错误：所有 async/await 是否有 try-catch？Promise rejection 是否兜底？
- ErrorBoundary 覆盖范围：哪些组件没被包裹？
- 内存泄漏：useEffect cleanup 是否完整？event listener 是否移除？
- 竞态条件：切换对话时未完成的 API 请求是否被取消/忽略？

### 3. 🟡 代码质量
- App.jsx（15KB）是否职责过重？能否拆分？
- 组件是否有合理的单一职责？
- 重复逻辑识别：多个组件/handler 中有无相似代码块可抽取？
- Hook 依赖数组是否完整、正确？
- 命名是否一致、语义清晰？
- 注释和文档是否覆盖关键决策点和"为什么这样做"？

### 4. 🟡 性能和用户体验
- Canvas 渲染：大画布上的 transform 计算是否节流？
- 图片加载：大量生成图片如何加载？有无懒加载/虚拟化？
- 列表渲染：对话列表、素材网格中 key 是否正确使用？
- useMemo / useCallback 是否在昂贵计算处合理使用？

### 5. 🔵 架构和可扩展性
- Provider pipeline（SPEC-001-provider-pipeline.md 定义）实现是否与设计一致？
- 新增一个 provider（如新的图生模型）需要改多少文件？
- 状态管理：useChat 19KB hook 是否过于臃肿？是否应用 useReducer？

### 6. 🔵 样式和一致性
- 颜色值是否都使用 CSS 变量（不硬编码）？
- 所有图标是否走 Lucide React（不自绘 SVG）？
- 中英文 i18n 覆盖是否完整？

## 修复要求

**不只是报告问题——直接修。**

修复优先级：
1. 🔴 安全漏洞 → 必须修
2. 🔴 Bug → 必须修
3. 🟡 代码质量 → 修（不改架构的前提下优化）
4. 🔵 架构/样式建议 → 轻量改动，大的改动标记 TODO 留到下一轮

修复原则：
- 不改产品行为
- 不破坏现有功能
- 遵守 CLAUDE.md / AGENTS.md 中的所有红线
- 每个修复是原子 commit（小步提交，一个类型的问题一个 commit）
- 修复后用 `git diff --stat` 汇总改动

## 验收标准

完成后请汇总：
1. 发现的问题总数（按严重程度分组）
2. 已修复数 / 建议手动处理数
3. 每个修复的描述 + 文件改动清单
4. 剩余风险或需要人工判断的事项
