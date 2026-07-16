# Gravuresse vNext 技术规格（SPEC）

> 状态：Baseline v0.3（Simple First 对抗式审查后收敛）
> 日期：2026-07-16
> 对应 PRD：`docs/PRD.md`
> 目标：把 Gravuresse 现有 Electron 应用增量升级为“默认简单创作路径 + 高级可展开的领域能力”的本地优先创意工作台。工程层保留 Project/Thread/Workflow/Canvas/Lineage/TaskRun 等完整模型；Renderer 默认只投影“描述 → 生成 → 选择 → 修改”的用户主路径。

---

## 1. 当前系统基线

### 1.1 已确认技术栈

- Electron 42；
- React 18；
- electron-vite / Vite 7；
- Node.js >= 22.12；
- JavaScript 主体 + TypeScript 类型边界；
- `node:test` + 现有核心测试脚本；
- 本地 JSON 存储、媒体缓存和 `.gravuresse.json` 导入导出。

### 1.2 可复用能力

当前仓库已经具备以下基础，不应重写：

| 能力 | 现有位置 | vNext 处理 |
|---|---|---|
| Provider registry / handler / config resolver | `electron/providers/` | 保留，抽象 capability snapshot 和 recipe adapter |
| 主进程密钥解析与 IPC allowlist | `electron/providers/config-resolver.js` | 保留并扩展，renderer 不获得明文密钥 |
| 连接拉模型和真实验证 | Provider connections 相关模块 | 作为 Capability Resolver 数据源 |
| 会话与消息/素材保存 | `electron/store.js`、`src/utils/conversationStore.js` | 迁移到 ProjectStore v2 |
| 图像/视频生成元数据 | `src/utils/generationTasks.js` | 扩展为冻结 Recipe 与 Lineage |
| 无限画布、缩放、工具、素材 | `CanvasPanel.jsx`、`useCanvas.js` | 变为 CanvasDocument，引用 Workflow 与 Artifact |
| 视频异步任务队列 | `useTaskQueue.js`、Provider submit/poll | 迁入 Persistent TaskOrchestrator |
| 项目/会话导入导出 | `electron/ipc/conversation.js` | 升级 schema，兼容 v1 |

### 1.3 当前所有权与恢复债务

以下是 vNext 开工前必须承认的当前事实：

- `src/hooks/useTaskQueue.js` 以 React state、timer、Set 和 callback closure 保存视频任务；Renderer 卸载或应用退出后不可恢复；
- `electron/main.js` 的 `videoPollSessions` 也是带 TTL 的内存 `Map`，不是持久任务事实源；
- `electron/security/sanitize.js` 只允许 v1 Conversation 的已知扁平字段，若先从 UI 写入 Project/Thread/Graph/Snapshot，新字段会被清洗掉；
- `electron/providers/pipeline.js` 是 Provider 请求分发链，与产品里的 Workflow Pipeline 不是同一概念；目标代码中分别命名为 `ProviderCallDispatcher` 与 `WorkflowGraphService`；
- 当前 `npm run test:core` 在 Linux 上失败于 `scripts/core-tests/ipc.mjs:590`：Windows 路径 `C:\\private\\photo.png` 的安全标签得到 `C:\\private\\photo` 而非 `photo`；Phase 0 必须先修复并建立全绿基线；
- 现有 Renderer 仍持有会话、画布、任务和生成编排的多个可写副本。迁移完成后，主进程 Application Core 是 Project、TaskRun、ContextSnapshot 和 Lineage 的唯一权威写入者。

### 1.4 不采用的方案

- 不在本阶段引入云端数据库；
- 不把所有状态塞入单个 React `App.jsx`；
- 不为每个 Provider 编写独立 UI 页面；
- 不使用“把所有会话全文拼给模型”实现上下文；
- 不维护步骤视图和画布两份独立业务数据；
- 不立即引入 SQLite，除非真实项目规模证明 JSON 分片无法满足性能。

---

## 2. 总体架构

```text
┌──────────────── Renderer / React ────────────────┐
│ Simple Creation Shell                             │
│ ├─ Start / Guided Step Projection                 │
│ ├─ Collapsible Creation Record                    │
│ ├─ Candidate Gallery / Simple Edit Panel          │
│ ├─ Optional Advanced Canvas Projection            │
│ └─ Collapsed Details: Settings / Source / Evidence│
└──────────────────────┬────────────────────────────┘
                       │ Typed & validated IPC
┌──────────────── Main Process Application Core ──┐
│ Project / Thread Service                         │
│ WorkflowGraph Service / projection               │
│ ContextSnapshot Service                          │
│ TaskOrchestrator / persistent Attempt journal    │
│ Capability Resolver / ProviderCallDispatcher     │
│ Recipe / ArtifactRevision / Lineage Service      │
│ Security / Redaction / Import-Export              │
└──────────────────────┬────────────────────────────┘
                       │ HTTP(S) / local endpoints
┌──────────────── Provider Connections ─────────────┐
│ Chat / Image / Video APIs                         │
└───────────────────────────────────────────────────┘
```

### 2.1 架构原则

1. **主进程持有副作用与领域真相**：Project、Thread、TaskRun、Attempt、ContextSnapshot、Lineage、密钥、网络、文件、迁移和导出均由主进程 Application Core 权威写入。
2. **Simple First 是 UI 投影契约，不是领域模型缩水**：Renderer 默认只展示“开始创作、步骤视图、候选、简单修改、本轮参考、详情折叠”；WorkflowGraph、CanvasDocument、LineageGraph、CapabilityResolution 等仍在领域层完整存在。
3. **Renderer 发送声明式意图**：只发送实体 ID、expectedRevision 和允许字段；输入框、选中、缩放、面板开关等临时 ViewState 可留在 Renderer。
4. **同一执行模型，三类图/文档分离**：步骤视图与自由画布引用同一 WorkflowGraph 节点；CanvasDocument 只保存空间编排；LineageGraph 记录实际运行历史，不用一张“万能图”承载三种语义。
5. **先冻结执行链，再调用 Provider**：ContextSnapshot、CapabilityResolution、Recipe/ExecutionPlan、TaskRun 与 Attempt 在外部调用前按顺序落盘。
6. **上下文可复核但默认一行摘要**：执行使用不可变 ContextSnapshot；UI 默认展示“本轮参考”摘要，展开后才显示 ContextManifest 来源与排除原因。
7. **错误也是记录**：失败或未知 Attempt 保留配方、连接证据、错误代码和重试来源。

