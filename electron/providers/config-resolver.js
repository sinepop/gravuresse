/**
 * Centralized main-process provider runtime config resolver.
 *
 * Owns the security-sensitive logic for resolving provider credentials,
 * baseUrl selection, and runtime config from stored configuration + request
 * parameters. Previously scattered across main.js helpers.
 *
 * Security invariants enforced here:
 * - Saved credentials are never paired with a renderer-supplied baseUrl.
 * - Redacted placeholders (REDACTED_API_KEY) never become real credentials.
 * - oauth-placeholder accounts are excluded from credential resolution.
 * - Account track restrictions are enforced via account-resolver.
 * - Only allowlisted payload keys reach provider handlers.
 */

const { canUseStoredCredentials, resolveProviderIdByTrack, storedProviderForRequest } = require('./account-resolver')
const { findConnection } = require('./connections')

const REDACTED_API_KEY = '********'

// Allowlisted renderer payload keys. Only these may pass from IPC params into
// the handler safePayload — never a raw spread of renderer params.
const ALLOWED_PROVIDER_PAYLOAD_KEYS = [
  'messages', 'system', 'thinking', 'model',
  'prompt', 'ratio', 'resolution', 'negative_prompt', 'source_image_id',
  'negativePrompt', 'duration', 'sourceImageUrl', 'source_image_url', 'taskId', 'mode', 'generationMode'
]

// Stored-provider fields that handlers may consume.
const STORED_PROVIDER_PAYLOAD_KEYS = [
  'authType', 'customAuth', 'authConfig', 'template', 'customTemplate', 'generationOptions',
  'pathPrefix', 'modelListPath', 'modelsPath', 'path', 'submitPath', 'pollPath', 'taskIdPath', 'statusPath',
  'videoUrlPath', 'progressPath', 'errorPath', 'imageUrlPath', 'responsePath',
  'body', 'requestBody', 'submitBody', 'pollBody', 'method', 'submitMethod',
  'pollMethod', 'pollInterval'
]

function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

/**
 * Returns non-empty credential value, filtering out redacted placeholders.
 * @returns {string} real credential or ''
 */
function realSecret(value) {
  return value && value !== REDACTED_API_KEY && !String(value).startsWith('__ENCRYPTED__') ? value : ''
}

/**
 * Resolve credentials from a stored provider config, with optional override.
 * Override (renderer-typed) credentials take precedence only when they are
 * real (not redacted).
 */
function credentialsFromProvider(storedProvider = {}, override = {}) {
  return {
    apiKey: realSecret(override.apiKey) || storedProvider.apiKey || '',
    sessionToken: realSecret(override.sessionToken) || storedProvider.sessionToken || ''
  }
}

/**
 * Infer the track (chat/image/video) from a provider config object.
 */
function inferProviderTrack(provider = {}) {
  if (provider.track) return provider.track
  if (['runway_task', 'happyhorse_task'].includes(provider.protocol) || provider.protocol?.includes('video') || provider.id?.includes('vid')) return 'video'
  if (['dalle', 'gemini_img', 'jimeng_img'].includes(provider.id) || provider.protocol?.includes('image') || provider.id?.includes('img')) return 'image'
  return 'chat'
}

/**
 * Get the default baseUrl for a provider from the registry.
 * @param {function} getProvider - registry.getProvider
 */
function defaultProviderBaseUrl(providerId, getProvider) {
  const def = getProvider(providerId)
  return def?.defaults?.baseUrl || ''
}

/**
 * Build request options (timeout) from stored config.
 */
function requestOptionsFromConfig(stored = {}, providerConfig = {}) {
  const timeout = Number(providerConfig.timeout || stored.general?.apiTimeout)
  return Number.isFinite(timeout) && timeout > 0 ? { timeout } : {}
}

function providerAuthType(providerDef = {}, current = {}, storedProvider = {}) {
  const customType = normalizeAuthType(current.customAuth?.type || storedProvider.customAuth?.type)
  if (customType) return customType
  return normalizeAuthType(current.authType?.type || storedProvider.authType?.type || providerDef.authType?.type || 'bearer')
}

