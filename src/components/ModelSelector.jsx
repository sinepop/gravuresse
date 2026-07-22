// @ts-check

import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { sameProviderId } from '../providers/aliases'
import Ic from './icons'

/** @typedef {import('../types/domain').ConfigPayload} ConfigPayload */
/** @typedef {import('../types/domain').ProviderLists} ProviderLists */
/** @typedef {import('../types/domain').ProviderProfile} ProviderProfile */
/** @typedef {import('../types/domain').Track} Track */
/** @typedef {{ connectionId?: string, providerId?: string, id?: string, modelId?: string, model?: string, name?: string, profileId?: string, baseUrl?: string }} ActiveSelection */

/** @param {Track} track @param {ProviderLists} providerLists @param {ActiveSelection} profile */
function findProviderDef(track, providerLists = {}, profile = {}) {
  const providers = providerLists?.[track] || []
  return providers.find(item => sameProviderId(track, item.id, profile.providerId || profile.id))
}

/** @param {Track} track @param {ProviderLists} providerLists @param {ActiveSelection} profile */
function providerName(track, providerLists = {}, profile = {}) {
  const provider = findProviderDef(track, providerLists, profile)
  return profile.name || provider?.name || profile.providerId || profile.id || t('provider', 'zh')
}

/** @param {ActiveSelection} current @param {ActiveSelection} profile */
function sameProfile(current = {}, profile = {}) {
  return current.connectionId === profile.connectionId &&
    (current.modelId || '') === (profile.modelId || profile.model || '')
}

/** @param {{ track: Track, current?: ActiveSelection, profiles: ProviderProfile[], providerLists: ProviderLists, onConnectionSelect?: (track: Track, selection: ActiveSelection) => void, lang: string }} props */
function ModelPicker({ track, current, profiles, providerLists, onConnectionSelect, lang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null))
  const currentProfile = profiles.find(profile => sameProfile(current, profile))
  const displayModel = currentProfile?.model || t('modelSelector', lang)

  useEffect(() => {
    /** @param {MouseEvent} event */
    const handler = (event) => {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /** @param {ProviderProfile} profile */
  const selectProfile = (profile) => {
    onConnectionSelect?.(track, { connectionId: profile.connectionId, providerId: profile.providerId, modelId: profile.model })
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0, maxWidth: '100%' }}>
      <button className="glass-control model-selector-trigger" data-open={open ? 'true' : 'false'} aria-expanded={open} onClick={() => setOpen(!open)} style={{
        border: `1px solid ${open ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'var(--font-body)',
        boxShadow: open ? '0 0 0 2px var(--accent-glow)' : 'none'
      }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>{t(track, lang)}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{displayModel}</span>
        <Ic n="chevDown" size={10} sw={2} />
      </button>

      {open && (
        <div className="glass-overlay glass-specular model-selector-menu" style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 6,
          padding: 6,
          width: 280,
          maxWidth: 'calc(100vw - 96px)',
          zIndex: 100,
          animation: 'scaleIn 0.12s ease'
        }}>
          {profiles.map(profile => {
            const selected = sameProfile(current, profile)
            const key = profile.profileId || `${profile.providerId || profile.id}:${profile.baseUrl || ''}:${profile.model}`
            return (
              <button key={key} className="model-selector-option" onClick={() => selectProfile(profile)} style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: 2,
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                background: selected ? 'var(--accent-soft)' : 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)'
              }}>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {providerName(track, providerLists, profile)}
                </span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.model}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** @param {ConfigPayload | null} config @param {Track} track */
function canonicalProfiles(config, track) {
  const all = [
    ...(config?.connections?.accounts || []),
    ...(config?.connections?.apiKeys || []),
    ...(config?.connections?.relays || [])
  ]
  /** @type {ProviderProfile[]} */
  const profiles = []
  for (const connection of all) {
    const validation = connection.validations?.[track]
    const currentInventory = validation?.ok === true && ['verified', 'directory_verified'].includes(validation?.status) &&
      validation.track === track && validation.inventoryRevision && validation.inventoryRevision === connection.inventoryRevision &&
      validation.inventoryRevision === connection.revision
    if (!currentInventory || !connection.capabilities?.includes(track)) continue
    for (const model of connection.models || []) {
      if (model.source !== 'remote' || model.capability !== track) continue
      profiles.push({
        connectionId: connection.id,
        providerId: connection.providerId,
        id: connection.providerId,
        name: connection.name,
        model: model.id,
        modelId: model.id,
        baseUrl: connection.baseUrl || ''
      })
    }
  }
  return profiles
}

/** @param {{ config: ConfigPayload | null, providerLists: ProviderLists, activeModule?: 'image' | 'video', activeSelections?: Partial<Record<Track, ActiveSelection>>, onConnectionModelChange?: (track: Track, selection: ActiveSelection) => void, lang: string }} props */
export default function ModelSelector({ config, providerLists, activeModule = 'image', activeSelections = {}, onConnectionModelChange, lang }) {
  const mediaTrack = activeModule === 'video' ? 'video' : 'image'
  /** @type {Track[]} */
  const tracks = ['chat', mediaTrack]
  const items = tracks.map(track => {
    const profiles = canonicalProfiles(config, track)
    const current = activeSelections?.[track] || config?.connections?.defaults?.[track] || {}
    return profiles.length ? { track, current, profiles } : null
  }).filter((item) => item !== null)

  if (items.length === 0) {
    return (
      <button disabled title={t('noSavedModels', lang)} style={{
        background: 'transparent',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '5px 10px',
        color: 'var(--text-ghost)',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        cursor: 'default',
        fontFamily: 'var(--font-body)'
      }}>
        <Ic n="server" size={11} sw={2} />
        {t('modelSelector', lang)}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%', flexWrap: 'wrap' }}>
      {items.map(item => (
        <ModelPicker
          key={item.track}
          track={item.track}
          current={item.current}
          profiles={item.profiles}
          providerLists={providerLists}
          onConnectionSelect={onConnectionModelChange}
          lang={lang}
        />
      ))}
    </div>
  )
}
