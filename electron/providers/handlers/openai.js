const { registerHandler } = require('../handler')
const { request, joinCompatibleApiUrl } = require('../../api/http')
const { extractPrimaryInferenceOutput } = require('../inference-evidence')

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

function chatCompletionsUrl(baseUrl, path) {
  return joinCompatibleApiUrl(baseUrl, path || '/v1/chat/completions')
}

function imageGenerationsUrl(baseUrl) {
  return joinCompatibleApiUrl(baseUrl, '/v1/images/generations')
}

async function handleChat(params) {
  const body = {
    model: params.model,
    messages: [
      { role: 'system', content: params.system },
      ...(params.messages || [])
    ],
    max_tokens: 4096
  }
  const url = chatCompletionsUrl(params.baseUrl, params.path)
  const res = await request(url, {
    method: 'POST',
    headers: { ...params.auth.headers, 'Content-Type': 'application/json' },
    ...(params.requestOptions || {})
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  const output = extractPrimaryInferenceOutput('openai', json)
  return { text: output.text, thinking: output.thinking, model: json.model }
}

function imageFromResponse(json = {}) {
  const item = Array.isArray(json.data) ? json.data[0] : json.data
  if (!item) throw new Error('No image returned')
  if (typeof item === 'string') return item
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
  if (item.url) return item.url
  if (item.image_url) return typeof item.image_url === 'string' ? item.image_url : item.image_url.url
  if (item.output_url) return item.output_url
  throw new Error('Unknown image response format')
}

async function handleGenerate(params) {
  const { model, baseUrl, auth, prompt, ratio, resolution, negative_prompt } = params
  const size = getSize(ratio, resolution)
  const finalPrompt = negative_prompt ? `${prompt}\n\nNegative prompt: ${negative_prompt}` : prompt
  const body = { model: model || 'dall-e-3', prompt: finalPrompt, n: 1, size }
  const url = imageGenerationsUrl(baseUrl)
  const res = await request(url, {
    method: 'POST',
    headers: { ...auth.headers, 'Content-Type': 'application/json' },
    ...(params.requestOptions || {})
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  return imageFromResponse(json)
}

async function openaiHandler(params) {
  switch (params.action) {
    case 'chat':
      return handleChat(params)
    case 'generate':
      return handleGenerate(params)
    default:
      throw new Error(`Unsupported action: ${params.action}`)
  }
}

registerHandler('openai', openaiHandler)
registerHandler('openai_image', openaiHandler)
openaiHandler._test = { getSize, imageFromResponse, chatCompletionsUrl, imageGenerationsUrl }
module.exports = openaiHandler
