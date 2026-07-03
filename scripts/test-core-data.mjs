import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createAsset, createGeneration, mergeAsset } from '../src/utils/assetFactory.js'
import { formatErrorAlert, getConversationTitle, normalizeConversationRecord, normalizeImportedConversations } from '../src/utils/conversationImport.js'
import {
  addAssetToConversationRecord,
  appendMessageToConversation,
  removeConversationAsset,
  updateConversationAsset,
  updateConversationTask
} from '../src/utils/conversationStore.js'
import { normalizeProviderList } from '../src/hooks/useConfig.js'
import { createProviderClearPatch, createProviderProfilePatch, createProviderSelectionPatch, defaultProviderTemplatePreset, normalizeProviderTemplate, providerNeedsTemplatePaths, providerTemplatePathStatus, providerTemplatePresets } from '../src/utils/providerConfig.js'

const require = createRequire(import.meta.url)
const customImage = require('../electron/providers/handlers/custom.js')._test
const modelsApi = require('../electron/api/models.js')._test
const { resolveAuth } = require('../electron/providers/auth.js')
const providerRegistry = require('../electron/providers/registry.js')
const { validateGenerationRequest } = require('../electron/providers/validation.js')

assert.deepEqual(
  modelsApi.buildModelAuth({ authType: { type: 'header', key: 'API-KEY' }, apiKey: 'pix-key' }).headers,
  { 'API-KEY': 'pix-key' }
)
assert.deepEqual(
  modelsApi.buildModelAuth({ authType: { type: 'query', key: 'key' }, apiKey: 'gem-key' }).queryParams,
  { key: 'gem-key' }
)
assert.equal(
  modelsApi.buildModelAuth({ authType: { type: 'none' } }).requiresCredential,
  false
)
assert.equal(
  modelsApi.buildModelListUrl('https://api.openai.com', {}).href,
  'https://api.openai.com/v1/models'
)
assert.equal(
  modelsApi.buildModelListUrl('https://openrouter.ai/api', {}).href,
  'https://openrouter.ai/api/v1/models'
)
assert.equal(
  modelsApi.buildModelListUrl('https://ark.cn-beijing.volces.com/api/v3', {}).href,
  'https://ark.cn-beijing.volces.com/api/v3/models'
)
assert.equal(
  modelsApi.buildModelListUrl('https://generativelanguage.googleapis.com/v1beta', { key: 'gem-key' }).href,
  'https://generativelanguage.googleapis.com/v1beta/models?key=gem-key'
)
assert.equal(
  modelsApi.buildModelListUrl('https://relay.example.com/api', { key: 'relay-key' }, { pathPrefix: '/v1', modelListPath: '/models' }).href,
  'https://relay.example.com/api/v1/models?key=relay-key'
)
assert.equal(
  modelsApi.buildModelListUrl('https://relay.example.com/api/v1', {}, { pathPrefix: '/api/v1', modelListPath: '/models' }).href,
  'https://relay.example.com/api/v1/models'
)
assert.throws(
  () => modelsApi.buildModelListUrl('https://relay.example.com', {}, { modelListPath: 'https://evil.example.com/models' }),
  /relative API path/
)
assert.equal(
  modelsApi.buildGeminiModelListUrl('https://generativelanguage.googleapis.com', { key: 'gem-key' }).href,
  'https://generativelanguage.googleapis.com/v1beta/models?key=gem-key'
)
assert.equal(
  modelsApi.buildGeminiModelListUrl('https://generativelanguage.googleapis.com/v1beta', { key: 'gem-key' }).href,
  'https://generativelanguage.googleapis.com/v1beta/models?key=gem-key'
)
assert.deepEqual(
  modelsApi.handleFetchError(new Error('HTTP 401: bad key'), {}),
  []
)
assert.throws(
  () => modelsApi.handleFetchError(new Error('HTTP 401: sk-abcdefghijklmnopqrstuvwxyz123456'), { reportErrors: true }),
  (error) => error.message.includes('HTTP 401') && error.message.includes('[redacted]') && !error.message.includes('abcdefghijklmnopqrstuvwxyz123456')
)
assert.deepEqual(
  resolveAuth({ authType: { type: 'bearer' } }, { apiKey: 'secret-key' }, { customAuth: { type: 'header', headerName: 'X-API-Key' } }).headers,
  { 'X-API-Key': 'secret-key' }
)
assert.deepEqual(
  resolveAuth({ authType: { type: 'bearer' } }, { apiKey: 'secret-key' }, { authType: { type: 'query', paramName: 'key' } }).queryParams,
  { key: 'secret-key' }
)
assert.deepEqual(
  resolveAuth({ authType: { type: 'bearer' } }, { sessionToken: 'session-key' }, { customAuth: { type: 'session', sessionHeaderName: 'X-Session' } }).headers,
  { 'X-Session': 'session-key' }
)
assert.deepEqual(
  resolveAuth({ authType: { type: 'none' } }, { apiKey: 'secret-key' }),
  { headers: {}, queryParams: {} }
)
assert.throws(
  () => resolveAuth({ authType: { type: 'bearer' } }, { apiKey: 'secret-key' }, { customAuth: { type: 'header', headerName: 'Cookie' } }),
  /Restricted custom auth header name/
)
assert.ok(providerRegistry.getModelCatalog('openai', 'image').includes('gpt-image-2'))
assert.ok(providerRegistry.getModelCatalog('google', 'chat').includes('gemini-2.5-pro'))
assert.equal(providerRegistry.getModelCatalog('chatgpt-plans', 'chat').length, 0)
assert.equal(providerRegistry.getProviderCallMode('openai', 'chat', true), 'direct-api')
assert.equal(providerRegistry.getProviderSetupMode('openai', 'chat', true), 'api-key')
assert.equal(providerRegistry.getProviderCallMode('custom-image', 'image', true), 'custom-api')
assert.equal(providerRegistry.getProviderSetupMode('custom-image', 'image', true), 'custom-api')
assert.equal(providerRegistry.getProviderCallMode('chatgpt-plans', 'chat', false), 'subscription-reference')
assert.equal(providerRegistry.getProviderSetupMode('chatgpt-plans', 'chat', false), 'subscription-reference')
const stabilityProvider = providerRegistry.getProvider('stability')
const stabilityUiProvider = { id: 'stability', integrationStatus: 'custom-template' }
assert.equal(providerNeedsTemplatePaths('image', stabilityUiProvider), true)
assert.equal(providerTemplatePathStatus('image', { template: { requestBody: { prompt: '{prompt}' } } }).ready, false)
assert.equal(providerTemplatePathStatus('image', { template: { path: '/v1/generation' } }).ready, true)
assert.equal(providerNeedsTemplatePaths('image', { id: 'custom-image', integrationStatus: 'handler' }), false)
assert.equal(providerNeedsTemplatePaths('video', { id: 'custom-video', protocol: 'custom_video_task' }), true)
assert.equal(providerTemplatePathStatus('video', { template: { submitPath: '/v1/jobs' } }).ready, false)
assert.equal(providerTemplatePathStatus('video', { submitPath: '/v1/jobs', pollPath: '/v1/jobs/{taskId}' }).ready, true)
const falImagePreset = providerTemplatePresets('image', { id: 'fal' })[0]
assert.equal(falImagePreset.id, 'fal-image')
assert.equal(falImagePreset.labelKey, 'presetFalImage')
assert.equal(falImagePreset.template.path, '/{model}')
const replicateVideoPreset = providerTemplatePresets('video', { id: 'replicate' })[0]
assert.equal(replicateVideoPreset.id, 'replicate-video-prediction')
assert.equal(replicateVideoPreset.labelKey, 'presetReplicatePrediction')
assert.equal(providerTemplatePathStatus('video', { template: replicateVideoPreset.template }).ready, true)
assert.ok(providerTemplatePresets('image', { id: 'stability' }).some(item => item.id === 'openai-image-json'))
assert.equal(defaultProviderTemplatePreset('image', { id: 'stability' }), undefined)
assert.equal(defaultProviderTemplatePreset('image', { id: 'fal' }).id, 'fal-image')
assert.equal(defaultProviderTemplatePreset('video', { id: 'custom-video' }).id, 'generic-video-task')
const imageTemplateValidation = validateGenerationRequest('image', stabilityProvider, {
  prompt: 'draw a glass cube',
  model: 'stable-image-core',
  ratio: '1:1',
  template: {
    path: '/v1/generation/{model}',
    requestBody: { prompt: '{prompt}', aspect_ratio: '{ratio}' },
    imageUrlPath: 'data[0].url'
  }
})
assert.equal(imageTemplateValidation.ok, true)
const imageTemplateMissingPath = validateGenerationRequest('image', stabilityProvider, {
  prompt: 'draw a glass cube',
  model: 'stable-image-core',
  template: { requestBody: { prompt: '{prompt}' } }
})
assert.equal(imageTemplateMissingPath.ok, false)
assert.equal(imageTemplateMissingPath.errors[0].code, 'CUSTOM_TEMPLATE_FIELD_REQUIRED')
const customVideoValidation = validateGenerationRequest('video', providerRegistry.getProvider('custom-video'), {
  prompt: 'slow camera move',
  model: 'video-model',
  template: {
    submitPath: '/v1/jobs',
    pollPath: '/v1/jobs/{taskId}',
    submitBody: { prompt: '{prompt}', model: '{model}' },
    pollBody: { id: '{taskId}' },
    taskIdPath: 'data.id',
    statusPath: 'status',
    videoUrlPath: 'output[0]'
  }
})
assert.equal(customVideoValidation.ok, true)
const invalidTemplateVariable = validateGenerationRequest('image', stabilityProvider, {
  prompt: 'draw a glass cube',
  model: 'stable-image-core',
  template: {
    path: '/v1/images',
    requestBody: { prompt: '{prompt}', secret: '{apiKey}' }
  }
})
assert.equal(invalidTemplateVariable.ok, false)
assert.equal(invalidTemplateVariable.errors.some(item => item.code === 'CUSTOM_TEMPLATE_VARIABLE_UNSUPPORTED'), true)
const fallbackTemplateProvider = normalizeProviderList('image', [{
  id: 'fallback-relay',
  name: 'Fallback Relay',
  platform: 'Relay',
  defaultUrl: 'https://api.example.com',
  defaultModel: 'image-model',
  protocol: 'relay_image',
  integrationStatus: 'metadata',
  executable: false,
  capabilities: { image: { textToImage: true, relay: true, integrationStatus: 'metadata' } }
}])[0]
assert.equal(fallbackTemplateProvider.executable, true)
assert.equal(fallbackTemplateProvider.integrationStatus, 'custom-template')
assert.equal(fallbackTemplateProvider.callMode, 'custom-api')
assert.equal(fallbackTemplateProvider.setupMode, 'custom-api')
const fallbackSubscriptionProvider = normalizeProviderList('chat', [{
  id: 'chat-plan',
  name: 'Chat Plan',
  platform: 'Web',
  defaultUrl: '',
  defaultModel: '',
  integrationStatus: 'metadata',
  executable: false,
  billing: { mode: 'subscription' },
  capabilities: { chat: { text: true, webSubscription: true, integrationStatus: 'metadata' } }
}])[0]
assert.equal(fallbackSubscriptionProvider.executable, false)
assert.equal(fallbackSubscriptionProvider.callMode, 'subscription-reference')
const providerSwitchPatch = createProviderSelectionPatch({
  id: 'stability',
  defaultUrl: 'https://api.stability.ai',
  defaultModel: 'stable-image-core',
  protocol: 'stability_image',
  authType: { type: 'bearer' }
}, 'image')
assert.equal(providerSwitchPatch.id, 'stability')
assert.equal(providerSwitchPatch.baseUrl, 'https://api.stability.ai')
assert.equal(providerSwitchPatch.model, 'stable-image-core')
assert.deepEqual(providerSwitchPatch.template, {})
assert.equal(providerSwitchPatch.customAuth && Object.keys(providerSwitchPatch.customAuth).length, 0)
assert.equal(providerSwitchPatch.pathPrefix, '')
assert.equal(providerSwitchPatch.modelListPath, '')
assert.equal(providerSwitchPatch.requestBody, '')
assert.equal(providerSwitchPatch.submitBody, '')
assert.equal(providerSwitchPatch.method, '')
assert.equal(providerSwitchPatch.submitMethod, '')
const falProviderSwitchPatch = createProviderSelectionPatch({
  id: 'fal',
  defaultUrl: 'https://fal.run',
  defaultModel: 'fal-ai/flux-pro',
  protocol: 'fal_image_task'
}, 'image')
assert.deepEqual(falProviderSwitchPatch.template, providerTemplatePresets('image', { id: 'fal' })[0].template)
const customVideoSwitchPatch = createProviderSelectionPatch({
  id: 'custom-video',
  defaultUrl: '',
  defaultModel: '',
  protocol: 'custom_video_task'
}, 'video')
assert.equal(customVideoSwitchPatch.template.submitPath, '/v1/videos')
assert.equal(customVideoSwitchPatch.template.pollPath, '/v1/videos/{taskId}')
const profileSwitchPatch = createProviderProfilePatch({
  providerId: 'custom-image',
  apiKey: 'saved-key',
  baseUrl: 'https://relay.example.com',
  model: 'img-model',
  template: { requestBody: { prompt: '{prompt}' } },
  pathPrefix: '/v1',
  timeout: 120000
})
assert.equal(profileSwitchPatch.id, 'custom-image')
assert.equal(profileSwitchPatch.apiKey, 'saved-key')
assert.deepEqual(profileSwitchPatch.template, { requestBody: { prompt: '{prompt}' }, pathPrefix: '/v1' })
assert.equal(profileSwitchPatch.pathPrefix, '/v1')
assert.equal(profileSwitchPatch.modelListPath, '')
assert.equal(profileSwitchPatch.body, '')
assert.equal(profileSwitchPatch.submitBody, '')
assert.equal(profileSwitchPatch.method, '')
assert.equal(profileSwitchPatch.timeout, 120000)
const legacyProfilePatch = createProviderProfilePatch({
  providerId: 'custom-video',
  baseUrl: 'https://relay.example.com',
  model: 'video-model',
  customTemplate: { submitPath: '/old-submit', statusPath: 'status' },
  submitPath: '/new-submit',
  pollPath: '/tasks/{taskId}',
  submitBody: { prompt: '{prompt}' },
  modelsPath: '/api/models'
})
assert.deepEqual(legacyProfilePatch.template, {
  submitPath: '/new-submit',
  statusPath: 'status',
  pollPath: '/tasks/{taskId}',
  submitBody: { prompt: '{prompt}' }
})
assert.equal(legacyProfilePatch.modelListPath, '/api/models')
assert.equal(legacyProfilePatch.submitPath, '')
assert.deepEqual(
  normalizeProviderTemplate({ customTemplate: { path: '/old' }, template: { path: '/template' }, path: '/top' }),
  { path: '/top' }
)
const clearProviderPatch = createProviderClearPatch()
assert.equal(clearProviderPatch.id, '')
assert.deepEqual(clearProviderPatch.template, {})
assert.equal(clearProviderPatch.requestBody, '')
assert.equal(clearProviderPatch.pollInterval, '')

