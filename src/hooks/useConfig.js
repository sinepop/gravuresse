// @ts-check

import { useState, useEffect, useCallback, useRef } from 'react'
import { CHAT_PROVIDERS } from '../providers/chatProviders.js'
import { IMG_PROVIDERS } from '../providers/imageProviders.js'
import { VID_PROVIDERS } from '../providers/videoProviders.js'
import { PROVIDER_ID_ALIASES } from '../providers/aliases.js'
import { firstProviderModel, normalizeProviderTemplate, resolveChatProvider, applyChatProviderPatch, getProvidersFromConfig } from '../utils/providerConfig.js'
import { migrateProviderAccounts, providerPatchFromAccount, findProviderAccount } from '../utils/providerAccounts.js'

/** @typedef {import('../types/domain').ConfigPayload} ConfigPayload */
/** @typedef {import('../types/domain').Track} Track */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {Record<Track, UnknownRecord[]>} ProviderMap */
/** @typedef {ProviderMap & { _config?: UnknownRecord }} ProviderCollections */

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** @param {unknown} value @returns {UnknownRecord} */
function recordOf(value) {
  return isRecord(value) ? value : {}
}

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value : ''
}

/** @param {unknown} value @returns {value is Track} */
function isTrack(value) {
  return value === 'chat' || value === 'image' || value === 'video'
}

