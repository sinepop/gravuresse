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
 * Execute a provider action through the unified pipeline.
 *
 * @param {Object} params
 * @param {'chat'|'image'|'video'} params.action - Which capability to use
 * @param {string} params.providerId - Provider id from registry (e.g. 'openai', 'anthropic')
 * @param {Object} [params.credentials] - { apiKey?, cookie?, sessionToken? }
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

  // 3. Resolve protocol and default model from the action config
  const protocol = getProtocol(providerId, action)
  const defaultModel = getDefaultModel(providerId, action)

  // 4. Resolve authentication
  const auth = resolveAuth(providerDef, credentials || {})

  // 5. Resolve handler module by protocol
  const handler = resolveHandler(protocol)
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
    action,
    model: payload.model || defaultModel,
    baseUrl: payload.baseUrl || providerDef.defaults.baseUrl
  }

  // 7. Execute handler
  try {
    const data = await handler(handlerParams)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: { code: 'PROVIDER_ERROR', message: err.message } }
  }
}

module.exports = { execute }