### 2.2 权威所有权表

| 状态 | 权威所有者 | Renderer 允许保留 |
|---|---|---|
| Project / Thread / Message DAG | Main Application Core | 查询投影、编辑草稿 |
| WorkflowGraph / CanvasDocument | Main Application Core | selection、viewport、拖拽中的临时坐标 |
| TaskRun / Attempt / 远程任务 ID | Main TaskOrchestrator | 只读队列投影 |
| ContextSnapshot / Lineage | Main domain services | 可视化 Manifest / overlay |
| Connection / credential | Main config resolver / OS vault | 脱敏状态与 connectionId |

任何来自 Renderer 的写命令都必须包含 project scope 和 `expectedRevision`；冲突返回显式错误，不允许最后写入者静默覆盖。

### 2.3 Simple First UI 投影契约

工程对象可以完整，默认 UI 投影必须收敛为以下对象：

```ts
type StartProjection = {
  recentProjects: Array<{ projectId: string; title: string; thumbnail?: string }>
  primaryAction: 'start-creation'
  secondaryActions: Array<'import-project' | 'open-connections' | 'open-advanced-canvas'>
}

type GuidedStepProjection = {
  projectId: string
  activeThreadId: string
  steps: Array<{
    kind: 'describe' | 'brief' | 'generate' | 'select' | 'edit' | 'export-or-video'
    label: string
    question: string
    status: 'idle' | 'ready' | 'running' | 'complete' | 'blocked' | 'error'
    primaryAction?: string
    workflowNodeIds: string[]
  }>
  selectedArtifactRevisionId?: string
  contextSummary: ContextSummaryProjection
}

type ContextSummaryProjection = {
  label: string // 例：“本轮参考：创作说明 · 当前记录 · 2 张参考图”
  snapshotId?: string
  expandable: boolean
}
```

投影规则：

- 首页只暴露一个主操作 `start-creation`；不得要求用户先选择 Pipeline / Canvas；
- `GuidedStepProjection` 是 `WorkflowGraph` 的受限投影，用户界面称为“步骤视图 / 创作步骤”；
- `CanvasDocument` 只通过“高级：展开为自由画布”进入；
- `Recipe`、`LineageGraph`、`CapabilityResolution`、`Attempt` 默认只形成详情数据，不作为常驻面板；
- Renderer 不得把内部类型名直接渲染为面向用户的标签，除非在开发者/调试详情中。

---

## 3. 领域模型

建议把 vNext 核心类型从 `src/types/domain.ts` 中逐步拆到 `shared/domain/`，主进程和 renderer 共享纯类型/校验逻辑；迁移期间保留 re-export，避免一次性改完所有 import。

### 3.1 Project

```ts
type ProjectMode = 'guided' | 'canvas' // UI 默认 guided；内部可由 GuidedStepProjection 投影 WorkflowGraph

type Project = {
  id: string
  schemaVersion: 2
  title: string
  description?: string
  preferredMode: ProjectMode
  briefId?: string
  workflowGraphId: string
  canvasDocumentId: string
  threadIds: string[]
  memoryEntryIds: string[]
  defaultConnections: Partial<Record<'chat' | 'image' | 'video', ConnectionSelection>>
  createdAt: string
  updatedAt: string
  revision: number
}
```

### 3.2 CreativeBrief

```ts
type CreativeBrief = {
  id: string
  projectId: string
  version: number
  goal: string
  subject: string[]
  environment: string[]
  composition: string[]
  camera: string[]
  actionAndTime: string[]
  styleAndMaterial: string[]
  lightingAndColor: string[]
  mustKeep: Constraint[]
  mustAvoid: Constraint[]
  referenceAssetIds: string[]
  unresolvedQuestions: string[]
  status: 'draft' | 'confirmed' | 'superseded'
  createdFrom: Provenance
  createdAt: string
}
```

Brief 不直接存 Provider-specific prompt。模型适配由 Prompt Adapter 在创建 Recipe 时完成。

### 3.3 Thread、Message DAG 与上下文

```ts
type Thread = {
  id: string
  projectId: string
  title: string
  rootMessageId?: string
  activeHeadMessageId?: string
  headMessageIds: string[]
  privateMemoryEntryIds: string[]
  snapshotIds: string[]
  activeBriefId?: string
  createdAt: string
  updatedAt: string
  revision: number
}

type Message = {
  id: string
  threadId: string
  parentMessageId?: string
  role: 'user' | 'assistant' | 'tool'
  blocks: MessageBlock[]
  createdAt: string
}
```

分支通过 `parentMessageId` 追加新子消息形成 DAG，不复制整段 Conversation；`messages[]` 只是 UI 投影，不是领域真相。

```ts
type ContextEntry = {
  id: string
  projectId: string
  scope: 'project' | 'conversation'
  conversationId?: string
  kind: 'fact' | 'constraint' | 'decision' | 'summary' | 'reference'
  content: string
  sourceRefs: SourceRef[]
  version: number
  pinned: boolean
  supersedes?: string
  createdAt: string
}
```

### 3.4 WorkflowGraph、CanvasDocument 与 LineageGraph

```ts
type WorkflowNodeKind =
  | 'brief.compile'
  | 'prompt.plan'
  | 'image.generate'
  | 'image.edit'
  | 'video.generate'
  | 'select'
  | 'export'
  | 'agent.step'

type WorkflowGraph = {
  id: string
  projectId: string
  revision: number
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

type CanvasItem = {
  id: string
  kind: 'workflow-ref' | 'artifact-revision-ref' | 'brief-ref' | 'thread-ref' | 'note' | 'group'
  refId?: string
  position: { x: number; y: number }
  size?: { width: number; height: number }
}

type CanvasDocument = {
  id: string
  projectId: string
  revision: number
  items: CanvasItem[]
  viewport: { x: number; y: number; zoom: number }
}

type LineageGraph = {
  projectId: string
  artifactRevisionIds: string[]
  edges: LineageEdge[]
}
```

语义边界：

