const { registerHandler } = require('../handler')
const { request, joinApiUrl } = require('../../api/http')

const IMAGE_SIZES = {
  '1:1': [1024, 1024],
  '4:3': [1536, 1152],
  '3:4': [1152, 1536],
  '16:9': [1536, 864],
  '9:16': [864, 1536],
  '3:2': [1536, 1024]
}

const TEMPLATE_KEYS = new Set([
  'prompt',
  'model',
  'ratio',
  'resolution',
  'duration',
  'sourceImageUrl',
  'negativePrompt'
])

const TEMPLATE_FIELDS = [
  'path',
  'pathPrefix',
  'submitPath',
  'pollPath',
  'taskIdPath',
  'statusPath',
  'videoUrlPath',
  'progressPath',
  'errorPath',
  'imageUrlPath',
  'responsePath',
  'body',
  'requestBody',
  'submitBody',
  'pollBody',
  'method',
  'submitMethod',
  'pollMethod'
]
const RESTRICTED_CUSTOM_HEADERS = new Set([
  'cookie',
  'set-cookie',
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate'
])

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function mergeObjects(...items) {
  const merged = {}
  for (const item of items) {
    if (isPlainObject(item)) Object.assign(merged, item)
  }
  return merged
}

function pickFields(source, fields) {
  if (!isPlainObject(source)) return {}
  const out = {}
  for (const field of fields) {
    if (field in source) out[field] = source[field]
  }
  return out
}

function capabilityConfig(params) {
  if (params.action === 'generate') return params.provider?.image || {}
  return params.provider?.video || {}
}

function getTemplate(params) {
  const cap = capabilityConfig(params)
  const generationOptions = isPlainObject(params.generationOptions) ? params.generationOptions : {}
  return mergeObjects(
    params.provider?.template,
    params.provider?.customTemplate,
    cap.template,
    cap.customTemplate,
    pickFields(cap, TEMPLATE_FIELDS),
    generationOptions.template,
    pickFields(generationOptions, TEMPLATE_FIELDS),
    params.customTemplate,
    params.template,
    pickFields(params, TEMPLATE_FIELDS)
  )
}

function getAuthConfig(params, template) {
  const cap = capabilityConfig(params)
  const generationOptions = isPlainObject(params.generationOptions) ? params.generationOptions : {}
  return mergeObjects(
    params.provider?.customAuth,
    cap.customAuth,
    template.auth,
    generationOptions.auth,
    params.authConfig,
    params.customAuth
  )
}

function cleanHeaderName(name) {
  const value = String(name || '').trim()
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(value)) {
    throw new Error('Invalid custom auth header name')
  }
  if (RESTRICTED_CUSTOM_HEADERS.has(value.toLowerCase())) {
    throw new Error('Restricted custom auth header name')
  }
  return value
}

function cleanHeaderValue(value) {
  const out = String(value || '')
  if (/[\r\n]/.test(out)) throw new Error('Invalid custom auth header value')
  return out
}

function extractApiKey(auth = {}) {
  const headers = auth.headers || {}
  for (const [name, value] of Object.entries(headers)) {
    const text = String(value || '')
    if (!text) continue
    if (name.toLowerCase() === 'authorization') {
      const match = text.match(/^Bearer\s+(.+)$/i)
      return match ? match[1] : text
    }
    return text
  }
  for (const value of Object.values(auth.queryParams || {})) {
    if (value) return String(value)
  }
  return ''
}

function authForRequest(params, template) {
  const auth = params.auth || {}
  const config = getAuthConfig(params, template)
  if (!config.type) {
    return {
      headers: { ...(auth.headers || {}) },
      queryParams: { ...(auth.queryParams || {}) }
    }
  }

  const apiKey = cleanHeaderValue(extractApiKey(auth))
  const sessionToken = cleanHeaderValue(params.credentials?.sessionToken || '')
  const headers = {}
  const queryParams = {}
  const type = String(config.type || '').toLowerCase().replace(/_/g, '-')
  const prefix = config.prefix == null ? '' : String(config.prefix)

  if (type === 'bearer') {
    headers.Authorization = cleanHeaderValue(`${prefix || 'Bearer'} ${apiKey}`.trim())
  } else if (type === 'api-key' || type === 'apikey') {
    headers[cleanHeaderName(config.headerName || config.key || 'x-api-key')] = cleanHeaderValue(`${prefix}${apiKey}`)
  } else if (type === 'header') {
    headers[cleanHeaderName(config.headerName || config.key || 'Authorization')] = cleanHeaderValue(`${prefix}${apiKey}`)
  } else if (type === 'session') {
    headers[cleanHeaderName(config.sessionHeaderName || config.headerName || config.key || 'X-Session-Token')] = sessionToken
  } else if (type === 'query') {
    queryParams[String(config.paramName || config.key || 'key')] = apiKey
  } else if (type === 'cookie') {
    throw new Error('Cookie authentication is not supported. Use a session token header instead.')
  } else {
    throw new Error(`Unsupported custom auth type: ${config.type}`)
  }

  return { headers, queryParams }
}

