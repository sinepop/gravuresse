const { app, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')

const CONFIG_DIR = path.join(app.getPath('userData'), 'Gravuresse')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const REDACTED_API_KEY = '********'
const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const hasOwn = Object.hasOwn || ((obj, key) => Object.prototype.hasOwnProperty.call(obj, key))

const DEFAULT_CONFIG = {
  providers: [
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

// Provider secret field paths (static, for the default config snapshot).
const SECRET_PATHS = []
for (let i = 0; i < DEFAULT_CONFIG.providers.length; i++) {
  for (const field of SECRET_FIELDS) {
    SECRET_PATHS.push(['providers', i, field])
  }
}

// Dynamic provider secret paths based on actual config providers (array or legacy object).
function providerSecretPaths(cfg) {
  const paths = []
  const providers = cfg?.providers
  if (Array.isArray(providers)) {
    providers.forEach((_, index) => {
      for (const field of SECRET_FIELDS) {
        paths.push(['providers', index, field])
      }
    })
  } else if (isPlainObject(providers)) {
    // Legacy track-based format: { chat: {...}, image: {...}, video: {...} }
    for (const track of TRACKS) {
      const provider = providers[track]
      if (isPlainObject(provider)) {
        for (const field of SECRET_FIELDS) {
          paths.push(['providers', track, field])
        }
      }
    }
  }
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
  return [...SECRET_PATHS, ...providerSecretPaths(cfg), ...profileSecretPaths(cfg), ...accountSecretPaths(cfg)]
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
  if (isPlainObject(config.providers) && !Array.isArray(config.providers)) {
    const old = config.providers
    const merged = []
    for (const track of TRACKS) {
      const entries = Array.isArray(old[track]) ? old[track] : []
      for (const entry of entries) {
        if (entry && typeof entry === 'object') merged.push(entry)
      }
    }
    config.providers = merged.length > 0 ? merged : [...DEFAULT_CONFIG.providers]
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
  // Providers: restore redacted keys; handle both array (new) and object/track (legacy) formats
  if (Array.isArray(result.providers)) {
    const nextProviders = result.providers
    const currentProviders = Array.isArray(currentCfg.providers) ? currentCfg.providers : []
    nextProviders.forEach((provider, index) => {
      for (const field of SECRET_FIELDS) {
        if (provider?.[field] !== REDACTED_API_KEY) continue
        const match = currentProviders.find(
          p => (p.name || '') === (provider.name || '') && (p.baseUrl || '') === (provider.baseUrl || '')
        )
        result.providers[index][field] = match?.[field] || ''
      }
    })
  } else if (isPlainObject(result.providers)) {
    // Legacy track-based format: { chat: {...}, image: {...}, video: {...} }
    const currentProvidersObj = isPlainObject(currentCfg.providers) ? currentCfg.providers : {}
    for (const track of TRACKS) {
      const nextProvider = result.providers[track]
      if (!isPlainObject(nextProvider)) continue
      const currentProvider = currentProvidersObj[track]
      for (const field of SECRET_FIELDS) {
        if (nextProvider[field] !== REDACTED_API_KEY) continue
        result.providers[track][field] = currentProvider?.[field] || ''
      }
    }
  }
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
  } catch { return { ...DEFAULT_CONFIG } }
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
  _test: { deepMerge, sanitizeObjectShape }
}
