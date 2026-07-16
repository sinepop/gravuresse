# Gravuresse vNext 技术规格（SPEC）

> 状态：Baseline v0.5（现有架构优化 / Incremental Maintainability Spec）
> 日期：2026-07-16
> 对应 PRD：`docs/PRD.md`
> 目标：在 Gravuresse 现有 Electron + React 架构上，优化创作流程、布局、组件、主题、语言和可维护性。**不推翻当前 Conversation/Asset/Provider 体系，不新增大型平台层。**

---

## 0. v0.5 技术结论

从代码和截图看，Gravuresse 已经有一套合理骨架：

```text
Electron Main Process
├─ config / safeStorage / Provider / IPC / conversation store

Renderer / React
├─ App.jsx：会话、配置、模块、桥接保存
├─ ChatPanel.jsx：输入、生成设置、会话操作、参考图
├─ CanvasPanel.jsx：网格/自由画布、素材、工具、选中态
├─ AssetDetail.jsx：预览、生成说明、动作入口
├─ Settings.jsx：Provider 设置 + 通用设置
├─ TaskQueue.jsx：视频任务队列
├─ global.css：light/dark/system token
└─ i18n.js：zh/en 文案
```

v0.5 不做“大重构”。它做五件事：

1. **流程层**：把“输入 → 生成 → 选中 → 继续 → 转视频 → 恢复”做顺；
2. **布局层**：保持当前 `module sidebar + chat pane + canvas pane`，优化收纳和详情；
3. **组件层**：沉淀基础组件和状态组件，降低重复 inline style；
4. **偏好层**：补齐 theme/language/fontSize 的真实使用闭环；
5. **维护层**：让新功能进入明确文件边界、类型边界和测试边界。

技术原则：

- 不新增顶层业务实体作为前提；
- 不把画布改成执行引擎；
- 不把设置改成复杂后台；
- 不让主题和语言分叉成两套 UI；
- 不为了抽象而抽象，先从重复和痛点处抽组件。

---

## 1. 当前系统基线

### 1.1 技术栈

来自 `package.json`：

- Electron 42；
- React 18；
- electron-vite / Vite 7；
- Node.js >= 22.12；
- JavaScript 主体 + TypeScript 类型边界；
- `node:test` 核心测试；
- 本地 JSON 存储与 `.gravuresse.json` 导入导出。

### 1.2 真实领域类型

来自 `src/types/domain.ts`：

| 类型 | 当前职责 | v0.5 处理 |
|---|---|---|
| `Conversation` | 会话/创作记录，含消息和资产 | 继续作为 P0 顶层单元 |
| `Message` | 聊天记录，可含任务 | 保留为创作过程记录 |
| `MessageTask` | 图像/视频生成任务摘要 | 补强恢复和状态字段 |
| `Asset` | 图像/视频/素材 | 保留为结果和参考素材 |
| `Generation` | 生成元数据 | 作为最小来源记录 |
| `ProviderProfile` / connections | 连接、模型、调用参数 | 沿用现有体系 |
| `VideoQueueTask` | Renderer 内视频轮询任务 | 可由持久 MessageTask 恢复 |
| `CanvasController` | 资产列表、选中、网格/自由视图 | 仅在 `workspaceMode='canvas'` 时作为主工作区视图控制器 |
| `ConfigPayload.general` | 主题、语言、字号、工作区形态、功能开关 | v0.5 偏好系统核心 |

### 1.3 关键文件所有权

