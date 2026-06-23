const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron')
const path = require('path')
const fs = require('fs')
const { fileURLToPath } = require('url')
const { electronApp, optimizer, is } = require('@electron-toolkit/utils')
const config = require('./config')
const store = require('./store')
const modelsApi = require('./api/models')
const { assertHttpsUrl, downloadToFile } = require('./api/http')
const providerPipeline = require('./providers/pipeline')
// Wire handler side-effects (registerHandler): must be required so the
// HANDLER_MAP is populated before any provider:call / api:* dispatch.
require('./providers')
const { getProvidersByAction } = require('./providers/registry')

let mainWindow = null
let crashCount = 0

const SAVE_DIR = path.join(app.getPath('pictures'), 'Gravuresse')

function getStoredProvider(track) {
  return config.load().providers?.[track] || {}
}

function sameProviderEndpoint(a = {}, b = {}) {
  return ['id', 'baseUrl', 'protocol', 'format'].every(key => (a[key] || '') === (b[key] || ''))
}

function getModelFetchProvider(provider = {}) {
  const track = inferProviderTrack(provider)
  const stored = getStoredProvider(track)
  if (provider.apiKey && provider.apiKey !== config.REDACTED_API_KEY) return provider
  if (sameProviderEndpoint(provider, stored)) return stored
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

// Unified provider call
ipcMain.handle('provider:call', async (_, params) => {
  const stored = config.load()
  const { providerId, action } = params
  const track = action === 'chat' ? 'chat' : action === 'generate' ? 'image' : 'video'
  const providerConfig = stored.providers?.[track] || {}
  // SECURITY: never trust a renderer-supplied baseUrl — a compromised renderer
  // could redirect credentials to an attacker host. Source baseUrl only from the
  // stored config (which holds the user's legitimate custom/proxy endpoint).
  const credentials = { apiKey: providerConfig.apiKey || '' }
  return await providerPipeline.execute({ ...params, credentials, baseUrl: providerConfig.baseUrl })
})

// List providers by action (for settings dropdown)
ipcMain.handle('provider:list', async (_, action) => {
  const track = action || 'chat'
  return getProvidersByAction(track).map(p => ({
    id: p.id,
    name: p.name,
    platform: p.platform,
    meta: p.meta,
    defaultUrl: p.defaults?.baseUrl || '',
    defaultModel: p[track]?.defaultModel || '',
    protocol: p[track]?.protocol,
    format: p[track]?.format
  }))
})

// Test provider connection
ipcMain.handle('provider:test', async (_, { providerId, credentials }) => {
  try {
    const providerDef = require('./providers/registry').getProvider(providerId)
    if (!providerDef) return { ok: false, message: 'Unknown provider' }
    if (!providerDef.healthCheck) return { ok: true, message: 'No health check available' }
    const { resolveAuth } = require('./providers/auth')
    const { request, joinApiUrl } = require('./api/http')
    const auth = resolveAuth(providerDef, credentials || {})
    const url = joinApiUrl(providerDef.defaults.baseUrl, providerDef.healthCheck.url)
    await request(url, {
      method: providerDef.healthCheck.method,
      headers: { ...auth.headers, 'Content-Type': 'application/json' }
    }, providerDef.healthCheck.body)
    return { ok: true, message: 'Connection successful' }
  } catch (err) {
    return { ok: false, message: err.message }
  }
})

ipcMain.handle('api:models', (_, provider) => modelsApi.fetch(getModelFetchProvider(provider)))

// Map the user-facing stored provider id (e.g. 'claude', 'dalle', 'jimeng_vid')
// to the canonical registry id (e.g. 'anthropic', 'openai', 'volcengine').
// Mirrors PROVIDER_ID_ALIASES used on the renderer side so legacy direct-API
// channels receive a providerId the pipeline can resolve.
const PROVIDER_ID_ALIASES = {
  chat: { claude: 'anthropic', gemini: 'google', qwen: 'alibaba', kimi: 'moonshot', doubao: 'volcengine' },
  image: { dalle: 'openai', gemini_img: 'google', jimeng_img: 'volcengine' },
  video: { jimeng_vid: 'volcengine' }
}
function resolveProviderIdByTrack(track, id) {
  return PROVIDER_ID_ALIASES[track]?.[id] || id
}

// Convenience credentials pulled from stored config for a track.
function trackCredentials(track, override = {}) {
  const stored = config.load().providers?.[track] || {}
  return { apiKey: (override.apiKey && override.apiKey !== config.REDACTED_API_KEY) ? override.apiKey : stored.apiKey || '' }
}

// SECURITY: baseUrl for a track always comes from the user's stored config, never
// from the renderer payload — otherwise a compromised renderer could redirect the
// API key to an attacker host (SSRF/credential exfil). Falls back to the
// provider's default when the user has not configured a custom endpoint.
function storedBaseUrl(track, providerId) {
  const stored = config.load().providers?.[track] || {}
  if (stored.baseUrl) return stored.baseUrl
  const def = require('./providers/registry').getProvider(providerId)
  return def?.defaults?.baseUrl || ''
}

// Legacy direct API channels — kept functional by routing them through the
// unified pipeline. The renderer reaches these only through the preload helpers
// (chat/generateImage/generateVideo/pollVideoTask); the new pipeline path
// (provider:call) is preferred, but these must not be left without handlers or
// ipcRenderer.invoke would hang forever.
ipcMain.handle('api:chat', async (_, messages, provider) => {
  const track = 'chat'
  const providerId = resolveProviderIdByTrack(track, provider?.id)
  const result = await providerPipeline.execute({
    action: 'chat', providerId,
    credentials: trackCredentials(track, provider),
    messages: (messages?.history || messages || []).map(m => ({ role: m.role, content: m.content })),
    system: messages?.system || provider?.system || '',
    thinking: messages?.thinking || provider?.thinking || false,
    model: provider?.model, baseUrl: storedBaseUrl(track, providerId)
  })
  if (!result.ok) throw new Error(result.error?.message || 'Chat failed')
  return result.data
})

ipcMain.handle('api:image', async (_, params) => {
  const track = 'image'
  const providerId = resolveProviderIdByTrack(track, params?.id)
  const result = await providerPipeline.execute({
    action: 'generate', providerId,
    credentials: trackCredentials(track, params),
    prompt: params?.prompt, ratio: params?.ratio, resolution: params?.resolution,
    model: params?.model, baseUrl: storedBaseUrl(track, providerId)
  })
  if (!result.ok) throw new Error(result.error?.message || 'Image generation failed')
  return result.data // url string
})

ipcMain.handle('api:video', async (_, params) => {
  const track = 'video'
  const providerId = resolveProviderIdByTrack(track, params?.id)
  const result = await providerPipeline.execute({
    action: 'submit', providerId,
    credentials: trackCredentials(track, params),
    prompt: params?.prompt, ratio: params?.ratio, duration: params?.duration,
    sourceImageUrl: params?.sourceImageUrl,
    model: params?.model, baseUrl: storedBaseUrl(track, providerId)
  })
  if (!result.ok) throw new Error(result.error?.message || 'Video submit failed')
  return result.data
})

ipcMain.handle('api:video:poll', async (_, taskId, provider) => {
  const track = 'video'
  const providerId = resolveProviderIdByTrack(track, provider?.id)
  const result = await providerPipeline.execute({
    action: 'poll', providerId,
    credentials: trackCredentials(track, provider),
    taskId,
    model: provider?.model, baseUrl: storedBaseUrl(track, providerId)
  })
  if (!result.ok) throw new Error(result.error?.message || 'Video poll failed')
  return result.data
})

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
    const devCsp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: data: blob:; media-src 'self' https: data: blob:; connect-src 'self' https: ws:; font-src 'self' data: https://fonts.gstatic.com; child-src 'self'"
    // Prod: allow Google Fonts CDN (style-src / font-src) so the @import in
    // global.css can load Inter/JetBrains/Outfit in the packaged app; the rest
    // stays locked down (default-src 'self' file:).
    const prodCsp = "default-src 'self' file:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: data: blob: file:; media-src 'self' https: data: blob:; connect-src 'self' https:; font-src 'self' data: https://fonts.gstatic.com; child-src 'self'"
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
