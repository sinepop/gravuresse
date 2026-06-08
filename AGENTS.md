# Gravuresse Desktop

Electron + Vite + React 18 AI创意设计桌面工具。

## 项目结构

```
electron/          # 主进程
  main.js          # 入口，IPC注册，窗口创建
  config.js        # 配置读写 (%APPDATA%/Gravuresse/config.json)
  store.js         # 对话持久化
  api/             # chat.js, image.js, video.js, models.js
src/
  App.jsx          # 状态编排：对话管理+画布+配置
  hooks/useChat.js # 聊天状态+API调用
  components/      # UI组件（TitleBar/ChatPanel/CanvasPanel/ModelBar/Settings等）
  styles/global.css # CSS变量主题系统
build/icon.png     # 应用图标
```

## 架构约束

- **三轨道独立 Provider**：chat / image / video 各自配置 API Key + Base URL + Model
- **API 调用走 IPC**：渲染进程通过 `window.electronAPI` 调用，主进程 `electron/api/*.js` 执行
- **对话数据**：每对话独立 messages[] + assets[]，切换时 sync 回 conversations 状态
- **画布**：InfiniteCanvas（CSS transform 缩放平移）+ DrawingOverlay（HTML5 Canvas 绘图）

## 开发命令

```bash
npm run dev        # electron-vite dev（热重载）
npm run build      # electron-vite build + 拷贝 config/store/api
npm run package    # build + electron-builder --win → release/
```

## 红线

- 不要在 setState 函数式更新内执行副作用（setMessages、canvas 操作等）——用 useEffect 分离
- 切换对话时用 `switchLoading` ref 防止 sync effect 覆盖刚加载的数据
- CSS 变量在 global.css 定义，组件内不硬编码颜色值
- 图标统一用 Lucide React（`src/components/icons.jsx`），不自绘 SVG
- 所有外部 URL 必须经过 `assertHttpsUrl()` 校验，含 redirect 的也要校验 location
- 渲染进程只能拿脱敏配置：`config:get` 返回 redacted API Key，真实密钥由主进程 API IPC 从 `config.load()` 读取
- 素材保存必须走主进程安全流程：默认保存用 `saveAssetToDisk`，手动另存为用 `saveAssetWithDialog`，不要恢复任意 `filePath` 写入 IPC
- IPC handler 必须在模块级注册（`ipcMain.handle`），不能放在 `createWindow()` 内
- 文件写入用原子模式：先写 `.tmp` 再 `renameSync`
- 并发写操作用 `enqueueWrite` 队列序列化，不能直接 read-modify-write

## 版本发布流程

1. 更新 `package.json` version
2. 更新 `src/components/ModelBar.jsx` 中版本号显示
3. 更新 `README.md` 下载链接版本号 + `CHANGES.md` 添加更新日志
4. `npm run package` 打包
   - 如 Electron/NSIS 下载超时，可临时设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 和 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` 后重试
5. `git commit` + `git push`（需绕代理：`git -c http.proxy="" -c https.proxy="" push`）
6. `gh release create <tag> "release/<file>#显示名" --title "..." --notes "..."`
7. 更新记忆 `project_studio_ai_desktop.md` + `MEMORY.md`