| 文件 | 当前职责 | v0.5 改造重点 |
|---|---|---|
| `src/App.jsx` | 会话、模块、配置、chat/canvas 同步保存 | 保持编排角色，避免继续膨胀 |
| `src/components/ChatPanel.jsx` | 输入、生成设置、参考图、会话工具 | 流程提示、参考摘要、状态一致性 |
| `src/components/CanvasPanel.jsx` | 资产区、网格/自由视图、工具栏、批量动作 | 布局和组件拆分，避免变业务引擎 |
| `src/components/AssetDetail.jsx` | 素材详情和动作 | 生成说明、继续创作、错误/状态入口 |
| `src/components/Settings.jsx` | Provider 设置 + 通用偏好 | 语言/主题/字号体验闭环 |
| `src/styles/global.css` | 设计 token 和主题 | 补齐语义 token，减少硬编码 |
| `src/i18n.js` | zh/en 文案 | 新文案必须进入 key 管理 |
| `src/hooks/useConfig.js` | 配置加载、Provider 列表迁移 | 保障 general 偏好稳定合并 |
| `electron/config.js` | 默认配置、安全写入 | 保持默认 light/zh/medium，不污染 Provider |
| `electron/security/sanitize.js` | 存储/导入字段清洗 | 新持久字段必须 allowlist 和测试 |
| `scripts/capture-vnext-prototype.cjs` | 原型截图导出 | v0.5 视觉验收截图 |

### 1.4 当前已经具备的能力

代码里已经存在：

```text
general.theme: light | dark | system
general.language: zh | en
general.fontSize: small | medium | large
general.workspaceMode: canvas | pipeline
general.enableReference
general.enableVideo
general.autoSave
```

并且：

- `App.jsx` 会把 `general.theme` 写入 `document.documentElement.dataset.theme`；
- `global.css` 已有 light / dark / system token；
- `Settings.jsx` 已有通用设置折叠区；
- `i18n.js` 已有大量 zh/en key；
- `TitleBar`、`ChatPanel`、`CanvasPanel` 已经接收 `lang`。

所以主题和语言不是新架构，而是**已有偏好层的完善**。

### 1.5 当前必须先修的债务

1. `npm run test:core` 在 Linux 上有已知失败：Windows 路径 basename 安全标签错误；Phase 0 先修。
2. `useTaskQueue.js` 当前任务主要在 React 内存中，重启恢复能力不足。
3. `ChatPanel.jsx` / `CanvasPanel.jsx` 内联样式较多，长期维护成本会上升。
4. 新增文案容易绕过 `i18n.js`，造成中英文不完整。
5. 主题 token 已有，但新增组件可能继续硬编码颜色。
6. `App.jsx` 承担较多编排逻辑，后续应避免继续塞业务细节。

---

## 2. 总体架构

### 2.1 目标结构

```text
┌──────────────── Renderer / React ────────────────┐
│ App.jsx                                           │
│ ├─ Config / theme / lang / font-size bridge        │
│ ├─ Conversation list / active conversation         │
│ ├─ ChatPanel + useChat                             │
│ ├─ CanvasPanel + useCanvas                         │
│ ├─ AssetDetail / AssetCard                         │
│ ├─ TaskQueue + useTaskQueue                        │
│ └─ Settings / Provider / Preferences               │
└──────────────────────┬────────────────────────────┘
                       │ existing IPC
┌──────────────── Main Process ─────────────────────┐
│ electron/config.js                                 │
│ electron/store.js                                  │
│ electron/ipc/conversation.js                       │
│ electron/security/sanitize.js                      │
│ electron/providers/*                               │
│ media-cache / asset-url security                   │
└──────────────────────┬────────────────────────────┘
                       │ HTTP(S) / local provider calls
┌──────────────── Provider Connections ─────────────┐
│ Chat / Image / Video APIs                         │
└───────────────────────────────────────────────────┘
```

### 2.2 架构原则

1. **Conversation 继续是事实单元**：不新增独立项目系统作为 P0 前提。
2. **Asset.generation 是最小来源记录**：不新增完整版本树。
3. **MessageTask 是任务记录**：不新增通用任务平台。
4. **Canvas 是视图与整理工具**：不承担业务执行语义。
5. **Provider connections 继续是能力来源**：不另造能力系统。
6. **general config 是偏好来源**：主题、语言、字号和功能开关进入统一偏好层。
7. **CSS token 是视觉来源**：新增组件不得直接写死主题色。
8. **i18n key 是文案来源**：新增用户可见文案不得散落在组件里。

