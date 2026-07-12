// @ts-check

import { createGeneration } from './assetFactory.js'

/** @typedef {import('../types/domain').Generation} Generation */
/** @typedef {Record<string, unknown>} UnknownRecord */

/**
 * @param {unknown} value
 * @param {number} [fallback=5]
 * @returns {number}
 */
export function parseDurationSeconds(value, fallback = 5) {
  const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*s?$/i)
  const parsed = match ? Number(match[1]) : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function idList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return list
    .filter(item => typeof item === 'string' || typeof item === 'number')
    .map(item => String(item))
    .filter(Boolean)
}

/**
 * @param {unknown} [ids=[]]
 * @returns {string[]}
 */
export function uniqueIds(ids = []) {
  return Array.from(new Set(idList(ids)))
}

/**
 * @param {unknown} [task={}]
 * @returns {string[]}
 */
export function getTaskSourceIds(task = {}) {
  const input = isRecord(task) ? task : {}
  return uniqueIds([...idList(input.sourceAssetIds), input.source_image_id])
}

/**
 * @param {unknown} [task={}]
 * @returns {string[]}
 */
export function getTaskPromptReferenceIds(task = {}) {
  const input = isRecord(task) ? task : {}
  return uniqueIds(input.promptReferenceAssetIds || [])
}

/**
 * @param {unknown} value
 * @returns {value is UnknownRecord}
 */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/**
 * @param {unknown} input
 * @returns {Generation}
 */
export function buildGenerationMeta(input) {
  const params = isRecord(input) ? input : {}
  const task = isRecord(params.task) ? params.task : {}
  const provider = isRecord(params.provider) ? params.provider : {}
  const { mode, createdFrom, parentAssetId, taskId } = params
  return createGeneration({
    providerId: provider.id || '',
    model: provider.model || '',
    mode,
    createdFrom: createdFrom || task.createdFrom || 'chat',
    prompt: task.prompt || '',
    negativePrompt: task.negative_prompt || task.negativePrompt || '',
    ratio: task.ratio || '',
    resolution: task.resolution || '',
    duration: task.duration ?? null,
    parentAssetId: parentAssetId || task.parentAssetId || task.source_image_id || null,
    sourceAssetIds: getTaskSourceIds(task),
    promptReferenceAssetIds: getTaskPromptReferenceIds(task),
    taskId: taskId || task.taskId || null
  })
}
