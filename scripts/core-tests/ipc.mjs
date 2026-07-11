import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const providerConnections = require('../../electron/providers/connections.js')

function createIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle(channel, handler) {
      handlers.set(channel, handler)
    }
  }
}

function loadIpcModulesWithElectronMock(electronMock) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return electronMock
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return {
      provider: require('../../electron/ipc/provider.js'),
      configIpc: require('../../electron/ipc/config.js'),
      conversation: require('../../electron/ipc/conversation.js'),
      assets: require('../../electron/ipc/assets.js')
    }
  } finally {
    Module._load = originalLoad
  }
}

export async function runIpcCoreTests() {
  const electronMock = {
    dialog: {
      showSaveDialog: async () => ({ canceled: false, filePath: 'C:\\tmp\\gravuresse-test.json' }),
      showOpenDialog: async () => ({ canceled: true })
    }
  }
  const { provider, configIpc, conversation, assets } = loadIpcModulesWithElectronMock(electronMock)

  const configIpcMain = createIpcMain()
  let publicConfigState = {
    general: { theme: 'light', apiTimeout: 60000 },
    canvasLayout: 'grid',
    connections: { schemaVersion: 1, accounts: [], apiKeys: [{ id: 'main-owned', validations: { chat: { ok: true } } }], relays: [], defaults: { chat: null, image: null, video: null } }
  }
  configIpc.registerConfigIpc({
    ipcMain: configIpcMain,
    config: {
      DEFAULT_CONFIG: { general: { theme: 'light', apiTimeout: 60000 } },
      load: () => structuredClone(publicConfigState),
      redactApiKeys: value => value,
      update: async mutator => { publicConfigState = structuredClone(mutator(structuredClone(publicConfigState))) }
    }
  })
  await configIpcMain.handlers.get('config:save')(null, {
    general: { theme: 'dark' },
    canvasLayout: 'free',
    connections: { apiKeys: [{ id: 'forged', models: [{ id: 'forged' }], validations: { chat: { ok: true } } }] },
    providers: { chat: { model: 'forged' } }
  })
  assert.equal(publicConfigState.general.theme, 'dark')
  assert.equal(publicConfigState.canvasLayout, 'free')
  assert.equal(publicConfigState.connections.apiKeys[0].id, 'main-owned', 'generic config save cannot replace canonical connections')
  assert.equal(publicConfigState.connections.apiKeys[0].validations.chat.ok, true, 'generic config save cannot forge validation state')

  const providerIpc = createIpcMain()
  let executeCalls = 0
  let lastProviderParams = null
  let providerConfigState = {
    providers: {},
    connections: { accounts: [], apiKeys: [], relays: [], defaults: { chat: null, image: null, video: null } }
  }
  let modelsFetch = async () => [{ id: 'remote-chat', capability: 'chat', source: 'remote' }]
  let validationResponse = { status: 200, data: '{"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}],"usage":{"completion_tokens":1}}' }
  let lastValidationRequest = null
  let detectionRevision = 0
  const configMock = {
    REDACTED_API_KEY: '********',
    load: () => structuredClone(providerConfigState),
    save: async next => { providerConfigState = structuredClone(next) },
    update: async mutator => {
      providerConfigState = structuredClone(mutator(structuredClone(providerConfigState)))
      return structuredClone(providerConfigState)
    },
    redactApiKeys: value => {
      const next = structuredClone(value)
      for (const collection of ['accounts', 'apiKeys', 'relays']) {
        for (const connection of next.connections?.[collection] || []) {
          if (connection.apiKey) connection.apiKey = '********'
          if (connection.sessionToken) connection.sessionToken = '********'
        }
      }
      return next
    }
  }
  provider.registerProviderIpc({
    ipcMain: providerIpc,
    config: configMock,
    modelsApi: { fetch: providerConfig => modelsFetch(providerConfig) },
    providerValidationRequest: async (url, options, body) => {
      lastValidationRequest = { url, options, body }
      assert.equal(options.method, 'POST')
      assert.equal(body.max_tokens ?? body.generationConfig?.maxOutputTokens, 16)
      return validationResponse
    },
    relayDetector: async ({ baseUrl, apiKey }) => {
      const models = await modelsFetch({ baseUrl, apiKey })
      const checkedAt = new Date().toISOString()
      const revision = `detected-${++detectionRevision}`
      return {
        detectedProtocol: 'openai', detectedAt: checkedAt,
        detectedEndpoints: {
          models: '/v1/models',
          chat: '/v1/vendor/chat/completions',
          ...(models.some(model => model.capability === 'image') ? { image: '/v1/images/generations' } : {})
        },
        detectionRevision: revision, authType: { type: 'bearer' }, models,
        validation: { ok: true, status: 'verified', level: 'minimal_inference', checkedAt, latencyMs: 1, endpointHost: new URL(baseUrl).host, modelId: models[0]?.id || '', errorCode: '', message: 'verified' }
      }
    },
    providerPipeline: { execute: async () => ({ ok: true, data: 'ok' }) },
    buildProviderImageTestPayload: () => ({ ok: false, message: 'not used' }),
    executeProviderCall: async (params) => {
      executeCalls++
      lastProviderParams = params
      return { ok: true, data: { echoed: true } }
    },
    getProvidersByAction: () => [],
    getModelCatalog: () => [],
    getProviderCallMode: () => 'reference',
    getProviderSetupMode: () => 'reference',
    resolveHandler: () => null,
    isTemplateConfigurableProvider: () => false,
    storedProviderForRequest: () => ({}),
    inferProviderTrack: () => 'chat',
    resolveProviderIdByTrack: (_, id) => id,
    canUseStoredCredentials: () => false,
    realSecret: value => value,
    credentialsFromProvider: (_, incoming) => incoming,
    applyQueryParams: (url, params = {}) => {
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
      return url
    },
    requestOptionsFromConfig: () => ({}),
    getModelFetchProvider: providerConfig => providerConfig || {}
  })
  for (const channel of ['provider:call', 'provider:list', 'provider:test', 'provider:fetchModels', 'provider:testConnection', 'providerConnection:list', 'providerConnection:save', 'providerConnection:remove', 'providerAuth:begin', 'providerAuth:status', 'providerAuth:cancel', 'providerAuth:disconnect', 'providerModels:refresh', 'providerValidation:run', 'providerDefaults:save', 'api:models', 'api:chat', 'api:image', 'api:video', 'api:video:poll']) {
    assert.equal(typeof providerIpc.handlers.get(channel), 'function', `${channel} should be registered`)
  }

  const unsupportedHealthCheck = await providerIpc.handlers.get('provider:test')(null, { providerId: 'runway', track: 'video' })
  assert.equal(unsupportedHealthCheck.ok, false)
  assert.equal(unsupportedHealthCheck.status, 'unsupported')
  assert.equal(unsupportedHealthCheck.level, 'none')
  assert.equal(unsupportedHealthCheck.errorCode, 'HEALTH_CHECK_UNAVAILABLE')
  assert.equal(typeof unsupportedHealthCheck.checkedAt, 'string')
  assert.equal(Number.isFinite(unsupportedHealthCheck.latencyMs), true)
  assert.equal(unsupportedHealthCheck.endpointHost, '')
  assert.equal(unsupportedHealthCheck.modelId, '')
  assert.match(unsupportedHealthCheck.message, /No reliable no-cost validation/)

  const legacyDeepSeekTest = await providerIpc.handlers.get('provider:test')(null, {
    providerId: 'deepseek', track: 'chat', apiKey: 'deepseek-secret', model: 'deepseek-chat'
  })
  assert.equal(legacyDeepSeekTest.ok, true)
  assert.equal(legacyDeepSeekTest.evidence, 'assistant_output')
  assert.equal(lastValidationRequest.url.pathname, '/v1/chat/completions')

  validationResponse = { status: 200, data: '{"content":[{"type":"text","text":"OK"}],"stop_reason":"end_turn","usage":{"output_tokens":1}}' }
  const legacyAnthropicTest = await providerIpc.handlers.get('provider:test')(null, {
    providerId: 'anthropic', track: 'chat', apiKey: 'anthropic-secret', model: 'claude-test'
  })
  assert.equal(legacyAnthropicTest.ok, true)
  assert.equal(lastValidationRequest.url.pathname, '/v1/messages')
  assert.equal(lastValidationRequest.options.headers['anthropic-version'], '2023-06-01')

  validationResponse = { status: 200, data: '{"candidates":[{"content":{"parts":[{"text":"OK"}]},"finishReason":"STOP"}]}' }
  const legacyGeminiTest = await providerIpc.handlers.get('provider:test')(null, {
    providerId: 'google', track: 'chat', apiKey: 'gemini-secret', model: 'gemini-test'
  })
  assert.equal(legacyGeminiTest.ok, true)
  assert.equal(lastValidationRequest.url.pathname, '/v1beta/models/gemini-test:generateContent')
  assert.equal(lastValidationRequest.url.searchParams.get('key'), 'gemini-secret')
  validationResponse = { status: 200, data: '{"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}],"usage":{"completion_tokens":1}}' }

  const savedRelay = await providerIpc.handlers.get('providerConnection:save')(null, {
    collection: 'relays',
    connection: {
      id: 'relay-one', providerId: 'custom-chat', name: 'Relay One', baseUrl: 'https://relay-one.example.com/v1',
      apiKey: 'relay-one-secret', capabilities: ['chat']
    }
  })
  assert.equal(savedRelay.connection.apiKey, '********')
  assert.equal(savedRelay.modelsResult.ok, true)
  assert.equal(savedRelay.modelsResult.status, 'directory_verified', 'relay save requires an authenticated remote directory')
  assert.equal(savedRelay.modelsResult.evidence, 'model_directory')
  assert.equal(providerConfigState.connections.relays[0].models[0].source, 'remote')
  await providerIpc.handlers.get('providerConnection:save')(null, {
    collection: 'relays', refreshModels: false,
    connection: {
      id: 'relay-two', providerId: 'custom-chat', name: 'Relay Two', baseUrl: 'https://relay-two.example.com/v1',
      apiKey: 'relay-two-secret', capabilities: ['chat']
    }
  })
  assert.equal(providerConfigState.connections.relays[0].apiKey, 'relay-one-secret')
  assert.equal(providerConfigState.connections.relays[1].apiKey, 'relay-two-secret')
  assert.equal(providerConfigState.connections.relays[1].models[0].id, 'remote-chat', 'refreshModels:false cannot bypass real refresh')
  modelsFetch = async () => [{ id: 'gpt-image-1', capability: 'image', source: 'remote', reason: 'directory-name:image' }]
  const savedImageRelay = await providerIpc.handlers.get('providerConnection:save')(null, {
    collection: 'relays',
    connection: { id: 'relay-image', baseUrl: 'https://relay-image.example.com/v1', apiKey: 'relay-image-secret' }
  })
  assert.deepEqual(savedImageRelay.connection.capabilities, ['image'])
  assert.equal(savedImageRelay.connection.detectedEndpoints.image, '/v1/images/generations')
  assert.equal(savedImageRelay.connection.validations.image.status, 'directory_verified')
  assert.equal(savedImageRelay.connection.validations.chat, undefined, 'a pure image directory cannot create a chat validation')
  const imageDefault = await providerIpc.handlers.get('providerDefaults:save')(null, {
    defaults: { image: { connectionId: 'relay-image', providerId: 'custom-relay', modelId: 'gpt-image-1' } }
  })
  assert.equal(imageDefault.image.modelId, 'gpt-image-1')
  await providerIpc.handlers.get('providerDefaults:save')(null, { defaults: { image: null } })
  modelsFetch = async () => [{ id: 'sora-2', capability: 'video', source: 'remote', reason: 'directory-name:video' }]
  const savedVideoCatalog = await providerIpc.handlers.get('providerConnection:save')(null, {
    collection: 'relays',
    connection: { id: 'relay-video-catalog', baseUrl: 'https://relay-video.example.com/v1', apiKey: 'relay-video-secret' }
  })
  assert.deepEqual(savedVideoCatalog.connection.capabilities, [])
  assert.equal(savedVideoCatalog.connection.models[0].capability, 'video')
  assert.equal(savedVideoCatalog.modelsResult.status, 'directory_verified')
  modelsFetch = async () => [{ id: 'remote-chat', capability: 'chat', source: 'remote' }]
  const connectionList = await providerIpc.handlers.get('providerConnection:list')()
  assert.equal(connectionList.connections.relays[0].apiKey, '********')
  assert.equal(connectionList.connections.relays[1].apiKey, '********')
  assert.equal(connectionList.connections.relays[0].detectedProtocol, 'openai')
  assert.equal(connectionList.connections.relays[0].detectedEndpoints.chat, '/v1/vendor/chat/completions')

  const relayRevalidation = await providerIpc.handlers.get('providerValidation:run')(null, { connectionId: 'relay-one', track: 'chat' })
  assert.equal(relayRevalidation.ok, true)
  assert.equal(relayRevalidation.evidence, 'assistant_output')
  assert.equal(lastValidationRequest.url.pathname, '/v1/vendor/chat/completions')
  assert.equal(lastValidationRequest.options.headers.Authorization, 'Bearer relay-one-secret')

  const savedStandard = await providerIpc.handlers.get('providerConnection:save')(null, {
    collection: 'apiKeys',
    connection: {
      id: 'openai-standard', providerId: 'openai', baseUrl: 'https://attacker.example.com', apiKey: 'openai-secret',
      capabilities: ['video'], models: [{ id: 'forged', capability: 'video', source: 'remote' }],
      validation: { ok: true, status: 'verified' }
    }
  })
  assert.deepEqual(savedStandard.connection.capabilities, ['chat', 'image'])
  assert.equal(savedStandard.connection.baseUrl, 'https://api.openai.com')
  assert.equal(savedStandard.connection.models.some(model => model.id === 'forged'), false)
  assert.deepEqual(Object.keys(providerConfigState.connections.apiKeys.find(item => item.id === 'openai-standard').validations).sort(), ['chat', 'image'], 'save refreshes every declared capability instead of only the first')
  assert.equal(savedStandard.modelsResults.chat.status, 'directory_verified', 'saving an API key only discovers the remote directory')
  assert.equal(savedStandard.modelsResults.chat.evidence, 'model_directory')

  const savedDeepSeek = await providerIpc.handlers.get('providerConnection:save')(null, {
    collection: 'apiKeys',
    connection: { id: 'deepseek-standard', providerId: 'deepseek', apiKey: 'deepseek-secret' }
  })
  assert.equal(savedDeepSeek.modelsResult.ok, true)
  assert.equal(savedDeepSeek.connection.models.some(model => model.id === 'remote-chat'), true)
  await assert.rejects(() => providerIpc.handlers.get('providerConnection:save')(null, {
    collection: 'apiKeys', connection: { id: 'relay-one', providerId: 'openai', apiKey: 'x', capabilities: ['chat'] }
  }), /unique across all collections/)

  const relayOneForDefault = providerConfigState.connections.relays.find(item => item.id === 'relay-one')
  const chatValidation = {
    ...relayOneForDefault.validations.chat,
    status: 'directory_verified',
    level: 'model_directory',
    evidence: 'model_directory',
    outputVerified: false
  }
  relayOneForDefault.validation = chatValidation
  relayOneForDefault.validations = { chat: chatValidation }
  assert.equal(chatValidation.status, 'directory_verified')
  assert.equal(chatValidation.level, 'model_directory')
  const defaults = await providerIpc.handlers.get('providerDefaults:save')(null, {
    defaults: { chat: { connectionId: 'relay-one', providerId: 'custom-chat', modelId: 'remote-chat' }, image: null, video: null }
  })
  assert.equal(defaults.chat.modelId, 'remote-chat')
  assert.equal(providerConfigState.providers.chat.connectionId, 'relay-one', 'canonical defaults synchronize the legacy runtime selection')
  modelsFetch = async () => { throw new Error('temporary catalog outage') }
  const failedDefaultRefresh = await providerIpc.handlers.get('providerModels:refresh')(null, { connectionId: 'relay-one', track: 'chat' })
  assert.equal(failedDefaultRefresh.result.ok, false)
  assert.equal(providerConfigState.connections.defaults.chat.modelId, 'remote-chat', 'a failed refresh preserves the stale default for explicit user resolution')
  modelsFetch = async () => [{ id: 'remote-chat', capability: 'chat', source: 'remote' }]
  const restoredRelay = providerConfigState.connections.relays.find(item => item.id === 'relay-one')
  restoredRelay.models = [{ id: 'remote-chat', capability: 'chat', source: 'remote' }]
  restoredRelay.validation = chatValidation
  restoredRelay.validations = { chat: chatValidation }
  providerConfigState.connections.defaults.image = { connectionId: 'missing-stale', providerId: 'openai', modelId: 'gone' }
  const clearedChat = await providerIpc.handlers.get('providerDefaults:save')(null, { defaults: { chat: null } })
  assert.equal(clearedChat.chat, null, 'an empty value explicitly clears one default')
  assert.equal(clearedChat.image.connectionId, 'missing-stale', 'clearing one track does not validate or erase another stale track')
  const clearedImage = await providerIpc.handlers.get('providerDefaults:save')(null, { defaults: { image: null } })
  assert.equal(clearedImage.image, null, 'a stale default remains explicitly clearable')
  assert.equal(providerConfigState.providers.chat.model, '', 'clearing a canonical default also clears the legacy runtime model')
  await assert.rejects(() => providerIpc.handlers.get('providerDefaults:save')(null, {
    defaults: { chat: { connectionId: 'relay-one', providerId: 'custom-chat', modelId: 'unknown-model' }, image: null, video: null }
  }), /current remote model list/)

  const relayWithoutTrackValidation = providerConfigState.connections.relays.find(item => item.id === 'relay-one')
  relayWithoutTrackValidation.validation = chatValidation
  relayWithoutTrackValidation.validations = {}
  await assert.rejects(() => providerIpc.handlers.get('providerDefaults:save')(null, {
    defaults: { chat: { connectionId: 'relay-one', providerId: 'custom-chat', modelId: 'remote-chat' } }
  }), /current verified remote inventory/, 'single legacy validation must not satisfy a track default')
  relayWithoutTrackValidation.validations = { chat: chatValidation }

  const regularUpdate = configMock.update
  configMock.update = async mutator => {
    const currentRelay = providerConfigState.connections.relays.find(item => item.id === 'relay-one')
    currentRelay.revision = 'credential-changed-before-default-write'
    currentRelay.inventoryRevision = 'old-inventory'
    return regularUpdate(mutator)
  }
  await assert.rejects(() => providerIpc.handlers.get('providerDefaults:save')(null, {
    defaults: { chat: { connectionId: 'relay-one', providerId: 'custom-chat', modelId: 'remote-chat' } }
  }), /current verified remote inventory/, 'default validation and persistence must use the same atomic config revision')
  configMock.update = regularUpdate

  providerConfigState.connections.accounts.push({
    id: 'account_codex', connectorId: 'codex', providerId: 'openai', runtimeProviderId: 'openai',
    status: 'connected_unverified', capabilities: ['chat'], sessionToken: 'stored-oauth-token',
    validation: { ok: false, status: 'connected_unverified', level: 'oauth_token_exchange_only', message: 'Needs provider validation' }
  })
  const storedAccountStatus = await providerIpc.handlers.get('providerAuth:status')(null, { connectorId: 'codex' })
  assert.equal(storedAccountStatus.status, 'connected_unverified', 'stored account status survives renderer restart')
  assert.equal(storedAccountStatus.account.sessionToken, '********', 'stored account tokens stay redacted')
  providerConfigState.connections.accounts.push({
    id: 'account_minimax', connectorId: 'minimax-oauth', providerId: 'minimax', runtimeProviderId: '',
    status: 'connected_unverified', capabilities: [], sessionToken: 'stored-minimax-token',
    validation: { ok: false, status: 'connected_unverified', level: 'oauth_token_exchange_only' }
  })
  const unavailableAccountStatus = await providerIpc.handlers.get('providerAuth:status')(null, { connectorId: 'minimax-oauth' })
  assert.equal(unavailableAccountStatus.status, 'authenticated_unavailable', 'authentication without a runtime mapping is never presented as usable')
  assert.equal(unavailableAccountStatus.ok, false)
  assert.equal(unavailableAccountStatus.runtimeAvailable, false)
  assert.equal(unavailableAccountStatus.account.sessionToken, '********')
  providerConfigState.connections.accounts = providerConfigState.connections.accounts.filter(item => item.id !== 'account_minimax')
  providerConfigState.connections.defaults.chat = { connectionId: 'account_codex', providerId: 'openai', modelId: 'chat-model' }
  providerConfigState.providers.chat = { connectionId: 'account_codex', id: 'openai', model: 'chat-model' }
  const disconnectedAttempt = providerConnections.createOAuthAttempt('codex')
  disconnectedAttempt.status = 'exchanging'
  await providerIpc.handlers.get('providerAuth:disconnect')(null, { connectorId: 'codex' })
  assert.equal(providerConfigState.connections.accounts.some(item => item.id === 'account_codex'), false)
  assert.equal(providerConfigState.connections.defaults.chat, null)
  assert.equal(providerConfigState.providers.chat.connectionId, undefined)
  assert.equal(providerConnections.publicAttempt(disconnectedAttempt).status, 'cancelled', 'disconnect cancels every in-flight attempt for the connector')

  const cancellingAttempt = providerConnections.createOAuthAttempt('codex')
  cancellingAttempt.status = 'exchanging'
  const cancelled = await providerIpc.handlers.get('providerAuth:cancel')(null, { attemptId: cancellingAttempt.id })
  assert.equal(cancelled.status, 'cancelled', 'an in-flight exchange is cancellable')

  let releaseOldRefresh
  let oldRefreshStarted
  const oldStarted = new Promise(resolve => { oldRefreshStarted = resolve })
  modelsFetch = async providerConfig => {
    if (providerConfig.apiKey === 'old-secret') {
      oldRefreshStarted()
      await new Promise(resolve => { releaseOldRefresh = resolve })
      return [{ id: 'old-model', capability: 'chat', source: 'remote' }]
    }
    return [{ id: 'new-model', capability: 'chat', source: 'remote' }]
  }
  const oldSave = providerIpc.handlers.get('providerConnection:save')(null, {
    collection: 'relays',
    connection: { id: 'relay-race', providerId: 'custom-chat', name: 'Old', baseUrl: 'https://race.example.com/v1', apiKey: 'old-secret', capabilities: ['chat'] }
  })
  await oldStarted
  const newSavePromise = providerIpc.handlers.get('providerConnection:save')(null, {
    collection: 'relays',
    connection: { id: 'relay-race', providerId: 'custom-chat', name: 'New', baseUrl: 'https://race.example.com/v1', apiKey: 'new-secret', capabilities: ['chat'] }
  })
  releaseOldRefresh()
  const oldResult = await oldSave
  const newSave = await newSavePromise
  assert.equal(newSave.modelsResult.ok, true)
  assert.equal(oldResult.modelsResult.ok, true, 'same-relay saves are serialized in invocation order')
  const raced = providerConfigState.connections.relays.find(item => item.id === 'relay-race')
  assert.equal(raced.apiKey, 'new-secret')
  assert.deepEqual(raced.models.map(model => model.id), ['new-model'], 'old inventory cannot overwrite a newer credential revision')

  modelsFetch = async providerConfig => { throw new Error(`upstream rejected ${providerConfig.apiKey}`) }
  const redactedFailure = await providerIpc.handlers.get('providerConnection:save')(null, {
    collection: 'relays',
    connection: { id: 'relay-error', providerId: 'custom-chat', name: 'Error', baseUrl: 'https://error.example.com/v1', apiKey: 'exact-secret-value', capabilities: ['chat'] }
  })
  assert.equal(redactedFailure.modelsResult.ok, false)
  assert.equal(redactedFailure.modelsResult.message.includes('exact-secret-value'), false, 'exact secrets are redacted from refresh errors')
  assert.equal(providerConfigState.connections.relays.some(item => item.id === 'relay-error'), false, 'failed detection does not persist a new relay')
  modelsFetch = async () => [{ id: 'remote-chat', capability: 'chat', source: 'remote' }]

  const storedCustomChat = {
    providers: { chat: { id: 'custom-chat', baseUrl: 'https://relay.example.com/v1', apiKey: 'active-secret', model: 'active-model' } },
    chatProviders: [
      { name: 'Relay', baseUrl: 'https://relay.example.com/v1', apiKey: 'stored-secret', defaultModel: 'stored-model' }
    ]
  }
  const nonRedactedSecret = value => value && value !== '********' ? value : ''
  const savedCustomRequest = provider._test.resolveCustomChatRequestConfig({
    baseUrl: 'https://relay.example.com/v1', apiKey: '********', name: 'Relay', providerIndex: 0
  }, storedCustomChat, nonRedactedSecret)
  assert.deepEqual(savedCustomRequest, {
    ok: true,
    baseUrl: 'https://relay.example.com/v1',
    apiKey: 'stored-secret',
    model: 'stored-model'
  })
  const redirectedCustomRequest = provider._test.resolveCustomChatRequestConfig({
    baseUrl: 'https://attacker.example.com/v1', apiKey: '********', name: 'Relay', providerIndex: 0
  }, storedCustomChat, nonRedactedSecret)
  assert.equal(redirectedCustomRequest.ok, false)
  assert.match(redirectedCustomRequest.message, /apiKey/)
  const freshCustomRequest = provider._test.resolveCustomChatRequestConfig({
    baseUrl: 'https://new-relay.example.com/v1', apiKey: 'fresh-secret', model: 'fresh-model'
  }, storedCustomChat, nonRedactedSecret)
  assert.equal(freshCustomRequest.ok, true)
  assert.equal(freshCustomRequest.apiKey, 'fresh-secret')

  // ── provider:call rejects unsupported action ─────────────────────────────
  const invalidProviderCall = await providerIpc.handlers.get('provider:call')(null, { action: 'delete_everything' })
  assert.equal(invalidProviderCall.ok, false)
  assert.equal(invalidProviderCall.error.code, 'PRECHECK_FAILED')
  assert.equal(executeCalls, 0)

  // ── provider:call passes valid action through to executeProviderCall ─────
  const validProviderCall = await providerIpc.handlers.get('provider:call')(null, { action: 'chat', messages: [] })
  assert.equal(validProviderCall.ok, true)
  assert.equal(executeCalls, 1)

  // ── provider:call rejects missing action ─────────────────────────────────
  const missingAction = await providerIpc.handlers.get('provider:call')(null, {})
  assert.equal(missingAction.ok, false)
  assert.equal(missingAction.error.code, 'PRECHECK_FAILED')
  assert.match(missingAction.error.message, /Unsupported provider action/)

  // ── api:chat rejects invalid messages ────────────────────────────────────
  await assert.rejects(
    () => providerIpc.handlers.get('api:chat')(null, { notHistory: true }, {}),
    /history array/
  )
  assert.equal(executeCalls, 1) // no increment from rejected call

  // ── api:chat: message normalization drops rogue fields ───────────────────
  await providerIpc.handlers.get('api:chat')(null, { history: [{ role: 'user', content: 'hi', extra: 'drop', headers: { bad: true } }] }, { id: 'openai' })
  assert.equal(executeCalls, 2)
  assert.equal(lastProviderParams.action, 'chat')
  assert.deepEqual(lastProviderParams.messages, [{ role: 'user', content: 'hi' }])
  // Rogue fields from the message items are not forwarded
  assert.equal(lastProviderParams.extra, undefined)
  assert.equal(lastProviderParams.headers, undefined)

  // ── api:chat: does not forward rogue provider fields ─────────────────────
  await providerIpc.handlers.get('api:chat')(null, { history: [{ role: 'user', content: 'test' }] }, { id: 'openai', credentials: { apiKey: 'leak' }, headers: { bad: true }, httpAgent: {} })
  assert.equal(executeCalls, 3)
  // Legacy wrapper only forwards id, model, baseUrl, accountId from provider — not credentials/headers/httpAgent
  assert.equal(lastProviderParams.credentials, undefined)
  assert.equal(lastProviderParams.headers, undefined)
  assert.equal(lastProviderParams.httpAgent, undefined)

  // ── api:video:poll rejects empty taskId ──────────────────────────────────
  await assert.rejects(
    () => providerIpc.handlers.get('api:video:poll')(null, '', {}),
    /taskId is required/
  )
  assert.equal(executeCalls, 3) // no increment

  // ── api:video:poll passes correct params ─────────────────────────────────
  await providerIpc.handlers.get('api:video:poll')(null, 'task-123', { id: 'runway', model: 'gen3', baseUrl: 'https://x.example.com' })
  assert.equal(executeCalls, 4)
  assert.equal(lastProviderParams.action, 'poll')
  assert.equal(lastProviderParams.taskId, 'task-123')
  assert.equal(lastProviderParams.providerId, 'runway')

  // ── api:image forwards only allowlisted keys ─────────────────────────────
  await providerIpc.handlers.get('api:image')(null, {
    id: 'dalle',
    prompt: 'a cat',
    ratio: '1:1',
    model: 'dall-e-3',
    headers: { bad: true },
    httpAgent: {},
    credentials: { apiKey: 'leak' },
    arbitraryKey: 'should not pass'
  })
  assert.equal(executeCalls, 5)
  assert.equal(lastProviderParams.action, 'generate')
  assert.equal(lastProviderParams.prompt, 'a cat')
  assert.equal(lastProviderParams.providerId, 'dalle')
  // Rogue keys are not forwarded by the legacy wrapper
  assert.equal(lastProviderParams.headers, undefined)
  assert.equal(lastProviderParams.httpAgent, undefined)
  assert.equal(lastProviderParams.credentials, undefined)
  assert.equal(lastProviderParams.arbitraryKey, undefined)

  // ── api:video forwards only allowlisted keys ─────────────────────────────
  await providerIpc.handlers.get('api:video')(null, {
    id: 'runway',
    prompt: 'a dog running',
    ratio: '16:9',
    duration: 5,
    headers: { bad: true },
    credentials: { apiKey: 'leak' }
  })
  assert.equal(executeCalls, 6)
  assert.equal(lastProviderParams.action, 'submit')
  assert.equal(lastProviderParams.prompt, 'a dog running')
  assert.equal(lastProviderParams.providerId, 'runway')
  assert.equal(lastProviderParams.headers, undefined)
  assert.equal(lastProviderParams.credentials, undefined)

  // ── Verify total executeCalls confirms all legacy wrappers route through ─
  assert.equal(executeCalls, 6, 'All 6 legacy wrapper calls should route through executeProviderCall')

  const conversationIpc = createIpcMain()
  let exportedText = ''
  conversation.registerConversationIpc({
    ipcMain: conversationIpc,
    store: {
      loadAll: () => ({ conversations: [], activeId: null, deletedIds: [] }),
      saveAllQueued: async () => {},
      saveConversation: async () => {},
      deleteConversation: async () => {},
      setActiveId: async () => {}
    },
    getMainWindow: () => null,
    normalizeAssetLabel: label => String(label || 'conversation'),
    inlineExportAssets: async assets => ({ assets, inlined: 1, skipped: 2 }),
    inlineExportConversations: async conversations => ({ conversations, inlined: 1, skipped: 0 }),
    remoteExportAssetCount: () => 2,
    remoteExportConversationAssetCount: () => 0,
    writeTextAtomic: (text) => { exportedText = text },
    maxProjectExportBytes: 100 * 1024 * 1024
  })
  for (const channel of ['history:get', 'history:save', 'conv:loadAll', 'conv:save', 'conv:delete', 'conv:setActive', 'conv:export', 'conv:exportProject', 'conv:import']) {
    assert.equal(typeof conversationIpc.handlers.get(channel), 'function', `${channel} should be registered`)
  }
  const exportResult = await conversationIpc.handlers.get('conv:export')(null, { title: 'x', messages: [], assets: [] })
  assert.deepEqual(exportResult.media, { inlined: 1, skipped: 2, fallback: false })
  assert.ok(exportedText.includes('"media"'))

  const assetIpc = createIpcMain()
  assets.registerAssetIpc({
    ipcMain: assetIpc,
    getMainWindow: () => null,
    saveDir: 'C:\\tmp',
    normalizeAssetLabel: label => String(label || 'asset'),
    writeAssetUrl: async () => 'C:\\tmp\\asset.png',
    cacheAssetPreview: async () => 'gravuresse-media://cache/test.png',
    cacheAssetBytes: (bytes, type, mime) => {
      if (mime && mime !== 'image/png') throw new Error('Asset MIME does not match content')
      return { url: `gravuresse-media://cache/${'a'.repeat(64)}.png`, mime: 'image/png', size: bytes.length }
    },
    mediaCacheDir: 'C:\\tmp\\media-cache',
    validateAssetBytes: () => 'image/png',
    openExternalSafe: async () => {}
  })
  for (const channel of ['api:saveAsset', 'api:getSaveDir', 'api:cacheAssetPreview', 'api:importLocalImages', 'api:importImageBytes', 'api:saveAssetWithDialog', 'shell:open-external']) {
    assert.equal(typeof assetIpc.handlers.get(channel), 'function', `${channel} should be registered`)
  }
  assert.equal(await assetIpc.handlers.get('api:cacheAssetPreview')(null, { url: 'https://cdn.example.com/a.png', type: 'image' }), 'gravuresse-media://cache/test.png')
  assert.deepEqual(await assetIpc.handlers.get('api:importLocalImages')(), { canceled: true, imported: [], rejected: [] })
  const importDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gravuresse-import-'))
  const importFile = path.join(importDir, 'local-photo.png')
  const missingFile = path.join(importDir, 'private-missing.png')
  fs.writeFileSync(importFile, Buffer.from([1, 2, 3]))
  electronMock.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [importFile, missingFile] })
  const pickedImages = await assetIpc.handlers.get('api:importLocalImages')()
  assert.equal(pickedImages.imported.length, 1)
  assert.equal(pickedImages.rejected.length, 1)
  assert.equal(JSON.stringify(pickedImages).includes(importDir), false, 'image import responses never expose absolute paths')
  fs.rmSync(importDir, { recursive: true, force: true })
  electronMock.dialog.showOpenDialog = async () => ({ canceled: true })
  const importedBytes = await assetIpc.handlers.get('api:importImageBytes')(null, {
    name: 'C:\\private\\photo.png', mime: 'image/png', bytes: new Uint8Array([1, 2, 3])
  })
  assert.equal(importedBytes.imported[0].label, 'photo')
  assert.equal(importedBytes.imported[0].url.includes('private'), false, 'local paths are never returned to the renderer')
  const rejectedMime = await assetIpc.handlers.get('api:importImageBytes')(null, {
    name: 'bad.png', mime: 'image/jpeg', bytes: new Uint8Array([1, 2, 3])
  })
  assert.equal(rejectedMime.imported.length, 0)
  assert.match(rejectedMime.rejected[0].reason, /MIME/)
  await assert.rejects(
    () => assetIpc.handlers.get('api:saveAsset')(null, {}),
    /Asset URL is required/
  )
}
