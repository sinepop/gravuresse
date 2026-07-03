/**
 * Unified execution pipeline for Gravuresse Provider API.
 *
 * Orchestrates: provider lookup → auth resolution → handler dispatch → standardized response.
 *
 * The pipeline resolves both the provider AND the action (chat/image/video)
 * in one call, so the caller only needs { action, providerId, credentials, ...payload }.
 */

const { getProvider, getDefaultModel, getProtocol } = require('./registry')
const { resolveAuth } = require('./auth')
const { resolveHandler } = require('./handler')

/**
 * Redact anything that looks like an API key / bearer token from a string before
 * it leaves the main process for the renderer. Provider error bodies sometimes
 * echo the submitted credential (e.g. "Invalid API key: sk-ant-..."), which would
 * expose the real key if forwarded verbatim. Conservative: prefer over-redaction
 * to never leaking a key.
 */
const KEY_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,            // Anthropic
  /sk-[A-Za-z0-9_-]{20,}/g,                // OpenAI / generic "sk-"
  /Bearer\s+[A-Za-z0-9_.\-]{20,}/gi,       // Authorization header echoes
  /(?:api[_-]?key|secret|token)["'\s:=]+[A-Za-z0-9_\-]{16,}/gi // "api_key":"..." etc.
]
function redactSecrets(text) {
  if (typeof text !== 'string' || !text) return text
  let out = text
  for (const re of KEY_PATTERNS) out = out.replace(re, (m) => `${m.slice(0, Math.min(8, m.length))}…[redacted]`)
  return out
}

function hasTemplatePath(payload = {}, capKey) {
  const template = payload.template || payload.customTemplate || {}
  if (capKey === 'image') return Boolean(template.path || template.submitPath || payload.path || payload.submitPath)
  if (capKey === 'video') return Boolean(template.submitPath || payload.submitPath)
  return false
}

function genericTemplateProtocol(capKey) {
  if (capKey === 'image') return 'custom_image_openai'
  if (capKey === 'video') return 'custom_video_task'
  return ''
}

/**
 * Execute a provider action through the unified pipeline.
 *
 * @param {Object} params
 * @param {'chat'|'image'|'video'} params.action - Which capability to use
 * @param {string} params.providerId - Provider id from registry (e.g. 'openai', 'anthropic')
 * @param {Object} [params.credentials] - { apiKey?, sessionToken? }
 * @param {...*} [params.*] - Action-specific payload (messages, prompt, ratio, etc.)
 * @returns {Promise<{ok: boolean, data?: any, error?: {code: string, message: string}}>}
 */
async function execute(params) {
  const { action, providerId, credentials, ...payload } = params

  // 1. Resolve provider definition
  const providerDef = getProvider(providerId)
  if (!providerDef) {
    return { ok: false, error: { code: 'UNKNOWN_PROVIDER', message: `Unknown provider: ${providerId}` } }
  }

  // 2. Check capability — map actions to provider capability keys
  const actionToCap = { chat: 'chat', generate: 'image', submit: 'video', poll: 'video' }
  const capKey = actionToCap[action]
  if (!capKey || !providerDef[capKey]) {
    return { ok: false, error: { code: 'UNSUPPORTED_ACTION', message: `${providerId} does not support ${action}` } }
  }

  // 3. Resolve protocol and default model from the capability config.
  // Note: registry defs key capabilities by track (chat/image/video), not by
  // action verb, so we must pass the mapped capKey — not the raw action —
  // otherwise generate/submit/poll resolve to null and NO_HANDLER follows.
  const protocol = getProtocol(providerId, capKey)
  const defaultModel = getDefaultModel(providerId, capKey)

  // 4. Resolve authentication
  const auth = resolveAuth(providerDef, credentials || {}, {
    authType: payload.authType,
    customAuth: payload.customAuth
  })

  // 5. Resolve handler module by protocol
  let handler = resolveHandler(protocol)
  if (!handler && hasTemplatePath(payload, capKey)) {
    handler = resolveHandler(genericTemplateProtocol(capKey))
  }
  if (!handler) {
    return {
      ok: false,
      error: {
        code: 'NO_HANDLER',
        message: `No handler for protocol '${protocol}' (${providerId}:${action})`
      }
    }
  }

  // 6. Build handler params with merged defaults
  const handlerParams = {
    ...payload,
    provider: providerDef,
    auth,
    credentials: credentials || {},
    action,
    model: payload.model || defaultModel,
    baseUrl: payload.baseUrl || providerDef.defaults.baseUrl,
    requestOptions: payload.requestOptions || {}
  }

  // 7. Execute handler
  try {
    const data = await handler(handlerParams)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: { code: 'PROVIDER_ERROR', message: redactSecrets(err?.message || 'Provider error') } }
  }
}

module.exports = { execute, redactSecrets }