/** @param {unknown} value @returns {UnknownRecord[]} */
function recordList(value) {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

/** @type {ProviderMap} */
const PROVIDER_MAP = { chat: CHAT_PROVIDERS, image: IMG_PROVIDERS, video: VID_PROVIDERS }
/** @type {Track[]} */
const TRACKS = ['chat', 'image', 'video']

/** @param {unknown} cfg @param {Track} track @returns {UnknownRecord[]} */
function providerProfileList(cfg, track) {
  const profiles = recordOf(recordOf(cfg).providerProfiles)[track]
  return recordList(profiles)
}

const DEPRECATED_MODELS = ['pollinations']
const FALLBACK_MODEL_CATALOGS = {
  chat: {
    openai: ['gpt-5.1', 'gpt-5.1-mini', 'gpt-4.1'],
    anthropic: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
    google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    alibaba: ['qwen-plus', 'qwen-max'],
    moonshot: ['kimi-k2-0711-preview', 'kimi-latest'],
    volcengine: ['doubao-pro-32k', 'doubao-seed-1-6'],
    openrouter: ['openai/gpt-5.1', 'anthropic/claude-sonnet-4.5'],
    groq: ['llama-3.3-70b-versatile'],
    together: ['meta-llama/Llama-4-17B-128E-Instruct-FP8'],
    xai: ['grok-3', 'grok-3-mini'],
    perplexity: ['sonar-pro', 'sonar'],
    siliconflow: ['Qwen/Qwen2.5-72B-Instruct']
  },
  image: {
    'custom-image': ['gpt-image-2', 'gpt-image-1'],
    'custom-image-gemini': ['gemini-2.5-flash-image'],
    'custom-image-ark': ['doubao-seedream-4-0-250828'],
    openai: ['gpt-image-2', 'gpt-image-1'],
    google: ['gemini-2.5-flash-image'],
    volcengine: ['doubao-seedream-4-0-250828'],
    'alibaba-wan': ['wan2.6-t2i'],
    'baidu-qianfan': ['qwen-image'],
    stability: ['stable-image-core', 'stable-image-ultra'],
    ideogram: ['ideogram-v4'],
    fal: ['fal-ai/flux-pro'],
    replicate: ['black-forest-labs/flux-schnell'],
    siliconflow: ['black-forest-labs/FLUX.1-dev']
  },
  video: {
    'custom-video': [],
    volcengine: ['doubao-seedance-2-0-pro-250528'],
    'alibaba-wan': ['wan2.7-t2v'],
    runway: ['gen4_turbo'],
    kling: ['kling-v2.6'],
    luma: ['ray-2'],
    minimax: ['MiniMax-Hailuo-2.3'],
    pixverse: ['pixverse-v6'],
    fal: ['fal-ai/wan/v2.5/t2v'],
    replicate: ['minimax/video-01'],
    'baidu-qianfan': ['qianfan-video-latest'],
    'tencent-tokenhub': ['hy-video-1.5']
  }
}

/** @param {unknown} primary @param {unknown} fallback @returns {UnknownRecord[]} */
function mergeProviderLists(primary, fallback) {
  const primaryList = recordList(primary)
  return [...primaryList, ...recordList(fallback).filter(p => !primaryList.some(item => text(item.id) === text(p.id)))]
}

/** @param {unknown} provider */
function isExecutableProvider(provider) {
  const record = recordOf(provider)
  return record.executable !== false && record.integrationStatus !== 'metadata'
}

/** @param {unknown} provider */
function providerCallMode(provider = {}) {
  const record = recordOf(provider)
  const caps = recordOf(record.capabilities)
  const billing = recordOf(record.billing)
  if (isExecutableProvider(record)) return record.platform === 'Custom' || text(record.id).startsWith('custom-') ? 'custom-api' : 'direct-api'
  if (caps.webSubscription || caps.codingPlan || billing.mode === 'subscription') return 'subscription-reference'
  return 'reference'
}

/** @param {unknown} track @param {unknown} provider @param {unknown} caps */
function isTemplateConfigurableMediaProvider(track, provider = {}, caps = {}) {
  const record = recordOf(provider)
  const capabilities = recordOf(caps)
  if (track !== 'image' && track !== 'video') return false
  if (!text(record.protocol) || !text(record.defaultUrl)) return false
  if (record.integrationStatus !== 'metadata' && record.executable !== false) return false
  if (capabilities.relay || capabilities.customTemplate || capabilities.customBaseUrl) return true
  if (track === 'image') return Boolean(capabilities.textToImage || capabilities.imageToImage || capabilities.imageEdit)
  return Boolean(capabilities.textToVideo || capabilities.imageToVideo || capabilities.async)
}

/** @param {unknown} provider */
function providerSetupMode(provider = {}) {
  const record = recordOf(provider)
  const caps = recordOf(record.capabilities)
  const customizable = recordOf(record.customizable)
  const billing = recordOf(record.billing)
  const authOptions = Array.isArray(customizable.auth) ? customizable.auth.filter(item => typeof item === 'string') : []
  if (!isExecutableProvider(record)) return (caps.webSubscription || caps.codingPlan || billing.mode === 'subscription') ? 'subscription-reference' : 'reference'
  if (record.platform === 'Custom' || text(record.id).startsWith('custom-') || caps.customBaseUrl || caps.customTemplate || record.integrationStatus === 'custom-template') return 'custom-api'
  if (authOptions.includes('session')) return 'api-key-or-session'
  if (recordOf(record.authType).type === 'none') return 'no-auth'
  return 'api-key'
}

/** @param {unknown} provider @returns {UnknownRecord} */
function defaultAuthType(provider = {}) {
  const record = recordOf(provider)
  if (record.format === 'gemini' || record.id === 'google') return { type: 'query', key: 'key' }
  if (record.format === 'anthropic' || record.id === 'anthropic') return { type: 'header', key: 'x-api-key' }
  if (isRecord(record.authType)) return record.authType
  return { type: 'bearer' }
}

/** @param {unknown} track @param {unknown} provider @returns {unknown} */
function defaultCustomizable(track, provider = {}) {
  const record = recordOf(provider)
  if (record.customizable) return record.customizable
  if (!isTrack(track)) return undefined
  const isCustom = record.platform === 'Custom' || text(record.id).startsWith('custom-')
  const allCaps = recordOf(record.capabilities)
  const caps = isTrack(track) ? recordOf(allCaps[track] || allCaps) : allCaps
  if (!isCustom && !isTemplateConfigurableMediaProvider(track, record, caps)) return record.customizable
  return {
    [track]: {
      auth: ['bearer', 'api-key', 'header', 'query', 'session'],
      baseUrl: true,
      model: true,
      timeout: true,
      pathPrefix: true,
      submitPath: track === 'video',
      pollPath: track === 'video',
      pollInterval: track === 'video',
      relayCompatible: true
    }
  }
}

/** @param {unknown} track @param {unknown} providers @returns {UnknownRecord[]} */
export function normalizeProviderList(track, providers = []) {
  return recordList(providers).map(provider => {
    const allCaps = recordOf(provider.capabilities)
    const caps = isTrack(track) ? recordOf(allCaps[track] || allCaps) : allCaps
    const templateConfigurable = isTemplateConfigurableMediaProvider(track, provider, caps)
    const fallbackModels = isTrack(track) ? recordOf(FALLBACK_MODEL_CATALOGS[track])[text(provider.id)] : []
    /** @type {UnknownRecord} */
    const normalized = {
      ...provider,
      executable: templateConfigurable ? true : provider.executable,
      integrationStatus: templateConfigurable ? 'custom-template' : provider.integrationStatus,
      capabilities: caps,
      customizable: defaultCustomizable(track, provider),
      authType: defaultAuthType(provider),
      modelCatalog: Array.isArray(provider.modelCatalog)
        ? provider.modelCatalog.filter(model => typeof model === 'string')
        : [
            text(provider.defaultModel),
            ...(Array.isArray(fallbackModels) ? fallbackModels.filter(model => typeof model === 'string') : [])
          ].filter(model => typeof model === 'string' && model)
    }
    normalized.callMode = templateConfigurable ? 'custom-api' : provider.callMode || providerCallMode(normalized)
    normalized.setupMode = templateConfigurable ? 'custom-api' : provider.setupMode || providerSetupMode(normalized)
    return normalized
  })
}

/** @param {unknown} track @param {unknown} id */
function canonicalProviderId(track, id) {
  const value = text(id)
  return isTrack(track) ? PROVIDER_ID_ALIASES[track][value] || value : value
}

/** @param {unknown} track @param {unknown} provider */
function profileKey(track, provider = {}) {
  const record = recordOf(provider)
  return [
    text(track),
    canonicalProviderId(track, text(record.providerId) || text(record.id)),
    text(record.baseUrl),
    text(record.model)
  ].join('|')
}

/** @param {string} value */
function hashString(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

/** @param {unknown} track @param {unknown} id @param {unknown} providerLists @returns {UnknownRecord | undefined} */
function findProviderDef(track, id, providerLists = PROVIDER_MAP) {
  if (!isTrack(track)) return undefined
  const canonicalId = canonicalProviderId(track, id)
  const lists = recordOf(providerLists)
  const candidates = recordList(lists[track] || PROVIDER_MAP[track])
  return candidates.find(provider =>
    provider.id === id || provider.id === canonicalId || canonicalProviderId(track, provider.id) === canonicalId
  )
}

/** @param {unknown} currentModel @param {unknown} provider */
function modelForProviderSwitch(currentModel, provider = {}) {
  const record = recordOf(provider)
  const model = text(currentModel)
  const catalog = Array.isArray(record.modelCatalog) ? record.modelCatalog.filter(item => typeof item === 'string') : []
  if (model && catalog.includes(model)) return model
  if (model && catalog.length === 0 && record.defaultModel === model) return model
  return firstProviderModel(record)
}

/** @param {unknown} type */
function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

/** @param {unknown} providerConfig @param {unknown} providerDef */
function providerCredentialReady(providerConfig = {}, providerDef = {}) {
  const config = recordOf(providerConfig)
  const definition = recordOf(providerDef)
  if (text(config.accountId) && config.accountKind !== 'oauth-placeholder') return true
  const customType = normalizeAuthType(recordOf(config.customAuth).type)
  const type = customType || normalizeAuthType(recordOf(config.authType).type || recordOf(definition.authType).type)
  if (type === 'none') return true
  if (type === 'session') return Boolean(text(config.sessionToken))
  return Boolean(text(config.apiKey))
}

/** @param {Track} track @param {unknown} providerConfig @param {unknown} providerLists @returns {UnknownRecord | null} */
function profileFromProvider(track, providerConfig = {}, providerLists = PROVIDER_MAP) {
  const config = recordOf(providerConfig)
  const lists = recordOf(providerLists)
  const providerDef = findProviderDef(track, config.id, lists)
  const model = text(config.model) || firstProviderModel(providerDef)
  if (!text(config.id) || !model || !providerCredentialReady(config, providerDef)) return null
  const account = findProviderAccount(lists._config || {}, config.accountId)
  const key = profileKey(track, { ...config, model })
  return {
    profileId: `profile_${hashString(key)}`,
    accountId: text(config.accountId) || text(account?.accountId),
    accountKind: text(config.accountKind) || text(account?.kind),
    providerId: text(config.id),
    name: text(providerDef?.name) || text(config.id),
    apiKey: text(config.apiKey),
    sessionToken: text(config.sessionToken),
    baseUrl: text(config.baseUrl) || text(providerDef?.defaultUrl),
    model,
    protocol: config.protocol || providerDef?.protocol,
    format: config.format || providerDef?.format,
    authType: config.authType || providerDef?.authType,
    customAuth: recordOf(config.customAuth),
    template: normalizeProviderTemplate(config),
    pathPrefix: text(config.pathPrefix),
    modelListPath: text(config.modelListPath) || text(config.modelsPath),
    timeout: typeof config.timeout === 'number' || typeof config.timeout === 'string' ? config.timeout : '',
    pollInterval: typeof config.pollInterval === 'number' || typeof config.pollInterval === 'string' ? config.pollInterval : '',
    defaultNegPrompt: text(config.defaultNegPrompt),
    customSystemPrompt: text(config.customSystemPrompt)
  }
}

/** @param {unknown} cfg @param {ProviderCollections} providerLists @returns {UnknownRecord} */
function upsertProviderProfiles(cfg, providerLists = PROVIDER_MAP) {
  const migrated = recordOf(migrateProviderAccounts(cfg, providerLists))
  const deletedKeys = new Set(Array.isArray(migrated._deletedProfileKeys) ? migrated._deletedProfileKeys.filter(item => typeof item === 'string') : [])
  /** @type {UnknownRecord & { providerProfiles: Record<Track, UnknownRecord[]> }} */
  const next = {
    ...migrated,
    providerProfiles: {
      chat: [...providerProfileList(migrated, 'chat')],
      image: [...providerProfileList(migrated, 'image')],
      video: [...providerProfileList(migrated, 'video')]
    }
  }
  delete next._deletedProfileKeys
  for (const track of TRACKS) {
    const providers = recordOf(next.providers)
    const currentProvider = recordOf(providers[track])
    const account = findProviderAccount(next, currentProvider.accountId)
    if (account?.accountId) {
      const accountProviderDef = findProviderDef(track, account.providerId, providerLists)
      const keepModel = currentProvider.id === account.providerId ? currentProvider.model : ''
      providers[track] = {
        ...currentProvider,
        ...providerPatchFromAccount(account, accountProviderDef),
        model: modelForProviderSwitch(keepModel, accountProviderDef)
      }
    }
    const effectiveProvider = recordOf(providers[track])
    const providerDef = findProviderDef(track, effectiveProvider.id, providerLists)
    const recommendedModel = firstProviderModel(providerDef)
    if (effectiveProvider.id && !effectiveProvider.model && recommendedModel) {
      providers[track] = { ...effectiveProvider, model: recommendedModel }
    }
    next.providers = providers
    const profile = profileFromProvider(track, providers[track], { ...providerLists, _config: next })
    if (!profile) continue
    const key = profileKey(track, { providerId: profile.providerId, baseUrl: profile.baseUrl, model: profile.model })
    if (deletedKeys.has(key)) continue
    const profiles = next.providerProfiles[track]
    const existingIndex = profiles.findIndex(item => profileKey(track, item) === key)
    if (existingIndex >= 0) {
      profiles[existingIndex] = { ...profiles[existingIndex], ...profile }
    } else {
      profiles.push(profile)
    }
  }
  return next
}

/** @param {unknown} action @returns {Promise<UnknownRecord[]>} */
export async function loadProviders(action) {
  if (!isTrack(action)) return []
  const fallback = normalizeProviderList(action, PROVIDER_MAP[action])
  if (!window.electronAPI?.providerAPI?.list) return fallback
  try {
    const providers = await window.electronAPI.providerAPI.list(action)
    if (!Array.isArray(providers) || providers.length === 0) return fallback
    return normalizeProviderList(action, providers.filter(isRecord).map(provider => {
      const fallbackProvider = fallback.find(item =>
        item.id === provider.id || PROVIDER_ID_ALIASES[action][text(item.id)] === provider.id
      )
      const capability = recordOf(provider[action] || recordOf(provider.capabilities)[action])
      const defaults = recordOf(provider.defaults)
      return {
        ...provider,
        defaultUrl: text(provider.defaultUrl) || text(defaults.baseUrl) || text(capability.baseUrl) || text(fallbackProvider?.defaultUrl),
        defaultModel: text(provider.defaultModel) || text(capability.defaultModel) || text(fallbackProvider?.defaultModel),
        pathPrefix: text(provider.pathPrefix) || text(capability.pathPrefix) || text(fallbackProvider?.pathPrefix),
        modelListPath: text(provider.modelListPath) || text(provider.modelsPath) || text(capability.modelListPath) || text(capability.modelsPath) || text(fallbackProvider?.modelListPath),
        modelCatalog: Array.isArray(provider.modelCatalog) ? provider.modelCatalog.filter(model => typeof model === 'string') : (Array.isArray(fallbackProvider?.modelCatalog) ? fallbackProvider.modelCatalog : []),
        protocol: provider.protocol || capability.protocol || fallbackProvider?.protocol,
        format: provider.format || capability.format || fallbackProvider?.format,
        authType: provider.authType || fallbackProvider?.authType
      }
    }))
  } catch {
    return fallback
  }
}

/** @param {unknown} cfg @param {ProviderMap} providerMap @returns {UnknownRecord} */
function migrateConfig(cfg, providerMap = PROVIDER_MAP) {
  const source = recordOf(cfg)
  if (!source.providers) return source
  const sourceProviders = recordOf(source.providers)
  const general = recordOf(source.general)
  const next = {
    ...source,
    general: {
      ...general,
      enableVideo: general.enableVideo === true
    },
    providers: { ...sourceProviders },
    providerProfiles: {
      chat: providerProfileList(source, 'chat'),
      image: providerProfileList(source, 'image'),
      video: providerProfileList(source, 'video')
    }
  }
  for (const track of TRACKS) {
    const providers = providerMap[track]
    const saved = recordOf(next.providers[track])
    if (!text(saved.id)) continue
    const savedCanonicalId = canonicalProviderId(track, saved.id)
    const matchedProvider = providers.find(p => canonicalProviderId(track, p.id) === savedCanonicalId)
    if (!matchedProvider || !isExecutableProvider(matchedProvider)) {
      const fallback = providers.find(isExecutableProvider) || providers[0]
      if (!fallback) continue
      next.providers[track] = { id: fallback.id, apiKey: '', baseUrl: fallback.defaultUrl, model: firstProviderModel(fallback) }
    } else if (DEPRECATED_MODELS.includes(text(saved.model))) {
      next.providers[track] = { ...saved, id: matchedProvider.id, model: firstProviderModel(matchedProvider) }
    } else if (!saved.model && firstProviderModel(matchedProvider)) {
      next.providers[track] = { ...saved, id: matchedProvider.id, model: firstProviderModel(matchedProvider) }
    } else if (saved.id !== matchedProvider.id) {
      next.providers[track] = { ...saved, id: matchedProvider.id }
    }
  }
  return next
}

export default function useConfig() {
  const [config, setConfig] = useState(/** @type {UnknownRecord | null} */ (null))
  const [providerLists, setProviderLists] = useState(/** @type {ProviderMap} */ (PROVIDER_MAP))
  const configRef = useRef(/** @type {UnknownRecord | null} */ (null))

  useEffect(() => {
    let cancelled = false
    Promise.all([
      loadProviders('chat'),
      loadProviders('image'),
      loadProviders('video'),
      window.electronAPI?.getConfig?.()
    ]).then(([chat, image, video, c]) => {
      if (cancelled) return
      const loadedProviderLists = { chat, image, video }
      setProviderLists(loadedProviderLists)
      if (!c) return
      /** @type {ProviderMap} */
      const migrationProviderMap = {
        chat: mergeProviderLists(chat, PROVIDER_MAP.chat),
        image: mergeProviderLists(image, PROVIDER_MAP.image),
        video: mergeProviderLists(video, PROVIDER_MAP.video)
      }
      const migrated = recordOf(migrateProviderAccounts(migrateConfig(c, migrationProviderMap), migrationProviderMap))
      configRef.current = migrated
      setConfig(migrated)
    }).catch(() => {
      // Keep the initial fallback state and avoid logging config load failures
      // here; error payloads can contain provider-specific request details.
    })
    return () => { cancelled = true }
  }, [])

  const save = useCallback(/** @param {unknown} newCfg */ async (newCfg) => {
    // Persist first, then reload the redacted config from the main process.
    // Keeping the plaintext key the user just typed in renderer state risks
    // exposure via a heap snapshot / XSS; main is the sole custodian. The
    // redacted value ('********') is still truthy/non-empty so downstream
    // credential readiness guards keep working, and provider calls resolve the
    // real secret from disk on the main side.
    const prepared = upsertProviderProfiles(newCfg, providerLists)
    configRef.current = prepared
    setConfig(prepared)
    await window.electronAPI?.saveConfig(prepared)
    try {
      const redacted = await window.electronAPI?.getConfig?.()
      if (redacted) {
        const safeRedacted = recordOf(redacted)
        configRef.current = safeRedacted
        setConfig(safeRedacted)
      }
    } catch {
      // Persisted fine; if reload fails we keep the previous redacted state.
    }
  }, [providerLists])

  const updateProvider = useCallback(/** @param {Track} track @param {unknown} patch */ (track, patch) => {
    const current = configRef.current
    if (!current) return
    // Chat track: new array format uses savedChatModel + providers array
    if (track === 'chat' && Array.isArray(current.providers)) {
      const next = applyChatProviderPatch(current, patch)
      save(next)
      return
    }
    const providers = recordOf(current.providers)
    const next = {
      ...current,
      providers: { ...providers, [track]: { ...recordOf(providers[track]), ...recordOf(patch) } }
    }
    save(next)
  }, [save])

  const updateGeneral = useCallback(/** @param {unknown} patch */ (patch) => {
    const current = configRef.current
    if (!current) return
    const next = { ...current, general: { ...recordOf(current.general), ...recordOf(patch) } }
    save(next)
  }, [save])

  return { config, providerLists, save, updateProvider, updateGeneral }
}
