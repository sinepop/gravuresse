const {
  ACCOUNT_CONNECTORS,
  COLLECTIONS,
  sanitizeConnection,
  mergeConnectionSecret,
  findConnection,
  refreshModels,
  validateConnection,
  detectRelayProtocol,
  normalizeRelayBaseUrl,
  sameRelayEndpoint,
  connectionIdentity,
  SECRET_FIELDS,
  connectorStatus,
  runtimeProviderId,
  beginOAuthAttempt,
  refreshOAuthCredential,
  validationErrorCode,
  publicAttempt,
  cleanupAttempts,
  oauthAttempts,
  cancelOAuthAttempt,
  cancelOAuthAttemptsForConnector
} = require('../providers/connections')
const { redactSecrets } = require('../providers/pipeline')

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

async function mutateConfig(config, mutator) {
  if (typeof config.update === 'function') return config.update(mutator)
  const next = mutator(config.load())
  await config.save(next)
  return next
}

function createExclusiveRunner() {
  const queues = new Map()
  return (key, task) => {
    const previous = queues.get(key) || Promise.resolve()
    const current = previous.catch(() => {}).then(task)
    queues.set(key, current)
    return current.finally(() => {
      if (queues.get(key) === current) queues.delete(key)
    })
  }
}

function publicConnections(config, stored) {
  return config.redactApiKeys({ connections: stored.connections }).connections
}

function publicConnection(config, connection) {
  const redacted = config.redactApiKeys({ connections: { accounts: [], apiKeys: [connection], relays: [], defaults: {} } })
  return redacted.connections.apiKeys[0]
}

function requestOptionsFor(requestOptionsFromConfig, stored, connection) {
  return typeof requestOptionsFromConfig === 'function' ? requestOptionsFromConfig(stored, connection) : {}
}

function connectionSecrets(connection = {}) {
  return SECRET_FIELDS.flatMap(field => [connection[field], connection.credentials?.[field]]).filter(value => typeof value === 'string' && value && value !== '********')
}

function refreshTrack(connection, requested) {
  const capabilities = Array.isArray(connection.capabilities) ? connection.capabilities : []
  if (requested && capabilities.includes(requested)) return requested
  return capabilities[0] || ''
}

function connectorWithStoredAccount(config, stored, connector) {
  const base = connectorStatus(connector)
  if (connector.mode === 'cli') return base
  const account = (stored.connections?.accounts || []).find(item => item.connectorId === connector.id)
  if (!account) return base
  const publicAccount = publicConnection(config, account)
  const runtimeAvailable = Boolean(account.runtimeProviderId || connector.runtimeProviderId)
  return {
    ...base,
    connectionId: account.id,
    runtimeAvailable,
    status: runtimeAvailable
      ? (account.status || (account.validation?.ok ? 'verified' : 'connected_unverified'))
      : 'authenticated_unavailable',
    ok: runtimeAvailable && account.validation?.ok === true,
    level: account.validation?.level || 'oauth_token_exchange_only',
    checkedAt: account.validation?.checkedAt || account.updatedAt || '',
    latencyMs: account.validation?.latencyMs ?? null,
    endpointHost: account.validation?.endpointHost || '',
    modelId: account.validation?.modelId || '',
    errorCode: runtimeAvailable ? (account.validation?.errorCode || '') : 'ACCOUNT_RUNTIME_UNAVAILABLE',
    message: runtimeAvailable
      ? (account.validation?.message || 'Account credential is stored but has not passed provider validation')
      : 'Account authentication completed, but this connector has no executable provider mapping',
    account: publicAccount
  }
}

function refreshFailure(error, connection, track) {
  return {
    ok: false,
    status: /not configured|required|unsupported|no (?:remotely discovered |discoverable)/i.test(error?.message || '') ? 'unsupported' : 'error',
    level: 'none',
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    endpointHost: (() => { try { return new URL(connection.baseUrl).host } catch { return '' } })(),
    modelId: '',
    errorCode: validationErrorCode(error?.message || '') === 'VALIDATION_FAILED' ? 'MODEL_REFRESH_FAILED' : validationErrorCode(error?.message || ''),
    track,
    inventoryRevision: connection.revision || '',
    message: redactSecrets(error?.message || 'Model refresh failed', connectionSecrets(connection))
  }
}