function providerRequiresCredential(providerDef = {}, current = {}, storedProvider = {}) {
  return providerAuthType(providerDef, current, storedProvider) !== 'none'
}

function hasTemplatePath(providerConfig = {}, track) {
  const template = providerConfig.template || providerConfig.customTemplate || {}
  if (track === 'image') return Boolean(template.path || template.submitPath || providerConfig.path || providerConfig.submitPath)
  if (track === 'video') return Boolean(template.submitPath || providerConfig.submitPath)
  return false
}

/**
 * @param {function} resolveHandler - handler.resolveHandler
 */
function isTemplateConfigurableProvider(providerDef = {}, track, resolveHandler) {
  if (!['image', 'video'].includes(track) || !providerDef?.[track]) return false
  if (resolveHandler(providerDef[track]?.protocol)) return false
  const custom = providerDef.customizable?.[track] || providerDef.meta?.customizable?.[track] || {}
  const caps = providerDef.capabilities?.[track] || providerDef.meta?.capabilities?.[track] || {}
  return Boolean(custom.baseUrl || custom.model || custom.submitPath || caps.customBaseUrl || caps.customTemplate || caps.relay)
}

/**
 * Build a safe payload for a provider handler, merging only allowlisted keys.
 */
function buildSafePayload(providerConfig, canonicalProviderId, action, params) {
  const safePayload = { providerId: canonicalProviderId, action }
  for (const key of STORED_PROVIDER_PAYLOAD_KEYS) {
    if (Object.hasOwn(providerConfig || {}, key)) safePayload[key] = providerConfig[key]
  }
  for (const key of ALLOWED_PROVIDER_PAYLOAD_KEYS) {
    if (Object.hasOwn(params || {}, key)) safePayload[key] = params[key]
  }
  return safePayload
}

function verifiedTrackInventory(connection = {}, track) {
  const validation = connection.validations?.[track]
  if (!validation || !['verified', 'directory_verified'].includes(validation.status) || validation.ok !== true) return false
  // A validation is only usable when it belongs to the exact connection
  // revision and track that is about to be executed.  Missing revisions are
  // deliberately rejected: otherwise a legacy/static inventory could be
  // mistaken for a freshly fetched remote inventory.
  if (!connection.inventoryRevision || !validation.inventoryRevision || validation.inventoryRevision !== connection.inventoryRevision) return false
  if (validation.track !== track) return false
  if (!['minimal_inference', 'model_directory', 'capability'].includes(validation.level)) return false
  if (!Array.isArray(connection.models) || !connection.models.some(model => model?.source === 'remote' && model?.capability === track)) return false
  return true
}

function canonicalConnectionForRuntime(stored = {}, track, params = {}) {
  const explicitId = String(params.connectionId || '')
  const defaultSelection = stored.connections?.defaults?.[track] || null
  const selection = explicitId
    ? { connectionId: explicitId, modelId: params.model || '' }
    : defaultSelection
  if (!selection?.connectionId) return { selected: false }
  const found = findConnection(stored, selection.connectionId)
  if (!found) return { selected: true, error: { code: 'CONNECTION_NOT_FOUND', message: `Configured ${track} connection was not found.` } }
  const connection = found.connection
  if (!Array.isArray(connection.capabilities) || !connection.capabilities.includes(track)) {
    return { selected: true, error: { code: 'CONNECTION_CAPABILITY_MISMATCH', message: `Configured connection does not support ${track}.` } }
  }
  if (!verifiedTrackInventory(connection, track)) {
    return { selected: true, error: { code: 'CONNECTION_NOT_VERIFIED', message: `Configured ${track} connection does not have a current verified remote inventory.` } }
  }
  const modelId = String(params.model || selection.modelId || '')
  const model = (connection.models || []).find(item => item?.source === 'remote' && item.id === modelId && item.capability === track)
  if (!model) {
    return { selected: true, error: { code: 'MODEL_NOT_VERIFIED', message: `Configured ${track} model is not in this connection's current verified remote inventory.` } }
  }
  return { selected: true, found, connection, modelId }
}

