# Gravuresse v1.0 Core Architecture SPEC

> 状态：Vision v1.0（长期核心架构，不直接替代 v0.5.1 当前实现线）
> 日期：2026-07-16
> 当前实现基线：`docs/PRD.md` / `docs/SPEC.md` / commit `ce1c34a`
> 对应产品文档：`docs/VISION-PRD.md`
> 目标：定义支撑“对话 + Agent + 多 API + 稳定修改 + 多上下文 + Pipeline/Canvas 互斥工作区形态 + 可追溯复现”的核心架构，同时给出现有项目的渐进迁移路径。

---

## 0. 技术结论

不要把现有 Gravuresse 一次性推倒重写。

正确路线是：

```text
v0.6 保持当前 Conversation/Asset 产品闭环稳定
v0.7 开始引入可复现执行记录
v0.8 引入 Project/Thread 壳
v0.9 引入 Capability 与 Stable Edit
v1.0 再把 Agent、Lineage 与 WorkspaceMode（Pipeline 或 Canvas 二选一）合并为多视图系统
```

核心原则：

```text
当前 UI 是投影，不是最终领域模型；
未来领域模型要完整，但默认 UI 必须简单。
```

---

## 1. 当前基线

当前 v0.5.1 已有合理骨架：

```text
Renderer / React
├─ App.jsx
├─ ChatPanel.jsx
├─ CanvasPanel.jsx
├─ AssetDetail.jsx
├─ Settings.jsx
├─ TaskQueue.jsx
├─ i18n.js
└─ global.css

Electron Main
├─ config
├─ safeStorage
├─ Provider / IPC
├─ conversation store
└─ sanitize / asset-url security
```

当前实体：

| 实体 | 当前职责 | v1.0 处理 |
|---|---|---|
| Conversation | 创作记录 | 迁移为 Project 下的默认 Thread |
| Message | 聊天记录 | 保留，但支持 parent/branch |
| Asset | 素材/结果 | 演进为 Asset + ArtifactRevision |
| Generation | 生成元数据 | 演进为 Replay Recipe / Execution evidence |
| MessageTask | 任务摘要 | 演进为 TaskRun / Attempt 的轻量入口 |
| ProviderConnection | API 配置 | 演进为 CapabilityOffer 来源 |
| VideoQueueTask | 视频队列 | 迁入持久 TaskRun/Attempt 模型 |
| CanvasController | 画布视图状态 | 保持为视图，不做执行真相 |

---

## 2. 目标架构

### 2.1 分层

```text
Renderer UI Projections
├─ Chat View
├─ Workspace Projection
│  ├─ Canvas Mode: Grid / Infinite Canvas
│  └─ Pipeline Mode: Pipeline View
├─ Asset Detail
├─ Agent Panel
└─ Provider Settings
        │ commands / queries / events
        ▼
Application Core
├─ ProjectService
├─ ThreadService
├─ ContextSnapshotService
├─ PromptPlanningService
├─ CapabilityResolver
├─ TaskOrchestrator
├─ AssetRevisionService
└─ LineageService
        │ repositories / adapters
        ▼
Infrastructure
├─ Provider Adapters
├─ Local Store
├─ Media Cache
├─ Secure Config
├─ IPC
└─ Import / Export / Migration
```

### 2.2 所有权原则

| 状态 | 权威所有者 | Renderer 是否可写 |
|---|---|---:|
| Project / Thread | ProjectService | 否，只发命令 |
| ContextSnapshot | ContextSnapshotService | 否 |
| CapabilityResolution | CapabilityResolver | 否 |
| TaskRun / Attempt | TaskOrchestrator | 否 |
| AssetRevision | AssetRevisionService | 否 |
| Lineage | LineageService | 否 |
| Workspace mode | Config / Project preference | Renderer 只发切换命令 |
| Canvas layout | Canvas view store | 仅 Canvas Mode 可写视图状态 |
| Provider secret | Secure Config / Main Process | 否 |