function sameRevision(current, snapshot) {
  return Boolean(current && snapshot && current.revision === snapshot.revision && connectionIdentity(current) === connectionIdentity(snapshot))
}

function removeConnectionReferences(config, connectionId) {
  for (const track of ['chat', 'image', 'video']) {
    if (config.connections?.defaults?.[track]?.connectionId === connectionId) config.connections.defaults[track] = null
    if (config.providers?.[track]?.connectionId === connectionId) {
      delete config.providers[track].connectionId
      config.providers[track].model = ''
      config[`saved${track[0].toUpperCase()}${track.slice(1)}Model`] = ''
    }
  }
}

async function saveDetectedRelay({ params, config, requestOptionsFromConfig, relayDetector }) {
  const input = isPlainObject(params.connection) ? params.connection : {}
  const id = String(input.id || '').trim()
  const baseUrl = String(input.baseUrl || '').trim()
  const current = config.load()
  const existing = (current.connections?.relays || []).find(item => item.id === id) || null
  const submittedKey = typeof input.apiKey === 'string' ? input.apiKey : ''
  const sameEndpoint = existing && sameRelayEndpoint(existing.baseUrl, baseUrl)
  const apiKey = submittedKey && submittedKey !== config.REDACTED_API_KEY
    ? submittedKey
    : sameEndpoint ? existing.apiKey || existing.credentials?.apiKey || '' : ''
  let candidate
  try {
    if (Buffer.byteLength(apiKey, 'utf8') > 16 * 1024) throw new Error('Relay API key is too large')
    candidate = sanitizeConnection({ id, baseUrl: normalizeRelayBaseUrl(baseUrl), apiKey, compatibilityMode: 'openai' }, 'relays')
    const detected = await relayDetector({
      baseUrl: candidate.baseUrl,
      apiKey: candidate.apiKey,
      requestOptions: requestOptionsFor(requestOptionsFromConfig, current, candidate)
    })
    const revision = detected.detectionRevision
    const capabilities = [...new Set(['chat', ...(detected.models || []).map(model => model.capability)])]
      .filter(track => ['chat', 'image', 'video'].includes(track))
    const chatValidation = { ...detected.validation, track: 'chat', inventoryRevision: revision }
    const validations = { chat: chatValidation }
    for (const track of capabilities.filter(track => track !== 'chat')) {
      const model = detected.models.find(item => item.capability === track)
      validations[track] = {
        ok: true, status: 'directory_verified', level: 'model_directory', checkedAt: detected.detectedAt,
        latencyMs: detected.validation.latencyMs, endpointHost: detected.validation.endpointHost,
        modelId: model?.id || '', errorCode: '', track, inventoryRevision: revision,
        message: `Remote directory explicitly declares ${track} output capability; billable generation was not run`
      }
    }
    const committed = {
      ...candidate,
      providerId: 'custom-relay',
      name: new URL(candidate.baseUrl).host,
      detectedProtocol: detected.detectedProtocol,
      detectedAt: detected.detectedAt,
      detectedEndpoints: detected.detectedEndpoints,
      detectionRevision: revision,
      authType: detected.authType,
      capabilities,
      models: detected.models,
      revision,
      inventoryRevision: revision,
      validation: chatValidation,
      validations,
      updatedAt: new Date().toISOString()
    }
    delete committed.compatibilityMode
    await mutateConfig(config, stored => {
      const next = JSON.parse(JSON.stringify(stored))
      next.connections ||= { accounts: [], apiKeys: [], relays: [], defaults: { chat: null, image: null, video: null } }
      for (const collection of COLLECTIONS.filter(item => item !== 'relays')) {
        if ((next.connections[collection] || []).some(item => item.id === id)) throw new Error('Connection ids must be unique across all collections')
      }
      const list = Array.isArray(next.connections.relays) ? next.connections.relays : []
      const index = list.findIndex(item => item.id === id)
      if (index >= 0) list[index] = committed
      else list.push(committed)
      next.connections.relays = list
      return next
    })
    return {
      connection: publicConnection(config, committed),
      modelsResult: chatValidation,
      modelsResults: validations,
      detectionResult: chatValidation,
      detection: {
        protocol: detected.detectedProtocol,
        modelCount: detected.models.length,
        checkedAt: detected.detectedAt,
        endpointHost: detected.validation.endpointHost,
        latencyMs: detected.validation.latencyMs
      }
    }
  } catch (error) {
    const failure = refreshFailure(error, candidate || { id, baseUrl, apiKey }, 'chat')
    if (!candidate) Object.assign(failure, {
      protocol: 'unknown', stage: 'normalize', statusCode: null, endpointPath: '',
      checkedAt: failure.checkedAt
    })
    if (error?.code === 'RELAY_PROTOCOL_NOT_DETECTED') failure.errorCode = error.code
    if (Array.isArray(error?.failures)) {
      failure.failures = error.failures.map(item => ({
        protocol: ['openai', 'anthropic', 'gemini'].includes(item?.protocol) ? item.protocol : 'unknown',
        stage: item?.stage === 'inference' ? 'inference' : 'directory',
        statusCode: Number.isInteger(item?.statusCode) ? item.statusCode : null,
        endpointHost: /^[a-z0-9.-]+(?::\d+)?$/i.test(String(item?.endpointHost || '')) ? item.endpointHost : '',
        endpointPath: /^\/[A-Za-z0-9._~!$&'()*+,;=:@{}/-]*$/.test(String(item?.endpointPath || '')) ? item.endpointPath : '',
        checkedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item?.checkedAt || '')) ? item.checkedAt : failure.checkedAt,
        errorCode: /^[A-Z0-9_]+$/.test(String(item?.errorCode || '')) ? item.errorCode : 'PROBE_FAILED',
        message: redactSecrets(String(item?.message || 'Probe failed').slice(0, 256), [apiKey])
      }))
      const primary = failure.failures[0]
      if (primary) Object.assign(failure, primary, { errorCode: primary.errorCode })
    }
    return {
      connection: existing ? publicConnection(config, existing) : publicConnection(config, candidate || { id, baseUrl }),
      modelsResult: failure,
      modelsResults: { chat: failure },
      detectionResult: failure,
      detection: null
    }
  }
}

