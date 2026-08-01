const MAX_MESSAGES_PER_CONVERSATION = 2000
const MAX_ASSETS_PER_CONVERSATION = 1000
const MAX_CONVERSATIONS_PER_IMPORT = 100
const MAX_ASSETS_PER_IMPORT = 5000
const MAX_TASKS_PER_MESSAGE = 20
const MAX_CANVAS_ITEMS = 5000
const MAX_DRAWING_POINTS = 2000
const MAX_CANVAS_COORD = 1_000_000
const { isBlockedHost, sanitizeAssetUrl } = require('./asset-url-rules')

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cleanText(value, max = 1000) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function cleanOptionalId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).slice(0, 200)
  return text || null
}

function cleanIdList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return list.map(cleanOptionalId).filter(Boolean).slice(0, 100)
}

function cleanDuration(value) {
  return typeof value === 'number' || typeof value === 'string' ? value : null
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(-MAX_CANVAS_COORD, Math.min(MAX_CANVAS_COORD, number))
}

function cleanPositiveNumber(value, fallback = 0) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return fallback
  return Math.min(MAX_CANVAS_COORD, number)
}

function cleanZoom(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  return Math.max(0.1, Math.min(5, number))
}

function cleanColor(value, fallback = '#E8A849') {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback
}

function hasConversationShape(value) {
  return Boolean(
    isPlainObject(value) &&
    (
      Array.isArray(value.messages) ||
      Array.isArray(value.assets) ||
      typeof value.title === 'string' ||
      typeof value.id === 'string' ||
      typeof value.id === 'number'
    )
  )
}

function cleanMediaSummary(value = {}) {
  if (!isPlainObject(value)) return undefined
  const out = {}
  for (const key of ['inlined', 'skipped']) {
    if (Number.isFinite(Number(value[key]))) out[key] = Number(value[key])
  }
  if (value.fallback === true) out.fallback = true
  return Object.keys(out).length ? out : undefined
}

function sanitizeGeneration(generation = {}, assetType = 'image') {
  if (!isPlainObject(generation)) generation = {}
  return {
    providerId: cleanText(generation.providerId, 200),
    model: cleanText(generation.model, 500),
    mode: cleanText(generation.mode || assetType, 100),
    createdFrom: cleanText(generation.createdFrom, 100),
    prompt: cleanText(generation.prompt, 50000),
    negativePrompt: cleanText(generation.negativePrompt, 50000),
    ratio: cleanText(generation.ratio, 50),
    resolution: cleanText(generation.resolution, 50),
    duration: cleanDuration(generation.duration),
    parentAssetId: cleanOptionalId(generation.parentAssetId),
    sourceAssetIds: cleanIdList(generation.sourceAssetIds),
    promptReferenceAssetIds: cleanIdList(generation.promptReferenceAssetIds),
    taskId: cleanOptionalId(generation.taskId)
  }
}

function sanitizeAssetForStorage(asset = {}) {
  if (!isPlainObject(asset)) return null
  const type = asset.type === 'video' ? 'video' : 'image'
  const id = cleanOptionalId(asset.id)
  const nestedGeneration = isPlainObject(asset.generation) ? asset.generation : {}
  const generation = sanitizeGeneration({
    providerId: asset.providerId || asset.provider || '',
    model: asset.model || '',
    mode: type,
    createdFrom: asset.createdFrom || '',
    prompt: asset.prompt || '',
    negativePrompt: asset.negativePrompt || '',
    ratio: asset.ratio || '',
    resolution: asset.resolution || '',
    duration: cleanDuration(asset.duration),
    parentAssetId: asset.parentAssetId || null,
    sourceAssetIds: asset.sourceAssetIds || [],
    promptReferenceAssetIds: asset.promptReferenceAssetIds || [],
    taskId: asset.taskId || null,
    ...nestedGeneration,
    mode: nestedGeneration.mode || type
  }, type)
  return {
    ...(id ? { id } : {}),
    type,
    label: cleanText(asset.label, 120),
    prompt: cleanText(asset.prompt, 50000),
    negativePrompt: cleanText(asset.negativePrompt, 50000),
    url: sanitizeAssetUrl(asset.url, type),
    originalUrl: sanitizeAssetUrl(asset.originalUrl, type),
    model: cleanText(asset.model, 500),
    ratio: cleanText(asset.ratio, 50),
    resolution: cleanText(asset.resolution, 50),
    style: cleanText(asset.style, 500),
    createdAt: cleanText(asset.createdAt, 100),
    duration: cleanDuration(asset.duration),
    isMaterial: asset.isMaterial === true,
    _generating: asset._generating === true,
    ...(Number.isFinite(Number(asset.x)) ? { x: Number(asset.x) } : {}),
    ...(Number.isFinite(Number(asset.y)) ? { y: Number(asset.y) } : {}),
    generation
  }
}

