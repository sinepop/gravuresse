import assert from 'node:assert/strict'
import { createAsset, createGeneration, mergeAsset } from '../src/utils/assetFactory.js'
import { formatErrorAlert, getConversationTitle, normalizeConversationRecord, normalizeImportedConversations } from '../src/utils/conversationImport.js'
import {
  addAssetToConversationRecord,
  appendMessageToConversation,
  removeConversationAsset,
  updateConversationAsset,
  updateConversationTask
} from '../src/utils/conversationStore.js'

const generation = createGeneration({
  parentAssetId: '',
  sourceAssetIds: 'source-1',
  promptReferenceAssetIds: [undefined, 'ref-1', 42],
  duration: 0
})
assert.equal(generation.parentAssetId, null)
assert.deepEqual(generation.sourceAssetIds, ['source-1'])
assert.deepEqual(generation.promptReferenceAssetIds, ['ref-1', '42'])
assert.equal(generation.duration, 0)

const legacyAsset = createAsset({
  id: '',
  type: '',
  label: '',
  createdAt: '',
  providerId: 'provider-a',
  parentAssetId: 'parent-a',
  sourceAssetIds: ['source-a'],
  promptReferenceAssetIds: ['prompt-ref-a'],
  taskId: 'task-a'
})
assert.ok(legacyAsset.id)
assert.equal(legacyAsset.type, 'image')
assert.equal(legacyAsset.label, '未命名')
assert.ok(legacyAsset.createdAt)
assert.equal(legacyAsset.generation.providerId, 'provider-a')
assert.equal(legacyAsset.generation.parentAssetId, 'parent-a')
assert.deepEqual(legacyAsset.generation.sourceAssetIds, ['source-a'])
assert.deepEqual(legacyAsset.generation.promptReferenceAssetIds, ['prompt-ref-a'])
assert.equal(legacyAsset.generation.taskId, 'task-a')

const normalizedAsset = createAsset({
  id: 123,
  type: 'audio',
  generation: {
    mode: 'audio',
    parentAssetId: 456,
    sourceAssetIds: 'source-c',
    promptReferenceAssetIds: 789,
    taskId: 321
  }
})
assert.equal(normalizedAsset.id, '123')
assert.equal(normalizedAsset.type, 'image')
assert.equal(normalizedAsset.generation.mode, 'audio')
assert.equal(normalizedAsset.generation.parentAssetId, '456')
assert.deepEqual(normalizedAsset.generation.sourceAssetIds, ['source-c'])
assert.deepEqual(normalizedAsset.generation.promptReferenceAssetIds, ['789'])
assert.equal(normalizedAsset.generation.taskId, '321')

const videoAssetWithEmptyGenerationMode = createAsset({
  id: 'video-a',
  type: 'video',
  generation: { mode: '' }
})
assert.equal(videoAssetWithEmptyGenerationMode.type, 'video')
assert.equal(videoAssetWithEmptyGenerationMode.generation.mode, 'video')

const videoAssetWithSpecificMode = createAsset({
  id: 'video-b',
  type: 'video',
  generation: { mode: 'image_to_video' }
})
assert.equal(videoAssetWithSpecificMode.generation.mode, 'image_to_video')

const assetFromBadInput = createAsset(null)
assert.ok(assetFromBadInput.id)
const assetWithBadGeneration = createAsset({ generation: 'bad generation' })
assert.equal(Object.hasOwn(assetWithBadGeneration.generation, '0'), false)

const mergedAsset = mergeAsset(
  createAsset({
    id: 'merge-a',
    generation: {
      prompt: 'base prompt',
      model: 'base-model',
      parentAssetId: 'parent-base',
      sourceAssetIds: ['source-base']
    }
  }),
  { generation: { resolution: '1024' } }
)
assert.equal(mergedAsset.generation.prompt, 'base prompt')
assert.equal(mergedAsset.generation.model, 'base-model')
assert.equal(mergedAsset.generation.parentAssetId, 'parent-base')
assert.deepEqual(mergedAsset.generation.sourceAssetIds, ['source-base'])
assert.equal(mergedAsset.generation.resolution, '1024')
assert.equal(mergeAsset(mergedAsset, { generation: 'bad generation' }).generation.prompt, 'base prompt')

