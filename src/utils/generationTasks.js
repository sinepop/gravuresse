import { createGeneration } from './assetFactory.js'

export function parseDurationSeconds(value, fallback = 5) {
  const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*s?$/i)
  const parsed = match ? Number(match[1]) : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
}

export function idList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return list
    .filter(item => typeof item === 'string' || typeof item === 'number')
    .map(item => String(item))
    .filter(Boolean)
}

export function uniqueIds(ids = []) {
  return Array.from(new Set(idList(ids)))
}

export function getTaskSourceIds(task = {}) {
  return uniqueIds([...idList(task.sourceAssetIds), task.source_image_id])
}

export function getTaskPromptReferenceIds(task = {}) {
  return uniqueIds(task.promptReferenceAssetIds || [])
}

export function buildGenerationMeta({ task, provider, mode, createdFrom, parentAssetId, taskId }) {
  return createGeneration({
    providerId: provider?.id || '',
    model: provider?.model || '',
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
