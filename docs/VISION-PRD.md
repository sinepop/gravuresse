# Gravuresse v1.0 North Star PRD

> 状态：Vision v1.0（北极星产品需求，不直接替代 v0.5.1 当前实现线）
> 日期：2026-07-16
> 当前实现基线：`docs/PRD.md` / `docs/SPEC.md` / commit `ce1c34a`
> 文档目标：把 Gravuresse 从“AI 生图/视频桌面工具”明确为“对话 + Agent + 多 API + 可复现视觉创作系统”的长期产品方向，同时保留当前简单默认体验。

---

## 0. 一句话结论

Gravuresse v1.0 的北极星不是“更复杂的生图软件”，而是：

> **一个本地优先、可配置多模型 API、由对话和 Agent 协作驱动的 AI 图像/视频创作系统，帮助用户把脑海中的画面通过多轮生成、稳定修改、上下文管理和可追溯复现逐步实现。**

当前 v0.5.1 的浅色双区工作区继续作为默认入口；v1.0 在它背后增加 Project / Thread / Context / Capability / Task / Revision / Lineage / WorkspaceMode 等核心能力。其中 Pipeline 与 Canvas 是互斥工作区形态，不是同时出现的两个主界面。

原则：

```text
默认体验简单；底层能力完整；高级控制渐进展开。
```

---

## 1. 第一性原理

用户真正想要的不是“节点”“Agent 集群”“API 表单”本身，而是：

```text
我脑海里有一个画面
→ 我能把它说出来
→ 系统能帮我补全提示词和视觉约束
→ 系统能选择合适的模型/API
→ 我能生成候选并比较
→ 我能稳定修改满意的部分
→ 我能知道作品怎么来的
→ 我能下次接着做，并尽量复现
```

因此 v1.0 的核心闭环是：

```text
Idea → Prompt Plan → Capability Match → Generation → Selection → Stable Edit → Revision → Context Carryover → Replay
```

任何功能都必须服务这条链路。

---

## 2. 产品定位

### 2.1 目标产品

Gravuresse 是面向个人创作者、设计学生、AI 视觉实验者和小型创意团队的 AI 视觉创作系统。

它整合：

- Lovart 类“对话式视觉创作”；
- LivTV / 图转视频类“图像到视频链路”；
- 自定义 API / Provider 能力配置；
- Agent 协作式 prompt 规划；
- 稳定修改与来源追踪；
- 多 Thread 上下文；
- 可切换的工作区形态：Pipeline 模式或 Canvas 模式；
- Canvas 模式下的网格 + Infinite Canvas 素材/关系视图。

### 2.2 不是什么

Gravuresse v1.0 不是：

- 默认节点流程编辑器；
- 云端团队协作平台；
- 全 Provider 市场；
- 通用 Agent IDE；
- 仅靠 prompt 输入框的轻工具；
- 承诺远程模型像素级复现的软件。

---

## 3. 产品分层

### 3.1 默认层：对话创作

面向第一次打开和日常快速创作。

用户看到：

```text
创作记录 + 输入框 + 生成候选 + 素材详情 + 继续创作动作
```

默认层不出现：

```text
WorkflowGraph / ContextSnapshot / CapabilityResolution / Attempt / LineageEdge
```

用户语言是：

```text
创作记录、参考、生成说明、继续修改、生成视频、来源记录、上下文
```

### 3.2 高级层：稳定修改与上下文

面向已经生成候选、想逼近脑海画面的用户。

能力包括：

- Prompt Agent 协助澄清；
- 保持 / 改变 / 参考权重；
- 选中素材作为上下文；
- 查看本轮上下文；
- 查看生成说明；
- 对比版本；
- 图转视频任务恢复。

### 3.3 专家层：Workspace Mode / Agent / API / Lineage

面向高阶用户和复杂项目。

能力包括：

- Workspace Mode 设置：Pipeline 或 Canvas 二选一；
- Pipeline 高级视图；
- 自定义 API 能力配置；
- Agent 角色和协作链；
- ContextSnapshot 详情；
- Lineage / Replay 记录；
- Canvas 模式下的 Infinite Canvas 关系视图；
- 参数 diff 和复现等级。

---

## 4. 核心模块

### 4.1 Project / Thread

用于解决多对话窗口、上下文完整性和共享素材。

用户目标：

- 一个创作项目里可以有多个对话方向；
- Thread A 和 Thread B 可以共享素材；
- 用户可以 pin 某些素材、事实或风格为项目上下文；
- 对开会话不互相污染，但可以显式引用。

核心需求：

| 模块 | 用户能力 |
|---|---|
| Project | 管理一个创作主题或作品集 |
| Thread | 同一项目下的一个创作方向 |
| Shared Assets | 项目内共享素材池 |
| Pinned Context | 显式加入上下文的素材/说明/风格 |
| Context Drawer | 本轮生成用了什么上下文 |

### 4.2 Prompt Agent 协作