- `WorkflowGraph`：用户想执行什么；`GuidedStepProjection` 只投影可表示的 Workflow 节点/依赖；
- `CanvasDocument`：Workflow、Artifact、Brief、Thread、便签和分组如何在空间中摆放；坐标、选中和 viewport 不进入执行语义；
- `LineageGraph`：历史上实际执行了什么、产生了哪些不可变 ArtifactRevision；同一 WorkflowNode 可以运行多次并产生多个谱系分支；
- TaskRun、Artifact、AgentRun、便签不能被强行伪装成同一种 WorkflowNode；Canvas 通过稳定 `refId` 同时展示三类对象。

### 3.5 GenerationRecipe

```ts
type GenerationRecipe = {
  id: string
  projectId: string
  conversationId: string
  briefId?: string
  briefVersion?: number
  operation: 'text_to_image' | 'image_edit' | 'text_to_video' | 'image_to_video'
  connectionId: string
  modelId: string
  providerRuntimeId: string
  capabilityResolutionId: string
  prompt: string
  negativePrompt?: string
  ratio?: string
  resolution?: string
  durationSeconds?: number
  seed?: string
  sourceAssetIds: string[]
  referenceAssetIds: string[]
  maskAssetId?: string
  locks: StabilityLock[]
  extraParams: Record<string, unknown>
  contextSnapshotId?: string
  parentRecipeId?: string
  userChangeRequest?: string
  promptDiff?: PromptDiff
  hash: string
  createdBy: 'user' | 'agent'
  createdAt: string
}
```

`hash` 由规范化 JSON 计算，字段排序固定；不得包含密钥、临时签名 URL 或不可稳定序列化对象。

### 3.6 AssetRevision 与 Lineage

现有可变 `Asset.generation` 逐步迁移为“稳定资产身份 + 不可变内容版本”：

```ts
type Asset = {
  id: string
  projectId: string
  type: 'image' | 'video' | 'mask' | 'reference'
  currentRevisionId: string
  tags: string[]
  createdAt: string
}

type ArtifactRevision = {
  id: string
  assetId: string
  blobRef: { sha256: string; mime: string; size: number; storageUri: string }
  createdByTaskRunId?: string
  createdByAttemptId?: string
  recipeId?: string
  status: 'ready' | 'missing' | 'failed' | 'legacy'
  createdAt: string
}

type LineageEdge = {
  id: string
  fromRevisionId: string
  toRevisionId: string
  role: 'base' | 'mask' | 'reference' | 'control' | 'first-frame' | 'derived'
  operation: GenerationRecipe['operation'] | 'crop' | 'export'
  recipeId?: string
  taskRunId?: string
  createdAt: string
}
```

历史版本不可就地改写。删除默认软删除引用；若 Blob 仍被其他 revision/项目使用，不得物理删除。临时签名 URL 不能作为唯一事实源。

### 3.7 AgentRun

```ts
type AgentRun = {
  id: string
  projectId: string
  conversationId: string
  plan: AgentStep[]
  status: 'planned' | 'waiting_confirmation' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  budget: {
    maxCalls: number
    maxParallel: number
    maxIterations: number
    estimatedCost?: number
  }
  contextSnapshotId: string
  outputs: AgentArtifactRef[]
  startedAt?: string
  completedAt?: string
}
```

Agent 间只传结构化 artifact 和引用，不把全部自然语言思考链写入项目。日志保存任务输入、输出摘要、错误和模型证据，不保存隐藏推理。

---

## 4. 项目存储与迁移

### 4.1 建议目录

```text
<userData>/Gravuresse/
├── index.json
├── projects/
│   └── <projectId>/
│       ├── project.json
│       ├── entities/
│       │   ├── threads.json
│       │   ├── messages.jsonl
│       │   ├── briefs.json
│       │   ├── workflow.json
│       │   ├── canvas.json
│       │   ├── recipes.jsonl
│       │   ├── task-runs.jsonl
│       │   ├── attempts.jsonl
│       │   ├── artifact-revisions.jsonl
│       │   ├── lineage.jsonl
│       │   ├── agent-runs.jsonl
│       │   └── context-snapshots.jsonl
│       ├── media/
│       ├── thumbnails/
│       └── backups/
├── connections.json
└── migrations/
```

### 4.2 存储策略

- `project.json` 小且原子写入；
- 追加型历史使用 JSONL，避免每次重写整个项目；
- 媒体按 hash 或稳定 ID 保存；
- 写入使用 temp file + fsync/rename；
- Project 带 `revision`，renderer 更新时附 `expectedRevision`；
- 冲突返回 `REVISION_CONFLICT`，不得静默后写覆盖先写；
- 每次 migration 前备份旧 store。

### 4.3 v1 → v2 迁移（sanitizer-first）

1. 冻结 v1 ID、schema 和导入 fixture；先实现 v1/v2 reader、v2 writer 与 v2 sanitizer，禁止 UI 先写新字段；
2. 迁移前备份原 store，并保存文件 checksum；
3. 检测现有 `conversations.json`，创建一个“已迁移项目”；
4. 每个旧 Conversation 变为 Thread，扁平消息按原顺序回填为线性 `parentMessageId` 链；
5. 旧 Asset 建立稳定 Asset 与初始 ArtifactRevision；已有 generation 元数据尽可能转换为基础 Recipe/Lineage；
6. 缺失字段保持 `unknown` 或 `legacy/record-only`，不得伪造 seed、model revision 或输入角色；
7. 写入 v2 后重新读取，校验实体数量、ID、内容 hash 与引用完整性；
8. migrator 必须幂等：同一 fixture 重复迁移得到相同语义 hash；
9. 校验通过后由 v2 单写并在 index 标记完成；保留 v1 只读备份，不长期双写；
10. 迁移失败回滚，不覆盖 v1。

---

## 5. 步骤视图与自由画布

### 5.1 GuidedStepProjection 是 WorkflowGraph 的受限投影

默认步骤模板：

```text
describe → brief → generate → select → edit → export-or-video
```

每个 GuidedStep 映射一组 WorkflowNode。用户界面显示“步骤视图/创作步骤”，内部仍可使用 projection service：

```ts
type GuidedStep = {
  id: string
  kind: 'describe' | 'brief' | 'generate-image' | 'select-edit' | 'generate-video' | 'export'
  label: string
  question: string
  workflowNodeIds: string[]
  inputEdgeIds: string[]
  outputEdgeIds: string[]
  optional: boolean
  status: 'idle' | 'ready' | 'running' | 'blocked' | 'complete' | 'error'
}
```

