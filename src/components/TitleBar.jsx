// @ts-check

import { useEffect, useState } from 'react'
import Ic from './icons'
import { t } from '../i18n'
import packageInfo from '../../package.json'

/** @param {{ onOpenSettings: () => void, lang: string }} props */
export default function TitleBar({ onOpenSettings, lang }) {
  const [isMax, setIsMax] = useState(false)
  const [hoveredBtn, setHoveredBtn] = useState(/** @type {string | null} */ (null))

  useEffect(() => {
    /** @param {unknown} val */
    const handler = (val) => setIsMax(val === true)
    const unsubscribe = window.electronAPI?.on?.('window-maximized', handler)
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
      else window.electronAPI?.off?.('window-maximized', handler)
    }
  }, [])

  /**
   * @param {() => void} fn
   * @param {React.ReactNode} icon
   * @param {string} id
   * @param {boolean} isClose
   * @param {string} ariaLabel
   */
  const winBtn = (fn, icon, id, isClose, ariaLabel) => {
    const hovered = hoveredBtn === id
    return (
      <button onClick={fn} aria-label={ariaLabel} style={{
        background: isClose && hovered ? 'var(--danger)' : hovered ? 'var(--bg-hover)' : 'transparent',
        border: 'none', color: isClose && hovered ? 'var(--text-white)' : hovered ? 'var(--text-primary)' : 'var(--text-muted)',
        width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--radius-sm)', transition: 'all 0.15s ease',
        position: 'relative'
      }}
      onMouseEnter={() => setHoveredBtn(id)}
      onMouseLeave={() => setHoveredBtn(null)}
      >
        {icon}
      </button>
    )
  }

  return (
    <div style={{
      height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 10px 0 16px', WebkitAppRegion: 'drag',
      background: 'transparent',
      position: 'relative', zIndex: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--accent)', boxShadow: '0 0 10px var(--accent-glow), 0 0 3px var(--accent)',
          animation: 'breathe 3s ease-in-out infinite'
        }} />
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 15, fontStyle: 'italic',
          color: 'var(--text-primary)', letterSpacing: '0.5px', fontWeight: 600
        }}>
          {t('studioAi', lang)}
        </span>
        <span style={{
          fontSize: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)',
          letterSpacing: '0.5px', padding: '2px 6px', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)'
        }}>v{packageInfo.version}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, WebkitAppRegion: 'no-drag' }}>
        <button onClick={onOpenSettings} title={t('settingsTitle', lang)} aria-label={t('settingsTitle', lang)} style={{
          background: hoveredBtn === 'settings' ? 'var(--bg-hover)' : 'transparent',
          border: 'none', color: hoveredBtn === 'settings' ? 'var(--accent)' : 'var(--text-muted)',
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'all 0.15s ease'
        }}
        onMouseEnter={() => setHoveredBtn('settings')}
        onMouseLeave={() => setHoveredBtn(null)}
        ><Ic n="gear" size={15} sw={1.8} /></button>
        {winBtn(() => window.electronAPI?.minimize(), <Ic n="winMin" size={14} sw={1.8} />, 'min', false, 'Minimize')}
        {winBtn(() => window.electronAPI?.maximize(), <Ic n={isMax ? 'winRestore' : 'winMax'} size={13} sw={1.8} />, 'max', false, isMax ? 'Restore' : 'Maximize')}
        {winBtn(() => window.electronAPI?.close(), <Ic n="winClose" size={14} sw={1.8} />, 'close', true, 'Close')}
      </div>
    </div>
  )
}