function providerConfigFromConnection(connection, track, modelId) {
  const detectedRuntimeId = connection.kind === 'relay' && track === 'chat' && connection.detectedProtocol === 'anthropic'
    ? 'anthropic'
    : connection.kind === 'relay' && connection.detectedProtocol === 'gemini'
      ? 'google'
      : ''
  const runtimeProviderId = detectedRuntimeId || (connection.kind === 'relay' && connection.providerId === 'custom-relay'
    ? `custom-${track}`
    : (connection.runtimeProviderId || connection.providerId))
  const trackTemplate = connection.template?.[track] || {}
  const compatiblePath = connection.kind === 'relay' && connection.compatibilityMode === 'openai'
    ? (track === 'chat' ? '/v1/chat/completions' : track === 'image' ? '/v1/images/generations' : '')
    : ''
  return {
    ...connection,
    id: runtimeProviderId,
    providerId: runtimeProviderId,
    connectionId: connection.id,
    model: modelId,
    apiKey: connection.apiKey || connection.credentials?.apiKey || connection.sessionToken || connection.credentials?.sessionToken || '',
    sessionToken: connection.sessionToken || connection.credentials?.sessionToken || '',
    modelListPath: connection.detectedEndpoints?.models || connection.modelsPath || connection.modelListPath || '',
    path: connection.detectedEndpoints?.[track] || compatiblePath || connection.endpoints?.[track] || connection.endpoints?.submit || connection.path,
    submitPath: connection.endpoints?.submit || connection.endpoints?.[track] || connection.submitPath,
    pollPath: connection.endpoints?.poll || connection.pollPath,
    template: trackTemplate,
    customTemplate: trackTemplate
  }
}

/**
 * Full runtime provider config resolution for a provider call.
 *
 * Centralizes the scattered inline resolution logic from main.js executeProviderCall.
 * Returns { ok, error?, config? } where config contains:
 *   providerConfig, canonicalProviderId, providerDef, credentials, baseUrl, safePayload
 *
 * @param {object} stored - full stored config (config.load())
 * @param {string} track - 'chat' | 'image' | 'video'
 * @param {object} params - request params from renderer IPC
 * @param {function} getProvider - registry.getProvider
 * @param {function} resolveHandler - handler.resolveHandler
 */
