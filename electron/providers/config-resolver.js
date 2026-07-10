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
  return value && value !== REDACTED_API_KEY ? value : ''
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

  // High-level resolvers
  resolveRuntimeProviderConfig,
  resolveModelFetchConfig
}
