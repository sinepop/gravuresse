# Gravuresse vNext 技术规格（SPEC）

> 状态：Baseline v0.4（现有架构优先 / Minimal Incremental Spec）
> 日期：2026-07-16
> 对应 PRD：`docs/PRD.md`
> 目标：在 Gravuresse 现有 Electron + React 架构上补强最小创作闭环。**不新增独立项目、工作流、谱系、上下文、Agent 或通用任务系统。**

---

## 0. v0.4 技术结论

v0.3 SPEC 的方向过重：它把当前应用改造成一套新的本地创作平台。v0.4 改为承认并利用当前架构：

```text
Conversation
  ├─ messages: Message[]
  │   └─ tasks: MessageTask[]
  └─ assets: Asset[]
      └─ generation: Generation

Renderer
  ├─ App.jsx 管理会话切换与桥接保存
  ├─ useChat.js 负责编排聊天、图像/视频提交
  ├─ useCanvas.js 管理资产与视图状态
  └─ useTaskQueue.js 管理视频轮询队列

Main process
  ├─ electron/store.js 保存 conversations.json
  ├─ electron/security/sanitize.js 清洗导入/存储字段
  ├─ electron/ipc/conversation.js 提供会话导入导出 IPC
  └─ electron/providers/* 处理 Provider 调用、连接、凭据和安全
```

P0 技术原则：

1. **保留 schemaVersion 1**：只做少量 additive 字段，不做 v2 全量迁移。
2. **Conversation 继续是事实单元**：不新增独立项目/分支系统。
3. **Asset.generation 是最小来源记录**：不新增完整谱系/版本系统。
4. **MessageTask 是任务记录**：不新增通用任务引擎。
5. **Canvas 是视图和资产整理工具**：不升级为工作流编辑器。
6. **Provider connections 继续是能力来源**：不新增通用能力协商框架。
7. **Renderer 编排可保留**：本阶段不把所有领域真相迁入 Main Application Core。

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

| 类型 | 当前职责 | v0.4 处理 |
|---|---|---|
| `Conversation` | 会话/工作空间，含消息和资产 | 保留为 P0 顶层单元 |
| `Message` | 聊天记录，可含任务 | 保留为创作记录 |
| `MessageTask` | 图像/视频生成任务摘要 | 补强异步恢复所需字段 |
| `Asset` | 图像/视频/素材 | 保留为结果和参考素材 |
| `Generation` | 生成元数据 | 作为最小来源记录 |
| `ProviderProfile` / connections | 连接、模型、调用参数 | 沿用现有体系 |
| `VideoQueueTask` | Renderer 内视频轮询任务 | 改造成可从 MessageTask 恢复的运行态 |
| `CanvasController` | 资产列表、选中、网格/自由视图 | 保留，不承载工作流语义 |

### 1.3 关键文件所有权

| 文件 | 当前职责 | v0.4 改造重点 |
|---|---|---|
| `src/App.jsx` | 会话列表、当前会话、chat/canvas 同步保存 | 减少竞态，确保切换会话不丢消息/资产 |
| `src/hooks/useChat.js` | 聊天、生成、参考图、视频提交 | 确保任务和生成元数据写完整 |
| `src/hooks/useCanvas.js` | 资产状态、选中、网格/自由视图、undo/redo | 不扩大为业务引擎 |
| `src/hooks/useTaskQueue.js` | 视频任务轮询，当前依赖 React state/callback | 支持从持久 MessageTask 恢复轮询 |
| `src/utils/generationTasks.js` | 生成元数据构建 | 补齐 provider/model/source/taskId 字段 |
| `src/utils/conversationStore.js` | Renderer 侧 conversation patch 工具 | 继续作为轻量更新入口 |
| `electron/store.js` | `conversations.json` 原子保存、写队列 | 保留 schema v1 与原子写入 |
| `electron/security/sanitize.js` | 存储/导入字段清洗 | 允许 P0 新增的少量字段，防止被洗掉 |
| `electron/ipc/conversation.js` | 会话/项目导入导出 | 保留现有 IPC，不新增 Project IPC |
| `electron/providers/*` | Provider 调用、连接、凭据、安全 | 沿用，增加必要错误/限制反馈 |

### 1.4 当前必须先修的债务

1. `npm run test:core` 在 Linux 上有已知失败：Windows 路径 basename 安全标签错误；Phase 0 先修。
2. `useTaskQueue.js` 当前任务只在 React 内存中，重启后不可恢复。
3. `MessageTask` 目前不持久保存恢复轮询所需的完整连接/模型标识。
4. `sanitize.js` 不允许某些潜在新增字段，若先写 UI 字段会被清洗。
5. `App.jsx` 中 conversation、chat messages、canvas assets 存在多处同步逻辑，改造必须小步验证，不能大搬家。