function normalizeDuration(duration) {
  const value = Number(duration)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined
}

function templateValues(params) {
  return {
    prompt: params.prompt || '',
    model: params.model || '',
    ratio: params.ratio || '',
    resolution: params.resolution || '',
    duration: normalizeDuration(params.duration),
    sourceImageUrl: params.sourceImageUrl || '',
    negativePrompt: params.negativePrompt || params.negative_prompt || ''
  }
}

function placeholderName(match) {
  const name = match.match(/^[{][$]?\s*([A-Za-z][A-Za-z0-9_]*)\s*[}]$/)
  if (name) return name[1]
  const double = match.match(/^[{][{]\s*([A-Za-z][A-Za-z0-9_]*)\s*[}][}]$/)
  if (double) return double[1]
  const dollar = match.match(/^\$\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}$/)
  return dollar ? dollar[1] : ''
}

function substituteString(input, values, extraValues = {}, encode = false) {
  const source = String(input)
  const re = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}|\$\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}|\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}/g
  const full = source.match(/^(?:\{\{\s*[A-Za-z][A-Za-z0-9_]*\s*\}\}|\$\{\s*[A-Za-z][A-Za-z0-9_]*\s*\}|\{\s*[A-Za-z][A-Za-z0-9_]*\s*\})$/)

  if (full) {
    const name = placeholderName(full[0])
    if (!TEMPLATE_KEYS.has(name) && !(name in extraValues)) throw new Error(`Unsupported template variable: ${name}`)
    const value = name in extraValues ? extraValues[name] : values[name]
    return encode ? encodeURIComponent(String(value ?? '')) : value
  }

  return source.replace(re, (_, a, b, c) => {
    const name = a || b || c
    if (!TEMPLATE_KEYS.has(name) && !(name in extraValues)) throw new Error(`Unsupported template variable: ${name}`)
    const value = name in extraValues ? extraValues[name] : values[name]
    const text = String(value ?? '')
    return encode ? encodeURIComponent(text) : text
  })
}

function applyTemplate(value, values, extraValues = {}) {
  if (typeof value === 'string') return substituteString(value, values, extraValues)
  if (Array.isArray(value)) return value.map(item => applyTemplate(item, values, extraValues))
  if (isPlainObject(value)) {
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = applyTemplate(item, values, extraValues)
    return out
  }
  return value
}

function normalizePathPart(path, label) {
  const value = String(path || '').trim()
  if (!value) return ''
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.startsWith('//')) {
    throw new Error(`${label} must be a relative API path`)
  }
  return value.startsWith('/') ? value : `/${value}`
}

function joinTemplatePath(pathPrefix, path, label) {
  const prefix = normalizePathPart(pathPrefix, `${label} prefix`)
  const suffix = normalizePathPart(path, label)
  if (!suffix) throw new Error(`${label} is required`)
  if (!prefix) return suffix
  return `${prefix.replace(/\/$/, '')}${suffix}`
}

function buildUrl(baseUrl, pathPrefix, path, values, queryParams, label, extraValues = {}) {
  const rawPath = joinTemplatePath(pathPrefix, path, label)
  const renderedPath = substituteString(rawPath, values, extraValues, true)
  const url = joinApiUrl(baseUrl, renderedPath)
  for (const [key, value] of Object.entries(queryParams || {})) {
    if (value != null && value !== '') url.searchParams.set(key, String(value))
  }
  return url
}

function getSize(ratio, resolution) {
  const base = IMAGE_SIZES[ratio || '1:1'] || IMAGE_SIZES['1:1']
  const res = parseInt(resolution, 10) || 1024
  if (res <= 1024) return `${base[0]}x${base[1]}`
  const scale = res / 1024
  const w = Math.round(base[0] * scale / 64) * 64
  const h = Math.round(base[1] * scale / 64) * 64
  return `${Math.min(w, 4096)}x${Math.min(h, 4096)}`
}

