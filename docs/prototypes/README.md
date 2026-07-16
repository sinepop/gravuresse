# Gravuresse Prototypes

本目录只保留两条清楚的原型线：

```text
Current implementation line：v0.5.1，贴合现有浅色双区架构
Vision line：v1.0，北极星方向，不直接替代当前实现线
```

---

## 1. Current implementation line

源码：

```text
docs/prototypes/gravuresse-vnext-prototype.html
```

截图目录：

```text
docs/prototypes/screens/
```

截图：

| 文件 | 用途 |
|---|---|
| `01-current-workspace-light.png` | 默认浅色工作区 |
| `02-asset-detail-continue.png` | 素材详情与继续创作 |
| `03-video-task-recovery.png` | 视频任务恢复 |
| `04-preferences-theme-language.png` | 设置 / 主题 / 语言 |
| `05-dark-theme-preview.png` | 深色主题预览 |
| `06-ui-specification.png` | v0.5.1 UI 规范板 |

导出脚本：

```bash
xvfb-run -a -s "-screen 0 1280x1200x24" npx electron --no-sandbox scripts/capture-vnext-prototype.cjs
```

---

## 2. Vision line

源码：

```text
docs/prototypes/gravuresse-vision-prototype.html
```

截图目录：

```text
docs/prototypes/vision-screens/
```

截图：

| 文件 | 用途 |
|---|---|
| `01-default-creative-workspace.png` | 默认创作工作区 |
| `02-prompt-agent-panel.png` | Prompt Agent 协作 |
| `03-stable-edit-mode.png` | 稳定修改模式 |
| `04-provider-capability-config.png` | API 能力配置 |
| `05-multi-thread-context.png` | 多 Thread 上下文 |
| `06-pipeline-advanced-view.png` | Pipeline 高级视图 |
| `07-infinite-canvas-lineage.png` | 无限画布 + 来源记录 |
| `08-vision-ui-specification.png` | v1.0 UI 规范板 |

导出脚本：

```bash
xvfb-run -a -s "-screen 0 1440x1000x24" npx electron --no-sandbox scripts/capture-vision-prototype.cjs
```

---

## 3. 文档对应关系

| 文档 | 作用 |
|---|---|
| `docs/PRD.md` | 当前实现线 PRD |
| `docs/SPEC.md` | 当前实现线技术规格 |
| `docs/UI-GUIDELINES.md` | 当前实现线 UI 规范 |
| `docs/VISION-PRD.md` | v1.0 北极星 PRD |
| `docs/VISION-SPEC.md` | v1.0 核心架构 SPEC |
| `docs/VISION-UI-GUIDELINES.md` | v1.0 UI/UX 规范 |

---

## 4. 清理说明

已删除旧平台化原型遗留：

```text
docs/prototypes/gravuresse-ui-system-board.html
docs/prototypes/assets/rain-city-red-umbrella.png
```

原因：它们引用已经不存在的旧截图和旧信息架构，会误导后续评审。

---

## 5. 边界

- Current line 用于近期真实开发；
- Vision line 用于长期方向和架构评审；
- 不要用 Vision line 的复杂模型直接覆盖 v0.5.1 当前实现；
- 不要把 Pipeline / Agent / ContextSnapshot 等内部词泄漏到默认用户路径。
