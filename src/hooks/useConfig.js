import { useState, useEffect, useCallback, useRef } from 'react'
import { CHAT_PROVIDERS } from '../providers/chatProviders'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'

const PROVIDER_MAP = { chat: CHAT_PROVIDERS, image: IMG_PROVIDERS, video: VID_PROVIDERS }

const DEPRECATED_MODELS = ['pollinations']

function migrateConfig(cfg) {
  if (!cfg?.providers) return cfg
  const next = { ...cfg, providers: { ...cfg.providers } }
  for (const [track, providers] of Object.entries(PROVIDER_MAP)) {
    const saved = next.providers[track]
    if (!saved?.id) continue
    const matchedProvider = providers.find(p => p.id === saved.id)
    if (!matchedProvider) {
      const fallback = providers[0]
      next.providers[track] = { id: fallback.id, apiKey: '', baseUrl: fallback.defaultUrl, model: fallback.defaultModel }
    } else if (DEPRECATED_MODELS.includes(saved.model)) {
      next.providers[track] = { ...saved, model: matchedProvider.defaultModel }
    }
  }
  return next
}

export default function useConfig() {
  const [config, setConfig] = useState(null)
  const configRef = useRef(null)

  useEffect(() => {
    window.electronAPI?.getConfig().then(c => {
      if (!c) return
      const migrated = migrateConfig(c)
      configRef.current = migrated
      setConfig(migrated)
    })
  }, [])

  const save = useCallback(async (newCfg) => {
    configRef.current = newCfg
    setConfig(newCfg)
    await window.electronAPI?.saveConfig(newCfg)
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

  return { config, save, updateProvider, updateGeneral }
}
