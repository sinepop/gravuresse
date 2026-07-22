# Gravuresse v1.0 Vision UI/UX Guidelines

> 状态：Vision v1.0 UI 规范（不替代 v0.5.1 当前实现线）
> 日期：2026-07-16
> 对应文档：`docs/VISION-PRD.md`、`docs/VISION-SPEC.md`
> 原型：`docs/prototypes/gravuresse-vision-prototype.html`
> 截图：`docs/prototypes/vision-screens/`

---

## 1. 总原则

Gravuresse v1.0 的 UI 不是把所有高级能力一次性摊开，而是三层渐进：

```text
默认层：描述、生成、选择、修改
高级层：上下文、稳定修改、来源记录
专家层：Agent、Pipeline、自定义 API、复现配方
```

核心判断：

> **底层可以复杂，默认界面必须让用户觉得自己在描述、选择和修改，而不是操作工程控制台。**

---

## 2. 8 张愿景原型图

| 文件 | 屏幕 | 证明点 |
|---|---|---|
| `01-default-creative-workspace.png` | 默认创作工作区 | 当前双区架构升级为 v1.0 默认入口 |
| `02-prompt-agent-panel.png` | Prompt Agent 协作 | Agent 帮助澄清/结构化，不表演聊天群 |
| `03-stable-edit-mode.png` | 稳定修改模式 | 简单/稳定/专家三层修改控制 |
| `04-provider-capability-config.png` | API 能力配置 | 自定义 API 是能力系统，不是乱填表 |
| `05-multi-thread-context.png` | 多 Thread 上下文 | 多会话共享项目素材但上下文可控 |
| `06-pipeline-advanced-view.png` | Pipeline 高级视图 | Pipeline 是专家视图，不是默认入口 |
| `07-infinite-canvas-lineage.png` | 无限画布 + 来源 | Canvas/Lineage/Pipeline 边界清楚 |
| `08-vision-ui-specification.png` | v1.0 UI 规范板 | 三层界面、组件、状态、复现等级和禁区 |

---

## 3. 信息架构

### 3.1 默认工作区

```text
App Shell
├─ Module Rail
├─ Thread / Chat Panel
├─ Creation Composer
├─ Asset Canvas / Gallery
└─ Asset Detail / Context Drawer
```

默认只出现用户语言：

- 创作项目；
- 创作记录；
- 本轮上下文；
- 参考素材；
- 继续修改；
- 生成视频；
- 来源记录；
- 复现配方。

不出现内部语言：

- CapabilityResolution；
- ContextSnapshot；
- Attempt；
- ArtifactRevision；
- LineageEdge；
- WorkflowGraph。

### 3.2 专家入口

专家能力必须通过明确入口进入：

| 入口 | 位置 | 默认状态 |
|---|---|---|
| Agent 建议 | Composer 附近 | 半展开 |
| 稳定修改 | AssetDetail 动作后 | 展开 |
| API 能力 | Settings / Provider | 折叠 |
| Pipeline | 顶部视图切换 | 非默认 |
| Lineage | Canvas overlay | 关闭 |
| Replay Recipe | AssetDetail | 折叠 |

---

## 4. 视觉风格

延续 v0.5.1：

```text
浅色默认、精致组件、细边界、轻阴影、媒体优先、状态明确、深色同构。
```

v1.0 新增要求：

- 高级面板要“可信”，不能像营销卡片；
- Agent 建议用审查/建议样式，不像聊天机器人水泡；
- Pipeline 节点要克制，避免紫色 AI 工作台模板感；
- Canvas 背景轻网格即可，不能抢媒体；
- 来源关系线默认弱显示，用户打开 overlay 后增强；
- 复现等级用文字 + icon + 说明，不只靠颜色。

---

## 5. 组件系统

### 5.1 新增 v1.0 组件