function sanitizeTask(task = {}) {
  if (!isPlainObject(task)) return null
  const type = task.type === 'video' ? 'video' : 'image'
  const status = ['pending', 'done', 'error', 'partial', 'queued', 'running', 'generating', 'unknown'].includes(task.status)
    ? task.status
    : 'pending'
  return {
    id: cleanOptionalId(task.id) || 't1',
    type,
    status,
    label: cleanText(task.label, 120),
    prompt: cleanText(task.prompt, 50000),
    review_text: cleanText(task.review_text, 50000),
    negative_prompt: cleanText(task.negative_prompt, 50000),
    ratio: cleanText(task.ratio, 50),
    resolution: cleanText(task.resolution, 50),
    source_image_id: cleanOptionalId(task.source_image_id),
    sourceImageUrl: sanitizeAssetUrl(task.sourceImageUrl, 'image'),
    intent: cleanText(task.intent, 100),
    createdFrom: cleanText(task.createdFrom, 100),
    styleDirection: cleanText(task.styleDirection, 500),
    sourceAssetIds: cleanIdList(task.sourceAssetIds),
    promptReferenceAssetIds: cleanIdList(task.promptReferenceAssetIds),
    parentAssetId: cleanOptionalId(task.parentAssetId),
    taskId: cleanOptionalId(task.taskId),
    assetId: cleanOptionalId(task.assetId),
    queueId: cleanOptionalId(task.queueId),
    duration: cleanDuration(task.duration),
    elapsed: Number.isFinite(Number(task.elapsed)) ? Number(task.elapsed) : undefined,
    startTime: Number.isFinite(Number(task.startTime)) ? Number(task.startTime) : undefined,
    batchTotal: Number.isFinite(Number(task.batchTotal)) ? Number(task.batchTotal) : undefined,
    batchDone: Number.isFinite(Number(task.batchDone)) ? Number(task.batchDone) : undefined,
    error: cleanText(task.error, 2000) || undefined,
    providerId: cleanOptionalId(task.providerId),
    connectionId: cleanOptionalId(task.connectionId),
    model: cleanText(task.model, 500),
    submittedAt: cleanText(task.submittedAt, 100),
    lastPolledAt: cleanText(task.lastPolledAt, 100),
    recoveredAt: cleanText(task.recoveredAt, 100),
    recoveryStatus: ['resumable', 'unknown', 'not-resumable'].includes(task.recoveryStatus) ? task.recoveryStatus : undefined
  }
}

function canvasAssetItemId(entityId) {
  return `canvas_asset_${entityId}`
}

function defaultCanvasPosition(assets, entityId) {
  const index = Math.max(0, assets.findIndex(asset => asset.id === entityId))
  const col = index % 4
  const row = Math.floor(index / 4)
  return { x: 30 + col * 280, y: 30 + row * 280 }
}

function sanitizeCanvasPoint(point = {}) {
  if (!isPlainObject(point)) return null
  return { x: cleanNumber(point.x), y: cleanNumber(point.y) }
}

function sanitizeCanvasStyle(style = {}) {
  if (!isPlainObject(style)) return {}
  const strokeWidth = Number(style.strokeWidth)
  const fontSize = Number(style.fontSize)
  return {
    ...(typeof style.strokeColor === 'string' ? { strokeColor: cleanColor(style.strokeColor) } : {}),
    ...(typeof style.fillColor === 'string' ? { fillColor: cleanColor(style.fillColor) } : {}),
    ...(Number.isFinite(strokeWidth) && strokeWidth > 0 ? { strokeWidth: Math.min(32, Math.max(1, strokeWidth)) } : {}),
    ...(Number.isFinite(fontSize) && fontSize > 0 ? { fontSize: Math.min(256, Math.max(8, fontSize)) } : {})
  }
}

