// @ts-check

// Shared asset-shape factory. Ensures useCanvas.addAsset and App's conversation
// bridge (createStoredAsset) construct assets with the same fields, so assets
// round-trip faithfully between the canvas and stored conversations.

import { sanitizeAssetUrl } from './mediaSecurity.js'

/** @typedef {import('../types/domain').Asset} Asset */
/** @typedef {import('../types/domain').AssetType} AssetType */
/** @typedef {import('../types/domain').Generation} Generation */
/** @typedef {Record<string, unknown>} UnknownRecord */

let _counter = 0

/** @returns {string} */
function makeAssetId() {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${(++_counter) % 1000}`
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function toIdList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return list
    .filter(item => typeof item === 'string' || typeof item === 'number')
    .map(item => String(item))
    .filter(Boolean)
}

/**
 * @param {unknown} value
 * @returns {value is UnknownRecord}
 */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function toOptionalId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const id = String(value)
  return id ? id : null
}

/**
 * @param {unknown} type
 * @returns {AssetType}
 */
function normalizeAssetType(type) {
  return type === 'video' ? 'video' : 'image'
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toGenerationMode(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value)
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toText(value) {
  return typeof value === 'string' ? value : ''
}

/**
 * @param {unknown} value
 * @returns {number | string | null}
 */
function toDuration(value) {
  return typeof value === 'number' || typeof value === 'string' ? value : null
}

/**
 * @param {unknown} [generation={}]
 * @returns {Generation}
 */
export function createGeneration(generation = {}) {
  const input = isRecord(generation) ? generation : {}
  /** @type {Generation} */
  const normalized = {
    providerId: toText(input.providerId),
    model: toText(input.model),
    mode: toGenerationMode(input.mode),
    createdFrom: toText(input.createdFrom),
    prompt: toText(input.prompt),
    negativePrompt: toText(input.negativePrompt),
    ratio: toText(input.ratio),
    resolution: toText(input.resolution),
    parentAssetId: toOptionalId(input.parentAssetId),
    sourceAssetIds: toIdList(input.sourceAssetIds),
    promptReferenceAssetIds: toIdList(input.promptReferenceAssetIds),
    duration: toDuration(input.duration),
    taskId: toOptionalId(input.taskId)
  }
  return normalized
}

/**
 * @param {unknown} [asset={}]
 * @returns {Asset}
 */
export function createAsset(asset = {}) {
  const input = isRecord(asset) ? asset : {}
  const nestedGeneration = isRecord(input.generation) ? input.generation : {}
  const id = toOptionalId(input.id) || makeAssetId()
  const type = normalizeAssetType(input.type)
  const generationMode = toGenerationMode(nestedGeneration.mode) || type
  const createdAt = toText(input.createdAt) || new Date().toISOString()
  const generation = createGeneration({
    providerId: input.providerId || input.provider || '',
    createdFrom: input.createdFrom || '',
    prompt: input.prompt || '',
    negativePrompt: input.negativePrompt || '',
    model: input.model || '',
    ratio: input.ratio || '',
    resolution: input.resolution || '',
    duration: input.duration ?? null,
    parentAssetId: input.parentAssetId || null,
    sourceAssetIds: input.sourceAssetIds || [],
    promptReferenceAssetIds: input.promptReferenceAssetIds || [],
    taskId: input.taskId || null,
    ...nestedGeneration,
    mode: generationMode
  })

  /** @type {Asset} */
  const normalized = {
    ...input,
    id,
    type,
    label: toText(input.label) || '未命名',
    prompt: toText(input.prompt),
    negativePrompt: toText(input.negativePrompt),
    url: sanitizeAssetUrl(input.url, type),
    model: toText(input.model),
    ratio: toText(input.ratio) || '1:1',
    style: toText(input.style),
    createdAt,
    isMaterial: input.isMaterial === true,
    _generating: input._generating === true,
    generation
  }
  return normalized
}

/**
 * @param {unknown} [asset={}]
 * @param {unknown} [patch={}]
 * @returns {Asset}
 */
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
