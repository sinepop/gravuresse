const MAX_MESSAGES_PER_CONVERSATION = 2000
const MAX_ASSETS_PER_CONVERSATION = 1000
const MAX_TASKS_PER_MESSAGE = 20
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
    duration: generation.duration ?? null,
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
    duration: asset.duration ?? null,
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
    duration: asset.duration ?? null,
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
  const status = ['pending', 'done', 'error', 'partial', 'queued', 'running', 'generating'].includes(task.status)
    ? task.status
    : 'pending'
  return {
    id: cleanOptionalId(task.id) || 't1',
    type,
    status,
    label: cleanText(task.label, 120),
    prompt: cleanText(task.prompt, 50000),
    negative_prompt: cleanText(task.negative_prompt, 50000),
    ratio: cleanText(task.ratio, 50),
    source_image_id: cleanOptionalId(task.source_image_id),
    sourceAssetIds: cleanIdList(task.sourceAssetIds),
    promptReferenceAssetIds: cleanIdList(task.promptReferenceAssetIds),
    parentAssetId: cleanOptionalId(task.parentAssetId),
    taskId: cleanOptionalId(task.taskId),
    assetId: cleanOptionalId(task.assetId),
    queueId: cleanOptionalId(task.queueId),
    duration: task.duration ?? null,
    elapsed: Number.isFinite(Number(task.elapsed)) ? Number(task.elapsed) : undefined,
    startTime: Number.isFinite(Number(task.startTime)) ? Number(task.startTime) : undefined,
    batchTotal: Number.isFinite(Number(task.batchTotal)) ? Number(task.batchTotal) : undefined,
    batchDone: Number.isFinite(Number(task.batchDone)) ? Number(task.batchDone) : undefined,
    error: cleanText(task.error, 2000) || undefined
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
  const messages = (Array.isArray(conversation.messages) ? conversation.messages : [])
    .slice(0, MAX_MESSAGES_PER_CONVERSATION)
    .map(sanitizeMessage)
    .filter(Boolean)
  const assets = (Array.isArray(conversation.assets) ? conversation.assets : [])
    .slice(0, MAX_ASSETS_PER_CONVERSATION)
    .map(sanitizeAssetForStorage)
    .filter(Boolean)
  return {
    ...conversation,
    title: cleanText(conversation.title, 80),
    messages,
    assets
  }
}

function sanitizeConversationImportPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map(sanitizeConversationForStorage).filter(Boolean)
  }
  if (!isPlainObject(payload)) return payload
  if (Array.isArray(payload.conversations)) {
    return {
      ...payload,
      conversations: payload.conversations.map(sanitizeConversationForStorage).filter(Boolean)
    }
  }
  if (isPlainObject(payload.conversation)) {
    return {
      ...payload,
      conversation: sanitizeConversationForStorage(payload.conversation)
    }
  }
  return sanitizeConversationForStorage(payload) || payload
}

function sanitizeStorePayload(data = {}) {
  const conversations = (Array.isArray(data.conversations) ? data.conversations : [])
    .map(sanitizeConversationForStorage)
    .filter(Boolean)
  return {
    ...data,
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
    isBlockedHost,
    sanitizeAssetForStorage,
    sanitizeMessage
  }
}
