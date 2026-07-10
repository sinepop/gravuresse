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
  general: {
    theme: 'light', language: 'zh', fontSize: 'medium',
    autoSave: true, exportPath: '', apiTimeout: 60000, autoSaveImage: false, enableVideo: false
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

function sameProviderEndpoint(track, nextProvider = {}, currentProvider = {}) {
  return (
    canonicalProviderId(track, nextProvider.id || nextProvider.providerId) === canonicalProviderId(track, currentProvider.id || currentProvider.providerId) &&
    (nextProvider.baseUrl || '') === (currentProvider.baseUrl || '')
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

function allSecretPaths(cfg) {
  return [...SECRET_PATHS, ...chatProviderSecretPaths(cfg), ...profileSecretPaths(cfg), ...accountSecretPaths(cfg)]
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
            ? (currentCfg.chatProviders || []).find(provider => (provider.baseUrl || '') === (nextProvider.baseUrl || ''))
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
        (item.name || '') === (provider.name || '') && (item.baseUrl || '') === (provider.baseUrl || '')
      )
      const indexedMatch = (currentChatProviders[index]?.baseUrl || '') === (provider.baseUrl || '')
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
  const accountAuthSignature = (account = {}) => {
    const customAuth = account.customAuth || {}
    const authType = account.authType || {}
    const type = String(customAuth.type || authType.type || authType || 'bearer').toLowerCase().replace(/_/g, '-')
    const key = customAuth.headerName || customAuth.paramName || customAuth.sessionHeaderName || customAuth.key || authType.key || ''
    return `${type}:${key}`
  }
  nextAccounts.forEach((account, index) => {
    for (const field of SECRET_FIELDS) {
      if (account?.[field] !== REDACTED_API_KEY) continue
      const currentAccount = currentAccounts.find(item =>
        (account.accountId && item.accountId === account.accountId) ||
        (
          !account.accountId &&
          (account.providerId || account.id) &&
          (account.providerId || account.id) === (item.providerId || item.id) &&
          (account.baseUrl || '') === (item.baseUrl || '') &&
          (account.kind || 'api-key') === (item.kind || 'api-key') &&
          accountAuthSignature(account) === accountAuthSignature(item)
        )
      )
      setNestedValue(result, ['providerAccounts', index, field], currentAccount?.[field] || '')
    }
  })
  return result
}

function load() {
  ensureDir()
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = sanitizeObjectShape(JSON.parse(raw))
    const merged = deepMerge(DEFAULT_CONFIG, migrateOldProviderFormat(parsed))
    return decryptApiKeys(merged)
  } catch { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) }
}

function save(cfg) {
  return enqueueWrite(() => {
    ensureDir()
    const encrypted = encryptApiKeys(sanitizeObjectShape(cfg))
    const tmpFile = CONFIG_FILE + '.tmp'
    fs.writeFileSync(tmpFile, JSON.stringify(encrypted, null, 2), 'utf-8')
    fs.renameSync(tmpFile, CONFIG_FILE)
  })
}

module.exports = {
  load,
  save,
  redactApiKeys,
  mergeRedactedApiKeys,
  REDACTED_API_KEY,
  SECRET_FIELDS,
  DEFAULT_CONFIG,
  PROVIDER_ID_ALIASES,
  _test: { deepMerge, sanitizeObjectShape, migrateOldProviderFormat }
}
