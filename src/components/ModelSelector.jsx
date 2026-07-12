// @ts-check

import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { sameProviderId } from '../providers/aliases'
import { createProviderProfilePatch, buildConfigProviderProfiles } from '../utils/providerConfig.js'
import { normalizeAuthType } from '../utils/authType'
import Ic from './icons'

/** @typedef {import('../types/domain').ConfigPayload} ConfigPayload */
/** @typedef {import('../types/domain').ProviderDefinition} ProviderDefinition */
/** @typedef {import('../types/domain').ProviderLists} ProviderLists */
/** @typedef {import('../types/domain').ProviderProfile} ProviderProfile */
/** @typedef {import('../types/domain').Track} Track */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {{ track: Track, current?: ProviderProfile, profiles: ProviderProfile[] }} PickerItem */

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** @param {unknown} value @returns {UnknownRecord} */
function recordOf(value) {
  return isRecord(value) ? value : {}
}

/** @param {Track} track @param {ProviderLists} providerLists @param {ProviderProfile} profile */
function findProviderDef(track, providerLists = {}, profile = {}) {
  const providers = providerLists?.[track] || []
  return providers.find(item => sameProviderId(track, item.id, profile.providerId || profile.id))
}

/** @param {ProviderDefinition | undefined} provider */
function isExecutableProvider(provider) {
  return Boolean(provider && provider.executable !== false && provider.integrationStatus !== 'metadata')
}

/** @param {ProviderProfile} profile @param {ProviderDefinition | undefined} providerDef */
function hasCredential(profile = {}, providerDef) {
  if (profile.accountId && profile.accountKind !== 'oauth-placeholder') return true
  const customType = normalizeAuthType(profile.customAuth?.type)
  const profileAuth = recordOf(profile.authType)
  const providerAuth = recordOf(providerDef?.authType)
  const type = customType || normalizeAuthType(profileAuth.type || providerAuth.type)
  if (type === 'none') return Boolean(profile.providerId || profile.id || providerDef?.id)
  if (type === 'session') return Boolean(profile.sessionToken)
  return Boolean(profile.apiKey)
}

/** @param {Track} track @param {ProviderLists} providerLists @param {ProviderProfile} profile */
function providerName(track, providerLists = {}, profile = {}) {
  const provider = findProviderDef(track, providerLists, profile)
  return profile.name || provider?.name || profile.providerId || profile.id || t('provider', 'zh')
}

/** @param {Track} track @param {ProviderProfile} current @param {ProviderProfile} profile */
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

/**
 * @param {{
 *   track: Track,
 *   current?: ProviderProfile,
 *   profiles: ProviderProfile[],
 *   providerLists: ProviderLists,
 *   onSelect: (track: Track, patch: UnknownRecord) => void,
 *   lang: string
 * }} props
 */
function ModelPicker({ track, current = {}, profiles, providerLists, onSelect, lang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null))
  const currentProfile = profiles.find(profile => sameProfile(track, current, profile))
  const displayModel = currentProfile?.model || current?.model || profiles[0]?.model || t('modelSelector', lang)

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
    onSelect(track, createProviderProfilePatch(profile))
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0, maxWidth: '100%' }}>
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
        maxWidth: 142,
        minWidth: 0,
        minHeight: 28,
        fontFamily: 'var(--font-body)',
        boxShadow: open ? '0 0 0 2px var(--accent-glow)' : 'none'
      }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>{t(track, lang)}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{displayModel}</span>
        <Ic n="chevDown" size={10} sw={2} />
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 6,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: 6,
          width: 280,
          maxWidth: 'calc(100vw - 96px)',
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

/**
 * @param {{
 *   config: ConfigPayload | null,
 *   providerLists: ProviderLists,
 *   activeModule?: 'image' | 'video',
 *   onProviderChange: (track: Track, patch: UnknownRecord) => void,
 *   lang: string
 * }} props
 */
export default function ModelSelector({ config, providerLists, activeModule = 'image', onProviderChange, lang }) {
  const mediaTrack = activeModule === 'video' ? 'video' : 'image'
  /** @type {Track[]} */
  const tracks = ['chat', mediaTrack]
  const items = tracks.map(track => {
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
      const seen = new Set(/** @type {string[]} */ ([]))
      profiles = [...customProfiles, ...savedProfiles].filter(profile => {
        const key = `${profile.providerId || profile.id}|${profile.baseUrl || ''}|${profile.model || ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }
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
          onSelect={onProviderChange}
          lang={lang}
        />
      ))}
    </div>
  )
}
