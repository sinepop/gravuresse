# 更新日志 / Changelog

本文件仅保留当前版本与未发布变更摘要。完整的逐版本发布记录、日期和下载资产请查看 [GitHub Releases](https://github.com/sinepop/gravuresse/releases)。

This file keeps only the current release and unreleased highlights. See [GitHub Releases](https://github.com/sinepop/gravuresse/releases) for the complete version history, dates, and downloadable assets.

## 未发布 / Unreleased

### 中文

- AI Studio UI 集成：紧凑 sidebar、顶部 topbar/breadcrumb、chat+canvas 双区布局。
- 新增 `general.workspaceMode` 配置（canvas/pipeline 互斥），Settings General 区 SegmentedControl 切换。
- Pipeline 模式：诚实 placeholder，汇总素材计数，不声称已有真实执行引擎。
- 新增 UI 基础组件：Pill、StatusBadge、SegmentedControl、EmptyState（`src/components/ui/`）。
- AssetCard badge 改用 i18n key（`imageAsset` / `videoAsset`），不再硬编码。
- Settings 中所有 warning 色统一使用 `var(--warning)` CSS token，移除硬编码 `#f59e0b`。
- 修复 Windows 风格路径导入泄露完整本地路径（`crossPlatformBasename` 兼容 `/` 和 `\`）。
- 移除应用图标中不参与渲染的 C2PA 来源元数据，并增加 PNG 元数据审计门禁。
- 加固秘密审计：强制检查被跟踪的 Agent/凭据文件、扩大令牌与文件名规则、停止输出任何命中值片段。
- 删除 README 中不必要的个人画像，新增无个人联系方式的安全披露说明。
- 精简打包依赖并排除 source map，阻止桌面应用被误发布到 npm。
- 会话新增 `CanvasDocumentV1` 子文档，保存 grid/free 视图、自由画布视口、lineage、绘图工具状态、素材位置和向量标注；旧 `Asset.x/y` 仅作为兼容影子字段。
- 视频任务重启恢复改用 `taskId` + `connectionId` + `providerId` + `model` 恢复键；轮询异常/未知状态不再落终态失败，新增 `lastPolledAt`，新任务不再持久化 `baseUrl/accountId`。
- Settings General 区补齐自动保存图片和自动保存视频开关；release 审计阻止强制跟踪 `.audit/` 工作产物。

### English

- AI Studio UI integration: compact sidebar, topbar/breadcrumb, chat+canvas dual-pane layout.
- New `general.workspaceMode` config (canvas/pipeline mutual exclusion) with SegmentedControl in Settings General.
- Pipeline mode: honest placeholder summarizing asset counts; no claim of a real execution engine.
- New UI primitives: Pill, StatusBadge, SegmentedControl, EmptyState (`src/components/ui/`).
- AssetCard badges now use i18n keys (`imageAsset` / `videoAsset`) instead of hardcoded labels.
- All warning colors in Settings unified to `var(--warning)` CSS token; removed hardcoded `#f59e0b`.
- Fixed Windows-style path import leaking full local paths (`crossPlatformBasename` handles both `/` and `\`).
- Removed non-rendering C2PA provenance metadata from the application icon and added a PNG metadata audit gate.
- Hardened secret auditing for tracked agent/credential files, additional token and filename classes, and zero-value output.
- Removed unnecessary personal-profile details from the README and added security reporting guidance without personal contact details.
- Reduced packaged runtime dependencies, excluded source maps, and blocked accidental npm publication.
- Conversations now include a `CanvasDocumentV1` child document for grid/free view, free-canvas viewport, lineage, tool state, asset positions, and vector annotations; legacy `Asset.x/y` remains only as a compatibility shadow.
- Video task restart recovery now uses the `taskId` + `connectionId` + `providerId` + `model` recovery key; poll exceptions/unknown remote states are non-terminal, `lastPolledAt` is persisted, and new tasks no longer persist `baseUrl/accountId`.
- Settings General now exposes image/video auto-save toggles; release auditing blocks force-tracked `.audit/` work products.

## v2.4.0 — 2026-07-11

### 中文

- 将供应商设置整理为账户、API 密钥、自定义中转和默认模型搭配四个清晰入口。
- 增加真实连接验证、远程模型发现和生成能力归一化。
- 收紧素材、URL、认证和生成任务的数据边界，同时保留旧配置兼容性。
- 完善类型检查、核心测试、运行时检查、ASAR 审计、校验和与 Windows 冒烟测试。

### English

- Organized provider settings into Accounts, API Keys, Custom Relays, and Default Model Pairing.
- Added evidence-backed connection validation, remote model discovery, and normalized generation capabilities.
- Tightened asset, URL, authentication, and generation-task boundaries while preserving legacy configuration compatibility.
- Expanded type checks, core tests, runtime validation, ASAR auditing, checksums, and Windows smoke tests.
