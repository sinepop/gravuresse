const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron')
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
const { sanitizeConversationImportPayload } = require('./security/sanitize')
// Wire handler side-effects (registerHandler): must be required so the
// HANDLER_MAP is populated before any provider:call / api:* dispatch.
require('./providers')
const { getProvider, getProvidersByAction, getModelCatalog, getProviderCallMode, getProviderSetupMode } = require('./providers/registry')
const { resolveHandler } = require('./providers/handler')
const { validateGenerationRequest } = require('./providers/validation')

let mainWindow = null
let crashCount = 0

const SAVE_DIR = path.join(app.getPath('pictures'), 'Gravuresse')
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

function getStoredProvider(track) {
  return config.load().providers?.[track] || {}
}

function sameStoredProviderProfile(track, provider = {}, profile = {}) {
  const providerId = resolveProviderIdByTrack(track, provider.providerId || provider.id)
  const profileId = resolveProviderIdByTrack(track, profile.providerId || profile.id)
  if (!providerId || providerId !== profileId) return false
  if (provider.baseUrl && (provider.baseUrl || '') !== (profile.baseUrl || '')) return false
  if (provider.model && (provider.model || '') !== (profile.model || '')) return false
  return true
}

function findStoredProviderProfile(stored = {}, track, provider = {}) {
  const profile = (stored.providerProfiles?.[track] || []).find(item => sameStoredProviderProfile(track, provider, item))
  if (!profile) return null
  return {
    ...profile,
    id: profile.providerId || profile.id,
    baseUrl: profile.baseUrl || '',
    model: profile.model || ''
  }
}

function storedProviderForRequest(stored = {}, track, provider = {}) {
  const activeProvider = stored.providers?.[track] || {}
  const requestedId = resolveProviderIdByTrack(track, provider.providerId || provider.id || activeProvider.id)
  const activeId = resolveProviderIdByTrack(track, activeProvider.id)
  const activeMatches =
    (!requestedId || requestedId === activeId) &&
    (!provider.baseUrl || (provider.baseUrl || '') === (activeProvider.baseUrl || '')) &&
    (!provider.model || (provider.model || '') === (activeProvider.model || ''))
  if (activeMatches) return activeProvider
  return findStoredProviderProfile(stored, track, { providerId: requestedId, baseUrl: provider.baseUrl, model: provider.model }) || {}
}

