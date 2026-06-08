import { useState, useRef, useCallback, useEffect } from 'react'
import Ic from './icons'
import { t } from '../i18n'

function ZoomableImage({ src, alt }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })
  const containerRef = useRef(null)

  const clampScale = (s) => Math.min(Math.max(s, 0.2), 10)

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(prev => clampScale(prev * delta))
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onMouseDown = (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      dragging.current = true
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY }
      setOffset(prev => { offsetStart.current = { ...prev }; return prev })
    }

    const onMouseMove = (e) => {
      if (!dragging.current) return
      setOffset({
        x: offsetStart.current.x + (e.clientX - dragStart.current.x),
        y: offsetStart.current.y + (e.clientY - dragStart.current.y)
      })
    }

    const onMouseUp = () => {
      dragging.current = false
      setIsDragging(false)
    }

    container.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      container.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const zoomIn = () => setScale(prev => clampScale(prev * 1.3))
  const zoomOut = () => setScale(prev => clampScale(prev / 1.3))
  const resetZoom = () => { setScale(1); setOffset({ x: 0, y: 0 }) }
  const fitToView = () => { setScale(1); setOffset({ x: 0, y: 0 }) }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Zoom toolbar */}
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20001,
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)', userSelect: 'none'
      }}>
        <button onClick={zoomOut} style={zoomBtnStyle} title="缩小 (-)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <span style={{ color: '#fff', fontSize: 11, minWidth: 44, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          {Math.round(scale * 100)}%
        </span>
        <button onClick={zoomIn} style={zoomBtnStyle} title="放大 (+)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
        <button onClick={resetZoom} style={{ ...zoomBtnStyle, fontSize: 10, padding: '2px 6px', width: 'auto' }} title="重置">
          1:1
        </button>
      </div>

      {/* Image container */}
      <div ref={containerRef} onWheel={handleWheel}
        onDoubleClick={resetZoom}
        style={{
          flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in'
        }}>
        <img src={src} alt={alt} draggable={false} style={{
          maxWidth: scale === 1 ? '90vw' : 'none',
          maxHeight: scale === 1 ? '85vh' : 'none',
          objectFit: 'contain',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: dragging ? 'none' : 'transform 0.15s ease-out',
          borderRadius: 'var(--radius-md)',
          userSelect: 'none', WebkitUserDrag: 'none'
        }} />
      </div>

      {/* Keyboard hints */}
      <div style={{
        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20001,
        display: 'flex', gap: 8, padding: '4px 10px',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', borderRadius: 6,
        fontSize: 10, color: 'rgba(255,255,255,0.5)', userSelect: 'none'
      }}>
        <span>滚轮缩放</span>
        <span>·</span>
        <span>拖拽平移</span>
        <span>·</span>
        <span>双击重置</span>
      </div>
    </div>
  )
}

const zoomBtnStyle = {
  background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer',
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 4, padding: 0
}

export default function AssetDetail({ asset, onClose, onDelete, onRegenerate, lang }) {
  const [lightbox, setLightbox] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  const isVideo = asset?.type === 'video'

  useEffect(() => {
    setLightbox(false)
    setMediaError(false)
  }, [asset?.id, asset?.url])

  // Escape key closes lightbox
  useEffect(() => {
    if (!lightbox) return
    const handler = (e) => { if (e.key === 'Escape') setLightbox(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox])

  const handleSave = async () => {
    if (!asset?.url || saving) return
    setSaving(true)
    try {
      await window.electronAPI.saveAssetWithDialog({ url: asset.url, label: asset.label, type: asset.type })
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div style={{ width: 280, borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{lang === 'en' ? 'Asset Details' : '资产详情'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 'var(--radius-sm)' }}><Ic n="close" size={12} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
          {asset.url && (
            <div onClick={() => { if (!isVideo && !mediaError) setLightbox(true) }} style={{
              borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 14,
              cursor: isVideo || mediaError ? 'default' : 'zoom-in', position: 'relative', border: '1px solid var(--border-subtle)',
              background: 'var(--bg-primary)', minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {mediaError ? (
                <div style={{ padding: 16, fontSize: 11, color: 'var(--danger)', textAlign: 'center' }}>
                  Preview failed to load
                </div>
              ) : isVideo ? (
                <video src={asset.url} controls style={{ width: '100%', display: 'block', maxHeight: 240 }} onError={() => setMediaError(true)} />
              ) : (
                <>
                  <img src={asset.url} alt={asset.label} style={{ width: '100%', display: 'block' }} onError={() => setMediaError(true)} />
              <div style={{
                position: 'absolute', bottom: 8, right: 8,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
                borderRadius: 'var(--radius-sm)', padding: '3px 8px',
                display: 'flex', alignItems: 'center', gap: 4
              }}>
                <Ic n="eye" size={11} color="#FFF" />
                <span style={{ fontSize: 10, color: '#fff' }}>{lang === 'en' ? 'Zoom' : '放大'}</span>
                  </div>
                </>
              )}
            </div>
          )}
          <div style={{ fontSize: 11, lineHeight: 2, color: 'var(--text-secondary)' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Type:' : '类型：'}</span>{asset.type === 'video' ? (lang === 'en' ? 'Video' : '视频') : (lang === 'en' ? 'Image' : '图片')}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Label:' : '标签：'}</span>{asset.label}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Model:' : '模型：'}</span>{asset.model}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Ratio:' : '画幅：'}</span>{asset.ratio}</div>
            {asset.style && <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Style:' : '风格：'}</span>{asset.style}</div>}
            <div><span style={{ color: 'var(--text-muted)' }}>{lang === 'en' ? 'Time:' : '时间：'}</span>{new Date(asset.createdAt).toLocaleString()}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Prompt</div>
            <div style={{ background: 'var(--bg-primary)', padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)', maxHeight: 160, overflow: 'auto', wordBreak: 'break-all', userSelect: 'text', WebkitUserSelect: 'text' }}>{asset.prompt || (lang === 'en' ? 'None' : '无')}</div>
          </div>
        </div>
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 6 }}>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '6px 0', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-sm)', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Ic n="download" size={11} /> {saving ? '...' : t('saveToLocal', lang)}
          </button>
          <button onClick={onRegenerate} style={{ padding: '6px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}><Ic n="refresh" size={11} /></button>
          <button onClick={onDelete} style={{ padding: '6px 10px', background: 'var(--danger-soft)', border: '1px solid rgba(196,85,74,0.2)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: 11, cursor: 'pointer' }}><Ic n="trash" size={11} /></button>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && !isVideo && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setLightbox(false)}>
          {/* Close button */}
          <button onClick={() => setLightbox(false)} style={{
            position: 'absolute', top: 12, right: 12, zIndex: 20002,
            background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, color: '#fff', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', backdropFilter: 'blur(8px)'
          }}>
            <Ic n="close" size={14} color="#fff" />
          </button>
          <div onClick={e => e.stopPropagation()}>
            <ZoomableImage src={asset.url} alt={asset.label} />
          </div>
        </div>
      )}
    </>
  )
}
