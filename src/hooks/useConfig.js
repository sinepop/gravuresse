import { useState, useEffect, useCallback, useRef } from 'react'
import { CHAT_PROVIDERS } from '../providers/chatProviders'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { PROVIDER_ID_ALIASES } from '../providers/aliases'

const PROVIDER_MAP = { chat: CHAT_PROVIDERS, image: IMG_PROVIDERS, video: VID_PROVIDERS }

const DEPRECATED_MODELS = ['pollinations']

function mergeProviderLists(primary, fallback) {
  return [...primary, ...fallback.filter(p => !primary.some(item => item.id === p.id))]
}

function isExecutableProvider(provider) {
  return provider?.executable !== false && provider?.integrationStatus !== 'metadata'
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
  const next = { ...cfg, providers: { ...cfg.providers } }
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
    configRef.current = newCfg
    setConfig(newCfg)
    await window.electronAPI?.saveConfig(newCfg)
    try {
      const redacted = await window.electronAPI?.getConfig?.()
      if (redacted) {
        configRef.current = redacted
        setConfig(redacted)
      }
    } catch {
      // Persisted fine; if reload fails we just keep the previous state.
    }
  }, [])

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
