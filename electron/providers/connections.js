const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { request, assertApiBaseUrl, joinCompatibleApiUrl, cleanRelativeApiPath } = require('../api/http')
const { buildModelAuth, applyQueryParams } = require('../api/models')
const { redactSecrets } = require('./pipeline')
const { getProvider, getValidationStrategy, VALIDATION_STRATEGIES } = require('./registry')
const { analyzeInferenceResponse, assertSuccessfulResponse, buildMinimalInferenceBody } = require('./inference-evidence')
const { normalizeModelRecord, sortModelRecords } = require('../../shared/modelCapabilities.cjs')

const TRACKS = ['chat', 'image', 'video']
const COLLECTIONS = ['accounts', 'apiKeys', 'relays']
const SECRET_FIELDS = ['apiKey', 'sessionToken', 'token', 'accessKey', 'secretKey', 'refreshToken', 'idToken', 'oauthToken']
const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000
const TERMINAL_ATTEMPT_RETENTION_MS = 5 * 60 * 1000
const RELAY_PROBE_HEADERS = { Accept: 'application/json', 'User-Agent': 'Gravuresse/2.4.0' }
const oauthAttempts = new Map()

const ACCOUNT_CONNECTORS = [
  { id: 'codex', providerId: 'openai', runtimeProviderId: '', name: 'OpenAI Codex', mode: 'device-code', envPrefix: 'GRAVURESSE_CODEX' },
  { id: 'xai-oauth', providerId: 'xai', runtimeProviderId: 'xai', name: 'xAI OAuth', mode: 'oauth', envPrefix: 'GRAVURESSE_XAI' },
  { id: 'qwen-oauth', providerId: 'alibaba', runtimeProviderId: 'alibaba', name: 'Qwen OAuth', mode: 'oauth', envPrefix: 'GRAVURESSE_QWEN' },
  // MiniMax's registry entry is media-only.  The account is therefore never
  // exposed as a runnable text connection until a real compatible endpoint is
  // explicitly added to the registry.
  { id: 'minimax-oauth', providerId: 'minimax', runtimeProviderId: '', name: 'MiniMax OAuth', mode: 'oauth', envPrefix: 'GRAVURESSE_MINIMAX' },
  { id: 'copilot', providerId: 'github-copilot', runtimeProviderId: '', name: 'GitHub Copilot', mode: 'device-code', envPrefix: 'GRAVURESSE_COPILOT' },
  { id: 'copilot-acp', name: 'GitHub Copilot ACP', mode: 'cli', commands: ['copilot'] },
  { id: 'claude-code', name: 'Claude Code', mode: 'cli', commands: ['claude'], credentialMarkers: [['.claude', '.credentials.json']] },
  { id: 'gemini-cli', name: 'Gemini CLI', mode: 'cli', commands: ['gemini'], credentialMarkers: [['.gemini', 'oauth_creds.json']] }
]

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cleanText(value, max = 512) {
  return String(value || '').trim().slice(0, max)
}

function statusResult(input = {}) {
  return {
    ok: input.ok === true,
    status: input.status || (input.ok ? 'verified' : 'error'),
    level: input.level || 'none',
    checkedAt: input.checkedAt || new Date().toISOString(),
    latencyMs: Number.isFinite(input.latencyMs) ? input.latencyMs : null,
    endpointHost: input.endpointHost || '',
    modelId: input.modelId || '',
    errorCode: input.errorCode || '',
    message: input.message || '',
    evidence: input.evidence || 'none',
    outputVerified: input.outputVerified === true
  }
}

function endpointHost(baseUrl) {
  try { return new URL(baseUrl).host }
  catch { return '' }
}

function normalizeCapabilities(value) {
  const source = Array.isArray(value) ? value : isPlainObject(value) ? Object.keys(value).filter(key => value[key]) : []
  return [...new Set(source.filter(item => TRACKS.includes(item)))]
}

function registryCapabilities(providerDef = {}) {
  return TRACKS.filter(track => Boolean(providerDef?.[track]))
}

function normalizeAuthType(value) {
  const source = isPlainObject(value) ? value : { type: value }
  const type = cleanText(source.type || 'bearer', 32).toLowerCase().replace(/_/g, '-')
  if (!['bearer', 'api-key', 'apikey', 'header', 'query', 'session', 'none'].includes(type)) {
    throw new Error('Unsupported authentication type')
  }
  return {
    type,
    ...(source.headerName ? { headerName: cleanText(source.headerName, 80) } : {}),
    ...(source.paramName ? { paramName: cleanText(source.paramName, 80) } : {}),
    ...(source.key ? { key: cleanText(source.key, 80) } : {})
  }
}

function cleanRelativePath(value, label) {
  if (!value) return ''
  return cleanRelativeApiPath(value, label)
}

function normalizeRelayCompatibilityMode(value) {
  return value === 'openai' ? 'openai' : 'custom'
}

function relayDisplayName(input, providerId, compatibilityMode) {
  const explicit = cleanText(input.name, 160)
  if (explicit) return explicit
  if (compatibilityMode === 'openai') {
    try { return new URL(cleanText(input.baseUrl, 2048)).host }
    catch { return 'OpenAI-compatible relay' }
  }
  return cleanText(providerId || input.id, 160)
}

function sanitizeTemplates(value) {
  const result = {}
  for (const track of TRACKS) {
    const source = isPlainObject(value?.[track]) ? value[track] : null
    if (!source) continue
    const method = cleanText(source.method || 'POST', 12).toUpperCase()
    if (!['GET', 'POST', 'PUT', 'PATCH'].includes(method)) throw new Error(`Unsupported ${track} template method`)
    const headers = {}
    for (const [key, headerValue] of Object.entries(isPlainObject(source.headers) ? source.headers : {})) {
      if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(key) || /(?:authorization|cookie|api[-_]?key|token|secret)/i.test(key)) throw new Error('Template headers cannot contain credentials')
      headers[key] = cleanText(headerValue, 512)
    }
    result[track] = {
      method, headers,
      request: isPlainObject(source.request) ? JSON.parse(JSON.stringify(source.request)) : {},
      body: isPlainObject(source.body) ? JSON.parse(JSON.stringify(source.body)) : {},
      taskIdPath: cleanText(source.taskIdPath, 160), statusPath: cleanText(source.statusPath, 160),
      resultPath: cleanText(source.resultPath, 160), errorPath: cleanText(source.errorPath, 160),
      pollEndpoint: cleanRelativePath(source.pollEndpoint, `${track} poll endpoint`),
      pollInterval: Math.max(250, Math.min(60000, Number(source.pollInterval) || 2000))
    }
  }
  return result
}

