# Gravuresse Desktop

Electron + Vite + React 18 AI创意设计桌面工具。

## 开发命令

```bash
npm run dev        # electron-vite dev（热重载）
npm run build      # electron-vite build
npm run package    # build + electron-builder --win → release/
```

## 架构约束

- **统一 Provider Pipeline**：所有 API 调用走 `provider:call` IPC
- **三轨道独立配置**：chat / image / video 各自选 Provider、API Key、Base URL、Model
- **对话数据**：每对话独立 messages[] + assets[]，切换时 sync 回 conversations 状态
- **画布**：InfiniteCanvas（CSS transform 缩放平移）+ DrawingOverlay（HTML5 Canvas 绘图）
- **视频任务**：异步队列轮询

## 版本发布流程

1. 更新 `package.json` version
2. 更新 `src/components/ModelBar.jsx` 中版本号显示
3. 更新 `README.md` 下载链接版本号 + `CHANGES.md` 添加更新日志
4. `npm run package` 打包
5. `git commit` + `git push`
6. `gh release create <tag> "release/<file>" --title "..." --notes "..."`
