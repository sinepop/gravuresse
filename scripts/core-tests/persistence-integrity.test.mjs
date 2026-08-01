import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Module from 'node:module'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const CONFIG_MODULE = '../../electron/config.js'
const STORE_MODULE = '../../electron/store.js'

function loadFreshWithElectronMock(moduleRequest, electronMock) {
  const modulePath = require.resolve(moduleRequest)
  delete require.cache[modulePath]
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return electronMock
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

function createUserDataRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gravuresse-persistence-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

function configPath(root) {
  return path.join(root, 'Gravuresse', 'config.json')
}

function storePath(root) {
  return path.join(root, 'Gravuresse', 'conversations.json')
}

function writeFixture(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents, 'utf8')
}

function electronMock(root, safeStorageOverrides = {}) {
  return {
    app: { getPath: () => root },
    safeStorage: {
      isEncryptionAvailable: () => false,
      encryptString: value => Buffer.from(String(value)),
      decryptString: value => Buffer.from(value).toString('utf8'),
      ...safeStorageOverrides
    }
  }
}

function assertPersistenceError(expectedCode) {
  return error => {
    assert.equal(error?.code, expectedCode)
    assert.ok(error?.message)
    return true
  }
}

function silenceExpectedConsoleErrors(t) {
  const original = console.error
  console.error = () => {}
  t.after(() => { console.error = original })
}

test('malformed configuration is surfaced and cannot be overwritten by an ordinary update', async t => {
  const root = createUserDataRoot(t)
  const filePath = configPath(root)
  const original = '{ malformed configuration'
  writeFixture(filePath, original)
  const config = loadFreshWithElectronMock(CONFIG_MODULE, electronMock(root))

  assert.throws(() => config.load(), assertPersistenceError('CONFIG_READ_FAILED'))
  await assert.rejects(
    config.update(current => ({ ...current, general: { ...current.general, theme: 'dark' } })),
    assertPersistenceError('CONFIG_READ_FAILED')
  )
  await assert.rejects(
    config.save(config.DEFAULT_CONFIG),
    assertPersistenceError('CONFIG_READ_FAILED')
  )
  assert.equal(fs.readFileSync(filePath, 'utf8'), original)
})

test('credential decryption failure is surfaced without erasing the encrypted source', async t => {
  const root = createUserDataRoot(t)
  const filePath = configPath(root)
  const original = JSON.stringify({
    providers: {
      chat: {
        id: 'custom-chat',
        apiKey: '__ENCRYPTED__cannot-decrypt',
        baseUrl: 'https://relay.example.test/v1',
        model: 'test-model'
      }
    },
    connections: {
      schemaVersion: 1,
      accounts: [],
      apiKeys: [],
      relays: [],
      defaults: { chat: null, image: null, video: null }
    }
  }, null, 2)
  writeFixture(filePath, original)
  const config = loadFreshWithElectronMock(CONFIG_MODULE, electronMock(root, {
    isEncryptionAvailable: () => true,
    decryptString: () => {
      throw new Error('profile key changed')
    }
  }))

  assert.throws(() => config.load(), error => {
    assert.equal(error?.code, 'CONFIG_READ_FAILED')
    assert.equal(error?.cause?.code, 'CONFIG_DECRYPT_FAILED')
    return true
  })
  await assert.rejects(
    config.update(current => ({ ...current, general: { ...current.general, language: 'en' } })),
    assertPersistenceError('CONFIG_READ_FAILED')
  )
  assert.equal(fs.readFileSync(filePath, 'utf8'), original)
})

