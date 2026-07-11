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
  /\bdoubao\b/i,
  /\bgrok(?:[-_ ]|\d)/i,
  /(^|[/:_-])o[1-9](?:[-_.:]|$)/i
]

const VIDEO_PATTERNS = [
  /\b(text[-_ ]?to[-_ ]?video|image[-_ ]?to[-_ ]?video|video[-_ ]?generation)\b/i,
  /\b(sora|veo|seedance|runway|kling|hailuo|minimax[-_ ]?video|wan[-_ ]?video|vidu)\b/i,
  /\b(hunyuan|doubao)\b.*\bvideo\b/i
]

function arrayText(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap(arrayText)
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => item ? [key, ...arrayText(item)] : [])
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

function generationMetadataText(model) {
  if (!model || typeof model !== 'object') return ''
  return [
    model.type,
    model.category,
    model.description,
    ...arrayText(model.capabilities)
  ].filter(Boolean).join(' ')
}

function hasExplicitImageSignal(model) {
  const lower = generationMetadataText(model).toLowerCase()
  if (/\b(text-to-image|image-generation|image-output|vision-generation)\b/.test(lower)) return true
  const caps = model && typeof model === 'object' ? model.capabilities : null
  if (caps && typeof caps === 'object') {
    if (caps.textToImage === true || caps.image_generation === true || caps['image-generation'] === true || caps['text-to-image'] === true) return true
  }
  const outputs = model?.output_modalities || model?.outputModalities || model?.modalities?.output
  if (arrayText(outputs).some(value => /^images?$/i.test(value))) return true
  return false
}

function hasExplicitVideoSignal(model) {
  const lower = generationMetadataText(model).toLowerCase()
  if (/\b(text-to-video|image-to-video|video-generation|video-output)\b/.test(lower)) return true
  const caps = model && typeof model === 'object' ? model.capabilities : null
  if (caps && typeof caps === 'object') {
    if (caps.textToVideo === true || caps.imageToVideo === true || caps.video_generation === true || caps['video-generation'] === true || caps['text-to-video'] === true || caps['image-to-video'] === true) return true
  }
  const outputs = model?.output_modalities || model?.outputModalities || model?.modalities?.output
  if (arrayText(outputs).some(value => /^videos?$/i.test(value))) return true
  return false
}

function hasExplicitNonGenerationSignal(text) {
  return /\b(embedding|embeddings|rerank|reranker|moderation|audio|speech|tts|stt)\b/i.test(text)
}

function classifyModel(model = {}) {
  const id = modelId(model)
  const text = modelText(model)
  const imageMatch = IMAGE_PATTERNS.find(pattern => pattern.test(id))
  const videoMatch = VIDEO_PATTERNS.find(pattern => pattern.test(id))
  if (hasExplicitVideoSignal(model)) {
    return {
      capability: 'video',
      routeHint: 'video-generation',
      reason: videoMatch ? `metadata:video;name:${videoMatch.source}` : 'metadata:video'
    }
  }
  if (hasExplicitImageSignal(model)) {
    return {
      capability: 'image',
      routeHint: /\bnano[-_ ]?banana|\bgemini\b/i.test(id) ? 'openai-compatible-image' : 'openai-image',
      reason: imageMatch ? `metadata:image;name:${imageMatch.source}` : 'metadata:image'
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
  if (classified.capability === 'unknown' && options.track === 'chat') {
    classified.capability = 'chat'
    classified.routeHint = 'openai-chat'
    classified.reason = 'track:chat'
  }
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