function resolveRuntimeProviderConfig(stored, track, params, getProvider, resolveHandler) {
  const { providerId, action } = params
  const canonical = canonicalConnectionForRuntime(stored, track, params)
  if (canonical.selected) {
    if (canonical.error) return { ok: false, error: canonical.error }
    const providerConfig = providerConfigFromConnection(canonical.connection, track, canonical.modelId)
    const canonicalProviderId = resolveProviderIdByTrack(track, providerConfig.providerId)
    const providerDef = getProvider(canonicalProviderId)
    if (!providerDef) return { ok: false, error: { code: 'UNKNOWN_PROVIDER', message: `Unknown provider: ${canonicalProviderId}` } }
    if (!providerDef[track]) return { ok: false, error: { code: 'UNSUPPORTED_ACTION', message: `${canonicalProviderId} does not support ${track}` } }
    const hasNativeHandler = Boolean(resolveHandler(providerDef[track]?.protocol))
    const canUseTemplateHandler = hasTemplatePath(providerConfig, track) && (track === 'image' || !hasNativeHandler)
    if (!hasNativeHandler && !canUseTemplateHandler) {
      return { ok: false, error: { code: 'PROVIDER_NOT_EXECUTABLE', message: `${providerDef.name || canonicalProviderId} has no executable ${track} handler.` } }
    }
    const baseUrl = providerConfig.baseUrl || defaultProviderBaseUrl(canonicalProviderId, getProvider)
    if (!baseUrl) return { ok: false, error: { code: 'PRECHECK_FAILED', message: 'Base URL is required for this provider.' } }
    return {
      ok: true,
      config: {
        providerConfig,
        canonicalProviderId,
        providerDef,
        credentials: credentialsFromProvider(providerConfig),
        baseUrl,
        safePayload: buildSafePayload(providerConfig, canonicalProviderId, action, { ...params, model: canonical.modelId })
      }
    }
  }
  // Legacy providers/saved*Model values remain readable for migration and
  // display, but can no longer authorize a runtime generation.  A canonical
  // connection must be selected and verified first.
  const legacyProvider = stored.providers?.[track]
  const legacyModel = stored[`saved${track[0].toUpperCase()}${track.slice(1)}Model`]
  if (legacyProvider?.id || legacyModel) {
    return { ok: false, error: { code: 'LEGACY_PROVIDER_UNAVAILABLE', message: `Legacy ${track} provider configuration is unavailable until a verified provider connection is selected.` } }
  }
  const activeProviderConfig = stored.providers?.[track] || {}
  const effectiveActiveProvider = storedProviderForRequest(stored, track, activeProviderConfig)
  const requestedProviderId = resolveProviderIdByTrack(track, providerId)

  const activeProviderId = resolveProviderIdByTrack(track, effectiveActiveProvider.id)
  const requestTargetsActiveProvider = !requestedProviderId || requestedProviderId === activeProviderId
  const activeMatchesRequestedProfile = requestTargetsActiveProvider &&
    (!params.baseUrl || (params.baseUrl || '') === (effectiveActiveProvider.baseUrl || '')) &&
    (!params.model || (params.model || '') === (effectiveActiveProvider.model || ''))
  const hasProfileSelector = Boolean(requestedProviderId && (params.baseUrl || params.model))
  const requestedProfile = hasProfileSelector
    ? storedProviderForRequest(stored, track, { accountId: params.accountId, providerId: requestedProviderId, baseUrl: params.baseUrl, model: params.model })
    : null
  const requestedProfileId = requestedProfile ? resolveProviderIdByTrack(track, requestedProfile.id || requestedProfile.providerId) : ''

  if (requestedProviderId && activeProviderId && !activeMatchesRequestedProfile && (!requestedProfile || requestedProfileId !== requestedProviderId)) {
    return {
      ok: false,
      error: {
        code: 'PROVIDER_CONFIG_SYNC_PENDING',
        message: 'The selected provider profile has not been saved yet. Wait a moment, then try again.'
      }
    }
  }

  const providerConfig = storedProviderForRequest(stored, track, {
    accountId: params.accountId || (!activeMatchesRequestedProfile && requestedProfile ? requestedProfile.accountId : effectiveActiveProvider.accountId),
    providerId: requestedProviderId || activeProviderId,
    baseUrl: params.baseUrl,
    model: params.model
  })

  const canonicalProviderId = resolveProviderIdByTrack(track, providerConfig.id || providerId)
  const providerDef = getProvider(canonicalProviderId)

  if (!providerDef) {
    return { ok: false, error: { code: 'UNKNOWN_PROVIDER', message: `Unknown provider: ${canonicalProviderId}` } }
  }
  if (!providerDef[track]) {
    return { ok: false, error: { code: 'UNSUPPORTED_ACTION', message: `${canonicalProviderId} does not support ${track}` } }
  }

  const hasNativeHandler = Boolean(resolveHandler(providerDef[track]?.protocol))
  const canUseTemplateHandler = hasTemplatePath(providerConfig, track) && (track === 'image' || !hasNativeHandler)
  if (!hasNativeHandler && !canUseTemplateHandler) {
    return {
      ok: false,
      error: {
        code: 'PROVIDER_NOT_EXECUTABLE',
        message: `${providerDef.name || canonicalProviderId} is listed for links and setup guidance, but this build does not include a direct ${track} handler yet. Configure request paths and JSON templates in Advanced, or use a Custom API entry for compatible relay endpoints.`
      }
    }
  }

  const baseUrl = providerConfig.baseUrl || defaultProviderBaseUrl(canonicalProviderId, getProvider)
  if (!baseUrl) {
    return { ok: false, error: { code: 'PRECHECK_FAILED', message: 'Base URL is required for this provider.' } }
  }

  // SECURITY: credentials come from stored config (matched by provider + endpoint).
  // Renderer-supplied baseUrl is never trusted with saved credentials.
  const credentials = credentialsFromProvider(providerConfig)
  const safePayload = buildSafePayload(providerConfig, canonicalProviderId, action, params)

  return {
    ok: true,
    config: {
      providerConfig,
      canonicalProviderId,
      providerDef,
      credentials,
      baseUrl,
      safePayload
    }
  }
}

