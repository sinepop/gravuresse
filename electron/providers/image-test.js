const { getProvider } = require('./registry')
const { validateGenerationRequest } = require('./validation')
const { canUseStoredCredentials, resolveProviderIdByTrack, storedProviderForRequest } = require('./account-resolver')

const REDACTED_API_KEY = '********'

const IMAGE_TEST_TEMPLATE_KEYS = [
  'authType', 'customAuth', 'authConfig', 'template', 'customTemplate', 'generationOptions',
  'pathPrefix', 'modelListPath', 'modelsPath', 'path', 'submitPath', 'pollPath', 'taskIdPath', 'statusPath',
  'videoUrlPath', 'progressPath', 'errorPath', 'imageUrlPath', 'responsePath',
  'body', 'requestBody', 'submitBody', 'pollBody', 'method', 'submitMethod',
  'pollMethod', 'pollInterval'
]

function realSecret(value) {
  return value && value !== REDACTED_API_KEY && !String(value).startsWith('__ENCRYPTED__') ? value : ''
}

function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

function providerAuthType(providerDef = {}, current = {}, storedProvider = {}) {
  const customType = normalizeAuthType(current.customAuth?.type || storedProvider.customAuth?.type)
  if (customType) return customType
  return normalizeAuthType(current.authType?.type || storedProvider.authType?.type || providerDef.authType?.type || 'bearer')
}

function providerRequiresCredential(providerDef = {}, current = {}, storedProvider = {}) {
  return providerAuthType(providerDef, current, storedProvider) !== 'none'
}

function requestOptionsFromConfig(stored = {}, providerConfig = {}, params = {}) {
  const timeout = Number(params.timeout || providerConfig.timeout || stored.general?.apiTimeout)
  return Number.isFinite(timeout) && timeout > 0 ? { timeout } : {}
}

function validationError(validation) {
  return {
    ok: false,
    code: 'PRECHECK_FAILED',
    message: validation.errors.map(item => item.suggestion ? `${item.message} ${item.suggestion}` : item.message).join('\n'),
    details: validation.errors,
    warnings: validation.warnings
  }
}

function buildProviderImageTestPayload(params = {}, stored = {}) {
  const track = 'image'
  const storedProvider = storedProviderForRequest(stored, track, {
    accountId: params.accountId,
    providerId: params.providerId || params.id,
    baseUrl: params.baseUrl,
    model: params.model
  })
  const providerId = resolveProviderIdByTrack(track, params.providerId || params.id || storedProvider.id)
  const providerDef = getProvider(providerId)
  if (!providerDef) return { ok: false, code: 'UNKNOWN_PROVIDER', message: 'Unknown provider' }

  const requestedBaseUrl = params.baseUrl || storedProvider.baseUrl || providerDef.defaults?.baseUrl || ''
  if (!requestedBaseUrl) return { ok: false, code: 'PRECHECK_FAILED', message: 'Base URL is required for image testing.' }

  const rendererCredentials = {
    apiKey: realSecret(params.apiKey || params.credentials?.apiKey),
    sessionToken: realSecret(params.sessionToken || params.credentials?.sessionToken)
  }
  const hasRendererCredential = Boolean(rendererCredentials.apiKey || rendererCredentials.sessionToken)
  const sameEndpoint = canUseStoredCredentials(track, { id: params.id || params.providerId || storedProvider.id, baseUrl: requestedBaseUrl }, storedProvider)
  const credentials = hasRendererCredential
    ? rendererCredentials
    : sameEndpoint
      ? { apiKey: storedProvider.apiKey || '', sessionToken: storedProvider.sessionToken || '' }
      : { apiKey: '', sessionToken: '' }

  if (!credentials.apiKey && !credentials.sessionToken && providerRequiresCredential(providerDef, params, storedProvider)) {
    return { ok: false, code: 'PRECHECK_FAILED', message: 'Provider credentials are required for image testing.' }
  }

  const providerConfigForTemplate = hasRendererCredential ? { ...storedProvider, ...params } : storedProvider
  const payload = {
    action: 'generate',
    providerId,
    credentials,
    baseUrl: hasRendererCredential ? requestedBaseUrl : (sameEndpoint ? requestedBaseUrl : storedProvider.baseUrl || providerDef.defaults?.baseUrl || ''),
    model: params.model || storedProvider.model || providerDef.image?.defaultModel,
    prompt: params.prompt || 'A simple red square icon on a clean white background.',
    ratio: params.ratio || '1:1',
    resolution: params.resolution || '1024',
    negative_prompt: params.negative_prompt || params.negativePrompt || '',
    requestOptions: requestOptionsFromConfig(stored, storedProvider, params)
  }

  for (const key of IMAGE_TEST_TEMPLATE_KEYS) {
    if (Object.hasOwn(providerConfigForTemplate || {}, key)) payload[key] = providerConfigForTemplate[key]
  }

  const validation = validateGenerationRequest(track, providerDef, payload)
  if (!validation.ok) return validationError(validation)
  Object.assign(payload, validation.options)
  return { ok: true, payload, providerDef }
}

module.exports = {
  buildProviderImageTestPayload,
  _test: {
    canUseStoredCredentials,
    storedProviderForRequest,
    realSecret
  }
}
