const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')
const { electronApp, optimizer, is } = require('@electron-toolkit/utils')
const config = require('./config')
const store = require('./store')
const chatApi = require('./api/chat')
const imageApi = require('./api/image')
const videoApi = require('./api/video')
const modelsApi = require('./api/models')

let mainWindow = null
let crashCount = 0

const SAVE_DIR = path.join(app.getPath('pictures'), 'Gravuresse')

// ── URL 安全校验 ──
function assertHttpsUrl(urlStr) {
  let parsed
  try { parsed = new URL(urlStr) } catch { throw new Error('Invalid URL') }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http/https URLs are allowed')
  }
  return parsed
}

// ── 通用 HTTP 下载 ──
function downloadToFile(url, filePath, depth = 0) {
  if (depth > 5) return Promise.reject(new Error('Too many redirects'))
  return new Promise((resolve, reject) => {
    const handler = (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 支持相对路径 redirect
        const nextUrl = new URL(res.headers.location, url).href
        const parsed = assertHttpsUrl(nextUrl)
        // 阻止 HTTPS→HTTP 降级
        if (url.startsWith('https') && parsed.protocol === 'http:') {
          return reject(new Error('HTTPS→HTTP downgrade blocked'))
        }
        return downloadToFile(nextUrl, filePath, depth + 1).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const file = fs.createWriteStream(filePath)
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', (e) => { fs.unlink(filePath, () => {}); reject(e) })
    }
    const mod = url.startsWith('https') ? https : http
    mod.get(url, handler).on('error', (e) => { fs.unlink(filePath, () => {}); reject(e) })
  })
}

// ── IPC Handlers（模块级注册，避免重复注册崩溃）──

// Window controls — 需要 mainWindow 引用，延迟绑定在 createWindow 内
function registerWindowHandlers() {
  ipcMain.on('window-minimize', () => mainWindow?.minimize())
  ipcMain.on('window-maximize', () => {
    if (!mainWindow) return
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.on('window-close', () => mainWindow?.close())
  ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false)
}

// Config IPC
ipcMain.handle('config:get', () => config.load())
ipcMain.handle('config:save', (_, cfg) => {
  // Schema 校验：只允许写入已知顶层 key
  const allowedKeys = Object.keys(config.DEFAULT_CONFIG)
  const filtered = {}
  for (const key of allowedKeys) {
    if (key in cfg) filtered[key] = cfg[key]
  }
  config.save(filtered)
})

// History / Conversation IPC
ipcMain.handle('history:get', () => store.loadAll())
ipcMain.handle('history:save', (_, records) => store.saveAllQueued(records))
ipcMain.handle('conv:loadAll', () => store.loadAll())
ipcMain.handle('conv:save', (_, id, data) => store.saveConversation(id, data))
ipcMain.handle('conv:delete', (_, id) => store.deleteConversation(id))
ipcMain.handle('conv:setActive', (_, id) => store.setActiveId(id))

// API IPC
ipcMain.handle('api:chat', (_, messages, provider) => chatApi.call(messages, provider))
ipcMain.handle('api:image', (_, params) => imageApi.generate(params))
ipcMain.handle('api:video', (_, params) => videoApi.submit(params))
ipcMain.handle('api:video:poll', (_, taskId, provider) => videoApi.poll(taskId, provider))
ipcMain.handle('api:models', (_, provider) => modelsApi.fetch(provider))

// Asset 保存到默认目录（安全：路径由主进程生成）
ipcMain.handle('api:saveAsset', async (_, { url, label, type }) => {
  if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true })
  const ext = type === 'video' ? '.mp4' : '.png'
  const safeName = (label || 'asset').replace(/[<>:"/\\|?*]/g, '_').slice(0, 60)
  const filePath = path.join(SAVE_DIR, `${safeName}_${Date.now()}${ext}`)
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1]
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
  } else {
    assertHttpsUrl(url)
    await downloadToFile(url, filePath)
  }
  return filePath
})

ipcMain.handle('api:getSaveDir', () => SAVE_DIR)

// Asset 保存到用户指定路径（来自 dialog:save，需校验路径合法性）
ipcMain.handle('api:saveAssetToPath', async (_, { url, filePath }) => {
  // 路径安全：必须是绝对路径，不允许 .. 遍历
  const resolved = path.resolve(filePath)
  if (!path.isAbsolute(resolved) || resolved.includes('\0')) {
    throw new Error('Invalid file path')
  }
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1]
    fs.writeFileSync(resolved, Buffer.from(base64, 'base64'))
  } else {
    assertHttpsUrl(url)
    await downloadToFile(url, resolved)
  }
  return resolved
})

// Dialog IPC
ipcMain.handle('dialog:save', (_, opts) => dialog.showSaveDialog(mainWindow, opts))
ipcMain.handle('dialog:open', (_, opts) => dialog.showOpenDialog(mainWindow, opts))

// Shell openExternal — 只允许 http/https 协议
ipcMain.handle('shell:open-external', (_, url) => {
  const parsed = assertHttpsUrl(url)
  return shell.openExternal(parsed.href)
})

// ── 窗口创建 ──

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 600,
    show: false, // ready-to-show 模式
    frame: false, titleBarStyle: 'hidden', backgroundColor: '#1A1A1E',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      sandbox: true, contextIsolation: true, nodeIntegration: false
    }
  })

  // CSP 设置
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          is.dev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self' https: ws:; font-src 'self' data:"
            : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self' https:; font-src 'self' data:"
        ]
      }
    })
  })

  // ready-to-show
  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Maximize state sync
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false))

  // Renderer 崩溃恢复（退避 + 最多重启 3 次）
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    console.error('Renderer process gone:', details.reason)
    crashCount++
    if (crashCount > 3) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Gravuresse',
        message: 'The renderer keeps crashing. Please restart the app manually.',
        buttons: ['OK']
      })
      return
    }
    const delay = Math.min(crashCount * 2000, 10000)
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Gravuresse',
      message: `The renderer process crashed (attempt ${crashCount}/3). Restarting in ${delay / 1000}s...`,
      buttons: ['Restart Now']
    }).then(() => {
      setTimeout(() => {
        mainWindow.destroy()
        createWindow()
      }, delay)
    })
  })

  mainWindow.webContents.on('unresponsive', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Gravuresse',
      message: 'The application is not responding.',
      buttons: ['Wait', 'Reload']
    }).then(({ response }) => {
      if (response === 1) mainWindow.reload()
    })
  })

  mainWindow.on('closed', () => { mainWindow = null })

  return mainWindow
}

// ── 应用生命周期 ──

registerWindowHandlers()

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.gravuresse')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  // 退出前确保数据已写入（如有待处理的异步写入可在此 flush）
})