const title = getConversationTitle([
  { role: 'assistant', content: 'ignored' },
  { role: 'user', content: 'abcdefghijklmnopqrstuvwxyz1234567890' }
])
assert.equal(title, 'abcdefghijklmnopqrstuvwxyz1234')
assert.equal(getConversationTitle({ role: 'user', content: 'bad shape' }), '')
assert.equal(getConversationTitle([
  { role: 'user', content: 42 },
  { role: 'user', content: '' },
  { role: 'user', content: 'usable title' }
]), 'usable title')

const imported = normalizeImportedConversations([
  null,
  'bad',
  {
    messages: [{ role: 'user', content: 'hello project' }],
    assets: [{ id: '', label: '', sourceAssetIds: ['source-b'] }]
  }
])
assert.equal(imported.length, 1)
assert.equal(imported[0].title, 'hello project')
assert.equal(imported[0].assets.length, 1)
assert.ok(imported[0].assets[0].id)
assert.deepEqual(imported[0].assets[0].generation.sourceAssetIds, ['source-b'])

const dirtyMessageImport = normalizeImportedConversations({
  conversation: {
    title: 'dirty messages',
    messages: [
      null,
      'bad',
      { id: 1, role: 'user', content: 123 },
      { id: '1', role: 'assistant', content: 'running task', task: { status: 'generating', type: 'audio', label: '', prompt: 7, error: {} } },
      { id: 'm3', role: 'assistant', content: 'done task', tasks: ['bad', { status: 'done', type: 'video', prompt: 'video prompt', sourceAssetIds: 'source-video' }] }
    ]
  }
})
assert.equal(dirtyMessageImport[0].messages.length, 3)
assert.equal(dirtyMessageImport[0].messages[0].id, '1')
assert.equal(dirtyMessageImport[0].messages[0].content, '')
assert.notEqual(dirtyMessageImport[0].messages[1].id, '1')
assert.equal(dirtyMessageImport[0].messages[1].task, undefined)
assert.equal(dirtyMessageImport[0].messages[1].tasks[0].status, 'error')
assert.equal(dirtyMessageImport[0].messages[1].tasks[0].type, 'image')
assert.equal(dirtyMessageImport[0].messages[1].tasks[0].prompt, '')
assert.equal(typeof dirtyMessageImport[0].messages[1].tasks[0].error, 'string')
assert.equal(dirtyMessageImport[0].messages[2].tasks.length, 1)
assert.equal(dirtyMessageImport[0].messages[2].tasks[0].type, 'video')
assert.deepEqual(dirtyMessageImport[0].messages[2].tasks[0].sourceAssetIds, ['source-video'])

const normalizedStoredConversation = normalizeConversationRecord({
  id: 99,
  title: 'stored',
  messages: ['bad', { id: 1, role: 'user', content: 'stored prompt' }],
  assets: ['bad', { id: 2, generation: { parentAssetId: 3 } }]
})
assert.equal(normalizedStoredConversation.id, 99)
assert.equal(normalizedStoredConversation.messages.length, 1)
assert.equal(normalizedStoredConversation.messages[0].id, '1')
assert.equal(normalizedStoredConversation.assets.length, 1)
assert.equal(normalizedStoredConversation.assets[0].id, '2')
assert.equal(normalizedStoredConversation.assets[0].generation.parentAssetId, '3')

const single = normalizeImportedConversations({
  conversation: {
    title: 'single',
    messages: [{ role: 'user', content: 'single import' }],
    assets: [{ id: 'asset-single', generation: { createdFrom: 'custom_source' } }]
  }
})
assert.equal(single.length, 1)
assert.equal(single[0].title, 'single')
assert.equal(single[0].assets[0].id, 'asset-single')
assert.equal(single[0].assets[0].generation.createdFrom, 'custom_source')

const wrapped = normalizeImportedConversations({
  conversations: [
    { title: 'x'.repeat(100), messages: [], assets: [] }
  ]
})
assert.equal(wrapped.length, 1)
assert.equal(wrapped[0].title.length, 80)

assert.equal(normalizeImportedConversations({ foo: 'bar' }).length, 0)
assert.equal(normalizeImportedConversations({ conversation: { foo: 'bar' } }).length, 0)

