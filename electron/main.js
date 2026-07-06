const { app, BrowserWindow, ipcMain, dialog, shell, session, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { fileURLToPath } = require('url')
const { electronApp, optimizer, is } = require('@electron-toolkit/utils')
const config = require('./config')
const store = require('./store')
const modelsApi = require('./api/models')
const { assertHttpsUrl, downloadToFile } = require('./api/http')
const providerPipeline = require('./providers/pipeline')
const { buildProviderImageTestPayload } = require('./providers/image-test')
const { registerWindowIpc } = require('./ipc/window')
const { registerConfigIpc } = require('./ipc/config')
const { registerConversationIpc } = require('./ipc/conversation')
const { registerAssetIpc } = require('./ipc/assets')
const { registerProviderIpc } = require('./ipc/provider')
const { MEDIA_CACHE_SCHEME, cacheAssetPreview, mediaCacheMime, parseMediaCacheUrl } = require('./media-cache')
const { canUseStoredCredentials, resolveProviderIdByTrack, storedProviderForRequest } = require('./providers/account-resolver')
// Wire handler side-effects (registerHandler): must be required so the
// HANDLER_MAP is populated before any provider:call / api:* dispatch.
require('./providers')
const { getProvider, getProvidersByAction, getModelCatalog, getProviderCallMode, getProviderSetupMode } = require('./providers/registry')
const { resolveHandler } = require('./providers/handler')
const { validateGenerationRequest } = require('./providers/validation')

let mainWindow = null
let crashCount = 0

protocol.registerSchemesAsPrivileged([{
  scheme: MEDIA_CACHE_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}])

const SAVE_DIR = path.join(app.getPath('pictures'), 'Gravuresse')
const MEDIA_CACHE_DIR = path.join(app.getPath('userData'), 'Gravuresse', 'media-cache')
const MAX_ASSET_BYTES = 100 * 1024 * 1024
const MAX_PROJECT_EXPORT_BYTES = 100 * 1024 * 1024
const ASSET_MIME_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'video/mp4': '.mp4'
}
const ASSET_TYPE_MIMES = {
  image: new Set(['image/png', 'image/jpeg', 'image/webp']),
  video: new Set(['video/mp4'])
}
const VIDEO_POLL_SESSION_TTL_MS = 6 * 60 * 60 * 1000
const videoPollSessions = new Map()
const ALLOWED_PROVIDER_PAYLOAD_KEYS = [
  'messages', 'system', 'thinking', 'model',
  'prompt', 'ratio', 'resolution', 'negative_prompt', 'source_image_id',
  'negativePrompt', 'duration', 'sourceImageUrl', 'taskId', 'mode', 'generationMode'
]
const STORED_PROVIDER_PAYLOAD_KEYS = [
  'authType', 'customAuth', 'authConfig', 'template', 'customTemplate', 'generationOptions',
  'pathPrefix', 'modelListPath', 'modelsPath', 'path', 'submitPath', 'pollPath', 'taskIdPath', 'statusPath',
  'videoUrlPath', 'progressPath', 'errorPath', 'imageUrlPath', 'responsePath',
  'body', 'requestBody', 'submitBody', 'pollBody', 'method', 'submitMethod',
  'pollMethod', 'pollInterval'
]

