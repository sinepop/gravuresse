import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import Module from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { assetUrlCases } from './core-tests/asset-url-fixtures.mjs'
import { runHttpCoreTests } from './core-tests/http.mjs'
import { runIpcCoreTests } from './core-tests/ipc.mjs'
import { runProviderConnectionCoreTests } from './core-tests/provider-connections.mjs'
import { createAsset, createGeneration, mergeAsset } from '../src/utils/assetFactory.js'
import { sanitizeAssetUrl } from '../src/utils/mediaSecurity.js'
import { normalizePreviewUrl } from '../src/hooks/useSafeMediaUrl.js'
import { formatErrorAlert, getConversationTitle, normalizeConversationRecord, normalizeImportedConversations } from '../src/utils/conversationImport.js'
import { buildGenerationMeta, parseDurationSeconds } from '../src/utils/generationTasks.js'
import {
  canonicalProviderKey,
  isModelEndpointUnsupportedError,
  isProviderNetworkError,
  profileKey,
  providerAuthConfig,
  providerCredentialReady
} from '../src/utils/settingsProviderHelpers.js'
import {
  addAssetToConversationRecord,
  appendMessageToConversation,
  removeConversationAsset,
  updateConversationAsset,
  updateConversationTask
} from '../src/utils/conversationStore.js'
import { normalizeProviderList } from '../src/hooks/useConfig.js'
import { buildConfigProviderProfiles, createProviderClearPatch, createProviderProfilePatch, createProviderSelectionPatch, defaultProviderTemplatePreset, normalizeProviderTemplate, providerNeedsTemplatePaths, providerTemplatePathStatus, providerTemplatePresets } from '../src/utils/providerConfig.js'
import { migrateProviderAccounts, providerPatchFromAccount, findProviderAccount, normalizeProviderAccount, providerGatewayPresetPatch, OPENAI_COMPATIBLE_GATEWAY_PRESETS } from '../src/utils/providerAccounts.js'
import modelCapabilities from '../shared/modelCapabilities.cjs'

const require = createRequire(import.meta.url)
function requireWithElectronMock(modulePath, electronMock) {
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

const customImage = require('../electron/providers/handlers/custom.js')._test
const modelsApi = require('../electron/api/models.js')._test
const { downloadToFile } = require('../electron/api/http.js')
const openAiHandlerTests = require('../electron/providers/handlers/openai.js')._test
const { classifyModel } = modelCapabilities
const mediaCache = require('../electron/media-cache.js')
const configModule = requireWithElectronMock('../electron/config.js', {
  app: { getPath: () => path.join(os.tmpdir(), 'gravuresse-config-test') },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: value => Buffer.from(String(value)),
    decryptString: value => Buffer.from(value).toString('utf8')
  }
})
const { resolveAuth } = require('../electron/providers/auth.js')
const providerRegistry = require('../electron/providers/registry.js')
const registryUtils = require('../electron/providers/registry-utils.js')
const providerAccountResolver = require('../electron/providers/account-resolver.js')
const configResolver = require('../electron/providers/config-resolver.js')
const providerPipeline = require('../electron/providers/pipeline.js')
const { validateGenerationRequest } = require('../electron/providers/validation.js')
const { buildProviderImageTestPayload } = require('../electron/providers/image-test.js')
const mainSanitize = require('../electron/security/sanitize.js')

await runHttpCoreTests()
await runIpcCoreTests()
await runProviderConnectionCoreTests(configModule)

const pollutedConfig = JSON.parse('{"providers":{"image":{"id":"custom-image"},"__proto__":{"template":{"path":"/evil"}}},"general":{"constructor":{"prototype":{"bad":"yes"}}}}')
const sanitizedConfig = configModule._test.sanitizeObjectShape(pollutedConfig)
assert.equal(sanitizedConfig.providers.template, undefined)
assert.equal(Object.hasOwn(sanitizedConfig.general, 'constructor'), false)
assert.equal({}.bad, undefined)
const mergedPollutedConfig = configModule._test.deepMerge(configModule.DEFAULT_CONFIG, pollutedConfig)
assert.equal(mergedPollutedConfig.providers.image.id, 'custom-image')
assert.equal(mergedPollutedConfig.providers.template, undefined)
assert.equal(Object.hasOwn(mergedPollutedConfig.general, 'constructor'), false)
assert.equal(Array.isArray(configModule.DEFAULT_CONFIG.providers), false, 'runtime providers must remain a track map')
assert.equal(configModule.DEFAULT_CONFIG.providers.chat.id, 'custom-chat')
assert.equal(configModule.DEFAULT_CONFIG.providers.image.id, 'openai')
assert.equal(configModule.DEFAULT_CONFIG.providers.video.id, 'volcengine')
assert.ok(Array.isArray(configModule.DEFAULT_CONFIG.chatProviders), 'custom chat provider candidates use a separate list')
const migratedArrayConfig = configModule._test.migrateOldProviderFormat({
  providers: [
    { name: 'First', baseUrl: 'https://first.example.com/v1', apiKey: 'first-secret', defaultModel: 'first-model', enabled: false },
    { name: 'Second', baseUrl: 'https://second.example.com/v1', apiKey: 'second-secret', defaultModel: 'second-model', models: ['second-model'], enabled: true }
  ],
  savedChatModel: 'saved-model'
})
assert.equal(Array.isArray(migratedArrayConfig.providers), false)
assert.equal(migratedArrayConfig.providers.chat.id, 'custom-chat')
assert.equal(migratedArrayConfig.providers.chat.baseUrl, 'https://second.example.com/v1')
assert.equal(migratedArrayConfig.providers.chat.apiKey, 'second-secret')
assert.equal(migratedArrayConfig.providers.chat.model, 'saved-model')
assert.equal(migratedArrayConfig.providers.image.id, 'openai')
assert.equal(migratedArrayConfig.chatProviders.length, 2)
const migratedProfiles = buildConfigProviderProfiles(migratedArrayConfig)
assert.deepEqual(migratedProfiles.map(profile => profile.model), ['second-model'])
const migratedRuntime = configResolver.resolveRuntimeProviderConfig(
  migratedArrayConfig,
  'chat',
  {
    action: 'chat',
    providerId: 'custom-chat',
    baseUrl: 'https://second.example.com/v1',
    model: 'saved-model'
  },
  providerRegistry.getProvider,
  () => async () => ({ text: 'ok' })
)
assert.equal(migratedRuntime.ok, false, 'legacy static provider configuration must not authorize runtime generation')
assert.equal(migratedRuntime.error.code, 'LEGACY_PROVIDER_UNAVAILABLE')

