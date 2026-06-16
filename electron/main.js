const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron')
const path = require('path')
const fs = require('fs')
const { fileURLToPath } = require('url')
const { electronApp, optimizer, is } = require('@electron-toolkit/utils')
const config = require('./config')
const store = require('./store')
const chatApi = require('./api/chat')
const imageApi = require('./api/image')
const videoApi = require('./api/video')
const modelsApi = require('./api/models')
const { assertHttpsUrl, downloadToFile } = require('./api/http')

let mainWindow = null
let crashCount = 0

const SAVE_DIR = path.join(app.getPath('pictures'), 'Gravuresse')

function getStoredProvider(track) {
  return config.load().providers?.[track] || {}
}

function getApiRequest(track, params = {}) {
  return { ...params, ...getStoredProvider(track) }
}

function sameProviderEndpoint(a = {}, b = {}) {
  return ['id', 'baseUrl', 'protocol', 'format'].every(key => (a[key] || '') === (b[key] || ''))
}

function sameProviderHost(a = {}, b = {}) {
  return ['id', 'baseUrl', 'format'].every(key => (a[key] || '') === (b[key] || ''))
}

function getModelFetchProvider(provider = {}) {
  const track = inferProviderTrack(provider)
  const stored = getStoredProvider(track)
  if (provider.apiKey && provider.apiKey !== config.REDACTED_API_KEY) return provider
  if (sameProviderEndpoint(provider, stored)) return stored
  return { ...provider, apiKey: '' }
}

function getVideoPollProvider(provider = {}) {
  const stored = getStoredProvider('video')
  if (!provider || Object.keys(provider).length === 0) return stored
  if (provider.apiKey && provider.apiKey !== config.REDACTED_API_KEY) return provider
  if (sameProviderHost(provider, stored)) return { ...provider, apiKey: stored.apiKey || '' }
  return { ...provider, apiKey: '' }
}

function inferProviderTrack(provider = {}) {
  if (provider.track) return provider.track
  if (['runway_task', 'happyhorse_task'].includes(provider.protocol) || provider.protocol?.includes('video') || provider.id?.includes('vid')) return 'video'
  if (['dalle', 'gemini_img', 'jimeng_img'].includes(provider.id) || provider.protocol?.includes('image') || provider.id?.includes('img')) return 'image'
  return 'chat'
}

