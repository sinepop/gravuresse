import { useEffect, useRef, useState } from 'react'
import Ic from './icons'
import { t } from '../i18n'

const MENU_ITEMS = [
  { id: 'view', key: 'viewImage', icon: 'eye' },
  { id: 'download', key: 'downloadFile', icon: 'download' },
  { id: 'regenerate', key: 'regenerate', icon: 'refresh' },
  { id: 'toVideo', key: 'toVideo', icon: 'film', type: 'image' },
  { id: 'copyPrompt', key: 'copyPrompt', icon: 'link' },
  { id: 'delete', key: 'delete', icon: 'trash', danger: true }
]

export default function ContextMenu({ x, y, asset, onClose, onAction, lang }) {
  const ref = useRef(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useEffect(() => {
    const onMouseDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const menu = ref.current
    if (!menu) {
      setPosition({ left: x, top: y })
      return
    }
    const margin = 8
    const rect = menu.getBoundingClientRect()
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin))
    setPosition({ left, top })
  }, [x, y, asset])

  const items = MENU_ITEMS.filter(item => !item.type || item.type === asset?.type)
  return (
    <div ref={ref} style={{ position: 'fixed', left: position.left, top: position.top, zIndex: 2000, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 4, minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
      {items.map(item => (
        <button key={item.id} onClick={() => { onAction(item.id, asset); onClose() }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 10px', background: 'transparent', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', color: item.danger ? 'var(--danger)' : 'var(--text-primary)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Ic n={item.icon} size={12} color={item.danger ? 'var(--danger)' : 'var(--text-secondary)'} />
          {t(item.key, lang)}
        </button>
      ))}
    </div>
  )
}