约束：

- 新项目默认创建 `preferredMode = 'guided'`；
- 首页不得暴露“选择 Pipeline 或 Canvas”的分叉；
- 自由画布入口文案为“高级：展开为自由画布”；
- 多候选、任务状态和来源记录仍写入领域模型，但步骤视图只展示当前步骤需要的最小信息；
- 技术名 `Pipeline` 可留在代码或迁移注释中，但用户标签必须使用“步骤视图 / 创作步骤”。

### 5.2 投影与可表示性规则

- `expandToCanvas()` 只为同一 WorkflowNode 创建/更新 CanvasItem 引用，不复制节点；
- **步骤视图 → 自由画布可无损展开**：semantic node/edge ID 不变，只有 CanvasDocument 布局变化；
- **自由画布 → 步骤视图不是无条件双向无损**：先执行 `checkGuidedStepRepresentability(workflowGraph)`；
- 检查结果为 `exact | grouped | unavailable`，并返回无法线性排序、循环、动态分支或未知 operation 等原因；
- `exact` 可编辑；`grouped` 以分组/只读步骤显示；`unavailable` 保留 Canvas 与 Workflow 原数据，只阻止破坏性压平；
- Artifact、便签、Thread 引用等 Canvas-only item 始终保留在 CanvasDocument，不伪装成步骤执行节点；
- 步骤顺序由 projection 中的 step order 决定；
- 删除 WorkflowNode 前检查 TaskRun/Lineage 与下游依赖，默认软删除；
- 坐标、viewport、selection、group layout 属于 Canvas/View state，不属于 Recipe 或 Workflow 语义。

### 5.3 状态一致性

- WorkflowGraph 与 CanvasDocument 修改必须走主进程 command service，不允许两个 UI 各自操作数组；
- 所有语义节点、Canvas 引用和谱系 revision 有稳定 ID；
- UI derived state 不写回领域对象；
- Undo/redo 记录领域 command 与预期 revision，不保存整个 React state 快照；
- TaskRun/Attempt 状态由主进程事件驱动，Renderer 不自行猜测完成；
- 自动化测试比较 Workflow semantic hash，而不是比较坐标或视觉顺序。

---

## 6. 上下文系统

### 6.1 ContextSnapshot 与 ContextManifest

每次 chat/agent 调用前，由主进程冻结不可变执行输入：

```ts
type ContextSnapshot = {
  id: string
  projectId: string
  threadId: string
  branchHeadMessageId?: string
  resolverVersion: string
  policyVersion: string
  orderedEntries: Array<{
    sourceType: 'system' | 'project-brief' | 'project-memory' | 'thread-message' | 'thread-summary' | 'referenced-snapshot' | 'artifact-revision'
    sourceId: string
    sourceRevision?: number
    contentHash: string
    includedRange?: { start: number; end: number }
    truncationReason?: string
    content?: string
    blobRef?: string
  }>
  exclusions: Array<{ sourceId: string; reason: string }>
  tokenEstimate?: number
  hash: string
  createdAt: string
}

type ContextManifest = {
  snapshotId: string
  entries: Array<{ sourceType: string; sourceId: string; label: string; included: boolean; reason?: string }>
  summaryLabel: string
  hiddenByDefault: true
}
```

`ContextSnapshot` 是 TaskRun/AgentRun 的冻结输入；`ContextManifest` 是其可读投影。Snapshot 冻结后，执行路径不得再读取活动 Thread、实时 Canvas 或当前选择。相同 project revision、policy 和输入顺序必须得到相同 hash。

默认 UI 只显示 `summaryLabel`，例如“本轮参考：创作说明 · 当前记录 · 2 张参考图”。只有用户展开“查看本轮参考”时才渲染 entries、排除原因和 token 预算。

### 6.2 组装顺序

1. 安全与产品系统约束；
2. 当前确认版 CreativeBrief；
3. 用户 Pin 的项目约束/事实；
4. 当前任务直接引用的素材与配方；
5. 当前 Thread 从 root 到 active head 的消息路径；
6. 当前 Thread 较早消息的版本化摘要；
7. 用户显式引用的其他会话快照；
8. 低优先级背景。

超过预算时从低优先级项开始排除，并记录原因。不得静默把其他会话全文注入。

### 6.3 摘要策略

- 原始消息永久保留；
- 摘要带 source message range、模型、时间、版本和 hash；
- 用户可编辑/拒绝/重建摘要；
- 新摘要不能覆盖旧摘要，只能 supersede；
- 影响关键约束的摘要必须进入“待确认”状态。

### 6.4 Branch / Pin / Reference

- 内部 Branch 记录父会话与分叉消息；用户界面标签为“另开方向”；
- Pin 创建项目级 ContextEntry，必须显示来源；
- Reference 只引用指定 snapshot，不继承后续变化；用户界面标签为“引用另一条记录”；
- Merge brief 产生新 Brief 版本，并展示字段级 diff；用户界面标签为“合并创作说明”。

---

## 7. 助手执行与 P1 协作 / Prompt IR

### 7.1 Agent 是内部执行单元，UI 显示为“助手”

Agent 以可测试的函数职责存在；Renderer 默认只展示阶段 label、状态、产物摘要和停止按钮，不展示内部思维链、角色群聊或完整任务图。

| Step type | 输入 | 输出 |
|---|---|---|
| `intent.extract` | 用户描述、参考素材 | Brief 草稿、待确认问题 |
| `prompt.propose` | 确认 Brief、目标 operation | PromptPlan 候选 |
| `continuity.check` | Brief、锁定项、父 Recipe | 约束冲突和修订建议 |
| `capability.adapt` | PromptPlan、CapabilityResolution | Provider 可执行 Recipe 草稿 |
| `candidate.critique` | 候选缩略图/元数据、Brief | 差异与风险，不自动判定“美” |
| `motion.plan` | 图像、Brief、视频目标 | 镜头/动作/节奏计划 |

默认 UI 投影：

```ts
type AssistantRunProjection = {
  runId: string
  label: string // 例：“助手正在准备两个方向”
  steps: Array<{ label: string; status: 'pending' | 'running' | 'done' | 'blocked' | 'error' }>
  canStop: boolean
  detailsHiddenByDefault: true
}
```

### 7.2 Orchestration Engine

建议新增：

