const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const CONFIG_DIR = path.join(app.getPath('userData'), 'Gravuresse')
const STORE_FILE = path.join(CONFIG_DIR, 'conversations.json')

const SCHEMA_VERSION = 1

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

// 简单写入队列，防止并发 read-modify-write 竞态
let writeQueue = Promise.resolve()

function enqueueWrite(fn) {
  writeQueue = writeQueue.then(fn).catch(e => {
    console.error('Store write error:', e)
    return fn().catch(retryErr => {
      console.error('Store write retry also failed:', retryErr)
    })
  })
  return writeQueue
}

function loadAll() {
  ensureDir()
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'))
    return {
      schemaVersion: raw.schemaVersion || SCHEMA_VERSION,
      conversations: raw.conversations || [],
      activeId: raw.activeId || null
    }
  } catch {
    return { schemaVersion: SCHEMA_VERSION, conversations: [], activeId: null }
  }
}

function saveAll(data) {
  ensureDir()
  const payload = { schemaVersion: SCHEMA_VERSION, ...data }
  // 原子写入：先写临时文件再 rename
  const tmpFile = STORE_FILE + '.tmp'
  fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf-8')
  fs.renameSync(tmpFile, STORE_FILE)
}

function saveConversation(convId, convData) {
  return enqueueWrite(() => {
    const data = loadAll()
    const idx = data.conversations.findIndex(c => c.id === convId)
    if (idx >= 0) {
      data.conversations[idx] = { ...data.conversations[idx], ...convData, updatedAt: new Date().toISOString() }
    } else {
      data.conversations.unshift({ id: convId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...convData })
    }
    saveAll(data)
  })
}

function deleteConversation(convId) {
  return enqueueWrite(() => {
    const data = loadAll()
    data.conversations = data.conversations.filter(c => c.id !== convId)
    if (data.activeId === convId) data.activeId = data.conversations[0]?.id || null
    saveAll(data)
  })
}

function setActiveId(convId) {
  return enqueueWrite(() => {
    const data = loadAll()
    data.activeId = convId
    saveAll(data)
  })
}

function saveAllQueued(data) {
  return enqueueWrite(() => saveAll(data))
}

module.exports = { loadAll, saveAll, saveAllQueued, saveConversation, deleteConversation, setActiveId }