function sanitizeConnection(input, collection) {
  if (!COLLECTIONS.includes(collection)) throw new Error('Unknown connection collection')
  if (!isPlainObject(input)) throw new Error('Connection must be an object')
  const id = cleanText(input.id, 128)
  if (!id || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error('A valid connection id is required')
  const compatibilityMode = collection === 'relays' ? normalizeRelayCompatibilityMode(input.compatibilityMode) : ''
  const providerId = compatibilityMode === 'openai' ? 'custom-relay' : cleanText(input.providerId, 128)
  if (collection !== 'accounts' && !providerId) throw new Error('providerId is required')
  const providerDef = collection === 'apiKeys' ? getProvider(providerId) : null
  if (collection === 'apiKeys' && !providerDef) throw new Error('Unknown standard provider')
  const capabilities = providerDef
    ? registryCapabilities(providerDef)
    : compatibilityMode === 'openai'
      ? ['chat', 'image']
      : normalizeCapabilities(input.capabilities)
  if (collection !== 'accounts' && capabilities.length === 0) throw new Error('At least one capability is required')
  const fixedBaseUrl = providerDef?.defaults?.baseUrl || ''
  const fixedModelsPath = capabilities.map(track => providerDef?.[track]?.modelListPath).find(Boolean) || providerDef?.modelListPath || ''

  const result = {
    id,
    providerId,
    name: relayDisplayName(input, providerId, compatibilityMode),
    kind: collection === 'relays' ? 'relay' : collection === 'apiKeys' ? 'api-key' : cleanText(input.kind || 'oauth', 32),
    baseUrl: cleanText(fixedBaseUrl || input.baseUrl, 2048),
    authType: normalizeAuthType(compatibilityMode === 'openai' ? 'bearer' : providerDef?.authType || input.authType || input.customAuth || 'bearer'),
    capabilities,
    ...(collection === 'relays' ? { compatibilityMode } : {}),
    modelsPath: cleanRelativePath(providerDef ? fixedModelsPath : compatibilityMode === 'openai' ? '' : input.modelsPath || input.modelListPath, 'Model list path'),
    pathPrefix: cleanRelativePath(providerDef || compatibilityMode === 'openai' ? '' : input.pathPrefix, 'API path prefix'),
    endpoints: {},
    template: !providerDef && compatibilityMode !== 'openai' ? sanitizeTemplates(input.template || input.customTemplate) : {},
    models: [],
    validation: null,
    validations: {},
    revision: crypto.randomUUID(),
    updatedAt: new Date().toISOString()
  }
  for (const [key, value] of Object.entries(!providerDef && compatibilityMode !== 'openai' && isPlainObject(input.endpoints) ? input.endpoints : {})) {
    if (!['chat', 'image', 'video', 'capability', 'submit', 'poll'].includes(key)) continue
    result.endpoints[key] = cleanRelativePath(value, `${key} endpoint`)
  }
  for (const field of SECRET_FIELDS) {
    if (typeof input[field] === 'string') result[field] = input[field]
    if (typeof input.credentials?.[field] === 'string') {
      result.credentials ||= {}
      result.credentials[field] = input.credentials[field]
    }
  }
  return result
}

function authSignature(connection = {}) {
  const auth = normalizeAuthType(connection.authType || connection.customAuth || 'bearer')
  return `${auth.type}:${auth.headerName || auth.paramName || auth.key || ''}`
}

function connectionIdentity(connection = {}) {
  return `${connection.id || ''}|${connection.providerId || ''}|${connection.baseUrl || ''}|${authSignature(connection)}`
}

function connectionIdentityMatches(a = {}, b = {}) {
  return connectionIdentity(a) === connectionIdentity(b)
}

function mergeConnectionSecret(existing, next, redactedValue = '********') {
  const result = { ...next, credentials: next.credentials ? { ...next.credentials } : undefined }
  if (!existing || !connectionIdentityMatches(existing, next)) {
    for (const field of SECRET_FIELDS) {
      if (result[field] === redactedValue) result[field] = ''
      if (result.credentials?.[field] === redactedValue) result.credentials[field] = ''
    }
    return result
  }
  for (const field of SECRET_FIELDS) {
    if (result[field] === redactedValue) result[field] = existing[field] || ''
    if (result.credentials?.[field] === redactedValue) result.credentials[field] = existing.credentials?.[field] || ''
  }
  return result
}

function findConnection(config, id) {
  for (const collection of COLLECTIONS) {
    const connection = (config.connections?.[collection] || []).find(item => item.id === id)
    if (connection) return { collection, connection }
  }
  return null
}

function runtimeProviderId(connection, track) {
  if (connection.kind === 'relay' && track === 'chat' && connection.detectedProtocol === 'anthropic') return 'anthropic'
  if (connection.kind === 'relay' && connection.detectedProtocol === 'gemini') return 'google'
  if (connection.kind === 'relay' && connection.providerId === 'custom-relay') return `custom-${track}`
  return connection.runtimeProviderId || connection.providerId
}

function modelProvider(connection, track, requestOptions) {
  const resolvedProviderId = runtimeProviderId(connection, track)
  const providerDef = getProvider(resolvedProviderId)
  const protocol = providerDef?.[track]?.protocol || providerDef?.chat?.protocol || ''
  return {
    ...connection,
    id: resolvedProviderId,
    providerId: resolvedProviderId,
    track,
    baseUrl: connection.baseUrl || providerDef?.defaults?.baseUrl || '',
    authType: connection.authType || providerDef?.authType,
    apiKey: usableSecret(connection.apiKey) || usableSecret(connection.credentials?.apiKey) || usableSecret(connection.sessionToken) || usableSecret(connection.credentials?.sessionToken),
    sessionToken: usableSecret(connection.sessionToken) || usableSecret(connection.credentials?.sessionToken),
    format: providerDef?.[track]?.format || providerDef?.chat?.format || (protocol === 'gemini' || protocol === 'anthropic' ? protocol : ''),
    pathPrefix: connection.pathPrefix || providerDef?.[track]?.pathPrefix || '',
    modelListPath: connection.detectedEndpoints?.models || connection.modelsPath || providerDef?.[track]?.modelListPath || providerDef?.modelListPath || '',
    reportErrors: true,
    requestOptions
  }
}

function usableSecret(value) {
  return typeof value === 'string' && value && value !== '********' && !value.startsWith('__ENCRYPTED__') ? value : ''
}

function relayProbeDefinitions(baseUrl, apiKey) {
  return [
    {
      protocol: 'openai',
      authType: { type: 'bearer' },
      modelsPath: '/v1/models',
      chatPath: '/v1/chat/completions',
      modelUrl: () => joinCompatibleApiUrl(baseUrl, '/v1/models'),
      chatUrl: () => joinCompatibleApiUrl(baseUrl, '/v1/chat/completions'),
      headers: { ...RELAY_PROBE_HEADERS, Authorization: `Bearer ${apiKey}` },
      body: model => buildMinimalInferenceBody('openai', model)
    },
    {
      protocol: 'anthropic',
      authType: { type: 'header', key: 'x-api-key' },
      modelsPath: '/v1/models',
      chatPath: '/v1/messages',
      modelUrl: () => joinCompatibleApiUrl(baseUrl, '/v1/models'),
      chatUrl: () => joinCompatibleApiUrl(baseUrl, '/v1/messages'),
      headers: { ...RELAY_PROBE_HEADERS, 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: model => buildMinimalInferenceBody('anthropic', model)
    },
    {
      protocol: 'gemini',
      authType: { type: 'query', key: 'key' },
      modelsPath: '/v1beta/models',
      chatPath: '/v1beta/models/{model}:generateContent',
      modelUrl: () => applyQueryParams(joinCompatibleApiUrl(baseUrl, '/v1beta/models'), { key: apiKey }),
      chatUrl: model => applyQueryParams(joinCompatibleApiUrl(baseUrl, `/v1beta/models/${encodeURIComponent(model)}:generateContent`), { key: apiKey }),
      headers: { ...RELAY_PROBE_HEADERS },
      body: model => buildMinimalInferenceBody('gemini', model)
    }
  ]
}

function parseRelayModelDirectory(data, protocol) {
  let json
  try { json = JSON.parse(String(data || '')) } catch { throw new Error('Model directory returned invalid JSON') }
  const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : null
  if (!list?.length) throw new Error('The provider returned no discoverable models')
  const raw = list.map(item => protocol === 'gemini' && isPlainObject(item)
    ? { ...item, id: String(item.name || item.id || '').replace(/^models\//, '') }
    : item)
  const models = raw.map(item => normalizeModelRecord(item, { source: 'remote' })).filter(Boolean)
  if (!models.length) throw new Error('The provider returned no valid model identifiers')
  return models
}

function relayProbeFailure(error, context = {}) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status)
  const details = {
    stage: context.stage === 'inference' ? 'inference' : 'directory',
    statusCode: status || null,
    endpointHost: String(context.endpointHost || ''),
    endpointPath: String(context.endpointPath || ''),
    checkedAt: new Date().toISOString()
  }
  if (status) return { ...details, errorCode: `HTTP_${status}`, message: `HTTP ${status}` }
  const message = String(error?.message || '')
  if (/redirects to a different origin/i.test(message)) return { ...details, errorCode: 'CROSS_ORIGIN_REDIRECT', message: 'Cross-origin redirect rejected' }
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return { ...details, errorCode: 'NETWORK_TIMEOUT', message: 'Network timeout' }
  if (/response is too large/i.test(message)) return { ...details, errorCode: 'RESPONSE_TOO_LARGE', message: 'Response is too large' }
  if (/invalid JSON/i.test(message)) return { ...details, errorCode: 'INVALID_RESPONSE', message }
  if (/no discoverable models|no valid model identifiers/i.test(message)) return { ...details, errorCode: 'EMPTY_MODEL_DIRECTORY', message }
  if (/no assistant output|no valid protocol response|no text model/i.test(message)) return { ...details, errorCode: 'MINIMAL_INFERENCE_FAILED', message }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|network|socket/i.test(message)) return { ...details, errorCode: 'NETWORK_UNAVAILABLE', message: 'Network unavailable' }
  return { ...details, errorCode: 'PROBE_FAILED', message: 'Probe failed' }
}

const NON_TEXT_PROBE_MODEL = /(?:^|[-_.:/])(embedding|embed|rerank|moderation|whisper|tts|speech|audio|image|video|flux|sora)(?:$|[-_.:/])/i

function relayTextProbeCandidates(models) {
  return models
    .filter(model => !['image', 'video', 'other'].includes(model.capability))
    .filter(model => model.capability === 'chat' || !NON_TEXT_PROBE_MODEL.test(model.id || ''))
    .sort((a, b) => Number(b.capability === 'chat') - Number(a.capability === 'chat'))
    .slice(0, 6)
}

class RelayDetectionError extends Error {
  constructor(failures) {
    super(`No supported relay protocol was verified (${failures.map(item => `${item.protocol}: ${item.message}`).join('; ')})`)
    this.name = 'RelayDetectionError'
    this.code = 'RELAY_PROTOCOL_NOT_DETECTED'
    this.failures = failures
  }
}

async function detectRelayProtocol({ baseUrl, apiKey, requestOptions = {}, requestFn = request }) {
  const started = Date.now()
  const safeBase = normalizeRelayBaseUrl(baseUrl)
  if (!usableSecret(apiKey)) throw new Error('Relay API key is required')
  const failures = []
  for (const probe of relayProbeDefinitions(safeBase, apiKey)) {
    let failureContext = { stage: 'directory', endpointHost: endpointHost(safeBase), endpointPath: probe.modelsPath }
    try {
      const directoryResponse = await requestFn(probe.modelUrl(), { method: 'GET', ...requestOptions, headers: probe.headers })
      assertSuccessfulResponse(directoryResponse)
      const parsed = parseRelayModelDirectory(directoryResponse?.data, probe.protocol)
      const candidates = relayTextProbeCandidates(parsed)
      if (!candidates.length) throw new Error('No text model is available for minimal inference')
      let verifiedModel = ''
      let inferenceEvidence = null
      let lastInferenceError = null
      failureContext = { stage: 'inference', endpointHost: endpointHost(safeBase), endpointPath: probe.chatPath }
      for (const candidate of candidates) {
        try {
          const response = await requestFn(probe.chatUrl(candidate.id), {
            method: 'POST', ...requestOptions, headers: { ...probe.headers, 'Content-Type': 'application/json' }
          }, probe.body(candidate.id))
          assertSuccessfulResponse(response)
          inferenceEvidence = analyzeInferenceResponse(probe.protocol, response?.data)
          verifiedModel = candidate.id
          break
        } catch (error) { lastInferenceError = error }
      }
      if (!verifiedModel) throw lastInferenceError || new Error('Minimal inference failed')
      const models = parsed.map(model => model.id === verifiedModel && model.capability === 'unknown'
        ? { ...model, capability: 'chat', routeHint: probe.protocol === 'openai' ? 'openai-chat' : probe.protocol, reason: 'minimal-inference' }
        : model).sort(sortModelRecords('chat'))
      const revision = crypto.randomUUID()
      const checkedAt = new Date().toISOString()
      return {
        detectedProtocol: probe.protocol,
        detectedAt: checkedAt,
        detectedEndpoints: { models: probe.modelsPath, chat: probe.chatPath },
        detectionRevision: revision,
        authType: probe.authType,
        models,
        validation: statusResult({
          ok: true, status: 'verified', level: 'minimal_inference', checkedAt,
          latencyMs: Date.now() - started, endpointHost: endpointHost(safeBase), modelId: verifiedModel,
          evidence: inferenceEvidence.evidence, outputVerified: inferenceEvidence.outputVerified,
          message: inferenceEvidence.outputVerified
            ? `Detected ${probe.protocol} protocol, remote model directory, and minimal text inference output`
            : `Detected ${probe.protocol} protocol and verified a minimal inference response without text output`
        })
      }
    } catch (error) {
      failures.push({ protocol: probe.protocol, ...relayProbeFailure(error, failureContext) })
    }
  }
  throw new RelayDetectionError(failures)
}

function normalizeRelayBaseUrl(baseUrl) {
  const parsed = assertApiBaseUrl(baseUrl)
  parsed.search = ''
  parsed.hash = ''
  let pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  pathname = pathname
    .replace(/\/models\/[^/]+:generateContent$/i, '')
    .replace(/\/(?:chat\/completions|images\/generations|messages|models|responses)$/i, '')
  parsed.pathname = pathname || '/'
  return parsed.href.replace(/\/$/, '')
}

function sameRelayEndpoint(left, right) {
  try { return normalizeRelayBaseUrl(left) === normalizeRelayBaseUrl(right) }
  catch { return false }
}

async function refreshModels({ connection, track: requestedTrackInput, modelsApi, requestOptions }) {
  const capabilities = normalizeCapabilities(connection.capabilities)
  const requestedTrack = TRACKS.includes(requestedTrackInput) ? requestedTrackInput : capabilities[0]
  if (!requestedTrack || !capabilities.includes(requestedTrack)) throw new Error('A supported model refresh track is required')
  const track = requestedTrack
  if (connection.kind === 'api-key' && getValidationStrategy(connection.providerId, track) === VALIDATION_STRATEGIES.UNSUPPORTED) {
    throw new Error('This provider does not expose a reliable remote model directory')
  }
  const provider = modelProvider(connection, track, requestOptions)
  if (!provider.baseUrl) throw new Error('Provider base URL is not configured')
  const auth = buildModelAuth(provider)
  if (auth.requiresCredential && !(auth.usesSession ? provider.sessionToken : provider.apiKey)) {
    throw new Error('Provider credential is not configured')
  }
  const started = Date.now()
  const models = await modelsApi.fetch(provider)
  if (!Array.isArray(models) || models.length === 0) throw new Error('The provider returned no discoverable models')
  return {
    models: models.map(model => ({ ...model, source: 'remote' })),
    result: statusResult({
      ok: true,
      status: 'directory_verified',
      level: 'model_directory',
      latencyMs: Date.now() - started,
      endpointHost: endpointHost(provider.baseUrl),
      message: `Discovered ${models.length} models from the provider for ${track}`
    })
  }
}

function validationErrorCode(message = '') {
  if (/\b401\b|unauthori[sz]ed/i.test(message)) return 'HTTP_401'
  if (/\b403\b|forbidden/i.test(message)) return 'HTTP_403'
  if (/\b404\b|not found/i.test(message)) return 'HTTP_404'
  if (/\b429\b|rate limit/i.test(message)) return 'HTTP_429'
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return 'NETWORK_TIMEOUT'
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|network|socket/i.test(message)) return 'NETWORK_UNAVAILABLE'
  if (/invalid JSON|not valid JSON|empty response|no assistant output|no valid protocol response/i.test(message)) return 'INVALID_RESPONSE'
  return 'VALIDATION_FAILED'
}

