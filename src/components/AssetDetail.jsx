// @ts-check

import { useState, useRef, useCallback, useEffect } from 'react'
import Ic from './icons'
import { t } from '../i18n'
import useSafeMediaUrl from '../hooks/useSafeMediaUrl'

/** @typedef {import('../types/domain').Asset} Asset */
/** @typedef {Parameters<typeof Ic>[0]['n']} IconName */

/** @param {{ src: string, alt?: string }} props */
function ZoomableImage({ src, alt }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })
  const offsetRef = useRef({ x: 0, y: 0 })
  const containerRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  useEffect(() => { offsetRef.current = offset }, [offset])

  /** @param {number} s */
  const clampScale = (s) => Math.min(Math.max(s, 0.2), 10)
  const resetZoom = () => { setScale(1); setOffset({ x: 0, y: 0 }) }
  const zoomIn = () => setScale(prev => clampScale(prev * 1.3))
  const zoomOut = () => setScale(prev => clampScale(prev / 1.3))

  const handleWheel = useCallback(/** @param {React.WheelEvent<HTMLDivElement>} e */ (e) => {
    e.preventDefault()
    e.stopPropagation()
    setScale(prev => clampScale(prev * (e.deltaY > 0 ? 0.9 : 1.1)))
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    /** @param {MouseEvent} e */
    const onMouseDown = (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      dragging.current = true
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY }
      offsetStart.current = { ...offsetRef.current }
    }
    /** @param {MouseEvent} e */
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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20001,
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
        background: 'var(--overlay-dark)', backdropFilter: 'blur(8px)', borderRadius: 8,
        border: '1px solid var(--border-white-subtle)', userSelect: 'none'
      }}>
        <button onClick={zoomOut} style={zoomBtnStyle} title="Zoom out"><Ic n="minus" size={14} color="var(--text-white)" sw={2} /></button>
        <span style={{ color: 'var(--text-white)', fontSize: 11, minWidth: 44, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          {Math.round(scale * 100)}%
        </span>
        <button onClick={zoomIn} style={zoomBtnStyle} title="Zoom in"><Ic n="plus" size={14} color="var(--text-white)" sw={2} /></button>
        <div style={{ width: 1, height: 14, background: 'var(--border-white-subtle)', margin: '0 4px' }} />
        <button onClick={resetZoom} style={{ ...zoomBtnStyle, fontSize: 10, padding: '2px 6px', width: 'auto' }} title="Reset">1:1</button>
      </div>

      <div ref={containerRef} onWheel={handleWheel} onDoubleClick={resetZoom}
        style={{
          flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in'
        }}>
        <img src={src} alt={alt} draggable={false} style={{
          maxWidth: scale === 1 ? '90vw' : 'none',
          maxHeight: scale === 1 ? '85vh' : 'none',
          objectFit: 'contain',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: dragging.current ? 'none' : 'transform 0.15s ease-out',
          borderRadius: 'var(--radius-md)',
          userSelect: 'none',
          WebkitUserDrag: 'none'
        }} />
      </div>
    </div>
  )
}

/** @type {React.CSSProperties} */
const zoomBtnStyle = {
  background: 'transparent', border: 'none', color: 'var(--text-white)', cursor: 'pointer',
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 4, padding: 0
}

/** @param {{ label: string, value: React.ReactNode }} props */
function DetailRow({ label, value }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--text-muted)', flex: '0 0 74px', fontSize: 'var(--font-size-meta)', fontWeight: 500, letterSpacing: '0.2px' }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-word', fontSize: 11 }}>{value}</span>
    </div>
  )
}

/** @param {{ asset: Asset }} props */
function LinkedAssetPreview({ asset }) {
  const { src } = useSafeMediaUrl(asset?.url, asset?.type)
  if (!src) return null
  return asset.type === 'video' ? (
    <video src={src} muted playsInline preload="metadata" style={{ width: '100%', aspectRatio: 1, objectFit: 'cover', borderRadius: 4, display: 'block', background: 'var(--bg-primary)' }} />
  ) : (
    <img src={src} alt={asset.label} style={{ width: '100%', aspectRatio: 1, objectFit: 'cover', borderRadius: 4, display: 'block', background: 'var(--bg-primary)' }} />
  )
}