Renderer 可以维护临时 UI 状态，但不能成为任务、凭据、上下文快照或来源记录的唯一真相。

---

## 3. 领域模型

### 3.1 Project

```ts
type WorkspaceMode = 'canvas' | 'pipeline'

type Project = {
  id: string
  schemaVersion: number
  title: string
  threadIds: string[]
  sharedAssetIds: string[]
  pinnedContextIds: string[]
  preferredWorkspaceMode?: WorkspaceMode
  canvasDocumentId?: string
  pipelineDocumentId?: string
  createdAt: string
  updatedAt: string
}
```

规则：

- 一个 Project 表示一个作品、主题或创作方向；
- 旧 Conversation 迁移后成为默认 Thread；
- `preferredWorkspaceMode` 是项目级偏好；没有项目级偏好时使用 `config.general.workspaceMode`；
- Project 不保存 secrets；
- Project 可导入导出。

### 3.2 Thread / Message

```ts
type Thread = {
  id: string
  projectId: string
  title: string
  messageIds: string[]
  headMessageId?: string
  createdAt: string
  updatedAt: string
}

type Message = {
  id: string
  threadId: string
  parentMessageId?: string | null
  role: 'user' | 'assistant' | 'system'
  content: string
  taskRunIds?: string[]
  assetRevisionIds?: string[]
  createdAt: string
}
```

规则：

- 多会话窗口是多个 Thread，不是多个孤立项目；
- 同一 Project 的 Thread 默认上下文隔离；
- 共享上下文必须显式 pin 或引用；
- parentMessageId 支持未来分支，但默认 UI 仍显示线性对话。

### 3.3 OperationIntent / PromptPlan

```ts
type OperationIntent = {
  id: string
  projectId: string
  threadId: string
  kind: 'generate-image' | 'edit-image' | 'image-to-video' | 'upscale' | 'inpaint'
  userGoal: string
  sourceAssetRevisionIds?: string[]
  constraints?: Record<string, unknown>
  createdBy: 'user' | 'agent'
  createdAt: string
}

type PromptPlan = {
  id: string
  intentId: string
  positivePrompt: string
  negativePrompt?: string
  keep?: string[]
  change?: string[]
  references?: string[]
  questions?: string[]
  agentNotes?: string[]
  version: string
}
```

规则：

- Agent 只能创建或建议 Intent / PromptPlan；
- Agent 不直接绕过能力解析和用户确认调用付费模型；
- PromptPlan 是可审查中间产物，不是隐藏魔法。

### 3.4 ContextSnapshot

```ts
type ContextSnapshot = {
  id: string
  projectId: string
  threadId: string
  policyVersion: string
  sourceEntries: ContextSourceEntry[]
  exclusions?: string[]
  truncation?: string[]
  tokenEstimate?: number
  hash: string
  frozenAt: string
}

type ContextSourceEntry = {
  kind: 'message' | 'assetRevision' | 'projectFact' | 'promptPlan' | 'canvasSelection'
  entityId: string
  revisionId?: string
  contentHash?: string
  role?: string
  order: number
}
```

规则：

- 执行前冻结；
- 冻结后 Task 不再读取 live UI；
- 不自动包含 sibling Thread；
- hash 用于 replay 和审计。

### 3.5 CapabilityRequirement / Offer / Resolution

```ts
type CapabilityRequirement = {
  operation: 'text-to-image' | 'image-to-image' | 'image-to-video' | 'video-to-video' | 'upscale' | 'inpaint'
  inputKinds: Array<'text' | 'image' | 'video' | 'mask'>
  outputKind: 'image' | 'video'
  requiredOptions?: Record<string, unknown>
  limits?: Record<string, unknown>
}

type CapabilityOffer = {
  connectionId: string
  model: string
  providerKind: string
  supportedOperations: string[]
  optionSchema: Record<string, unknown>
  syncMode: 'sync' | 'async'
  verifiedAt?: string
  inventoryRevision?: string
}

type CapabilityResolution = {
  id: string
  requirement: CapabilityRequirement
  selectedOffer: CapabilityOffer
  requestedParams: Record<string, unknown>
  effectiveParams: Record<string, unknown>
  warnings?: string[]
  blockedReason?: string
  hash: string
}
```