function registerProviderConnectionsIpc({ ipcMain, config, modelsApi, requestOptionsFromConfig, relayDetector = detectRelayProtocol }) {
  const runExclusive = createExclusiveRunner()
  ipcMain.handle('providerConnection:list', () => {
    const stored = config.load()
    return {
      connections: publicConnections(config, stored),
      accountConnectors: ACCOUNT_CONNECTORS.map(connector => connectorWithStoredAccount(config, stored, connector))
    }
  })

  ipcMain.handle('providerConnection:save', async (_, params = {}) => {
    const collection = params.collection
    if (!COLLECTIONS.includes(collection)) throw new Error('Unknown connection collection')
    if (collection === 'relays') {
      const id = String(params.connection?.id || '')
      return runExclusive(`relay-save:${id}`, () => saveDetectedRelay({ params, config, requestOptionsFromConfig, relayDetector }))
    }
    let saved
    const stored = await mutateConfig(config, current => {
      const next = JSON.parse(JSON.stringify(current))
      next.connections ||= { accounts: [], apiKeys: [], relays: [], defaults: { chat: null, image: null, video: null } }
      const list = Array.isArray(next.connections[collection]) ? next.connections[collection] : []
      const normalized = sanitizeConnection(params.connection, collection)
      if (collection === 'accounts') {
        delete normalized.credentials
        for (const field of ['apiKey', 'sessionToken', 'token', 'accessKey', 'secretKey', 'refreshToken', 'idToken', 'oauthToken']) {
          delete normalized[field]
        }
      }
      const index = list.findIndex(item => item.id === normalized.id)
      for (const otherCollection of COLLECTIONS) {
        if (otherCollection !== collection && (next.connections[otherCollection] || []).some(item => item.id === normalized.id)) {
          throw new Error('Connection ids must be unique across all collections')
        }
      }
      const existing = index >= 0 ? list[index] : null
      const merged = mergeConnectionSecret(existing, normalized, config.REDACTED_API_KEY)
      // Remote inventories and validation are main-process-owned and are
      // invalidated by every saved connection revision.
      merged.models = Array.isArray(existing?.models) ? existing.models : []
      merged.validation = null
      merged.validations = {}
      delete merged.inventoryRevision
      if (index >= 0) list[index] = merged
      else list.push(merged)
      next.connections[collection] = list
      saved = merged
      return next
    })

    let modelsResult = null
    const modelsResults = {}
    if (collection !== 'accounts') {
      const tracks = params.track ? [refreshTrack(saved, params.track)] : [...(saved.capabilities || [])]
      for (const track of tracks.filter(Boolean)) try {
        const refreshed = await refreshModels({
          connection: saved,
          track,
          modelsApi,
          requestOptions: requestOptionsFor(requestOptionsFromConfig, stored, saved)
        })
        const verified = { ...refreshed.result, track, inventoryRevision: saved.revision }
        let applied = false
        await mutateConfig(config, current => {
          const next = JSON.parse(JSON.stringify(current))
          const list = next.connections?.[collection] || []
          const item = list.find(connection => connection.id === saved.id)
          if (sameRevision(item, saved)) {
            item.models = [
              ...(item.models || []).filter(model => model.capability !== track),
              ...refreshed.models.filter(model => model.capability === track)
            ]
            item.inventoryRevision = saved.revision
            item.validation = verified
            item.validations = { ...(item.validations || {}), [track]: verified }
            applied = true
          }
          return next
        })
        modelsResults[track] = applied ? verified : refreshFailure(new Error('Connection changed while models were refreshing; stale result was discarded'), saved, track)
      } catch (error) {
        modelsResults[track] = refreshFailure(error, saved, track)
        await mutateConfig(config, current => {
          const next = JSON.parse(JSON.stringify(current))
          const item = next.connections?.[collection]?.find(connection => connection.id === saved.id)
          if (sameRevision(item, saved)) {
            item.validation = modelsResults[track]
            item.validations = { ...(item.validations || {}), [track]: modelsResults[track] }
            item.models = (item.models || []).filter(model => model.capability !== track)
          }
          return next
        })
      }
      modelsResult = modelsResults[params.track || saved.capabilities?.[0]] || Object.values(modelsResults)[0] || null
    }
    const currentSaved = findConnection(config.load(), saved.id)?.connection || saved
    return { connection: publicConnection(config, currentSaved), modelsResult, modelsResults }
  })

  ipcMain.handle('providerConnection:remove', async (_, params = {}) => {
    const collection = params.collection
    const id = String(params.id || '')
    if (!COLLECTIONS.includes(collection) || !id) throw new Error('Connection collection and id are required')
    await mutateConfig(config, current => {
      const next = JSON.parse(JSON.stringify(current))
      next.connections[collection] = (next.connections?.[collection] || []).filter(item => item.id !== id)
      removeConnectionReferences(next, id)
      return next
    })
    return { ok: true }
  })

  ipcMain.handle('providerModels:refresh', (_, params = {}) => runExclusive(String(params.connectionId || ''), async () => {
    const stored = config.load()
    const found = findConnection(stored, String(params.connectionId || ''))
    if (!found) throw new Error('Provider connection was not found')
    const track = refreshTrack(found.connection, params.track)
    try {
      const refreshed = await refreshModels({
        connection: found.connection,
        track,
        modelsApi,
        requestOptions: requestOptionsFor(requestOptionsFromConfig, stored, found.connection)
      })
      const result = { ...refreshed.result, track, inventoryRevision: found.connection.revision || '' }
      let applied = false
      await mutateConfig(config, current => {
        const next = JSON.parse(JSON.stringify(current))
        const item = next.connections[found.collection].find(connection => connection.id === found.connection.id)
        if (sameRevision(item, found.connection)) {
          item.models = [
            ...(item.models || []).filter(model => model.capability !== track),
            ...refreshed.models.filter(model => model.capability === track)
          ]
          item.inventoryRevision = found.connection.revision || ''
          item.validation = result
          item.validations = { ...(item.validations || {}), [track]: result }
          applied = true
        }
        return next
      })
      if (!applied) throw new Error('Connection changed while models were refreshing; stale result was discarded')
      return { models: refreshed.models, result }
    } catch (error) {
      const result = refreshFailure(error, found.connection, track)
      await mutateConfig(config, current => {
        const next = JSON.parse(JSON.stringify(current))
        const item = next.connections?.[found.collection]?.find(connection => connection.id === found.connection.id)
        if (sameRevision(item, found.connection)) {
          item.validation = result
          item.validations = { ...(item.validations || {}), [track]: result }
          item.models = (item.models || []).filter(model => model.capability !== track)
        }
        return next
      })
      return { models: [], result }
    }
  }))

  ipcMain.handle('providerValidation:run', (_, params = {}) => runExclusive(String(params.connectionId || ''), async () => {
    const track = String(params.track || '')
    if (!['chat', 'image', 'video'].includes(track)) throw new Error('A valid validation track is required')
    const stored = config.load()
    const found = findConnection(stored, String(params.connectionId || ''))
    if (!found) throw new Error('Provider connection was not found')
    let refreshedModels = null
    let connection = found.connection
    let result = await validateConnection({
      connection,
      track,
      modelId: String(params.modelId || ''),
      modelsApi,
      requestOptions: requestOptionsFor(requestOptionsFromConfig, stored, connection),
      onModels: models => { refreshedModels = models }
    })
    const authFailure = !result.ok && ['HTTP_401', 'HTTP_403'].includes(result.errorCode)
    if (found.collection === 'accounts' && authFailure && connection.refreshToken && connection.connectorId) {
      const connector = ACCOUNT_CONNECTORS.find(item => item.id === connection.connectorId)
      try {
        const refreshed = await refreshOAuthCredential(connector, connection.refreshToken)
        connection = { ...connection, sessionToken: refreshed.token, refreshToken: refreshed.refreshToken, ...(refreshed.idToken ? { idToken: refreshed.idToken } : {}) }
        await mutateConfig(config, current => {
          const next = JSON.parse(JSON.stringify(current))
          const item = next.connections?.accounts?.find(candidate => candidate.id === found.connection.id)
          if (sameRevision(item, found.connection)) {
            item.sessionToken = refreshed.token
            item.refreshToken = refreshed.refreshToken
            if (refreshed.idToken) item.idToken = refreshed.idToken
          }
          return next
        })
        refreshedModels = null
        result = await validateConnection({
          connection,
          track,
          modelId: String(params.modelId || ''),
          modelsApi,
          requestOptions: requestOptionsFor(requestOptionsFromConfig, stored, connection),
          onModels: models => { refreshedModels = models }
        })
      } catch (error) {
        result = {
          ok: false, status: 'error', level: 'none', checkedAt: new Date().toISOString(), latencyMs: null,
          endpointHost: result.endpointHost || '', modelId: '', errorCode: 'OAUTH_REFRESH_FAILED',
          message: redactSecrets(error?.message || 'OAuth token refresh failed', connectionSecrets(connection))
        }
      }
    }
    let applied = false
    await mutateConfig(config, current => {
      const next = JSON.parse(JSON.stringify(current))
      const item = next.connections[found.collection].find(connection => connection.id === found.connection.id)
      if (sameRevision(item, found.connection)) {
        const stamped = { ...result, track, inventoryRevision: found.connection.revision || '' }
        item.validation = stamped
        item.validations = { ...(item.validations || {}), [track]: stamped }
        if (found.collection === 'accounts') item.status = result.ok ? 'verified' : 'connected_unverified'
        if (refreshedModels) {
          item.models = [
            ...(item.models || []).filter(model => model.capability !== track),
            ...refreshedModels.filter(model => model.capability === track)
          ]
          item.inventoryRevision = found.connection.revision || ''
        }
        applied = true
      }
      return next
    })
    if (!applied) return refreshFailure(new Error('Connection changed while validation was running; stale result was discarded'), found.connection, track)
    return { ...result, track, inventoryRevision: found.connection.revision || '' }
  }))

  ipcMain.handle('providerDefaults:save', async (_, params = {}) => {
    const defaults = isPlainObject(params.defaults) ? params.defaults : params
    let normalized
    await mutateConfig(config, current => {
      const next = JSON.parse(JSON.stringify(current))
      normalized = { ...(next.connections?.defaults || { chat: null, image: null, video: null }) }
      for (const track of ['chat', 'image', 'video']) {
        if (!Object.hasOwn(defaults, track)) continue
        const selection = defaults[track]
        if (selection == null) { normalized[track] = null; continue }
        const found = findConnection(next, String(selection.connectionId || ''))
        if (!found) throw new Error(`Default ${track} connection was not found`)
        if (!(found.connection.capabilities || []).includes(track)) throw new Error(`Connection does not support ${track}`)
        const model = (found.connection.models || []).find(item => item.id === selection.modelId && item.source === 'remote')
        const validation = found.connection.validations?.[track]
        const allowedStatus = track === 'chat' ? validation?.status === 'verified' : ['verified', 'directory_verified'].includes(validation?.status)
        if (!validation?.ok || !allowedStatus || validation.track !== track || validation.inventoryRevision !== found.connection.inventoryRevision || validation.inventoryRevision !== found.connection.revision) {
          throw new Error(`Default ${track} connection must have a current verified remote inventory`)
        }
        if (track === 'chat' && validation.level !== 'minimal_inference') {
          throw new Error('Default chat connection must pass minimal inference validation')
        }
        if (track !== 'chat' && !['model_directory', 'capability'].includes(validation.level)) {
          throw new Error(`Default ${track} connection must pass a non-billable capability validation`)
        }
        if (!model || model.capability !== track) {
          throw new Error(`Default ${track} model must come from the verified remote model list`)
        }
        normalized[track] = {
          connectionId: found.connection.id,
          providerId: found.connection.providerId,
          modelId: model.id
        }
      }
      next.connections.defaults = normalized
      for (const track of ['chat', 'image', 'video']) {
        const selection = normalized[track]
        if (!selection) {
          if (next.providers?.[track]) {
            delete next.providers[track].connectionId
            next.providers[track].model = ''
          }
          next[`saved${track[0].toUpperCase()}${track.slice(1)}Model`] = ''
          continue
        }
        const found = findConnection(next, selection.connectionId)
        if (!found) continue
        next.providers ||= {}
        next.providers[track] = {
          ...next.providers[track],
          id: runtimeProviderId(found.connection, track),
          connectionId: found.connection.id,
          baseUrl: found.connection.baseUrl,
          model: selection.modelId
        }
        next[`saved${track[0].toUpperCase()}${track.slice(1)}Model`] = selection.modelId
      }
      return next
    })
    return normalized
  })

  ipcMain.handle('providerAuth:begin', async (_, params = {}) => {
    const connector = ACCOUNT_CONNECTORS.find(item => item.id === params.connectorId)
    if (!connector) throw new Error('Unknown account connector')
    if (connector.mode === 'cli') return connectorStatus(connector)
    return beginOAuthAttempt(connector, {
      persistAccount: async (account, lifecycle = {}) => {
        const savedAccount = {
          id: `account_${connector.id}`,
          connectorId: account.connectorId,
          providerId: account.providerId,
          runtimeProviderId: account.runtimeProviderId,
          name: connector.name,
          kind: account.kind,
          baseUrl: account.baseUrl,
          authType: { type: 'bearer' },
          capabilities: account.runtimeProviderId ? ['chat'] : [],
          sessionToken: account.sessionToken,
          refreshToken: account.refreshToken,
          idToken: account.idToken,
          status: account.status,
          validation: account.validation,
          validations: {},
          models: [],
          revision: require('crypto').randomUUID(),
          updatedAt: new Date().toISOString()
        }
        let validation = account.validation
        let refreshedModels = null
        if (!savedAccount.runtimeProviderId || !savedAccount.capabilities.includes('chat')) {
          validation = {
            ...account.validation,
            ok: false,
            status: 'authenticated_unavailable',
            errorCode: 'ACCOUNT_RUNTIME_UNAVAILABLE',
            message: 'Account authentication completed, but this connector has no executable provider mapping'
          }
        } else {
          validation = await validateConnection({
            connection: savedAccount,
            track: 'chat',
            modelsApi,
            requestOptions: requestOptionsFor(requestOptionsFromConfig, config.load(), savedAccount),
            onModels: models => { refreshedModels = models }
          })
        }
        if (typeof lifecycle.isActive === 'function' && !lifecycle.isActive()) return { status: 'cancelled', validation: { ...validation, ok: false, status: 'cancelled', errorCode: 'OAUTH_CANCELLED' } }
        const stamped = { ...validation, track: 'chat', inventoryRevision: savedAccount.revision }
        let applied = false
        await mutateConfig(config, current => {
          if (typeof lifecycle.isActive === 'function' && !lifecycle.isActive()) return current
          const next = JSON.parse(JSON.stringify(current))
          next.connections ||= { accounts: [], apiKeys: [], relays: [], defaults: { chat: null, image: null, video: null } }
          next.connections.accounts ||= []
          const existingIndex = next.connections.accounts.findIndex(item => item.connectorId === connector.id || item.id === savedAccount.id)
          const finalAccount = {
            ...savedAccount,
            status: !savedAccount.runtimeProviderId ? 'authenticated_unavailable' : validation.ok ? 'verified' : 'connected_unverified',
            validation: stamped,
            validations: savedAccount.capabilities.includes('chat') ? { chat: stamped } : {},
            models: refreshedModels ? refreshedModels.filter(model => model.capability === 'chat') : [],
            ...(refreshedModels ? { inventoryRevision: savedAccount.revision } : {})
          }
          if (existingIndex >= 0) next.connections.accounts[existingIndex] = finalAccount
          else next.connections.accounts.push(finalAccount)
          applied = true
          return next
        })
        if (!applied) return { status: 'cancelled', validation: { ...stamped, ok: false, status: 'cancelled', errorCode: 'OAUTH_CANCELLED' } }
        return { status: !savedAccount.runtimeProviderId ? 'authenticated_unavailable' : validation.ok ? 'verified' : 'connected_unverified', validation: stamped }
      }
    })
  })

  ipcMain.handle('providerAuth:status', (_, params = {}) => {
    cleanupAttempts()
    if (params.attemptId) {
      const attempt = oauthAttempts.get(String(params.attemptId))
      return publicAttempt(attempt)
    }
    if (params.connectorId) {
      const connector = ACCOUNT_CONNECTORS.find(item => item.id === params.connectorId)
      if (!connector) throw new Error('Unknown account connector')
      return connectorWithStoredAccount(config, config.load(), connector)
    }
    const stored = config.load()
    return ACCOUNT_CONNECTORS.map(connector => connectorWithStoredAccount(config, stored, connector))
  })

  ipcMain.handle('providerAuth:cancel', (_, params = {}) => {
    const attempt = oauthAttempts.get(String(params.attemptId || ''))
    if (!attempt) return { ok: false, status: 'not_found' }
    if (!['pending', 'exchanging', 'connected_unverified'].includes(attempt.status)) return publicAttempt(attempt)
    cancelOAuthAttempt(attempt)
    return publicAttempt(attempt)
  })

  ipcMain.handle('providerAuth:disconnect', async (_, params = {}) => {
    const connectorId = String(params.connectorId || '')
    if (!connectorId) throw new Error('connectorId is required')
    const connector = ACCOUNT_CONNECTORS.find(item => item.id === connectorId)
    if (!connector) throw new Error('Unknown account connector')
    if (connector.mode === 'cli') throw new Error('Detected CLI state cannot be disconnected by Gravuresse')
    cancelOAuthAttemptsForConnector(connectorId, {
      errorCode: 'OAUTH_DISCONNECTED',
      message: 'OAuth attempt cancelled because the account was disconnected'
    })
    await mutateConfig(config, current => {
      const next = JSON.parse(JSON.stringify(current))
      const removedIds = (next.connections?.accounts || []).filter(item => item.connectorId === connectorId || item.id === params.connectionId).map(item => item.id)
      next.connections.accounts = (next.connections?.accounts || []).filter(item => !removedIds.includes(item.id))
      for (const id of removedIds) removeConnectionReferences(next, id)
      return next
    })
    return { ok: true, status: 'disconnected' }
  })
}

module.exports = { registerProviderConnectionsIpc, _test: { mutateConfig, publicConnection, createExclusiveRunner, saveDetectedRelay } }
