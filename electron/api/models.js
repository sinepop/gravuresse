const { request, assertApiBaseUrl, joinApiUrl } = require('./http')

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

function cleanCustomHeaderName(name) {
  const value = String(name || '').trim()
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(value)) {
    throw new Error('Invalid custom auth header name')
  }
  if (RESTRICTED_CUSTOM_HEADERS.has(value.toLowerCase())) {
    throw new Error('Restricted custom auth header name')
  }
  return value
}

async function fetch(provider) {
  const authType = String(provider.customAuth?.type || '').toLowerCase().replace(/_/g, '-')
  const usesSession = authType === 'session'
  const credential = usesSession ? provider.sessionToken : provider.apiKey
  if (!credential || !provider.baseUrl) return []
  const requestOptions = provider.requestOptions || {}
  try {
    if (!usesSession && (provider.format === 'gemini' || provider.id === 'gemini' || provider.id === 'gemini_img')) {
      const url = joinApiUrl(provider.baseUrl, `/v1beta/models?key=${encodeURIComponent(provider.apiKey)}`)
      const res = await request(url, { method: 'GET', ...requestOptions })
      const json = JSON.parse(res.data)
      return (json.models || []).map(m => ({ id: (m.name || '').replace(/^models\//, '') })).filter(m => m.id).sort((a, b) => a.id.localeCompare(b.id))
    }
    const headers = {}
    if (usesSession) {
      headers[cleanCustomHeaderName(provider.customAuth?.sessionHeaderName || provider.customAuth?.headerName || provider.customAuth?.key || 'X-Session-Token')] = provider.sessionToken
    } else if (authType === 'api-key' || authType === 'apikey' || authType === 'header') {
      headers[cleanCustomHeaderName(provider.customAuth?.headerName || provider.customAuth?.key || 'x-api-key')] = provider.apiKey
    } else if (provider.format === 'anthropic' || provider.id === 'claude') {
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
    const res = await request(url, { method: 'GET', headers, ...requestOptions })
    const json = JSON.parse(res.data)
    const list = json.data || json.models || json
    if (!Array.isArray(list)) return []
    return list.map(m => ({ id: m.id || m.name || m })).filter(m => m.id).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  } catch { return [] }
}

module.exports = { fetch }
