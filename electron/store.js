const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const CONFIG_DIR = path.join(app.getPath('userData'), 'Gravuresse')
const STORE_FILE = path.join(CONFIG_DIR, 'conversations.json')

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

function loadAll() {
  ensureDir()
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'))
    return { conversations: raw.conversations || [], activeId: raw.activeId || null }
  } catch {
    return { conversations: [], activeId: null }
  }
}

function saveAll(data) {
  ensureDir()
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

function saveConversation(convId, convData) {
  const data = loadAll()
  const idx = data.conversations.findIndex(c => c.id === convId)
  if (idx >= 0) {
    data.conversations[idx] = { ...data.conversations[idx], ...convData, updatedAt: new Date().toISOString() }
  } else {
    data.conversations.unshift({ id: convId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...convData })
  }
  saveAll(data)
}

function deleteConversation(convId) {
  const data = loadAll()
  data.conversations = data.conversations.filter(c => c.id !== convId)
  if (data.activeId === convId) data.activeId = data.conversations[0]?.id || null
  saveAll(data)
}

function setActiveId(convId) {
  const data = loadAll()
  data.activeId = convId
  saveAll(data)
}

module.exports = { loadAll, saveAll, saveConversation, deleteConversation, setActiveId }
