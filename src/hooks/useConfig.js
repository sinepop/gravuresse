import { useState, useEffect, useCallback, useRef } from 'react'
import { CHAT_PROVIDERS } from '../providers/chatProviders.js'
import { IMG_PROVIDERS } from '../providers/imageProviders.js'
import { VID_PROVIDERS } from '../providers/videoProviders.js'
import { PROVIDER_ID_ALIASES } from '../providers/aliases.js'
import { firstProviderModel, normalizeProviderTemplate } from '../utils/providerConfig.js'
import { migrateProviderAccounts, providerPatchFromAccount, findProviderAccount } from '../utils/providerAccounts.js'

const PROVIDER_MAP = { chat: CHAT_PROVIDERS, image: IMG_PROVIDERS, video: VID_PROVIDERS }
const TRACKS = ['chat', 'image', 'video']

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

function mergeProviderLists(primary, fallback) {
  return [...primary, ...fallback.filter(p => !primary.some(item => item.id === p.id))]
}

function isExecutableProvider(provider) {
  return provider?.executable !== false && provider?.integrationStatus !== 'metadata'
}

function providerCallMode(provider = {}) {
  const caps = provider.capabilities || {}
  if (isExecutableProvider(provider)) return provider.platform === 'Custom' || provider.id?.startsWith('custom-') ? 'custom-api' : 'direct-api'
  if (caps.webSubscription || caps.codingPlan || provider.billing?.mode === 'subscription') return 'subscription-reference'
  return 'reference'
}

function isTemplateConfigurableMediaProvider(track, provider = {}, caps = provider.capabilities || {}) {
  if (!['image', 'video'].includes(track)) return false
  if (!provider.protocol || !provider.defaultUrl) return false
  if (provider.integrationStatus !== 'metadata' && provider.executable !== false) return false
  if (caps.relay || caps.customTemplate || caps.customBaseUrl) return true
  if (track === 'image') return Boolean(caps.textToImage || caps.imageToImage || caps.imageEdit)
  return Boolean(caps.textToVideo || caps.imageToVideo || caps.async)
}

function providerSetupMode(provider = {}) {
  const caps = provider.capabilities || {}
  const authOptions = Array.isArray(provider.customizable?.auth) ? provider.customizable.auth : []
  if (!isExecutableProvider(provider)) return (caps.webSubscription || caps.codingPlan || provider.billing?.mode === 'subscription') ? 'subscription-reference' : 'reference'
  if (provider.platform === 'Custom' || provider.id?.startsWith('custom-') || caps.customBaseUrl || caps.customTemplate || provider.integrationStatus === 'custom-template') return 'custom-api'
  if (authOptions.includes('session')) return 'api-key-or-session'
  if (provider.authType?.type === 'none') return 'no-auth'
  return 'api-key'
}

function defaultAuthType(provider = {}) {
  if (provider.format === 'gemini' || provider.id === 'google') return { type: 'query', key: 'key' }
  if (provider.format === 'anthropic' || provider.id === 'anthropic') return { type: 'header', key: 'x-api-key' }
  if (provider.authType) return provider.authType
  return { type: 'bearer' }
}