function sanitizeCanvasItem(item = {}, assets = [], assetIds = new Set()) {
  if (!isPlainObject(item)) return null
  if (item.kind === 'asset') {
    const entityId = cleanOptionalId(item.entityId)
    if (!entityId || !assetIds.has(entityId)) return null
    const asset = assets.find(record => record.id === entityId) || {}
    const fallback = defaultCanvasPosition(assets, entityId)
    return {
      id: cleanOptionalId(item.id) || canvasAssetItemId(entityId),
      kind: 'asset',
      entityId,
      x: cleanNumber(item.x, Number.isFinite(Number(asset.x)) ? Number(asset.x) : fallback.x),
      y: cleanNumber(item.y, Number.isFinite(Number(asset.y)) ? Number(asset.y) : fallback.y),
      ...(Number.isFinite(Number(item.width)) ? { width: cleanPositiveNumber(item.width) } : {}),
      ...(Number.isFinite(Number(item.height)) ? { height: cleanPositiveNumber(item.height) } : {}),
      ...(Number.isFinite(Number(item.zIndex)) ? { zIndex: cleanNumber(item.zIndex) } : {})
    }
  }
  if (item.kind === 'drawing') {
    const tool = ['pencil', 'rect', 'circle', 'line', 'text'].includes(item.tool) ? item.tool : null
    if (!tool) return null
    const points = (Array.isArray(item.points) ? item.points : [])
      .slice(0, MAX_DRAWING_POINTS)
      .map(sanitizeCanvasPoint)
      .filter(Boolean)
    const text = cleanText(item.text, 50000)
    if (tool === 'pencil' && points.length < 2) return null
    if (tool === 'text' && !text.trim()) return null
    return {
      id: cleanOptionalId(item.id) || `drawing_${Date.now()}`,
      kind: 'drawing',
      tool,
      x: cleanNumber(item.x),
      y: cleanNumber(item.y),
      ...(Number.isFinite(Number(item.width)) ? { width: cleanNumber(item.width) } : {}),
      ...(Number.isFinite(Number(item.height)) ? { height: cleanNumber(item.height) } : {}),
      ...(points.length ? { points } : {}),
      ...(text ? { text } : {}),
      style: sanitizeCanvasStyle(item.style),
      ...(Number.isFinite(Number(item.zIndex)) ? { zIndex: cleanNumber(item.zIndex) } : {})
    }
  }
  return null
}

function sanitizeCanvasDocument(document = {}, conversationId = '', assets = []) {
  const record = isPlainObject(document) ? document : {}
  const assetIds = new Set(assets.map(asset => asset.id).filter(Boolean))
  const items = []
  const seenItemIds = new Set()
  const seenAssetIds = new Set()
  for (const item of (Array.isArray(record.items) ? record.items : []).slice(0, MAX_CANVAS_ITEMS)) {
    const normalized = sanitizeCanvasItem(item, assets, assetIds)
    if (!normalized || seenItemIds.has(normalized.id)) continue
    if (normalized.kind === 'asset' && seenAssetIds.has(normalized.entityId)) continue
    items.push(normalized)
    seenItemIds.add(normalized.id)
    if (normalized.kind === 'asset') seenAssetIds.add(normalized.entityId)
  }
  for (const asset of assets) {
    if (!asset.id || seenAssetIds.has(asset.id) || items.length >= MAX_CANVAS_ITEMS) continue
    const fallback = defaultCanvasPosition(assets, asset.id)
    items.push({
      id: canvasAssetItemId(asset.id),
      kind: 'asset',
      entityId: asset.id,
      x: Number.isFinite(Number(asset.x)) ? Number(asset.x) : fallback.x,
      y: Number.isFinite(Number(asset.y)) ? Number(asset.y) : fallback.y
    })
  }
  const viewport = isPlainObject(record.viewport) ? record.viewport : {}
  const overlays = isPlainObject(record.overlays) ? record.overlays : {}
  const toolState = isPlainObject(record.toolState) ? record.toolState : {}
  return {
    schemaVersion: 1,
    id: cleanOptionalId(record.id) || `canvas_${conversationId || Date.now()}`,
    conversationId: conversationId || cleanOptionalId(record.conversationId) || '',
    viewMode: record.viewMode === 'free' ? 'free' : 'grid',
    viewport: {
      x: cleanNumber(viewport.x),
      y: cleanNumber(viewport.y),
      zoom: cleanZoom(viewport.zoom)
    },
    overlays: { lineage: overlays.lineage === true },
    toolState: {
      activeTool: ['select', 'move', 'pencil', 'rect', 'circle', 'line', 'text'].includes(toolState.activeTool) ? toolState.activeTool : 'select',
      drawColor: cleanColor(toolState.drawColor),
      drawWidth: Number.isFinite(Number(toolState.drawWidth)) && Number(toolState.drawWidth) > 0 ? Math.min(32, Math.max(1, Number(toolState.drawWidth))) : 2
    },
    items,
    updatedAt: cleanText(record.updatedAt, 100) || new Date().toISOString()
  }
}

function sanitizeMessage(message = {}) {
  if (!isPlainObject(message)) return null
  const id = cleanOptionalId(message.id)
  const tasks = (Array.isArray(message.tasks) ? message.tasks : message.task ? [message.task] : [])
    .slice(0, MAX_TASKS_PER_MESSAGE)
    .map(sanitizeTask)
    .filter(Boolean)
  return {
    ...(id ? { id } : {}),
    role: message.role === 'user' ? 'user' : 'assistant',
    content: cleanText(message.content, 50000),
    thinking: cleanText(message.thinking, 50000) || undefined,
    model: cleanText(message.model, 500) || undefined,
    error: message.error === true,
    ...(tasks.length ? { tasks } : {})
  }
}

