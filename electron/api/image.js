const https = require('https')
const http = require('http')

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

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http
    const req = mod.request(url, options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ status: res.statusCode, data }))
    })
    req.on('error', reject)
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}

async function genOpenAI(params) {
  const { prompt, ratio, apiKey, baseUrl, model, resolution } = params
  const base = (baseUrl || 'https://api.openai.com').replace(/\/$/, '')
  const size = getSize(ratio, resolution)
  const body = { model: model || 'gpt-image-2', prompt, n: 1, size }
  const url = new URL(`${base}/v1/images/generations`)
  const res = await httpRequest(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  const item = json.data?.[0]
  if (!item) throw new Error('No image returned')
  if (typeof item === 'string') return item
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
  if (item.url) return item.url
  throw new Error('Unknown image response format')
}

async function genGemini(params) {
  const { prompt, ratio, apiKey, baseUrl, model } = params
  const base = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
  const m = model || 'gemini-2.5-flash-image'
  const body = {
    contents: [{ parts: [{ text: `The final composition must be designed for a strict ${ratio || '1:1'} aspect ratio.\n\n${prompt}` }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  }
  const url = new URL(`${base}/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`)
  const res = await httpRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  const parts = json.candidates?.[0]?.content?.parts || []
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data
    if (inline?.data) return `data:${inline.mimeType || 'image/png'};base64,${inline.data}`
  }
  throw new Error('Gemini did not return an image')
}

async function genArk(params) {
  const { prompt, ratio, apiKey, baseUrl, model, resolution } = params
  const base = (baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  const size = getSize(ratio, resolution)
  const body = { model: model || 'doubao-seedream-4-0-250828', prompt, n: 1, size }
  const url = new URL(`${base}/images/generations`)
  const res = await httpRequest(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  const item = json.data?.[0]
  if (!item) throw new Error('No image returned from Ark')
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
  if (item.url) return item.url
  throw new Error('Unknown Ark image response format')
}

async function genPollinations(params) {
  const { prompt, ratio, resolution } = params
  const sizeStr = getSize(ratio, resolution)
  const [w, h] = sizeStr.split('x').map(Number)
  const seed = Math.floor(Math.random() * 999999)
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?seed=${seed}&width=${w}&height=${h}&nologo=true&enhance=true`
}

async function generate(params, retries = 1) {
  const proto = params.protocol || 'openai_image'
  const fn = proto === 'gemini_image' ? genGemini
    : proto === 'ark_image' ? genArk
    : proto === 'pollinations' ? genPollinations
    : genOpenAI
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn(params)
    } catch (e) {
      lastErr = e
      if (i < retries) await new Promise(r => setTimeout(r, 2000))
    }
  }
  throw lastErr
}

module.exports = { generate }
