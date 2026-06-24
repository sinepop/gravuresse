const { registerHandler } = require('../handler')
const { request, joinApiUrl } = require('../../api/http')

const WAN_IMAGE_SIZES = {
  '1:1': '1280*1280',
  '4:3': '1472*1104',
  '3:4': '1104*1472',
  '16:9': '1696*960',
  '9:16': '960*1696',
  '3:2': '1536*1024',
  '2:3': '1024*1536'
}

const QIANFAN_IMAGE_SIZES = {
  '1:1': '1024x1024',
  '4:3': '1024x768',
  '3:4': '768x1024',
  '16:9': '1024x576',
  '9:16': '576x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536'
}

function readPath(obj, path) {
  if (!path) return undefined
  const segments = String(path).replace(/^\$\.?/, '').split('.').filter(Boolean)
  let value = obj
  for (const segment of segments) {
    if (value == null) return undefined
    value = value[segment]
  }
  return value
}

function normalizeStatus(status) {
  const value = String(status || 'pending').toLowerCase()
  if (['succeeded', 'success', 'completed', 'complete', 'done'].includes(value)) return 'succeeded'
  if (['failed', 'failure', 'error', 'cancelled', 'canceled', 'unknown'].includes(value)) return 'failed'
  if (value === 'created') return 'pending'
  if (value === 'queueing') return 'queued'
  if (['pending', 'queued', 'running', 'processing', 'in_progress'].includes(value)) return value
  return value
}

function normalizeProgress(progress) {
  const value = Number(progress) || 0
  return value > 0 && value <= 1 ? Math.round(value * 100) : value
}

function normalizeDuration(duration, fallback) {
  const value = Number(duration)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}

function promptWithNegative(prompt, negativePrompt, label = 'Negative prompt') {
  return negativePrompt ? `${prompt}\n\n${label}: ${negativePrompt}` : prompt
}

function httpsResourceUrl(url) {
  const value = String(url || '')
  if (value.startsWith('http://')) return `https://${value.slice('http://'.length)}`
  return value
}

async function requestJson(url, method, headers, requestOptions, body) {
  const res = await request(url, {
    method,
    headers,
    ...(requestOptions || {})
  }, body)
  let json
  try {
    json = JSON.parse(res.data || '{}')
  } catch {
    throw new Error('Provider returned invalid JSON')
  }
  const message = json.error?.message || json.message || json.output?.message || json.output?.error_message
  if (json.error || json.code || json.output?.task_status === 'FAILED' || json.status === 'failed') {
    throw new Error(message || 'Provider error')
  }
  return json
}

function extractImageUrl(json) {
  const candidates = [
    'output.choices.0.message.content.0.image',
    'output.results.0.url',
    'output.results.0.image',
    'data.0.url',
    'images.0.url',
    'image',
    'url'
  ]
  for (const path of candidates) {
    const value = readPath(json, path)
    if (value) return httpsResourceUrl(value)
  }
  throw new Error('No image returned')
}

function getWanImageSize(ratio) {
  return WAN_IMAGE_SIZES[ratio || '1:1'] || WAN_IMAGE_SIZES['1:1']
}

function getQianfanImageSize(ratio) {
  return QIANFAN_IMAGE_SIZES[ratio || '1:1'] || QIANFAN_IMAGE_SIZES['1:1']
}

async function wanImageHandler(params) {
  if (params.action !== 'generate') throw new Error(`Unsupported action: ${params.action}`)
  const negativePrompt = params.negativePrompt || params.negative_prompt || ''
  const body = {
    model: params.model || 'wan2.6-t2i',
    input: {
      messages: [{
        role: 'user',
        content: [{ text: params.prompt }]
      }]
    },
    parameters: {
      prompt_extend: true,
      watermark: false,
      n: 1,
      size: getWanImageSize(params.ratio)
    }
  }
  if (negativePrompt) body.parameters.negative_prompt = negativePrompt
  const url = joinApiUrl(params.baseUrl, '/services/aigc/multimodal-generation/generation')
  const json = await requestJson(url, 'POST', {
    ...params.auth.headers,
    'Content-Type': 'application/json'
  }, params.requestOptions, body)
  return extractImageUrl(json)
}

async function wanVideoSubmit(params) {
  const negativePrompt = params.negativePrompt || params.negative_prompt || ''
  const input = { prompt: params.prompt }
  if (negativePrompt) input.negative_prompt = negativePrompt
  const body = {
    model: params.model || 'wan2.7-t2v',
    input,
    parameters: {
      resolution: String(params.resolution || '720P').toUpperCase(),
      ratio: params.ratio || '16:9'
    }
  }
  const duration = normalizeDuration(params.duration)
  if (duration) body.parameters.duration = duration
  if (params.sourceImageUrl) body.input.img_url = params.sourceImageUrl
  const url = joinApiUrl(params.baseUrl, '/services/aigc/video-generation/video-synthesis')
  const json = await requestJson(url, 'POST', {
    ...params.auth.headers,
    'Content-Type': 'application/json',
    'X-DashScope-Async': 'enable'
  }, params.requestOptions, body)
  const taskId = json.output?.task_id || json.task_id
  if (!taskId) throw new Error('Alibaba Wan response did not include task_id')
  return { taskId: String(taskId), status: normalizeStatus(json.output?.task_status || 'pending') }
}

