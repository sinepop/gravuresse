import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { sameProviderId } from '../providers/aliases'
import Ic from './icons'

function hasCredential(profile = {}) {
  return profile.customAuth?.type === 'session' ? Boolean(profile.sessionToken) : Boolean(profile.apiKey)
}

function providerName(track, providerLists = {}, profile = {}) {
  const providers = providerLists?.[track] || []
  const provider = providers.find(item => sameProviderId(track, item.id, profile.providerId || profile.id))
  return profile.name || provider?.name || profile.providerId || profile.id || t('provider', 'zh')
}

function sameProfile(track, current = {}, profile = {}) {
  return sameProviderId(track, current?.id, profile.providerId || profile.id) &&
    (current?.baseUrl || '') === (profile.baseUrl || '') &&
    (current?.model || '') === (profile.model || '')
}

function profileToProviderPatch(profile = {}) {
  return {
    id: profile.providerId || profile.id,
    apiKey: profile.apiKey || '',
    sessionToken: profile.sessionToken || '',
    baseUrl: profile.baseUrl || '',
    model: profile.model || '',
    protocol: profile.protocol,
    format: profile.format,
    customAuth: profile.customAuth || {},
    template: profile.template,
    pathPrefix: profile.pathPrefix,
    timeout: profile.timeout,
    pollInterval: profile.pollInterval,
    defaultNegPrompt: profile.defaultNegPrompt,
    customSystemPrompt: profile.customSystemPrompt
  }
}

function ModelPicker({ track, current, profiles, providerLists, onSelect, lang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const currentProfile = profiles.find(profile => sameProfile(track, current, profile)) || profiles[0]

  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectProfile = (profile) => {
    onSelect(track, profileToProviderPatch(profile))
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        background: open ? 'var(--accent-soft)' : 'var(--bg-surface)',
        border: `1px solid ${open ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: '5px 8px',
        color: 'var(--text-secondary)',
        fontSize: 10,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        maxWidth: 150,
        minHeight: 28,
        fontFamily: 'var(--font-body)',
        boxShadow: open ? '0 0 0 2px var(--accent-glow)' : 'none'
      }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>{t(track, lang)}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentProfile?.model}</span>
        <Ic n="chevDown" size={10} sw={2} />
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          right: 0,
          marginBottom: 6,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: 6,
          width: 300,
          zIndex: 100,
          boxShadow: 'var(--shadow-lg)',
          animation: 'scaleIn 0.12s ease'
        }}>
          {profiles.map(profile => {
            const selected = sameProfile(track, current, profile)
            const key = profile.profileId || `${profile.providerId || profile.id}:${profile.baseUrl || ''}:${profile.model}`
            return (
              <button key={key} onClick={() => selectProfile(profile)} style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: 2,
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                background: selected ? 'var(--accent-soft)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: 11,
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
    const profiles = (config?.providerProfiles?.[track] || []).filter(profile => hasCredential(profile) && profile.model)
    return profiles.length ? { track, current: config?.providers?.[track], profiles } : null
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
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