/** @param {{ label: string, ids?: string[], assets?: Asset[], onSelectAsset?: (id: string) => void, lang: string }} props */
function AssetLinksRow({ label, ids = [], assets = [], onSelectAsset, lang }) {
  const [hoveredId, setHoveredId] = useState(/** @type {string | null} */ (null))
  const refs = ids.map(id => {
    const asset = assets.find(item => item.id === id)
    return { id, asset, label: assetNameById(assets, id, lang) }
  }).filter(ref => ref.id)
  const hoveredAsset = hoveredId ? assets.find(item => item.id === hoveredId) : null
  if (refs.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--text-muted)', flex: '0 0 74px' }}>{label}</span>
      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0, position: 'relative' }}>
        {refs.map(ref => ref.asset ? (
          <button
            key={ref.id}
            onClick={() => onSelectAsset?.(ref.id)}
            onMouseEnter={() => setHoveredId(ref.id)}
            onMouseLeave={() => setHoveredId(null)}
            onFocus={() => setHoveredId(ref.id)}
            onBlur={() => setHoveredId(null)}
            style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--accent)',
            fontSize: 10,
            padding: '2px 6px',
            maxWidth: 170,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: 'pointer'
          }} title={ref.label}>
            {ref.label}
          </button>
        ) : (
          <span key={ref.id} style={{ color: 'var(--text-muted)', fontSize: 10, padding: '2px 0', wordBreak: 'break-all' }}>
            {ref.label}
          </span>
        ))}
        {hoveredAsset?.url && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 30,
            marginTop: 6,
            width: 132,
            padding: 6,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-md)',
            pointerEvents: 'none'
          }}>
            <LinkedAssetPreview asset={hoveredAsset} />
            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hoveredAsset.label}
            </div>
          </div>
        )}
      </span>
    </div>
  )
}

