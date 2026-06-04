const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { electronApp, optimizer, is } = require('@electron-toolkit/utils')

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 600,
    frame: false, titleBarStyle: 'hidden', backgroundColor: '#1A1A1E',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      sandbox: false, contextIsolation: true, nodeIntegration: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Window controls
  ipcMain.on('window-minimize', () => mainWindow.minimize())
  ipcMain.on('window-maximize', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.on('window-close', () => mainWindow.close())
  ipcMain.handle('window-is-maximized', () => mainWindow.isMaximized())

  // Maximize state sync
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false))

  // Config IPC
  const config = require('./config')
  ipcMain.handle('config:get', () => config.load())
  ipcMain.handle('config:save', (_, cfg) => config.save(cfg))

  // History IPC
  const store = require('./store')
  ipcMain.handle('history:get', () => store.loadAll())
  ipcMain.handle('history:save', (_, records) => store.saveAll(records))
  ipcMain.handle('conv:loadAll', () => store.loadAll())
  ipcMain.handle('conv:save', (_, id, data) => store.saveConversation(id, data))
  ipcMain.handle('conv:delete', (_, id) => store.deleteConversation(id))
  ipcMain.handle('conv:setActive', (_, id) => store.setActiveId(id))

  // API IPC
  const chatApi = require('./api/chat')
  const imageApi = require('./api/image')
  const videoApi = require('./api/video')
  const modelsApi = require('./api/models')

  ipcMain.handle('api:chat', (_, messages, provider) => chatApi.call(messages, provider))
  ipcMain.handle('api:image', (_, params) => imageApi.generate(params))
  ipcMain.handle('api:video', (_, params) => videoApi.submit(params))
  ipcMain.handle('api:video:poll', (_, taskId, provider) => videoApi.poll(taskId, provider))
  ipcMain.handle('api:models', (_, provider) => modelsApi.fetch(provider))

  // Auto-save assets to disk
  const fs = require('fs')
  const SAVE_DIR = path.join(app.getPath('pictures'), 'Gravuresse')
  ipcMain.handle('api:saveAsset', async (_, { url, label, type }) => {
    if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true })
    const ext = type === 'video' ? '.mp4' : '.png'
    const safeName = (label || 'asset').replace(/[<>:"/\\|?*]/g, '_').slice(0, 60)
    const filename = `${safeName}_${Date.now()}${ext}`
    const filePath = path.join(SAVE_DIR, filename)
    if (url.startsWith('data:')) {
      const base64 = url.split(',')[1]
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
    } else {
      const mod = url.startsWith('https') ? require('https') : require('http')
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath)
        mod.get(url, (res) => {
          res.pipe(file)
          file.on('finish', () => { file.close(); resolve() })
        }).on('error', (e) => { fs.unlink(filePath, () => {}); reject(e) })
      })
    }
    return filePath
  })
  ipcMain.handle('api:getSaveDir', () => SAVE_DIR)

  // Dialog IPC
  ipcMain.handle('dialog:save', (_, opts) => dialog.showSaveDialog(mainWindow, opts))
  ipcMain.handle('dialog:open', (_, opts) => dialog.showOpenDialog(mainWindow, opts))
  ipcMain.handle('shell:open-external', (_, url) => shell.openExternal(url))

  return mainWindow
}

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
