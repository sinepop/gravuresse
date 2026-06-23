import { useState, useRef, useEffect } from 'react'
import { t } from '../i18n'
import { sameProviderId } from '../providers/aliases'
import Ic from './icons'

const TRACK_KEYS = [
  { key: 'chat', label: '对话' },
  { key: 'image', label: '图像' },
  { key: 'video', label: '视频' }
]

function executableProviders(providers = []) {
  const filtered = providers.filter(provider => provider?.executable !== false && provider?.integrationStatus !== 'metadata')
  return filtered.length ? filtered : providers
}

function Dropdown({ trackKey, providers, current, onChange, onOpenSettings, lang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const currentProvider = providers.find(p => sameProviderId(trackKey, p.id, current?.id))
  const configured = current?.apiKey || current?.sessionToken

  const handleProviderSelect = (provider) => {
    const changedProvider = !sameProviderId(trackKey, provider.id, current?.id)
    const patch = changedProvider
      ? {
          id: provider.id,
          apiKey: '',
          sessionToken: '',
          customAuth: {},
          baseUrl: provider.defaultUrl || '',
          model: provider.defaultModel || '',
          protocol: provider.protocol,
          format: provider.format
        }
      : {
          ...(current?.id !== provider.id ? { id: provider.id } : {}),
          ...(provider.protocol && current?.protocol !== provider.protocol ? { protocol: provider.protocol } : {}),
          ...(provider.format && current?.format !== provider.format ? { format: provider.format } : {})
        }
    if (Object.keys(patch).length > 0) onChange(trackKey, patch)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => configured ? setOpen(!open) : onOpenSettings()} style={{
        background: open ? 'var(--accent-soft)' : 'transparent',
        border: `1px solid ${open ? 'var(--border-accent)' : 'transparent'}`,
        color: configured ? 'var(--text-primary)' : 'var(--text-muted)',
        padding: '6px 14px', borderRadius: '99px', fontSize: 11,
        display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
        transition: 'all 0.2s ease', fontWeight: configured ? 500 : 400,
        boxShadow: open ? '0 0 0 2px var(--accent-glow)' : 'none'
      }}
      onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = 'var(--border-accent)' }}
      onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = 'var(--border-default)' }}
      >
        <span style={{ color: 'var(--accent)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t(trackKey, lang)}</span>
        <span style={{ width: 1, height: 12, background: 'var(--border-default)', flexShrink: 0 }} />
        {currentProvider?.name || t('noConfig', lang)}
        {configured ? <Ic n="chevDown" size={11} sw={2} /> : <Ic n="gear" size={11} color="var(--accent)" />}
      </button>
      {open && (
        <div className="glass-floating" style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
          padding: 6, minWidth: 180, zIndex: 100,
          animation: 'scaleIn 0.12s ease'
        }}>
          {providers.map(p => {
            const selected = sameProviderId(trackKey, p.id, current?.id)
            return (
            <button key={p.id} onClick={() => handleProviderSelect(p)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
              background: selected ? 'var(--accent-soft)' : 'transparent',
              border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer',
              fontWeight: selected ? 500 : 400, transition: 'background 0.12s'
            }}
            onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.target.style.background = selected ? 'var(--accent-soft)' : 'transparent'}
            >{p.name}</button>
          )})}
        </div>
      )}
    </div>
  )
}

export default function ModelBar({ config, providerLists, onProviderChange, onOpenSettings, lang }) {
  if (!config) return null
  return (
    <div className="glass-floating" style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
      borderRadius: '99px'
    }}>
      {TRACK_KEYS.map(t => (
        <Dropdown key={t.key} trackKey={t.key} providers={executableProviders(providerLists?.[t.key] || [])}
          current={config.providers?.[t.key]}
          onChange={onProviderChange} onOpenSettings={onOpenSettings} lang={lang} />
      ))}
      <div style={{ flex: 1 }} />
      <span style={{
        fontSize: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)',
        letterSpacing: '0.5px', padding: '4px 10px', borderRadius: '99px',
        background: 'var(--bg-input)', border: '1px solid var(--border-subtle)'
      }}>v1.6.0</span>
    </div>
  )
}