/** @param {{ icon: IconName, label: string, onClick?: () => void, danger?: boolean, disabled?: boolean }} props */
function ActionButton({ icon, label, onClick, danger = false, disabled = false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '6px 8px',
      background: danger ? 'var(--danger-soft)' : 'var(--bg-surface)',
      border: `1px solid ${danger ? 'var(--danger-border)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-sm)',
      color: danger ? 'var(--danger)' : 'var(--text-secondary)',
      fontSize: 11,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      whiteSpace: 'nowrap'
    }}>
      <Ic n={icon} size={11} />
      {label}
    </button>
  )
}

/** @param {Asset[]} assets @param {string} id @param {string} lang */
function assetNameById(assets, id, lang) {
  if (!id) return ''
  const asset = assets?.find(item => item.id === id)
  if (!asset?.label) return `${t('deletedSource', lang)} (${id})`
  return asset.label
}

/**
 * @param {{
 *   asset: Asset,
 *   allAssets?: Asset[],
 *   onClose: () => void,
 *   onDelete: () => void,
 *   onAction?: (action: string, asset: Asset) => void | Promise<void>,
 *   onSelectAsset?: (id: string) => void,
 *   lang: string,
 *   videoEnabled?: boolean,
 *   referenceEnabled?: boolean
 * }} props
 */
export default function AssetDetail({ asset, allAssets = [], onClose, onDelete, onAction, onSelectAsset, lang, videoEnabled = false, referenceEnabled = false }) {
  const [lightbox, setLightbox] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  const isVideo = asset?.type === 'video'
  const { src: previewUrl, loading: previewLoading } = useSafeMediaUrl(asset?.url, asset?.type)
  const generation = asset?.generation || {}
  const prompt = generation.prompt || asset?.prompt || ''
  const negativePrompt = generation.negativePrompt || asset?.negativePrompt || ''
  const parentAssetIds = generation.parentAssetId ? [generation.parentAssetId] : []
  const sourceAssetIds = generation.sourceAssetIds || []
  const promptReferenceAssetIds = generation.promptReferenceAssetIds || []
  const createdFromKey = generation.createdFrom ? `createdFrom_${generation.createdFrom}` : ''
  const createdFromText = createdFromKey ? t(createdFromKey, lang) : ''
  const createdFromValue = createdFromText && createdFromText !== createdFromKey ? createdFromText : generation.createdFrom || ''

  useEffect(() => {
    setLightbox(false)
    setMediaError(false)
  }, [asset?.id, asset?.url, previewUrl])

  useEffect(() => {
    if (!lightbox) return
    /** @param {KeyboardEvent} e */
    const handler = (e) => { if (e.key === 'Escape') setLightbox(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox])

  const handleSave = async () => {
    if (!asset?.url || saving) return
    setSaving(true)
    try {
      await window.electronAPI?.saveAssetWithDialog({ url: asset.url, label: asset.label, type: asset.type })
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div style={{ width: 300, borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{t('creativeRecord', lang)}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 'var(--radius-sm)' }}>
            <Ic n="close" size={12} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
          {asset.url && (
            <div onClick={() => { if (!isVideo && !mediaError && previewUrl) setLightbox(true) }} style={{
              borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 14,
              cursor: isVideo || mediaError ? 'default' : 'zoom-in', position: 'relative',
              border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)',
              minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {mediaError || (!previewLoading && !previewUrl) ? (
                <div style={{ padding: 16, fontSize: 11, color: 'var(--danger)', textAlign: 'center' }}>
                  {t('previewFailed', lang)}
                </div>
              ) : previewLoading ? (
                <div style={{ padding: 16, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>...</div>
              ) : isVideo ? (
                <video src={previewUrl} controls style={{ width: '100%', display: 'block', maxHeight: 240 }} onError={() => setMediaError(true)} />
              ) : (
                <>
                  <img src={previewUrl} alt={asset.label} style={{ width: '100%', display: 'block' }} onError={() => setMediaError(true)} />
                  <div style={{
                    position: 'absolute', bottom: 8, right: 8,
                    background: 'var(--overlay-dark)', backdropFilter: 'blur(8px)',
                    borderRadius: 'var(--radius-sm)', padding: '3px 8px',
                    display: 'flex', alignItems: 'center', gap: 4
                  }}>
                    <Ic n="eye" size={11} color="var(--text-white)" />
                    <span style={{ fontSize: 10, color: 'var(--text-white)' }}>{t('zoomIn', lang)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ fontSize: 11, lineHeight: 1.8, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <DetailRow label={t('typeLabel', lang)} value={asset.type === 'video' ? t('video', lang) : t('image', lang)} />
            <DetailRow label={t('labelLabel', lang)} value={asset.label} />
            <DetailRow label={t('generationModeLabel', lang)} value={generation.mode} />
            <DetailRow label={t('providerLabel', lang)} value={generation.providerId} />
            <DetailRow label={t('modelLabel', lang)} value={generation.model || asset.model} />
            <DetailRow label={t('ratioLabel', lang)} value={generation.ratio || asset.ratio} />
            <DetailRow label={t('resolutionLabel', lang)} value={generation.resolution || asset.resolution} />
            <DetailRow label={t('durationLabel', lang)} value={generation.duration ? `${generation.duration}s` : ''} />
            <DetailRow label={t('createdFromLabel', lang)} value={createdFromValue} />
            <AssetLinksRow label={t('parentAssetLabel', lang)} ids={parentAssetIds} assets={allAssets} onSelectAsset={onSelectAsset} lang={lang} />
            <AssetLinksRow label={t('sourceAssetsLabel', lang)} ids={sourceAssetIds} assets={allAssets} onSelectAsset={onSelectAsset} lang={lang} />
            <AssetLinksRow label={t('promptReferenceAssetsLabel', lang)} ids={promptReferenceAssetIds} assets={allAssets} onSelectAsset={onSelectAsset} lang={lang} />
            {asset.style && <DetailRow label={t('style', lang)} value={asset.style} />}
            <DetailRow label={t('timeLabel', lang)} value={asset.createdAt ? new Date(asset.createdAt).toLocaleString() : ''} />
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Prompt</div>
            <div style={{ background: 'var(--bg-primary)', padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)', maxHeight: 160, overflow: 'auto', wordBreak: 'break-all', userSelect: 'text', WebkitUserSelect: 'text' }}>
              {prompt || t('noneValue', lang)}
            </div>
          </div>

          {negativePrompt && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{t('negativePromptLabel', lang)}</div>
              <div style={{ background: 'var(--bg-primary)', padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)', maxHeight: 90, overflow: 'auto', wordBreak: 'break-all', userSelect: 'text', WebkitUserSelect: 'text' }}>
                {negativePrompt}
              </div>
            </div>
          )}

          {generation.taskId && (
            <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
              {t('taskIdLabel', lang)}: {generation.taskId}
            </div>
          )}
        </div>

        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button onClick={handleSave} disabled={saving} style={{ gridColumn: 'span 2', padding: '6px 0', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-sm)', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Ic n="download" size={11} /> {saving ? '...' : t('saveToLocal', lang)}
          </button>
          <ActionButton icon="star" label={asset.isMaterial ? t('unmarkMaterial', lang) : t('markMaterial', lang)} onClick={() => onAction?.('toggleMaterial', asset)} />
          {referenceEnabled && <ActionButton icon="link" label={t('useAsReference', lang)} onClick={() => onAction?.('useAsReference', asset)} disabled={!asset.url} />}
          <ActionButton icon="pencil" label={t('usePrompt', lang)} onClick={() => onAction?.('usePrompt', asset)} disabled={!prompt} />
          <ActionButton icon="copy" label={t('copyPrompt', lang)} onClick={() => onAction?.('copyPrompt', asset)} />
          {!isVideo && <ActionButton icon="refresh" label={t('regenerate', lang)} onClick={() => onAction?.('regenerate', asset)} />}
          {!isVideo && <ActionButton icon="sparkle" label={t('variation', lang)} onClick={() => onAction?.('variation', asset)} />}
          {!isVideo && <ActionButton icon="image" label={t('restyle', lang)} onClick={() => onAction?.('restyle', asset)} />}
          {!isVideo && <ActionButton icon="film" label={t('toVideo', lang)} onClick={() => onAction?.('toVideo', asset)} disabled={!videoEnabled} />}
          <ActionButton icon="trash" label={t('delete', lang)} onClick={onDelete} danger />
        </div>
      </div>

      {lightbox && !isVideo && previewUrl && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 20000, background: 'var(--overlay-dark)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setLightbox(false)}>
          <button onClick={() => setLightbox(false)} style={{
            position: 'absolute', top: 12, right: 12, zIndex: 20002,
            background: 'var(--overlay-dark)', border: '1px solid var(--border-white-subtle)',
            borderRadius: 6, color: 'var(--text-white)', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', backdropFilter: 'blur(8px)'
          }}>
            <Ic n="close" size={14} color="var(--text-white)" />
          </button>
          <div onClick={e => e.stopPropagation()}>
            <ZoomableImage src={previewUrl} alt={asset.label} />
          </div>
        </div>
      )}
    </>
  )
}