function cleanEndpoint(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function canUseStoredCredentials(track, candidate = {}, storedProvider = {}) {
  const candidateId = candidate.id || candidate.providerId || storedProvider.id
  const canonicalId = resolveProviderIdByTrack(track, candidateId)
  if (!canonicalId || canonicalId !== resolveProviderIdByTrack(track, storedProvider.id)) return false
  const candidateUrl = cleanEndpoint(candidate.baseUrl || defaultProviderBaseUrl(canonicalId))
  const allowedUrl = cleanEndpoint(storedProvider.baseUrl || defaultProviderBaseUrl(canonicalId))
  return Boolean(candidateUrl && allowedUrl && candidateUrl === allowedUrl)
}

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
  // SECURITY: never trust a renderer-supplied baseUrl — a compromised renderer
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
ipcMain.handle('config:save', async (_, cfg) => {
  const allowedKeys = Object.keys(config.DEFAULT_CONFIG)
  const filtered = {}
  for (const key of allowedKeys) {
    if (key in cfg) filtered[key] = cfg[key]
  }
  await config.save(config.mergeRedactedApiKeys(filtered, config.load()))
})

ipcMain.handle('history:get', () => store.loadAll())
ipcMain.handle('history:save', (_, records) => store.saveAllQueued(records))
ipcMain.handle('conv:loadAll', () => store.loadAll())
ipcMain.handle('conv:save', (_, id, data) => store.saveConversation(id, data))
ipcMain.handle('conv:delete', (_, id) => store.deleteConversation(id))
ipcMain.handle('conv:setActive', (_, id) => store.setActiveId(id))
ipcMain.handle('conv:export', async (_, conversation = {}) => {
  const title = normalizeAssetLabel(conversation.title || 'conversation')
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${title}.gravuresse.json`,
    filters: [{ name: 'Gravuresse JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }

  const exportAssets = Array.isArray(conversation.assets) ? conversation.assets : []
  const media = await inlineExportAssets(exportAssets)
  const buildPayload = (assets, mediaMeta) => ({
    schemaVersion: 1,
    app: 'Gravuresse',
    exportedAt: new Date().toISOString(),
    media: mediaMeta,
    conversation: {
      title: conversation.title || '',
      messages: Array.isArray(conversation.messages) ? conversation.messages : [],
      assets
    }
  })
  let payload = buildPayload(media.assets, { inlined: media.inlined, skipped: media.skipped, fallback: false })
  let text = JSON.stringify(payload, null, 2)
  if (Buffer.byteLength(text, 'utf8') > MAX_PROJECT_EXPORT_BYTES && media.inlined > 0) {
    payload = buildPayload(exportAssets, { inlined: 0, skipped: remoteExportAssetCount(exportAssets), fallback: true })
    text = JSON.stringify(payload, null, 2)
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_PROJECT_EXPORT_BYTES) {
    throw new Error('Conversation export is too large')
  }
  writeTextAtomic(text, path.resolve(result.filePath))
  return { canceled: false, filePath: path.resolve(result.filePath), media: payload.media }
})
ipcMain.handle('conv:exportProject', async (_, conversations = []) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `gravuresse-project-${new Date().toISOString().slice(0, 10)}.gravuresse.json`,
    filters: [{ name: 'Gravuresse JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }

  const sourceConversations = Array.isArray(conversations) ? conversations : []
  const media = await inlineExportConversations(sourceConversations)
  const buildPayload = (items, mediaMeta) => ({
    schemaVersion: 1,
    app: 'Gravuresse',
    kind: 'project',
    exportedAt: new Date().toISOString(),
    media: mediaMeta,
    conversations: items
  })
  let payload = buildPayload(media.conversations, { inlined: media.inlined, skipped: media.skipped, fallback: false })
  let text = JSON.stringify(payload, null, 2)
  if (Buffer.byteLength(text, 'utf8') > MAX_PROJECT_EXPORT_BYTES && media.inlined > 0) {
    payload = buildPayload(sourceConversations.map(conversation => ({
      title: conversation.title || '',
      messages: Array.isArray(conversation.messages) ? conversation.messages : [],
      assets: Array.isArray(conversation.assets) ? conversation.assets : []
    })), { inlined: 0, skipped: remoteExportConversationAssetCount(sourceConversations), fallback: true })
    text = JSON.stringify(payload, null, 2)
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_PROJECT_EXPORT_BYTES) {
    throw new Error('Project export is too large')
  }
  writeTextAtomic(text, path.resolve(result.filePath))
  return { canceled: false, filePath: path.resolve(result.filePath), media: payload.media, count: sourceConversations.length }
})
ipcMain.handle('conv:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Gravuresse JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePaths?.[0]) return { canceled: true }

  const filePath = path.resolve(result.filePaths[0])
  const stat = fs.statSync(filePath)
  if (stat.size > MAX_PROJECT_EXPORT_BYTES) {
    throw new Error('Conversation import is too large')
  }
  const data = sanitizeConversationImportPayload(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  if (!data || (typeof data !== 'object' && !Array.isArray(data))) {
    throw new Error('Invalid Gravuresse import file')
  }
  return { canceled: false, data }
})

// Unified provider call
ipcMain.handle('provider:call', async (_, params = {}) => {
  const stored = config.load()
  const { providerId, action } = params
  const track = action === 'chat' ? 'chat' : action === 'generate' ? 'image' : 'video'

  if (track === 'video' && action === 'poll') {
    const sessionResult = await pollVideoWithSession(params.taskId, { model: params.model })
    if (sessionResult) return sessionResult
  }

  const activeProviderConfig = stored.providers?.[track] || {}
  const requestedProviderId = resolveProviderIdByTrack(track, providerId)
  if (track === 'video' && action === 'poll') {
    const storedProviderId = resolveProviderIdByTrack(track, activeProviderConfig.id)
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

  const activeProviderId = resolveProviderIdByTrack(track, activeProviderConfig.id)
  const requestTargetsActiveProvider = !requestedProviderId || requestedProviderId === activeProviderId
  const activeMatchesRequestedProfile = requestTargetsActiveProvider &&
    (!params.baseUrl || (params.baseUrl || '') === (activeProviderConfig.baseUrl || '')) &&
    (!params.model || (params.model || '') === (activeProviderConfig.model || ''))
  const hasProfileSelector = Boolean(requestedProviderId && (params.baseUrl || params.model))
  const requestedProfile = hasProfileSelector
    ? findStoredProviderProfile(stored, track, { providerId: requestedProviderId, baseUrl: params.baseUrl, model: params.model })
    : null
  if (requestedProviderId && activeProviderId && !activeMatchesRequestedProfile && !requestedProfile) {
    return {
      ok: false,
      error: {
        code: 'PROVIDER_CONFIG_SYNC_PENDING',
        message: 'The selected provider profile has not been saved yet. Wait a moment, then try again.'
      }
    }
  }
  const providerConfig = !activeMatchesRequestedProfile && requestedProfile ? requestedProfile : activeProviderConfig
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
  // SECURITY: never trust a renderer-supplied baseUrl — a compromised renderer
  // could redirect credentials to an attacker host. Source baseUrl only from the
  // stored config (which holds the user's legitimate custom/proxy endpoint).
  const credentials = credentialsFromProvider(providerConfig)
  // SECURITY: explicitly pick only the fields a handler is allowed to consume.
  // Spreading the raw renderer `params` would forward arbitrary keys (e.g. a
  // rogue `headers` / `httpAgent`) into the handler, which could influence its
  // request behaviour. Keep this list in sync with the handler signatures.
  const safePayload = { providerId: canonicalProviderId, action }
  for (const key of STORED_PROVIDER_PAYLOAD_KEYS) {
    if (key in providerConfig) safePayload[key] = providerConfig[key]
  }
  for (const key of ALLOWED_PROVIDER_PAYLOAD_KEYS) {
    if (key in params) safePayload[key] = params[key]
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
})

// List providers by action (for settings dropdown)
ipcMain.handle('provider:list', async (_, action) => {
  const track = action || 'chat'
  return getProvidersByAction(track).map(p => {
    const nativeExecutable = Boolean(resolveHandler(p[track]?.protocol))
    const templateExecutable = isTemplateConfigurableProvider(p, track)
    const executable = nativeExecutable || templateExecutable
    const integrationStatus = nativeExecutable
      ? (p[track]?.integrationStatus || p.capabilities?.[track]?.integrationStatus || '')
      : templateExecutable
        ? 'custom-template'
        : (p[track]?.integrationStatus || p.capabilities?.[track]?.integrationStatus || '')
    return {
      id: p.id,
      name: p.name,
      platform: p.platform,
      meta: p.meta,
      links: p.links || p.meta?.links || {},
      billing: p.billing || p.meta?.billing || { mode: 'unknown' },
      capabilities: p.capabilities || p.meta?.capabilities || {},
      constraints: p.constraints || p.meta?.constraints || {},
      customizable: p.customizable || p.meta?.customizable || {},
      authType: p.authType || { type: 'bearer' },
      defaultUrl: p.defaults?.baseUrl || '',
      defaultModel: p[track]?.defaultModel || '',
      pathPrefix: p[track]?.pathPrefix || p.pathPrefix || '',
      modelListPath: p[track]?.modelListPath || p.modelListPath || p[track]?.modelsPath || p.modelsPath || '',
      modelCatalog: getModelCatalog(p.id, track),
      protocol: p[track]?.protocol,
      format: p[track]?.format,
      polling: p[track]?.polling === true,
      integrationStatus,
      executable,
      callMode: templateExecutable && !nativeExecutable ? 'custom-api' : getProviderCallMode(p.id, track, executable),
      setupMode: templateExecutable && !nativeExecutable ? 'custom-api' : getProviderSetupMode(p.id, track, executable)
    }
  })
})

// Test provider connection
ipcMain.handle('provider:test', async (_, params = {}) => {
  try {
    const stored = config.load()
    const track = params.track || inferProviderTrack({ id: params.providerId || params.id, protocol: params.protocol })
    const storedProvider = storedProviderForRequest(stored, track, {
      providerId: params.providerId || params.id,
      baseUrl: params.baseUrl,
      model: params.model
    })
    const providerId = resolveProviderIdByTrack(track, params.providerId || params.id || storedProvider.id)
    const providerDef = require('./providers/registry').getProvider(providerId)
    if (!providerDef) return { ok: false, message: 'Unknown provider' }
    if (track === 'image' && params.testMode === 'image') {
      const built = buildProviderImageTestPayload(params, stored)
      if (!built.ok) return { ok: false, message: built.message, code: built.code, details: built.details, warnings: built.warnings }
      const result = await providerPipeline.execute(built.payload)
      if (!result.ok) return { ok: false, message: result.error?.message || 'Image generation test failed' }
      return { ok: true, message: 'Image generation succeeded', imageUrl: result.data }
    }
    if (!providerDef.healthCheck) return { ok: true, message: 'No health check available' }
    // Use the user's configured endpoint (if any) so the test exercises the same
    // route real calls take — otherwise the key is sent to the hardcoded default
    // endpoint even on a user-configured proxy/relay, and the test result can
    // diverge from actual call success/failure.
    const requestedBaseUrl = params.baseUrl || storedProvider.baseUrl || providerDef.defaults.baseUrl
    const sameEndpoint = canUseStoredCredentials(track, { id: params.id || params.providerId || storedProvider.id, baseUrl: requestedBaseUrl }, storedProvider)
    const hasRendererCredential = Boolean(realSecret(params.apiKey || params.credentials?.apiKey) || realSecret(params.sessionToken || params.credentials?.sessionToken))
    const testBaseUrl = hasRendererCredential && params.baseUrl
      ? params.baseUrl
      : sameEndpoint
        ? requestedBaseUrl
        : providerDef.defaults.baseUrl
    const credentials = credentialsFromProvider(!hasRendererCredential && sameEndpoint ? storedProvider : {}, {
      apiKey: params.apiKey || params.credentials?.apiKey,
      sessionToken: params.sessionToken || params.credentials?.sessionToken
    })
    const { resolveAuth } = require('./providers/auth')
    const { request, joinApiUrl } = require('./api/http')
    const auth = resolveAuth(providerDef, credentials, {
      authType: params.authType || storedProvider.authType,
      customAuth: params.customAuth || storedProvider.customAuth
    })
    const url = applyQueryParams(joinApiUrl(testBaseUrl, providerDef.healthCheck.url), auth.queryParams)
    await request(url, {
      method: providerDef.healthCheck.method,
      headers: { ...auth.headers, 'Content-Type': 'application/json' },
      ...requestOptionsFromConfig(stored)
    }, providerDef.healthCheck.body)
    return { ok: true, message: 'Connection successful' }
  } catch (err) {
    return { ok: false, message: require('./providers/pipeline').redactSecrets(err?.message || 'Test failed') }
  }
})

ipcMain.handle('api:models', (_, provider) => {
  const stored = config.load()
  return modelsApi.fetch({
    ...getModelFetchProvider(provider),
    reportErrors: provider?.reportErrors === true,
    requestOptions: requestOptionsFromConfig(stored)
  })
})

// Map the user-facing stored provider id (e.g. 'claude', 'dalle', 'jimeng_vid')
// to the canonical registry id (e.g. 'anthropic', 'openai', 'volcengine').
// Mirrors PROVIDER_ID_ALIASES used on the renderer side so legacy direct-API
// channels receive a providerId the pipeline can resolve.
// Reuses the canonical aliases from config.js — single source of truth on the
// main-process side.
const { PROVIDER_ID_ALIASES } = config
function resolveProviderIdByTrack(track, id) {
  return (PROVIDER_ID_ALIASES[track] || {})[id] || id
}

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

// Convenience credentials pulled from stored config for a track.
function trackCredentials(track, override = {}) {
  const stored = config.load().providers?.[track] || {}
  return credentialsFromProvider(stored, override)
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
    model: provider?.model,
    baseUrl: storedBaseUrl(track, providerId),
    requestOptions: requestOptionsFromConfig()
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
    negative_prompt: params?.negative_prompt,
    model: params?.model,
    baseUrl: storedBaseUrl(track, providerId),
    requestOptions: requestOptionsFromConfig()
  })
  if (!result.ok) throw new Error(result.error?.message || 'Image generation failed')
  return result.data // url string
})

ipcMain.handle('api:video', async (_, params) => {
  const track = 'video'
  const stored = config.load()
  const providerConfig = stored.providers?.[track] || {}
  const providerId = resolveProviderIdByTrack(track, params?.id)
  const payload = {
    action: 'submit', providerId,
    credentials: trackCredentials(track, params),
    prompt: params?.prompt, ratio: params?.ratio, duration: params?.duration,
    sourceImageUrl: params?.sourceImageUrl,
    model: params?.model,
    baseUrl: storedBaseUrl(track, providerId),
    requestOptions: requestOptionsFromConfig(stored, providerConfig)
  }
  for (const key of STORED_PROVIDER_PAYLOAD_KEYS) {
    if (key in providerConfig) payload[key] = providerConfig[key]
  }
  const result = await providerPipeline.execute(payload)
  if (!result.ok) throw new Error(result.error?.message || 'Video submit failed')
  if (result.data?.taskId) {
    storeVideoPollSession(result.data.taskId, {
      providerId,
      credentials: payload.credentials,
      baseUrl: payload.baseUrl,
      requestOptions: payload.requestOptions,
      payload
    })
  }
  return result.data
})

ipcMain.handle('api:video:poll', async (_, taskId, provider) => {
  const track = 'video'
  const sessionResult = await pollVideoWithSession(taskId, { model: provider?.model })
  if (sessionResult) {
    if (!sessionResult.ok) throw new Error(sessionResult.error?.message || 'Video poll failed')
    return sessionResult.data
  }
  const stored = config.load()
  const storedProvider = stored.providers?.[track] || {}
  const providerId = resolveProviderIdByTrack(track, provider?.id)
  const storedProviderId = resolveProviderIdByTrack(track, storedProvider.id)
  if (providerId && storedProviderId && providerId !== storedProviderId) {
    throw new Error('Video polling session is no longer available for this task. Switch back to the original video provider or submit the task again.')
  }
  const payload = {
    action: 'poll', providerId,
    credentials: trackCredentials(track, provider),
    taskId,
    model: provider?.model,
    baseUrl: storedBaseUrl(track, providerId),
    requestOptions: requestOptionsFromConfig(stored, storedProvider)
  }
  for (const key of STORED_PROVIDER_PAYLOAD_KEYS) {
    if (key in storedProvider) payload[key] = storedProvider[key]
  }
  const result = await providerPipeline.execute(payload)
  if (!result.ok) throw new Error(result.error?.message || 'Video poll failed')
  return result.data
})

ipcMain.handle('api:saveAsset', async (_, { url, label, type }) => {
  if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true })
  const filePath = path.join(SAVE_DIR, `${normalizeAssetLabel(label)}_${Date.now()}`)
  return await writeAssetUrl(url, filePath, type)
})

ipcMain.handle('api:getSaveDir', () => SAVE_DIR)

ipcMain.handle('api:saveAssetWithDialog', async (_, { url, label, type }) => {
  const extensions = type === 'video' ? ['mp4'] : ['png', 'jpg', 'webp']
  const ext = extensions[0]
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${normalizeAssetLabel(label)}.${ext}`,
    filters: [{ name: type === 'video' ? 'MP4' : 'Images', extensions }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  const resolved = await writeAssetUrl(url, path.resolve(result.filePath), type)
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
    // global.css can load Inter/JetBrains/Outfit in the packaged app; scripts
    // and navigational surfaces stay locked down.
    const prodCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: data: blob:; media-src 'self' https: data: blob:; connect-src 'self' https:; font-src 'self' data: https://fonts.gstatic.com; child-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
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
