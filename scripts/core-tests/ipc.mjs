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
  const invalidProviderCall = await providerIpc.handlers.get('provider:call')(null, { action: 'delete_everything' })
  assert.equal(invalidProviderCall.ok, false)
  assert.equal(invalidProviderCall.error.code, 'PRECHECK_FAILED')
  assert.equal(executeCalls, 0)
  await assert.rejects(
    () => providerIpc.handlers.get('api:chat')(null, { notHistory: true }, {}),
    /history array/
  )
  await providerIpc.handlers.get('api:chat')(null, { history: [{ role: 'user', content: 'hi', extra: 'drop' }] }, { id: 'openai' })
  assert.deepEqual(lastProviderParams.messages, [{ role: 'user', content: 'hi' }])
  await assert.rejects(
    () => providerIpc.handlers.get('api:video:poll')(null, '', {}),
    /taskId is required/
  )

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