function validationError(error, connection, started, secrets = []) {
  const message = redactSecrets(error?.message || 'Connection validation failed', secrets)
  const status = /not configured|required|unsupported|no (?:remotely discovered |discoverable)/i.test(message) ? 'unsupported' : 'error'
  return statusResult({
    ok: false,
    status,
    level: 'none',
    latencyMs: Date.now() - started,
    endpointHost: endpointHost(connection?.baseUrl),
    errorCode: status === 'unsupported' ? 'VALIDATION_UNSUPPORTED' : validationErrorCode(message),
    message
  })
}

async function validateConnection({ connection, track, modelId, modelsApi, requestOptions, requestFn = request, onModels }) {
  const started = Date.now()
  const secrets = SECRET_FIELDS.flatMap(field => [connection[field], connection.credentials?.[field]]).filter(Boolean)
  try {
    if (!normalizeCapabilities(connection.capabilities).includes(track)) throw new Error(`Connection does not declare ${track} capability`)
    const strategy = connection.kind === 'api-key'
      ? getValidationStrategy(connection.providerId, track)
      : null
    if (strategy === VALIDATION_STRATEGIES.UNSUPPORTED) {
      throw new Error('This provider does not support a reliable no-cost validation request')
    }
    const refreshed = await refreshModels({ connection, track, modelsApi, requestOptions })
    if (typeof onModels === 'function') onModels(refreshed.models)
    const trackModels = refreshed.models.filter(item => item.capability === track)
    const selectedModel = modelId || trackModels[0]?.id
    if (modelId && !trackModels.some(item => item.id === modelId)) {
      throw new Error(`Requested ${track} model is not in the remote model inventory`)
    }
    if (track !== 'chat' || strategy === VALIDATION_STRATEGIES.DIRECTORY_ONLY) {
      if (!selectedModel || !trackModels.some(item => item.id === selectedModel)) {
        throw new Error(`No remotely discovered ${track} model is available for validation`)
      }
      return statusResult({
        ok: true,
        status: 'directory_verified',
        level: 'model_directory',
        latencyMs: Date.now() - started,
        endpointHost: endpointHost(connection.baseUrl),
        modelId: selectedModel || '',
        evidence: 'model_directory',
        message: 'Remote model directory verified only; billable generation was not run to avoid billing'
      })
    }
    const candidates = modelId
      ? trackModels.filter(item => item.id === modelId)
      : relayTextProbeCandidates(trackModels)
    if (!candidates.length) throw new Error('No remotely discovered text model is available for minimal inference')
    const provider = modelProvider(connection, 'chat', requestOptions)
    const auth = buildModelAuth(provider)
    const providerId = runtimeProviderId(connection, track)
    const protocol = strategy === VALIDATION_STRATEGIES.GEMINI_GENERATE_CONTENT
      ? 'gemini'
      : strategy === VALIDATION_STRATEGIES.ANTHROPIC_MESSAGES
        ? 'anthropic'
        : strategy === VALIDATION_STRATEGIES.OPENAI_CHAT
          ? 'openai'
          : providerId
    let lastInferenceError = null
    for (const candidate of candidates) {
      try {
        const model = candidate.id
        let url
        const headers = { ...auth.headers, 'Content-Type': 'application/json' }
        let body
        if (protocol === 'google' || protocol === 'gemini') {
          url = applyQueryParams(joinCompatibleApiUrl(provider.baseUrl, `/v1beta/models/${encodeURIComponent(model)}:generateContent`), auth.queryParams)
          body = buildMinimalInferenceBody('gemini', model)
        } else if (protocol === 'anthropic' || protocol === 'claude') {
          url = applyQueryParams(joinCompatibleApiUrl(provider.baseUrl, connection.endpoints?.chat || '/v1/messages'), auth.queryParams)
          headers['anthropic-version'] ||= '2023-06-01'
          body = buildMinimalInferenceBody('anthropic', model)
        } else {
          url = applyQueryParams(joinCompatibleApiUrl(provider.baseUrl, connection.endpoints?.chat || '/v1/chat/completions'), auth.queryParams)
          body = buildMinimalInferenceBody('openai', model)
        }
        const response = await requestFn(url, { method: 'POST', headers, ...requestOptions }, body)
        assertSuccessfulResponse(response)
        const inference = analyzeInferenceResponse(protocol, response?.data)
        return statusResult({
          ok: true,
          status: 'verified',
          level: 'minimal_inference',
          latencyMs: Date.now() - started,
          endpointHost: endpointHost(provider.baseUrl),
          modelId: model,
          evidence: inference.evidence,
          outputVerified: inference.outputVerified,
          message: inference.outputVerified
            ? 'Remote model directory and minimal text inference output verified'
            : 'Remote model directory and minimal inference response verified without text output'
        })
      } catch (error) {
        lastInferenceError = error
      }
    }
    throw lastInferenceError || new Error('Minimal inference failed for every text model candidate')
  } catch (error) {
    return validationError(error, connection, started, secrets)
  }
}

