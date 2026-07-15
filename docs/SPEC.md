# Gravuresse vNext 技术规格（SPEC）

> 状态：Baseline v0.1
> 日期：2026-07-16
> 对应 PRD：`docs/PRD.md`
> 目标：把 Gravuresse 现有 Electron 应用增量升级为“项目级上下文 + Agent 协作 + 可复现生成 + Pipeline/无限画布双视图”的创意工作台。

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
| 无限画布、缩放、工具、素材 | `CanvasPanel.jsx`、`useCanvas.js` | 变为共享 Graph 的自由投影视图 |
| 视频异步任务队列 | `useTaskQueue.js`、Provider submit/poll | 统一为 Job Engine |
| 项目/会话导入导出 | `electron/ipc/conversation.js` | 升级 schema，兼容 v1 |

### 1.3 不采用的方案

- 不在本阶段引入云端数据库；
- 不把所有状态塞入单个 React `App.jsx`；
- 不为每个 Provider 编写独立 UI 页面；
- 不使用“把所有会话全文拼给模型”实现上下文；
- 不维护 Pipeline 和画布两份独立业务数据；
- 不立即引入 SQLite，除非真实项目规模证明 JSON 分片无法满足性能。

---

## 2. 总体架构

```text
┌──────────────── Renderer / React ────────────────┐
│ Project Shell                                    │
│ ├─ Conversation Rail / Context Inspector         │
│ ├─ Pipeline Projection                            │
│ ├─ Infinite Canvas Projection                     │
│ ├─ Agent Run Panel                                │
│ └─ Recipe / Lineage / Output Inspector            │
└──────────────────────┬────────────────────────────┘
                       │ Typed & validated IPC
┌──────────────── Main Process ─────────────────────┐
│ Project Service / Store                           │
│ Context Assembler                                 │
│ Orchestration Engine                              │
│ Generation Job Engine                            │
│ Capability Resolver / Provider Adapters           │
│ Recipe & Lineage Service                          │
│ Security / Redaction / Import-Export              │
└──────────────────────┬────────────────────────────┘
                       │ HTTP(S) / local endpoints
┌──────────────── Provider Connections ─────────────┐
│ Chat / Image / Video APIs                         │
└───────────────────────────────────────────────────┘
```

### 2.1 架构原则

1. **主进程持有副作用**：密钥、网络、文件、任务状态、迁移和导出在主进程。
2. **Renderer 发送声明式意图**：只发送 connectionId、modelId、Recipe/Brief ID 和允许字段。
3. **单一领域模型，多视图投影**：Pipeline 与画布读取同一个 ProjectGraph。
4. **先冻结任务，再调用 Provider**：请求发出前必须产生 Recipe 和 Job 记录。
5. **上下文有清单**：每次 Agent/模型调用都保存 ContextManifest，不只保存最终 prompt。
6. **错误也是记录**：失败任务保留配方、连接证据、错误代码和重试来源。

---

## 3. 领域模型

建议把 vNext 核心类型从 `src/types/domain.ts` 中逐步拆到 `shared/domain/`，主进程和 renderer 共享纯类型/校验逻辑；迁移期间保留 re-export，避免一次性改完所有 import。

### 3.1 Project

```ts
type ProjectMode = 'pipeline' | 'canvas'

type Project = {
  id: string
  schemaVersion: 2
  title: string
  description?: string
  preferredMode: ProjectMode
  briefId?: string
  graph: ProjectGraph
  conversationIds: string[]
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

### 3.3 Conversation 与上下文

```ts
type ConversationV2 = {
  id: string
  projectId: string
  title: string
  parentConversationId?: string
  forkedFromMessageId?: string
  messageIds: string[]
  privateMemoryEntryIds: string[]
  snapshotIds: string[]
  activeBriefId?: string
  createdAt: string
  updatedAt: string
  revision: number
}

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

### 3.4 ProjectGraph

```ts
type GraphNodeKind =
  | 'brief'
  | 'prompt-plan'
  | 'generation-job'
  | 'asset'
  | 'conversation-ref'
  | 'agent-run'
  | 'group'
  | 'note'

type ProjectGraph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  pipelineProjection: PipelineProjection
}
```

