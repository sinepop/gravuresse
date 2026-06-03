const https = require('https')
const http = require('http')

async function callClaude(messages, provider) {
  const base = (provider.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')
  const body = JSON.stringify({
    model: provider.model || 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: messages.system || 'You are Gravuresse.',
    messages: messages.history || []
  })
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}/v1/messages`)
    const mod = url.protocol === 'https:' ? https : http
    const req = mod.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) return reject(new Error(json.error.message))
          const text = json.content?.filter(b => b.type === 'text').map(b => b.text).join('') || ''
          resolve({ text, model: json.model })
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function callOpenAI(messages, provider) {
  const base = (provider.baseUrl || 'https://api.openai.com').replace(/\/$/, '')
  const body = JSON.stringify({
    model: provider.model || 'gpt-5.1',
    messages: [
      { role: 'system', content: messages.system || 'You are Gravuresse.' },
      ...(messages.history || [])
    ],
    max_tokens: 4096
  })
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}/v1/chat/completions`)
    const mod = url.protocol === 'https:' ? https : http
    const req = mod.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) return reject(new Error(json.error.message))
          const text = json.choices?.[0]?.message?.content || ''
          resolve({ text, model: json.model })
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function callGemini(messages, provider) {
  const base = (provider.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
  const contents = (messages.history || []).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
  const body = JSON.stringify({
    contents,
    systemInstruction: { parts: [{ text: messages.system || 'You are Gravuresse.' }] }
  })
  return new Promise((resolve, reject) => {
    const model = provider.model || 'gemini-2.5-pro'
    const url = new URL(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${provider.apiKey}`)
    const mod = url.protocol === 'https:' ? https : http
    const req = mod.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) return reject(new Error(json.error.message))
          const text = json.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
          resolve({ text, model })
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function call(messages, provider) {
  const fmt = provider.format || 'openai'
  if (fmt === 'anthropic') return callClaude(messages, provider)
  if (fmt === 'gemini') return callGemini(messages, provider)
  return callOpenAI(messages, provider)
}

module.exports = { call }