test('configuration rename failure rejects, preserves the original, and removes the temporary file', async t => {
  const root = createUserDataRoot(t)
  const filePath = configPath(root)
  const config = loadFreshWithElectronMock(CONFIG_MODULE, electronMock(root))
  await config.save({ ...config.DEFAULT_CONFIG, general: { ...config.DEFAULT_CONFIG.general, theme: 'light' } })
  const original = fs.readFileSync(filePath, 'utf8')
  const originalRenameSync = fs.renameSync
  fs.renameSync = (source, target) => {
    if (target === filePath) {
      const error = new Error('simulated rename failure')
      error.code = 'EACCES'
      throw error
    }
    return originalRenameSync(source, target)
  }
  try {
    await assert.rejects(
      config.update(current => ({ ...current, general: { ...current.general, theme: 'dark' } })),
      assertPersistenceError('CONFIG_WRITE_FAILED')
    )
  } finally {
    fs.renameSync = originalRenameSync
  }

  assert.equal(fs.readFileSync(filePath, 'utf8'), original)
  assert.equal(
    fs.readdirSync(path.dirname(filePath)).some(name => name.startsWith(`${path.basename(filePath)}.tmp`)),
    false
  )
})

test('corrupt conversation data remains recoverable and blocks later writes', async t => {
  silenceExpectedConsoleErrors(t)
  const root = createUserDataRoot(t)
  const filePath = storePath(root)
  const original = '{ malformed conversations'
  writeFixture(filePath, original)
  const store = loadFreshWithElectronMock(STORE_MODULE, { app: { getPath: () => root } })

  assert.throws(() => store.loadAll(), assertPersistenceError('STORE_READ_FAILED'))
  await assert.rejects(
    store.saveConversation('replacement', { title: 'must not overwrite corrupt data' }),
    assertPersistenceError('STORE_READ_FAILED')
  )
  assert.equal(fs.readFileSync(filePath, 'utf8'), original)
  assert.equal(
    fs.readdirSync(path.dirname(filePath)).some(name => name.startsWith('conversations.json.corrupt-')),
    true
  )
})

test('conversation rename failure rejects, preserves the original, and removes the temporary file', async t => {
  silenceExpectedConsoleErrors(t)
  const root = createUserDataRoot(t)
  const filePath = storePath(root)
  const store = loadFreshWithElectronMock(STORE_MODULE, { app: { getPath: () => root } })
  store.saveAll({
    conversations: [{ id: 'existing', title: 'Existing' }],
    activeId: 'existing',
    deletedIds: []
  })
  const original = fs.readFileSync(filePath, 'utf8')
  const originalRenameSync = fs.renameSync
  fs.renameSync = (source, target) => {
    if (target === filePath) {
      const error = new Error('simulated rename failure')
      error.code = 'EACCES'
      throw error
    }
    return originalRenameSync(source, target)
  }
  try {
    await assert.rejects(
      store.saveConversation('existing', { title: 'Changed' }),
      assertPersistenceError('STORE_WRITE_FAILED')
    )
  } finally {
    fs.renameSync = originalRenameSync
  }

  assert.equal(fs.readFileSync(filePath, 'utf8'), original)
  assert.equal(
    fs.readdirSync(path.dirname(filePath)).some(name => name.startsWith(`${path.basename(filePath)}.tmp`)),
    false
  )
})

test('successful safeStorage encryption, decryption, and renderer redaction remain intact', async t => {
  const root = createUserDataRoot(t)
  const filePath = configPath(root)
  const prefix = 'sealed:'
  const config = loadFreshWithElectronMock(CONFIG_MODULE, electronMock(root, {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`${prefix}${value}`, 'utf8'),
    decryptString: bytes => {
      const encoded = Buffer.from(bytes).toString('utf8')
      assert.ok(encoded.startsWith(prefix))
      return encoded.slice(prefix.length)
    }
  }))
  const source = JSON.parse(JSON.stringify(config.DEFAULT_CONFIG))
  source.connections.apiKeys = [{
    id: 'key-test',
    providerId: 'openai',
    baseUrl: 'https://api.openai.com',
    capabilities: ['chat'],
    apiKey: 'successful-secret'
  }]

  await config.save(source)
  const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  assert.match(onDisk.connections.apiKeys[0].apiKey, /^__ENCRYPTED__/)
  assert.notEqual(onDisk.connections.apiKeys[0].apiKey, 'successful-secret')

  const loaded = config.load()
  assert.equal(loaded.connections.apiKeys[0].apiKey, 'successful-secret')
  const redacted = config.redactApiKeys(loaded)
  assert.equal(redacted.connections.apiKeys[0].apiKey, config.REDACTED_API_KEY)
})