| 组件 | 用途 |
|---|---|
| `ProjectSwitcher` | 切换创作项目 |
| `ThreadTabs` | 多创作记录 / 多窗口上下文 |
| `ContextDrawer` | 展示本轮上下文来源 |
| `AgentSuggestionCard` | Agent 澄清和 prompt 建议 |
| `StableEditPanel` | 保持/改变/参考/专家参数 |
| `CapabilityCard` | 展示某 API/model 支持的能力 |
| `PipelineNode` | 高级流程节点 |
| `CanvasNote` | 画布便签 / Prompt Brief |
| `LineageOverlay` | 来源关系显示 |
| `ReplayRecipeDrawer` | 复现配方与复现等级 |

### 5.2 状态语言

| 内部状态 | 用户文案 |
|---|---|
| `blocked` | 需要选择模型能力 |
| `unknown` | 状态未知，可手动检查 |
| `not-resumable` | 无法自动恢复 |
| `recipe` | 可按配方尽量复现 |
| `record-only` | 仅保留记录 |
| `context-frozen` | 本轮上下文已固定 |

---

## 6. Stable Edit UI

默认文案：

```text
修改这张图
├─ 保持什么
├─ 改变什么
├─ 参考哪些素材
└─ 高级参数
```

不要默认显示：

```text
黑盒 / 白盒 / CFG / sampler / ControlNet / mask graph
```

这些进入专家折叠区。

---

## 7. API 能力配置 UI

Provider 设置分成两层：

```text
基础连接
├─ 名称
├─ Endpoint
├─ API Key
└─ 默认模型

能力描述
├─ 支持的操作
├─ 输入类型
├─ 输出类型
├─ 参数 schema
├─ 同步/异步
└─ 查询方式
```

密钥永远显示为：

```text
[REDACTED]
```

不得回显真实 key、token、cookie、Authorization header。

---

## 8. Canvas / Pipeline / Lineage 边界

| 视图 | 解决什么 | 不解决什么 |
|---|---|---|
| Canvas | 素材空间整理和灵感板 | 执行真相 |
| Pipeline | 高级计划和执行步骤 | 历史事实 |
| Lineage | 实际来源和结果关系 | 用户排版 |

UI 上三者可以叠加显示，但数据和命名必须分开。

---

## 9. 复现等级 UI

| 等级 | 标签 | 说明 |
|---|---|---|
| exact | 精确复现 | 本地确定性操作 |
| seeded | 种子复现 | 固定 seed/model，按模型保证 |
| recipe | 配方复现 | 记录完整配方，远程服务尽量接近 |
| record-only | 仅记录 | 仅审计，不承诺重做 |

远程生图/生视频默认最多显示 `recipe`，除非 provider 明确保证。

---

## 10. Do / Don’t

### Do

- 默认仍从对话和素材开始；
- 高级能力渐进展开；
- Agent 输出可审查；
- 每次生成可解释“用了什么”；
- Pipeline/Canvas/Lineage 边界清楚；
- 复现等级诚实；
- 自定义 API 能力检测可见；
- 密钥永不回显。

### Don’t

- 不把默认界面做成节点编辑器；
- 不让 Agent 绕过用户确认调用模型；
- 不让 Canvas 承担执行真相；
- 不把 Lineage 当用户排版；
- 不承诺远程模型像素级复现；
- 不在默认路径暴露内部类型名；
- 不给用户没要求的 Provider 预设。

---

## 11. 验收门禁

- [ ] 3 秒内知道如何开始生成；
- [ ] 不打开专家视图也能完成第一张图；
- [ ] 选中素材后能稳定修改和生成视频；
- [ ] Agent 建议可接受、编辑或忽略；
- [ ] 本轮上下文可查看；
- [ ] 自定义 API 能力可检测；
- [ ] Pipeline 非默认但可进入；
- [ ] Canvas 和 Lineage 不混淆；
- [ ] Replay Recipe 显示复现等级；
- [ ] light/dark 同构；
- [ ] zh/en 文案可管理；
- [ ] secrets 不出现在 UI 截图或导出数据里。
