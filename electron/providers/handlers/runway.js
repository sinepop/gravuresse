const { registerHandler } = require('../handler')
const { request, joinApiUrl } = require('../../api/http')

function normalizeProgress(progress) {
  const value = Number(progress) || 0
  return value > 0 && value <= 1 ? Math.round(value * 100) : value
}

function normalizeStatus(status) {
  const s = String(status || 'unknown').toLowerCase()
  if (['succeeded', 'success', 'completed', 'complete'].includes(s)) return 'succeeded'
  if (['failed', 'failure', 'error', 'cancelled', 'canceled', 'expired'].includes(s)) return 'failed'
  if (['pending', 'queued', 'running', 'processing', 'in_progress', 'throttled'].includes(s)) return s
  return s
}

function normalizeDuration(duration) {
  const value = Number(duration)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

async function handleSubmit(params) {
  const { model, baseUrl, auth, prompt, sourceImageUrl, duration } = params
  const body = { model: model || 'gen4-turbo', promptText: prompt }
  const durationSeconds = normalizeDuration(duration)
  if (durationSeconds) body.duration = durationSeconds
  if (sourceImageUrl) body.promptImage = sourceImageUrl
  const url = joinApiUrl(baseUrl, '/v1/image_to_video')
  const res = await request(url, {
    method: 'POST',
    headers: {
      ...auth.headers,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06'
    },
    ...(params.requestOptions || {})
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  return { taskId: json.id, status: 'pending' }
}

async function handlePoll(taskId, params) {
  const { baseUrl, auth } = params
  const url = joinApiUrl(baseUrl, `/v1/tasks/${taskId}`)
  const res = await request(url, {
    method: 'GET',
    headers: { ...auth.headers, 'X-Runway-Version': '2024-11-06' },
    ...(params.requestOptions || {})
  })
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  return {
    status: normalizeStatus(json.status),
    progress: normalizeProgress(json.progress),
    videoUrl: json.output?.[0] || '',
    error: json.error?.message
  }
}

async function runwayHandler(params) {
  switch (params.action) {
    case 'submit':
      return handleSubmit(params)
    case 'poll':
      return handlePoll(params.taskId || params.task_id, params)
    default:
      throw new Error(`Unsupported action: ${params.action}`)
  }
}

registerHandler('runway_task', runwayHandler)
module.exports = runwayHandler