assert.equal(
  customImage.buildUrl('https://relay.example.com', '', '/v1/images/generations', {}, {}, 'Image path').href,
  'https://relay.example.com/v1/images/generations'
)
assert.equal(
  customImage.buildUrl('https://relay.example.com/v1', '', '/v1/images/generations', {}, {}, 'Image path').href,
  'https://relay.example.com/v1/images/generations'
)
assert.equal(
  customImage.buildUrl('https://relay.example.com/api/v1', '', '/v1/images/generations', {}, {}, 'Image path').href,
  'https://relay.example.com/api/v1/images/generations'
)
assert.equal(
  customImage.buildUrl('https://relay.example.com/api', '/v1', '/images/generations', {}, {}, 'Image path').href,
  'https://relay.example.com/api/v1/images/generations'
)
assert.equal(
  customImage.buildUrl('https://relay.example.com/api/v1', '/api/v1', '/images/generations', {}, {}, 'Image path').href,
  'https://relay.example.com/api/v1/images/generations'
)
assert.equal(
  customImage.buildUrl('https://fal.run', '', '/{model}', { model: 'fal-ai/flux-pro' }, {}, 'Image path').href,
  'https://fal.run/fal-ai/flux-pro'
)
assert.equal(
  customImage.buildUrl('https://api.replicate.com', '', '/v1/models/{model}/predictions', { model: 'black-forest-labs/flux-schnell' }, {}, 'Image path').href,
  'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions'
)
assert.deepEqual(
  customImage.applyTemplate(
    { model: '{model}', prompt: '{{prompt}}', size: '{ratio}', nested: ['${resolution}', '{negativePrompt}'] },
    { model: 'img-model', prompt: 'draw a cube', ratio: '1:1', resolution: '1024', negativePrompt: 'blur' }
  ),
  { model: 'img-model', prompt: 'draw a cube', size: '1:1', nested: ['1024', 'blur'] }
)
assert.deepEqual(
  customImage.applyTemplate(
    { task_id: '{taskId}', model: '{model}' },
    { model: 'video-model' },
    { taskId: 'task-123' }
  ),
  { task_id: 'task-123', model: 'video-model' }
)
assert.throws(
  () => customImage.applyTemplate({ bad: '{apiKey}' }, { model: 'x' }),
  /Unsupported template variable/
)
assert.equal(
  customImage.getTemplate({
    action: 'generate',
    body: { stale: true },
    requestBody: { prompt: '{prompt}' }
  }).requestBody.prompt,
  '{prompt}'
)
assert.deepEqual(
  customImage.customImageBodyTemplate({
    body: { stale: true },
    submitBody: { alsoStale: true },
    requestBody: { prompt: '{prompt}' }
  }),
  { prompt: '{prompt}' }
)
assert.equal(customImage.extractImage({ data: [{ b64_json: 'abc123' }] }), 'data:image/png;base64,abc123')
assert.equal(
  customImage.extractImage({ data: [{ b64_json: 'abc123' }] }, { imageUrlPath: 'data[0].b64_json' }),
  'data:image/png;base64,abc123'
)
assert.equal(customImage.extractImage({ data: [{ url: 'https://cdn.example.com/a.png' }] }), 'https://cdn.example.com/a.png')
assert.equal(
  customImage.extractImage({ data: [{ url: 'https://cdn.example.com/a.png' }] }, { imageUrlPath: 'data[0].url' }),
  'https://cdn.example.com/a.png'
)
assert.equal(
  customImage.extractImage({ candidates: [{ content: { parts: [{ inlineData: { data: 'gemini123' } }] } }] }, { imageUrlPath: 'candidates[0].content.parts[0].inlineData.data' }),
  'data:image/png;base64,gemini123'
)
assert.equal(customImage.extractImage({ images: [{ url: 'https://cdn.example.com/b.png' }] }), 'https://cdn.example.com/b.png')
assert.equal(
  customImage.extractImage({ result: { images: [{ url: 'https://cdn.example.com/c.png' }] } }, { imageUrlPath: 'result.images[0].url' }),
  'https://cdn.example.com/c.png'
)

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
