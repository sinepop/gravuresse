const { app, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')

const CONFIG_DIR = path.join(app.getPath('userData'), 'Gravuresse')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG = {
  providers: {
    chat: { id: 'claude', apiKey: '', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
    image: { id: 'dalle', apiKey: '', baseUrl: 'https://api.openai.com', model: 'gpt-image-2' },
    video: { id: 'jimeng_vid', apiKey: '', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedance-2-0-pro-250528' }
  },
  general: {
    theme: 'dark', language: 'zh', fontSize: 'medium',
    autoSave: true, exportPath: '', apiTimeout: 60000, autoSaveImage: false
  },
  canvasLayout: 'grid'
}

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

// 深层合并：保留嵌套对象的默认值
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

// API key 字段路径
const API_KEY_PATHS = [
  ['providers', 'chat', 'apiKey'],
  ['providers', 'image', 'apiKey'],
  ['providers', 'video', 'apiKey']
]

function getNestedValue(obj, keys) {
  return keys.reduce((o, k) => o?.[k], obj)
}

function setNestedValue(obj, keys, value) {
  const path = keys.slice(0, -1)
  const last = keys[keys.length - 1]
  const target = path.reduce((o, k) => o[k], obj)
  target[last] = value
}

// 加密 API keys
function encryptApiKeys(cfg) {
  if (!safeStorage.isEncryptionAvailable()) return cfg
  const result = JSON.parse(JSON.stringify(cfg)) // deep clone
  for (const keyPath of API_KEY_PATHS) {
    const val = getNestedValue(result, [...keyPath])
    if (val && typeof val === 'string' && val.length > 0) {
      setNestedValue(result, [...keyPath], '__ENCRYPTED__' + safeStorage.encryptString(val).toString('base64'))
    }
  }
  return result
}

// 解密 API keys
function decryptApiKeys(cfg) {
  if (!safeStorage.isEncryptionAvailable()) return cfg
  const result = JSON.parse(JSON.stringify(cfg))
  for (const keyPath of API_KEY_PATHS) {
    const val = getNestedValue(result, [...keyPath])
    if (val && typeof val === 'string' && val.startsWith('__ENCRYPTED__')) {
      const b64 = val.slice('__ENCRYPTED__'.length)
      try {
        setNestedValue(result, [...keyPath], safeStorage.decryptString(Buffer.from(b64, 'base64')))
      } catch {
        // 解密失败（OS key 变更、profile 迁移等），清空避免发送垃圾 key
        setNestedValue(result, [...keyPath], '')
      }
    }
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
  ensureDir()
  const encrypted = encryptApiKeys(cfg)
  // 原子写入：先写临时文件再 rename，防止崩溃导致数据损坏
  const tmpFile = CONFIG_FILE + '.tmp'
  fs.writeFileSync(tmpFile, JSON.stringify(encrypted, null, 2), 'utf-8')
  fs.renameSync(tmpFile, CONFIG_FILE)
}

module.exports = { load, save, DEFAULT_CONFIG }