规则：

- Renderer 可以展示候选能力，但不能决定能力真相；
- 重新执行不得静默换模型；
- 参数 coercion 必须记录 requested/effective 差异；
- 自定义 API 通过 adapter schema 接入，不硬编码到 UI。

### 3.6 TaskRun / Attempt

```ts
type TaskRun = {
  id: string
  projectId: string
  threadId: string
  intentId: string
  promptPlanId?: string
  contextSnapshotId: string
  capabilityResolutionId: string
  status: 'draft' | 'blocked' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown'
  attemptIds: string[]
  createdAt: string
  updatedAt: string
}

type Attempt = {
  id: string
  taskRunId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown'
  idempotencyKey?: string
  remoteTaskId?: string
  requestedAt: string
  lastPolledAt?: string
  completedAt?: string
  error?: string
  redactedRequest?: Record<string, unknown>
  outputRevisionIds?: string[]
}
```

规则：

- retry 创建新 Attempt，不覆盖旧 Attempt；
- remoteTaskId 提交成功后立即持久化；
- crash 后不知道结果时标 unknown，不伪造成 failed；
- sync provider 也要记录 Attempt；
- secrets 不进入 redactedRequest。

### 3.7 Asset / ArtifactRevision / Lineage

```ts
type Asset = {
  id: string
  projectId: string
  currentRevisionId: string
  revisionIds: string[]
  title?: string
  kind: 'image' | 'video' | 'reference' | 'note'
  createdAt: string
  updatedAt: string
}

type ArtifactRevision = {
  id: string
  assetId: string
  kind: 'image' | 'video' | 'reference' | 'note'
  mediaUri?: string
  mediaHash?: string
  mimeType?: string
  width?: number
  height?: number
  duration?: number
  taskRunId?: string
  attemptId?: string
  replayRecipeId?: string
  createdAt: string
}

type LineageEdge = {
  id: string
  fromRevisionId: string
  toRevisionId: string
  relation: 'reference' | 'parent' | 'mask' | 'prompt-source' | 'video-source'
  createdAt: string
}
```

规则：

- 历史 Revision 不可变；
- Asset.currentRevisionId 可以变；
- Lineage 记录事实，不表达计划；
- Canvas 上的位置不是 Lineage。

### 3.8 WorkspaceMode / CanvasDocument / PipelineDocument

WorkspaceMode 是用户设置里的主工作区形态开关：

```ts
type WorkspaceMode = 'canvas' | 'pipeline'
```

来源优先级：

```text
Project.preferredWorkspaceMode ?? config.general.workspaceMode ?? 'canvas'
```

互斥规则：

| mode | active document | renderer mounts | renderer must not mount |
|---|---|---|---|
| `canvas` | `CanvasDocument` | Grid / Infinite Canvas | Pipeline 主视图 |
| `pipeline` | `PipelineDocument` | Pipeline View | Grid / Free Canvas / Infinite Canvas |

切换 mode 只切换投影，不删除文档数据；但同一时刻只能有一个主工作区 active。

```ts
type CanvasDocument = {
  id: string
  projectId: string
  items: CanvasItem[]
  viewport?: { x: number; y: number; zoom: number }
  updatedAt: string
}

type CanvasItem = {
  id: string
  kind: 'assetRevision' | 'note' | 'promptBrief' | 'group'
  entityId: string
  x: number
  y: number
  width?: number
  height?: number
  groupId?: string
}

type PipelineDocument = {
  id: string
  projectId: string
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  updatedAt: string
}
```

规则：

- Canvas 是空间整理投影；
- Pipeline 是执行计划投影；
- Lineage 是历史事实；
- 三者不能混成一个万能图；
- Pipeline Mode 下取消 Grid / Free Canvas / Infinite Canvas 主视图；
- Canvas Mode 下不显示 Pipeline 节点主视图；
- 不承诺 PipelineDocument 与 CanvasDocument 无损互转；只有明确 representable subset 才能生成另一种投影。

