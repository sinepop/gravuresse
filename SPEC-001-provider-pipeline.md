# SPEC-001: Provider 抽象层重构 — 统一 Request Pipeline

> 对应 PRD: 七·架构原则 / 八·T1 / 四·模块化
> 状态: v2 (registry redesign) | 2026-06-21
> 执行方: Claude Code / Codex CLI

---

## 1. 现状

### 1.1 当前痛点

| 痛点 | 具体表现 |
|------|---------|
| **新增 Provider 成本高** | 加一个新 chat/image/video 服务需要改 4+ 个文件 |
| **Auth 类型单一** | 只支持 API Key (Bearer/Query)，不支持会员订阅 Cookie/Token |
| **Provider 信息碎片化** | 元数据散落在 `src/providers/*.js` (3 文件) + `electron/api/*.js` (3 文件) + `electron/main.js` |
| **Provider 以"轨道"分类不合理** | OpenAI 同时做 chat+image，Gemini 同时做 chat+image，火山引擎做 chat+image+video，拆成多个 ID 导致配置冗余 |
| **命名不规范** | `doubao`是模型名不是平台名，`jimeng_img/vid`名字混乱 |

### 1.2 目标

1. **统一 Provider 注册** — `electron/providers/registry.js` 包含所有 Provider 元数据、能力声明、默认配置
2. **按平台组织** — 一个平台一个 ID，用 `chat/image/video` 对象字段声明能力
3. **统一 Auth 层** — 支持 Bearer / Header / Query / Cookie / Session 五种鉴权
4. **统一 Request Pipeline** — 从 UI → IPC → Provider 调用走一条管道
5. **新增 Provider 只需写一个 handler 函数**

---

## 2. 当前架构（现状快照）

```
src/providers/
  chatProviders.js    [11行]  provider 常量数组
  imageProviders.js   [5行]   provider 常量数组
  videoProviders.js   [5行]   provider 常量数组

electron/api/
  chat.js             [81行]  callClaude / callOpenAI / callGemini → call(messages, provider)
  image.js            [105行] genOpenAI / genGemini / genArk / genPollinations → generate(params)
  video.js            [103行] submitArk / submitRunway / submitHappyHorse → submit(params) + poll(taskId, provider)
  http.js             [177行] 底层 HTTP 工具（request, downloadToFile, assertHttpsUrl...）

electron/main.js      [288行] IPC handler 通过 provider.track 或 protocol 字段手动 dispatch 到 api/ 各模块
```

**添加一个 Provider 当前要改：**
1. `src/providers/xxxProviders.js` → 加一条对象
2. `electron/api/xxx.js` → 加一个 `callXxx()` 函数
3. `electron/api/xxx.js` → 改 dispatch 的 `if/else` 或 `switch`
4. 如果新 provider 用新 auth 方式 → 需要改调用方传参逻辑

---

## 3. 目标架构

```
┌───────────────────────────────────────────────────────┐
│                   Provider Registry                    │
│   { id, name, track, authType, protocols, models,     │
│     capabilities, defaultUrl, defaultModel, healthCheck } │
└──────────┬────────────────────────────────────────────┘
           │
           ▼
┌───────────────────────────────────────────────────────┐
│                  Auth Resolver                         │
│   API Key (Bearer / Header / Query)                   │
│   Subscription (Cookie / Session Token)               │
│   → 统一输出: { headers, queryParams, body }            │
└──────────┬────────────────────────────────────────────┘
           │
           ▼
┌───────────────────────────────────────────────────────┐
│                Request Pipeline                        │
│                                                       │
│   1. resolveProvider(id) → 读取注册表                  │
│   2. resolveAuth(provider, credentials) → auth 注入    │
│   3. resolveEndpoint(provider, action) → URL           │
│   4. executeRequest(url, config) → HTTP 调用           │
│   5. parseResponse(response, format) → 标准化输出      │
│   6. handleError(error) → 统一错误格式                  │
└───────────────────────────────────────────────────────┘
```

---

## 4. 详细设计

### 4.1 Provider Registry (`electron/providers/registry.js`)

**核心改动：** `track` 单字段 → `chat`/`image`/`video` 对象字段，一个平台声明多个能力。

