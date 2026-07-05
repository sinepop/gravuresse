const { request, assertApiBaseUrl } = require('./http')
const { redactSecrets } = require('../providers/pipeline')

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

function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

function modelAuthType(provider = {}) {
  const customType = normalizeAuthType(provider.customAuth?.type)
  if (customType) return { ...provider.customAuth, type: customType, source: 'custom' }
  const registryType = normalizeAuthType(provider.authType?.type)
  if (registryType) return { ...provider.authType, type: registryType, source: 'registry' }
  if (provider.format === 'gemini' || provider.id === 'gemini' || provider.id === 'gemini_img') {
    return { type: 'query', key: 'key', source: 'format' }
  }
  if (provider.format === 'anthropic' || provider.id === 'claude') {
    return { type: 'header', key: 'x-api-key', source: 'format' }
  }
  return { type: 'bearer', source: 'default' }
}

function buildModelAuth(provider = {}) {
  const authType = modelAuthType(provider)
  const usesSession = authType.type === 'session'
  const credential = usesSession ? provider.sessionToken : provider.apiKey
  const headers = {}
  const queryParams = {}

  if (authType.type === 'none') {
    return { headers, queryParams, requiresCredential: false, usesSession, authType }
  }
  if (!credential) {
    return { headers, queryParams, requiresCredential: true, usesSession, authType }
  }

  if (usesSession) {
    headers[cleanCustomHeaderName(authType.sessionHeaderName || authType.headerName || authType.key || 'X-Session-Token')] = credential
  } else if (authType.type === 'api-key' || authType.type === 'apikey' || authType.type === 'header') {
    headers[cleanCustomHeaderName(authType.headerName || authType.key || 'x-api-key')] = credential
  } else if (authType.type === 'query') {
    queryParams[String(authType.paramName || authType.key || 'key')] = credential
  } else {
    headers.Authorization = `Bearer ${credential}`
  }

  if (provider.format === 'anthropic' || provider.id === 'claude') {
    headers['anthropic-version'] = '2023-06-01'
  }

  return { headers, queryParams, requiresCredential: true, usesSession, authType }
}

function applyQueryParams(url, queryParams = {}) {
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

function cleanModelPathPart(value, label) {
  const out = String(value || '').trim()
  if (!out) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(out) || out.startsWith('//')) {
    throw new Error(`${label} must be a relative API path`)
  }
  if (/[\\\r\n]/.test(out)) throw new Error(`Invalid ${label}`)
  return out.startsWith('/') ? out : `/${out}`
}

function joinModelPath(pathPrefix, modelListPath) {
  const prefix = cleanModelPathPart(pathPrefix, 'Model path prefix')
  const path = cleanModelPathPart(modelListPath, 'Model list path')
  if (!path) return ''
  if (!prefix) return path
  return `${prefix.replace(/\/$/, '')}${path}`
}

function buildCustomModelListUrl(baseUrl, pathPrefix, modelListPath, queryParams = {}) {
  const base = assertApiBaseUrl(baseUrl)
  const baseHref = base.href.replace(/\/$/, '')
  const basePath = base.pathname.replace(/\/+$/, '')
  let path = joinModelPath(pathPrefix, modelListPath)
  if (!path) throw new Error('Model list path is required')
  if (basePath && path.toLowerCase().startsWith(`${basePath.toLowerCase()}/`)) {
    path = path.slice(basePath.length) || '/'
  }
  return applyQueryParams(new URL(`${baseHref}${path}`), queryParams)
}

function buildModelListUrl(baseUrl, queryParams = {}, options = {}) {
  const customPath = options.modelListPath || options.modelsPath
  if (customPath) {
    return buildCustomModelListUrl(baseUrl, options.pathPrefix, customPath, queryParams)
  }
  const base = assertApiBaseUrl(baseUrl)
  const baseHref = base.href.replace(/\/$/, '')
  const basePath = base.pathname.replace(/\/+$/, '')
  const modelsBase = /\/(?:v\d+(?:beta\d*)?|api\/v\d+)$/i.test(basePath)
    ? baseHref
    : `${baseHref}/v1`
  return applyQueryParams(new URL(`${modelsBase}/models`), queryParams)
}

function buildGeminiModelListUrl(baseUrl, queryParams = {}) {
  const base = assertApiBaseUrl(baseUrl)
  const baseHref = base.href.replace(/\/$/, '')
  const basePath = base.pathname.replace(/\/+$/, '')
  const modelsBase = /\/v\d+(?:beta\d*)?$/i.test(basePath)
    ? baseHref
    : `${baseHref}/v1beta`
  return applyQueryParams(new URL(`${modelsBase}/models`), queryParams)
}

function handleFetchError(error, provider = {}) {
  if (!provider.reportErrors) return []
  const message = redactSecrets(error?.message || 'Model fetch failed') || 'Model fetch failed'
  throw new Error(message)
}

async function fetch(provider) {
  const auth = buildModelAuth(provider)
  if ((auth.requiresCredential && (auth.usesSession ? !provider.sessionToken : !provider.apiKey)) || !provider.baseUrl) return []
  const requestOptions = provider.requestOptions || {}
  const modelListOptions = {
    pathPrefix: provider.pathPrefix,
    modelListPath: provider.modelListPath || provider.modelsPath
  }
  try {
    if (modelListOptions.modelListPath) {
      const url = buildModelListUrl(provider.baseUrl, auth.queryParams, modelListOptions)
      const res = await request(url, { method: 'GET', headers: auth.headers, ...requestOptions })
      const json = JSON.parse(res.data)
      const list = json.data || json.models || json
      if (!Array.isArray(list)) return []
      return list.map(m => ({ id: m.id || m.name || m })).filter(m => m.id).sort((a, b) => String(a.id).localeCompare(String(b.id)))
    }
    if (!auth.usesSession && (provider.format === 'gemini' || provider.id === 'gemini' || provider.id === 'gemini_img')) {
      const url = buildGeminiModelListUrl(provider.baseUrl, Object.keys(auth.queryParams).length ? auth.queryParams : { key: provider.apiKey })
      const res = await request(url, { method: 'GET', ...requestOptions })
      const json = JSON.parse(res.data)
      return (json.models || []).map(m => ({ id: (m.name || '').replace(/^models\//, '') })).filter(m => m.id).sort((a, b) => a.id.localeCompare(b.id))
    }
    const url = buildModelListUrl(provider.baseUrl, auth.queryParams)
    const res = await request(url, { method: 'GET', headers: auth.headers, ...requestOptions })
    const json = JSON.parse(res.data)
    const list = json.data || json.models || json
    if (!Array.isArray(list)) return []
    return list.map(m => ({ id: m.id || m.name || m })).filter(m => m.id).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  } catch (error) { return handleFetchError(error, provider) }
}

module.exports = { fetch, _test: { buildModelAuth, modelAuthType, applyQueryParams, buildModelListUrl, buildGeminiModelListUrl, buildCustomModelListUrl, handleFetchError } }
