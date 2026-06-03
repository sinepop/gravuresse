import { useState, useRef, useEffect } from 'react'
import { CHAT_PROVIDERS } from '../providers/chatProviders'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { t } from '../i18n'
import Ic from './icons'

const TRACKS = [
  { key: 'chat', label: '对话', providers: CHAT_PROVIDERS },
  { key: 'image', label: '图像', providers: IMG_PROVIDERS },
  { key: 'video', label: '视频', providers: VID_PROVIDERS }
]

function Dropdown({ track, current, onChange, onOpenSettings, lang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const currentProvider = track.providers.find(p => p.id === current?.id)
  const configured = current?.apiKey

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => configured ? setOpen(!open) : onOpenSettings()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        color: configured ? 'var(--text-primary)' : 'var(--text-muted)',
        padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11,
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'
      }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{track.label}:</span>
        {currentProvider?.name || t('noConfig', lang)}
        {configured ? <Ic n="chevDown" size={10} /> : <Ic n="gear" size={10} color="var(--accent)" />}
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)', padding: 4, minWidth: 180, zIndex: 100,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        }}>
          {track.providers.map(p => (
            <button key={p.id} onClick={() => { onChange(track.key, p); setOpen(false) }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
              background: p.id === current?.id ? 'var(--accent-soft)' : 'transparent',
              border: 'none', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer'
            }}
            onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.target.style.background = p.id === current?.id ? 'var(--accent-soft)' : 'transparent'}
            >{p.name}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ModelBar({ config, onProviderChange, onOpenSettings, lang }) {
  if (!config) return null
  return (
    <div style={{
      height: 44, borderTop: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', background: 'var(--bg-primary)'
    }}>
      {TRACKS.map(t => (
        <Dropdown key={t.key} track={t} current={config.providers?.[t.key]}
          onChange={onProviderChange} onOpenSettings={onOpenSettings} lang={lang} />
      ))}
    </div>
  )
}