function promptWithNegative(prompt, negativePrompt, label) {
  if (!negativePrompt) return prompt
  return `${prompt}\n\n${label}: ${negativePrompt}`
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
  if (json.error) {
    const error = json.error
    throw new Error(typeof error === 'string' ? error : error.message || 'Provider error')
  }
  return json
}

function pathSegments(path) {
  const clean = String(path || '').trim().replace(/^\$\.?/, '')
  if (!clean) return []
  const matches = clean.match(/[^.[\]]+|\[(?:\d+|"[^"]+"|'[^']+')\]/g)
  if (!matches) return []
  return matches.map(part => {
    if (!part.startsWith('[')) return part
    const inner = part.slice(1, -1)
    if (/^\d+$/.test(inner)) return Number(inner)
    return inner.replace(/^["']|["']$/g, '')
  })
}

function readPath(obj, path) {
  if (!path) return undefined
  const paths = Array.isArray(path) ? path : [path]
  for (const candidate of paths) {
    let value = obj
    for (const segment of pathSegments(candidate)) {
      if (value == null) {
        value = undefined
        break
      }
      value = value[segment]
    }
    if (value != null && value !== '') return value
  }
  return undefined
}

function normalizeImageValue(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeImageValue(item)
      if (normalized) return normalized
    }
    return ''
  }
  if (isPlainObject(value)) {
    const inline = value.inlineData || value.inline_data
    if (inline?.data) return `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`
    if (value.b64_json) return `data:image/png;base64,${value.b64_json}`
    if (value.url) return value.url
    if (value.image_url) return typeof value.image_url === 'string' ? value.image_url : value.image_url.url
    if (value.data) return normalizeImageValue(value.data)
  }
  return ''
}

function extractImage(json, template = {}) {
  const fromPath = normalizeImageValue(readPath(json, template.imageUrlPath || template.responsePath))
  if (fromPath) return fromPath

  const common = normalizeImageValue([
    json.data?.[0],
    json.images?.[0],
    json.output?.[0],
    json.image,
    json.image_url,
    json.url,
    json.candidates?.[0]?.content?.parts
  ])
  if (common) return common
  throw new Error('No image returned')
}

function defaultOpenAiBody(params) {
  const negativePrompt = params.negativePrompt || params.negative_prompt || ''
  return {
    model: params.model,
    prompt: promptWithNegative(params.prompt, negativePrompt, 'Negative prompt'),
    n: 1,
    size: getSize(params.ratio, params.resolution)
  }
}

function defaultGeminiBody(params) {
  const negativePrompt = params.negativePrompt || params.negative_prompt || ''
  const finalPrompt = promptWithNegative(params.prompt, negativePrompt, 'Avoid')
  return {
    contents: [{
      parts: [{ text: `The final composition must be designed for a strict ${params.ratio || '1:1'} aspect ratio.\n\n${finalPrompt}` }]
    }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  }
}

function defaultArkBody(params) {
  const negativePrompt = params.negativePrompt || params.negative_prompt || ''
  const body = {
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: getSize(params.ratio, params.resolution)
  }
  if (negativePrompt) body.negative_prompt = negativePrompt
  return body
}

async function handleCustomImage(params, defaults) {
  const template = getTemplate(params)
  const values = templateValues(params)
  const auth = authForRequest(params, template)
  const path = template.path || template.submitPath || defaults.path
  const bodyTemplate = template.body || template.requestBody || template.submitBody
  const body = bodyTemplate ? applyTemplate(bodyTemplate, values) : defaults.body(params)
  const url = buildUrl(params.baseUrl, template.pathPrefix, path, values, auth.queryParams, 'Custom image path')
  const json = await requestJson(url, template.method || template.submitMethod || 'POST', {
    ...auth.headers,
    'Content-Type': 'application/json'
  }, params.requestOptions, body)
  return extractImage(json, template)
}

function defaultVideoBody(params) {
  const negativePrompt = params.negativePrompt || params.negative_prompt || ''
  const body = {
    model: params.model,
    prompt: params.prompt,
    ratio: params.ratio || '1:1'
  }
  const duration = normalizeDuration(params.duration)
  if (duration) body.duration = duration
  if (params.sourceImageUrl) body.source_image_url = params.sourceImageUrl
  if (negativePrompt) body.negative_prompt = negativePrompt
  return body
}

function normalizeStatus(status) {
  const value = String(status || 'unknown').toLowerCase()
  if (['succeeded', 'success', 'completed', 'complete', 'done'].includes(value)) return 'succeeded'
  if (['failed', 'failure', 'error', 'cancelled', 'canceled', 'expired'].includes(value)) return 'failed'
  if (['pending', 'queued', 'running', 'processing', 'in_progress', 'throttled'].includes(value)) return value
  return value
}

function normalizeProgress(progress) {
  const value = Number(progress) || 0
  return value > 0 && value <= 1 ? Math.round(value * 100) : value
}

function commonTaskId(json) {
  return readPath(json, [
    'id',
    'task_id',
    'taskId',
    'data.id',
    'data.task_id',
    'data.taskId',
    'task.id',
    'output.id'
  ])
}

function commonVideoUrl(json) {
  return readPath(json, [
    'videoUrl',
    'video_url',
    'url',
    'data.videoUrl',
    'data.video_url',
    'data.url',
    'output.videoUrl',
    'output.video_url',
    'output.url',
    'output[0]',
    'content[0].video_url'
  ]) || ''
}

async function handleVideoSubmit(params) {
  const template = getTemplate(params)
  const values = templateValues(params)
  const auth = authForRequest(params, template)
  const bodyTemplate = template.submitBody || template.body || template.requestBody
  const body = bodyTemplate ? applyTemplate(bodyTemplate, values) : defaultVideoBody(params)
  const url = buildUrl(params.baseUrl, template.pathPrefix, template.submitPath, values, auth.queryParams, 'Custom video submitPath')
  const json = await requestJson(url, template.submitMethod || template.method || 'POST', {
    ...auth.headers,
    'Content-Type': 'application/json'
  }, params.requestOptions, body)
  const taskId = readPath(json, template.taskIdPath) || commonTaskId(json)
  if (!taskId) throw new Error('Custom video response did not include a task id')
  return {
    taskId: String(taskId),
    status: normalizeStatus(readPath(json, template.statusPath) || json.status || 'pending')
  }
}

async function handleVideoPoll(params) {
  const taskId = params.taskId || params.task_id
  if (!taskId) throw new Error('Missing video task id')

  const template = getTemplate(params)
  const values = templateValues(params)
  const auth = authForRequest(params, template)
  const extraValues = { taskId }
  const bodyTemplate = template.pollBody
  const body = bodyTemplate ? applyTemplate(bodyTemplate, values, extraValues) : undefined
  const url = buildUrl(params.baseUrl, template.pathPrefix, template.pollPath, values, auth.queryParams, 'Custom video pollPath', extraValues)
  const json = await requestJson(url, template.pollMethod || 'GET', {
    ...auth.headers,
    ...(body ? { 'Content-Type': 'application/json' } : {})
  }, params.requestOptions, body)
  return {
    status: normalizeStatus(readPath(json, template.statusPath) || json.status),
    progress: normalizeProgress(readPath(json, template.progressPath) || json.progress),
    videoUrl: readPath(json, template.videoUrlPath) || commonVideoUrl(json),
    error: readPath(json, template.errorPath) || json.error?.message || json.message || ''
  }
}

async function customOpenAiImageHandler(params) {
  if (params.action !== 'generate') throw new Error(`Unsupported action: ${params.action}`)
  return handleCustomImage(params, {
    path: '/v1/images/generations',
    body: defaultOpenAiBody
  })
}

async function customGeminiImageHandler(params) {
  if (params.action !== 'generate') throw new Error(`Unsupported action: ${params.action}`)
  return handleCustomImage(params, {
    path: '/v1beta/models/{model}:generateContent',
    body: defaultGeminiBody
  })
}

async function customArkImageHandler(params) {
  if (params.action !== 'generate') throw new Error(`Unsupported action: ${params.action}`)
  return handleCustomImage(params, {
    path: '/images/generations',
    body: defaultArkBody
  })
}

async function customVideoTaskHandler(params) {
  switch (params.action) {
    case 'submit':
      return handleVideoSubmit(params)
    case 'poll':
      return handleVideoPoll(params)
    default:
      throw new Error(`Unsupported action: ${params.action}`)
  }
}

registerHandler('custom_image_openai', customOpenAiImageHandler)
registerHandler('custom_image_gemini', customGeminiImageHandler)
registerHandler('custom_image_ark', customArkImageHandler)
registerHandler('custom_video_task', customVideoTaskHandler)

module.exports = {
  customOpenAiImageHandler,
  customGeminiImageHandler,
  customArkImageHandler,
  customVideoTaskHandler
}
