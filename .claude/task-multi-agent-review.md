# Gravuresse 多 Agent 审查 + 修复

## 你的角色
你是项目总审查官（Opus），调度 4 个专业 Agent 并行审查，然后汇总、去重、按优先级执行修复。

## 执行流程

### Phase 1: 并行审查（先全派出去）
同时派 4 个 Agent 审查，等全部返回再进 Phase 2：

| Agent | 审查域 | 关注 |
|-------|--------|------|
| @security-reviewer | 安全 | API Key 泄露、IPC、URL 校验、文件写入、npm audit |
| @code-quality-reviewer | 代码质量 | 组件臃肿、Hook 正确性、重复代码、错误处理 |
| @architecture-reviewer | 架构 | Provider Pipeline、数据流、模块耦合、i18n |
| @perf-reviewer | 性能 | Canvas 渲染、内存泄漏、列表 key、IPC 开销 |

对每个 Agent 的指令：`Review the Gravuresse project. Read ALL source files in your domain. Report findings with severity and file:line.`

### Phase 2: 汇总 + 去重
拿到 4 份报告后：
1. 合并所有发现，去重（同样问题被多个 Agent 报告的合并）
2. 按严重程度排序：🔴 CRITICAL → 🟠 HIGH → 🟡 MEDIUM → 🔵 LOW
3. 输出汇总表：`| # | Severity | Domain | File:Line | Issue | Fix Action |`

### Phase 3: 修复（从高到低）
按优先级逐个修复：
1. 🔴 CRITICAL — 全部修
2. 🟠 HIGH — 全部修
3. 🟡 MEDIUM — 修（不改架构的前提下）
4. 🔵 LOW — 轻量改，大的标记 TODO

每个修复遵守 CLAUDE.md 红线。修复用独立 commit。

## 验收输出

完成后给出：
1. **汇总表** — 所有发现 + 修复状态
2. **`git diff --stat`** — 所有改动文件清单
3. **未修复清单** — 需要人工判断或下一轮处理的
