const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const { sanitizeStorePayload } = require('./security/sanitize')

const CONFIG_DIR = path.join(app.getPath('userData'), 'Gravuresse')
const STORE_FILE = path.join(CONFIG_DIR, 'conversations.json')

const SCHEMA_VERSION = 1

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

function emptyStore() {
  return { schemaVersion: SCHEMA_VERSION, conversations: [], activeId: null, deletedIds: [] }
}

function backupCorruptStore() {
  if (!fs.existsSync(STORE_FILE)) return
  try {
    fs.copyFileSync(STORE_FILE, `${STORE_FILE}.corrupt-${Date.now()}`)
  } catch (e) {
    console.error('Failed to back up corrupt store:', e)
  }
}

// 简单写入队列，防止并发 read-modify-write 竞态
// 如果写入失败，catch 会吞掉错误以保持队列活
let writeQueue = Promise.resolve()

function enqueueWrite(fn) {
  const operation = writeQueue.catch(() => {}).then(fn)
  writeQueue = operation.catch(e => {
    console.error('Store write error:', e)
  })
  return operation
}

function loadAll() {
  ensureDir()
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'))
    const deletedIds = Array.isArray(raw.deletedIds) ? raw.deletedIds.map(String).filter(Boolean) : []
    const deleted = new Set(deletedIds)
    const sanitized = sanitizeStorePayload(raw)
    const conversations = (Array.isArray(sanitized.conversations) ? sanitized.conversations : [])
      .filter(c => c && typeof c === 'object' && (typeof c.id === 'string' || typeof c.id === 'number'))
      .map(c => ({ ...c, id: String(c.id) }))
      .filter(c => !deleted.has(c.id))
    const requestedActiveId = sanitized.activeId ? String(sanitized.activeId) : null
    const activeId = requestedActiveId && !deleted.has(requestedActiveId) && conversations.some(c => c.id === requestedActiveId)
      ? requestedActiveId
      : conversations[0]?.id || null
    return {
      schemaVersion: raw.schemaVersion || SCHEMA_VERSION,
      conversations,
      activeId,
      deletedIds
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('Store read failed; backing up corrupt store:', e)
      backupCorruptStore()
    }
    return emptyStore()
  }
}

function saveAll(data) {
  ensureDir()
  const payload = sanitizeStorePayload({ schemaVersion: SCHEMA_VERSION, ...data })
  // 原子写入：先写临时文件再 rename
  const tmpFile = STORE_FILE + '.tmp'
  fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf-8')
  fs.renameSync(tmpFile, STORE_FILE)
}

function saveConversation(convId, convData) {
  convId = convId ? String(convId) : ''
  if (!convId) return Promise.resolve()
  return enqueueWrite(() => {
    const data = loadAll()
    if ((data.deletedIds || []).includes(convId)) return
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
  convId = convId ? String(convId) : ''
  if (!convId) return Promise.resolve()
  return enqueueWrite(() => {
    const data = loadAll()
    data.conversations = data.conversations.filter(c => c.id !== convId)
    data.deletedIds = Array.from(new Set([...(data.deletedIds || []), convId]))
    if (data.activeId === convId) data.activeId = data.conversations[0]?.id || null
    saveAll(data)
  })
}

function setActiveId(convId) {
  convId = convId ? String(convId) : null
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