async function wanVideoPoll(params) {
  const taskId = params.taskId || params.task_id
  if (!taskId) throw new Error('Missing video task id')
  const url = joinApiUrl(params.baseUrl, `/tasks/${encodeURIComponent(taskId)}`)
  const json = await requestJson(url, 'GET', params.auth.headers, params.requestOptions)
  const output = json.output || {}
  return {
    status: normalizeStatus(output.task_status),
    progress: normalizeProgress(output.progress),
    videoUrl: httpsResourceUrl(output.video_url || output.results?.[0]?.url || ''),
    error: output.message || json.message || ''
  }
}

async function wanVideoHandler(params) {
  if (params.action === 'submit') return wanVideoSubmit(params)
  if (params.action === 'poll') return wanVideoPoll(params)
  throw new Error(`Unsupported action: ${params.action}`)
}

async function qianfanImageHandler(params) {
  if (params.action !== 'generate') throw new Error(`Unsupported action: ${params.action}`)
  const negativePrompt = params.negativePrompt || params.negative_prompt || ''
  const body = {
    model: params.model || 'qwen-image',
    prompt: params.prompt,
    n: 1,
    size: getQianfanImageSize(params.ratio)
  }
  if (negativePrompt) body.negative_prompt = negativePrompt
  const url = joinApiUrl(params.baseUrl, '/v2/images/generations')
  const json = await requestJson(url, 'POST', {
    ...params.auth.headers,
    'Content-Type': 'application/json'
  }, params.requestOptions, body)
  return extractImageUrl(json)
}

async function qianfanVideoSubmit(params) {
  const negativePrompt = params.negativePrompt || params.negative_prompt || ''
  const body = {
    type: 'text2video',
    model: params.model || 'qianfan-video-latest',
    model_parameters: {
      prompt: promptWithNegative(params.prompt, negativePrompt, 'Avoid'),
      duration: normalizeDuration(params.duration, 5),
      aspect_ratio: params.ratio || '16:9',
      resolution: params.resolution || '720p',
      audio: false
    }
  }
  const url = joinApiUrl(params.baseUrl, '/beta/video/generations/qianfan-video')
  const json = await requestJson(url, 'POST', {
    ...params.auth.headers,
    'Content-Type': 'application/json'
  }, params.requestOptions, body)
  const taskId = json.task_id || json.id
  if (!taskId) throw new Error('Baidu Qianfan response did not include task_id')
  return { taskId: String(taskId), status: normalizeStatus(json.status || 'pending') }
}

async function qianfanVideoPoll(params) {
  const taskId = params.taskId || params.task_id
  if (!taskId) throw new Error('Missing video task id')
  const url = joinApiUrl(params.baseUrl, '/video/generations')
  url.searchParams.set('task_id', String(taskId))
  const json = await requestJson(url, 'GET', params.auth.headers, params.requestOptions)
  return {
    status: normalizeStatus(json.status),
    progress: normalizeProgress(json.progress),
    videoUrl: httpsResourceUrl(json.content?.video_url || json.video_url || ''),
    error: json.task_error_code || json.message || ''
  }
}

async function qianfanVideoHandler(params) {
  if (params.action === 'submit') return qianfanVideoSubmit(params)
  if (params.action === 'poll') return qianfanVideoPoll(params)
  throw new Error(`Unsupported action: ${params.action}`)
}

async function tencentTokenhubVideoSubmit(params) {
  const negativePrompt = params.negativePrompt || params.negative_prompt || ''
  const body = {
    model: params.model || 'hy-video-1.5',
    prompt: promptWithNegative(params.prompt, negativePrompt, 'Avoid')
  }
  const duration = normalizeDuration(params.duration)
  if (duration) body.duration = duration
  if (params.ratio) body.ratio = params.ratio
  if (params.resolution) body.resolution = params.resolution
  if (params.sourceImageUrl) body.image = { url: params.sourceImageUrl }
  const url = joinApiUrl(params.baseUrl, '/video/submit')
  const json = await requestJson(url, 'POST', {
    ...params.auth.headers,
    'Content-Type': 'application/json'
  }, params.requestOptions, body)
  const taskId = json.id || json.task_id
  if (!taskId) throw new Error('Tencent TokenHub response did not include id')
  return { taskId: String(taskId), status: normalizeStatus(json.status || 'pending') }
}

async function tencentTokenhubVideoPoll(params) {
  const taskId = params.taskId || params.task_id
  if (!taskId) throw new Error('Missing video task id')
  const body = {
    model: params.model || 'hy-video-1.5',
    id: String(taskId)
  }
  const url = joinApiUrl(params.baseUrl, '/video/query')
  const json = await requestJson(url, 'POST', {
    ...params.auth.headers,
    'Content-Type': 'application/json'
  }, params.requestOptions, body)
  return {
    status: normalizeStatus(json.status),
    progress: normalizeProgress(json.progress),
    videoUrl: httpsResourceUrl(json.data?.url || json.url || ''),
    error: json.error?.message || json.message || ''
  }
}

async function tencentTokenhubVideoHandler(params) {
  if (params.action === 'submit') return tencentTokenhubVideoSubmit(params)
  if (params.action === 'poll') return tencentTokenhubVideoPoll(params)
  throw new Error(`Unsupported action: ${params.action}`)
}

registerHandler('wan_image_task', wanImageHandler)
registerHandler('wan_video_task', wanVideoHandler)
registerHandler('baidu_qianfan_image', qianfanImageHandler)
registerHandler('baidu_qianfan_video_task', qianfanVideoHandler)
registerHandler('tencent_tokenhub_video_task', tencentTokenhubVideoHandler)

module.exports = {
  wanImageHandler,
  wanVideoHandler,
  qianfanImageHandler,
  qianfanVideoHandler,
  tencentTokenhubVideoHandler
}
