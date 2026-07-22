const IMAGE_PATTERNS = [
  /\bgpt[-_]?image\b/i,
  /(^|[/:_-])image[-_]?2($|[/_.:-])/i,
  /\bnano[-_ ]?banana/i,
  /\bgemini\b.*\bimage\b/i,
  /\bimage\b.*\bgemini\b/i,
  /\bseedream\b/i,
  /\bflux\b/i,
  /\bqwen[-_ ]?image\b/i,
  /\bimagen\b/i,
  /\bideogram\b/i,
  /\bstable[-_ ]?(image|diffusion)\b/i,
  /\bsdxl\b/i,
  /\bdall[-_ ]?e\b/i,
  /\bmidjourney\b/i,
  /\bkolors\b/i,
  /\bwan\b.*\bt2i\b/i,
  /\bhunyuan\b.*\bimage\b/i
]

const CHAT_PATTERNS = [
  /\bgpt[-_ ]?\d/i,
  /\bclaude\b/i,
  /\bdeepseek\b/i,
  /\bqwen\b/i,
  /\bgemini\b(?!.*\bimage\b)/i,
  /\bllama\b/i,
  /\bmistral\b/i,
  /\bmoonshot\b/i,
  /\bkimi\b/i,
  /\bdoubao\b/i
]

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function arrayText(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap(arrayText)
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [key, ...arrayText(item)])
  }
  return [String(value)]
}

/**
 * @param {unknown} model
 * @returns {string}
 */
function modelId(model) {
  if (typeof model === 'string') return model
  if (!model || typeof model !== 'object' || Array.isArray(model)) return ''
  const record = /** @type {UnknownRecord} */ (model)
  const value = [record.id, record.name, record.model].find(item => typeof item === 'string')
  return String(value || '').replace(/^models\//, '')
}

/**
 * @param {unknown} model
 * @returns {string}
 */
function modelText(model) {
  if (typeof model === 'string') return model
  const record = model && typeof model === 'object' && !Array.isArray(model) ? /** @type {UnknownRecord} */ (model) : {}
  return [
    modelId(model),
    record.type,
    record.object,
    record.owned_by,
    record.category,
    record.description,
    ...arrayText(record.modalities),
    ...arrayText(record.capabilities)
  ].filter(Boolean).join(' ')
}

/**
 * @param {unknown} model
 * @param {string} text
 * @returns {boolean}
 */
function hasExplicitImageSignal(model, text) {
  const lower = text.toLowerCase()
  if (/\b(image|images|text-to-image|image-generation|vision-generation)\b/.test(lower)) return true
  const record = model && typeof model === 'object' && !Array.isArray(model) ? /** @type {UnknownRecord} */ (model) : {}
  const caps = record.capabilities
  if (caps && typeof caps === 'object') {
    const capabilityRecord = /** @type {UnknownRecord} */ (caps)
    return Boolean(capabilityRecord.image || capabilityRecord.images || capabilityRecord.textToImage || capabilityRecord.image_generation || capabilityRecord['text-to-image'])
  }
  return false
}

/** @param {string} text */
function hasExplicitNonGenerationSignal(text) {
  return /\b(embedding|embeddings|rerank|reranker|moderation|audio|speech|tts|stt)\b/i.test(text)
}

/**
 * @param {unknown} model
 * @returns {{ capability: ModelCapability, routeHint: string, reason: string }}
 */
function classifyModel(model = {}) {
  const text = modelText(model)
  const imageMatch = IMAGE_PATTERNS.find(pattern => pattern.test(text))
  if (hasExplicitImageSignal(model, text) || imageMatch) {
    return {
      capability: 'image',
      routeHint: /\bnano[-_ ]?banana|\bgemini\b/i.test(text) ? 'openai-compatible-image' : 'openai-image',
      reason: imageMatch ? `name:${imageMatch.source}` : 'metadata:image'
    }
  }
  if (hasExplicitNonGenerationSignal(text)) return { capability: 'other', routeHint: '', reason: 'metadata:non-generation' }
  if (CHAT_PATTERNS.some(pattern => pattern.test(text))) return { capability: 'chat', routeHint: 'openai-chat', reason: 'name:chat' }
  return { capability: 'unknown', routeHint: '', reason: '' }
}

/**
 * @param {unknown} model
 * @param {unknown} options
 * @returns {ModelRecord | null}
 */
export function normalizeModelRecord(model = {}, options = {}) {
  const id = modelId(model)
  if (!id) return null
  const classified = classifyModel(model)
  const optionRecord = options && typeof options === 'object' && !Array.isArray(options) ? /** @type {UnknownRecord} */ (options) : {}
  return {
    id,
    capability: classified.capability,
    routeHint: classified.routeHint,
    source: typeof optionRecord.source === 'string' && optionRecord.source ? optionRecord.source : 'remote',
    reason: classified.reason
  }
}

/**
 * @param {ModelRecord} model
 * @param {string} track
 * @returns {number}
 */
function modelRank(model, track = '') {
  if (track === 'image') {
    if (model.capability === 'image') return 0
    if (model.source === 'catalog') return 1
    if (model.capability === 'unknown') return 2
    return 3
  }
  if (track === 'chat') {
    if (model.capability === 'chat') return 0
    if (model.source === 'catalog') return 1
    if (model.capability === 'unknown') return 2
    return 3
  }
  return model.capability === track ? 0 : model.capability === 'unknown' ? 1 : 2
}

export function sortModelRecords(track = '') {
  /**
   * @param {ModelRecord} a
   * @param {ModelRecord} b
   */
  return (a, b) => {
    const rank = modelRank(a, track) - modelRank(b, track)
    if (rank) return rank
    return String(a.id || '').localeCompare(String(b.id || ''))
  }
}
// @ts-check

/** @typedef {import('../types/domain').ModelCapability} ModelCapability */
/** @typedef {import('../types/domain').ModelRecord} ModelRecord */
/** @typedef {Record<string, unknown>} UnknownRecord */
