const { app } = require('electron')
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

function load() {
  ensureDir()
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch { return { ...DEFAULT_CONFIG } }
}

function save(cfg) {
  ensureDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
}

module.exports = { load, save, DEFAULT_CONFIG }