function commandExists(commands = []) {
  for (const command of commands) {
    const executable = process.platform === 'win32' ? 'where.exe' : 'which'
    const result = spawnSync(executable, [command], { windowsHide: true, stdio: 'ignore', timeout: 3000 })
    if (result.status === 0) return true
  }
  return false
}

function credentialMarkerExists(markers = []) {
  const home = os.homedir()
  return markers.some(parts => fs.existsSync(path.join(home, ...parts)))
}

function connectorStatus(connector) {
  if (connector.mode === 'cli') {
    const cliDetected = commandExists(connector.commands)
    const credentialMarkerDetected = credentialMarkerExists(connector.credentialMarkers)
    const detected = cliDetected || credentialMarkerDetected
    return {
      ...connector,
      registrationAvailable: false,
      registrationStatus: 'not_applicable',
      authorizationMode: 'local_detection',
      runtimeAvailable: false,
      ...statusResult({
        ok: false,
        status: detected ? 'detected' : 'not_detected',
        level: detected ? 'local_cli_detected' : 'none',
        errorCode: detected ? '' : 'CLI_NOT_DETECTED',
        message: detected
          ? 'Local CLI or credential marker detected; no token content was read'
          : 'Required local CLI or credential marker was not detected'
      })
    }
  }
  const configured = Boolean(oauthConfiguration(connector))
  const deviceCode = connector.mode === 'device-code'
  return {
    ...connector,
    registrationAvailable: configured,
    registrationStatus: configured ? 'configured' : 'registration_required',
    authorizationMode: deviceCode ? 'device_code' : 'browser_oauth',
    runtimeAvailable: Boolean(connector.runtimeProviderId),
    ...statusResult({
      ok: false,
      status: configured ? 'available' : 'registration_required',
      level: 'none',
      errorCode: configured ? '' : 'OAUTH_CLIENT_NOT_CONFIGURED',
      message: configured
        ? `${deviceCode ? 'Device-code' : 'OAuth'} client is configured and ready to connect`
        : `A complete Gravuresse-owned ${deviceCode ? 'device-code' : 'OAuth'} client registration is required; no third-party client identity will be reused`
    })
  }
}

