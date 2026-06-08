const { request, joinApiUrl } = require('./http')

async function callClaude(messages, provider) {
  const payload = {
    model: provider.model || 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: messages.system || 'You are Gravuresse.',
    messages: messages.history || []
  }
  if (messages.thinking) {
    payload.thinking = { type: 'enabled', budget_tokens: 10000 }
    payload.max_tokens = 16000
  }
  const url = joinApiUrl(provider.baseUrl || 'https://api.anthropic.com', '/v1/messages')
  const res = await request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01'
    }
  }, payload)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  const thinking = json.content?.filter(b => b.type === 'thinking').map(b => b.text).join('') || ''
  const text = json.content?.filter(b => b.type === 'text').map(b => b.text).join('') || ''
  return { text, thinking, model: json.model }
}

async function callOpenAI(messages, provider) {
  const body = {
    model: provider.model || 'gpt-5.1',
    messages: [
      { role: 'system', content: messages.system || 'You are Gravuresse.' },
      ...(messages.history || [])
    ],
    max_tokens: 4096
  }
  const url = joinApiUrl(provider.baseUrl || 'https://api.openai.com', '/v1/chat/completions')
  const res = await request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`
    }
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  const text = json.choices?.[0]?.message?.content || ''
  return { text, model: json.model }
}

async function callGemini(messages, provider) {
  const contents = (messages.history || []).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
  const body = {
    contents,
    systemInstruction: { parts: [{ text: messages.system || 'You are Gravuresse.' }] }
  }
  const model = provider.model || 'gemini-2.5-pro'
  const url = joinApiUrl(provider.baseUrl || 'https://generativelanguage.googleapis.com', `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`)
  const res = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  const text = json.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
  return { text, model }
}

async function call(messages, provider) {
  const fmt = provider.format || 'openai'
  if (fmt === 'anthropic') return callClaude(messages, provider)
  if (fmt === 'gemini') return callGemini(messages, provider)
  return callOpenAI(messages, provider)
}

module.exports = { call }