function applyQueryParams(url, queryParams = {}) {
  for (const [key, value] of Object.entries(queryParams || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

function providerAuthType(providerDef = {}, current = {}, storedProvider = {}) {
  const customType = normalizeAuthType(current.customAuth?.type || storedProvider.customAuth?.type)
  if (customType) return customType
  return normalizeAuthType(current.authType?.type || storedProvider.authType?.type || providerDef.authType?.type || 'bearer')
}

function providerRequiresCredential(providerDef = {}, current = {}, storedProvider = {}) {
  return providerAuthType(providerDef, current, storedProvider) !== 'none'
}

function hasTemplatePath(providerConfig = {}, track) {
  const template = providerConfig.template || providerConfig.customTemplate || {}
  if (track === 'image') return Boolean(template.path || template.submitPath || providerConfig.path || providerConfig.submitPath)
  if (track === 'video') return Boolean(template.submitPath || providerConfig.submitPath)
  return false
}

function isTemplateConfigurableProvider(providerDef = {}, track) {
  if (!['image', 'video'].includes(track) || !providerDef?.[track]) return false
  if (resolveHandler(providerDef[track]?.protocol)) return false
  const custom = providerDef.customizable?.[track] || providerDef.meta?.customizable?.[track] || {}
  const caps = providerDef.capabilities?.[track] || providerDef.meta?.capabilities?.[track] || {}
  return Boolean(custom.baseUrl || custom.model || custom.submitPath || caps.customBaseUrl || caps.customTemplate || caps.relay)
}

function realSecret(value) {
  return value && value !== config.REDACTED_API_KEY ? value : ''
}

function credentialsFromProvider(storedProvider = {}, override = {}) {
  return {
    apiKey: realSecret(override.apiKey) || storedProvider.apiKey || '',
    sessionToken: realSecret(override.sessionToken) || storedProvider.sessionToken || ''
  }
}

function getModelFetchProvider(provider = {}) {
  const track = inferProviderTrack(provider)
  const storedConfig = config.load()
  const stored = storedProviderForRequest(storedConfig, track, provider)
  // SECURITY: never trust a renderer-supplied baseUrl; a compromised renderer
  // could pair saved credentials with an attacker-controlled baseUrl and
  // exfiltrate the credential. Newly typed plaintext credentials may be tested
  // against the typed endpoint; saved/redacted credentials stay on the stored
  // endpoint below.
  const providerId = provider.id || stored.id || ''
  const canonicalProviderId = resolveProviderIdByTrack(track, providerId)
  const providerDef = getProvider(canonicalProviderId)
  const sameEndpoint = canUseStoredCredentials(track, { id: providerId, baseUrl: provider.baseUrl || stored.baseUrl || '' }, stored)
  const hasRendererCredential = Boolean(realSecret(provider.apiKey) || realSecret(provider.sessionToken))
  const baseUrl = hasRendererCredential && provider.baseUrl
    ? provider.baseUrl
    : sameEndpoint && stored.baseUrl
      ? stored.baseUrl
      : defaultProviderBaseUrl(canonicalProviderId)
  const rendererFields = {
    id: provider.id || stored.id,
    model: provider.model || stored.model,
    protocol: provider.protocol || stored.protocol,
    format: provider.format || stored.format,
    pathPrefix: provider.pathPrefix || stored.pathPrefix || providerDef?.[track]?.pathPrefix || providerDef?.pathPrefix,
    modelListPath: provider.modelListPath || stored.modelListPath || stored.modelsPath || providerDef?.[track]?.modelListPath || providerDef?.modelListPath || providerDef?.[track]?.modelsPath || providerDef?.modelsPath,
    authType: provider.authType || stored.authType || providerDef?.authType
  }
  const credentials = credentialsFromProvider(!hasRendererCredential && sameEndpoint ? stored : {}, provider)
  return {
    ...stored,
    ...rendererFields,
    apiKey: credentials.apiKey,
    sessionToken: credentials.sessionToken,
    customAuth: provider.customAuth || stored.customAuth,
    baseUrl
  }
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
  return `${filePath}.tmp-${crypto.randomUUID()}`
}

function sniffAssetMime(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return ''
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.slice(0, 4).toString('ascii') === 'RIFF' && bytes.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (bytes.slice(4, 8).toString('ascii') === 'ftyp') return 'video/mp4'
  return ''
}

function validateAssetBytes(bytes, type, declaredMime = '') {
  if (!ASSET_TYPE_MIMES[type]) throw new Error('Unsupported asset type')
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error('Empty asset data')
  if (bytes.length > MAX_ASSET_BYTES) throw new Error('Asset data is too large')

  const normalizedDeclared = String(declaredMime || '').toLowerCase()
  const sniffedMime = sniffAssetMime(bytes)
  if (!sniffedMime || !ASSET_TYPE_MIMES[type].has(sniffedMime)) {
    throw new Error('Unsupported asset data type')
  }
  if (normalizedDeclared && normalizedDeclared !== sniffedMime) {
    throw new Error('Asset MIME does not match content')
  }
  return sniffedMime
}

function pathWithAssetExtension(filePath, mime) {
  const ext = ASSET_MIME_EXTENSIONS[mime]
  if (!ext) throw new Error('Unsupported asset data type')
  const parsed = path.parse(filePath)
  return path.join(parsed.dir, `${parsed.name}${ext}`)
}

function writeBufferAtomic(bytes, filePath) {
  const tmpFile = tempFileFor(filePath)
  try {
    fs.writeFileSync(tmpFile, bytes)
    fs.renameSync(tmpFile, filePath)
  } catch (e) {
    try { fs.unlinkSync(tmpFile) } catch {}
    throw e
  }
}

function writeTextAtomic(text, filePath) {
  const tmpFile = tempFileFor(filePath)
  try {
    fs.writeFileSync(tmpFile, text, 'utf8')
    fs.renameSync(tmpFile, filePath)
  } catch (e) {
    try { fs.unlinkSync(tmpFile) } catch {}
    throw e
  }
}

function writeDataUrl(url, filePath, type) {
  const match = /^data:([\w.+-]+\/[\w.+-]+)?;base64,([a-z0-9+/=\s]+)$/i.exec(url || '')
  if (!match) throw new Error('Invalid data URL')
  const mime = (match[1] || '').toLowerCase()
  const base64 = match[2].replace(/\s/g, '')
  if (base64.length > Math.ceil(MAX_ASSET_BYTES * 4 / 3) + 4) {
    throw new Error('Asset data is too large')
  }
  const bytes = Buffer.from(base64, 'base64')
  const sniffedMime = validateAssetBytes(bytes, type, mime)
  const resolvedPath = pathWithAssetExtension(filePath, sniffedMime)
  writeBufferAtomic(bytes, resolvedPath)
  return resolvedPath
}

async function writeAssetUrl(url, filePath, type) {
  if (url.startsWith('data:')) {
    return writeDataUrl(url, filePath, type)
  }
  assertHttpsUrl(url)
  const downloadPath = `${filePath}.download-${crypto.randomUUID()}`
  try {
    await downloadToFile(url, downloadPath)
    const bytes = fs.readFileSync(downloadPath)
    const sniffedMime = validateAssetBytes(bytes, type)
    const resolvedPath = pathWithAssetExtension(filePath, sniffedMime)
    fs.renameSync(downloadPath, resolvedPath)
    return resolvedPath
  } catch (e) {
    try { fs.unlinkSync(downloadPath) } catch {}
    throw e
  }
}

async function inlineExportAsset(asset = {}) {
  if (!asset.url || !ASSET_TYPE_MIMES[asset.type]) return { asset, inlined: false }
  if (asset.url.startsWith('data:')) return { asset, inlined: true }
  if (!asset.url.startsWith('https://')) return { asset, inlined: false }

  const downloadPath = path.join(app.getPath('temp'), `gravuresse-export-${crypto.randomUUID()}`)
  try {
    await downloadToFile(asset.url, downloadPath)
    const bytes = fs.readFileSync(downloadPath)
    const mime = validateAssetBytes(bytes, asset.type)
    return {
      asset: {
        ...asset,
        url: `data:${mime};base64,${bytes.toString('base64')}`,
        originalUrl: asset.originalUrl || asset.url
      },
      inlined: true
    }
  } catch {
    return { asset, inlined: false }
  } finally {
    try { fs.unlinkSync(downloadPath) } catch {}
  }
}

async function inlineExportAssets(assets = []) {
  const results = []
  let inlined = 0
  let skipped = 0
  for (const asset of assets) {
    const result = await inlineExportAsset(asset)
    results.push(result.asset)
    if (result.inlined) inlined++
    else if (asset?.url?.startsWith('https://')) skipped++
  }
  return { assets: results, inlined, skipped }
}

function remoteExportAssetCount(assets = []) {
  return assets.filter(asset => asset?.url?.startsWith('https://')).length
}

async function inlineExportConversations(conversations = []) {
  const results = []
  let inlined = 0
  let skipped = 0
  for (const conversation of conversations) {
    const media = await inlineExportAssets(Array.isArray(conversation.assets) ? conversation.assets : [])
    results.push({
      title: conversation.title || '',
      messages: Array.isArray(conversation.messages) ? conversation.messages : [],
      assets: media.assets
    })
    inlined += media.inlined
    skipped += media.skipped
  }
  return { conversations: results, inlined, skipped }
}

function remoteExportConversationAssetCount(conversations = []) {
  return conversations.reduce((sum, conversation) => sum + remoteExportAssetCount(conversation.assets || []), 0)
}

function openExternalSafe(url) {
  const parsed = assertHttpsUrl(url)
  return shell.openExternal(parsed.href)
}

function registerMediaCacheProtocol() {
  protocol.handle(MEDIA_CACHE_SCHEME, async (request) => {
    const filePath = parseMediaCacheUrl(request.url, MEDIA_CACHE_DIR)
    const fileName = path.basename(filePath)
    if (!fs.existsSync(filePath)) return new Response('Not found', { status: 404 })
    return new Response(fs.readFileSync(filePath), {
      headers: {
        'Content-Type': mediaCacheMime(fileName),
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    })
  })
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

registerWindowIpc({ ipcMain, getMainWindow: () => mainWindow })
registerConfigIpc({ ipcMain, config })
registerConversationIpc({
  ipcMain,
  store,
  getMainWindow: () => mainWindow,
  normalizeAssetLabel,
  inlineExportAssets,
  inlineExportConversations,
  remoteExportAssetCount,
  remoteExportConversationAssetCount,
  writeTextAtomic,
  maxProjectExportBytes: MAX_PROJECT_EXPORT_BYTES
})

async function executeProviderCall(params = {}) {
  const stored = config.load()
  const { providerId, action } = params
  const track = action === 'chat' ? 'chat' : action === 'generate' ? 'image' : 'video'

  if (track === 'video' && action === 'poll') {
    const sessionResult = await pollVideoWithSession(params.taskId, { model: params.model })
    if (sessionResult) return sessionResult
  }

  const activeProviderConfig = stored.providers?.[track] || {}
  const effectiveActiveProvider = storedProviderForRequest(stored, track, activeProviderConfig)
  const requestedProviderId = resolveProviderIdByTrack(track, providerId)
  if (track === 'video' && action === 'poll') {
    const storedProviderId = resolveProviderIdByTrack(track, effectiveActiveProvider.id)
    if (requestedProviderId && storedProviderId && requestedProviderId !== storedProviderId) {
      return {
        ok: false,
        error: {
          code: 'POLL_SESSION_MISSING',
          message: 'Video polling session is no longer available for this task. Switch back to the original video provider or submit the task again.'
        }
      }
    }
  }

  const activeProviderId = resolveProviderIdByTrack(track, effectiveActiveProvider.id)
  const requestTargetsActiveProvider = !requestedProviderId || requestedProviderId === activeProviderId
  const activeMatchesRequestedProfile = requestTargetsActiveProvider &&
    (!params.baseUrl || (params.baseUrl || '') === (effectiveActiveProvider.baseUrl || '')) &&
    (!params.model || (params.model || '') === (effectiveActiveProvider.model || ''))
  const hasProfileSelector = Boolean(requestedProviderId && (params.baseUrl || params.model))
  const requestedProfile = hasProfileSelector
    ? storedProviderForRequest(stored, track, { accountId: params.accountId, providerId: requestedProviderId, baseUrl: params.baseUrl, model: params.model })
    : null
  const requestedProfileId = requestedProfile ? resolveProviderIdByTrack(track, requestedProfile.id || requestedProfile.providerId) : ''
  if (requestedProviderId && activeProviderId && !activeMatchesRequestedProfile && (!requestedProfile || requestedProfileId !== requestedProviderId)) {
    return {
      ok: false,
      error: {
        code: 'PROVIDER_CONFIG_SYNC_PENDING',
        message: 'The selected provider profile has not been saved yet. Wait a moment, then try again.'
      }
    }
  }
  const providerConfig = storedProviderForRequest(stored, track, {
    accountId: params.accountId || (!activeMatchesRequestedProfile && requestedProfile ? requestedProfile.accountId : effectiveActiveProvider.accountId),
    providerId: requestedProviderId || activeProviderId,
    baseUrl: params.baseUrl,
    model: params.model
  })
  const canonicalProviderId = resolveProviderIdByTrack(track, providerConfig.id || providerId)
  const providerDef = getProvider(canonicalProviderId)
  if (!providerDef) {
    return { ok: false, error: { code: 'UNKNOWN_PROVIDER', message: `Unknown provider: ${canonicalProviderId}` } }
  }
  if (!providerDef[track]) {
    return { ok: false, error: { code: 'UNSUPPORTED_ACTION', message: `${canonicalProviderId} does not support ${track}` } }
  }
  const hasNativeHandler = Boolean(resolveHandler(providerDef[track]?.protocol))
  const canUseTemplateHandler = !hasNativeHandler && hasTemplatePath(providerConfig, track)
  if (!hasNativeHandler && !canUseTemplateHandler) {
    return {
      ok: false,
      error: {
        code: 'PROVIDER_NOT_EXECUTABLE',
        message: `${providerDef.name || canonicalProviderId} is listed for links and setup guidance, but this build does not include a direct ${track} handler yet. Configure request paths and JSON templates in Advanced, or use a Custom API entry for compatible relay endpoints.`
      }
    }
  }
  const baseUrl = providerConfig.baseUrl || defaultProviderBaseUrl(canonicalProviderId)
  if (!baseUrl) {
    return { ok: false, error: { code: 'PRECHECK_FAILED', message: 'Base URL is required for this provider.' } }
  }
  // SECURITY: never trust a renderer-supplied baseUrl; a compromised renderer
  // could redirect credentials to an attacker host. Source baseUrl only from the
  // stored config (which holds the user's legitimate custom/proxy endpoint).
  const credentials = credentialsFromProvider(providerConfig)
  // SECURITY: explicitly pick only the fields a handler is allowed to consume.
  // Spreading the raw renderer `params` would forward arbitrary keys (e.g. a
  // rogue `headers` / `httpAgent`) into the handler, which could influence its
  // request behaviour. Keep this list in sync with the handler signatures.
  const safePayload = { providerId: canonicalProviderId, action }
  for (const key of STORED_PROVIDER_PAYLOAD_KEYS) {
    if (Object.hasOwn(providerConfig || {}, key)) safePayload[key] = providerConfig[key]
  }
  for (const key of ALLOWED_PROVIDER_PAYLOAD_KEYS) {
    if (Object.hasOwn(params || {}, key)) safePayload[key] = params[key]
  }
  if (track !== 'chat' && action !== 'poll') {
    const validation = validateGenerationRequest(track, providerDef, safePayload)
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: 'PRECHECK_FAILED',
          message: validation.errors.map(item => item.suggestion ? `${item.message} ${item.suggestion}` : item.message).join('\n'),
          details: validation.errors,
          warnings: validation.warnings
        }
      }
    }
    Object.assign(safePayload, validation.options)
  }
  const result = await providerPipeline.execute({
    ...safePayload,
    credentials,
    baseUrl,
    requestOptions: requestOptionsFromConfig(stored, providerConfig)
  })
  if (result.ok && track === 'video' && action === 'submit' && result.data?.taskId) {
    storeVideoPollSession(result.data.taskId, {
      providerId: canonicalProviderId,
      credentials,
      baseUrl,
      requestOptions: requestOptionsFromConfig(stored, providerConfig),
      payload: safePayload
    })
  }
  return result
}

registerProviderIpc({
  ipcMain,
  config,
  modelsApi,
  providerPipeline,
  buildProviderImageTestPayload,
  executeProviderCall,
  getProvidersByAction,
  getModelCatalog,
  getProviderCallMode,
  getProviderSetupMode,
  resolveHandler,
  isTemplateConfigurableProvider,
  storedProviderForRequest,
  inferProviderTrack,
  resolveProviderIdByTrack,
  canUseStoredCredentials,
  realSecret,
  credentialsFromProvider,
  applyQueryParams,
  requestOptionsFromConfig,
  getModelFetchProvider
})

function defaultProviderBaseUrl(providerId) {
  const def = require('./providers/registry').getProvider(providerId)
  return def?.defaults?.baseUrl || ''
}

function requestOptionsFromConfig(stored = config.load(), providerConfig = {}) {
  const timeout = Number(providerConfig.timeout || stored.general?.apiTimeout)
  return Number.isFinite(timeout) && timeout > 0 ? { timeout } : {}
}

function cleanupVideoPollSessions() {
  const now = Date.now()
  for (const [taskId, sessionInfo] of videoPollSessions) {
    if (!sessionInfo?.expiresAt || sessionInfo.expiresAt <= now) {
      videoPollSessions.delete(taskId)
    }
  }
}

function storeVideoPollSession(taskId, sessionInfo) {
  if (!taskId) return
  cleanupVideoPollSessions()
  videoPollSessions.set(String(taskId), {
    ...sessionInfo,
    expiresAt: Date.now() + VIDEO_POLL_SESSION_TTL_MS
  })
}

function getVideoPollSession(taskId) {
  cleanupVideoPollSessions()
  if (!taskId) return null
  return videoPollSessions.get(String(taskId)) || null
}

function shouldClearVideoPollSession(data = {}) {
  const status = String(data.status || '').toLowerCase()
  return ['succeeded', 'completed', 'failed', 'cancelled', 'canceled'].includes(status) || Boolean(data.videoUrl)
}

async function pollVideoWithSession(taskId, override = {}) {
  const sessionInfo = getVideoPollSession(taskId)
  if (!sessionInfo) return null
  const result = await providerPipeline.execute({
    ...sessionInfo.payload,
    ...override,
    action: 'poll',
    providerId: sessionInfo.providerId,
    credentials: sessionInfo.credentials,
    taskId,
    baseUrl: sessionInfo.baseUrl,
    requestOptions: sessionInfo.requestOptions
  })
  if (result.ok && shouldClearVideoPollSession(result.data)) {
    videoPollSessions.delete(String(taskId))
  }
  return result
}

registerAssetIpc({
  ipcMain,
  getMainWindow: () => mainWindow,
  saveDir: SAVE_DIR,
  normalizeAssetLabel,
  writeAssetUrl,
  cacheAssetPreview: (params) => cacheAssetPreview(params, {
    cacheDir: MEDIA_CACHE_DIR,
    downloadToFile,
    validateAssetBytes
  }),
  openExternalSafe
})

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
    const devCsp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' gravuresse-media: data: blob:; media-src 'self' gravuresse-media: data: blob:; connect-src 'self' https: ws:; font-src 'self' data: https://fonts.gstatic.com; child-src 'self'"
    // Prod: allow Google Fonts CDN (style-src / font-src) so the @import in
    // global.css can load Inter/JetBrains/Outfit in the packaged app; scripts
    // and navigational surfaces stay locked down.
    const prodCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' gravuresse-media: data: blob:; media-src 'self' gravuresse-media: data: blob:; connect-src 'self' https:; font-src 'self' data: https://fonts.gstatic.com; child-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
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
  registerMediaCacheProtocol()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {})