function oauthConfiguration(connector) {
  const prefix = connector.envPrefix
  const env = name => String(process.env[`${prefix}_${name}`] || '').trim()
  const authorizeUrl = env('AUTHORIZE_URL')
  const tokenUrl = env('TOKEN_URL')
  const clientId = env('CLIENT_ID')
  const deviceUrl = env('DEVICE_URL')
  const apiBaseUrl = env('API_BASE_URL')
  // Never accept a local or non-HTTPS OAuth endpoint.  In particular, a
  // client id alone is not enough to make a connector appear connected.
  if (!clientId || (!authorizeUrl && !deviceUrl) || (!tokenUrl && !deviceUrl)) return null
  for (const value of [authorizeUrl, tokenUrl, deviceUrl, apiBaseUrl].filter(Boolean)) {
    let parsed
    try { parsed = new URL(value) } catch { return null }
    if (parsed.protocol !== 'https:') return null
  }
  return {
    clientId,
    authorizeUrl,
    tokenUrl,
    deviceUrl,
    scope: env('SCOPE'),
    clientSecret: env('CLIENT_SECRET'),
    providerId: connector.providerId || connector.id,
    apiBaseUrl
  }
}

function closeAttemptServer(attempt) {
  if (attempt?.expiryTimer) {
    clearTimeout(attempt.expiryTimer)
    attempt.expiryTimer = null
  }
  if (attempt?.pollTimer) {
    clearTimeout(attempt.pollTimer)
    attempt.pollTimer = null
  }
  if (attempt?.server) {
    attempt.server.close()
    attempt.server = null
  }
}