const customChatSecretConfig = {
  providers: {
    chat: { id: 'custom-chat', apiKey: 'candidate-secret', baseUrl: 'https://relay.example.com/v1', model: 'relay-model' }
  },
  chatProviders: [
    { name: 'Relay', baseUrl: 'https://relay.example.com/v1', apiKey: 'candidate-secret', defaultModel: 'relay-model', enabled: true }
  ],
  providerProfiles: { chat: [], image: [], video: [] },
  providerAccounts: []
}
const redactedCustomChat = configModule.redactApiKeys(customChatSecretConfig)
assert.equal(redactedCustomChat.providers.chat.apiKey, configModule.REDACTED_API_KEY)
assert.equal(redactedCustomChat.chatProviders[0].apiKey, configModule.REDACTED_API_KEY)
const mergedCustomChat = configModule.mergeRedactedApiKeys(redactedCustomChat, customChatSecretConfig)
assert.equal(mergedCustomChat.providers.chat.apiKey, 'candidate-secret')
assert.equal(mergedCustomChat.chatProviders[0].apiKey, 'candidate-secret')
const redirectedCustomChat = configModule.mergeRedactedApiKeys({
  ...redactedCustomChat,
  providers: { chat: { ...redactedCustomChat.providers.chat, baseUrl: 'https://attacker.example.com/v1' } },
  chatProviders: [{ ...redactedCustomChat.chatProviders[0], baseUrl: 'https://attacker.example.com/v1' }]
}, customChatSecretConfig)
assert.equal(redirectedCustomChat.providers.chat.apiKey, '', 'saved active secret must not follow a changed endpoint')
assert.equal(redirectedCustomChat.chatProviders[0].apiKey, '', 'saved candidate secret must not follow a changed endpoint')
const reauthedCustomChat = configModule.mergeRedactedApiKeys({
  ...redactedCustomChat,
  providers: { chat: { ...redactedCustomChat.providers.chat, authType: { type: 'query', key: 'key' } } },
  chatProviders: [{ ...redactedCustomChat.chatProviders[0], authType: { type: 'query', key: 'key' } }]
}, customChatSecretConfig)
assert.equal(reauthedCustomChat.providers.chat.apiKey, '', 'saved active secret must not follow a changed auth scheme')
assert.equal(reauthedCustomChat.chatProviders[0].apiKey, '', 'saved candidate secret must not follow a changed auth scheme')
const accountSecretConfig = {
  providers: { chat: { id: 'deepseek', apiKey: 'track-secret', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' } },
  providerProfiles: { chat: [], image: [], video: [] },
  providerAccounts: [{ accountId: 'acct_test', providerId: 'deepseek', kind: 'api-key', apiKey: 'account-secret', sessionToken: 'session-secret', baseUrl: 'https://api.deepseek.com' }]
}
const redactedAccountConfig = configModule.redactApiKeys(accountSecretConfig)
assert.equal(redactedAccountConfig.providerAccounts[0].apiKey, configModule.REDACTED_API_KEY)
assert.equal(redactedAccountConfig.providerAccounts[0].sessionToken, configModule.REDACTED_API_KEY)
const mergedRedactedAccount = configModule.mergeRedactedApiKeys(redactedAccountConfig, accountSecretConfig)
assert.equal(mergedRedactedAccount.providerAccounts[0].apiKey, 'account-secret')
assert.equal(mergedRedactedAccount.providerAccounts[0].sessionToken, 'session-secret')

// Unified secret fields: token, accessKey, secretKey should be redacted and preserved on merge
assert.ok(Array.isArray(configModule.SECRET_FIELDS), 'SECRET_FIELDS exported')
assert.ok(configModule.SECRET_FIELDS.includes('token'))
assert.ok(configModule.SECRET_FIELDS.includes('accessKey'))
assert.ok(configModule.SECRET_FIELDS.includes('secretKey'))

const extendedSecretConfig = {
  providers: {
    chat: { id: 's3', apiKey: '', sessionToken: '', token: '', accessKey: 'ak-123', secretKey: 'sk-456', baseUrl: 'https://s3.example.com', model: 'test' },
    image: { id: 'openai', apiKey: '', sessionToken: '', baseUrl: 'https://api.openai.com', model: 'gpt-image-2' },
    video: { id: 'volcengine', apiKey: '', sessionToken: '', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'test' }
  },
  providerProfiles: {
    chat: [{ id: 'minio', accessKey: 'profile-ak', secretKey: 'profile-sk', token: 'profile-token', baseUrl: 'https://minio.example.com', model: 'model-1' }],
    image: [],
    video: []
  },
  providerAccounts: [
    { accountId: 'acct_s3', kind: 'api-key', providerId: 's3', apiKey: '', sessionToken: '', token: 'acct-token', accessKey: 'acct-ak', secretKey: 'acct-sk', baseUrl: 'https://s3.example.com' }
  ]
}
const redactedExtended = configModule.redactApiKeys(extendedSecretConfig)
assert.equal(redactedExtended.providers.chat.accessKey, configModule.REDACTED_API_KEY)
assert.equal(redactedExtended.providers.chat.secretKey, configModule.REDACTED_API_KEY)
assert.equal(redactedExtended.providerProfiles.chat[0].accessKey, configModule.REDACTED_API_KEY)
assert.equal(redactedExtended.providerProfiles.chat[0].secretKey, configModule.REDACTED_API_KEY)
assert.equal(redactedExtended.providerProfiles.chat[0].token, configModule.REDACTED_API_KEY)
assert.equal(redactedExtended.providerAccounts[0].token, configModule.REDACTED_API_KEY)
assert.equal(redactedExtended.providerAccounts[0].accessKey, configModule.REDACTED_API_KEY)
assert.equal(redactedExtended.providerAccounts[0].secretKey, configModule.REDACTED_API_KEY)
// Empty fields stay empty, not invented
assert.equal(redactedExtended.providers.chat.token, '')
assert.equal(redactedExtended.providers.image.apiKey, '')

const mergedExtended = configModule.mergeRedactedApiKeys(redactedExtended, extendedSecretConfig)
assert.equal(mergedExtended.providers.chat.accessKey, 'ak-123')
assert.equal(mergedExtended.providers.chat.secretKey, 'sk-456')
assert.equal(mergedExtended.providerProfiles.chat[0].accessKey, 'profile-ak')
assert.equal(mergedExtended.providerProfiles.chat[0].secretKey, 'profile-sk')
assert.equal(mergedExtended.providerProfiles.chat[0].token, 'profile-token')
assert.equal(mergedExtended.providerAccounts[0].token, 'acct-token')
assert.equal(mergedExtended.providerAccounts[0].accessKey, 'acct-ak')
assert.equal(mergedExtended.providerAccounts[0].secretKey, 'acct-sk')
assert.equal(mergedExtended.providers.chat.token, '', 'empty secret stays empty after merge')

assert.equal(parseDurationSeconds('8s', 5), 8)
assert.equal(parseDurationSeconds('bad', 5), 5)
assert.deepEqual(
  buildGenerationMeta({
    task: { prompt: 'p', negative_prompt: 'n', sourceAssetIds: ['a', 'a'], promptReferenceAssetIds: ['r'], duration: 5 },
    provider: { id: 'openai', model: 'gpt-image-2' },
    mode: 'generate_image',
    taskId: 'task-1'
  }).sourceAssetIds,
  ['a']
)
assert.equal(canonicalProviderKey('image', 'dalle'), 'openai')
assert.deepEqual(providerAuthConfig({ authType: { type: 'api_key', key: 'x-api-key' } }, {}), { type: 'api-key', key: 'x-api-key' })
assert.equal(providerCredentialReady({ id: 'local', authType: { type: 'none' } }, {}), true)
assert.equal(providerCredentialReady({ id: 'deepseek', authType: { type: 'bearer' } }, { id: 'deepseek', accountId: 'acct_ready', accountKind: 'api-key' }), true)
assert.equal(providerCredentialReady({ id: 'openai', authType: { type: 'bearer' } }, { id: 'openai', accountId: 'acct_oauth', accountKind: 'oauth-placeholder' }), false)
assert.equal(isModelEndpointUnsupportedError(new Error('HTTP 404 Not Found')), true)
assert.equal(isModelEndpointUnsupportedError(new Error('HTTP 405 Method Not Allowed')), true)
assert.equal(isProviderNetworkError(new Error("Error invoking remote method 'api:models': Error: connect ETIMEDOUT 184.173.136.86:443")), true)
assert.equal(isProviderNetworkError(new Error('getaddrinfo ENOTFOUND api.openai.com')), true)
assert.equal(isProviderNetworkError(new Error('HTTP 503 Service Unavailable')), true)
assert.equal(isProviderNetworkError(new Error('HTTP 401: bad key')), false)
assert.equal(profileKey('image', { providerId: 'dalle', baseUrl: 'https://api.example.com', model: 'm' }), 'image|openai|https://api.example.com|m')
const migratedAccountsConfig = migrateProviderAccounts({
  providers: {
    chat: { id: 'deepseek', apiKey: 'chat-secret', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
    image: { id: 'openai', apiKey: 'image-secret', baseUrl: 'https://api.openai.com', model: 'gpt-image-2' }
  },
  providerProfiles: {
    chat: [{ providerId: 'openrouter', apiKey: 'router-secret', baseUrl: 'https://openrouter.ai/api', model: 'openai/gpt-5.1' }],
    image: [],
    video: []
  }
}, {
  chat: [
    { id: 'deepseek', name: 'DeepSeek', defaultUrl: 'https://api.deepseek.com', authType: { type: 'bearer' } },
    { id: 'openrouter', name: 'OpenRouter', defaultUrl: 'https://openrouter.ai/api', authType: { type: 'bearer' } }
  ],
  image: [{ id: 'openai', name: 'OpenAI', defaultUrl: 'https://api.openai.com', authType: { type: 'bearer' } }],
  video: []
})
assert.ok(migratedAccountsConfig.providers.chat.accountId)
assert.ok(migratedAccountsConfig.providers.image.accountId)
assert.ok(migratedAccountsConfig.providerProfiles.chat[0].accountId)
assert.equal(migratedAccountsConfig.providerAccounts.length, 3)
assert.equal(migratedAccountsConfig.providers.chat.apiKey, '')
assert.equal(migratedAccountsConfig.providerProfiles.chat[0].apiKey, '')
const migratedDeepSeek = findProviderAccount(migratedAccountsConfig, migratedAccountsConfig.providers.chat.accountId)
assert.equal(migratedDeepSeek.apiKey, 'chat-secret')
assert.equal(providerPatchFromAccount(migratedDeepSeek).baseUrl, 'https://api.deepseek.com')
assert.equal(providerPatchFromAccount(migratedDeepSeek).apiKey, '')
const redactedProviderMigration = migrateProviderAccounts({
  providers: {
    chat: { id: 'custom-chat', apiKey: configModule.REDACTED_API_KEY, baseUrl: 'https://relay.example.com/v1', model: 'relay-model' }
  },
  providerProfiles: { chat: [], image: [], video: [] },
  providerAccounts: []
}, {
  chat: [{ id: 'custom-chat', name: 'Custom Chat API', defaultUrl: '', authType: { type: 'bearer' } }],
  image: [],
  video: []
})
assert.equal(redactedProviderMigration.providerAccounts.length, 0, 'redacted placeholders must not create credential accounts')
assert.equal(redactedProviderMigration.providers.chat.apiKey, configModule.REDACTED_API_KEY)
const selectedCustomProfile = buildConfigProviderProfiles(redactedCustomChat)[0]
const selectedCustomPrepared = migrateProviderAccounts({
  ...redactedCustomChat,
  providers: { ...redactedCustomChat.providers, chat: createProviderProfilePatch(selectedCustomProfile) }
}, {
  chat: [{ id: 'custom-chat', name: 'Custom Chat API', defaultUrl: '', authType: { type: 'bearer' } }],
  image: [],
  video: []
})
const selectedCustomStored = configModule.mergeRedactedApiKeys(selectedCustomPrepared, customChatSecretConfig)
assert.equal(selectedCustomStored.providerAccounts.length, 0)
assert.equal(selectedCustomStored.providers.chat.apiKey, 'candidate-secret', 'selected custom profile restores its saved secret on the same endpoint')
const listOnlyCustomSecretConfig = {
  ...customChatSecretConfig,
  providers: { chat: { ...customChatSecretConfig.providers.chat, apiKey: '' } }
}
const listOnlyRedacted = configModule.redactApiKeys(listOnlyCustomSecretConfig)
const listOnlyProfile = buildConfigProviderProfiles(listOnlyRedacted)[0]
const listOnlySelected = configModule.mergeRedactedApiKeys({
  ...listOnlyRedacted,
  providers: { chat: createProviderProfilePatch(listOnlyProfile) }
}, listOnlyCustomSecretConfig)
assert.equal(listOnlySelected.providers.chat.apiKey, 'candidate-secret', 'first custom selection falls back to the candidate secret')
const migratedGatewayConfig = migrateProviderAccounts({
  providers: {
    chat: { id: 'openai', accountId: 'acct_gateway', accountKind: 'gateway', apiKey: '', baseUrl: 'https://relay.example.com', model: 'gpt-5.1' }
  },
  providerProfiles: {
    chat: [{ providerId: 'openai', accountId: 'acct_gateway', accountKind: 'gateway', baseUrl: 'https://relay.example.com', model: 'gpt-5.1' }],
    image: [],
    video: []
  },
  providerAccounts: [
    { accountId: 'acct_gateway', kind: 'gateway', providerId: 'openai', apiKey: 'gateway-secret', baseUrl: 'https://relay.example.com', tracks: ['chat', 'image'] }
  ]
}, {
  chat: [{ id: 'openai', name: 'OpenAI', defaultUrl: 'https://api.openai.com', authType: { type: 'bearer' } }],
  image: [{ id: 'openai', name: 'OpenAI Image', defaultUrl: 'https://api.openai.com', authType: { type: 'bearer' } }],
  video: []
})
assert.equal(migratedGatewayConfig.providers.chat.accountId, 'acct_gateway')
assert.equal(migratedGatewayConfig.providers.chat.accountKind, 'gateway')
assert.equal(migratedGatewayConfig.providerProfiles.chat[0].accountId, 'acct_gateway')
assert.equal(migratedGatewayConfig.providerAccounts.length, 1)
assert.equal(migratedGatewayConfig.providerAccounts[0].kind, 'gateway')
assert.equal(migratedGatewayConfig.providerAccounts[0].apiKey, 'gateway-secret')
const newApiGatewayPreset = providerGatewayPresetPatch('newapi')
assert.equal(newApiGatewayPreset.kind, 'gateway')
assert.equal(newApiGatewayPreset.providerId, 'openai')
assert.equal(newApiGatewayPreset.name, 'New API / One API Relay')
assert.equal(newApiGatewayPreset.apiKey, undefined)
assert.equal(newApiGatewayPreset.sessionToken, undefined)
assert.deepEqual(newApiGatewayPreset.authType, { type: 'bearer' })
assert.equal(newApiGatewayPreset.modelListPath, '/v1/models')
assert.equal(newApiGatewayPreset.template.path, '/v1/images/generations')
assert.equal(newApiGatewayPreset.template.pollPath, '/v1/images/tasks/{taskId}')
assert.deepEqual(newApiGatewayPreset.tracks, ['chat', 'image'])
assert.equal(providerGatewayPresetPatch('sub2api').name, 'sub2api Relay')
assert.equal(providerGatewayPresetPatch('cpa-compatible').name, 'CPA compatible Relay')
assert.equal(providerGatewayPresetPatch('openai-compatible').name, 'OpenAI-compatible Relay')
assert.equal(providerGatewayPresetPatch('unknown-id').name, 'OpenAI-compatible Relay', 'unknown preset id falls back to first preset')
// All gateway presets are covered and distinct
const presetIds = OPENAI_COMPATIBLE_GATEWAY_PRESETS.map(p => p.id)
assert.deepEqual(presetIds, ['openai-compatible', 'newapi', 'sub2api', 'cpa-compatible'])
for (const preset of OPENAI_COMPATIBLE_GATEWAY_PRESETS) {
  const patch = providerGatewayPresetPatch(preset.id)
  assert.equal(patch.name, preset.name, `preset ${preset.id} name mismatch`)
  assert.equal(patch.kind, 'gateway')
  assert.equal(patch.apiKey, undefined, `preset ${preset.id} should not include apiKey`)
  assert.equal(patch.sessionToken, undefined, `preset ${preset.id} should not include sessionToken`)
}
assert.equal(
  { apiKey: '********', ...providerGatewayPresetPatch('sub2api') }.apiKey,
  '********'
)
const oauthPatch = providerPatchFromAccount(normalizeProviderAccount({ kind: 'oauth-placeholder', providerId: 'chatgpt-plans', apiKey: 'should-not-use', baseUrl: '' }))
assert.equal(oauthPatch.apiKey, '')
const resolvedAccountProvider = providerAccountResolver.storedProviderForRequest({
  providers: { chat: { id: 'deepseek', accountId: 'acct_deepseek', apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' } },
  providerProfiles: { chat: [], image: [], video: [] },
  providerAccounts: [
    { accountId: 'acct_deepseek', kind: 'api-key', providerId: 'deepseek', apiKey: 'account-secret', baseUrl: 'https://relay.example.com', modelListPath: '/models' }
  ]
}, 'chat', { providerId: 'deepseek', accountId: 'acct_deepseek' })
assert.equal(resolvedAccountProvider.apiKey, 'account-secret')
assert.equal(resolvedAccountProvider.baseUrl, 'https://relay.example.com')
assert.equal(resolvedAccountProvider.modelListPath, '/models')
const trackBlockedProvider = providerAccountResolver.storedProviderForRequest({
  providers: { image: { id: 'openai', accountId: 'acct_chat_only', apiKey: '', baseUrl: 'https://api.openai.com', model: 'gpt-image-2' } },
  providerProfiles: { chat: [], image: [], video: [] },
  providerAccounts: [
    { accountId: 'acct_chat_only', kind: 'api-key', providerId: 'openai', apiKey: 'chat-only-secret', baseUrl: 'https://api.openai.com', tracks: ['chat'] }
  ]
}, 'image', { providerId: 'openai', accountId: 'acct_chat_only' })
assert.equal(trackBlockedProvider.apiKey, '')
const oauthResolvedProvider = providerAccountResolver.storedProviderForRequest({
  providers: { chat: { id: 'openai', accountId: 'acct_oauth', apiKey: '', baseUrl: 'https://api.openai.com', model: 'gpt-5.1' } },
  providerProfiles: { chat: [], image: [], video: [] },
  providerAccounts: [
    { accountId: 'acct_oauth', kind: 'oauth-placeholder', providerId: 'openai', apiKey: 'must-not-use', baseUrl: 'https://api.openai.com' }
  ]
}, 'chat', { providerId: 'openai', accountId: 'acct_oauth' })
assert.equal(oauthResolvedProvider.apiKey, '')

// --- config-resolver security tests ---

// realSecret filters redacted placeholders
assert.equal(configResolver.realSecret(''), '', 'empty string is not a secret')
assert.equal(configResolver.realSecret(undefined), '', 'undefined is not a secret')
assert.equal(configResolver.realSecret(configResolver.REDACTED_API_KEY), '', 'redacted placeholder is not a real secret')
assert.equal(configResolver.realSecret('sk-real-key-123'), 'sk-real-key-123', 'real key passes through')

// credentialsFromProvider never leaks redacted placeholders as real credentials
const credsFromRedacted = configResolver.credentialsFromProvider(
  { apiKey: 'stored-actual-key', sessionToken: 'stored-session' },
  { apiKey: configResolver.REDACTED_API_KEY, sessionToken: configResolver.REDACTED_API_KEY }
)
assert.equal(credsFromRedacted.apiKey, 'stored-actual-key', 'override redacted apiKey falls back to stored')
assert.equal(credsFromRedacted.sessionToken, 'stored-session', 'override redacted sessionToken falls back to stored')

const credsFromRealOverride = configResolver.credentialsFromProvider(
  { apiKey: 'stored-key', sessionToken: 'stored-session' },
  { apiKey: 'override-key', sessionToken: '' }
)
assert.equal(credsFromRealOverride.apiKey, 'override-key', 'real override apiKey wins over stored')
assert.equal(credsFromRealOverride.sessionToken, 'stored-session', 'empty override sessionToken falls back to stored')

const credsFromEmpty = configResolver.credentialsFromProvider({}, {})
assert.equal(credsFromEmpty.apiKey, '', 'no stored and no override yields empty')
assert.equal(credsFromEmpty.sessionToken, '', 'no stored and no override yields empty sessionToken')

// inferProviderTrack
assert.equal(configResolver.inferProviderTrack({ track: 'image' }), 'image', 'explicit track wins')
assert.equal(configResolver.inferProviderTrack({ id: 'openai' }), 'chat', 'unknown id falls back to chat')
assert.equal(configResolver.inferProviderTrack({ id: 'dalle' }), 'image', 'dalle infers image')
assert.equal(configResolver.inferProviderTrack({ id: 'gemini_img' }), 'image', 'gemini_img infers image')
assert.equal(configResolver.inferProviderTrack({ id: 'volcengine_vid' }), 'video', 'id with vid infers video')
assert.equal(configResolver.inferProviderTrack({ protocol: 'runway_task' }), 'video', 'runway_task infers video')
assert.equal(configResolver.inferProviderTrack({ protocol: 'gemini_image' }), 'image', 'gemini_image infers image')
assert.equal(configResolver.inferProviderTrack({ protocol: 'video_poll' }), 'video', 'video in protocol infers video')
assert.equal(configResolver.inferProviderTrack({}), 'chat', 'empty provider defaults to chat')

// buildSafePayload only allows allowlisted keys, drops rogue keys
const safePayload = configResolver.buildSafePayload(
  { authType: { type: 'bearer' }, template: { path: '/v1' }, rogueField: 'must-not-appear' },
  'openai',
  'generate',
  { prompt: 'draw', ratio: '1:1', rogueRendererKey: 'must-not-appear', headers: 'rogue-header' }
)
assert.equal(safePayload.providerId, 'openai')
assert.equal(safePayload.action, 'generate')
assert.equal(safePayload.prompt, 'draw')
assert.equal(safePayload.ratio, '1:1')
assert.equal(safePayload.template.path, '/v1')
assert.equal(safePayload.authType.type, 'bearer')
assert.equal(safePayload.rogueField, undefined, 'stored rogue field must not pass through')
assert.equal(safePayload.rogueRendererKey, undefined, 'renderer rogue key must not pass through')
assert.equal(safePayload.headers, undefined, 'renderer headers key must not pass through')

// resolveModelFetchConfig: saved credentials not sent to renderer-supplied attacker endpoint
// Config where apiKey lives directly on providers.chat (common simple case)
const storedDeepseekConfig = {
  providers: {
    chat: { id: 'deepseek', apiKey: 'saved-deepseek-key', sessionToken: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' }
  },
  providerProfiles: { chat: [], image: [], video: [] },
  providerAccounts: [],
  general: { apiTimeout: 60000 }
}
function mockGetProvider(id) {
  if (id === 'deepseek') return { id: 'deepseek', authType: { type: 'bearer' }, defaults: { baseUrl: 'https://api.deepseek.com' }, chat: {} }
  return undefined
}
// When renderer supplies an attacker baseUrl with no credentials, saved creds must not be used
// and the attacker baseUrl is also not used — falls back to registry default instead
const attackerResult = configResolver.resolveModelFetchConfig(
  { id: 'deepseek', baseUrl: 'https://evil.attacker.com/v1', apiKey: '', sessionToken: '' },
  storedDeepseekConfig,
  mockGetProvider
)
assert.equal(attackerResult.apiKey, '', 'saved credentials must not reach attacker-supplied baseUrl')
assert.equal(attackerResult.baseUrl, 'https://api.deepseek.com', 'attacker baseUrl rejected; falls back to registry default')
assert.equal(attackerResult.sessionToken, '', 'saved sessionToken must not reach attacker-supplied baseUrl')

// When renderer supplies matching stored baseUrl with no credentials, saved creds ARE used
const sameEndpointResult = configResolver.resolveModelFetchConfig(
  { id: 'deepseek', baseUrl: 'https://api.deepseek.com', apiKey: '', sessionToken: '' },
  storedDeepseekConfig,
  mockGetProvider
)
assert.equal(sameEndpointResult.apiKey, 'saved-deepseek-key', 'saved credentials used when baseUrl matches stored')
assert.equal(sameEndpointResult.baseUrl, 'https://api.deepseek.com', 'stored baseUrl used when endpoint matches')

// When renderer supplies no baseUrl at all (redacted placeholder), saved creds used on stored endpoint
const noBaseUrlResult = configResolver.resolveModelFetchConfig(
  { id: 'deepseek', apiKey: configResolver.REDACTED_API_KEY, sessionToken: '' },
  storedDeepseekConfig,
  mockGetProvider
)
assert.equal(noBaseUrlResult.apiKey, 'saved-deepseek-key', 'redacted placeholder does not override saved credential')
assert.equal(noBaseUrlResult.baseUrl, 'https://api.deepseek.com', 'stored baseUrl used when no renderer baseUrl')

// When renderer supplies fresh typed credentials + attacker baseUrl, typed creds used with that baseUrl
const typedOverrideResult = configResolver.resolveModelFetchConfig(
  { id: 'deepseek', baseUrl: 'https://relay.example.com', apiKey: 'fresh-typed-key', sessionToken: '' },
  storedDeepseekConfig,
  mockGetProvider
)
assert.equal(typedOverrideResult.apiKey, 'fresh-typed-key', 'fresh typed credential takes precedence')
assert.equal(typedOverrideResult.baseUrl, 'https://relay.example.com', 'renderer baseUrl used when fresh credential provided')

// requestOptionsFromConfig
assert.deepEqual(configResolver.requestOptionsFromConfig({ general: { apiTimeout: 60000 } }, {}), { timeout: 60000 })
assert.deepEqual(configResolver.requestOptionsFromConfig({ general: { apiTimeout: 60000 } }, { timeout: 120000 }), { timeout: 120000 })
assert.deepEqual(configResolver.requestOptionsFromConfig({}, {}), {})
assert.deepEqual(configResolver.requestOptionsFromConfig({ general: { apiTimeout: -1 } }, {}), {})

// REDACTED_API_KEY constant matches config module
assert.equal(configResolver.REDACTED_API_KEY, '********', 'REDACTED_API_KEY matches expected value')
assert.equal(configResolver.REDACTED_API_KEY, configModule.REDACTED_API_KEY, 'REDACTED_API_KEY matches config module')
const customSecretError = providerPipeline.redactSecrets('Relay rejected key short-custom-key.', ['short-custom-key'])
assert.equal(customSecretError.includes('short-custom-key'), false)
assert.equal(customSecretError.includes('[redacted]'), true)

// --- end config-resolver security tests ---

assert.deepEqual(
  registryUtils.normalizeProviderMeta({ links: { docs: 'https://example.com' }, capabilities: { image: true } }),
  {
    links: { docs: 'https://example.com' },
    billing: { mode: 'unknown', note: '' },
    capabilities: { image: true },
    constraints: {},
    customizable: {}
  }
)

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
assert.equal(classifyModel({ id: 'gpt-image-2' }).capability, 'unknown')
assert.equal(classifyModel({ id: 'image2' }).capability, 'unknown')
assert.equal(classifyModel({ id: 'nano-banana2' }).capability, 'unknown')
assert.equal(classifyModel({ id: 'gemini-3.1-flash-image-preview' }).capability, 'unknown')
assert.equal(classifyModel({ id: 'google/gemini-3.1-flash-lite-image' }).capability, 'unknown')
assert.equal(classifyModel({ id: 'text-embedding-3-large', type: 'embedding' }).capability, 'other')
assert.equal(classifyModel({ id: 'gpt-5.1' }).capability, 'chat')
assert.equal(classifyModel({ id: 'veo-3.1' }).capability, 'unknown')
assert.equal(classifyModel({ id: 'provider-model', capabilities: { textToVideo: true } }).capability, 'video')
assert.equal(classifyModel({ id: 'provider-model', capabilities: { image: false, video: false } }).capability, 'unknown')
assert.equal(classifyModel({ id: 'gpt-4o', modalities: { input: ['text', 'image'], output: ['text'] } }).capability, 'chat')
assert.equal(classifyModel({ id: 'provider-model', output_modalities: ['image'] }).capability, 'image')
assert.equal(classifyModel({ id: 'grok-4' }).capability, 'chat')
assert.equal(classifyModel({ id: 'o3' }).capability, 'chat')
assert.equal(modelsApi.normalizeModelList([{ id: 'vendor-text-model' }], { track: 'chat' })[0].capability, 'chat')
const mixedRelayModels = modelsApi.normalizeModelList([
  { id: 'gpt-5.1' },
  { id: 'text-embedding-3-large', type: 'embedding' },
  { id: 'nano-banana2', output_modalities: ['image'] },
  { id: 'image2', output_modalities: ['image'] },
  { id: 'google/gemini-3.1-flash-lite-image', output_modalities: ['image'] }
], { track: 'image' })
assert.deepEqual(
  new Set(mixedRelayModels.filter(item => item.capability === 'image').map(item => item.id)),
  new Set(['google/gemini-3.1-flash-lite-image', 'image2', 'nano-banana2'])
)
assert.equal(mixedRelayModels.find(item => item.id === 'gpt-5.1').capability, 'chat')
assert.equal(
  modelsApi.buildModelListUrl('https://api.openai.com', {}).href,
  'https://api.openai.com/v1/models'
)
assert.equal(
  modelsApi.buildModelListUrl('https://openrouter.ai/api', {}).href,
  'https://openrouter.ai/api/v1/models'
)
assert.equal(
  modelsApi.buildModelListUrl('https://relay.example.com/v1', {}).href,
  'https://relay.example.com/v1/models'
)
assert.equal(
  modelsApi.buildModelListUrl('https://relay.example.com/v1', {}, { modelListPath: '/v1/models' }).href,
  'https://relay.example.com/v1/models'
)
assert.equal(
  modelsApi.buildModelListUrl('https://relay.example.com/api/v1', {}, { modelListPath: '/v1/models' }).href,
  'https://relay.example.com/api/v1/models'
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

assert.equal(sanitizeAssetUrl('https://cdn.example.com/a.png', 'image'), 'https://cdn.example.com/a.png')
assert.equal(sanitizeAssetUrl(' http://example.com/a.png ', 'image'), '')
assert.equal(sanitizeAssetUrl('file:///C:/x.png', 'image'), '')
assert.equal(sanitizeAssetUrl('https://localhost/a.png', 'image'), '')
assert.equal(sanitizeAssetUrl('https://user:pass@example.com/a.png', 'image'), '')
assert.equal(sanitizeAssetUrl('https://[::ffff:127.0.0.1]/a.png', 'image'), '')
assert.equal(sanitizeAssetUrl('https://[::ffff:7f00:1]/a.png', 'image'), '')
assert.equal(sanitizeAssetUrl('data:image/png;base64,AAAA', 'image'), 'data:image/png;base64,AAAA')
assert.equal(sanitizeAssetUrl('data:video/mp4;base64,AAAA', 'image'), '')
assert.equal(sanitizeAssetUrl('data:image/png;base64,AAAA', 'video'), '')
assert.equal(sanitizeAssetUrl('data:video/mp4;base64,AAAA', 'video'), 'data:video/mp4;base64,AAAA')
assert.equal(mainSanitize.sanitizeAssetUrl('https://127.0.0.1/a.png', 'image'), '')
assert.equal(mainSanitize.sanitizeAssetUrl('https://[::ffff:192.168.0.1]/a.png', 'image'), '')
assert.deepEqual(normalizePreviewUrl('data:image/png;base64,AAAA', 'image'), { kind: 'direct', url: 'data:image/png;base64,AAAA' })
assert.deepEqual(normalizePreviewUrl('data:text/html;base64,AAAA', 'image'), { kind: 'blocked', url: '' })
assert.deepEqual(normalizePreviewUrl('blob:https://example.com/id', 'image'), { kind: 'blocked', url: '' })
assert.deepEqual(normalizePreviewUrl('https://cdn.example.com/a.png', 'image'), { kind: 'remote', url: 'https://cdn.example.com/a.png' })
assert.deepEqual(
  normalizePreviewUrl(`gravuresse-media://cache/${'a'.repeat(64)}.png`, 'image'),
  { kind: 'direct', url: `gravuresse-media://cache/${'a'.repeat(64)}.png` }
)
assert.deepEqual(normalizePreviewUrl(`gravuresse-media://cache/${'a'.repeat(64)}.mp4`, 'image'), { kind: 'blocked', url: '' })
assert.deepEqual(normalizePreviewUrl('gravuresse-media://cache/../secret.png', 'image'), { kind: 'blocked', url: '' })

const storedImageTestConfig = {
  providers: {
    image: {
      id: 'custom-image',
      apiKey: 'stored-key',
      sessionToken: '',
      baseUrl: 'https://relay.example.com',
      model: 'gpt-image-2',
      template: {
        path: '/stored-images',
        requestBody: { prompt: '{prompt}', model: '{model}' },
        imageUrlPath: 'data[0].url'
      }
    }
  },
  providerProfiles: { image: [] },
  general: { apiTimeout: 60000 }
}
const savedCredentialImageTest = buildProviderImageTestPayload({
  id: 'custom-image',
  baseUrl: 'https://relay.example.com',
  apiKey: '********',
  prompt: 'draw a cube',
  ratio: '1:1',
  resolution: '1024',
  template: {
    path: '/renderer-images',
    requestBody: { prompt: '{prompt}' },
    imageUrlPath: 'output.url'
  }
}, storedImageTestConfig)
assert.equal(savedCredentialImageTest.ok, true)
assert.equal(savedCredentialImageTest.payload.credentials.apiKey, 'stored-key')
assert.equal(savedCredentialImageTest.payload.template.path, '/stored-images')

const inheritedTemplateProvider = Object.create({ template: { path: '/inherited-images' } })
Object.assign(inheritedTemplateProvider, {
  id: 'custom-image',
  apiKey: 'stored-key',
  baseUrl: 'https://relay.example.com',
  model: 'gpt-image-2'
})
const inheritedTemplateImageTest = buildProviderImageTestPayload({
  id: 'custom-image',
  baseUrl: 'https://relay.example.com',
  apiKey: 'typed-key',
  prompt: 'draw a cube',
  ratio: '1:1',
  resolution: '1024'
}, {
  providers: { image: inheritedTemplateProvider },
  providerProfiles: { image: [] },
  general: { apiTimeout: 60000 }
})
assert.equal(inheritedTemplateImageTest.ok, true)
assert.equal(Object.hasOwn(inheritedTemplateImageTest.payload, 'template'), false)
const inheritedTemplateObject = Object.create({
  path: '/inherited-images',
  submitPath: '/inherited-submit',
  pollPath: '/inherited-poll/{taskId}',
  requestBody: { prompt: '{prompt}' },
  imageUrlPath: 'data.0.url'
})
const inheritedTemplateValidation = validateGenerationRequest('video', providerRegistry.getProvider('custom-video'), {
  prompt: 'animate a cube',
  ratio: '1:1',
  duration: 5,
  template: inheritedTemplateObject
})
assert.equal(inheritedTemplateValidation.ok, false)
assert.ok(inheritedTemplateValidation.errors.some(item => item.field === 'template.submitPath'))
assert.ok(inheritedTemplateValidation.errors.some(item => item.field === 'template.pollPath'))
const inheritedTemplateRuntime = customImage.getTemplate({
  action: 'generate',
  provider: { image: {} },
  template: inheritedTemplateObject
})
assert.equal(Object.hasOwn(inheritedTemplateRuntime, 'path'), false)
assert.equal(Object.hasOwn(inheritedTemplateRuntime, 'requestBody'), false)

const typedCredentialImageTest = buildProviderImageTestPayload({
  id: 'custom-image',
  baseUrl: 'https://relay.example.com',
  apiKey: 'typed-key',
  prompt: 'draw a cube',
  ratio: '1:1',
  resolution: '1024',
  template: {
    path: '/renderer-images',
    requestBody: { prompt: '{prompt}' },
    imageUrlPath: 'output.url'
  }
}, storedImageTestConfig)
assert.equal(typedCredentialImageTest.ok, true)
assert.equal(typedCredentialImageTest.payload.credentials.apiKey, 'typed-key')
assert.equal(typedCredentialImageTest.payload.template.path, '/renderer-images')

const mainSanitizedImport = mainSanitize.sanitizeConversationImportPayload({
  conversation: {
    title: 'legacy lineage',
    assets: [{
      id: 'legacy-asset',
      providerId: 'provider-a',
      model: 'model-a',
      prompt: 'legacy prompt',
      parentAssetId: 'parent-a',
      sourceAssetIds: ['source-a'],
      promptReferenceAssetIds: ['prompt-ref-a'],
      taskId: 'task-a'
    }]
  }
})
assert.equal(mainSanitizedImport.conversation.assets[0].generation.providerId, 'provider-a')
assert.equal(mainSanitizedImport.conversation.assets[0].generation.model, 'model-a')
assert.equal(mainSanitizedImport.conversation.assets[0].generation.prompt, 'legacy prompt')
assert.equal(mainSanitizedImport.conversation.assets[0].generation.parentAssetId, 'parent-a')
assert.deepEqual(mainSanitizedImport.conversation.assets[0].generation.sourceAssetIds, ['source-a'])
assert.deepEqual(mainSanitizedImport.conversation.assets[0].generation.promptReferenceAssetIds, ['prompt-ref-a'])
assert.equal(mainSanitizedImport.conversation.assets[0].generation.taskId, 'task-a')
const sanitizedReviewMessage = mainSanitize._test.sanitizeMessage({
  id: 'm-review',
  role: 'assistant',
  content: '请先审查创作说明。',
  unknown: 'drop',
  tasks: [{
    id: 't-review',
    type: 'image',
    status: 'pending',
    label: '中文标签',
    review_text: '中文创作说明：一只赛博朋克猫，霓虹灯光，正方形画幅。',
    prompt: 'A cyberpunk cat portrait with neon lighting and detailed city atmosphere.',
    negative_prompt: 'low quality',
    unknown: 'drop'
  }]
})
assert.equal(sanitizedReviewMessage.unknown, undefined)
assert.equal(sanitizedReviewMessage.tasks[0].review_text, '中文创作说明：一只赛博朋克猫，霓虹灯光，正方形画幅。')
assert.equal(sanitizedReviewMessage.tasks[0].unknown, undefined)
const truncatedReviewTask = mainSanitize._test.sanitizeMessage({
  id: 'm-review-long',
  role: 'assistant',
  content: 'long',
  tasks: [{ id: 't-review-long', type: 'video', status: 'pending', label: '长说明', review_text: '审'.repeat(50020), prompt: 'video prompt' }]
}).tasks[0]
assert.equal(truncatedReviewTask.review_text.length, 50000)
const legacyTaskMessage = mainSanitize._test.sanitizeMessage({
  id: 'm-legacy-task',
  role: 'assistant',
  content: 'legacy',
  tasks: [{ id: 't-legacy', type: 'image', status: 'pending', label: '旧任务', prompt: 'legacy english prompt' }]
})
assert.equal(legacyTaskMessage.tasks[0].prompt, 'legacy english prompt')
const strippedImport = mainSanitize.sanitizeConversationImportPayload({
  app: 'Gravuresse',
  media: { inlined: 1, extra: 'drop' },
  extraTopLevel: 'drop',
  conversation: {
    id: 'conv-a',
    title: 'kept',
    unknown: 'drop',
    messages: [{ id: 'm1', role: 'assistant', content: 'hi', unknown: 'drop', tasks: [{ id: 't1', type: 'image', status: 'pending', label: 'kept', review_text: '保留中文说明', prompt: 'kept prompt', sourceImageUrl: 'https://cdn.example.com/source.png', resolution: '1536', intent: 'modify_image', createdFrom: 'chat', styleDirection: 'watercolor', unknown: 'drop' }] }],
    assets: []
  }
})
assert.equal(strippedImport.extraTopLevel, undefined)
assert.equal(strippedImport.media.extra, undefined)
assert.equal(strippedImport.conversation.unknown, undefined)
assert.equal(strippedImport.conversation.id, 'conv-a')
assert.equal(strippedImport.conversation.messages[0].unknown, undefined)
assert.equal(strippedImport.conversation.messages[0].tasks[0].review_text, '保留中文说明')
assert.equal(strippedImport.conversation.messages[0].tasks[0].sourceImageUrl, 'https://cdn.example.com/source.png')
assert.equal(strippedImport.conversation.messages[0].tasks[0].resolution, '1536')
assert.equal(strippedImport.conversation.messages[0].tasks[0].intent, 'modify_image')
assert.equal(strippedImport.conversation.messages[0].tasks[0].createdFrom, 'chat')
assert.equal(strippedImport.conversation.messages[0].tasks[0].styleDirection, 'watercolor')
assert.equal(strippedImport.conversation.messages[0].tasks[0].unknown, undefined)
const strippedStore = mainSanitize.sanitizeStorePayload({
  schemaVersion: 1,
  activeId: 'conv-a',
  deletedIds: ['old'],
  unknown: 'drop',
  conversations: [{ id: 'conv-a', title: 'kept', unknown: 'drop', messages: [], assets: [] }]
})
assert.equal(strippedStore.unknown, undefined)
assert.equal(strippedStore.conversations[0].unknown, undefined)

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
const imagePresetIds = providerTemplatePresets('image', { id: 'custom-image' }).map(item => item.id)
assert.ok(imagePresetIds.includes('newapi-image-json'))
assert.ok(imagePresetIds.includes('sub2api-image-json'))
assert.ok(imagePresetIds.includes('cpa-image-json'))
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
assert.equal(customImage.defaultOpenAiBody({ model: 'image2', prompt: 'p', ratio: '1:1', resolution: '1024' }).image_url, undefined)
assert.equal(
  customImage.defaultOpenAiBody({ model: 'nano-banana2', prompt: 'p', ratio: '1:1', resolution: '1024', sourceImageUrl: 'https://cdn.example.com/source.png' }).image_url,
  'https://cdn.example.com/source.png'
)
assert.equal(customImage.commonImageTaskId({ data: { task_id: 'task-1' } }), 'task-1')
assert.equal(customImage.commonImageTaskId({ task: { id: 'task-2' } }), 'task-2')
assert.equal(openAiHandlerTests.imageFromResponse({ data: ['https://cdn.example.com/openai-string.png'] }), 'https://cdn.example.com/openai-string.png')
assert.equal(openAiHandlerTests.imageFromResponse({ data: [{ b64_json: 'abc123' }] }), 'data:image/png;base64,abc123')
assert.equal(openAiHandlerTests.imageFromResponse({ data: [{ url: 'https://cdn.example.com/openai-url.png' }] }), 'https://cdn.example.com/openai-url.png')
assert.equal(openAiHandlerTests.imageFromResponse({ data: [{ image_url: { url: 'https://cdn.example.com/openai-image-url.png' } }] }), 'https://cdn.example.com/openai-image-url.png')
assert.equal(openAiHandlerTests.imageFromResponse({ data: { output_url: 'https://cdn.example.com/openai-output.png' } }), 'https://cdn.example.com/openai-output.png')
assert.equal(openAiHandlerTests.chatCompletionsUrl('https://relay.example.com/v1').href, 'https://relay.example.com/v1/chat/completions')
assert.equal(openAiHandlerTests.imageGenerationsUrl('https://relay.example.com/api/v1').href, 'https://relay.example.com/api/v1/images/generations')

const generation = createGeneration({
  parentAssetId: '',
  sourceAssetIds: 'source-1',
  promptReferenceAssetIds: [undefined, 'ref-1', 42],
  duration: 0,
  unknownLargeField: 'drop'
})
assert.equal(generation.parentAssetId, null)
assert.deepEqual(generation.sourceAssetIds, ['source-1'])
assert.deepEqual(generation.promptReferenceAssetIds, ['ref-1', '42'])
assert.equal(generation.duration, 0)
assert.equal(generation.unknownLargeField, undefined)

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
const assetWithUnknownGeneration = createAsset({ generation: { prompt: 'keep', unknown: 'drop' } })
assert.equal(assetWithUnknownGeneration.generation.prompt, 'keep')
assert.equal(assetWithUnknownGeneration.generation.unknown, undefined)

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

const unsafeUrlImport = normalizeImportedConversations({
  conversation: {
    title: 'unsafe urls',
    assets: [
      { id: 'file-url', type: 'image', url: 'file:///C:/x.png' },
      { id: 'http-url', type: 'image', url: 'http://example.com/a.png' },
      { id: 'localhost-url', type: 'image', url: 'https://localhost/a.png' },
      { id: 'https-url', type: 'image', url: 'https://cdn.example.com/a.png' },
      { id: 'data-image', type: 'image', url: 'data:image/png;base64,AAAA' },
      { id: 'wrong-data-image', type: 'image', url: 'data:video/mp4;base64,AAAA' },
      { id: 'data-video', type: 'video', url: 'data:video/mp4;base64,AAAA' },
      { id: 'wrong-data-video', type: 'video', url: 'data:image/png;base64,AAAA' }
    ]
  }
})
assert.equal(unsafeUrlImport[0].assets.length, 8)
assert.equal(unsafeUrlImport[0].assets[0].url, '')
assert.equal(unsafeUrlImport[0].assets[1].url, '')
assert.equal(unsafeUrlImport[0].assets[2].url, '')
assert.equal(unsafeUrlImport[0].assets[3].url, 'https://cdn.example.com/a.png')
assert.equal(unsafeUrlImport[0].assets[4].url, 'data:image/png;base64,AAAA')
assert.equal(unsafeUrlImport[0].assets[5].url, '')
assert.equal(unsafeUrlImport[0].assets[6].url, 'data:video/mp4;base64,AAAA')
assert.equal(unsafeUrlImport[0].assets[7].url, '')

for (const item of assetUrlCases) {
  assert.equal(sanitizeAssetUrl(item.url, item.type), item.expected, `renderer sanitizer mismatch for ${item.url}`)
  assert.equal(mainSanitize.sanitizeAssetUrl(item.url, item.type), item.expected, `main sanitizer mismatch for ${item.url}`)
}

const mediaCacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gravuresse-media-cache-'))
await assert.rejects(
  () => mediaCache.cacheAssetPreview(
    { url: 'https://127.0.0.1/a.png', type: 'image' },
    {
      cacheDir: mediaCacheDir,
      downloadToFile,
      validateAssetBytes: () => 'image/png'
    }
  ),
  /Blocked private\/internal host/
)
const cachedPreviewUrl = await mediaCache.cacheAssetPreview(
  { url: 'https://cdn.example.com/a.png', type: 'image' },
  {
    cacheDir: mediaCacheDir,
    downloadToFile: async (_, filePath) => {
      await fs.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    },
    validateAssetBytes: () => 'image/png'
  }
)
assert.match(cachedPreviewUrl, /^gravuresse-media:\/\/cache\/[a-f0-9]{64}\.png$/)
const localPngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const cachedLocalImage = mediaCache.cacheAssetBytes(localPngBytes, 'image', 'image/png', {
  cacheDir: mediaCacheDir,
  validateAssetBytes: bytes => {
    assert.deepEqual(bytes, localPngBytes)
    return 'image/png'
  }
})
const cachedLocalImageAgain = mediaCache.cacheAssetBytes(localPngBytes, 'image', 'image/png', {
  cacheDir: mediaCacheDir,
  validateAssetBytes: () => 'image/png'
})
assert.equal(cachedLocalImage.url, cachedLocalImageAgain.url, 'identical local images reuse the content-addressed cache entry')
assert.equal(cachedLocalImage.size, localPngBytes.length)
assert.equal(path.dirname(mediaCache.parseMediaCacheUrl(cachedLocalImage.url, mediaCacheDir)), path.resolve(mediaCacheDir))
assert.equal(path.dirname(mediaCache.parseMediaCacheUrl(cachedPreviewUrl, mediaCacheDir)), path.resolve(mediaCacheDir))
assert.throws(
  () => mediaCache.parseMediaCacheUrl('gravuresse-media://cache/../secret.png', mediaCacheDir),
  /Invalid media cache file name/
)

const dirtyMessageImport = normalizeImportedConversations({
  conversation: {
    title: 'dirty messages',
    messages: [
      null,
      'bad',
      { id: 1, role: 'user', content: 123 },
      { id: '1', role: 'assistant', content: 'running task', task: { status: 'generating', type: 'audio', label: '', prompt: 7, error: {} } },
      { id: 'm3', role: 'assistant', content: 'done task', unknown: 'drop', tasks: ['bad', { status: 'done', type: 'video', review_text: '视频中文说明', prompt: 'video prompt', sourceImageUrl: 'https://cdn.example.com/source.png', resolution: '2048', intent: 'generate_video', createdFrom: 'chat', styleDirection: 'cinematic', sourceAssetIds: 'source-video', unknown: 'drop' }] }
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
assert.equal(dirtyMessageImport[0].messages[2].tasks[0].review_text, '视频中文说明')
assert.equal(dirtyMessageImport[0].messages[2].tasks[0].sourceImageUrl, 'https://cdn.example.com/source.png')
assert.equal(dirtyMessageImport[0].messages[2].tasks[0].resolution, '2048')
assert.equal(dirtyMessageImport[0].messages[2].tasks[0].intent, 'generate_video')
assert.equal(dirtyMessageImport[0].messages[2].tasks[0].createdFrom, 'chat')
assert.equal(dirtyMessageImport[0].messages[2].tasks[0].styleDirection, 'cinematic')
assert.equal(dirtyMessageImport[0].messages[2].unknown, undefined)
assert.equal(dirtyMessageImport[0].messages[2].tasks[0].unknown, undefined)
assert.deepEqual(dirtyMessageImport[0].messages[2].tasks[0].sourceAssetIds, ['source-video'])

const normalizedStoredConversation = normalizeConversationRecord({
  id: 99,
  title: 'stored',
  unknown: 'drop',
  messages: ['bad', { id: 1, role: 'user', content: 'stored prompt' }],
  assets: ['bad', { id: 2, generation: { parentAssetId: 3 } }]
})
assert.equal(normalizedStoredConversation.id, '99')
assert.equal(normalizedStoredConversation.messages.length, 1)
assert.equal(normalizedStoredConversation.messages[0].id, '1')
assert.equal(normalizedStoredConversation.assets.length, 1)
assert.equal(normalizedStoredConversation.assets[0].id, '2')
assert.equal(normalizedStoredConversation.assets[0].generation.parentAssetId, '3')
assert.equal(normalizedStoredConversation.unknown, undefined)

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
