const { registerHandler } = require('../handler')
const { request, joinApiUrl } = require('../../api/http')

// ==================== Image (ark_image) ====================

const BASE_SIZES = {
  '1:1': [1024, 1024], '4:3': [1536, 1152], '3:4': [1152, 1536],
  '16:9': [1536, 864], '9:16': [864, 1536], '3:2': [1536, 1024]
}

function getSize(ratio, resolution) {
  const base = BASE_SIZES[ratio || '1:1'] || BASE_SIZES['1:1']
  const res = parseInt(resolution) || 1024
  if (res <= 1024) return `${base[0]}x${base[1]}`
  const scale = res / 1024
  const w = Math.round(base[0] * scale / 64) * 64
  const h = Math.round(base[1] * scale / 64) * 64
  return `${Math.min(w, 4096)}x${Math.min(h, 4096)}`
}

function normalizeDuration(duration) {
  const value = Number(duration)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

async function handleGenerate(params) {
  const { model, baseUrl, auth, prompt, ratio, resolution, negative_prompt } = params
  const size = getSize(ratio, resolution)
  const body = {
    model: model || 'doubao-seedream-4-0',
    prompt,
    n: 1,
    size
  }
  if (negative_prompt) body.negative_prompt = negative_prompt
  const url = joinApiUrl(baseUrl, '/images/generations')
  const res = await request(url, {
    method: 'POST',
    headers: { ...auth.headers, 'Content-Type': 'application/json' },
    ...(params.requestOptions || {})
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  const item = json.data?.[0]
  if (!item) throw new Error('No image returned from Ark')
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
  if (item.url) return item.url
  throw new Error('Unknown Ark image response format')
}

// ==================== Video (ark_video_task) ====================

async function handleSubmit(params) {
  const { model, baseUrl, auth, prompt, sourceImageUrl, duration } = params
  const body = {
    model: model || 'doubao-seedance-2-0-pro',
    content: [{ type: 'text', text: prompt }]
  }
  const durationSeconds = normalizeDuration(duration)
  if (durationSeconds) body.duration = durationSeconds
  if (sourceImageUrl) body.content.push({ type: 'image_url', image_url: { url: sourceImageUrl } })
  const url = joinApiUrl(baseUrl, '/contents/generations/tasks')
  const res = await request(url, {
    method: 'POST',
    headers: { ...auth.headers, 'Content-Type': 'application/json' },
    ...(params.requestOptions || {})
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  return { taskId: json.id || json.task_id, status: 'pending' }
}

async function handlePoll(taskId, params) {
  const { baseUrl, auth } = params
  const url = joinApiUrl(baseUrl, `/contents/generations/tasks/${taskId}`)
  const res = await request(url, {
    method: 'GET',
    headers: { ...auth.headers },
    ...(params.requestOptions || {})
  })
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  return {
    status: normalizeVideoStatus(json.status),
    progress: normalizeProgress(json.progress),
    videoUrl: json.content?.[0]?.video_url || json.output?.video_url || '',
    error: json.error?.message
  }
}

function normalizeProgress(progress) {
  const value = Number(progress) || 0
  return value > 0 && value <= 1 ? Math.round(value * 100) : value
}

function normalizeVideoStatus(status) {
  const value = String(status || 'unknown').toLowerCase()
  if (['succeeded', 'success', 'completed', 'complete'].includes(value)) return 'succeeded'
  if (['failed', 'failure', 'error', 'cancelled', 'canceled', 'expired'].includes(value)) return 'failed'
  if (['pending', 'queued', 'running', 'processing', 'in_progress', 'throttled'].includes(value)) return value
  return value
}

// ==================== Main dispatcher ====================

/**
 * Handler for ark_image (generate) and ark_video_task (submit + poll).
 * Compatible provider: volcengine
 */
async function arkHandler(params) {
  switch (params.action) {
    case 'generate':
      return handleGenerate(params)
    case 'submit':
      return handleSubmit(params)
    case 'poll':
      return handlePoll(params.taskId || params.task_id, params)
    default:
      throw new Error(`Unsupported action: ${params.action}`)
  }
}

registerHandler('ark_image', arkHandler)
registerHandler('ark_video_task', arkHandler)
module.exports = arkHandler