function retainThenDeleteAttempt(attempt) {
  if (!attempt || attempt.cleanupTimer) return
  attempt.cleanupTimer = setTimeout(() => oauthAttempts.delete(attempt.id), TERMINAL_ATTEMPT_RETENTION_MS)
  attempt.cleanupTimer.unref?.()
}

function expireAttempt(attempt, now = Date.now()) {
  if (!attempt || !['pending', 'exchanging'].includes(attempt.status) || attempt.expiresAt > now) return false
  attempt.status = 'expired'
  attempt.errorCode = 'OAUTH_TIMEOUT'
  attempt.message = 'OAuth attempt expired'
  closeAttemptServer(attempt)
  retainThenDeleteAttempt(attempt)
  return true
}

function createOAuthAttempt(connectorId, now = Date.now()) {
  cancelOAuthAttemptsForConnector(connectorId, {
    errorCode: 'OAUTH_SUPERSEDED',
    message: 'OAuth attempt was superseded by a newer attempt'
  })
  const verifier = crypto.randomBytes(48).toString('base64url')
  const attempt = {
    id: crypto.randomUUID(),
    connectorId,
    state: crypto.randomBytes(24).toString('base64url'),
    verifier,
    challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    status: 'pending',
    createdAt: now,
    expiresAt: now + OAUTH_ATTEMPT_TTL_MS
  }
  oauthAttempts.set(attempt.id, attempt)
  attempt.expiryTimer = setTimeout(() => expireAttempt(attempt), OAUTH_ATTEMPT_TTL_MS)
  attempt.expiryTimer.unref?.()
  return attempt
}

function isAttemptActive(attempt) {
  return Boolean(attempt && ['pending', 'exchanging'].includes(attempt.status) && attempt.expiresAt > Date.now())
}

function cancelOAuthAttempt(attemptOrId, options = {}) {
  const attempt = typeof attemptOrId === 'string' ? oauthAttempts.get(attemptOrId) : attemptOrId
  if (!attempt || !['pending', 'exchanging'].includes(attempt.status)) return false
  attempt.status = 'cancelled'
  attempt.errorCode = options.errorCode || 'OAUTH_CANCELLED'
  attempt.message = options.message || 'OAuth attempt cancelled'
  closeAttemptServer(attempt)
  retainThenDeleteAttempt(attempt)
  return true
}

function cancelOAuthAttemptsForConnector(connectorId, options = {}) {
  let cancelled = 0
  for (const attempt of oauthAttempts.values()) {
    if (attempt.connectorId === connectorId && cancelOAuthAttempt(attempt, options)) cancelled += 1
  }
  return cancelled
}

function oauthForm(data) {
  return new URLSearchParams(Object.entries(data).filter(([, value]) => value !== undefined && value !== '')).toString()
}

function oauthProtocolError(message, source) {
  const error = new Error(message)
  if (Number.isFinite(source?.status)) error.status = source.status
  if (Number.isFinite(source?.statusCode)) error.statusCode = source.statusCode
  if (typeof source?.code === 'string' && /^HTTP_\d{3}$/.test(source.code)) error.code = source.code
  return error
}

async function exchangeOAuthCode(attempt, code, config, requestFn = request) {
  const started = Date.now()
  let response
  try {
    response = await requestFn(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
    }, oauthForm({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: attempt.redirectUri,
      code_verifier: attempt.verifier
    }))
  } catch (error) {
    throw oauthProtocolError('OAuth token exchange request failed', error)
  }
  let json
  try { json = JSON.parse(response?.data || '') } catch { throw new Error('OAuth token response was not valid JSON') }
  const token = json.access_token || json.id_token || json.token
  if (!token) throw new Error('OAuth token response did not contain an access token')
  return { token, refreshToken: json.refresh_token || '', idToken: json.id_token || '', latencyMs: Date.now() - started, endpointHost: endpointHost(config.tokenUrl) }
}

async function refreshOAuthCredential(connector, refreshToken, { requestFn = request, configuration } = {}) {
  const config = configuration || oauthConfiguration(connector)
  if (!config?.tokenUrl || !config.clientId || !refreshToken) throw new Error('OAuth refresh is not configured for this account')
  let response
  try {
    response = await requestFn(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
    }, oauthForm({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret
    }))
  } catch (error) {
    throw oauthProtocolError('OAuth credential refresh request failed', error)
  }
  let json
  try { json = JSON.parse(response?.data || '') } catch { throw new Error('OAuth refresh response was not valid JSON') }
  if (json.error) {
    const knownError = ['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(json.error) ? ` (${json.error})` : ''
    throw new Error(`OAuth credential refresh was rejected by the provider${knownError}`)
  }
  if (!json.access_token) throw new Error('OAuth refresh response did not contain an access token')
  return { token: json.access_token, refreshToken: json.refresh_token || refreshToken, idToken: json.id_token || '' }
}