### 2.3 “优化工作流”的技术定义

这里的“工作流”不是节点引擎，而是用户流程优化：

| 用户流程 | 技术落点 |
|---|---|
| 选择模型前知道是否可用 | Provider constraints / precheck / ModelSelector |
| 输入时知道会带哪些参考 | ChatPanel composer summary |
| 生成时知道状态 | MessageTask + TaskQueue + placeholder Asset |
| 选中结果能继续 | AssetCard / AssetDetail actions |
| 转视频不中断 | useChat video submit + useTaskQueue |
| 重启后能恢复 | persisted MessageTask + queue recreation |
| 错误后知道下一步 | i18n error mapping + user-readable states |

不落点为：新建流程图、新建节点执行器、新建多 Agent 计划器、新建流程数据库。

---

## 3. 偏好系统：主题、语言、字号、工作区形态

### 3.1 数据来源

保持 `electron/config.js` 当前默认：

```js
general: {
  theme: 'light',
  language: 'zh',
  fontSize: 'medium',
  workspaceMode: 'canvas',
  autoSave: true,
  enableVideo: false,
  enableReference: false
}
```

### 3.2 Renderer 应用规则

`App.jsx` 当前逻辑可保留，但需要确保：

```text
config.general.theme      -> document.documentElement.dataset.theme
config.general.fontSize   -> --font-size-base
config.general.language   -> lang prop / t(key, lang)
config.general.workspaceMode -> main workspace projection
```

要求：

- `theme='system'` 时由 CSS `prefers-color-scheme` 生效；
- 语言切换即时刷新，不需要重启；
- 字号切换不能破坏标题栏、工具栏、设置弹窗；
- `workspaceMode='canvas'` 时挂载网格/自由画布；`workspaceMode='pipeline'` 时挂载 Pipeline 主视图；
- Renderer 不得同时挂载 Canvas 主视图和 Pipeline 主视图；
- 切换工作区形态只改变投影，不删除 Conversation、Message、Asset 或 Generation 数据；
- 偏好保存失败要回滚本地 UI 或给出错误。

### 3.3 i18n 规则

| 类型 | 处理 |
|---|---|
| 稳定 UI 文案 | 必须进入 `src/i18n.js` |
| Provider / Model / taskId | 不翻译，只原样显示 |
| 临时错误详情 | 可拼接，但外层说明和下一步进入 i18n |

新增组件验收：

- zh/en 都有 key；
- 中文默认自然，不像直译；
- 英文能表达功能，不强求营销感；
- key 命名按功能域归类，避免重复同义 key。

### 3.4 Theme token 规则

新增样式必须优先使用语义 token：

```css
--bg-workspace
--bg-primary
--bg-elevated
--bg-surface
--bg-hover
--text-primary
--text-secondary
--text-muted
--border-subtle
--border-default
--accent
--accent-soft
--success
--danger
```

不要在组件中直接写死 `#fff`、`#000` 或固定透明黑白；除非是临时媒体 mock 或明确不可主题化内容。

### 3.5 Workspace mode 规则

新增偏好字段：

```ts
type WorkspaceMode = 'canvas' | 'pipeline'
```

持久位置：

```text
config.general.workspaceMode
```

默认值：

```text
canvas
```

规则：

| `workspaceMode` | 主工作区组件 | 必须不显示 |
|---|---|---|
| `canvas` | `CanvasPanel` 的 grid/free canvas 投影 | Pipeline 节点主视图 |
| `pipeline` | 未来 `PipelinePanel` / `PipelineWorkspace` | Grid / Free Canvas / Infinite Canvas |

实现要求：