```text
electron/application/orchestration/
├── planner.js
├── runner.js
├── scheduler.js
├── budget.js
├── artifacts.js
└── steps/
```

执行约束：
- P0 默认 `maxParallel = 1`，由单协调 Agent 顺序执行；P1 在任务恢复和成本门禁成熟后最多开放 3 个受控并行步骤；
- 计划生成后先返回 Renderer 确认；
- 每步只读取冻结的 ContextSnapshot；
- Agent 只能产生领域 Intent/Artifact，不能直接读取凭据、调用网络或绕过 CapabilityResolver / TaskOrchestrator；
- 输出必须通过 schema 校验；
- P1 启用并行候选时，所有候选完成或触发部分失败策略后才进入合并/批判步骤；
- 支持 cancel token；
- 重试按 step 记录，不覆盖原结果；
- 达到调用次数/预算/时间上限立即暂停；
- 简单 prompt 改写只调用单 Agent。

### 7.3 Prompt IR

```ts
type PromptPlan = {
  id: string
  briefId: string
  operation: GenerationRecipe['operation']
  semanticBlocks: {
    subject: string
    environment: string
    composition: string
    camera: string
    action: string
    lighting: string
    style: string
    quality: string
    negatives: string
  }
  locks: StabilityLock[]
  adapterHints: Record<string, unknown>
}
```

Adapter 把 PromptPlan 转为具体模型 prompt。不能反向把 Provider 文法污染 Brief。

---

## 8. 简单修改与高级透明度

### 8.1 同一 Recipe，不同 UI 暴露级别

三种透明度级别不维护不同数据模型，也不默认作为三标签出现在首屏。默认 UI 是 `SimpleEditProjection`：

```ts
type SimpleEditProjection = {
  artifactRevisionId: string
  keep: Array<{ label: string; source: 'user' | 'assistant' }>
  change: Array<{ label: string; source: 'user' | 'assistant' }>
  primaryAction: 'generate-variation'
  advancedAvailable: boolean
}
```

内部透明度级别：

- **simple / black-box**：用户变更请求 + 系统生成的“改变/保持”摘要；
- **semantic / gray-box**：语义块、变化强度、稳定锁、参考权重；
- **technical / white-box**：完整 Recipe、prompt diff、能力快照和 Provider 参数。

默认规则：

- 未点“高级设置”前，只显示 keep/change、生成修改版和取消；
- ReproducibilityAssessment 默认汇总为“可重做程度”，不在主屏显示 `MEDIUM/LOW` 英文状态；
- 任何白盒字段必须来自 CapabilityResolution 与 Recipe，不得伪造默认值。

### 8.2 StabilityLock

```ts
type StabilityDimension = 'subject' | 'identity' | 'composition' | 'camera' | 'environment' | 'style' | 'lighting' | 'palette'

type StabilityLock = {
  dimension: StabilityDimension
  strength: 'prefer' | 'strict'
  source: 'user' | 'agent'
  referenceAssetIds?: string[]
  textConstraint?: string
}
```

`strict` 只是产品约束，不代表模型保证。默认 UI 文案使用“尽量保持/严格参考”，不使用“100%锁定”。Adapter 根据能力映射为：
- prompt constraint；
- reference image；
- mask；
- seed；
- Provider 特有控制参数；
- 若无法映射，显示“当前模型无法严格执行”。

### 8.3 ReproducibilityAssessment

```ts
type ReproducibilityAssessment = {
  level: 'exact' | 'seeded' | 'recipe' | 'record-only'
  confidence: 'high' | 'medium' | 'low'
  factors: Array<{
    name: string
    status: 'present' | 'missing' | 'unstable'
    explanation: string
  }>
}
```

等级定义：

- **exact**：固定源字节上的确定性本地运算；
- **seeded**：固定 seed 与 model revision，但一致性仍受执行端保证；
- **recipe**：输入、请求和有效参数可完整重放，输出只保证 best effort；
- **record-only**：历史可审计，但原能力或关键依赖不可用。

远程生成默认最多承诺 `recipe`，不能仅因存在 seed 就标为 exact。`confidence` 用于高级详情的高/中/低摘要：模型版本、seed 接受证据、参数、ContextSnapshot 与参考素材 hash 越完整，可信度越高。默认主路径只显示人话状态，例如“可按当前设置再试一次，但结果可能有差异”；UI 不显示伪精确百分比。

---

## 9. 连接能力与生成任务

### 9.1 模型级能力协商

连接验证后记录模型级 Offer；每次任务以 Requirement 匹配并冻结 Resolution：

```ts
type CapabilityOffer = {
  connectionId: string
  connectionRevision: string
  inventoryRevision: string
  modelId: string
  modelRevision?: string
  operations: Array<'chat.complete' | 'image.generate' | 'image.edit' | 'video.generate' | 'video.from-image'>
  inputKinds: Array<'text' | 'image' | 'mask' | 'video'>
  outputKinds: Array<'text' | 'image' | 'video'>
  optionSchema: Record<string, JsonSchema>
  limits: Record<string, number | string | boolean>
  asyncMode: 'sync' | 'submit-poll' | 'either'
  validationEvidence: ValidationEvidence
  verifiedAt: string
}

type CapabilityRequirement = {
  operation: CapabilityOffer['operations'][number]
  inputKinds: CapabilityOffer['inputKinds']
  outputKind: CapabilityOffer['outputKinds'][number]
  requiredOptions: Record<string, unknown>
}

type CapabilityResolution = {
  id: string
  requirement: CapabilityRequirement
  offer: CapabilityOffer
  requestedParams: Record<string, unknown>
  effectiveParams: Record<string, unknown>
  warnings: string[]
  snapshotHash: string
  createdAt: string
}
```

选择顺序：用户显式固定 > 项目默认 > 应用默认。主进程是能力真相；Renderer 提示不构成证据。重试或复现不得静默切换 connection/model；原 Offer 不可用时 TaskRun 进入 `blocked`，要求用户显式重新选择。参数归一化只走一个主进程 compiler/dry-run。

### 9.2 连接向导与技术详情

默认连接页由 `ConnectionWizardProjection` 驱动：

