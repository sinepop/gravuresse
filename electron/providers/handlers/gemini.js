const { registerHandler } = require('../handler')
const { request, joinCompatibleApiUrl } = require('../../api/http')

async function handleChat(params) {
  const contents = (params.messages || []).map(message => ({
    role: message.role === 'assistant' ? 'model' : message.role,
    parts: [{ text: message.content }]
  }))
  const body = {
    contents,
    systemInstruction: { parts: [{ text: params.system }] }
  }
  const apiKey = params.auth.queryParams.key
  const url = joinCompatibleApiUrl(params.baseUrl, `/v1beta/models/${encodeURIComponent(params.model)}:generateContent`)
  url.searchParams.set('key', apiKey)
  const res = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(params.requestOptions || {})
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  const text = json.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || ''
  return { text, model: params.model }
}

async function handleGenerate(params) {
  const { model, baseUrl, auth, prompt, ratio, negative_prompt } = params
  const m = model || 'gemini-2.5-flash-image'
  const finalPrompt = negative_prompt ? `${prompt}\n\nAvoid: ${negative_prompt}` : prompt
  const body = {
    contents: [{
      parts: [{ text: `The final composition must be designed for a strict ${ratio || '1:1'} aspect ratio.\n\n${finalPrompt}` }]
    }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  }
  const apiKey = auth.queryParams.key
  const url = joinCompatibleApiUrl(baseUrl, `/v1beta/models/${encodeURIComponent(m)}:generateContent`)
  url.searchParams.set('key', apiKey)
  const res = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(params.requestOptions || {})
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  const parts = json.candidates?.[0]?.content?.parts || []
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data
    if (inline?.data) return `data:${inline.mimeType || 'image/png'};base64,${inline.data}`
  }
  throw new Error('Gemini did not return an image')
}

async function geminiHandler(params) {
  switch (params.action) {
    case 'chat':
      return handleChat(params)
    case 'generate':
      return handleGenerate(params)
    default:
      throw new Error(`Unsupported action: ${params.action}`)
  }
}

registerHandler('gemini', geminiHandler)
registerHandler('gemini_image', geminiHandler)
module.exports = geminiHandler