- 不新增第二套素材数据；Pipeline 模式的节点输出继续引用现有 `Asset` / `Generation`；
- 不把自由画布改造成 Pipeline 执行引擎；
- 不承诺 Pipeline 与自由画布无损互转；
- 设置项进入 `Settings.jsx` 通用偏好区，文案进入 `src/i18n.js`；
- `electron/security/sanitize.js` 和配置合并逻辑必须允许并校验 `workspaceMode`，非法值回退为 `canvas`。

---

## 4. 组件体系

### 4.1 抽象原则

不为了“设计系统”而大搬家。只从三类地方抽：

1. 重复 3 次以上的基础控件；
2. 主题/语言容易不一致的控件；
3. 后续会持续新增状态的控件。

### 4.2 建议组件边界

可逐步新增：

```text
src/components/ui/
├─ Button.jsx
├─ IconButton.jsx
├─ Pill.jsx
├─ Panel.jsx
├─ Toolbar.jsx
├─ EmptyState.jsx
├─ ErrorState.jsx
├─ PreferenceRow.jsx
└─ SectionHeader.jsx
```

这些组件只解决视觉和交互一致性，不持有业务数据。

### 4.3 领域组件职责

| 组件 | 应做 | 不应做 |
|---|---|---|
| `ChatPanel` | 输入、参考图、生成设置、会话操作 | Provider 调用细节、安全存储 |
| `CanvasPanel` | 资产视图、工具栏、选中、拖拽 | 业务流程执行、任务真相 |
| `AssetCard` | 缩略图、状态、主要动作 | 复杂详情和恢复逻辑 |
| `AssetDetail` | 生成说明、关系、继续动作 | 复杂版本树 |
| `Settings` | 偏好和 Provider 设置入口 | 变成独立后台系统 |
| `TaskQueue` | 当前任务状态和恢复入口 | 通用任务平台 |

### 4.4 样式迁移策略

不要一次性把所有 inline style 重写。按风险分批：

1. 先抽按钮、状态标签、面板；
2. 再抽设置表单行；
3. 再抽资产卡片状态；
4. 最后处理布局容器。

每批都要跑：

```bash
npm run typecheck
npm run build
```

涉及行为时还要跑：

```bash
npm run test:core
```

并导出截图确认主题没有破坏。

---

## 5. 数据模型

### 5.1 Conversation 保持 v1

当前存储文件仍为：

```ts
type ConversationStorePayload = {
  schemaVersion?: 1
  conversations: Conversation[]
  activeId: string | null
  deletedIds: string[]
}
```

P0 不新增顶层 `projects` 数组，不改变 `conversations.json` 根结构。

### 5.2 Asset.generation 是最小来源记录

继续使用现有 `Generation`：

```ts
type Generation = {
  prompt?: string
  negativePrompt?: string
  ratio?: string
  resolution?: string
  model?: string
  providerId?: string
  mode?: string
  createdFrom?: string
  duration?: number | string | null
  parentAssetId?: string | null
  sourceAssetIds?: string[]
  promptReferenceAssetIds?: string[]
  taskId?: string | null
}
```

P0 要求：

- 图像和视频 Asset 都尽量写入 `generation`；
- 基于素材继续生成时写 `parentAssetId` 或 `sourceAssetIds`；
- prompt 参考素材写入 `promptReferenceAssetIds`；
- 视频任务完成后生成的 video Asset 写入远程 `taskId`；
- 不持久化 API key、token、cookie、Authorization header。

### 5.3 MessageTask 补强异步恢复字段

P0 允许 additive 字段：

```ts
type MessageTaskP0Additions = {
  providerId?: string
  connectionId?: string
  model?: string
  submittedAt?: string
  lastPolledAt?: string
  recoveredAt?: string
  recoveryStatus?: 'resumable' | 'unknown' | 'not-resumable'
}
```

要求：

