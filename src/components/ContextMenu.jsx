import { useEffect, useRef, useState } from 'react'
import Ic from './icons'
import { t } from '../i18n'

const MENU_ITEMS = [
  { id: 'view', key: 'viewImage', icon: 'eye' },
  { id: 'download', key: 'downloadFile', icon: 'download' },
  { id: 'regenerate', key: 'regenerate', icon: 'refresh', type: 'image' },
  { id: 'variation', key: 'variation', icon: 'sparkle', type: 'image' },
  { id: 'restyle', key: 'restyle', icon: 'image', type: 'image' },
  { id: 'toVideo', key: 'toVideo', icon: 'film', type: 'image' },
  { id: 'toggleMaterial', icon: 'star' },
  { id: 'useAsReference', key: 'useAsReference', icon: 'link', requiresUrl: true },
  { id: 'usePrompt', key: 'usePrompt', icon: 'pencil', requiresPrompt: true },
  { id: 'copyPrompt', key: 'copyPrompt', icon: 'copy' },
  { id: 'delete', key: 'delete', icon: 'trash', danger: true }
]

export default function ContextMenu({ x, y, asset, onClose, onAction, lang, videoEnabled = false, referenceEnabled = false }) {
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

  const items = MENU_ITEMS.filter(item => {
    if (item.id === 'toVideo' && !videoEnabled) return false
    if (item.id === 'useAsReference' && !referenceEnabled) return false
    if (item.requiresUrl && !asset?.url) return false
    if (item.requiresPrompt && !(asset?.generation?.prompt || asset?.prompt)) return false
    return !item.type || item.type === asset?.type
  })
  return (
    <div ref={ref} className="glass-overlay glass-specular context-menu" role="menu" style={{ position: 'fixed', left: position.left, top: position.top, zIndex: 2000, padding: 4, minWidth: 160 }}>
      {items.map(item => (
        <button key={item.id} className="context-menu-item" role="menuitem" onClick={() => { onAction(item.id, asset); onClose() }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', color: item.danger ? 'var(--danger)' : undefined }}
        >
          <Ic n={item.icon} size={12} color={item.danger ? 'var(--danger)' : 'var(--text-secondary)'} />
          {t(item.key || (asset?.isMaterial ? 'unmarkMaterial' : 'markMaterial'), lang)}
        </button>
      ))}
    </div>
  )
}