async function beginOAuthAttempt(connector, { persistAccount, requestFn = request } = {}) {
  const config = oauthConfiguration(connector)
  if (!config) return { ...connectorStatus(connector), status: 'registration_required', errorCode: 'OAUTH_CLIENT_NOT_CONFIGURED' }
  if (connector.mode === 'device-code') return beginDeviceCodeAttempt(connector, { persistAccount, requestFn })
  const attempt = createOAuthAttempt(connector.id)
  attempt.config = config
  const server = http.createServer(async (req, res) => {
    let authorizationCode = ''
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (url.pathname !== '/oauth/callback') { res.statusCode = 404; res.end('Not found'); return }
      expireAttempt(attempt)
      if (attempt.status !== 'pending') { res.statusCode = 409; res.end('This OAuth attempt is no longer active'); return }
      if (url.searchParams.get('state') !== attempt.state) {
        res.statusCode = 400
        res.end('OAuth state mismatch')
        return
      }
      authorizationCode = url.searchParams.get('code') || ''
      if (!authorizationCode) throw new Error(url.searchParams.has('error') ? 'OAuth authorization was rejected by the provider' : 'OAuth callback did not contain a code')
      // Synchronous transition is the exchange lock: a concurrent callback can
      // no longer start a second token exchange.
      attempt.status = 'exchanging'
      const exchanged = await exchangeOAuthCode(attempt, authorizationCode, config, requestFn)
      expireAttempt(attempt)
      if (attempt.status !== 'exchanging') { res.statusCode = 409; res.end('This OAuth attempt is no longer active'); return }
      attempt.level = 'oauth_token_exchange_only'
      attempt.checkedAt = new Date().toISOString()
      attempt.latencyMs = exchanged.latencyMs
      attempt.endpointHost = exchanged.endpointHost
      const persisted = typeof persistAccount === 'function' ? await persistAccount({
        connectorId: connector.id,
        providerId: config.providerId,
        runtimeProviderId: connector.runtimeProviderId || '',
        baseUrl: config.apiBaseUrl || '',
        kind: 'oauth',
        sessionToken: exchanged.token,
        refreshToken: exchanged.refreshToken,
        idToken: exchanged.idToken,
        status: 'connected_unverified',
        validation: { ok: false, status: 'connected_unverified', level: 'oauth_token_exchange_only', checkedAt: attempt.checkedAt, latencyMs: exchanged.latencyMs, endpointHost: exchanged.endpointHost, modelId: '', errorCode: 'ACCOUNT_NOT_VALIDATED', message: 'Token exchange completed; provider validation is still required' }
      }, { isActive: () => attempt.status === 'exchanging' && attempt.expiresAt > Date.now() }) : null
      expireAttempt(attempt)
      if (attempt.status !== 'exchanging') { res.statusCode = 409; res.end('This OAuth attempt is no longer active'); return }
      if (persisted?.status) {
        attempt.status = persisted.status
        attempt.level = persisted.validation?.level || attempt.level
        attempt.message = persisted.validation?.message || ''
        attempt.errorCode = persisted.validation?.errorCode || ''
        attempt.latencyMs = persisted.validation?.latencyMs ?? attempt.latencyMs
        attempt.endpointHost = persisted.validation?.endpointHost || attempt.endpointHost
      }
      res.end('Authorization completed. You can return to Gravuresse.')
    } catch (error) {
      if (!['cancelled', 'expired'].includes(attempt.status)) {
        attempt.status = 'error'
        attempt.errorCode = 'OAUTH_TOKEN_EXCHANGE_FAILED'
        attempt.message = 'OAuth token exchange failed'
      }
      res.statusCode = 400
      res.end('Authorization failed. You can return to Gravuresse.')
    } finally {
      if (!['pending', 'exchanging'].includes(attempt.status)) closeAttemptServer(attempt)
      if (!['pending', 'exchanging'].includes(attempt.status)) retainThenDeleteAttempt(attempt)
    }
  })
  server.on('error', error => {
    if (!isAttemptActive(attempt)) return
    attempt.status = 'error'
    attempt.errorCode = 'OAUTH_CALLBACK_SERVER_FAILED'
    attempt.message = redactSecrets(error?.message || 'OAuth callback server failed')
  })
  await new Promise((resolve, reject) => {
    const onError = error => { server.off('listening', onListening); reject(error) }
    const onListening = () => {
      server.off('error', onError)
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      attempt.redirectUri = `http://127.0.0.1:${port}/oauth/callback`
      if (config.authorizeUrl) {
        const authorization = new URL(config.authorizeUrl)
        authorization.searchParams.set('response_type', 'code')
        authorization.searchParams.set('client_id', config.clientId)
        authorization.searchParams.set('redirect_uri', attempt.redirectUri)
        authorization.searchParams.set('state', attempt.state)
        authorization.searchParams.set('code_challenge', attempt.challenge)
        authorization.searchParams.set('code_challenge_method', 'S256')
        if (config.scope) authorization.searchParams.set('scope', config.scope)
        attempt.authorizationUrl = authorization.toString()
      }
      resolve()
    }
    server.once('listening', onListening)
    server.once('error', onError)
    server.listen(0, '127.0.0.1')
  })
  attempt.server = server
  return publicAttempt(attempt)
}

