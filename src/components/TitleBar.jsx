import { useEffect, useState } from 'react'
import Ic from './icons'
import { t } from '../i18n'

export default function TitleBar({ onOpenSettings, lang }) {
  const [isMax, setIsMax] = useState(false)

  useEffect(() => {
    const handler = (_, val) => setIsMax(val)
    window.electronAPI?.on?.('window-maximized', handler)
  }, [])

  const btn = (fn, label) => (
    <button onClick={fn} style={{
      background: 'none', border: 'none', color: 'var(--text-secondary)',
      width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, borderRadius: 4
    }}
    onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
    onMouseLeave={e => e.target.style.background = 'none'}
    >{label}</button>
  )

  return (
    <div style={{
      height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 8px 0 16px', WebkitAppRegion: 'drag',
      background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-subtle)'
    }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontStyle: 'italic', color: 'var(--text-secondary)' }}>
        {t('studioAi', lang)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', WebkitAppRegion: 'no-drag' }}>
        <button onClick={onOpenSettings} title={t('settingsTitle', lang)} style={{
          background: 'none', border: 'none', color: 'var(--text-secondary)',
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', borderRadius: 4
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
        ><Ic n="gear" size={14} /></button>
        {btn(() => window.electronAPI?.minimize(), '─')}
        {btn(() => window.electronAPI?.maximize(), isMax ? '❐' : '□')}
        {btn(() => window.electronAPI?.close(), '×')}
      </div>
    </div>
  )
}
