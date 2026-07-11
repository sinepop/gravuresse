import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const connections = require('../../electron/providers/connections.js')
const configResolver = require('../../electron/providers/config-resolver.js')
const registry = require('../../electron/providers/registry.js')
const providerConnectionIpc = require('../../electron/ipc/provider-connections.js')

export async function runProviderConnectionCoreTests(configModule) {
  const runExclusive = providerConnectionIpc._test.createExclusiveRunner()
  const order = []
  let releaseFirst
  const first = runExclusive('same-connection', async () => {
    order.push('first-start')
    await new Promise(resolve => { releaseFirst = resolve })
    order.push('first-end')
  })
  const second = runExclusive('same-connection', async () => { order.push('second') })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(order, ['first-start'], 'same-connection operations are serialized')
  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(order, ['first-start', 'first-end', 'second'], 'queued operations preserve invocation order')

  const authState = await import('../../src/components/settings/accountAuthState.js')
  assert.equal(authState.safeAuthorizationUrl('https://auth.example.com/start'), 'https://auth.example.com/start')
  assert.equal(authState.safeAuthorizationUrl('http://auth.example.com/start'), '', 'OAuth UI only opens HTTPS URLs')
  const mergedAttempt = authState.mergeAuthAttempt({ id: 'codex', status: 'available' }, { id: 'attempt-1', status: 'pending' })
  assert.equal(mergedAttempt.id, 'codex', 'attempt ids never replace connector ids')
  assert.equal(mergedAttempt.attemptId, 'attempt-1')
  assert.equal(authState.shouldPollAuth(mergedAttempt), true)
  assert.equal(authState.isTerminalAuthStatus('connected_unverified'), true)
  assert.equal(authState.isTerminalAuthStatus('authenticated_unavailable'), true)
  assert.equal(authState.authExternalUrl({ verificationUri: 'https://auth.example.com/device' }), 'https://auth.example.com/device')
  assert.equal(authState.authExternalUrl({ authorizationUrl: 'http://auth.example.com/unsafe' }), '')
  assert.equal(authState.authSecondsRemaining('1970-01-01T00:00:11.000Z', 1000), 10)
  assert.equal(authState.authSecondsRemaining('1970-01-01T00:00:00.000Z', 1000), 0)
  assert.equal(authState.formatAuthCountdown(65), '1:05')
  assert.equal(authState.canBeginAuth({ mode: 'oauth', status: 'registration_required', registrationAvailable: false }), false)
  assert.equal(authState.canBeginAuth({ mode: 'oauth', status: 'available', registrationAvailable: true }), true)
  const migrated = configModule._test.migrateConnections({
    providers: {
      chat: { id: 'custom-chat', baseUrl: 'https://relay.example.com/v1', model: 'chat-model' },
      image: { id: 'openai', baseUrl: 'https://api.openai.com', model: 'image-model' },
      video: { id: 'volcengine', baseUrl: 'https://ark.example.com', model: 'video-model' }
    },
    savedChatModel: 'chat-model',
    savedImageModel: 'image-model',
    savedVideoModel: 'video-model',
    chatProviders: [{ name: 'Relay A', baseUrl: 'https://relay.example.com/v1', apiKey: 'relay-secret' }],
    providerAccounts: [{ accountId: 'key-openai', providerId: 'openai', kind: 'api-key', baseUrl: 'https://api.openai.com', apiKey: 'openai-secret', tracks: ['chat', 'image'] }],
    providerProfiles: { chat: [], image: [], video: [] }
  })
  assert.equal(migrated.connections.relays.length, 1)
  assert.equal(migrated.connections.relays[0].compatibilityMode, 'custom', 'legacy relays keep their existing custom contract')
  assert.equal(migrated.connections.apiKeys.length, 1)
  assert.equal(migrated.connections.defaults.chat.modelId, 'chat-model')
  const migratedAgain = configModule._test.migrateConnections(migrated)
  assert.equal(migratedAgain.connections.relays.length, 1, 'connection migration must be idempotent')
  assert.equal(migratedAgain.connections.apiKeys.length, 1, 'API key migration must be idempotent')
  const partial = configModule._test.migrateConnections({
    connections: { accounts: [], apiKeys: [{ id: 'canonical-key', providerId: 'deepseek', capabilities: ['chat'] }], defaults: { chat: null } },
    providerAccounts: [{ accountId: 'legacy-account', providerId: 'openai', kind: 'oauth', tracks: ['chat'] }],
    chatProviders: [{ id: 'legacy-relay', name: 'Legacy', baseUrl: 'https://legacy.example.com/v1' }]
  })
  assert.equal(partial.connections.accounts.some(item => item.id === 'legacy-account'), true, 'partial migration fills missing accounts')
  assert.equal(partial.connections.relays.some(item => item.id === 'legacy-relay'), true, 'partial migration fills missing relays')
  assert.equal(partial.connections.apiKeys.some(item => item.id === 'canonical-key'), true, 'partial migration preserves canonical entries')
  const withoutPlaceholders = configModule._test.migrateConnections({
    providerAccounts: [{ accountId: 'old-placeholder', providerId: 'openai', kind: 'oauth-placeholder', tracks: ['chat'] }]
  })
  assert.equal(withoutPlaceholders.connections.accounts.length, 0, 'legacy OAuth placeholder rows are not migrated')
  const mergedProfiles = configModule._test.migrateConnections({
    providerProfiles: {
      chat: [{ providerId: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'shared-key' }],
      image: [{ providerId: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'shared-key' }],
      video: []
    }
  })
  assert.equal(mergedProfiles.connections.apiKeys.length, 2, 'same-endpoint profiles remain distinct because credential equality cannot be inferred safely')
  assert.deepEqual(mergedProfiles.connections.apiKeys.map(item => item.capabilities), [['chat'], ['image']])
  assert.equal(new Set(mergedProfiles.connections.apiKeys.map(item => item.id)).size, 2)
  const canonicalAfterDeletion = configModule._test.migrateConnections({
    schemaVersion: 1,
    connections: { schemaVersion: 1, accounts: [], apiKeys: [], relays: [], defaults: { chat: null, image: null, video: null } },
    providerAccounts: [{ accountId: 'deleted-account', providerId: 'openai', kind: 'oauth', tracks: ['chat'] }],
    chatProviders: [{ id: 'deleted-relay', name: 'Deleted', baseUrl: 'https://deleted.example.com/v1' }],
    providers: { chat: { id: 'openai', model: 'deleted-model' } },
    savedChatModel: 'deleted-model'
  })
  assert.equal(canonicalAfterDeletion.connections.accounts.length, 0, 'legacy accounts cannot resurrect after canonical migration')
  assert.equal(canonicalAfterDeletion.connections.relays.length, 0, 'legacy relays cannot resurrect after canonical migration')
  assert.equal(canonicalAfterDeletion.connections.defaults.chat, null, 'legacy model fields cannot resurrect a cleared canonical default')
  const activeAccountDefault = configModule._test.migrateConnections({
    providers: { chat: { id: 'openai', accountId: 'active-account', model: 'active-model' } },
    providerAccounts: [
      { accountId: 'other-account', providerId: 'openai', kind: 'oauth', tracks: ['chat'] },
      { accountId: 'active-account', providerId: 'openai', kind: 'oauth', tracks: ['chat'] }
    ]
  })
  assert.equal(activeAccountDefault.connections.defaults.chat.connectionId, 'active-account', 'the explicitly active account wins legacy default migration')
  const collision = configModule._test.migrateConnections({
    connections: {
      accounts: [{ id: 'duplicate', providerId: 'openai' }],
      apiKeys: [{ id: 'duplicate', providerId: 'openai' }],
      relays: [{ id: 'duplicate', providerId: 'custom-chat' }]
    }
  })
  const ids = [...collision.connections.accounts, ...collision.connections.apiKeys, ...collision.connections.relays].map(item => item.id)
  assert.equal(new Set(ids).size, ids.length, 'connection ids are globally unique')

  const redacted = configModule.redactApiKeys(migrated)
  assert.equal(redacted.connections.relays[0].apiKey, '********')
  assert.equal(redacted.connections.apiKeys[0].apiKey, '********')
  const restored = configModule._test.mergeRedactedApiKeys(redacted, migrated)
  assert.equal(restored.connections.relays[0].apiKey, 'relay-secret')

  const existing = { id: 'relay-a', providerId: 'custom-chat', baseUrl: 'https://a.example.com', apiKey: 'secret-a' }
  const sameEndpoint = connections.mergeConnectionSecret(existing, { ...existing, apiKey: '********' })
  assert.equal(sameEndpoint.apiKey, 'secret-a')
  const crossEndpoint = connections.mergeConnectionSecret(existing, { ...existing, baseUrl: 'https://b.example.com', apiKey: '********' })
  assert.equal(crossEndpoint.apiKey, '', 'redacted secrets must not cross endpoints')
  const crossAuth = connections.mergeConnectionSecret(existing, { ...existing, authType: { type: 'query', key: 'key' }, apiKey: '********' })
  assert.equal(crossAuth.apiKey, '', 'redacted secrets must not cross authentication schemes')

  const relay = connections.sanitizeConnection({
    id: 'relay-test',
    providerId: 'custom-chat',
    name: 'Relay test',
    baseUrl: 'https://relay.example.com/v1',
    apiKey: 'secret',
    capabilities: ['chat', 'image', 'video'],
    modelsPath: '/models',
    endpoints: { chat: '/chat/completions', submit: '/video/submit' }
  }, 'relays')
  assert.deepEqual(relay.capabilities, ['chat', 'image', 'video'])
  assert.equal(relay.modelsPath, '/models')
  assert.equal(relay.compatibilityMode, 'custom', 'missing compatibility mode means custom for existing relays')
  const compatibleRelay = connections.sanitizeConnection({
    id: 'openai-compatible-relay',
    providerId: 'custom-chat',
    compatibilityMode: 'openai',
    name: '',
    baseUrl: 'https://relay.example.com/v1',
    apiKey: 'secret',
    capabilities: ['video'],
    authType: { type: 'query', paramName: 'key' },
    modelsPath: '/private/models',
    pathPrefix: '/private',
    endpoints: { chat: '/private/chat', video: '/private/video' },
    template: { chat: { method: 'PUT', body: { forged: true } } }
  }, 'relays')
  assert.equal(compatibleRelay.name, 'relay.example.com')
  assert.equal(compatibleRelay.providerId, 'custom-relay', 'simple mode uses the executable multi-track relay provider')
  assert.equal(compatibleRelay.compatibilityMode, 'openai')
  assert.deepEqual(compatibleRelay.authType, { type: 'bearer' })
  assert.deepEqual(compatibleRelay.capabilities, ['chat', 'image'])
  assert.equal(compatibleRelay.modelsPath, '')
  assert.equal(compatibleRelay.pathPrefix, '')
  assert.deepEqual(compatibleRelay.endpoints, {})
  assert.deepEqual(compatibleRelay.template, {})
  const compatibleChatRuntime = configResolver.providerConfigFromConnection(compatibleRelay, 'chat', 'chat-model')
  const compatibleImageRuntime = configResolver.providerConfigFromConnection(compatibleRelay, 'image', 'image-model')
  assert.equal(compatibleChatRuntime.path, '/v1/chat/completions')
  assert.equal(compatibleImageRuntime.path, '/v1/images/generations')
  assert.throws(() => connections.sanitizeConnection({
    id: 'bad-relay', providerId: 'custom-chat', capabilities: ['chat'], modelsPath: 'https://evil.example.com/models'
  }, 'relays'), /relative API path/)
  assert.throws(() => connections.sanitizeConnection({
    id: 'secret-header-relay', providerId: 'custom-chat', capabilities: ['chat'],
    template: { chat: { headers: { 'X-Auth-Token': 'plaintext-secret' } } }
  }, 'relays'), /cannot contain credentials/)
  const templatedRelay = connections.sanitizeConnection({
    id: 'templated-relay', providerId: 'custom-relay', baseUrl: 'https://relay.example.com', capabilities: ['chat', 'image'],
    template: { chat: { method: 'POST', body: { mode: 'chat' } }, image: { method: 'PUT', body: { mode: 'image' } } }
  }, 'relays')
  const runtimeTemplate = configResolver.providerConfigFromConnection(templatedRelay, 'image', 'image-model')
  assert.equal(runtimeTemplate.template.method, 'PUT')
  assert.deepEqual(runtimeTemplate.template.body, { mode: 'image' })
  assert.deepEqual(runtimeTemplate.customTemplate, runtimeTemplate.template)
  const lockedStandard = connections.sanitizeConnection({
    id: 'openai-key', providerId: 'openai', baseUrl: 'https://evil.example.com', capabilities: ['chat'], apiKey: 'secret'
  }, 'apiKeys')
  assert.equal(lockedStandard.baseUrl, 'https://api.openai.com', 'standard provider base URLs are registry-controlled')
  assert.deepEqual(lockedStandard.capabilities, ['chat', 'image'], 'standard provider capabilities come from the registry')
  assert.deepEqual(lockedStandard.models, [], 'renderer-supplied inventories are ignored')
  assert.equal(lockedStandard.validation, null, 'renderer-supplied validation is ignored')

  const modelsApi = {
    fetch: async () => [
      { id: 'chat-model', capability: 'chat', source: 'remote' },
      { id: 'image-model', capability: 'image', source: 'remote' }
    ]
  }
  const chatValidation = await connections.validateConnection({
    connection: relay,
    track: 'chat',
    modelsApi,
    requestOptions: {},
    requestFn: async (url, options, body) => {
      assert.equal(url.host, 'relay.example.com')
      assert.equal(options.method, 'POST')
      assert.equal(body.model, 'chat-model')
      return { status: 200, data: '{"choices":[{"message":{"content":"pong"}}]}' }
    }
  })
  assert.equal(chatValidation.ok, true)
  assert.equal(chatValidation.level, 'minimal_inference')
  assert.equal(chatValidation.modelId, 'chat-model')

  const forgedChatValidation = await connections.validateConnection({
    connection: relay,
    track: 'chat',
    modelsApi,
    requestOptions: {},
    requestFn: async () => ({ status: 200, data: '{}' })
  })
  assert.equal(forgedChatValidation.ok, false, 'an arbitrary 2xx response is not a successful inference')

  const imageValidation = await connections.validateConnection({
    connection: relay,
    track: 'image',
    modelsApi,
    requestOptions: {},
    requestFn: async () => { throw new Error('image generation must not run') }
  })
  assert.equal(imageValidation.ok, true)
  assert.equal(imageValidation.level, 'model_directory')
  assert.match(imageValidation.message, /not run to avoid billing/)

  const failedValidation = await connections.validateConnection({
    connection: relay,
    track: 'video',
    modelsApi: { fetch: async () => { throw new Error('HTTP 401: secret') } },
    requestOptions: {}
  })
  assert.equal(failedValidation.ok, false)
  assert.equal(failedValidation.status, 'error')
  assert.equal(failedValidation.errorCode, 'HTTP_401')
  for (const [message, code] of [
    ['HTTP 401: unauthorized', 'HTTP_401'],
    ['HTTP 403: forbidden', 'HTTP_403'],
    ['HTTP 404: not found', 'HTTP_404'],
    ['HTTP 429: rate limit', 'HTTP_429'],
    ['Request timed out', 'NETWORK_TIMEOUT'],
    ['ENOTFOUND api.example.com', 'NETWORK_UNAVAILABLE']
  ]) {
    const typedFailure = await connections.validateConnection({
      connection: relay, track: 'chat', modelsApi: { fetch: async () => { throw new Error(message) } }, requestOptions: {}
    })
    assert.equal(typedFailure.errorCode, code, message)
  }

  const unsupportedVideo = await connections.validateConnection({
    connection: relay,
    track: 'video',
    modelsApi,
    requestOptions: {}
  })
  assert.equal(unsupportedVideo.ok, false, 'media validation requires an exact remote capability model')
  assert.equal(unsupportedVideo.status, 'unsupported')

  const runtimeConnection = {
    ...relay,
    revision: 'revision-1',
    inventoryRevision: 'revision-1',
    models: [{ id: 'chat-model', capability: 'chat', source: 'remote' }],
    validations: { chat: { ok: true, status: 'verified', level: 'minimal_inference', track: 'chat', inventoryRevision: 'revision-1' } }
  }
  const runtime = configResolver.resolveRuntimeProviderConfig({
    connections: {
      accounts: [], apiKeys: [], relays: [runtimeConnection],
      defaults: { chat: { connectionId: runtimeConnection.id, providerId: runtimeConnection.providerId, modelId: 'chat-model' }, image: null, video: null }
    }
  }, 'chat', { action: 'chat' }, registry.getProvider, () => async () => ({}))
  assert.equal(runtime.ok, true)
  assert.equal(runtime.config.providerConfig.connectionId, runtimeConnection.id)
  assert.equal(runtime.config.providerConfig.model, 'chat-model')
  assert.equal(runtime.config.credentials.apiKey, 'secret')
  const customRelayRuntime = configResolver.resolveRuntimeProviderConfig({
    connections: {
      accounts: [], apiKeys: [], relays: [{ ...runtimeConnection, providerId: 'custom-relay', kind: 'relay' }],
      defaults: { chat: { connectionId: runtimeConnection.id, providerId: 'custom-relay', modelId: 'chat-model' }, image: null, video: null }
    }
  }, 'chat', { action: 'chat' }, registry.getProvider, () => async () => ({}))
  assert.equal(customRelayRuntime.ok, true, 'custom-relay must map to an executable track-specific provider')
  assert.equal(customRelayRuntime.config.canonicalProviderId, 'custom-chat')
  const accountRuntime = configResolver.resolveRuntimeProviderConfig({
    connections: {
      accounts: [{ ...runtimeConnection, id: 'account_codex', connectorId: 'codex', providerId: 'openai', runtimeProviderId: 'openai', kind: 'oauth', apiKey: '', sessionToken: 'oauth-session-token' }],
      apiKeys: [], relays: [],
      defaults: { chat: { connectionId: 'account_codex', providerId: 'openai', modelId: 'chat-model' }, image: null, video: null }
    }
  }, 'chat', { action: 'chat' }, registry.getProvider, () => async () => ({}))
  assert.equal(accountRuntime.ok, true, 'verified OAuth accounts participate in runtime resolution')
  assert.equal(accountRuntime.config.credentials.apiKey, 'oauth-session-token', 'OAuth bearer token is supplied only by the stored account')
  const unknownRuntime = configResolver.resolveRuntimeProviderConfig({
    connections: {
      accounts: [], apiKeys: [], relays: [{ ...runtimeConnection, models: [{ id: 'mystery', capability: 'unknown', source: 'remote' }] }],
      defaults: { chat: { connectionId: runtimeConnection.id, providerId: runtimeConnection.providerId, modelId: 'mystery' }, image: null, video: null }
    }
  }, 'chat', { action: 'chat' }, registry.getProvider, () => async () => ({}))
  assert.equal(unknownRuntime.ok, false, 'unknown model capability cannot cross into a runtime track')

  assert.throws(
    () => configModule._test.assertSecretsCanBePersisted({ connections: { apiKeys: [{ apiKey: 'plaintext-secret' }] } }),
    /Secure credential storage is unavailable/
  )
  assert.doesNotThrow(() => configModule._test.assertSecretsCanBePersisted({ general: { theme: 'light' } }))

  const attempt = connections.createOAuthAttempt('codex', 1000)
  assert.equal(attempt.state.length > 20, true)
  assert.equal(attempt.verifier.length > 40, true)
  assert.equal(attempt.challenge.length > 20, true)
  const publicView = connections.publicAttempt(attempt)
  assert.equal(publicView.state, undefined)
  assert.equal(publicView.verifier, undefined)
  connections.cleanupAttempts(attempt.expiresAt + 1)
  assert.equal(connections.publicAttempt(attempt).status, 'expired')
  const exchangingAttempt = connections.createOAuthAttempt('codex', 2000)
  exchangingAttempt.status = 'exchanging'
  connections.cleanupAttempts(exchangingAttempt.expiresAt + 1)
  assert.equal(connections.publicAttempt(exchangingAttempt).status, 'expired', 'exchange attempts expire without UI polling')

  const oauthStatus = connections.connectorStatus(connections.ACCOUNT_CONNECTORS.find(item => item.id === 'codex'))
  assert.equal(oauthStatus.ok, false)
  assert.equal(oauthStatus.mode, 'device-code')
  assert.ok(['registration_required', 'available'].includes(oauthStatus.status))
  assert.equal(oauthStatus.authorizationMode, 'device_code')
  assert.equal(oauthStatus.runtimeAvailable, false)
  if (oauthStatus.status === 'registration_required') assert.equal(oauthStatus.registrationAvailable, false)

  const unconfiguredConnector = { id: 'test-oauth', providerId: 'openai', name: 'Test OAuth', mode: 'oauth', envPrefix: 'GRAVURESSE_TEST_UNCONFIGURED' }
  const unconfiguredAttempt = await connections.beginOAuthAttempt(unconfiguredConnector)
  assert.equal(unconfiguredAttempt.ok, false)
  assert.equal(unconfiguredAttempt.status, 'registration_required')
  assert.equal(unconfiguredAttempt.registrationStatus, 'registration_required')
  assert.equal(unconfiguredAttempt.registrationAvailable, false)
  assert.equal(unconfiguredAttempt.errorCode, 'OAUTH_CLIENT_NOT_CONFIGURED')
  assert.equal(unconfiguredAttempt.id, 'test-oauth', 'an unconfigured connector must not create an OAuth attempt')
  await assert.rejects(() => connections.refreshOAuthCredential(unconfiguredConnector, 'refresh-secret', {
    configuration: { tokenUrl: 'https://auth.example.com/token', clientId: 'gravuresse-test' },
    requestFn: async () => ({ data: '{"error":"invalid_grant"}' })
  }), /invalid_grant/, 'refresh failures are surfaced instead of reusing an expired token')

  const wrongRevisionRuntime = configResolver.resolveRuntimeProviderConfig({
    connections: {
      accounts: [], apiKeys: [], relays: [{
        ...runtimeConnection,
        validations: { chat: { ...runtimeConnection.validations.chat, inventoryRevision: 'stale-revision' } }
      }],
      defaults: { chat: { connectionId: runtimeConnection.id, providerId: runtimeConnection.providerId, modelId: 'chat-model' }, image: null, video: null }
    }
  }, 'chat', { action: 'chat' }, registry.getProvider, () => async () => ({}))
  assert.equal(wrongRevisionRuntime.ok, false)
  assert.equal(wrongRevisionRuntime.error.code, 'CONNECTION_NOT_VERIFIED')

  const wrongTrackRuntime = configResolver.resolveRuntimeProviderConfig({
    connections: {
      accounts: [], apiKeys: [], relays: [{
        ...runtimeConnection,
        validations: { chat: { ...runtimeConnection.validations.chat, track: 'image' } }
      }],
      defaults: { chat: { connectionId: runtimeConnection.id, providerId: runtimeConnection.providerId, modelId: 'chat-model' }, image: null, video: null }
    }
  }, 'chat', { action: 'chat' }, registry.getProvider, () => async () => ({}))
  assert.equal(wrongTrackRuntime.ok, false)
  assert.equal(wrongTrackRuntime.error.code, 'CONNECTION_NOT_VERIFIED')
}