Pipeline 不是第二份工作流数据，只是对 Graph 中满足约束的节点/边做排序和分组。

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
  capabilitySnapshotId: string
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
  contextManifestId?: string
  parentRecipeId?: string
  userChangeRequest?: string
  promptDiff?: PromptDiff
  hash: string
  createdBy: 'user' | 'agent'
  createdAt: string
}
```

`hash` 由规范化 JSON 计算，字段排序固定；不得包含密钥、临时签名 URL 或不可稳定序列化对象。

### 3.6 Asset 与 Lineage

扩展现有 `Asset.generation`，逐步迁移为外部引用：

```ts
type AssetV2 = {
  id: string
  projectId: string
  type: 'image' | 'video' | 'mask' | 'reference'
  localUri?: string
  remoteUri?: string
  mediaHash?: string
  recipeId?: string
  jobId?: string
  status: 'pending' | 'ready' | 'missing' | 'failed'
  tags: string[]
  createdAt: string
}

type LineageEdge = {
  id: string
  fromAssetId: string
  toAssetId: string
  relation: 'derived' | 'variation' | 'edited' | 'animated' | 'reference'
  recipeId: string
  createdAt: string
}
```

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
  contextManifestId: string
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
│       │   ├── conversations.json
│       │   ├── messages.jsonl
│       │   ├── briefs.json
│       │   ├── recipes.jsonl
│       │   ├── jobs.jsonl
│       │   ├── agent-runs.jsonl
│       │   └── context.jsonl
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

### 4.3 v1 → v2 迁移

1. 检测现有 `conversations.json`；
2. 创建一个“已迁移项目”；
3. 每个旧 conversation 变为 ConversationV2；
4. 旧 assets 迁移为 AssetV2，已有 generation 元数据转换为基础 Recipe；
5. 根据 `parentAssetId/sourceAssetIds` 建立 Lineage；
6. 缺失字段保持 `unknown`，不得伪造 seed/model version；
7. 写入 v2 后重新读取并校验数量/hash；
8. 校验通过后在 index 标记完成，保留 v1 只读备份；
9. 迁移失败回滚，不覆盖 v1。

---

## 5. Pipeline 与无限画布

### 5.1 统一图模型

默认 Pipeline 模板：

```text
idea → brief → image-explore → select-edit → video(optional) → export
```

每个 PipelineStep 映射一组 GraphNode：

```ts
type PipelineStep = {
  id: string
  kind: 'idea' | 'brief' | 'generate-image' | 'select-edit' | 'generate-video' | 'export'
  nodeIds: string[]
  inputEdgeIds: string[]
  outputEdgeIds: string[]
  optional: boolean
  status: 'idle' | 'ready' | 'running' | 'blocked' | 'complete' | 'error'
}
```

### 5.2 投影规则

- `expandToCanvas()` 只改变视图布局，不复制节点；
- Pipeline 顺序由 projection 中的 step order 决定；
- 画布新增节点若能归类，允许用户拖入 Pipeline step；
- 无法归类的节点标记 `freeform`，切回 Pipeline 时保留在“画布附加内容”入口；
- 删除节点前检查 lineage 与下游依赖；默认软删除；
- 画布坐标属于 view state，不属于 Recipe。

### 5.3 状态一致性

- ProjectGraph 修改必须走 reducer/service，不允许两个 UI 各自操作数组；
- 所有节点和边有稳定 ID；
- UI derived state 不写回领域对象；
- Undo/redo 记录 graph command，而不是整个 React state 快照；
- 生成 Job 状态由主进程事件驱动，renderer 不自行猜测完成。

---

## 6. 上下文系统

### 6.1 ContextManifest

每一次 chat/agent 调用前，由主进程生成清单：

```ts
type ContextManifest = {
  id: string
  projectId: string
  conversationId: string
  modelId: string
  tokenBudget?: number
  items: Array<{
    sourceType: 'system' | 'project-brief' | 'project-memory' | 'conversation-message' | 'conversation-summary' | 'referenced-snapshot' | 'asset'
    sourceId: string
    version?: number
    priority: number
    included: boolean
    exclusionReason?: string
    contentHash: string
  }>
  assembledTextHash: string
  createdAt: string
}
```

### 6.2 组装顺序

1. 安全与产品系统约束；
2. 当前确认版 CreativeBrief；
3. 用户 Pin 的项目约束/事实；
4. 当前任务直接引用的素材与配方；
5. 当前会话最近原始消息；
6. 当前会话较早的版本化摘要；
7. 用户显式引用的其他会话快照；
8. 低优先级背景。

超过预算时从低优先级项开始排除，并记录原因。不得静默把其他会话全文注入。

### 6.3 摘要策略

- 原始消息永久保留；
- 摘要带 source message range、模型、时间、版本和 hash；
- 用户可编辑/拒绝/重建摘要；
- 新摘要不能覆盖旧摘要，只能 supersede；
- 影响关键约束的摘要必须进入“待确认”状态。

### 6.4 Fork / Pin / Reference

- Fork 记录父会话与分叉消息；
- Pin 创建项目级 ContextEntry，必须显示来源；
- Reference 只引用指定 snapshot，不继承后续变化；
- Merge brief 产生新 Brief 版本，并展示字段级 diff。

---

## 7. Agent 协作与 Prompt IR

### 7.1 Agent 不是聊天角色

Agent 以可测试的函数职责存在：

| Step type | 输入 | 输出 |
|---|---|---|
| `intent.extract` | 用户描述、参考素材 | Brief 草稿、待确认问题 |
| `prompt.propose` | 确认 Brief、目标 operation | PromptPlan 候选 |
| `continuity.check` | Brief、锁定项、父 Recipe | 约束冲突和修订建议 |
| `capability.adapt` | PromptPlan、CapabilitySnapshot | Provider 可执行 Recipe 草稿 |
| `candidate.critique` | 候选缩略图/元数据、Brief | 差异与风险，不自动判定“美” |
| `motion.plan` | 图像、Brief、视频目标 | 镜头/动作/节奏计划 |

### 7.2 Orchestration Engine

建议新增：

```text
electron/orchestration/
├── planner.js
├── runner.js
├── scheduler.js
├── budget.js
├── artifacts.js
└── steps/
```

执行约束：
- 默认 `maxParallel = 3`；
- 计划生成后先返回 renderer 确认；
- 每步只读取声明的 ContextManifest；
- 输出必须通过 schema 校验；
- 并行候选完成后才进入合并/批判步骤；
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

## 8. 黑盒、灰盒与白盒

### 8.1 同一 Recipe，不同 UI 暴露级别

三种模式不维护不同数据模型：

- **黑盒**：用户变更请求 + 系统生成的“改变/保持”摘要；
- **灰盒**：语义块、变化强度、稳定锁、参考权重；
- **白盒**：完整 Recipe、prompt diff、能力快照和 Provider 参数。

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

`strict` 只是产品约束，不代表模型保证。Adapter 根据能力映射为：
- prompt constraint；
- reference image；
- mask；
- seed；
- Provider 特有控制参数；
- 若无法映射，显示“当前模型无法严格执行”。

### 8.3 ReproducibilityConfidence

```ts
type ReproducibilityConfidence = {
  level: 'high' | 'medium' | 'low'
  factors: Array<{
    name: string
    status: 'present' | 'missing' | 'unstable'
    explanation: string
  }>
}
```

判定原则：
- **High**：模型版本稳定、seed 被服务端接受、参数与参考素材 hash 完整；
- **Medium**：配方完整但无 seed，或模型使用可能漂移的 alias；
- **Low**：模型版本未知、Provider 不返回关键证据、参考素材仅远程临时 URL。

UI 不显示伪精确百分比。

---

## 9. Provider 能力与生成任务

### 9.1 CapabilitySnapshot

连接验证后冻结：

```ts
type CapabilitySnapshot = {
  id: string
  connectionId: string
  modelId: string
  operations: Array<'chat' | 'text_to_image' | 'image_edit' | 'text_to_video' | 'image_to_video'>
  inputs: {
    text: boolean
    images: { supported: boolean; max?: number }
    mask: boolean
  }
  parameters: {
    ratios?: string[]
    resolutions?: string[]
    durations?: number[]
    seed: boolean
    negativePrompt: 'native' | 'append' | 'unsupported'
    extraSchema?: Record<string, JsonSchema>
  }
  validationEvidence: string
  inventoryRevision: string
  createdAt: string
}
```

运行时必须同时匹配 `connection revision + inventory revision + track + modelId`，继承现有 `verifiedTrackInventory` 约束。

### 9.2 连接策略

- UI 主路径围绕“添加连接”和能力验证，不围绕 Provider logo 列表；
- 保留现有 registry 作为兼容和 handler metadata；
- 新接入优先使用 OpenAI-compatible 或通用请求模板；
- 不在 vNext 文档里增加新的预设 Provider；
- 已保存密钥与 baseUrl 绑定，renderer supplied baseUrl 不得复用旧密钥；
- Provider 特有字段只进入 `extraParams.<namespace>`。

### 9.3 Job Engine

统一图像和视频任务：

```ts
type GenerationJob = {
  id: string
  recipeId: string
  status: 'created' | 'preflight' | 'queued' | 'submitting' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  progress?: number
  providerTaskId?: string
  attempt: number
  parentJobId?: string
  outputAssetIds: string[]
  error?: SafeError
  timestamps: Record<string, string>
}
```

流程：

```text
Recipe.freeze
→ capability preflight
→ cost/调用确认（需要时）
→ submit/generate
→ poll or await
→ validate response
→ cache media
→ create Asset
→ create LineageEdge
→ complete Job
```

幂等：同一 `jobId + attempt` 的完成事件只能创建一次 Asset；重试生成新 attempt 或 child job。

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

### Context / Conversation
- `conversation:fork`
- `context:preview`
- `context:pin`
- `context:referenceSnapshot`
- `context:rebuildSummary`

### Pipeline / Graph
- `graph:get`
- `graph:applyCommands`
- `pipeline:getProjection`
- `pipeline:expandToCanvas`

### Agent
- `agent:plan`
- `agent:run`
- `agent:pause`
- `agent:cancel`
- `agent:events`

### Recipe / Generation
- `recipe:createDraft`
- `recipe:freeze`
- `recipe:diff`
- `recipe:reproduce`
- `generation:submit`
- `generation:cancel`
- `generation:retry`
- `generation:events`

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

目标是逐步减轻 `App.jsx` 和 `CanvasPanel.jsx` 的单文件压力。

```text
src/features/
├── projects/
│   ├── ProjectHome.jsx
│   ├── ProjectShell.jsx
│   └── useProject.js
├── conversations/
│   ├── ConversationRail.jsx
│   ├── ContextInspector.jsx
│   └── ConversationWindow.jsx
├── briefs/
│   ├── BriefEditor.jsx
│   └── BriefDiff.jsx
├── pipeline/
│   ├── PipelineView.jsx
│   ├── PipelineStep.jsx
│   └── projection.js
├── canvas/
│   ├── InfiniteCanvas.jsx
│   ├── GraphNode.jsx
│   └── lineageOverlay.js
├── agents/
│   ├── AgentPlan.jsx
│   ├── AgentRunPanel.jsx
│   └── AgentArtifact.jsx
├── recipes/
│   ├── RecipeInspector.jsx
│   ├── RecipeDiff.jsx
│   ├── StabilityLocks.jsx
│   └── ReproducibilityBadge.jsx
└── generation/
    ├── JobQueue.jsx
    └── CandidateGrid.jsx
