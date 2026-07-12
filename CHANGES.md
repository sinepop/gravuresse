# 更新日志 / Changelog

本文件仅保留当前版本与未发布变更摘要。完整的逐版本发布记录、日期和下载资产请查看 [GitHub Releases](https://github.com/sinepop/gravuresse/releases)。

This file keeps only the current release and unreleased highlights. See [GitHub Releases](https://github.com/sinepop/gravuresse/releases) for the complete version history, dates, and downloadable assets.

## 未发布 / Unreleased

### 中文

- 移除应用图标中不参与渲染的 C2PA 来源元数据，并增加 PNG 元数据审计门禁。
- 加固秘密审计：强制检查被跟踪的 Agent/凭据文件、扩大令牌与文件名规则、停止输出任何命中值片段。
- 删除 README 中不必要的个人画像，新增无个人联系方式的安全披露说明。
- 精简打包依赖并排除 source map，阻止桌面应用被误发布到 npm。

### English

- Removed non-rendering C2PA provenance metadata from the application icon and added a PNG metadata audit gate.
- Hardened secret auditing for tracked agent/credential files, additional token and filename classes, and zero-value output.
- Removed unnecessary personal-profile details from the README and added security reporting guidance without personal contact details.
- Reduced packaged runtime dependencies, excluded source maps, and blocked accidental npm publication.

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