Agent 集群不是“多人聊天表演”，而是提高提示词准确性的协作层。

推荐默认 Agent：

| Agent | 作用 | 是否默认显示 |
|---|---|---|
| Intent Clarifier | 澄清用户脑海画面 | 是 |
| Prompt Builder | 结构化 prompt | 是 |
| Visual Consistency Critic | 检查角色/风格/构图一致性 | 高级 |
| Model Router | 判断适合的能力/API | 高级 |
| Edit Planner | 将修改要求拆成保持/改变/参考 | 高级 |

用户默认看到的是：

```text
提示词建议 / 还需要确认的问题 / 本轮会保持什么 / 本轮会改变什么
```

不是 Agent 内部任务图。

### 4.3 Capability / API 配置

自由配置 API 的核心不是“多几个表单”，而是能力抽象。

用户需要配置：

- API endpoint；
- auth 方式；
- model；
- operation：text-to-image / image-to-image / image-to-video / video-to-video / upscale / inpaint；
- 参数 schema；
- 输入输出类型；
- 同步/异步任务；
- 任务查询方式。

产品要求：

- 不预设未经用户要求的服务；
- 密钥不回显；
- 能力检测失败要说明；
- 模型不可用时不能静默换模型；
- 参数被系统改写时必须记录 effective params。

### 4.4 Stable Edit：简单 / 稳定 / 专家

黑盒 / 白盒作为内部概念可以存在，但用户更适合看到：

| 用户模式 | 含义 | 默认程度 |
|---|---|---|
| 简单修改 | 只说想改什么 | 默认 |
| 稳定修改 | 明确保持/改变/参考 | 高级默认 |
| 专家修改 | Prompt diff、seed、mask、参数、Pipeline | 折叠 |

核心能力：

- 保持：角色、构图、色调、镜头、风格；
- 改变：表情、动作、天气、服装、背景；
- 参考：图片、视频帧、文字风格；
- 稳定项：seed、参考权重、mask、模型版本；
- 输出：新的 ArtifactRevision。

### 4.5 Asset / Revision / Lineage

v1.0 需要从“素材文件”升级为“可追溯作品版本”。

核心概念：

| 概念 | 用户语言 | 作用 |
|---|---|---|
| Asset | 作品/素材 | 当前可见对象 |
| ArtifactRevision | 版本 | 每次生成或修改的不可变结果 |
| Lineage | 来源记录 | 说明它从哪些素材和任务来 |
| Replay Recipe | 重做配方 | 记录 prompt、模型、参数、上下文 |

复现等级必须诚实：

| 等级 | 含义 |
|---|---|
| exact | 本地确定性操作，可精确复现 |
| seeded | 固定 seed/model，按模型保证复现 |
| recipe | 配方完整，但远程模型只保证尽量接近 |
| record-only | 只保留历史记录，不承诺重做 |

### 4.6 Workspace Mode：Pipeline 与 Canvas 二选一

v1.0 不把 Pipeline、网格和无限画布同时塞进主工作区。设置里提供“工作区形态”开关：

| 模式 | 主工作区 | 取消/隐藏 | 适合用户 |
|---|---|---|---|
| Canvas Mode | 网格 + Infinite Canvas + 素材详情 | Pipeline 节点主视图 | 日常创作、整理素材、选中继续修改 |
| Pipeline Mode | Pipeline 节点、执行顺序、节点输出和状态 | 网格视图、自由/无限画布入口 | 专家用户编排复杂生成链路 |

核心规则：

- 默认 `Canvas Mode`；
- 使用 Pipeline 形式时，取消网格和无限画布主视图；
- 不用 Pipeline 形式时，就是网格 + 自由/无限画布形式；
- 切换工作区形态不删除素材、消息、任务或来源记录；
- 不承诺 Pipeline 与自由/无限画布无损互转；
- Lineage 是历史事实层，可投影到当前工作区，但不决定工作区形态。

### 4.7 Pipeline Mode

Pipeline 是专家工作区形态，不是默认首页。

它表达“计划怎么执行”：

```text
Intent → Prompt Plan → Image Generation → Selection → Edit → Video Generation → Post-process
```

要求：

- Pipeline 节点引用真实 Task / Revision；
- 不同 Provider 的能力差异可见；
- Pipeline 可由对话生成初稿；
- 用户可手动调整节点；
- Pipeline Mode 下不显示 Grid / Free Canvas / Infinite Canvas 主视图。

### 4.8 Canvas Mode：Grid + Infinite Canvas

Canvas 表达“素材和想法如何摆放”，不是执行真相。

能力：

- Grid 用于快速浏览、筛选和选择素材；
- Infinite Canvas 用于摆放图片、视频、参考图、便签、Prompt Brief；
- 显示选中素材详情；
- 可开关 Lineage overlay；
- 可从素材发起继续生成；
- 可作为项目灵感板。

不承担：

- 任务调度唯一真相；
- Agent 执行状态唯一真相；
- Pipeline 语义唯一真相；
- Pipeline Mode 的节点主视图。