---

## 4. Provider Adapter 与自定义 API

### 4.1 Adapter 边界

```text
ProviderAdapter
├─ describeCapabilities(connection)
├─ validateParams(requirement, params)
├─ submit(taskInput)
├─ poll(remoteTaskId)
└─ normalizeOutput(response)
```

### 4.2 自定义 API schema

自定义 Provider 至少要描述：

- endpoint；
- auth placement；
- model field；
- request template；
- response parser；
- async task id path；
- poll endpoint；
- output url/path；
- error path；
- supported operation。

安全要求：

- 不允许任意 headers 直接从 Renderer 透传；
- endpoint 必须通过 allow/deny 校验；
- secrets 只存在安全配置；
- error redaction 必须覆盖 Authorization、key、token、cookie。

---

## 5. Orchestration 流程

### 5.1 生成图像

```text
User Message
→ OperationIntent(generate-image)
→ PromptPlan
→ ContextSnapshot.freeze()
→ CapabilityRequirement(text-to-image/image-to-image)
→ CapabilityResolver.resolve()
→ TaskRun.create()
→ Attempt.submit()
→ Output ArtifactRevision
→ LineageEdge
→ Message append result
```

### 5.2 稳定修改

```text
Selected ArtifactRevision
→ Edit Intent
→ Keep/Change extraction
→ PromptPlan with constraints
→ ContextSnapshot includes selected revision and user text
→ Capability match image-to-image / inpaint
→ TaskRun / Attempt
→ New ArtifactRevision
→ LineageEdge(parent/reference/mask)
```

### 5.3 图转视频

```text
Selected image revision
→ OperationIntent(image-to-video)
→ CapabilityRequirement(image-to-video)
→ Async Attempt submit
→ persist remoteTaskId immediately
→ poll or recover after restart
→ video ArtifactRevision
→ LineageEdge(video-source)
```

---

## 6. Migration Strategy

### 6.1 不一次性迁移

先影子写入，再正式迁移。

```text
Phase A: 保持 v1 conversation store，补充 generation / task 字段
Phase B: 新增 ExecutionRecord / ContextSnapshot 简化记录
Phase C: 新增 Project wrapper，旧 Conversation 映射默认 Thread
Phase D: 引入 AssetRevision 但保留 Asset.current 兼容
Phase E: 切换写路径到 Project store
Phase F: 删除旧写路径，只保留读兼容
```

### 6.2 迁移规则

- 旧 Conversation ID 保留；
- 旧 Asset ID 保留；
- 旧媒体 hash 尽量补齐；
- 无法证明来源的历史标 `record-only`；
- migration 必须 idempotent；
- 写新字段前 sanitizer/import/export 先支持。

---

## 7. IPC / Security

新增 IPC 必须：

- 使用版本化 DTO；
- runtime validate；
- 限制 payload size；
- 只传 ID / intent / params，不传 secrets；
- Main/Core 解析 provider credentials；
- Renderer 不直接构造 credentialed request；
- 任务事件有 sequence；
- cancellation / unsubscribe 明确；
- 导入数据经过 sanitizer；
- redacted logs。

危险输入：

```text
endpoint / headers / file path / model id / response parser / prompt template
```

这些都要在 Core 或 Main 侧校验。

---

## 8. Testing Gates

v1.0 架构承诺必须有测试对应：

| 承诺 | 测试 |
|---|---|
| Project migration 不丢数据 | golden fixtures + repeated migration equality |
| ContextSnapshot 可复现 | ordering/hash tests |
| CapabilityResolution 可解释 | fake adapters + coercion tests |
| TaskRun 可恢复 | crash/restart/poll/retry tests |
| Attempt 不覆盖历史 | retry invariants |
| secrets 不落盘 | sanitizer/export/redaction tests |
| Lineage 与 Pipeline 不混 | domain invariant tests |
| WorkspaceMode 互斥 | renderer projection tests：`canvas` 不挂 Pipeline，`pipeline` 不挂 Grid/Infinite Canvas |
| Canvas 只是视图 | semantic/view-state separation tests |
| Renderer 不越权 | IPC fuzz / payload limit tests |
| 远程复现不夸大 | reproducibility level tests |

