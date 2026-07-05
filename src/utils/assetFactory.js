// Shared asset-shape factory. Ensures useCanvas.addAsset and App's conversation
// bridge (createStoredAsset) construct assets with the same fields, so assets
// round-trip faithfully between the canvas and stored conversations.

import { sanitizeAssetUrl } from './mediaSecurity.js'

let _counter = 0
function makeAssetId() {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${(++_counter) % 1000}`
}

function toIdList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return list
    .filter(item => typeof item === 'string' || typeof item === 'number')
    .map(item => String(item))
    .filter(Boolean)
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function toOptionalId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const id = String(value)
  return id ? id : null
}

function normalizeAssetType(type) {
  return type === 'video' ? 'video' : 'image'
}

function toGenerationMode(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value)
}

export function createGeneration(generation = {}) {
  generation = isRecord(generation) ? generation : {}
  return {
    providerId: generation.providerId || '',
    model: generation.model || '',
    mode: toGenerationMode(generation.mode),
    createdFrom: generation.createdFrom || '',
    prompt: generation.prompt || '',
    negativePrompt: generation.negativePrompt || '',
    ratio: generation.ratio || '',
    resolution: generation.resolution || '',
    parentAssetId: toOptionalId(generation.parentAssetId),
    sourceAssetIds: toIdList(generation.sourceAssetIds),
    promptReferenceAssetIds: toIdList(generation.promptReferenceAssetIds),
    duration: generation.duration ?? null,
    taskId: toOptionalId(generation.taskId)
  }
}

export function createAsset(asset = {}) {
  asset = isRecord(asset) ? asset : {}
  const nestedGeneration = isRecord(asset.generation) ? asset.generation : {}
  const id = toOptionalId(asset.id) || makeAssetId()
  const type = normalizeAssetType(asset.type)
  const generationMode = toGenerationMode(nestedGeneration.mode) || type
  const createdAt = asset.createdAt || new Date().toISOString()
  const generation = createGeneration({
    providerId: asset.providerId || asset.provider || '',
    mode: type,
    createdFrom: asset.createdFrom || '',
    prompt: asset.prompt || '',
    negativePrompt: asset.negativePrompt || '',
    model: asset.model || '',
    ratio: asset.ratio || '',
    resolution: asset.resolution || '',
    duration: asset.duration ?? null,
    parentAssetId: asset.parentAssetId || null,
    sourceAssetIds: asset.sourceAssetIds || [],
    promptReferenceAssetIds: asset.promptReferenceAssetIds || [],
    taskId: asset.taskId || null,
    ...nestedGeneration,
    mode: generationMode
  })

  return {
    type: 'image',
    label: asset.label || '未命名',
    prompt: asset.prompt || '',
    negativePrompt: asset.negativePrompt || '',
    url: sanitizeAssetUrl(asset.url, type),
    model: asset.model || '',
    ratio: asset.ratio || '1:1',
    style: asset.style || '',
    createdAt,
    _generating: false,
    ...asset,
    id,
    type,
    label: asset.label || '未命名',
    prompt: asset.prompt || '',
    negativePrompt: asset.negativePrompt || '',
    url: sanitizeAssetUrl(asset.url, type),
    model: asset.model || '',
    ratio: asset.ratio || '1:1',
    style: asset.style || '',
    createdAt,
    isMaterial: asset.isMaterial === true,
    generation
  }
}

export function mergeAsset(asset = {}, patch = {}) {
  const base = isRecord(asset) ? asset : {}
  const update = isRecord(patch) ? patch : {}
  const baseGeneration = isRecord(base.generation) ? base.generation : {}
  const patchGeneration = isRecord(update.generation) ? update.generation : null
  return createAsset({
    ...base,
    ...update,
    generation: patchGeneration ? { ...baseGeneration, ...patchGeneration } : baseGeneration
  })
}
