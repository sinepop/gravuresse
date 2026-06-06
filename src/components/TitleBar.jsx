import { useEffect, useState } from 'react'
import Ic from './icons'
import { t } from '../i18n'

export default function TitleBar({ onOpenSettings, lang }) {
  const [isMax, setIsMax] = useState(false)
  const [hoveredBtn, setHoveredBtn] = useState(null)

  useEffect(() => {
    const handler = (_, val) => setIsMax(val)
    window.electronAPI?.on?.('window-maximized', handler)
    return () => window.electronAPI?.off?.('window-maximized', handler)
  }, [])

  const winBtn = (fn, icon, id, isClose, ariaLabel) => {
    const hovered = hoveredBtn === id
    return (
      <button onClick={fn} aria-label={ariaLabel} style={{
        background: isClose && hovered ? 'var(--danger, #E85454)' : hovered ? 'rgba(255,255,255,0.08)' : 'transparent',
        border: 'none', color: isClose && hovered ? '#fff' : hovered ? 'var(--text-primary)' : 'var(--text-muted)',
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
      background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)',
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
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, WebkitAppRegion: 'no-drag' }}>
        <button onClick={onOpenSettings} title={t('settingsTitle', lang)} aria-label={t('settingsTitle', lang)} style={{
          background: hoveredBtn === 'settings' ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: 'none', color: hoveredBtn === 'settings' ? 'var(--accent)' : 'var(--text-muted)',
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'all 0.15s ease'
        }}
        onMouseEnter={() => setHoveredBtn('settings')}
        onMouseLeave={() => setHoveredBtn(null)}
        ><Ic n="gear" size={15} sw={1.8} /></button>
        {winBtn(() => window.electronAPI?.minimize(), <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="2" y1="7" x2="12" y2="7"/></svg>, 'min', false, 'Minimize')}
        {winBtn(() => window.electronAPI?.maximize(), isMax
          ? <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><path d="M1 5.5V3a1 1 0 011-1h2.5M8.5 1H11a1 1 0 011 1v2.5M13 8.5V11a1 1 0 01-1 1H9.5M5.5 13H3a1 1 0 01-1-1V9.5"/></svg>
          : <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="10" height="10" rx="1.5"/></svg>, 'max', false, isMax ? 'Restore' : 'Maximize')}
        {winBtn(() => window.electronAPI?.close(), <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>, 'close', true, 'Close')}
      </div>
    </div>
  )
}