/**
 * Resolve config for the model list fetch IPC handler.
 *
 * Security: never trusts a renderer-supplied baseUrl with saved credentials.
 * Newly typed plaintext credentials may be tested against the typed endpoint;
 * saved/redacted credentials stay on the stored endpoint.
 *
 * @param {object} provider - renderer-supplied provider object
 * @param {object} storedConfig - loaded config (config.load())
 * @param {function} getProvider - registry.getProvider
 */
function resolveModelFetchConfig(provider, storedConfig, getProvider) {
  const track = inferProviderTrack(provider)
  const stored = storedProviderForRequest(storedConfig, track, provider)

  const providerId = provider.id || stored.id || ''
  const canonicalProviderId = resolveProviderIdByTrack(track, providerId)
  const providerDef = getProvider(canonicalProviderId)

  const sameEndpoint = canUseStoredCredentials(track, { id: providerId, baseUrl: provider.baseUrl || stored.baseUrl || '' }, stored)
  const hasRendererCredential = Boolean(realSecret(provider.apiKey) || realSecret(provider.sessionToken))

  // SECURITY: only use renderer-supplied baseUrl when the renderer also
  // provided fresh (non-redacted) credentials. Otherwise fall back to stored
  // baseUrl (if same endpoint) or the registry default.
  const baseUrl = hasRendererCredential && provider.baseUrl
    ? provider.baseUrl
    : sameEndpoint && stored.baseUrl
      ? stored.baseUrl
      : defaultProviderBaseUrl(canonicalProviderId, getProvider)

  const rendererFields = {
    id: provider.id || stored.id,
    model: provider.model || stored.model,
    protocol: provider.protocol || stored.protocol,
    format: provider.format || stored.format,
    pathPrefix: provider.pathPrefix || stored.pathPrefix || providerDef?.[track]?.pathPrefix || providerDef?.pathPrefix,
    modelListPath: provider.modelListPath || stored.modelListPath || stored.modelsPath || providerDef?.[track]?.modelListPath || providerDef?.modelListPath || providerDef?.[track]?.modelsPath || providerDef?.modelsPath,
    authType: provider.authType || stored.authType || providerDef?.authType
  }

  const credentials = credentialsFromProvider(!hasRendererCredential && sameEndpoint ? stored : {}, provider)

  return {
    ...stored,
    ...rendererFields,
    apiKey: credentials.apiKey,
    sessionToken: credentials.sessionToken,
    customAuth: provider.customAuth || stored.customAuth,
    baseUrl
  }
}

module.exports = {
  // Constants
  REDACTED_API_KEY,
  ALLOWED_PROVIDER_PAYLOAD_KEYS,
  STORED_PROVIDER_PAYLOAD_KEYS,

  // Low-level helpers
  normalizeAuthType,
  realSecret,
  credentialsFromProvider,
  inferProviderTrack,
  defaultProviderBaseUrl,
  requestOptionsFromConfig,
  providerAuthType,
  providerRequiresCredential,
  hasTemplatePath,
  isTemplateConfigurableProvider,
  buildSafePayload,
  verifiedTrackInventory,
  canonicalConnectionForRuntime,
  providerConfigFromConnection,

  // High-level resolvers
  resolveRuntimeProviderConfig,
  resolveModelFetchConfig
}
