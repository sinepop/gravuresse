const { app, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')

const CONFIG_DIR = path.join(app.getPath('userData'), 'Gravuresse')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const REDACTED_API_KEY = '********'
const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const hasOwn = Object.hasOwn || ((obj, key) => Object.prototype.hasOwnProperty.call(obj, key))

const DEFAULT_CONFIG = {
  providers: {
    chat: { id: 'custom-chat', apiKey: '', sessionToken: '', baseUrl: 'https://opencode.ai/zen/go/v1', model: 'deepseek-v4-flash' },
    image: { id: 'openai', apiKey: '', sessionToken: '', baseUrl: 'https://api.openai.com', model: 'gpt-image-2' },
    video: { id: 'volcengine', apiKey: '', sessionToken: '', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedance-2-0-pro-250528' }
  },
  chatProviders: [
    {
      name: 'OpenCode Go',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      apiKey: '',
      defaultModel: 'deepseek-v4-flash',
      models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
      enabled: true
    }
  ],
  savedChatModel: 'deepseek-v4-flash',
  savedImageModel: 'gpt-image-2',
  savedVideoModel: 'doubao-seedance-2-0-pro-250528',
  providerProfiles: {
    chat: [],
    image: [],
    video: []
  },
  providerAccounts: [],
  connections: {
    schemaVersion: 1,
    accounts: [],
    apiKeys: [],
    relays: [],
    defaults: { chat: null, image: null, video: null }
  },
  general: {
    theme: 'light', language: 'zh', fontSize: 'medium',
    autoSave: true, exportPath: '', apiTimeout: 60000, autoSaveImage: false,
    enableVideo: false, enableReference: false, defaultRatio: '1:1',
    defaultStyle: '', defaultResolution: '1024', defaultDuration: 5
  },
  canvasLayout: 'grid'
}

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function sanitizeObjectShape(value) {
  if (Array.isArray(value)) return value.map(sanitizeObjectShape)
  if (!isPlainObject(value)) return value
  const result = {}
  for (const key of Object.keys(value)) {
    if (BLOCKED_OBJECT_KEYS.has(key)) continue
    result[key] = sanitizeObjectShape(value[key])
  }
  return result
}

// Deep merge preserves nested default values.
function deepMerge(target, source) {
  const result = { ...target }
  const safeSource = sanitizeObjectShape(source)
  for (const key of Object.keys(safeSource || {})) {
    if (BLOCKED_OBJECT_KEYS.has(key)) continue
    if (
      isPlainObject(safeSource[key]) &&
      isPlainObject(target[key])
    ) {
      result[key] = deepMerge(target[key], safeSource[key])
    } else {
      result[key] = safeSource[key]
    }
  }
  return result
}

// Unified secret field names used across providers, profiles, and accounts.
const SECRET_FIELDS = ['apiKey', 'sessionToken', 'token', 'accessKey', 'secretKey']

// Active runtime provider secret paths.
const SECRET_PATHS = []
for (const track of ['chat', 'image', 'video']) {
  for (const field of SECRET_FIELDS) {
    SECRET_PATHS.push(['providers', track, field])
  }
}

function chatProviderSecretPaths(cfg) {
  const paths = []
  const providers = Array.isArray(cfg?.chatProviders) ? cfg.chatProviders : []
  providers.forEach((_, index) => {
    for (const field of SECRET_FIELDS) {
      paths.push(['chatProviders', index, field])
    }
  })
  return paths
}

const PROVIDER_ID_ALIASES = {
  chat: { claude: 'anthropic', gemini: 'google', qwen: 'alibaba', kimi: 'moonshot', doubao: 'volcengine' },
  image: { dalle: 'openai', gemini_img: 'google', jimeng_img: 'volcengine' },
  video: { jimeng_vid: 'volcengine' }
}

const TRACKS = ['chat', 'image', 'video']

let writeQueue = Promise.resolve()

function enqueueWrite(fn) {
  const next = writeQueue.catch(() => {}).then(fn)
  writeQueue = next.catch(() => {})
  return next
}

function canonicalProviderId(track, id) {
  return PROVIDER_ID_ALIASES[track]?.[id] || id || ''
}

function providerAuthSignature(provider = {}) {
  const customAuth = provider.customAuth || {}
  const authType = provider.authType || {}
  const authTypeValue = typeof provider.authType === 'string' ? provider.authType : authType.type
  const type = String(customAuth.type || authTypeValue || 'bearer').toLowerCase().replace(/_/g, '-')
  const key = customAuth.headerName || customAuth.paramName || customAuth.sessionHeaderName || customAuth.key || authType.headerName || authType.paramName || authType.key || ''
  return `${type}:${key}`
}

function sameProviderEndpoint(track, nextProvider = {}, currentProvider = {}) {
  return (
    canonicalProviderId(track, nextProvider.id || nextProvider.providerId) === canonicalProviderId(track, currentProvider.id || currentProvider.providerId) &&
    (nextProvider.baseUrl || '') === (currentProvider.baseUrl || '') &&
    providerAuthSignature(nextProvider) === providerAuthSignature(currentProvider)
  )
}

function sameProviderProfile(track, a = {}, b = {}) {
  return (
    sameProviderEndpoint(track, a, b) &&
    (a.model || '') === (b.model || '')
  )
}

function profileSecretPaths(cfg) {
  const paths = []
  for (const track of TRACKS) {
    const profiles = cfg?.providerProfiles?.[track] || []
    profiles.forEach((_, index) => {
      for (const field of SECRET_FIELDS) {
        paths.push(['providerProfiles', track, index, field])
      }
    })
  }
  return paths
}

function accountSecretPaths(cfg) {
  const paths = []
  const accounts = Array.isArray(cfg?.providerAccounts) ? cfg.providerAccounts : []
  accounts.forEach((_, index) => {
    for (const field of SECRET_FIELDS) {
      paths.push(['providerAccounts', index, field])
    }
  })
  return paths
}

function connectionSecretPaths(cfg) {
  const paths = []
  for (const collection of ['accounts', 'apiKeys', 'relays']) {
    const connections = Array.isArray(cfg?.connections?.[collection]) ? cfg.connections[collection] : []
    connections.forEach((connection, index) => {
      for (const field of [...SECRET_FIELDS, 'refreshToken', 'idToken', 'oauthToken']) {
        paths.push(['connections', collection, index, field])
        if (isPlainObject(connection?.credentials)) {
          paths.push(['connections', collection, index, 'credentials', field])
        }
      }
    })
  }
  return paths
}

function allSecretPaths(cfg) {
  return [...SECRET_PATHS, ...chatProviderSecretPaths(cfg), ...profileSecretPaths(cfg), ...accountSecretPaths(cfg), ...connectionSecretPaths(cfg)]
}

function getNestedValue(obj, keys) {
  return keys.reduce((o, k) => o?.[k], obj)
}

function setNestedValue(obj, keys, value) {
  const path = keys.slice(0, -1)
  const last = keys[keys.length - 1]
  const target = path.reduce((o, k) => o[k], obj)
  if (target && hasOwn(target, last)) target[last] = value
}

// Encrypt provider secrets before writing config to disk.
function encryptApiKeys(cfg) {
  if (!safeStorage.isEncryptionAvailable()) return cfg
  const result = JSON.parse(JSON.stringify(sanitizeObjectShape(cfg))) // deep clone
  for (const keyPath of allSecretPaths(result)) {
    const val = getNestedValue(result, [...keyPath])
    if (val && typeof val === 'string' && val.length > 0) {
      setNestedValue(result, [...keyPath], '__ENCRYPTED__' + safeStorage.encryptString(val).toString('base64'))
    }
  }
  return result
}

function assertSecretsCanBePersisted(cfg) {
  if (safeStorage.isEncryptionAvailable()) return
  for (const keyPath of allSecretPaths(cfg)) {
    const value = getNestedValue(cfg, keyPath)
    if (typeof value === 'string' && value && !value.startsWith('__ENCRYPTED__')) {
      throw new Error('Secure credential storage is unavailable; secret changes were not saved')
    }
  }
}

// Decrypt provider secrets after reading config from disk.
function decryptApiKeys(cfg) {
  if (!safeStorage.isEncryptionAvailable()) return cfg
  const result = JSON.parse(JSON.stringify(sanitizeObjectShape(cfg)))
  for (const keyPath of allSecretPaths(result)) {
    const val = getNestedValue(result, [...keyPath])
    if (val && typeof val === 'string' && val.startsWith('__ENCRYPTED__')) {
      const b64 = val.slice('__ENCRYPTED__'.length)
      try {
        setNestedValue(result, [...keyPath], safeStorage.decryptString(Buffer.from(b64, 'base64')))
      } catch {
        // OS key/profile changes can make safeStorage data unreadable.
        setNestedValue(result, [...keyPath], '')
      }
    }
  }
  return result
}

function redactApiKeys(cfg) {
  const result = JSON.parse(JSON.stringify(sanitizeObjectShape(cfg)))
  for (const keyPath of allSecretPaths(result)) {
    const val = getNestedValue(result, [...keyPath])
    if (val && typeof val === 'string') {
      setNestedValue(result, [...keyPath], REDACTED_API_KEY)
    }
  }
  return result
}

function migrateOldProviderFormat(config) {
  if (!Array.isArray(config.providers)) return config

  const chatProviders = config.providers.filter(isPlainObject)
  const activeIndex = Math.max(0, chatProviders.findIndex(provider => provider.enabled !== false))
  const active = chatProviders[activeIndex] || DEFAULT_CONFIG.chatProviders[0]
  config.chatProviders = chatProviders.length ? chatProviders : [...DEFAULT_CONFIG.chatProviders]
  config.providers = {
    chat: {
      id: 'custom-chat',
      apiKey: active.apiKey || '',
      sessionToken: active.sessionToken || '',
      baseUrl: active.baseUrl || '',
      model: config.savedChatModel || active.defaultModel || ''
    },
    image: { ...DEFAULT_CONFIG.providers.image },
    video: { ...DEFAULT_CONFIG.providers.video }
  }
  return config
}

function connectionId(prefix, parts) {
  const value = parts.map(part => String(part || '').trim().toLowerCase()).join('|')
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`
}

function normalizeCapabilities(value, fallbackTrack = '') {
  const source = Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? Object.keys(value).filter(key => value[key])
      : fallbackTrack ? [fallbackTrack] : []
  return [...new Set(source.filter(item => TRACKS.includes(item)))]
}

function migrateConnections(config) {
  config = sanitizeObjectShape(config || {})
  const existing = isPlainObject(config.connections) ? config.connections : {}
  const importLegacy = existing.schemaVersion !== 1
  const next = {
    schemaVersion: 1,
    accounts: Array.isArray(existing.accounts) ? existing.accounts.map(item => ({ ...item })) : [],
    apiKeys: Array.isArray(existing.apiKeys) ? existing.apiKeys.map(item => ({ ...item })) : [],
    relays: Array.isArray(existing.relays) ? existing.relays.map(item => ({ ...item })) : [],
    defaults: {
      chat: existing.defaults?.chat ?? null,
      image: existing.defaults?.image ?? null,
      video: existing.defaults?.video ?? null
    }
  }
  const globallySeen = new Set()
  for (const collection of ['accounts', 'apiKeys', 'relays']) {
    next[collection] = next[collection].map((item, index) => {
      const originalId = item.id || item.accountId || connectionId(collection, [item.providerId, item.baseUrl, index])
      let id = originalId
      if (globallySeen.has(id)) id = connectionId(collection, [originalId, item.providerId, item.baseUrl, item.kind])
      let suffix = 2
      const base = id
      while (globallySeen.has(id)) id = `${base}_${suffix++}`
      globallySeen.add(id)
      return { ...item, id }
    })
  }
  const add = (collection, item) => {
    if (!item?.id) return
    const existingIndex = next[collection].findIndex(existing => existing.id === item.id)
    if (existingIndex >= 0) {
      const existing = next[collection][existingIndex]
      next[collection][existingIndex] = {
        ...item,
        ...existing,
        capabilities: normalizeCapabilities([...(existing.capabilities || []), ...(item.capabilities || [])])
      }
      return
    }
    if (globallySeen.has(item.id)) return
    globallySeen.add(item.id)
    next[collection].push(item)
  }

  for (const account of importLegacy && Array.isArray(config.providerAccounts) ? config.providerAccounts : []) {
    if (account.kind === 'oauth-placeholder') continue
    const capabilities = normalizeCapabilities(account.capabilities || account.tracks, account.track)
    const providerId = canonicalProviderId(account.track || capabilities[0] || 'chat', account.providerId || account.id || '')
    const kind = account.kind || 'api-key'
    const id = account.accountId || connectionId(kind === 'api-key' ? 'key' : 'account', [providerId, account.baseUrl, kind])
    const common = {
      ...account,
      id,
      providerId,
      capabilities
    }
    add(kind === 'api-key' ? 'apiKeys' : 'accounts', common)
  }

  for (const provider of importLegacy && Array.isArray(config.chatProviders) ? config.chatProviders : []) {
    const id = provider.id || connectionId('relay', [provider.name, provider.baseUrl])
    add('relays', {
      id,
      name: provider.name || 'Custom relay',
      providerId: 'custom-chat',
      compatibilityMode: 'custom',
      baseUrl: provider.baseUrl || '',
      apiKey: provider.apiKey || '',
      sessionToken: provider.sessionToken || '',
      authType: provider.authType || { type: 'bearer' },
      capabilities: ['chat'],
      modelsPath: provider.modelListPath || provider.modelsPath || '',
      models: []
    })
  }

  for (const track of importLegacy ? TRACKS : []) {
    for (const [index, profile] of (config.providerProfiles?.[track] || []).entries()) {
      const providerId = canonicalProviderId(track, profile.providerId || profile.id || '')
      const id = profile.accountId || profile.profileId || connectionId('key', [providerId, profile.baseUrl, profile.authType?.type || profile.authType, track, index])
      add('apiKeys', {
        ...profile,
        id,
        providerId,
        capabilities: normalizeCapabilities(profile.capabilities, track),
        modelsPath: profile.modelListPath || profile.modelsPath || ''
      })
    }
  }

  for (const track of importLegacy ? TRACKS : []) {
    if (next.defaults[track]) continue
    const runtime = isPlainObject(config.providers) ? config.providers[track] : null
    const modelId = config[`saved${track[0].toUpperCase()}${track.slice(1)}Model`] || runtime?.model || ''
    if (!modelId) continue
    const candidates = [...next.accounts, ...next.apiKeys, ...next.relays]
    const match = candidates.find(item =>
      (!runtime?.accountId || item.id === runtime.accountId || item.accountId === runtime.accountId) &&
      normalizeCapabilities(item.capabilities).includes(track) &&
      (!runtime || !runtime.baseUrl || item.baseUrl === runtime.baseUrl) &&
      (!runtime || !runtime.id || item.providerId === canonicalProviderId(track, runtime.id))
    )
    next.defaults[track] = {
      connectionId: match?.id || null,
      providerId: runtime?.id || match?.providerId || '',
      modelId
    }
  }

  config.connections = next
  if (importLegacy) {
    config.providerAccounts = []
    config.chatProviders = []
    config.providerProfiles = { chat: [], image: [], video: [] }
    if (isPlainObject(config.providers)) {
      for (const track of TRACKS) {
        if (!isPlainObject(config.providers[track])) continue
        for (const field of SECRET_FIELDS) delete config.providers[track][field]
      }
    }
  }
  return config
}

function findMatchingProvider(cfg, name, baseUrl) {
  const providers = Array.isArray(cfg?.providers) ? cfg.providers : []
  return providers.find(p => (p.name || '') === name && (p.baseUrl || '') === baseUrl) || {}
}

function mergeRedactedApiKeys(nextCfg, currentCfg) {
  const result = JSON.parse(JSON.stringify(sanitizeObjectShape(nextCfg)))
  currentCfg = sanitizeObjectShape(currentCfg)
  // Active providers: a redacted secret may only be restored from the same endpoint.
  if (isPlainObject(result.providers)) {
    const currentProvidersObj = isPlainObject(currentCfg.providers) ? currentCfg.providers : {}
    for (const track of TRACKS) {
      const nextProvider = result.providers[track]
      if (!isPlainObject(nextProvider)) continue
      const currentProvider = currentProvidersObj[track]
      for (const field of SECRET_FIELDS) {
        if (nextProvider[field] !== REDACTED_API_KEY) continue
        const profileMatch = (currentCfg.providerProfiles?.[track] || []).find(profile => sameProviderProfile(track, nextProvider, profile))
        const customMatch = track === 'chat'
            ? (currentCfg.chatProviders || []).find(provider =>
                (provider.baseUrl || '') === (nextProvider.baseUrl || '') &&
                providerAuthSignature(provider) === providerAuthSignature(nextProvider)
              )
            : null
        const currentSecret = sameProviderEndpoint(track, nextProvider, currentProvider)
          ? currentProvider?.[field] || ''
          : ''
        result.providers[track][field] = currentSecret || profileMatch?.[field] || customMatch?.[field] || ''
      }
    }
  }
  // Custom chat provider candidates keep their own secrets, separate from the active runtime selection.
  const nextChatProviders = Array.isArray(result.chatProviders) ? result.chatProviders : []
  const currentChatProviders = Array.isArray(currentCfg.chatProviders) ? currentCfg.chatProviders : []
  nextChatProviders.forEach((provider, index) => {
    for (const field of SECRET_FIELDS) {
      if (provider?.[field] !== REDACTED_API_KEY) continue
      const exactMatch = currentChatProviders.find(item =>
        (item.name || '') === (provider.name || '') &&
        (item.baseUrl || '') === (provider.baseUrl || '') &&
        providerAuthSignature(item) === providerAuthSignature(provider)
      )
      const indexedMatch = (currentChatProviders[index]?.baseUrl || '') === (provider.baseUrl || '') &&
        providerAuthSignature(currentChatProviders[index]) === providerAuthSignature(provider)
        ? currentChatProviders[index]
        : null
      result.chatProviders[index][field] = exactMatch?.[field] || indexedMatch?.[field] || ''
    }
  })
  // Provider profiles (legacy track-based)
  for (const track of TRACKS) {
    const nextProfiles = result.providerProfiles?.[track] || []
    const currentProfiles = currentCfg.providerProfiles?.[track] || []
    nextProfiles.forEach((profile, index) => {
      for (const field of SECRET_FIELDS) {
        if (profile?.[field] !== REDACTED_API_KEY) continue
        const currentProfile = currentProfiles.find(item =>
          (profile.profileId && item.profileId === profile.profileId) ||
          (profile.id && item.id === profile.id) ||
          sameProviderProfile(track, profile, item)
        )
        // Fallback: check stored provider for the same secret
        const storedProvider = isPlainObject(currentCfg.providers) ? currentCfg.providers[track] : null
        const providerSecret = storedProvider && sameProviderProfile(track, profile, storedProvider) ? storedProvider[field] || '' : ''
        profile[field] = currentProfile?.[field] || providerSecret
        setNestedValue(result, ['providerProfiles', track, index, field], profile[field])
      }
    })
  }
  // Provider accounts
  const nextAccounts = Array.isArray(result.providerAccounts) ? result.providerAccounts : []
  const currentAccounts = Array.isArray(currentCfg.providerAccounts) ? currentCfg.providerAccounts : []
  nextAccounts.forEach((account, index) => {
    for (const field of SECRET_FIELDS) {
      if (account?.[field] !== REDACTED_API_KEY) continue
      const currentAccount = currentAccounts.find(item =>
        (!account.accountId || account.accountId === item.accountId) &&
        (account.providerId || account.id || '') === (item.providerId || item.id || '') &&
        (account.baseUrl || '') === (item.baseUrl || '') &&
        (account.kind || 'api-key') === (item.kind || 'api-key') &&
        providerAuthSignature(account) === providerAuthSignature(item)
      )
      setNestedValue(result, ['providerAccounts', index, field], currentAccount?.[field] || '')
    }
  })
  // Canonical connections restore a redacted secret only when id, provider,
  // endpoint, and authentication scheme are unchanged.
  for (const collection of ['accounts', 'apiKeys', 'relays']) {
    const nextConnections = result.connections?.[collection] || []
    const currentConnections = currentCfg.connections?.[collection] || []
    nextConnections.forEach((connection, index) => {
      const currentConnection = currentConnections.find(item =>
        item.id === connection.id &&
        (item.providerId || '') === (connection.providerId || '') &&
        (item.baseUrl || '') === (connection.baseUrl || '') &&
        providerAuthSignature(item) === providerAuthSignature(connection)
      )
      for (const field of [...SECRET_FIELDS, 'refreshToken', 'idToken', 'oauthToken']) {
        if (connection?.[field] === REDACTED_API_KEY) {
          setNestedValue(result, ['connections', collection, index, field], currentConnection?.[field] || '')
        }
        if (connection?.credentials?.[field] === REDACTED_API_KEY) {
          setNestedValue(result, ['connections', collection, index, 'credentials', field], currentConnection?.credentials?.[field] || '')
        }
      }
    })
  }
  return result
}

function load() {
  ensureDir()
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = sanitizeObjectShape(JSON.parse(raw))
    const merged = deepMerge(DEFAULT_CONFIG, migrateConnections(migrateOldProviderFormat(parsed)))
    return decryptApiKeys(merged)
  } catch { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) }
}

function save(cfg) {
  return enqueueWrite(() => {
    ensureDir()
    const canonical = migrateConnections(migrateOldProviderFormat(sanitizeObjectShape(cfg)))
    assertSecretsCanBePersisted(canonical)
    const encrypted = encryptApiKeys(canonical)
    const tmpFile = CONFIG_FILE + '.tmp'
    fs.writeFileSync(tmpFile, JSON.stringify(encrypted, null, 2), 'utf-8')
    fs.renameSync(tmpFile, CONFIG_FILE)
  })
}

function update(mutator) {
  return enqueueWrite(() => {
    ensureDir()
    const current = load()
    const next = migrateConnections(migrateOldProviderFormat(sanitizeObjectShape(mutator(current))))
    assertSecretsCanBePersisted(next)
    const encrypted = encryptApiKeys(next)
    const tmpFile = CONFIG_FILE + '.tmp'
    fs.writeFileSync(tmpFile, JSON.stringify(encrypted, null, 2), 'utf-8')
    fs.renameSync(tmpFile, CONFIG_FILE)
    return next
  })
}

module.exports = {
  load,
  save,
  update,
  redactApiKeys,
  mergeRedactedApiKeys,
  REDACTED_API_KEY,
  SECRET_FIELDS,
  DEFAULT_CONFIG,
  PROVIDER_ID_ALIASES,
  _test: { deepMerge, sanitizeObjectShape, migrateOldProviderFormat, migrateConnections, normalizeCapabilities, encryptApiKeys, decryptApiKeys, mergeRedactedApiKeys, assertSecretsCanBePersisted }
}