```ts
type ConnectionWizardProjection = {
  actions: Array<'add-chat' | 'add-image' | 'add-video'>
  connections: Array<{
    connectionId: string
    displayName: string
    status: 'not-configured' | 'needs-verification' | 'ready' | 'error'
    capabilities: Array<'can-chat' | 'can-generate-image' | 'can-edit-image' | 'can-generate-video' | 'can-video-from-image'>
    lastVerifiedAt?: string
    technicalDetailsHiddenByDefault: true
  }>
}
```

策略：

- UI 主路径围绕“添加连接”和能力验证，不围绕 Provider logo 列表；
- 默认列表只显示“可对话 / 可生成图 / 可编辑图 / 可生成视频”等能力与验证状态；
- endpoint、model revision、latency、Bearer、请求模板等字段只在“技术详情”中显示；
- 保留现有 registry 作为兼容和 handler metadata；
- 新接入优先使用 OpenAI-compatible 或通用请求模板；
- 不在 vNext 文档里增加新的预设 Provider；
- 已保存密钥与 baseUrl 绑定，renderer supplied baseUrl 不得复用旧密钥；
- Provider 特有字段只进入 `extraParams.<namespace>`。

### 9.3 Persistent TaskOrchestrator

图像、视频和 Agent 外部调用统一为持久执行链：

```ts
type TaskRun = {
  id: string
  projectId: string
  recipeId: string
  executionPlanId: string
  status: 'draft' | 'blocked' | 'ready' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown'
  activeAttemptId?: string
  attemptIds: string[]
  outputRevisionIds: string[]
  createdAt: string
  updatedAt: string
}

type Attempt = {
  id: string
  taskRunId: string
  sequence: number
  capabilityResolutionId: string
  status: 'submitting' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown'
  providerTaskId?: string
  idempotencyKey?: string
  requestedAt: string
  completedAt?: string
  error?: SafeError
}
```

执行顺序：

```text
OperationIntent
→ ContextSnapshot.freeze
→ CapabilityResolution.freeze
→ Recipe / ExecutionPlan.freeze
→ TaskRun.persist
→ Attempt.persist
→ submit/generate
→ persist providerTaskId immediately
→ poll or await
→ validate response
→ cache media
→ create ArtifactRevision + LineageEdge
→ complete Attempt / TaskRun
```

规则：

- 主进程 TaskOrchestrator 是唯一任务事实源；现有 `useTaskQueue` 只在迁移期作为 UI 投影，不能继续保存 callback 行为；
- 每次 retry 新建 Attempt，旧 Attempt 不改写；
- `providerTaskId` 返回后立即持久化，重启后恢复轮询；
- 同步调用崩溃且无法确认是否成功时标为 `unknown`，禁止自动重复提交；
- idempotency key 只在 Adapter 明确支持时使用；
- 同一 Attempt 的完成事件只能创建一次 ArtifactRevision。

---

## 10. IPC 设计

新增通道建议：

### Project
- `project:list`
- `project:create`
- `project:open`
- `project:patch`
- `project:export`
- `project:import`

### Context / Thread
- `thread:fork`
- `thread:listHeads`
- `context:preview`
- `context:pin`
- `context:referenceSnapshot`
- `context:rebuildSummary`

### Workflow / Canvas
- `workflow:get`
- `workflow:applyCommands`
- `workflow:checkRepresentability`
- `pipeline:getProjection`
- `pipeline:expandToCanvas`
- `canvas:get`
- `canvas:applyCommands`

### Agent
- `agent:plan`
- `agent:run`
- `agent:pause`
- `agent:cancel`
- `agent:events`

### Recipe / Task / Artifact
- `recipe:createDraft`
- `recipe:freeze`
- `recipe:diff`
- `recipe:reproduce`
- `task:enqueue`
- `task:get`
- `task:list`
- `task:cancel`
- `task:retry`
- `task:events`
- `artifact:getLineage`

### IPC 约束

- 每个 payload 运行时 schema 校验；
- ID 和 enum 使用 allowlist；
- 文本、数组、文件体积设上限；
- Renderer 不能传明文 secret；
- 主进程错误转换为 `SafeError { code, message, retryable, details? }`；
- `details` 不包含 header、token、Cookie、签名 URL 或本地隐私路径；
- 事件订阅在窗口销毁时解绑。

---

## 11. 安全设计

### 11.1 凭据

- 延续主进程凭据解析；
- Renderer 只获得 `hasCredential / status / lastValidatedAt`；
- 项目导出只含 connectionId 和能力快照，不含连接凭据；
- 日志统一经过 redactor；
- 错误栈进入本地诊断文件前再次脱敏；
- 条件允许时迁移到 OS credential vault；未迁移前保留兼容读取，不在本 SPEC 自行引入新的认证服务。

### 11.2 自定义端点与 SSRF

- 只允许 `http:` / `https:`；
- 禁止 `file:`、`ftp:`、`gopher:` 等协议；
- 本地端点（localhost/局域网）允许，但必须由用户显式标记为 Local Connection；
- 重定向后重新校验 scheme/host；
- Saved credential 只能发送到绑定 endpoint；
- 不允许 renderer 通过通用请求模板覆盖认证 header；
- 请求与响应体大小、超时、轮询次数设上限。

### 11.3 媒体与导入

- 复用并扩展现有 URL 规则与 sanitize；
- 导入先解析到临时目录，校验 schema、大小、媒体类型和相对路径；
- 禁止路径穿越；
- 远程媒体保存前校验 MIME、大小和下载超时；
- 项目导出对临时签名 URL 做脱敏或本地化。

---

## 12. Renderer 模块拆分

目标是逐步减轻 `App.jsx` 和 `CanvasPanel.jsx` 的单文件压力，同时让代码结构服从 Simple First：主路径组件先出现，高级详情组件默认折叠加载。

```text
src/features/
├── home/
│   ├── StartHome.jsx
│   ├── RecentProjects.jsx
│   └── useStartProjection.js
├── creation/
│   ├── CreationShell.jsx
│   ├── GuidedStepView.jsx
│   ├── GuidedStepCard.jsx
│   ├── CandidateGallery.jsx
│   ├── SimpleEditPanel.jsx
│   └── useGuidedStepProjection.js
├── records/
│   ├── CreationRecordRail.jsx
│   ├── ContextSummary.jsx
│   └── AdvancedContextManifest.jsx
├── briefs/
│   ├── BriefConfirm.jsx
│   └── BriefDiff.jsx
├── assistant/
│   ├── AssistantStatus.jsx
│   ├── AssistantDetails.jsx
│   └── AssistantArtifact.jsx
├── advanced-canvas/
│   ├── FreeCanvas.jsx
│   ├── CanvasItem.jsx
│   └── SourceOverlay.jsx
├── details/
│   ├── ArtifactDetailsDrawer.jsx
│   ├── GenerationSettings.jsx
│   ├── SourceRecord.jsx
│   ├── StabilityLocks.jsx
│   └── ReproducibilityDetails.jsx
├── connections/
│   ├── ConnectionWizard.jsx
│   ├── ConnectionCapabilityList.jsx
│   └── ConnectionTechnicalDetails.jsx
└── tasks/
    ├── TaskShelf.jsx
    └── TaskEventProjection.js
```