- 这些字段必须加入 `sanitizeTask` allowlist；
- 不保存 secrets；
- `connectionId` 只用于重新解析本地连接；
- 连接不存在时标 `not-resumable`；
- 远程状态无法确定时标 `unknown`，不伪造失败。

### 5.4 偏好字段不进入 Conversation

主题、语言、字号、工作区形态是应用偏好，不是创作记录数据。不得写入每个 Conversation。

正确位置：

```text
config.general.theme
config.general.language
config.general.fontSize
config.general.workspaceMode
```

错误位置：

```text
Conversation.theme
Asset.language
Message.locale
Conversation.workspaceMode
```

除非未来真的支持单文档语言快照，否则不要增加这类字段。

---

## 6. 任务与恢复

### 6.1 P0 恢复策略

1. 提交视频任务成功后，立刻更新对应 `MessageTask`：`status`、`taskId`、`queueId`、`providerId`、`connectionId`、`model`、`prompt`、`duration`、`sourceAssetIds`、`submittedAt`。
2. 应用启动或会话加载后，扫描当前会话中可恢复的视频任务。
3. 通过 `connectionId` 重新解析 Provider；无法解析则标 `not-resumable`。
4. 可以解析则创建新的运行态 `VideoQueueTask`，但不依赖旧 callback。
5. 轮询成功后创建 video Asset，更新 MessageTask 为 `done`。
6. 轮询失败后更新 MessageTask 为 `error`，保留 taskId 和错误。
7. 状态不确定时设 `recoveryStatus: 'unknown'`，提示用户检查连接或手动重试。

### 6.2 重试规则

P0 不做多次尝试记录表。重试采用简单规则：

- 原 MessageTask 保留错误；
- 新建一个新的 MessageTask 或在同一消息追加 task；
- 新 task 有新的 `id/queueId/submittedAt`；
- 不覆盖旧 task 的 `taskId/error`。

---

## 7. UI 模块改造范围

### 7.1 `App.jsx`

允许改：会话切换和保存竞态、theme/lang/font-size 应用、`conversationBridge` 辅助方法、启动时恢复视频任务入口、错误提示。

不允许改成：全新 Project store、主进程领域服务客户端、节点流程 renderer、大型全局状态框架。

### 7.2 `ChatPanel.jsx`

允许改：输入栏参考摘要、生成设置视觉整理、任务创建时写完整 MessageTask、生成完成后写完整 Asset.generation、Provider precheck 错误文案、基于资产继续生成的 source/parent 字段、抽出重复按钮和 chip 控件。

不允许改成：Prompt IR 编译器、Agent 编排器、节点执行器。

### 7.3 `CanvasPanel.jsx`

允许改：工具栏布局、网格/自由视图视觉整理、筛选/查看/选中/导入、从选中资产触发动作、抽出 toolbar/asset area/empty state。

不允许改：把画布变成执行图、用画布连线驱动生成逻辑、把任务恢复逻辑塞入画布。

### 7.4 `AssetDetail.jsx` / `AssetCard.jsx`

允许改：展示生成说明、父素材/参考素材、继续生成和图转视频入口、错误/任务状态、主题 token 和 i18n。

不允许改成：复杂版本树、大型来源图编辑器。

### 7.5 `Settings.jsx`

允许改：通用设置更易发现、语言/主题/字号即时保存、Provider 设置页与通用偏好分组更清楚、provider pages 保存状态更清楚。

不允许改成：独立管理后台、新 Provider 预设集合、回显秘密。

---

## 8. 测试策略

### 8.1 必须先恢复基线

Phase 0 第一件事：修复已知 Linux `npm run test:core` 失败。之后基线门禁为：

```bash
npm run test:core
npm run typecheck
npm run build
```

### 8.2 新增/补充测试

