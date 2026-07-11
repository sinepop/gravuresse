import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { sameProviderId } from '../providers/aliases'
import { createProviderProfilePatch, buildConfigProviderProfiles } from '../utils/providerConfig.js'
import Ic from './icons'

function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

function findProviderDef(track, providerLists = {}, profile = {}) {
  const providers = providerLists?.[track] || []
  return providers.find(item => sameProviderId(track, item.id, profile.providerId || profile.id))
}

function isExecutableProvider(provider = {}) {
  return Boolean(provider) && provider.executable !== false && provider.integrationStatus !== 'metadata'
}

function hasCredential(profile = {}, providerDef = {}) {
  if (profile.accountId && profile.accountKind !== 'oauth-placeholder') return true
  const customType = normalizeAuthType(profile.customAuth?.type)
  const type = customType || normalizeAuthType(profile.authType?.type || providerDef?.authType?.type)
  if (type === 'none') return Boolean(profile.providerId || profile.id || providerDef.id)
  if (type === 'session') return Boolean(profile.sessionToken)
  return Boolean(profile.apiKey)
}

function providerName(track, providerLists = {}, profile = {}) {
  const provider = findProviderDef(track, providerLists, profile)
  return profile.name || provider?.name || profile.providerId || profile.id || t('provider', 'zh')
}

function sameProfile(track, current = {}, profile = {}) {
  // Config-array profiles share the same id; use _configProviderIndex to disambiguate
  if (typeof profile._configProviderIndex === 'number' && typeof current._configProviderIndex === 'number') {
    return profile._configProviderIndex === current._configProviderIndex &&
      (current?.model || '') === (profile.model || '')
  }
  return sameProviderId(track, current?.id, profile.providerId || profile.id) &&
    (current?.baseUrl || '') === (profile.baseUrl || '') &&
    (current?.model || '') === (profile.model || '')
}

function ModelPicker({ track, current, profiles, providerLists, onSelect, lang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const currentProfile = profiles.find(profile => sameProfile(track, current, profile))
  const displayModel = currentProfile?.model || current?.model || profiles[0]?.model || t('modelSelector', lang)

  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectProfile = (profile) => {
    onSelect(track, createProviderProfilePatch(profile))
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
            const selected = sameProfile(track, current, profile)
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

export default function ModelSelector({ config, providerLists, activeModule = 'image', onProviderChange, lang }) {
  const mediaTrack = activeModule === 'video' ? 'video' : 'image'
  const items = ['chat', mediaTrack].map(track => {
    const current = config?.providers?.[track]
    const savedProfiles = (config?.providerProfiles?.[track] || []).filter(profile => {
      const providerDef = findProviderDef(track, providerLists, profile)
      return isExecutableProvider(providerDef) && hasCredential(profile, providerDef) && profile.model
    })
    let profiles = savedProfiles
    if (track === 'chat') {
      const customProfiles = buildConfigProviderProfiles(config).filter(profile => {
        const providerDef = findProviderDef(track, providerLists, profile)
        return isExecutableProvider(providerDef) && hasCredential(profile, providerDef) && profile.model
      })
      const seen = new Set()
      profiles = [...customProfiles, ...savedProfiles].filter(profile => {
        const key = `${profile.providerId || profile.id}|${profile.baseUrl || ''}|${profile.model || ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }
    return profiles.length ? { track, current, profiles } : null
  }).filter(Boolean)

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
          onSelect={onProviderChange}
          lang={lang}
        />
      ))}
    </div>
  )
}
