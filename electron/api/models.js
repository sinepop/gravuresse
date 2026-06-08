const { request, assertApiBaseUrl, joinApiUrl } = require('./http')

async function fetch(provider) {
  if (!provider.apiKey || !provider.baseUrl) return []
  try {
    if (provider.format === 'gemini' || provider.id === 'gemini' || provider.id === 'gemini_img') {
      const url = joinApiUrl(provider.baseUrl, `/v1beta/models?key=${encodeURIComponent(provider.apiKey)}`)
      const res = await request(url, { method: 'GET' })
      const json = JSON.parse(res.data)
      return (json.models || []).map(m => ({ id: (m.name || '').replace(/^models\//, '') })).filter(m => m.id).sort((a, b) => a.id.localeCompare(b.id))
    }
    const headers = {}
    if (provider.format === 'anthropic' || provider.id === 'claude') {
      headers['x-api-key'] = provider.apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers['Authorization'] = `Bearer ${provider.apiKey}`
    }
    const base = assertApiBaseUrl(provider.baseUrl)
    const modelsBase = /\/v1\/?$/i.test(base.pathname)
      ? base.href.replace(/\/$/, '')
      : `${base.href.replace(/\/$/, '')}/v1`
    const url = new URL(`${modelsBase}/models`)
    const res = await request(url, { method: 'GET', headers })
    const json = JSON.parse(res.data)
    const list = json.data || json.models || json
    if (!Array.isArray(list)) return []
    return list.map(m => ({ id: m.id || m.name || m })).filter(m => m.id).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  } catch { return [] }
}

module.exports = { fetch }