```js
/**
 * @typedef {Object} ProviderDef
 * @property {string} id       — 唯一标识 (如 'openai', 'anthropic', 'volcengine')
 * @property {string} name     — 显示名 (如 'OpenAI', '火山引擎')
 * @property {string} platform — 平台名 (如 'OpenAI', 'Volcengine')
 * @property {Object} [chat]   — Chat 配置 { defaultModel, protocol, thinking? }
 * @property {Object} [image]  — Image 配置 { defaultModel, protocol, sizes? }
 * @property {Object} [video]  — Video 配置 { defaultModel, protocol, polling?, imageToVideo? }
 * @property {AuthType} authType
 * @property {Object} defaults — { baseUrl }
 * @property {Object} [healthCheck]
 * @property {Object} [meta]   — { region: 'china'|'global'|'both', description }
 */
```

17 个 Provider:
- **多能力平台:** `openai` (chat+image), `google` (chat+image), `volcengine` (chat+image+video), `siliconflow` (chat+image)
- **纯 Chat:** `anthropic`, `deepseek`, `groq`, `together`, `openrouter`, `xai`, `perplexity`, `alibaba`, `moonshot`, `zhipu`, `lingyi`
- **纯 Video:** `runway`, `happyhorse`
  },
  // ... qwen, kimi, doubao, zhipu, openrouter 同理

  // === Image ===
  {
    id: 'dalle', name: 'OpenAI Image', track: 'image',
    protocols: ['openai_image'],
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.openai.com', model: 'gpt-image-2' },
    capabilities: { image: true, imageSizes: ['1:1','4:3','3:4','16:9','9:16'] },
  },
  {
    id: 'gemini_img', name: 'Gemini Image', track: 'image',
    protocols: ['gemini_image'],
    authType: { type: 'query', key: 'key' },
    defaults: { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash-image' },
    capabilities: { image: true },
  },
  {
    id: 'jimeng_img', name: '即梦 / Seedream', track: 'image',
    protocols: ['ark_image'],
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedream-4-0-250828' },
    capabilities: { image: true },
  },

  // === Video ===
  {
    id: 'jimeng_vid', name: '即梦 Seedance', track: 'video',
    protocols: ['ark_video_task'],
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedance-2-0-pro-250528' },
    capabilities: { video: true, polling: true },
  },
  {
    id: 'runway', name: 'Runway ML', track: 'video',
    protocols: ['runway_task'],
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://api.dev.runwayml.com', model: 'gen4_turbo' },
    capabilities: { video: true, polling: true, imageToVideo: true },
  },
  {
    id: 'happyhorse', name: 'HappyHorse', track: 'video',
    protocols: ['happyhorse_task'],
    authType: { type: 'bearer' },
    defaults: { baseUrl: 'https://happyhorse.app', model: 'happyhorse-1.0/video' },
    capabilities: { video: true, polling: true },
  },
]

// 查询函数
function getProvider(id) { return REGISTRY.find(p => p.id === id) || null }
function getProvidersByTrack(track) { return REGISTRY.filter(p => p.track === track) }
function getProvidersByCapability(cap) { return REGISTRY.filter(p => p.capabilities[cap]) }
```

**与现有 `src/providers/*.js` 的关系：**
- Registry 放在 `electron/providers/`（主进程），因为它是 API 调用的源头
- `src/providers/*.js` 可以改为通过 IPC 从主进程读取 registry，**不再硬编码**
- 渲染进程中的设置面板可以通过 `ipcRenderer.invoke('provider:list')` 获取列表

### 4.2 Auth 层 (`electron/providers/auth.js`)

统一处理各种鉴权方式：

```js
/**
 * @typedef {Object} AuthType
 * @property {'header'|'bearer'|'query'|'cookie'|'session'} type
 * @property {string} [key]      — header 名或 query 参数名 (默认: 'Authorization')
 * @property {string} [prefix]   — bearer 前缀 (默认: 'Bearer ')
 * @property {Object} [headers]  — cookie/session 需要额外带的 header
 */

