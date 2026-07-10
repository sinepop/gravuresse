import assert from 'node:assert/strict'
import Module from 'node:module'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

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
  const { provider, conversation, assets } = loadIpcModulesWithElectronMock(electronMock)

  const providerIpc = createIpcMain()
  let executeCalls = 0
  let lastProviderParams = null
  provider.registerProviderIpc({
    ipcMain: providerIpc,
    config: { load: () => ({ providers: {} }) },
    modelsApi: { fetch: async () => [] },
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
    credentialsFromProvider: () => ({}),
    applyQueryParams: url => url,
    requestOptionsFromConfig: () => ({}),
    getModelFetchProvider: providerConfig => providerConfig || {}
  })
  for (const channel of ['provider:call', 'provider:list', 'provider:test', 'api:models', 'api:chat', 'api:image', 'api:video', 'api:video:poll']) {
    assert.equal(typeof providerIpc.handlers.get(channel), 'function', `${channel} should be registered`)
  }

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
    openExternalSafe: async () => {}
  })
  for (const channel of ['api:saveAsset', 'api:getSaveDir', 'api:cacheAssetPreview', 'api:saveAssetWithDialog', 'shell:open-external']) {
    assert.equal(typeof assetIpc.handlers.get(channel), 'function', `${channel} should be registered`)
  }
  assert.equal(await assetIpc.handlers.get('api:cacheAssetPreview')(null, { url: 'https://cdn.example.com/a.png', type: 'image' }), 'gravuresse-media://cache/test.png')
  await assert.rejects(
    () => assetIpc.handlers.get('api:saveAsset')(null, {}),
    /Asset URL is required/
  )
}