约束：

- `details/*`、`advanced-canvas/*`、`connections/*TechnicalDetails*` 默认按需打开，不作为首屏常驻区域；
- 组件标签使用 PRD 术语表左列；内部类型名不得直接变成用户文案；
- 共享 token 放在 CSS variables / `DESIGN.md`；组件不再大量使用 inline style；
- 迁移按功能发生，不做全仓一次性重写。

---

## 13. 错误、恢复与可观测性

### 13.1 错误分类

- `CONNECTION_*`：连接、验证、模型目录；
- `CAPABILITY_*`：能力不支持、参数冲突；
- `CONTEXT_*`：预算、快照或摘要问题；
- `RECIPE_*`：冻结、hash、引用缺失；
- `TASK_*`：提交、轮询、取消、恢复、未知状态；
- `STORE_*`：写入、迁移、revision conflict；
- `IMPORT_*`：schema、大小、安全；
- `AGENT_*`：步骤失败、预算耗尽、输出校验失败。

### 13.2 恢复策略

- 应用启动时扫描未终态 TaskRun/Attempt，而不是依赖 Renderer 内存；
- 有 `providerTaskId` 的异步 Attempt 继续轮询，完成事件以 Attempt ID 去重；
- `submitting` 阶段崩溃且无可信远程 ID 的 Attempt 标为 `unknown`，不自动重提，避免重复计费；
- ContextSnapshot、CapabilityResolution、Recipe/ExecutionPlan、TaskRun 与 Attempt 必须先于外部调用落盘；
- 媒体缓存失败不删除远程结果证据，可在之后重新抓取；
- 所有重试均产生新的 Attempt，并保留旧错误、参数和时间；
- 取消包含 `cancelling → cancelled/unknown` 过程；远端不支持取消时不得伪装为已取消。

### 13.3 日志

记录：event type、entity ID、耗时、SafeError code、连接/模型 ID、调用阶段。不得记录：密钥、认证头、完整 Cookie、敏感文件路径、未经裁剪的全部上下文。

---

## 14. 性能要求

- 打开包含 500 个素材节点的项目，首屏可操作时间目标 < 2 秒（不含远程缩略图下载）；
- 画布只渲染视口附近高成本媒体；
- 缩略图与原媒体分离；
- JSONL 索引在后台构建，首屏先读 project/index；
- Context preview 目标 < 300ms（不含摘要模型调用）；
- Task event 合并/节流，避免高频轮询触发整个 App 重渲染；
- 大项目导出采用流式写入，保留大小上限和 fallback。

上述均为目标，正式阈值需用真实项目基准测试校准。

---

## 15. 测试策略

延续现有 `node:test`，先覆盖领域层；不为写文档擅自引入新测试框架。

### 15.1 单元测试

建议新增：

```text
scripts/core-tests/project-migration.test.mjs
scripts/core-tests/project-migration-idempotency.test.mjs
scripts/core-tests/project-store-revision.test.mjs
scripts/core-tests/context-isolation.test.mjs
scripts/core-tests/context-snapshot-hash.test.mjs
scripts/core-tests/context-budget.test.mjs
scripts/core-tests/brief-versioning.test.mjs
scripts/core-tests/recipe-canonical-hash.test.mjs
scripts/core-tests/recipe-secret-exclusion.test.mjs
scripts/core-tests/capability-resolution.test.mjs
scripts/core-tests/workflow-representability.test.mjs
scripts/core-tests/workflow-semantic-hash.test.mjs
scripts/core-tests/artifact-lineage.test.mjs
scripts/core-tests/task-recovery.test.mjs
scripts/core-tests/task-attempt-idempotency.test.mjs
scripts/core-tests/agent-budget.test.mjs
```

### 15.2 集成测试

- Renderer payload 无法携带 secret；
- 保存凭据不能被发送到 Renderer supplied baseUrl；
- connection/inventory/model revision 不匹配时拒绝执行；
- ContextSnapshot、CapabilityResolution、Recipe/ExecutionPlan、TaskRun 与 Attempt 按顺序落盘后才能调用 Provider；
- Thread B 未显式引用时，B 的 ContextSnapshot 不含 A 私有消息；
- 步骤视图展开不复制 WorkflowNode；不可表示 Workflow 返回原因且不丢原图；
- v1 迁移后消息和素材数量一致，重复迁移语义 hash 不变；
- 取消/重试/重复完成事件不会重复创建 ArtifactRevision；
- 有 providerTaskId 的任务重启后继续轮询；无可信 ID 的 submitting Attempt 进入 unknown；
- 项目导出不包含凭据和临时认证 URL。

### 15.3 UI 验收

- 首页只有一个主入口“开始创作”，不会先要求选择 Pipeline / 自由画布；
- 新用户可在 30 秒内进入想法输入状态；
- 1280×720 下“描述 → 生成 → 选择 → 修改”核心路径不被遮挡；
- 简单修改默认只显示“保持/改变”，高级设置折叠但可展开；
- 详情展开后，生成设置、来源记录、可重做程度与内部 Recipe/Lineage 数据一致；
- 助手运行可见、可停止，默认不显示内部任务图或角色群聊；
- 连接页默认显示能力和验证状态，endpoint/revision/请求模板折叠到技术详情；
- Provider 不支持的参数不显示或明确禁用；
- 深色/浅色高对比、键盘焦点可见；
- reduced-motion 下无必要动画关闭。

---

## 16. 分阶段实施

### Phase 0：基线门禁、术语清债与 Simple First 门禁

