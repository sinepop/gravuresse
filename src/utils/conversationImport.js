import { createAsset } from './assetFactory.js'

let _messageCounter = 0

function makeMessageId() {
  return `import_msg_${Date.now()}_${(++_messageCounter) % 1000}`
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function toOptionalId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const id = String(value)
  return id ? id : null
}

function toIdList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return list
    .filter(item => typeof item === 'string' || typeof item === 'number')
    .map(item => String(item))
    .filter(Boolean)
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export function getConversationTitle(messages = []) {
  const list = Array.isArray(messages) ? messages : []
  const message = list.find(m => m?.role === 'user' && typeof m.content === 'string' && m.content.trim())
  return message ? message.content.slice(0, 30) : ''
}

function isImportableConversation(source) {
  return Boolean(
    source &&
    typeof source === 'object' &&
    (
      Array.isArray(source.messages) ||
      Array.isArray(source.assets) ||
      typeof source.title === 'string'
    )
  )
}

function normalizeImportedAssets(assets = []) {
  const seenIds = new Set()
  return (Array.isArray(assets) ? assets : []).filter(asset => {
    return isRecord(asset)
  }).map(asset => {
    const requestedId = typeof asset.id === 'string' || typeof asset.id === 'number' ? String(asset.id) : ''
    const shouldKeepId = requestedId && !seenIds.has(requestedId)
    const normalized = createAsset({
      id: shouldKeepId ? requestedId : '',
      type: asset.type,
      label: asset.label,
      prompt: asset.prompt,
      negativePrompt: asset.negativePrompt,
      url: asset.url,
      originalUrl: asset.originalUrl,
      model: asset.model,
      ratio: asset.ratio,
      resolution: asset.resolution,
      style: asset.style,
      createdAt: asset.createdAt,
      duration: asset.duration,
      providerId: asset.providerId,
      provider: asset.provider,
      createdFrom: asset.createdFrom,
      parentAssetId: asset.parentAssetId,
      sourceAssetIds: asset.sourceAssetIds,
      promptReferenceAssetIds: asset.promptReferenceAssetIds,
      taskId: asset.taskId,
      isMaterial: asset.isMaterial,
      _generating: asset._generating,
      x: asset.x,
      y: asset.y,
      generation: asset.generation
    })
    seenIds.add(normalized.id)
    return normalized
  })
}

function normalizeImportedTask(task = {}) {
  if (!isRecord(task)) return null
  const activeStatus = ['generating', 'queued', 'running'].includes(task.status)
  const error = typeof task.error === 'string' ? task.error : ''
  const status = activeStatus
    ? 'error'
    : ['pending', 'done', 'error', 'partial'].includes(task.status)
      ? task.status
      : 'pending'
  return {
    id: toOptionalId(task.id) || 't1',
    type: task.type === 'video' ? 'video' : 'image',
    status,
    label: typeof task.label === 'string' && task.label ? task.label : 'Imported task',
    prompt: typeof task.prompt === 'string' ? task.prompt : '',
    review_text: typeof task.review_text === 'string' ? task.review_text : '',
    negative_prompt: typeof task.negative_prompt === 'string' ? task.negative_prompt : '',
    ratio: typeof task.ratio === 'string' && task.ratio ? task.ratio : '1:1',
    resolution: typeof task.resolution === 'string' ? task.resolution : '',
    source_image_id: toOptionalId(task.source_image_id),
    sourceImageUrl: typeof task.sourceImageUrl === 'string' ? task.sourceImageUrl : '',
    intent: typeof task.intent === 'string' ? task.intent : '',
    createdFrom: typeof task.createdFrom === 'string' ? task.createdFrom : '',
    styleDirection: typeof task.styleDirection === 'string' ? task.styleDirection : '',
    sourceAssetIds: toIdList(task.sourceAssetIds),
    promptReferenceAssetIds: toIdList(task.promptReferenceAssetIds),
    parentAssetId: toOptionalId(task.parentAssetId),
    taskId: toOptionalId(task.taskId),
    assetId: toOptionalId(task.assetId),
    queueId: toOptionalId(task.queueId),
    duration: task.duration ?? null,
    elapsed: toNumber(task.elapsed),
    startTime: toNumber(task.startTime),
    batchTotal: toNumber(task.batchTotal),
    batchDone: toNumber(task.batchDone),
    error: activeStatus ? error || 'Imported task is no longer running in this workspace.' : error || undefined
  }
}

function normalizeImportedMessages(messages = []) {
  const seenIds = new Set()
  return (Array.isArray(messages) ? messages : []).filter(isRecord).map(message => {
    const requestedId = toOptionalId(message.id)
    const id = requestedId && !seenIds.has(requestedId) ? requestedId : makeMessageId()
    seenIds.add(id)
    const tasks = (Array.isArray(message.tasks) ? message.tasks : message.task ? [message.task] : [])
      .map(normalizeImportedTask)
      .filter(Boolean)
    const normalized = {
      id,
      role: message.role === 'user' ? 'user' : 'assistant',
      content: typeof message.content === 'string' ? message.content : '',
      thinking: typeof message.thinking === 'string' ? message.thinking : undefined,
      model: typeof message.model === 'string' ? message.model : undefined,
      error: message.error === true
    }
    delete normalized.task
    if (tasks.length > 0) normalized.tasks = tasks
    else delete normalized.tasks
    return normalized
  })
}

export function normalizeImportedConversations(payload) {
  const sources = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.conversations)
      ? payload.conversations
      : [payload?.conversation || payload].filter(Boolean)

  return sources.filter(isImportableConversation).map(source => normalizeConversationRecord(source))
}

export function normalizeConversationRecord(source = {}) {
  if (!isRecord(source)) return null
  const messages = normalizeImportedMessages(source.messages)
  const assets = normalizeImportedAssets(source.assets)
  const title = typeof source.title === 'string' ? source.title.slice(0, 80) : getConversationTitle(messages)
  return {
    ...(toOptionalId(source.id) ? { id: toOptionalId(source.id) } : {}),
    title,
    ...(typeof source.createdAt === 'string' ? { createdAt: source.createdAt } : {}),
    ...(typeof source.updatedAt === 'string' ? { updatedAt: source.updatedAt } : {}),
    active: source.active === true,
    messages,
    assets
  }
}

export function formatErrorAlert(label, error) {
  return error?.message ? `${label}\n${error.message}` : label
}