const duplicateAssetImport = normalizeImportedConversations({
  conversation: {
    title: 'duplicates',
    assets: [
      { id: 'dup', label: 'first' },
      { id: 'dup', label: 'second' }
    ]
  }
})
assert.equal(duplicateAssetImport[0].assets[0].id, 'dup')
assert.notEqual(duplicateAssetImport[0].assets[1].id, 'dup')
assert.notEqual(duplicateAssetImport[0].assets[0].id, duplicateAssetImport[0].assets[1].id)

const dirtyAssetImport = normalizeImportedConversations({
  conversation: {
    title: 'dirty assets',
    assets: [
      null,
      'bad',
      [],
      { id: 12, label: 'number id' },
      { id: '12', label: 'duplicate string id' },
      { id: 'bad-generation', generation: 'bad generation' }
    ]
  }
})
assert.equal(dirtyAssetImport[0].assets.length, 3)
assert.equal(dirtyAssetImport[0].assets[0].id, '12')
assert.notEqual(dirtyAssetImport[0].assets[1].id, '12')
assert.equal(Object.hasOwn(dirtyAssetImport[0].assets[2].generation, '0'), false)

assert.equal(formatErrorAlert('Import failed', new Error('Bad JSON')), 'Import failed\nBad JSON')
assert.equal(formatErrorAlert('Import failed'), 'Import failed')

const withMessage = appendMessageToConversation(
  { title: '', messages: 'bad messages', assets: [] },
  { id: 'msg-1', role: 'user', content: 'first prompt' }
)
assert.equal(withMessage.title, 'first prompt')
assert.equal(withMessage.messages.length, 1)

const withTask = updateConversationTask(
  { messages: [{ id: 'assistant-1', tasks: [{ status: 'pending', label: 'image' }] }] },
  'assistant-1',
  0,
  { status: 'done', assetId: 'asset-done' }
)
assert.equal(withTask.messages[0].tasks[0].status, 'done')
assert.equal(withTask.messages[0].tasks[0].assetId, 'asset-done')

const added = addAssetToConversationRecord({ assets: 'bad assets' }, { id: 'asset-ledger', label: 'Ledger' })
assert.equal(added.asset.id, 'asset-ledger')
assert.equal(added.conversation.assets[0].id, 'asset-ledger')

const updatedAssetConversation = updateConversationAsset(added.conversation, 'asset-ledger', { isMaterial: true, x: 42, y: 24 })
assert.equal(updatedAssetConversation.assets[0].isMaterial, true)
assert.equal(updatedAssetConversation.assets[0].x, 42)
assert.equal(updatedAssetConversation.assets[0].y, 24)

const normalizedUpdatedAssetConversation = updateConversationAsset(updatedAssetConversation, 'asset-ledger', {
  generation: {
    mode: 'audio',
    parentAssetId: 42,
    sourceAssetIds: 'source-ledger',
    taskId: 7
  }
})
assert.equal(normalizedUpdatedAssetConversation.assets[0].generation.mode, 'audio')
assert.equal(normalizedUpdatedAssetConversation.assets[0].generation.parentAssetId, '42')
assert.deepEqual(normalizedUpdatedAssetConversation.assets[0].generation.sourceAssetIds, ['source-ledger'])
assert.equal(normalizedUpdatedAssetConversation.assets[0].generation.taskId, '7')

const mergedLedgerConversation = updateConversationAsset(
  {
    assets: [
      createAsset({
        id: 'asset-merge-ledger',
        generation: {
          prompt: 'ledger prompt',
          model: 'ledger-model',
          parentAssetId: 'ledger-parent'
        }
      })
    ]
  },
  'asset-merge-ledger',
  { generation: { resolution: '2048' } }
)
assert.equal(mergedLedgerConversation.assets[0].generation.prompt, 'ledger prompt')
assert.equal(mergedLedgerConversation.assets[0].generation.model, 'ledger-model')
assert.equal(mergedLedgerConversation.assets[0].generation.parentAssetId, 'ledger-parent')
assert.equal(mergedLedgerConversation.assets[0].generation.resolution, '2048')

const removedAssetConversation = removeConversationAsset(updatedAssetConversation, 'asset-ledger')
assert.equal(removedAssetConversation.assets.length, 0)

console.log('core data tests passed')