function resolveAuth(providerDef, credentials) {
  const { authType } = providerDef
  const headers = {}
  const queryParams = {}

  switch (authType.type) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${credentials.apiKey}`
      break
    case 'header':
      headers[authType.key || 'Authorization'] = credentials.apiKey
      break
    case 'query':
      queryParams[authType.key || 'api_key'] = credentials.apiKey
      break
    case 'cookie':
      // 会员订阅接入: 用户提供 Cookie / Session Token
      headers['Cookie'] = credentials.cookie || ''
      if (authType.headers) Object.assign(headers, authType.headers)
      break
    case 'session':
      headers[authType.key || 'X-Session-Token'] = credentials.sessionToken
      break
  }

  return { headers, queryParams }
}
```

**订阅接入说明：** 有些 AI 服务（如 Midjourney if they had an API, Krea）通过浏览器 Cookie 或 Session Token 鉴权，而不是 API Key。auth.js 的 `cookie` 和 `session` 类型为此预留。用户需要从浏览器开发者工具中复制 Cookie/Token 粘贴到 Gravuresse 设置中（类似"手动导入"方式）。

> 🟡 **注意：** 订阅 Cookie 接入有失效风险。需要加入"凭据有效期"提示和"再验证"机制。当前版本先支持 header/bearer/query 三类 API Key 鉴权，cookie/session 作为扩展预留。

### 4.3 Handler 层 (`electron/providers/handlers/`)

每个需要特殊处理的 protocol 对应一个 handler 文件：

```
electron/providers/
  registry.js        ← Provider 注册表
  auth.js            ← Auth 解析器
  pipeline.js        ← 统一请求管道
  handler.js         ← Handler 注册 + dispatch
  handlers/
    anthropic.js     ← Claude Chat
    openai.js        ← OpenAI Chat + Image (共用 OpenAI 格式)
    gemini.js        ← Gemini Chat + Image
    ark.js           ← 即梦/火山引擎 (Image + Video)
    runway.js        ← Runway Video
    happyhorse.js    ← HappyHorse Video
```

Handler 接口：

```js
// 每个 handler 导出 { chat, generate, submit, poll } 中的一个或多个
// handler 接收标准化参数，返回标准化结果

/**
 * Chat handler
 * @param {Object} params
 * @param {Array} params.messages - [{role, content}]
 * @param {string} params.system - system prompt
 * @param {boolean} params.thinking - 是否启用深度思考
 * @param {ProviderDef} params.provider - provider 定义对象
 * @param {Object} params.auth - resolveAuth 的输出 {headers, queryParams}
 * @returns {Promise<{text: string, thinking?: string, model: string}>}
 */

/**
 * Image handler
 * @param {Object} params
 * @param {string} params.prompt
 * @param {string} params.ratio - '1:1', '4:3', etc.
 * @param {string} params.resolution - '1024', '2048', etc.
 * @param {ProviderDef} params.provider
 * @param {Object} params.auth
 * @returns {Promise<string>} image URL or data URL
 */

/**
 * Video handler
 * @param {Object} params
 * @param {string} params.prompt
 * @param {string} [params.sourceImageUrl]
 * @param {ProviderDef} params.provider
 * @param {Object} params.auth
 * @returns {Promise<{taskId: string, status: string}>}
 *
 * poll handler
 * @param {string} taskId
 * @param {ProviderDef} provider
 * @param {Object} auth
 * @returns {Promise<{status: string, progress: number, videoUrl?: string, error?: string}>}
 */
```

### 4.4 统一 Request Pipeline (`electron/providers/pipeline.js`)

```js
async function execute(params) {
  // 1. 解析 action: 'chat' | 'generate' | 'submit' | 'poll'
  const { action, providerId, credentials, ...payload } = params

  // 2. 从 registry 读取 provider 定义
  const providerDef = getProvider(providerId)
  if (!providerDef) throw new Error(`Unknown provider: ${providerId}`)

  // 3. 解析鉴权
  const auth = resolveAuth(providerDef, credentials)

  // 4. 找到对应的 handler
  const handler = resolveHandler(providerDef.protocols)
  if (!handler || !handler[action]) throw new Error(`No handler for ${action} on ${providerId}`)

  // 5. 执行 handler
  const result = await handler[action]({ ...payload, provider: providerDef, auth })

  return result
}
```

### 4.5 IPC 接口变更

| 现有 IPC | 新 IPC | 说明 |
|---------|--------|------|
| `chat:call` | `provider:call` | 统一入口，参数带 `{action, providerId, ...}` |
| `image:generate` | (同上) | 通过 `action: 'generate'` 区分 |
| `video:submit` | (同上) | 通过 `action: 'submit'` 区分 |
| `video:poll` | (同上) | 通过 `action: 'poll'` 区分 |
| — | `provider:list` | **新增** — 返回所有 provider 列表（脱敏） |
| — | `provider:get` | **新增** — 返回单个 provider 定义 |
| `config:get` | (保留) | 不变，credentials 仍走 config 读取 |
| `config:test` | `provider:test` | 改为走 pipeline 的 healthCheck |

### 4.6 Provider 健康检查

每个 Provider 在 Registry 中可选定义 `healthCheck`：

```js
healthCheck: {
  url: '/v1/messages',          // 相对于 baseUrl
  method: 'POST',
  body: { ... },                // 极简请求体
  validate: (response) => {     // 自定义校验
    return response.status === 200 || response.status === 400
    // 400 表示 API Key 有效但请求有误（已足够验证鉴权）
  }
}
```

`provider:test` IPC 会：
1. 从 registry 读取 healthCheck 配置
2. 调用 resolveAuth 注入凭据
3. 发送 healthCheck 请求
4. 通过 validate 判断结果
5. 返回 `{ ok: boolean, message: string }`

### 4.7 错误标准化

Pipeline 统一包装错误：

```js
// 成功
{ ok: true, data: { ... } }

// 失败
{ ok: false, error: { code: 'AUTH_FAILED' | 'RATE_LIMITED' | 'TIMEOUT' | 'PROVIDER_ERROR', message: '...' } }
```

渲染进程根据 `code` 做不同的 UI 反馈（如 `AUTH_FAILED` 提醒检查 API Key，`RATE_LIMITED` 显示"请稍后再试"）。

---

## 5. 文件变更清单

### 新增文件

| 文件 | 内容 | 预估行数 |
|------|------|---------|
| `electron/providers/registry.js` | 统一 Provider 注册表 + 查询函数 | 150 |
| `electron/providers/auth.js` | Auth 解析器 | 60 |
| `electron/providers/pipeline.js` | 统一执行管道 | 40 |
| `electron/providers/handler.js` | Handler 注册 + protocol→handler 映射 | 30 |
| `electron/providers/handlers/anthropic.js` | Claude chat handler | 40 |
| `electron/providers/handlers/openai.js` | OpenAI chat + image handler | 60 |
| `electron/providers/handlers/gemini.js` | Gemini chat + image handler | 60 |
| `electron/providers/handlers/ark.js` | 即梦 image + video handler | 60 |
| `electron/providers/handlers/runway.js` | Runway video handler | 50 |
| `electron/providers/handlers/happyhorse.js` | HappyHorse video handler | 40 |

### 修改文件

| 文件 | 改什么 |
|------|--------|
| `electron/main.js` | 将 chat:call / image:generate / video:submit / video:poll 替换为统一的 provider:call；新增 provider:list / provider:get / provider:test |
| `electron/preload.js` | 暴露新的 `providerAPI` 对象给渲染进程 |
| `electron/api/http.js` | 基本不变（底层工具函数），可考虑将 `request()` 改为能被 pipeline 直接消费的格式 |
| `electron/api/chat.js` | **废弃** — 功能迁移到 handlers/ |
| `electron/api/image.js` | **废弃** |
| `electron/api/video.js` | **废弃** |
| `src/hooks/useChat.js` | 适配新的 IPC 接口（从 `chat:call` 改为 `provider:call`） |
| `src/hooks/useTaskQueue.js` | 适配新的视频轮询接口 |
| `src/hooks/useConfig.js` | 新增 `provider:list` 调用替代本地硬编码 |
| `src/providers/chatProviders.js` | 改为从 IPC 读取（或保留但标记为 deprecated，后续移除） |
| `src/providers/imageProviders.js` | 同上 |
| `src/providers/videoProviders.js` | 同上 |
| `src/components/Settings.jsx` | 适配 Provider 选择下拉从 IPC 获取 |

### 删除文件

| 文件 | 原因 |
|------|------|
| `electron/api/chat.js` | 功能迁移至 handlers/ |
| `electron/api/image.js` | 同上 |
| `electron/api/video.js` | 同上 |

---

## 6. 实施步骤

### Step 1: 新建 `electron/providers/` 目录结构

```
创建:
  electron/providers/registry.js    ← 把现有所有 provider 定义迁移进来
  electron/providers/auth.js        ← 实现 auth 解析器
  electron/providers/handler.js     ← 初始化 handler 注册表（先返回空）
  electron/providers/pipeline.js    ← 实现 pipeline 骨架（注册+auth+dispatch）
```

> ✅ **验证：** 新建文件后 `node -e "require('./electron/providers/registry')"` 不报错

### Step 2: 迁移 Chat 层（最常用的轨道）

```
创建 electron/providers/handlers/anthropic.js
创建 electron/providers/handlers/openai.js
创建 electron/providers/handlers/gemini.js

修改 electron/providers/handler.js  → 映射 protocol→handler
修改 electron/providers/pipeline.js → 实现完整 pipeline
修改 electron/providers/registry.js → 补充 healthCheck 字段

修改 electron/main.js → 新增 provider:call IPC, action='chat'
修改 electron/preload.js → 暴露 providerAPI
修改 src/hooks/useChat.js → 适配新 IPC

⚠️ 不要删 electron/api/chat.js，先用新路径，并行运行
```

> ✅ **验证：** 在应用中实际发一条 chat 消息，确认回复正常

### Step 3: 迁移 Image 层

```
创建 electron/providers/handlers/ark.js (含 image 部分)
修改 electron/providers/handler.js → 补充 image protocol 映射
修改 electron/main.js → provider:call 支持 action='generate'
修改 src/hooks/useChat.js → 适配
```

> ✅ **验证：** 生成一张图片成功

### Step 4: 迁移 Video 层

```
创建 electron/providers/handlers/runway.js
创建 electron/providers/handlers/happyhorse.js
完善 electron/providers/handlers/ark.js (video 部分)
修改 electron/providers/handler.js → 补充 video protocol
修改 electron/main.js → provider:call 支持 action='submit' + action='poll'
修改 src/hooks/useTaskQueue.js → 适配
```

> ✅ **验证：** 提交一个视频任务并轮询成功

### Step 5: 新增 Provider 列表 IPC

```
修改 electron/main.js → 新增 provider:list (返回 registry 脱敏), provider:get (单个), provider:test (health check)
修改 electron/preload.js → 暴露
修改 src/hooks/useConfig.js → 读取远端 provider 列表替代本地硬编码
修改 src/components/Settings.jsx → Provider 选择下拉从 IPC 获取
```

> ✅ **验证：** 设置面板的 Provider 下拉列表数据来自主进程

### Step 6: 清理遗留文件

```
废弃 src/providers/chatProviders.js (渲染进程不再直接引用)
废弃 src/providers/imageProviders.js
废弃 src/providers/videoProviders.js
废弃 electron/api/chat.js
废弃 electron/api/image.js
废弃 electron/api/video.js

确认所有渲染进程引用已改为 IPC 调用后，删除这些文件
```

> ✅ **验证：** `npm run dev` 正常启动，所有功能能走通

---

## 7. 边界与不做

| 不做 | 原因 |
|------|------|
| **不支持 TypeScript** | 与 PRD 7.2 一致 |
| **不支持 OAuth 2.0 授权码流程** | 桌面端 OAuth 需要浏览器跳转+回调，复杂度高，当前无实际需求 |
| **不支持多密钥轮换** | 暂不需要自动切换可用 Key |
| **不重构渲染进程状态管理** | provider:list 只是数据源替换，不改变 useConfig/useChat 内部逻辑 |
| **不做 provider 延迟/速率统计** | healthCheck 只做"通/不通"判断，不做监控面板 |
| **不涉及 subscription UI** (Cookie/Token 配置界面) | auth.js 预留 `cookie`/`session` 类型，但设置面板 UI 在 Phase B 实现 |

---

## 8. 依赖关系

| 本 Spec 完成后，可以继续 | 依赖本 Spec 完成 |
|------------------------|-----------------|
| SPEC-002: CanvasPanel 拆分 | ✅ 无依赖 |
| SPEC-003: Asset ↔ Message 追溯 | ✅ 利用 provider:list 的 providerId |
| SPEC-004: 视觉 Design Token | ✅ 无依赖 |
| — | 订阅接入 UI（cookie/session 设置面板） |
| — | 本地模型支持（Ollama registry entry） |
