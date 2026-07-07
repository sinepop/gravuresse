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

function arrayText(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap(arrayText)
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [
      key,
      ...arrayText(item)
    ])
  }
  return [String(value)]
}

function modelId(model) {
  if (typeof model === 'string') return model
  return String(model?.id || model?.name || model?.model || '').replace(/^models\//, '')
}

function modelText(model) {
  if (typeof model === 'string') return model
  return [
    modelId(model),
    model?.type,
    model?.object,
    model?.owned_by,
    model?.category,
    model?.description,
    ...arrayText(model?.modalities),
    ...arrayText(model?.capabilities)
  ].filter(Boolean).join(' ')
}

function hasExplicitImageSignal(model, text) {
  const lower = text.toLowerCase()
  if (/\b(image|images|text-to-image|image-generation|vision-generation)\b/.test(lower)) return true
  const caps = model && typeof model === 'object' ? model.capabilities : null
  if (caps && typeof caps === 'object') {
    return Boolean(caps.image || caps.images || caps.textToImage || caps.image_generation || caps['text-to-image'])
  }
  return false
}

function hasExplicitNonGenerationSignal(text) {
  return /\b(embedding|embeddings|rerank|reranker|moderation|audio|speech|tts|stt)\b/i.test(text)
}

function classifyModel(model = {}) {
  const id = modelId(model)
  const text = modelText(model)
  const imageMatch = IMAGE_PATTERNS.find(pattern => pattern.test(text))
  if (hasExplicitImageSignal(model, text) || imageMatch) {
    return {
      capability: 'image',
      routeHint: /\bnano[-_ ]?banana|\bgemini\b/i.test(text) ? 'openai-compatible-image' : 'openai-image',
      reason: imageMatch ? `name:${imageMatch.source}` : 'metadata:image'
    }
  }
  if (hasExplicitNonGenerationSignal(text)) {
    return { capability: 'other', routeHint: '', reason: 'metadata:non-generation' }
  }
  if (CHAT_PATTERNS.some(pattern => pattern.test(text))) {
    return { capability: 'chat', routeHint: 'openai-chat', reason: 'name:chat' }
  }
  return { capability: 'unknown', routeHint: '', reason: '' }
}

function normalizeModelRecord(model = {}, options = {}) {
  const id = modelId(model)
  if (!id) return null
  const classified = classifyModel(model)
  return {
    id,
    capability: classified.capability,
    routeHint: classified.routeHint,
    source: options.source || 'remote',
    reason: classified.reason
  }
}

function modelRank(model = {}, track = '') {
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

function sortModelRecords(track = '') {
  return (a, b) => {
    const rank = modelRank(a, track) - modelRank(b, track)
    if (rank) return rank
    return String(a.id || '').localeCompare(String(b.id || ''))
  }
}

module.exports = {
  classifyModel,
  modelId,
  normalizeModelRecord,
  sortModelRecords
}