### 4.9 ContextSnapshot

“完整上下文”必须变成“明确、可冻结、可解释的上下文”。

用户应能看到：

- 本轮包含哪些消息；
- 包含哪些素材；
- 包含哪些项目事实；
- 哪些内容被截断；
- 估计 token；
- 快照创建时间；
- 快照 hash。

要求：

- 执行开始前冻结；
- 冻结后不再读 live UI；
- 可用于回放和审计；
- 不自动包含无关 Thread。

---

## 5. 用户关键场景

### AC-01：对话生成候选图

用户输入画面想法，Agent 帮助结构化 prompt，系统匹配可用图像模型，生成 3–4 张候选，用户选择满意结果。

### AC-02：稳定修改

用户选中候选图，说明“保持红伞和构图，雨变成薄雾”，系统展示保持/改变项并生成新版本。

### AC-03：图转视频

用户选中图片，选择视频模型，系统提交异步任务，重启后可恢复或显示 unknown/not-resumable。

### AC-04：多 Thread 创作

用户在同一项目下打开两个创作方向，一个做角色，一个做场景；二者共享素材池，但上下文默认隔离。

### AC-05：自由 API 配置

用户添加一个自定义图像 API，填写 endpoint、auth、模型、参数 schema 和任务查询方式；系统检测能力并在生成时匹配。

### AC-06：Workspace Mode 切换

用户在设置中选择 Canvas Mode 时，主工作区显示网格 + Infinite Canvas；选择 Pipeline Mode 时，主工作区显示 Pipeline 节点、执行顺序和节点输出，并取消网格与无限画布入口。

### AC-07：Pipeline 高级控制

在 Pipeline Mode 下，用户把当前对话转成 Pipeline，查看 Prompt refinement、Image generation、Upscale、Image-to-video 等节点，并修改某个节点参数。

### AC-08：Canvas + Lineage

在 Canvas Mode 下，用户在无限画布上整理素材，打开来源记录 overlay，看到候选图来自哪个 prompt、参考图、模型和任务。

### AC-09：复现记录

用户打开某个结果的 Replay Recipe，看到 prompt、参考、模型、参数、context snapshot 和复现等级。

---

## 6. 分阶段产品路线

### v0.6：当前产品稳定化

- 修复测试基线；
- 补 `Asset.generation`；
- 补视频任务恢复；
- 补主题 / 语言 / 字号验收；
- 抽基础组件。

### v0.7：可复现基础

- 引入简化 `ExecutionRecord`；
- 引入简化 `ContextSnapshot`；
- 强化 `GenerationRecord`；
- 记录 reference hash / prompt / model / params。

### v0.8：Project / Thread 壳

- 一个 Project 默认包一组 Thread；
- 当前 Conversation 迁为默认 Thread；
- 增加 Shared Assets 和 Pinned Context；
- 不做复杂分支合并。

### v0.9：Capability + Stable Edit

- 引入 CapabilityRequirement / Offer / Resolution；
- 自定义 API schema；
- 修改模式：简单 / 稳定 / 专家；
- Prompt diff 和参数 diff。

### v1.0：Agent + Workspace Mode + Lineage

- Agent Planner / Critic / Model Router；
- Workspace Mode 设置开关；
- Pipeline Mode；
- Canvas Mode：Grid + Infinite Canvas；
- Lineage overlay；
- ArtifactRevision；
- Replay Recipe。

---

## 7. Go / No-Go

### Go

可以推进 v1.0 方向的条件：

- 默认入口仍可 3 分钟内完成第一张图；
- 高级能力不污染默认 UI；
- 每个新模型都有数据所有者和测试门禁；
- 任务、上下文、能力、来源互相分清；
- Provider 自定义不要求硬编码服务；
- 安全边界不退化。

### No-Go

立即停止或降级的信号：

- 默认界面变成工程控制台；
- Pipeline 和 Canvas 同时作为主工作区，或混成一个万能图；
- Agent 可以绕过用户确认直接调用付费模型；
- Renderer 成为任务和凭据的唯一真相；
- 远程生成被承诺像素级复现；
- 为了 v1.0 直接打断 v0.6 当前可用闭环。

---

## 8. 成功指标

### 产品指标

- 用户能从一句话进入第一次生成；
- 用户能稳定修改选中结果；
- 用户能理解本轮为什么这样生成；
- 用户能在多 Thread 中控制上下文；
- 用户能配置至少一种自定义 API 并完成能力检测；
- 用户能在设置中切换 Pipeline / Canvas，且不会同时面对两套主工作区；
- 用户能看到来源和复现等级。

### 工程指标

- ContextSnapshot 可重复生成 hash；
- TaskRun / Attempt 可恢复；
- CapabilityResolution 可解释；
- AssetRevision 不被历史修改污染；
- secrets 不进入项目数据；
- IPC 不接受任意 endpoint/headers；
- migration 有 golden fixtures；
- `test:core/typecheck/build` 通过。
