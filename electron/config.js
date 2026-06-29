const { app, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')

const CONFIG_DIR = path.join(app.getPath('userData'), 'Gravuresse')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const REDACTED_API_KEY = '********'

const DEFAULT_CONFIG = {
  providers: {
    chat: { id: 'anthropic', apiKey: '', sessionToken: '', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
    image: { id: 'openai', apiKey: '', sessionToken: '', baseUrl: 'https://api.openai.com', model: 'gpt-image-2' },
    video: { id: 'volcengine', apiKey: '', sessionToken: '', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedance-2-0-pro-250528' }
  },
  providerProfiles: {
    chat: [],
    image: [],
    video: []
  },
  general: {
    theme: 'light', language: 'zh', fontSize: 'medium',
    autoSave: true, exportPath: '', apiTimeout: 60000, autoSaveImage: false, enableVideo: false
  },
  canvasLayout: 'grid'
}

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

// Deep merge preserves nested default values.
function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

// Provider secret field paths.
const SECRET_PATHS = [
  ['providers', 'chat', 'apiKey'],
  ['providers', 'chat', 'sessionToken'],
  ['providers', 'image', 'apiKey'],
  ['providers', 'image', 'sessionToken'],
  ['providers', 'video', 'apiKey'],
  ['providers', 'video', 'sessionToken']
]

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
      paths.push(['providerProfiles', track, index, 'apiKey'])
      paths.push(['providerProfiles', track, index, 'sessionToken'])
    })
  }
  return paths
}

function allSecretPaths(cfg) {
  return [...SECRET_PATHS, ...profileSecretPaths(cfg)]
}

function getNestedValue(obj, keys) {
  return keys.reduce((o, k) => o?.[k], obj)
}

function setNestedValue(obj, keys, value) {
  const path = keys.slice(0, -1)
  const last = keys[keys.length - 1]
  const target = path.reduce((o, k) => o[k], obj)
  target[last] = value
}

// Encrypt provider secrets before writing config to disk.
function encryptApiKeys(cfg) {
  if (!safeStorage.isEncryptionAvailable()) return cfg
  const result = JSON.parse(JSON.stringify(cfg)) // deep clone
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
  const result = JSON.parse(JSON.stringify(cfg))
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
  const result = JSON.parse(JSON.stringify(cfg))
  for (const keyPath of allSecretPaths(result)) {
    const val = getNestedValue(result, [...keyPath])
    if (val && typeof val === 'string') {
      setNestedValue(result, [...keyPath], REDACTED_API_KEY)
    }
  }
  return result
}

function mergeRedactedApiKeys(nextCfg, currentCfg) {
  const result = JSON.parse(JSON.stringify(nextCfg))
  for (const keyPath of SECRET_PATHS) {
    const nextVal = getNestedValue(result, [...keyPath])
    if (nextVal === REDACTED_API_KEY) {
      const track = keyPath[1]
      const nextProvider = result.providers?.[track] || {}
      const currentProvider = currentCfg.providers?.[track] || {}
      const sameEndpoint = sameProviderEndpoint(track, nextProvider, currentProvider)
      const profileMatch = (currentCfg.providerProfiles?.[track] || []).find(profile => sameProviderProfile(track, nextProvider, profile))
      const profileSecret = profileMatch?.[keyPath[keyPath.length - 1]] || ''
      setNestedValue(result, [...keyPath], sameEndpoint ? (getNestedValue(currentCfg, [...keyPath]) || '') : profileSecret)
    }
  }
  for (const track of TRACKS) {
    const nextProfiles = result.providerProfiles?.[track] || []
    const currentProfiles = currentCfg.providerProfiles?.[track] || []
    nextProfiles.forEach((profile, index) => {
      for (const field of ['apiKey', 'sessionToken']) {
        if (profile?.[field] !== REDACTED_API_KEY) continue
        const currentProfile = currentProfiles.find(item =>
          (profile.profileId && item.profileId === profile.profileId) ||
          (profile.id && item.id === profile.id) ||
          sameProviderProfile(track, profile, item)
        )
        const currentProvider = currentCfg.providers?.[track] || {}
        const providerSecret = sameProviderProfile(track, profile, currentProvider) ? currentProvider[field] || '' : ''
        profile[field] = currentProfile?.[field] || providerSecret
        setNestedValue(result, ['providerProfiles', track, index, field], profile[field])
      }
    })
  }
  return result
}

function load() {
  ensureDir()
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    const merged = deepMerge(DEFAULT_CONFIG, parsed)
    return decryptApiKeys(merged)
  } catch { return { ...DEFAULT_CONFIG } }
}

function save(cfg) {
  return enqueueWrite(() => {
    ensureDir()
    const encrypted = encryptApiKeys(cfg)
    const tmpFile = CONFIG_FILE + '.tmp'
    fs.writeFileSync(tmpFile, JSON.stringify(encrypted, null, 2), 'utf-8')
    fs.renameSync(tmpFile, CONFIG_FILE)
  })
}

module.exports = { load, save, redactApiKeys, mergeRedactedApiKeys, REDACTED_API_KEY, DEFAULT_CONFIG, PROVIDER_ID_ALIASES }