- 修复现有 core test 跨平台失败，建立全绿基线；
- 将 Provider 请求分发概念命名为 `ProviderCallDispatcher`，产品执行图命名为 `WorkflowGraphService`；
- 冻结 v1 schema、fixture、ID 规则、sanitizer 与导入导出契约；
- 建立 Application Core 所有权边界和 typed IPC command envelope；
- 建立 UI 术语门禁：默认界面不得直接出现 Pipeline、Recipe、Lineage、Capability、Provider、Attempt、ContextSnapshot 等内部词。

**退出条件**：`test:core`、typecheck、build 全绿；没有同名异义的 Pipeline/Graph；后续新领域字段不会被 sanitizer 丢弃；首页设计只有一个主入口“开始创作”。

### Phase 1：schema、迁移与持久任务底座

- Project/Thread/Message DAG、WorkflowGraph、CanvasDocument schema；
- Asset/ArtifactRevision、Recipe、Lineage；
- ContextSnapshot、CapabilityResolution、TaskRun、Attempt schema；
- sanitizer-first v1→v2 migration、幂等检查、备份与回滚；
- 现有图像/视频调用迁入主进程 TaskOrchestrator。

**退出条件**：现有 UI 行为可暂不变，但每次外部调用都有冻结执行链；异步任务重启可恢复，未知同步调用不自动重提。

### Phase 2：Simple Creation Shell、Thread 与上下文摘要

- StartHome 单主入口；
- CreationShell 与 GuidedStepProjection；
- Thread 分支 / “另开方向” / Pin / Reference；
- ContextSnapshot resolver 与 `summaryLabel`；
- 创作说明确认与版本化。

**退出条件**：用户从首页点击一次即可输入想法；多 Thread 不串上下文；冻结 Snapshot 不再读取活动 Canvas/Thread；默认只显示“本轮参考”摘要，展开后可看来源和排除原因。

### Phase 3：Workflow / 步骤视图 / 自由画布

- WorkflowGraph 与 representability checker；
- 默认线性 GuidedStepProjection；
- CanvasDocument 与“高级：展开为自由画布”；
- 选中作品的一跳来源 overlay 与 canvas-only item 规则。

**退出条件**：步骤视图展开不复制语义节点；不可表示的 Workflow 有明确降级且不丢失原数据；自由画布不作为新用户首屏同级入口。

### Phase 4：简单修改与高级详情

- SimpleEditProjection；
- StabilityLock；
- Prompt/Recipe diff；
- ReproducibilityAssessment；
- ArtifactDetailsDrawer / GenerationSettings / SourceRecord 默认折叠。

**退出条件**：修改以新 Recipe/Attempt/ArtifactRevision 分支发生；默认界面只解释保持/改变；高级详情能解释生成设置、来源记录、可重做程度和不可保证项。

### Phase 5：单协调助手

- 单协调 Agent plan、budget、run；
- intent/prompt/continuity/capability/critique/motion steps 顺序执行；
- AssistantRunProjection；
- 审批、停止、失败和结构化 Artifact。

**退出条件**：Agent 不持有网络/凭据权限；默认 UI 只显示助手阶段和停止按钮；相对原始提示词直出有可测增益，且额外成本与延迟在上限内。

### Phase 6：P1 能力

- 受控多 Agent 协作与自定义 Agent 方案；
- 自定义步骤模板 / Pipeline 模板；
- 局部编辑、一致性包；
- 多窗口 revision sync；
- 成本预算；
- 专家模式下更完整的白盒参数工作台。

---

## 17. Plan B

若 WorkflowGraph 的步骤视图投影与自由画布编辑复杂度超出当前资源：

1. 先实现受限线性 Workflow 子集与 **步骤视图 → 自由画布单向展开**；
2. 自由画布可继续整理素材，切回步骤视图时对 `grouped/unavailable` 只读显示原因；
3. 不自动把任意自由布局、便签或 Artifact 来源记录压成 Workflow；
4. WorkflowGraph、CanvasDocument、LineageGraph 仍分开持久化并用稳定引用关联，避免将来重做语义模型。

若 Agent 集群成本或可靠性不达标：

1. P0 只保留单协调助手生成创作说明 + 两个候选方向；
2. 连续性检查作为显式步骤；
3. AgentRun 数据结构保留，多 Agent、自定义方案继续留在 P1。

若 Provider 无法返回 seed/版本等证据：

1. Recipe 仍保存所有已知字段；
2. 复现等级降为 `recipe` 或 `record-only`，可信度降为 Medium/Low；
3. UI 明确缺失项，不模拟稳定性。

---

## 18. Definition of Done

vNext 基础版本只有同时满足以下条件才算完成：

- [ ] v1 reader/fixture 固定，v2 sanitizer 先于 UI 写入上线；迁移幂等、可回滚且不长期双写；
- [ ] Project、Thread/Message DAG、WorkflowGraph、CanvasDocument、ContextSnapshot、CapabilityResolution、TaskRun/Attempt、Asset/ArtifactRevision、Recipe/Lineage 有稳定 schema；
- [ ] 首页只有一个主入口“开始创作”，用户无需先选择 Pipeline / 自由画布；
- [ ] GuidedStepProjection 投影 WorkflowGraph，CanvasDocument 只保存空间引用，LineageGraph 记录实际历史；
- [ ] representability checker 对不可压回步骤视图的图返回稳定原因且不丢数据；
- [ ] Thread 上下文隔离与 ContextSnapshot 冻结有自动化测试；
- [ ] 默认 UI 只显示“本轮参考”摘要，展开后 ContextManifest 与快照一致；
- [ ] 每次外部调用前 ContextSnapshot、CapabilityResolution、Recipe/ExecutionPlan、TaskRun、Attempt 已落盘；
- [ ] 应用重启可恢复有远程 ID 的任务；未知同步提交不自动重提；
- [ ] 简单修改默认只显示保持/改变，高级设置展开后与同一 Recipe 字段一致；
- [ ] 用户能在详情中查看 prompt/参数 diff、来源输入角色与可重做程度；
- [ ] P0 单协调助手有计划、预算、审批、停止和结构化产物，并有相对基线的增益评测；
- [ ] 连接页默认显示能力和验证状态，技术详情折叠；
- [ ] Renderer、导出、日志中无明文凭据；
- [ ] 核心 Node 测试、类型检查、生产构建和打包检查通过；
- [ ] PRD 中 P0 验收场景全部完成真实手动验收。