基线仍然是：

```bash
npm run test:core
npm run typecheck
npm run build
```

已知：当前 v0.5.1 仍需先修 `npm run test:core` 跨平台 basename 问题。

---

## 9. UI 投影规则

Renderer 不直接暴露内部模型名。

| 内部模型 | 默认 UI 说法 |
|---|---|
| Project | 项目 / 创作项目 |
| Thread | 创作记录 / 分支方向 |
| ContextSnapshot | 本轮上下文 |
| CapabilityResolution | 已选择的模型能力 |
| TaskRun / Attempt | 生成任务 / 重试记录 |
| ArtifactRevision | 作品版本 |
| Lineage | 来源记录 |
| WorkspaceMode | 工作区形态 |
| PipelineDocument | 高级流程 |

默认 UI 只展示：

```text
描述 → 生成 → 选择 → 修改 → 转视频 → 来源 → 继续
```

Pipeline / Agent / Context / Replay 通过展开层进入。WorkspaceMode 控制当前主工作区投影：`canvas` 显示网格/无限画布，`pipeline` 显示 Pipeline；两者不得同时作为主工作区渲染。

---

## 10. Plan B

如果 v1.0 完整核心过重，保留未来缝合点，退到：

1. 不引入完整 Project store，只在 Conversation 上加 `projectId/defaultThreadId` 包装；
2. 不实现完整 Pipeline，只做线性 Recipe，并保持 `workspaceMode='canvas'`；
3. 不做多 Agent 集群，只做一个 Prompt Planner；
4. 不做完整 AssetRevision，只给 Asset 增加 `revisionId/mediaHash/replayRecipe`；
5. 不做自动上下文检索，只做显式 pinned context；
6. 不承诺 exact replay，只先支持 recipe-level replay；
7. Canvas 继续只是素材整理，Lineage 用详情页展示；不把画布伪装成 Pipeline。

Plan B 不能创建另一套会被丢弃的数据模型；字段命名要能自然升到 v1.0。

---

## 11. 实施顺序建议

### Step 1：v0.6 工程基线

- 修 `npm run test:core`；
- 补 `Asset.generation`；
- 补视频任务恢复；
- 补 theme/language/fontSize；
- 抽基础组件。

### Step 2：v0.7 Replay 最小闭环

- `ExecutionRecord`；
- `ContextSnapshotLite`；
- `mediaHash`；
- `reproducibilityLevel`；
- import/export fixture。

### Step 3：v0.8 Project / Thread 包装

- Project wrapper；
- default Thread；
- Shared Assets；
- Pinned Context；
- 多窗口只投影 Thread。

### Step 4：v0.9 Capability / Stable Edit

- CapabilityRequirement / Offer / Resolution；
- adapter schema；
- Stable Edit UI；
- PromptPlan；
- requested/effective params。

### Step 5：v1.0 WorkspaceMode 系统

- Agent panel；
- WorkspaceMode 设置开关；
- Pipeline Mode；
- Canvas Mode：Grid / Infinite Canvas；
- Lineage overlay；
- Replay recipe drawer；
- ArtifactRevision 正式化。

---

## 12. Definition of Done

v1.0 架构可进入实现，需要满足：

- 默认 UI 不要求用户理解内部术语；
- 领域模型能表达多 Thread、上下文、能力、任务、来源和复现；
- 任务能 crash/retry/recover；
- 自定义 API 不导致 secrets 或 arbitrary headers 泄漏；
- Pipeline / Canvas / Lineage 三者边界清楚，且 Pipeline 与 Canvas 不同时作为主工作区；
- 旧数据迁移可验证；
- 复现等级诚实；
- 所有新持久字段有 sanitizer、import/export 和测试。