---

## 2. 总体架构

### 2.1 目标架构图

```text
┌──────────────── Renderer / React ────────────────┐
│ App.jsx                                           │
│ ├─ Conversation list / active conversation         │
│ ├─ ChatPanel + useChat                             │
│ ├─ CanvasPanel + useCanvas                         │
│ ├─ TaskQueue + useTaskQueue                        │
│ └─ AssetDetail / AssetCard                         │
└──────────────────────┬────────────────────────────┘
                       │ existing IPC
┌──────────────── Main Process ─────────────────────┐
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

1. **不新建平台层**：不新增 `Application Core`、workflow service、agent service、context service。
2. **主进程继续负责安全和持久化**：凭据、Provider 调用、文件、导入导出和 sanitizer 留在 Main。
3. **Renderer 可继续编排 UI 任务**：P0 允许 `useChat` / `useTaskQueue` 编排生成流程，只要关键状态可持久化。
4. **状态来源清晰即可，不追求理论纯度**：Conversation JSON 是 P0 持久事实；React state 是当前视图和运行态。
5. **只加 P0 需要的字段**：字段必须服务“继续创作 / 任务恢复 / 生成说明”。
6. **现有导入导出兼容优先**：旧 `.gravuresse.json` 必须继续可读。

### 2.3 不采用 v0.3 架构的原因

| v0.3 设想 | v0.4 处理 | 原因 |
|---|---|---|
| 独立项目/分支系统 | P0 不做 | Conversation 已能承载当前项目粒度 |
| 工作流图 / 步骤投影 | P0 不做 | 当前用户只需要聊天 + 资产继续创作 |
| 独立画布文档 | P0 不做 | `Asset.x/y + viewMode` 已够用 |
| 完整谱系/版本系统 | P0 不做 | `Asset.generation` 已能表达最小来源 |
| 多会话上下文快照 | P0 不做 | 当前没有多会话上下文注入需求 |
| Agent 编排系统 | P0 不做 | 会显著扩大系统，不解决当前最小闭环 |
| 通用能力协商框架 | P0 不做 | 现有 Provider constraints/precheck 够用 |
| 通用任务引擎 | P0 不做 | 先用 MessageTask + queueId/taskId 补恢复 |

---

## 3. 数据模型

### 3.1 Conversation 保持 v1

当前存储文件仍为：

```ts
type ConversationStorePayload = {
  schemaVersion?: 1
  conversations: Conversation[]
  activeId: string | null
  deletedIds: string[]
}
```

`Conversation` 仍然是：

```ts
type Conversation = {
  id?: string
  title: string
  messages: Message[]
  assets: Asset[]
  createdAt?: string
  updatedAt?: string
}
```

P0 不新增顶层 `projects` 数组，不改变 `conversations.json` 根结构。

### 3.2 Asset.generation 是最小来源记录

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

- 图像和视频 Asset 都必须尽量写入 `generation`；
- 基于素材继续生成时必须写 `parentAssetId` 或 `sourceAssetIds`；
- prompt 参考素材写入 `promptReferenceAssetIds`；
- 视频任务完成后生成的 video Asset 写入远程 `taskId`；
- 不另建完整配方/谱系表。

### 3.3 MessageTask 补强异步恢复字段

当前 `MessageTask` 已有字段：

```ts
type MessageTask = {
  id: string
  type: 'image' | 'video'
  status: 'pending' | 'generating' | 'queued' | 'running' | 'done' | 'error' | 'partial'
  label: string
  prompt: string
  negative_prompt?: string
  ratio?: string
  duration?: number | string | null
  source_image_id?: string | null
  sourceAssetIds?: string[]
  promptReferenceAssetIds?: string[]
  parentAssetId?: string | null
  taskId?: string | null
  queueId?: string | null
  assetId?: string | null
  error?: string
}
```

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
- 不保存 API key、token、Authorization header、cookie；
- `connectionId` 只用于重新解析本地连接；
- 如果连接不存在，恢复状态标为 `not-resumable`；
- 如果远程状态无法确定，标为 `unknown`，不伪造失败。

### 3.4 Canvas 不新增业务模型

当前 `Asset` 已允许 `x/y`，`useCanvas` 已有 `viewMode: 'grid' | 'free'`。

P0 规则：

- 网格/自由视图只改变查看和整理方式；
- 不新增 canvas node/edge；
- 不把画布连线当作执行依赖；
- 不承诺工作流转换。

---

## 4. 任务与恢复

### 4.1 当前问题

`useTaskQueue.js` 的 `VideoQueueTask` 包含 `onComplete` / `onFail` callback，存在 React 内存里：

```ts
type VideoQueueTask = {
  id: string
  taskId: string
  prompt: string
  provider?: ProviderProfile
  status: 'pending' | 'running' | 'completed' | 'failed'
  onComplete?: (...) => unknown
  onFail?: (...) => void
}
```

这不能跨重启恢复，因为 callback 无法持久化。

### 4.2 P0 恢复策略

不要做通用任务引擎。只做视频任务恢复：

1. 提交视频任务成功后，立刻更新对应 `MessageTask`：
   - `status: 'queued'` 或 `'running'`；
   - `taskId`；
   - `queueId`；
   - `providerId`；
   - `connectionId`；
   - `model`；
   - `prompt` / `duration` / `sourceAssetIds`；
   - `submittedAt`。
2. 应用启动或会话加载后，扫描当前会话中 `type='video'` 且 `status in ['queued','running','generating','pending']` 且有 `taskId` 的任务。
3. 通过 `connectionId` 重新解析 Provider；无法解析则标 `recoveryStatus: 'not-resumable'`。
4. 可以解析则创建新的运行态 `VideoQueueTask`，但不依赖旧 callback。
5. 轮询成功后：
   - 创建 video Asset；
   - 更新 MessageTask 为 `done`，写入 `assetId`；
   - 写入 Asset.generation。
6. 轮询失败后：
   - 更新 MessageTask 为 `error`；
   - 写入错误；
   - 保留 taskId 和恢复字段。
7. 状态不确定时：
   - 设置 `recoveryStatus: 'unknown'`；
   - UI 提示用户检查连接或手动重试。

### 4.3 重试规则

P0 不做“多次尝试记录表”。重试采用简单规则：

- 原 MessageTask 保留错误；
- 新建一个新的 MessageTask 或在同一消息追加 task；
- 新 task 有新的 `id/queueId/submittedAt`；
- 不覆盖旧 task 的 `taskId/error`。

---

## 5. Provider 与能力限制

### 5.1 沿用当前体系

继续使用：

- `electron/providers/registry.js`；
- `electron/providers/connections.js`；
- `electron/providers/config-resolver.js`；
- `src/hooks/useChat.js` 里的 `canonicalModelSelection`；
- Provider constraints / precheck。

P0 不新增通用能力协商类型。

### 5.2 P0 能力反馈

提交前尽量检查：

- 当前连接是否存在；
- 当前模型是否支持目标 track；
- prompt 长度；
- negative prompt 是否支持；
- 视频时长范围；
- 是否必须提供 source image；
- ratio / resolution 是否被允许。

检查失败必须返回用户可理解文案，而不是内部 provider stack trace。

### 5.3 不保存秘密

持久化只允许：

- `providerId`；
- `connectionId`；
- `model`；
- `taskId`；
- 脱敏错误信息。

禁止持久化：

- API key；
- bearer token；
- session token；
- cookie；
- Authorization header；
- 临时签名 URL 作为唯一来源。

---

## 6. IPC 与存储

### 6.1 保留现有 IPC

P0 使用现有 IPC：

```text
history:get
history:save
conv:loadAll
conv:save
conv:delete
conv:setActive
conv:export
conv:exportProject
conv:import
```

不新增以下 IPC：

- `project:*`；
- `workflow:*`；
- `context:*`；
- `agent:*`；
- `lineage:*`。

### 6.2 sanitizer-first，但只针对少量字段

任何新增持久字段必须先改：

- `src/types/domain.ts`；
- `electron/security/sanitize.js`；
- import/export fixture；
- 相关测试。

本阶段只允许 `MessageTaskP0Additions` 这类 additive 字段。不要用 sanitizer-first 当借口做 schema v2。

### 6.3 原子保存保持不变

`electron/store.js` 的写队列和 temp file rename 保留：

- 不改存储根路径；
- 不改 `conversations.json` 根结构；
- 不引入 SQLite；
- 不做全库迁移。

---

## 7. UI 模块改造范围

### 7.1 `App.jsx`

允许改：

- 会话切换和保存竞态；
- `conversationBridge` 对任务/资产更新的辅助方法；
- 启动时恢复视频任务的入口；
- 错误提示。

不允许改成：

- 全新 Project store；
- 主进程领域服务客户端；
- workflow renderer。

### 7.2 `useChat.js`

允许改：

- 生成任务创建时写完整 MessageTask；
- 生成完成后写完整 Asset.generation；
- Provider precheck 错误文案；
- 基于资产继续生成的 source/parent 字段。

不允许改成：

- Prompt IR 编译器；
- Agent 编排器；
- 多步骤 workflow engine。

### 7.3 `useTaskQueue.js`

允许改：

- 支持从持久 MessageTask 创建运行态任务；
- 去除恢复路径对 callback 的依赖；
- 成功/失败通过 `conversationBridge.updateTask/addAsset` 写回；
- 轮询状态写入 `lastPolledAt/recoveryStatus`。

不允许改成：

- 通用任务系统；
- 多次尝试日志；
- 后台 daemon。

### 7.4 `AssetDetail.jsx` / `AssetCard.jsx`

允许改：

- 展示生成说明；
- 展示父素材/参考素材；
- 提供继续生成和图转视频入口；
- 显示错误/任务状态。

不允许改成：

- 谱系图编辑器；
- 复杂版本树。

### 7.5 `CanvasPanel.jsx`

允许改：

- 视觉整理体验；
- 筛选、查看、选中、自由视图；
- 从选中资产触发动作。

不允许改：

- 把画布变成 workflow graph；
- 用画布连线驱动生成逻辑。

---

## 8. 测试策略

### 8.1 必须先恢复基线

Phase 0 第一件事：修复已知 Linux `npm run test:core` 失败。之后基线门禁为：

```bash
npm run test:core
npm run typecheck
npm run build
```

### 8.2 新增测试

P0 必须补这些测试：

1. `sanitizeTask` 保留新增恢复字段，且不保留 secrets；
2. `buildGenerationMeta` 正确写入 parent/source/promptReference/taskId/provider/model；
3. 导出再导入后，Asset.generation 不丢；
4. pending/running 视频 MessageTask 可恢复为运行态轮询任务；
5. 连接缺失时任务标 `not-resumable`；
6. Provider 返回未知状态时不伪造成失败；
7. 重试不会覆盖原任务错误和 taskId；
8. 默认 UI 文案不出现 P0 禁止术语。

### 8.3 手动验收

- 文本生图；
- 参考图继续生成；
- 图片转视频；
- 视频任务中途关闭并重启；
- 导出/导入项目；
- 删除会话；
- 切换会话后资产不串。

---

## 9. 分阶段实施

### Phase 0：恢复基线和文档降维

- 修复 `npm run test:core` 已知失败；
- 确认 `typecheck/build` 通过；
- 删除 PRD/SPEC 对新平台架构的 P0 承诺；
- 明确 v0.3 UI 原型仅作为视觉参考。

### Phase 1：生成元数据补齐

- 检查所有图像/视频 Asset 创建路径；
- 补齐 `Asset.generation`；
- AssetDetail 展示生成说明；
- 测试导入导出不丢字段。

### Phase 2：视频任务最小恢复

- 扩展 `MessageTask` additive 字段；
- 扩展 sanitizer allowlist；
- 提交视频后立即保存 taskId/provider/model/connection；
- 启动/加载会话时恢复轮询；
- 不可恢复时明确标记。

### Phase 3：继续创作入口

- 资产卡片/详情增加“作为参考继续生成”；
- 图片增加“生成视频”；
- 确保 parent/source ids 写入；
- 错误文案用户可读。

### Phase 4：体验整理

- 当前会话工作区更清楚；
- 资产区筛选/详情/操作更顺；
- 连接页只优化当前体系，不新增 Provider；
- 根据真实使用决定是否需要 P1 项目模型。

---

## 10. Definition of Done

v0.4 P0 完成必须满足：

- 没有新增独立项目、分支、工作流、谱系、Agent 或通用任务系统；
- `conversations.json` 仍兼容旧数据；
- 文本生图、参考图继续生成、图转视频完整可用；
- 视频任务重启后能恢复或明确 unknown/not-resumable；
- AssetDetail 能解释作品怎么来的；
- import/export 保留 P0 必需元数据；
- secrets 不进入 Conversation/Asset/MessageTask；
- `npm run test:core`、`npm run typecheck`、`npm run build` 通过；
- 默认 UI 不泄漏复杂内部术语。

---

## 11. Plan B

如果视频任务恢复改动仍然牵扯过大，退一步：

1. 提交视频后至少保存 `taskId/provider/model/prompt/sourceAssetIds` 到 MessageTask；
2. 重启后不自动轮询，只显示“有未完成远程任务，可手动检查”；
3. 提供“重新查询状态”按钮；
4. 查询成功再创建 video Asset；
5. 查询失败保持 unknown。

这个 Plan B 仍然使用现有 Conversation/MessageTask，不引入新架构。