1. `sanitizeTask` 保留新增恢复字段，且不保留 secrets；
2. `buildGenerationMeta` 正确写入 parent/source/promptReference/taskId/provider/model；
3. 导出再导入后，Asset.generation 不丢；
4. pending/running 视频 MessageTask 可恢复为运行态轮询任务；
5. 连接缺失时任务标 `not-resumable`；
6. Provider 返回未知状态时不伪造成失败；
7. 重试不会覆盖原任务错误和 taskId；
8. `general.theme/language/fontSize` 保存并重启恢复；
9. `theme='system'` 不退化成固定浅色；
10. 新增 i18n key 同时存在 zh/en；
11. 共享组件在 light/dark 下都可读。

### 8.3 手动验收

- 文本生图；
- 参考图继续生成；
- 图片转视频；
- 视频任务中途关闭并重启；
- 导出/导入项目；
- 删除会话；
- 切换会话后资产不串；
- 切换浅色/深色/system；
- 切换中文/英文；
- 大字号下主界面不明显溢出。

---

## 9. 分阶段实施

### Phase 0：恢复工程基线

- 修复 `npm run test:core` 已知失败；
- 确认 `typecheck/build` 通过；
- 锁定 v0.5 文档和原型；
- 清理任何仍暗示新平台重构的 P0 文案。

### Phase 1：偏好系统和设计 token

- 验证 theme/language/fontSize/workspaceMode 保存、生效和重启恢复；
- 补齐 `system` 主题行为；
- 补齐主路径 i18n；
- 定义基础 Button/Pill/Panel/PreferenceRow 样式；
- 截图验证 light/dark。

### Phase 2：创作流程打磨

- 输入栏显示当前参考摘要；
- 资产卡片动作更直接；
- AssetDetail 展示生成说明；
- 失败和未知状态提供下一步；
- 图转视频路径更短。

### Phase 3：生成元数据与视频恢复

- 检查所有图像/视频 Asset 创建路径；
- 补齐 `Asset.generation`；
- 扩展 `MessageTask` additive 字段；
- 扩展 sanitizer allowlist；
- 启动/加载会话时恢复轮询；
- 不可恢复时明确标记。

### Phase 4：组件与维护性整理

- 从按钮、状态标签、面板开始抽共享组件；
- 再抽设置表单和资产卡状态；
- 减少重复 inline style；
- 保持小步提交，每步验证截图和测试。

---

## 10. Definition of Done

v0.5 P0/P0.5 完成必须满足：

- 没有新增独立项目、分支、节点流程、Agent 或通用任务系统；
- `conversations.json` 仍兼容旧数据；
- 文本生图、参考图继续生成、图转视频完整可用；
- 视频任务重启后能恢复或明确 unknown/not-resumable；
- AssetDetail 能解释作品怎么来的；
- import/export 保留 P0 必需元数据；
- secrets 不进入 Conversation/Asset/MessageTask；
- 主题 light/dark/system 可用；
- 中文/英文主路径可用；
- 工作区形态 `canvas/pipeline` 互斥渲染，非法值回退 `canvas`；
- 新增组件使用 token 和 i18n；
- `npm run test:core`、`npm run typecheck`、`npm run build` 通过。

---

## 11. Plan B

如果完整视频任务恢复牵扯过大，退一步：

1. 提交视频后至少保存 `taskId/provider/model/prompt/sourceAssetIds` 到 MessageTask；
2. 重启后不自动轮询，只显示“有未完成远程任务，可手动检查”；
3. 提供“重新查询状态”按钮；
4. 查询成功再创建 video Asset；
5. 查询失败保持 unknown。

如果完整组件抽象牵扯过大，退一步：

1. 只先抽 `Button/Pill/Panel`；
2. 不碰业务逻辑；
3. 用现有 UI 截图做视觉回归；
4. 后续每改一个模块抽一小块。

如果 i18n 补齐工作量过大，退一步：

1. 先覆盖主路径；
2. 设置页和错误文案第二批；
3. Provider 技术字段保持原文；
4. 禁止新增硬编码中文/英文。