// GitHub's OAuth device flow protocol and error semantics:
// https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
async function beginDeviceCodeAttempt(connector, { persistAccount, requestFn = request } = {}) {
  const config = oauthConfiguration(connector)
  if (!config?.clientId || !config.deviceUrl || !config.tokenUrl) {
    return { ...connectorStatus(connector), status: 'registration_required', errorCode: 'OAUTH_CLIENT_NOT_CONFIGURED' }
  }
  const attempt = createOAuthAttempt(connector.id)
  try {
    const response = await requestFn(config.deviceUrl, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }
    }, oauthForm({ client_id: config.clientId, scope: config.scope }))
    if (!isAttemptActive(attempt)) return publicAttempt(attempt)
    const payload = JSON.parse(response?.data || '{}')
    if (!payload.device_code || !payload.user_code || !payload.verification_uri) throw new Error('Device authorization response was incomplete')
    const verification = new URL(payload.verification_uri)
    if (verification.protocol !== 'https:') throw new Error('Device verification URL must use HTTPS')
    attempt.deviceCode = payload.device_code
    attempt.userCode = payload.user_code
    attempt.verificationUri = verification.href
    attempt.intervalMs = Math.max(5, Number(payload.interval) || 5) * 1000
    attempt.expiresAt = Math.min(attempt.expiresAt, Date.now() + Math.max(1, Number(payload.expires_in) || 600) * 1000)
    clearTimeout(attempt.expiryTimer)
    attempt.expiryTimer = setTimeout(() => expireAttempt(attempt), Math.max(1, attempt.expiresAt - Date.now()))
    attempt.expiryTimer.unref?.()
    const poll = async () => {
      if (!isAttemptActive(attempt) || expireAttempt(attempt)) return
      attempt.status = 'exchanging'
      try {
        if (!isAttemptActive(attempt)) return
        const tokenResponse = await requestFn(config.tokenUrl, {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }
        }, oauthForm({ client_id: config.clientId, device_code: attempt.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }))
        if (attempt.status !== 'exchanging' || expireAttempt(attempt)) return
        const tokenPayload = JSON.parse(tokenResponse?.data || '{}')
        if (tokenPayload.error === 'authorization_pending' || tokenPayload.error === 'slow_down') {
          if (attempt.status !== 'exchanging') return
          if (tokenPayload.error === 'slow_down') attempt.intervalMs += 5000
          attempt.status = 'pending'
          attempt.pollTimer = setTimeout(poll, attempt.intervalMs)
          attempt.pollTimer.unref?.()
          return
        }
        if (tokenPayload.error) {
          const codes = { expired_token: 'OAUTH_TIMEOUT', access_denied: 'OAUTH_ACCESS_DENIED', device_flow_disabled: 'DEVICE_FLOW_DISABLED' }
          attempt.status = tokenPayload.error === 'expired_token' ? 'expired' : 'error'
          attempt.errorCode = codes[tokenPayload.error] || 'OAUTH_TOKEN_EXCHANGE_FAILED'
          attempt.message = tokenPayload.error === 'access_denied'
            ? 'Device authorization was denied by the provider'
            : tokenPayload.error === 'expired_token'
              ? 'Device authorization expired'
              : 'Device authorization failed at the provider'
          retainThenDeleteAttempt(attempt)
          return
        }
        if (!tokenPayload.access_token) throw new Error('Device token response did not contain an access token')
        if (!isAttemptActive(attempt) || expireAttempt(attempt)) return
        let validation = {
          ok: false,
          status: 'connected_unverified',
          level: 'oauth_token_exchange_only',
          checkedAt: new Date().toISOString(),
          latencyMs: null,
          endpointHost: endpointHost(config.tokenUrl),
          modelId: '',
          errorCode: 'ACCOUNT_NOT_VALIDATED',
          message: 'Device token exchange completed; provider validation is still required'
        }
        if (connector.id === 'copilot') {
          const githubHeaders = { Authorization: `Bearer ${tokenPayload.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Gravuresse' }
          if (!isAttemptActive(attempt)) return
          await requestFn('https://api.github.com/user', { method: 'GET', headers: githubHeaders })
          if (!isAttemptActive(attempt)) return
          const copilot = await requestFn('https://api.github.com/copilot_internal/v2/token', { method: 'GET', headers: githubHeaders })
          if (!isAttemptActive(attempt)) return
          const copilotPayload = JSON.parse(copilot?.data || '{}')
          if (!copilotPayload.token) throw new Error('GitHub account is valid but no usable Copilot token was returned')
          validation = { ok: true, status: 'verified', level: 'copilot_resource', checkedAt: new Date().toISOString(), latencyMs: null, endpointHost: 'api.github.com', modelId: '', errorCode: '', message: 'GitHub identity and Copilot resource verified' }
        }
        if (!isAttemptActive(attempt)) return
        const persisted = await persistAccount?.({ connectorId: connector.id, providerId: connector.providerId, runtimeProviderId: connector.runtimeProviderId || '', baseUrl: config.apiBaseUrl || '', kind: 'oauth', sessionToken: tokenPayload.access_token, refreshToken: tokenPayload.refresh_token || '', status: validation.ok ? 'verified' : 'connected_unverified', validation }, { isActive: () => attempt.status === 'exchanging' && attempt.expiresAt > Date.now() })
        if (!isAttemptActive(attempt)) return
        attempt.status = persisted?.status || 'verified'
        attempt.level = persisted?.validation?.level || validation.level
        attempt.message = persisted?.validation?.message || validation.message
        attempt.checkedAt = validation.checkedAt
        attempt.endpointHost = persisted?.validation?.endpointHost || validation.endpointHost
        retainThenDeleteAttempt(attempt)
      } catch (error) {
        if (!['cancelled', 'expired'].includes(attempt.status)) {
          attempt.status = 'error'; attempt.errorCode = 'DEVICE_FLOW_VALIDATION_FAILED'; attempt.message = 'Device authorization failed'
          retainThenDeleteAttempt(attempt)
        }
      }
    }
    attempt.pollTimer = setTimeout(poll, attempt.intervalMs)
    attempt.pollTimer.unref?.()
    return publicAttempt(attempt)
  } catch (error) {
    attempt.status = 'error'; attempt.errorCode = 'DEVICE_FLOW_START_FAILED'; attempt.message = 'Device authorization failed'
    retainThenDeleteAttempt(attempt)
    return publicAttempt(attempt)
  }
}

function publicAttempt(attempt) {
  if (!attempt) return null
  return {
    id: attempt.id,
    connectorId: attempt.connectorId,
    status: attempt.status,
    createdAt: new Date(attempt.createdAt).toISOString(),
    expiresAt: new Date(attempt.expiresAt).toISOString(),
    errorCode: attempt.errorCode || '',
    message: attempt.message || '',
    ...(attempt.authorizationUrl ? { authorizationUrl: attempt.authorizationUrl } : {}),
    ...(attempt.verificationUri ? { verificationUri: attempt.verificationUri } : {}),
    ...(attempt.userCode ? { userCode: attempt.userCode } : {}),
    ...(attempt.redirectUri ? { redirectUri: attempt.redirectUri } : {}),
    ...(attempt.level ? { level: attempt.level } : {}),
    ...(attempt.checkedAt ? { checkedAt: attempt.checkedAt } : {}),
    ...(Number.isFinite(attempt.latencyMs) ? { latencyMs: attempt.latencyMs } : {}),
    ...(attempt.endpointHost ? { endpointHost: attempt.endpointHost } : {})
  }
}

function cleanupAttempts(now = Date.now()) {
  for (const attempt of oauthAttempts.values()) {
    expireAttempt(attempt, now)
  }
}

module.exports = {
  ACCOUNT_CONNECTORS,
  COLLECTIONS,
  SECRET_FIELDS,
  statusResult,
  sanitizeConnection,
  registryCapabilities,
  authSignature,
  connectionIdentity,
  connectionIdentityMatches,
  mergeConnectionSecret,
  findConnection,
  refreshModels,
  validateConnection,
  detectRelayProtocol,
  normalizeRelayBaseUrl,
  sameRelayEndpoint,
  connectorStatus,
  createOAuthAttempt,
  beginOAuthAttempt,
  beginDeviceCodeAttempt,
  oauthConfiguration,
  exchangeOAuthCode,
  refreshOAuthCredential,
  validationErrorCode,
  publicAttempt,
  cleanupAttempts,
  expireAttempt,
  closeAttemptServer,
  retainThenDeleteAttempt,
  isAttemptActive,
  cancelOAuthAttempt,
  cancelOAuthAttemptsForConnector,
  runtimeProviderId,
  oauthAttempts,
  _test: { normalizeCapabilities, commandExists, credentialMarkerExists, validationError, oauthProtocolError, parseRelayModelDirectory, relayProbeDefinitions, relayProbeFailure, relayTextProbeCandidates, RelayDetectionError }
}
