import { useState, useEffect, useCallback, useRef } from 'react'
import { CHAT_PROVIDERS } from '../providers/chatProviders'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { PROVIDER_ID_ALIASES } from '../providers/aliases'

const PROVIDER_MAP = { chat: CHAT_PROVIDERS, image: IMG_PROVIDERS, video: VID_PROVIDERS }
const TRACKS = ['chat', 'image', 'video']

const DEPRECATED_MODELS = ['pollinations']

function mergeProviderLists(primary, fallback) {
  return [...primary, ...fallback.filter(p => !primary.some(item => item.id === p.id))]
}

function isExecutableProvider(provider) {
  return provider?.executable !== false && provider?.integrationStatus !== 'metadata'
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

function hasCredential(provider = {}) {
  return provider.customAuth?.type === 'session' ? Boolean(provider.sessionToken) : Boolean(provider.apiKey)
}

function profileFromProvider(track, providerConfig = {}, providerLists = PROVIDER_MAP) {
  if (!providerConfig?.id || !providerConfig.model || !hasCredential(providerConfig)) return null
  const providerDef = findProviderDef(track, providerConfig.id, providerLists)
  const key = profileKey(track, providerConfig)
  return {
    profileId: `profile_${hashString(key)}`,
    providerId: providerConfig.id,
    name: providerDef?.name || providerConfig.id,
    apiKey: providerConfig.apiKey || '',
    sessionToken: providerConfig.sessionToken || '',
    baseUrl: providerConfig.baseUrl || providerDef?.defaultUrl || '',
    model: providerConfig.model || providerDef?.defaultModel || '',
    protocol: providerConfig.protocol || providerDef?.protocol,
    format: providerConfig.format || providerDef?.format,
    customAuth: providerConfig.customAuth || {},
    template: providerConfig.template || providerConfig.customTemplate || undefined,
    pathPrefix: providerConfig.pathPrefix || '',
    timeout: providerConfig.timeout || '',
    pollInterval: providerConfig.pollInterval || '',
    defaultNegPrompt: providerConfig.defaultNegPrompt || '',
    customSystemPrompt: providerConfig.customSystemPrompt || ''
  }
}

function upsertProviderProfiles(cfg, providerLists = PROVIDER_MAP) {
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
    const profile = profileFromProvider(track, next.providers?.[track], providerLists)
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
  const fallback = PROVIDER_MAP[action] || []
  if (!window.electronAPI?.providerAPI?.list) return fallback
  try {
    const providers = await window.electronAPI.providerAPI.list(action)
    if (!Array.isArray(providers) || providers.length === 0) return fallback
    return providers.map(provider => {
      const fallbackProvider = fallback.find(item =>
        item.id === provider.id || PROVIDER_ID_ALIASES[action]?.[item.id] === provider.id
      )
      const capability = provider[action] || provider.capabilities?.[action] || {}
      return {
        ...provider,
        defaultUrl: provider.defaultUrl || provider.defaults?.baseUrl || capability.baseUrl || fallbackProvider?.defaultUrl || '',
        defaultModel: provider.defaultModel || capability.defaultModel || fallbackProvider?.defaultModel || '',
        protocol: provider.protocol || capability.protocol || fallbackProvider?.protocol,
        format: provider.format || capability.format || fallbackProvider?.format
      }
    })
  } catch {
    return fallback
  }
}

function migrateConfig(cfg, providerMap = PROVIDER_MAP) {
  if (!cfg?.providers) return cfg
  const next = {
    ...cfg,
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
    const matchedProvider = providers.find(p => p.id === saved.id)
    if (!matchedProvider || !isExecutableProvider(matchedProvider)) {
      const fallback = providers.find(isExecutableProvider) || providers[0]
      if (!fallback) continue
      next.providers[track] = { id: fallback.id, apiKey: '', baseUrl: fallback.defaultUrl, model: fallback.defaultModel }
    } else if (DEPRECATED_MODELS.includes(saved.model)) {
      next.providers[track] = { ...saved, model: matchedProvider.defaultModel }
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
      const migrated = migrateConfig(c, migrationProviderMap)
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
    // "has an API key been configured?" guards keep working, and provider
    // calls resolve the real key from disk on the main side.
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