function sanitizeConversationForStorage(conversation = {}) {
  if (!isPlainObject(conversation)) return null
  const id = cleanOptionalId(conversation.id)
  const createdAt = cleanText(conversation.createdAt, 100)
  const updatedAt = cleanText(conversation.updatedAt, 100)
  const messages = (Array.isArray(conversation.messages) ? conversation.messages : [])
    .slice(0, MAX_MESSAGES_PER_CONVERSATION)
    .map(sanitizeMessage)
    .filter(Boolean)
  const assets = (Array.isArray(conversation.assets) ? conversation.assets : [])
    .slice(0, MAX_ASSETS_PER_CONVERSATION)
    .map(sanitizeAssetForStorage)
    .filter(Boolean)
  const canvasDocument = sanitizeCanvasDocument(conversation.canvasDocument, id || cleanOptionalId(conversation.id) || '', assets)
  return {
    ...(id ? { id } : {}),
    title: cleanText(conversation.title, 80),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    messages,
    assets,
    canvasDocument
  }
}

function assertConversationImportBounds(conversations) {
  if (conversations.length > MAX_CONVERSATIONS_PER_IMPORT) {
    throw new Error(`Conversation import has too many conversations (maximum ${MAX_CONVERSATIONS_PER_IMPORT})`)
  }

  let totalAssets = 0
  for (const conversation of conversations) {
    if (!isPlainObject(conversation) || !Array.isArray(conversation.assets)) continue
    if (conversation.assets.length > MAX_ASSETS_PER_CONVERSATION) {
      throw new Error(`Conversation import has too many assets in one conversation (maximum ${MAX_ASSETS_PER_CONVERSATION})`)
    }
    totalAssets += conversation.assets.length
    if (totalAssets > MAX_ASSETS_PER_IMPORT) {
      throw new Error(`Conversation import has too many assets (maximum ${MAX_ASSETS_PER_IMPORT})`)
    }
  }
}

function sanitizeConversationImportPayload(payload) {
  if (Array.isArray(payload)) {
    assertConversationImportBounds(payload)
    return payload.map(sanitizeConversationForStorage).filter(Boolean)
  }
  if (!isPlainObject(payload)) return payload
  if (Array.isArray(payload.conversations)) {
    assertConversationImportBounds(payload.conversations)
    const media = cleanMediaSummary(payload.media)
    return {
      schemaVersion: Number.isFinite(Number(payload.schemaVersion)) ? Number(payload.schemaVersion) : 1,
      app: cleanText(payload.app, 80),
      kind: cleanText(payload.kind, 40),
      ...(media ? { media } : {}),
      conversations: payload.conversations.map(sanitizeConversationForStorage).filter(Boolean)
    }
  }
  if (isPlainObject(payload.conversation)) {
    assertConversationImportBounds([payload.conversation])
    const media = cleanMediaSummary(payload.media)
    return {
      schemaVersion: Number.isFinite(Number(payload.schemaVersion)) ? Number(payload.schemaVersion) : 1,
      app: cleanText(payload.app, 80),
      ...(media ? { media } : {}),
      conversation: sanitizeConversationForStorage(payload.conversation)
    }
  }
  if (!hasConversationShape(payload)) return payload
  assertConversationImportBounds([payload])
  return sanitizeConversationForStorage(payload)
}

function sanitizeStorePayload(data = {}) {
  const conversations = (Array.isArray(data.conversations) ? data.conversations : [])
    .map(sanitizeConversationForStorage)
    .filter(Boolean)
  return {
    schemaVersion: Number.isFinite(Number(data.schemaVersion)) ? Number(data.schemaVersion) : 1,
    conversations,
    deletedIds: (Array.isArray(data.deletedIds) ? data.deletedIds : []).map(String).filter(Boolean),
    activeId: data.activeId ? String(data.activeId) : null
  }
}

module.exports = {
  sanitizeAssetUrl,
  sanitizeConversationForStorage,
  sanitizeConversationImportPayload,
  sanitizeStorePayload,
  _test: {
    MAX_ASSETS_PER_CONVERSATION,
    MAX_ASSETS_PER_IMPORT,
    MAX_CONVERSATIONS_PER_IMPORT,
    assertConversationImportBounds,
    isBlockedHost,
    sanitizeAssetForStorage,
    sanitizeCanvasDocument,
    sanitizeConversationForStorage,
    sanitizeMessage
  }
}