```

共享 token 放在 CSS variables / `DESIGN.md`；组件不再大量使用 inline style。迁移按功能发生，不做全仓一次性重写。

---

## 13. 错误、恢复与可观测性

### 13.1 错误分类

- `CONNECTION_*`：连接、验证、模型目录；
- `CAPABILITY_*`：能力不支持、参数冲突；
- `CONTEXT_*`：预算、快照或摘要问题；
- `RECIPE_*`：冻结、hash、引用缺失；
- `JOB_*`：提交、轮询、取消、超时；
- `STORE_*`：写入、迁移、revision conflict；
- `IMPORT_*`：schema、大小、安全；
- `AGENT_*`：步骤失败、预算耗尽、输出校验失败。

### 13.2 恢复策略

- 应用启动时将 `submitting/running` Job 标为 `recovery_required`；
- 有 providerTaskId 的异步任务允许继续轮询；
- 无 providerTaskId 的任务不自动重提，避免重复计费；
- Recipe 和 Job 先于外部调用落盘；
- 媒体缓存失败不删除远程结果引用；
- 所有重试均产生新的 attempt 记录。

### 13.3 日志

记录：event type、entity ID、耗时、SafeError code、连接/模型 ID、调用阶段。不得记录：密钥、认证头、完整 Cookie、敏感文件路径、未经裁剪的全部上下文。

---

## 14. 性能要求

- 打开包含 500 个素材节点的项目，首屏可操作时间目标 < 2 秒（不含远程缩略图下载）；
- 画布只渲染视口附近高成本媒体；
- 缩略图与原媒体分离；
- JSONL 索引在后台构建，首屏先读 project/index；
- Context preview 目标 < 300ms（不含摘要模型调用）；
- Job event 合并/节流，避免高频轮询触发整个 App 重渲染；
- 大项目导出采用流式写入，保留大小上限和 fallback。

上述均为目标，正式阈值需用真实项目基准测试校准。

---

## 15. 测试策略

延续现有 `node:test`，先覆盖领域层；不为写文档擅自引入新测试框架。

### 15.1 单元测试

建议新增：

```text
scripts/core-tests/project-migration.test.mjs
scripts/core-tests/project-store-revision.test.mjs
scripts/core-tests/context-isolation.test.mjs
scripts/core-tests/context-budget.test.mjs
scripts/core-tests/brief-versioning.test.mjs
scripts/core-tests/recipe-canonical-hash.test.mjs
scripts/core-tests/recipe-secret-exclusion.test.mjs
scripts/core-tests/capability-snapshot.test.mjs
scripts/core-tests/pipeline-projection.test.mjs
scripts/core-tests/lineage-idempotency.test.mjs
scripts/core-tests/agent-budget.test.mjs
```

### 15.2 集成测试

- Renderer payload 无法携带 secret；
- 保存凭据不能被发送到 renderer supplied baseUrl；
- 连接 inventory revision 不匹配时拒绝执行；
- Recipe 冻结后才能提交 Job；
- 会话 B 未显式引用时 ContextManifest 不含 A 私有消息；
- Pipeline 展开不产生重复节点；
- v1 迁移后消息和素材数量一致；
- 取消/重试不会重复创建 Asset；
- 项目导出不包含凭据和临时认证 URL。

### 15.3 UI 验收

- 黑/灰/白盒切换数据一致；
- 锁定项与变化项有明确视觉区分；
- Agent 运行可见、可停止；
- Provider 不支持的参数不显示或明确禁用；
- 深色/浅色高对比、键盘焦点可见；
- 1280×720 下核心操作不被遮挡；
- reduced-motion 下无必要动画关闭。

---

## 16. 分阶段实施

### Phase 0：领域底座

- 建立 shared domain / schema；
- ProjectStore v2 和迁移；
- Recipe、Job、Lineage；
- 现有生成流程先写 Recipe 再调用。

**退出条件**：现有功能行为不变，但每次新生成都有可追溯 Recipe/Job/Lineage。

### Phase 1：项目、会话与上下文

- Project Shell；
- 会话 Fork/Pin/Reference；
- ContextManifest 和 preview；
- Brief 编辑与版本化。

**退出条件**：多会话不串上下文，用户能看到本轮上下文来源。

### Phase 2：Pipeline / 画布统一

- ProjectGraph；
- 默认 Pipeline projection；
- 一键展开为画布；
- freeform 节点兼容规则。

**退出条件**：双视图共享数据，转换无丢失。

### Phase 3：透明度与稳定修改

- 黑/灰/白盒 Recipe Inspector；
- StabilityLock；
- Prompt diff；
- ReproducibilityConfidence。

**退出条件**：修改以分支发生，并能解释保持/变化/不可保证项。

### Phase 4：Agent 协作

- Agent plan、budget、run；
- intent/prompt/continuity/capability/critique/motion steps；
- 停止、失败和结果 artifact。

**退出条件**：单 Agent 与有限协作均可用，复杂任务在用户确认后运行。

### Phase 5：P1 能力

- 自定义 Pipeline/Agent 方案；
- 局部编辑、一致性包；
- 多窗口 revision sync；
- 成本预算。

---

## 17. Plan B

若 ProjectGraph + Pipeline 双向编辑复杂度超出当前资源：

1. 先实现 **Pipeline → Canvas 单向展开**；
2. 画布可自由继续，但切回 Pipeline 只显示原投影和“画布有附加内容”状态；
3. 不实现自动把任意自由节点重新压回 Pipeline；
4. 数据仍保持单一 ProjectGraph，避免将来重做存储。

若 Agent 集群成本或可靠性不达标：

1. MVP 只保留单 Agent Brief + 两个 Prompt 候选；
2. 连续性检查作为显式按钮；
3. 任务图和 AgentRun 数据结构保留，暂不开放自定义方案。

若 Provider 无法返回 seed/版本等证据：

1. Recipe 仍保存所有已知字段；
2. 复现可信度降为 Medium/Low；
3. UI 明确缺失项，不模拟稳定性。

---

## 18. Definition of Done

vNext 基础版本只有同时满足以下条件才算完成：

- [ ] 现有 v1 数据可无损迁移并可回滚；
- [ ] Project、Conversation、Brief、Recipe、Job、Asset、Lineage 有稳定 schema；
- [ ] Pipeline 和画布读取同一 ProjectGraph；
- [ ] 会话上下文隔离有自动化测试；
- [ ] 每次外部调用前 Recipe/Job 已落盘；
- [ ] 黑/灰/白盒共用同一 Recipe；
- [ ] 用户能查看 prompt/参数 diff 与复现可信度；
- [ ] Agent 任务有计划、预算、停止和结构化产物；
- [ ] Renderer、导出、日志中无明文凭据；
- [ ] 核心 Node 测试、类型检查、生产构建和打包检查通过；
- [ ] PRD 中 P0 验收场景全部完成真实手动验收。
