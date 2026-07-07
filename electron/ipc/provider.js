const PROVIDER_ACTIONS = new Set(['chat', 'generate', 'submit', 'poll'])

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function precheckFailed(message) {
  return { ok: false, error: { code: 'PRECHECK_FAILED', message } }
}

function normalizeLegacyChatMessages(messages) {
  const source = Array.isArray(messages?.history)
    ? messages.history
    : Array.isArray(messages)
      ? messages
      : null
  if (!source) return { ok: false, error: new Error('Chat messages must be an array or include a history array') }
  return {
    ok: true,
    messages: source
      .filter(item => isPlainObject(item))
      .map(item => ({
        role: typeof item.role === 'string' && item.role ? item.role : 'user',
        content: typeof item.content === 'string' ? item.content : String(item.content ?? '')
      }))
  }
}

function assertRequestObject(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} request must be an object`)
  return value
}

function registerProviderIpc({
  ipcMain,
  config,
  modelsApi,
  providerPipeline,
  buildProviderImageTestPayload,
  executeProviderCall,
  getProvidersByAction,
  getModelCatalog,
  getProviderCallMode,
  getProviderSetupMode,
  resolveHandler,
  isTemplateConfigurableProvider,
  storedProviderForRequest,
  inferProviderTrack,
  resolveProviderIdByTrack,
  canUseStoredCredentials,
  realSecret,
  credentialsFromProvider,
  applyQueryParams,
  requestOptionsFromConfig,
  getModelFetchProvider
}) {
  ipcMain.handle('provider:call', async (_, params = {}) => {
    if (!isPlainObject(params)) return precheckFailed('Provider call request must be an object.')
    if (!PROVIDER_ACTIONS.has(params.action)) return precheckFailed(`Unsupported provider action: ${params.action || 'missing'}.`)
    return executeProviderCall(params)
  })

  ipcMain.handle('provider:list', async (_, action) => {
    const track = action || 'chat'
    return getProvidersByAction(track).map(p => {
      const nativeExecutable = Boolean(resolveHandler(p[track]?.protocol))
      const templateExecutable = isTemplateConfigurableProvider(p, track)
      const executable = nativeExecutable || templateExecutable
      const integrationStatus = nativeExecutable
        ? (p[track]?.integrationStatus || p.capabilities?.[track]?.integrationStatus || '')
        : templateExecutable
          ? 'custom-template'
          : (p[track]?.integrationStatus || p.capabilities?.[track]?.integrationStatus || '')
      return {
        id: p.id,
        name: p.name,
        platform: p.platform,
        meta: p.meta,
        links: p.links || p.meta?.links || {},
        billing: p.billing || p.meta?.billing || { mode: 'unknown' },
        capabilities: p.capabilities || p.meta?.capabilities || {},
        constraints: p.constraints || p.meta?.constraints || {},
        customizable: p.customizable || p.meta?.customizable || {},
        authType: p.authType || { type: 'bearer' },
        defaultUrl: p.defaults?.baseUrl || '',
        defaultModel: p[track]?.defaultModel || '',
        pathPrefix: p[track]?.pathPrefix || p.pathPrefix || '',
        modelListPath: p[track]?.modelListPath || p.modelListPath || p[track]?.modelsPath || p.modelsPath || '',
        modelCatalog: getModelCatalog(p.id, track),
        protocol: p[track]?.protocol,
        format: p[track]?.format,
        polling: p[track]?.polling === true,
        integrationStatus,
        executable,
        callMode: templateExecutable && !nativeExecutable ? 'custom-api' : getProviderCallMode(p.id, track, executable),
        setupMode: templateExecutable && !nativeExecutable ? 'custom-api' : getProviderSetupMode(p.id, track, executable)
      }
    })
  })

  ipcMain.handle('provider:test', async (_, params = {}) => {
    try {
      const stored = config.load()
      const track = params.track || inferProviderTrack({ id: params.providerId || params.id, protocol: params.protocol })
      const storedProvider = storedProviderForRequest(stored, track, {
        accountId: params.accountId,
        providerId: params.providerId || params.id,
        baseUrl: params.baseUrl,
        model: params.model
      })
      const providerId = resolveProviderIdByTrack(track, params.providerId || params.id || storedProvider.id)
      const providerDef = require('../providers/registry').getProvider(providerId)
      if (!providerDef) return { ok: false, message: 'Unknown provider' }
      if (track === 'image' && params.testMode === 'image') {
        const built = buildProviderImageTestPayload(params, stored)
        if (!built.ok) return { ok: false, message: built.message, code: built.code, details: built.details, warnings: built.warnings }
        const result = await providerPipeline.execute(built.payload)
        if (!result.ok) return { ok: false, message: result.error?.message || 'Image generation test failed' }
        return { ok: true, message: 'Image generation succeeded', imageUrl: result.data }
      }
      if (!providerDef.healthCheck) return { ok: true, message: 'No health check available' }
      const requestedBaseUrl = params.baseUrl || storedProvider.baseUrl || providerDef.defaults.baseUrl
      const sameEndpoint = canUseStoredCredentials(track, { id: params.id || params.providerId || storedProvider.id, baseUrl: requestedBaseUrl }, storedProvider)
      const hasRendererCredential = Boolean(realSecret(params.apiKey || params.credentials?.apiKey) || realSecret(params.sessionToken || params.credentials?.sessionToken))
      const testBaseUrl = hasRendererCredential && params.baseUrl
        ? params.baseUrl
        : sameEndpoint
          ? requestedBaseUrl
          : providerDef.defaults.baseUrl
      const credentials = credentialsFromProvider(!hasRendererCredential && sameEndpoint ? storedProvider : {}, {
        apiKey: params.apiKey || params.credentials?.apiKey,
        sessionToken: params.sessionToken || params.credentials?.sessionToken
      })
      const { resolveAuth } = require('../providers/auth')
      const { request, joinApiUrl } = require('../api/http')
      const auth = resolveAuth(providerDef, credentials, {
        authType: params.authType || storedProvider.authType,
        customAuth: params.customAuth || storedProvider.customAuth
      })
      const url = applyQueryParams(joinApiUrl(testBaseUrl, providerDef.healthCheck.url), auth.queryParams)
      await request(url, {
        method: providerDef.healthCheck.method,
        headers: { ...auth.headers, 'Content-Type': 'application/json' },
        ...requestOptionsFromConfig(stored)
      }, providerDef.healthCheck.body)
      return { ok: true, message: 'Connection successful' }
    } catch (err) {
      return { ok: false, message: require('../providers/pipeline').redactSecrets(err?.message || 'Test failed') }
    }
  })

  ipcMain.handle('api:models', (_, provider) => {
    const stored = config.load()
    return modelsApi.fetch({
      ...getModelFetchProvider(provider),
      reportErrors: provider?.reportErrors === true,
      requestOptions: requestOptionsFromConfig(stored)
    })
  })

  ipcMain.handle('api:chat', async (_, messages, provider) => {
    const normalized = normalizeLegacyChatMessages(messages)
    if (!normalized.ok) throw normalized.error
    const result = await executeProviderCall({
      action: 'chat',
      providerId: provider?.id,
      messages: normalized.messages,
      system: messages?.system || provider?.system || '',
      thinking: messages?.thinking || provider?.thinking || false,
      model: provider?.model,
      baseUrl: provider?.baseUrl,
      accountId: provider?.accountId
    })
    if (!result.ok) throw new Error(result.error?.message || 'Chat failed')
    return result.data
  })

  ipcMain.handle('api:image', async (_, params) => {
    params = assertRequestObject(params, 'Image generation')
    const result = await executeProviderCall({
      action: 'generate',
      providerId: params?.id,
      prompt: params?.prompt, ratio: params?.ratio, resolution: params?.resolution,
      negative_prompt: params?.negative_prompt,
      sourceImageUrl: params?.sourceImageUrl,
      source_image_url: params?.source_image_url,
      model: params?.model,
      baseUrl: params?.baseUrl,
      accountId: params?.accountId
    })
    if (!result.ok) throw new Error(result.error?.message || 'Image generation failed')
    return result.data
  })

  ipcMain.handle('api:video', async (_, params) => {
    params = assertRequestObject(params, 'Video submit')
    const result = await executeProviderCall({
      action: 'submit',
      providerId: params?.id,
      prompt: params?.prompt, ratio: params?.ratio, duration: params?.duration,
      sourceImageUrl: params?.sourceImageUrl,
      model: params?.model,
      baseUrl: params?.baseUrl,
      accountId: params?.accountId
    })
    if (!result.ok) throw new Error(result.error?.message || 'Video submit failed')
    return result.data
  })

  ipcMain.handle('api:video:poll', async (_, taskId, provider) => {
    if (!taskId) throw new Error('Video poll taskId is required')
    const result = await executeProviderCall({
      action: 'poll',
      providerId: provider?.id,
      taskId,
      model: provider?.model,
      baseUrl: provider?.baseUrl,
      accountId: provider?.accountId
    })
    if (!result.ok) throw new Error(result.error?.message || 'Video poll failed')
    return result.data
  })
}

module.exports = { registerProviderIpc }