function normalizeAssetLabel(label) {
  return (label || 'asset').replace(/[<>:"/\\|?*]/g, '_').slice(0, 60) || 'asset'
}

function tempFileFor(filePath) {
  return `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function writeDataUrl(url, filePath, type) {
  const match = /^data:([\w.+-]+\/[\w.+-]+)?;base64,([a-z0-9+/=\s]+)$/i.exec(url || '')
  if (!match) throw new Error('Invalid data URL')
  const mime = (match[1] || '').toLowerCase()
  const allowed = type === 'video'
    ? new Set(['video/mp4'])
    : new Set(['image/png', 'image/jpeg', 'image/webp'])
  if (!allowed.has(mime)) throw new Error('Unsupported asset data type')

  const base64 = match[2].replace(/\s/g, '')
  if (base64.length > Math.ceil(100 * 1024 * 1024 * 4 / 3) + 4) {
    throw new Error('Asset data is too large')
  }
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length > 100 * 1024 * 1024) throw new Error('Asset data is too large')
  const tmpFile = tempFileFor(filePath)
  try {
    fs.writeFileSync(tmpFile, bytes)
    fs.renameSync(tmpFile, filePath)
  } catch (e) {
    try { fs.unlinkSync(tmpFile) } catch {}
    throw e
  }
}

async function writeAssetUrl(url, filePath, type) {
  if (url.startsWith('data:')) {
    writeDataUrl(url, filePath, type)
    return
  }
  assertHttpsUrl(url)
  await downloadToFile(url, filePath)
}

function enforceAssetExtension(filePath, type) {
  const expected = type === 'video' ? '.mp4' : '.png'
  return path.extname(filePath).toLowerCase() === expected ? filePath : `${filePath}${expected}`
}

function openExternalSafe(url) {
  const parsed = assertHttpsUrl(url)
  return shell.openExternal(parsed.href)
}

function isAppUrl(url) {
  let parsed
  try { parsed = new URL(url) } catch { return false }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return parsed.origin === new URL(process.env['ELECTRON_RENDERER_URL']).origin
  }

  if (parsed.protocol !== 'file:') return false
  try {
    const target = path.resolve(fileURLToPath(parsed))
    const rendererDir = path.resolve(__dirname, '../renderer')
    return target === rendererDir || target.startsWith(rendererDir + path.sep)
  } catch {
    return false
  }
}

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false)

ipcMain.handle('config:get', () => config.redactApiKeys(config.load()))
ipcMain.handle('config:save', (_, cfg) => {
  const allowedKeys = Object.keys(config.DEFAULT_CONFIG)
  const filtered = {}
  for (const key of allowedKeys) {
    if (key in cfg) filtered[key] = cfg[key]
  }
  config.save(config.mergeRedactedApiKeys(filtered, config.load()))
})

ipcMain.handle('history:get', () => store.loadAll())
ipcMain.handle('history:save', (_, records) => store.saveAllQueued(records))
ipcMain.handle('conv:loadAll', () => store.loadAll())
ipcMain.handle('conv:save', (_, id, data) => store.saveConversation(id, data))
ipcMain.handle('conv:delete', (_, id) => store.deleteConversation(id))
ipcMain.handle('conv:setActive', (_, id) => store.setActiveId(id))

ipcMain.handle('api:chat', (_, messages) => chatApi.call(messages, getStoredProvider('chat')))
ipcMain.handle('api:image', (_, params) => imageApi.generate(getApiRequest('image', params)))
ipcMain.handle('api:video', (_, params) => videoApi.submit(getApiRequest('video', params)))
ipcMain.handle('api:video:poll', (_, taskId, provider) => videoApi.poll(taskId, getVideoPollProvider(provider)))
ipcMain.handle('api:models', (_, provider) => modelsApi.fetch(getModelFetchProvider(provider)))

ipcMain.handle('api:saveAsset', async (_, { url, label, type }) => {
  if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true })
  const ext = type === 'video' ? '.mp4' : '.png'
  const filePath = path.join(SAVE_DIR, `${normalizeAssetLabel(label)}_${Date.now()}${ext}`)
  await writeAssetUrl(url, filePath, type)
  return filePath
})

ipcMain.handle('api:getSaveDir', () => SAVE_DIR)

ipcMain.handle('api:saveAssetWithDialog', async (_, { url, label, type }) => {
  const ext = type === 'video' ? 'mp4' : 'png'
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${normalizeAssetLabel(label)}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  const resolved = path.resolve(enforceAssetExtension(result.filePath, type))
  await writeAssetUrl(url, resolved, type)
  return { canceled: false, filePath: resolved }
})

ipcMain.handle('shell:open-external', (_, url) => openExternalSafe(url))

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 600,
    show: false,
    frame: false, titleBarStyle: 'hidden', backgroundColor: '#1A1A1E',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      sandbox: true, contextIsolation: true, nodeIntegration: false
    }
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const devCsp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: data: blob:; connect-src 'self' https: ws:; font-src 'self' data:"
    const prodCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: data: blob:; connect-src 'self' https:; font-src 'self' data:"
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [is.dev ? devCsp : prodCsp]
      }
    })
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    Promise.resolve()
      .then(() => openExternalSafe(url))
      .catch(err => console.warn('Blocked navigation:', err.message))
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    Promise.resolve()
      .then(() => openExternalSafe(url))
      .catch(err => console.warn('Blocked window open:', err.message))
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false))

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

app.on('will-quit', () => {})