function defaultCustomizable(track, provider = {}) {
  if (provider.customizable) return provider.customizable
  const isCustom = provider.platform === 'Custom' || provider.id?.startsWith('custom-')
  const caps = provider.capabilities?.[track] || provider.capabilities || {}
  if (!isCustom && !isTemplateConfigurableMediaProvider(track, provider, caps)) return provider.customizable
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

export function normalizeProviderList(track, providers = []) {
  return providers.map(provider => {
    const caps = provider.capabilities?.[track] || provider.capabilities || {}
    const templateConfigurable = isTemplateConfigurableMediaProvider(track, provider, caps)
    const normalized = {
      ...provider,
      executable: templateConfigurable ? true : provider.executable,
      integrationStatus: templateConfigurable ? 'custom-template' : provider.integrationStatus,
      capabilities: caps,
      customizable: defaultCustomizable(track, provider),
      authType: defaultAuthType(provider),
      modelCatalog: Array.isArray(provider.modelCatalog)
        ? provider.modelCatalog
        : [
            provider.defaultModel,
            ...(FALLBACK_MODEL_CATALOGS[track]?.[provider.id] || [])
          ].filter(Boolean)
    }
    normalized.callMode = templateConfigurable ? 'custom-api' : provider.callMode || providerCallMode(normalized)
    normalized.setupMode = templateConfigurable ? 'custom-api' : provider.setupMode || providerSetupMode(normalized)
    return normalized
  })
}

function canonicalProviderId(track, id) {
  return PROVIDER_ID_ALIASES[track]?.[id] || id || ''
}

function profileKey(track, provider = {}) {
  return [
    track,
    canonicalProviderId(track, provider.providerId || provider.id),
    provider.baseUrl || '',
    provider.model || ''
  ].join('|')
}

function hashString(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

function findProviderDef(track, id, providerLists = PROVIDER_MAP) {
  const canonicalId = canonicalProviderId(track, id)
  return (providerLists?.[track] || PROVIDER_MAP[track] || []).find(provider =>
    provider.id === id || provider.id === canonicalId || canonicalProviderId(track, provider.id) === canonicalId
  )
}

function modelForProviderSwitch(currentModel, provider = {}) {
  const catalog = Array.isArray(provider.modelCatalog) ? provider.modelCatalog : []
  if (currentModel && catalog.includes(currentModel)) return currentModel
  if (currentModel && catalog.length === 0 && provider.defaultModel === currentModel) return currentModel
  return firstProviderModel(provider)
}

function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

function providerCredentialReady(providerConfig = {}, providerDef = {}) {
  if (providerConfig.accountId && providerConfig.accountKind !== 'oauth-placeholder') return true
  const customType = normalizeAuthType(providerConfig.customAuth?.type)
  const type = customType || normalizeAuthType(providerConfig.authType?.type || providerDef?.authType?.type)
  if (type === 'none') return true
  if (type === 'session') return Boolean(providerConfig.sessionToken)
  return Boolean(providerConfig.apiKey)
}

function profileFromProvider(track, providerConfig = {}, providerLists = PROVIDER_MAP) {
  const providerDef = findProviderDef(track, providerConfig.id, providerLists)
  const model = providerConfig.model || firstProviderModel(providerDef)
  if (!providerConfig?.id || !model || !providerCredentialReady(providerConfig, providerDef)) return null
  const account = findProviderAccount(providerLists?._config || {}, providerConfig.accountId)
  const key = profileKey(track, { ...providerConfig, model })
  return {
    profileId: `profile_${hashString(key)}`,
    accountId: providerConfig.accountId || account?.accountId || '',
    accountKind: providerConfig.accountKind || account?.kind || '',
    providerId: providerConfig.id,
    name: providerDef?.name || providerConfig.id,
    apiKey: providerConfig.apiKey || '',
    sessionToken: providerConfig.sessionToken || '',
    baseUrl: providerConfig.baseUrl || providerDef?.defaultUrl || '',
    model,
    protocol: providerConfig.protocol || providerDef?.protocol,
    format: providerConfig.format || providerDef?.format,
    authType: providerConfig.authType || providerDef?.authType,
    customAuth: providerConfig.customAuth || {},
    template: normalizeProviderTemplate(providerConfig),
    pathPrefix: providerConfig.pathPrefix || '',
    modelListPath: providerConfig.modelListPath || providerConfig.modelsPath || '',
    timeout: providerConfig.timeout || '',
    pollInterval: providerConfig.pollInterval || '',
    defaultNegPrompt: providerConfig.defaultNegPrompt || '',
    customSystemPrompt: providerConfig.customSystemPrompt || ''
  }
}

function upsertProviderProfiles(cfg, providerLists = PROVIDER_MAP) {
  cfg = migrateProviderAccounts(cfg, providerLists)
  const deletedKeys = new Set(cfg?._deletedProfileKeys || [])
  const next = {
    ...cfg,
    providerProfiles: {
      chat: [...(cfg.providerProfiles?.chat || [])],
      image: [...(cfg.providerProfiles?.image || [])],
      video: [...(cfg.providerProfiles?.video || [])]
    }
  }
  delete next._deletedProfileKeys
  for (const track of TRACKS) {
    const currentProvider = next.providers?.[track] || {}
    const account = findProviderAccount(next, currentProvider.accountId)
    if (account?.accountId) {
      const accountProviderDef = findProviderDef(track, account.providerId, providerLists)
      const keepModel = currentProvider.id === account.providerId ? currentProvider.model : ''
      next.providers[track] = {
        ...currentProvider,
        ...providerPatchFromAccount(account, accountProviderDef),
        model: modelForProviderSwitch(keepModel, accountProviderDef)
      }
    }
    const effectiveProvider = next.providers?.[track] || {}
    const providerDef = findProviderDef(track, effectiveProvider.id, providerLists)
    const recommendedModel = firstProviderModel(providerDef)
    if (effectiveProvider.id && !effectiveProvider.model && recommendedModel) {
      next.providers[track] = { ...effectiveProvider, model: recommendedModel }
    }
    const profile = profileFromProvider(track, next.providers?.[track], { ...providerLists, _config: next })
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

export async function loadProviders(action) {
  const fallback = normalizeProviderList(action, PROVIDER_MAP[action] || [])
  if (!window.electronAPI?.providerAPI?.list) return fallback
  try {
    const providers = await window.electronAPI.providerAPI.list(action)
    if (!Array.isArray(providers) || providers.length === 0) return fallback
    return normalizeProviderList(action, providers.map(provider => {
      const fallbackProvider = fallback.find(item =>
        item.id === provider.id || PROVIDER_ID_ALIASES[action]?.[item.id] === provider.id
      )
      const capability = provider[action] || provider.capabilities?.[action] || {}
      return {
        ...provider,
        defaultUrl: provider.defaultUrl || provider.defaults?.baseUrl || capability.baseUrl || fallbackProvider?.defaultUrl || '',
        defaultModel: provider.defaultModel || capability.defaultModel || fallbackProvider?.defaultModel || '',
        pathPrefix: provider.pathPrefix || capability.pathPrefix || fallbackProvider?.pathPrefix || '',
        modelListPath: provider.modelListPath || provider.modelsPath || capability.modelListPath || capability.modelsPath || fallbackProvider?.modelListPath || '',
        modelCatalog: Array.isArray(provider.modelCatalog) ? provider.modelCatalog : (fallbackProvider?.modelCatalog || []),
        protocol: provider.protocol || capability.protocol || fallbackProvider?.protocol,
        format: provider.format || capability.format || fallbackProvider?.format,
        authType: provider.authType || fallbackProvider?.authType
      }
    }))
  } catch {
    return fallback
  }
}

function migrateConfig(cfg, providerMap = PROVIDER_MAP) {
  if (!cfg?.providers) return cfg
  const next = {
    ...cfg,
    general: {
      ...cfg.general,
      enableVideo: cfg.general?.enableVideo === true
    },
    providers: { ...cfg.providers },
    providerProfiles: {
      chat: cfg.providerProfiles?.chat || [],
      image: cfg.providerProfiles?.image || [],
      video: cfg.providerProfiles?.video || []
    }
  }
  for (const [track, providers] of Object.entries(providerMap)) {
    const saved = next.providers[track]
    if (!saved?.id) continue
    const savedCanonicalId = canonicalProviderId(track, saved.id)
    const matchedProvider = providers.find(p => canonicalProviderId(track, p.id) === savedCanonicalId)
    if (!matchedProvider || !isExecutableProvider(matchedProvider)) {
      const fallback = providers.find(isExecutableProvider) || providers[0]
      if (!fallback) continue
      next.providers[track] = { id: fallback.id, apiKey: '', baseUrl: fallback.defaultUrl, model: firstProviderModel(fallback) }
    } else if (DEPRECATED_MODELS.includes(saved.model)) {
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
  const [config, setConfig] = useState(null)
  const [providerLists, setProviderLists] = useState(PROVIDER_MAP)
  const configRef = useRef(null)

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
      const migrationProviderMap = Object.fromEntries(
        Object.entries(loadedProviderLists).map(([track, providers]) => [
          track,
          mergeProviderLists(providers, PROVIDER_MAP[track])
        ])
      )
      const migrated = migrateProviderAccounts(migrateConfig(c, migrationProviderMap), migrationProviderMap)
      configRef.current = migrated
      setConfig(migrated)
    })
    return () => { cancelled = true }
  }, [])

  const save = useCallback(async (newCfg) => {
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
        configRef.current = redacted
        setConfig(redacted)
      }
    } catch {
      // Persisted fine; if reload fails we just keep the previous state.
    }
  }, [providerLists])

  const updateProvider = useCallback((track, patch) => {
    const current = configRef.current
    if (!current) return
    const next = {
      ...current,
      providers: { ...current.providers, [track]: { ...current.providers[track], ...patch } }
    }
    save(next)
  }, [save])

  const updateGeneral = useCallback((patch) => {
    const current = configRef.current
    if (!current) return
    const next = { ...current, general: { ...current.general, ...patch } }
    save(next)
  }, [save])

  return { config, providerLists, save, updateProvider, updateGeneral }
}
