# Gravuresse Desktop

Electron + Vite + React 18 AI创意设计桌面工具。

## 项目结构

```
electron/                    # 主进程
  main.js                    # 入口，IPC注册，窗口创建，Provider路由
  config.js                  # 配置读写 (%APPDATA%/Gravuresse/config.json, safeStorage加密)
  store.js                   # 对话持久化 (tmp+rename原子写入, 写队列序列化)
  api/
    http.js                  # HTTPS请求+SSRF防护+DNS Rebinding检测
    models.js                # 模型列表获取
  providers/                 # 统一Provider Pipeline (v1.6.0+)
    registry.js              # 17个Provider的数据定义
    pipeline.js              # 统一执行编排 → auth + handler
    handler.js               # 协议→handler函数映射 (注册制)
    auth.js                  # 鉴权解析 (bearer/header/query/session)
    validation.js            # 生成请求预检 (prompt/ratio/duration/sourceImage)
    index.js                 # 加载所有handler (显式require列表)
    handlers/                # 各协议handler实现
      anthropic.js openai.js gemini.js ark.js
      runway.js happyhorse.js custom.js
src/
  App.jsx                    # 状态编排：对话管理+画布+配置
  hooks/
    useChat.js               # 聊天状态+API调用+生成调度
    useCanvas.js             # 画布状态 (grid/free双模式)
    useConfig.js             # 配置加载+迁移+保存
    useTaskQueue.js          # 视频任务轮询队列
  components/                # UI组件
    Settings.jsx             # 设置页 (API工作台+Provider选择+通用设置)
  providers/                 # 渲染进程fallback (IPC失败时用)
    aliases.js               # 用户ID→规范ID映射
    chatProviders.js         # Chat fallback列表
    imageProviders.js        # Image fallback列表
    videoProviders.js        # Video fallback列表
  styles/global.css          # CSS变量主题系统 (深蓝冷调)
build/icon.png               # 应用图标
```

## 架构约束

- **统一 Provider Pipeline**：所有API调用走 `provider:call` IPC → pipeline.js → handler
- **三轨道独立配置**：chat / image / video 各自选Provider、API Key、Base URL、Model
- **Provider ID 别名**：`config.js` (主进程) + `aliases.js` (渲染进程) 两处维护，保持同步
- **对话数据**：每对话独立 messages[] + assets[]，切换时 sync 回 conversations 状态
- **画布**：InfiniteCanvas（CSS transform 缩放平移）+ DrawingOverlay（HTML5 Canvas 绘图）
- **视频任务**：异步队列轮询，结果写回发起对话（不是当前对话）

## 开发命令

```bash
npm run dev        # electron-vite dev（热重载）
npm run build      # electron-vite build
npm run package    # build + electron-builder --win → release/
```

## 红线

- **不要在 setState 函数式更新内执行副作用**（setMessages、canvas 操作等）——用 useEffect 分离
- 切换对话时用 `switchLoading` ref 防止 sync effect 覆盖刚加载的数据
- CSS 变量在 global.css 定义，组件内不硬编码颜色值
- 图标统一用 Lucide React（`src/components/icons.jsx`），不自绘 SVG
- **所有外部 URL 必须经过 `assertHttpsUrl()` 校验**，含 redirect 的也要校验 location
- **渲染进程只能拿脱敏配置**：`config:get` 返回 `********`，真实密钥由主进程从 `config.load()` 读取
- 素材保存必须走主进程安全流程：默认保存用 `saveAssetToDisk`，手动另存为用 `saveAssetWithDialog`
- **IPC handler 必须在模块级注册**（`ipcMain.handle`），不能放在 `createWindow()` 内
- 文件写入用原子模式：先写 `.tmp` 再 `renameSync`
- 并发写操作用 `enqueueWrite` 队列序列化，不能直接 read-modify-write
- **Provider aliases 两处需同步**：`electron/config.js` → `electron/main.js` destructure → `src/providers/aliases.js`

## 版本发布流程

1. 更新 `package.json` version
2. 更新 `src/components/ModelBar.jsx` 中版本号显示
3. 更新 `README.md` 下载链接版本号 + `CHANGES.md` 添加更新日志
4. `npm run package` 打包
   - 如 Electron/NSIS 下载超时，可临时设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 和 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` 后重试
5. `git commit` + `git push`（需绕代理：`git -c http.proxy="" -c https.proxy="" push`）
6. `gh release create <tag> "release/<file>#显示名" --title "..." --notes "..."`
7. 更新记忆 `project_studio_ai_desktop.md` + `MEMORY.md`
