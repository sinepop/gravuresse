import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import AssetCard from './AssetCard'
import AssetDetail from './AssetDetail'
import Ic from './icons'
import { t } from '../i18n'

const TOOL_GROUPS = [
  { tools: [
    { id: 'select', labelKey: 'canvasToolSelect', key: 'V' },
    { id: 'move', labelKey: 'canvasToolMove', key: 'H' },
  ]},
  { tools: [
    { id: 'pencil', labelKey: 'canvasToolPencil', key: 'P' },
    { id: 'rect', labelKey: 'canvasToolRect', key: 'R' },
    { id: 'circle', labelKey: 'canvasToolCircle', key: 'O' },
    { id: 'line', labelKey: 'canvasToolLine', key: 'L' },
    { id: 'text', labelKey: 'canvasToolText', key: 'T' },
  ]},
]

const COLORS = ['#E8A849', '#E8706A', '#5ABF8A', '#6B9FF0', '#B07AFF', '#E8E8EC', '#1A1A1E']
const OPENNANA_PROMPT_GALLERY_URL = 'https://opennana.com/awesome-prompt-gallery'

const filterBtnStyle = (active) => ({
  background: active ? 'var(--accent-soft)' : 'transparent',
  border: `1px solid ${active ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
  borderRadius: 'var(--radius-sm)', padding: '4px 10px',
  color: active ? 'var(--accent)' : 'var(--text-secondary)',
  fontSize: 10, cursor: 'pointer', fontWeight: active ? 500 : 400,
  transition: 'all 0.15s'
})

function openExternal(url) {
  if (!url) return
  window.electronAPI?.openExternal?.(url).catch?.(() => {})
}

const MIN_SCALE = 0.1
const MAX_SCALE = 5

function InfiniteCanvas({ children, assets, activeTool, scale, setScale, offset, setOffset, lang }) {
  const [isPanning, setIsPanning] = useState(false)
  const containerRef = useRef(null)
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })
  const spacePressed = useRef(false)

  const clampScale = (s) => Math.min(Math.max(s, MIN_SCALE), MAX_SCALE)

  useEffect(() => { scaleRef.current = scale }, [scale])
  useEffect(() => { offsetRef.current = offset }, [offset])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 0.92 : 1.08
      const oldScale = scaleRef.current
      const newScale = clampScale(oldScale * factor)
      if (newScale === oldScale) return
      const r = newScale / oldScale
      const newOffX = mx - r * (mx - offsetRef.current.x)
      const newOffY = my - r * (my - offsetRef.current.y)
      scaleRef.current = newScale
      offsetRef.current = { x: newOffX, y: newOffY }
      setScale(newScale)
      setOffset({ x: newOffX, y: newOffY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onMouseDown = (e) => {
      if (e.button !== 0) return
      const tag = e.target.tagName
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.target.closest('button') || e.target.closest('[data-asset-card]')) return
      if (activeTool !== 'move' && !spacePressed.current) return
      e.preventDefault()
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY }
      offsetStart.current = { ...offsetRef.current }
    }
    el.addEventListener('mousedown', onMouseDown)
    return () => el.removeEventListener('mousedown', onMouseDown)
  }, [activeTool])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space') spacePressed.current = true
    }
    const onKeyUp = (e) => {
      if (e.code === 'Space') spacePressed.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useEffect(() => {
    if (!isPanning) return
    const onMouseMove = (e) => {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      const newOff = { x: offsetStart.current.x + dx, y: offsetStart.current.y + dy }
      offsetRef.current = newOff
      setOffset(newOff)
    }
    const onMouseUp = () => setIsPanning(false)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isPanning])

  const zoomIn = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.width / 2, cy = rect.height / 2
    const oldScale = scaleRef.current
    const newScale = clampScale(oldScale * 1.25)
    const r = newScale / oldScale
    scaleRef.current = newScale
    const newOff = { x: cx - r * (cx - offsetRef.current.x), y: cy - r * (cy - offsetRef.current.y) }
    offsetRef.current = newOff
    setScale(newScale)
    setOffset(newOff)
  }, [])

  const zoomOut = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.width / 2, cy = rect.height / 2
    const oldScale = scaleRef.current
    const newScale = clampScale(oldScale / 1.25)
    const r = newScale / oldScale
    scaleRef.current = newScale
    const newOff = { x: cx - r * (cx - offsetRef.current.x), y: cy - r * (cy - offsetRef.current.y) }
    offsetRef.current = newOff
    setScale(newScale)
    setOffset(newOff)
  }, [])

  const resetZoom = useCallback(() => {
    scaleRef.current = 1
    offsetRef.current = { x: 0, y: 0 }
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const fitToView = useCallback(() => {
    scaleRef.current = 1
    offsetRef.current = { x: 0, y: 0 }
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  return (
    <div ref={containerRef} className="canvas-surface" style={{
      flex: 1, overflow: 'hidden', position: 'relative',
      cursor: isPanning ? 'grabbing' : activeTool === 'move' ? 'grab' : 'default',
      backgroundSize: `${20 * scale}px ${20 * scale}px`,
      backgroundPosition: `${offset.x}px ${offset.y}px`
    }}>
      <div style={{
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        transformOrigin: '0 0',
        willChange: 'transform'
      }}>
        {children}
      </div>

      <div data-toolbar="true" className="glass-floating" onMouseDown={e => e.stopPropagation()} style={{
        position: 'absolute', bottom: 20, right: 20, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 1,
        borderRadius: '99px', padding: '6px 12px', userSelect: 'none'
      }}>
        <button className="canvas-zoom-button" onClick={zoomOut} style={zoomCtrlBtn} title={t('zoomOut', lang)}>
          <Ic n="minus" size={14} sw={2} />
        </button>
        <span style={{
          fontSize: 10, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'center',
          fontFamily: 'var(--font-mono)', cursor: 'pointer', padding: '2px 4px', borderRadius: 3
        }} onClick={resetZoom} title={t('resetZoom', lang)}>
          {Math.round(scale * 100)}%
        </span>
        <button className="canvas-zoom-button" onClick={zoomIn} style={zoomCtrlBtn} title={t('zoomIn', lang)}>
          <Ic n="plus" size={14} sw={2} />
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 2px' }} />
        <button className="canvas-zoom-button" onClick={fitToView} style={{ ...zoomCtrlBtn, width: 'auto', padding: '2px 6px', fontSize: 10 }} title={t('fitToView', lang)}>
          {t('fit', lang)}
        </button>
      </div>

      {!isPanning && scale === 1 && offset.x === 0 && offset.y === 0 && assets?.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 14, left: 14, zIndex: 10,
          fontSize: 10, color: 'var(--text-ghost)', display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: '99px',
          opacity: 0.8
        }}>
          <Ic n="move4" size={12} sw={1.5} />
          {t('canvasShortcutHint', lang)}
        </div>
      )}
    </div>
  )
}

const zoomCtrlBtn = {
  border: 'none', color: 'var(--text-secondary)',
  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 0,
  transition: 'background 0.2s ease, color 0.2s ease'
}

function DrawingOverlay({ tool, color, width: strokeWidth, scale, canvasRef, lang }) {
  const drawing = useRef(false)
  const start = useRef({ x: 0, y: 0 })
  const snapshot = useRef(null)
  const [spacePan, setSpacePan] = useState(false)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const parent = c.parentElement
    const resize = () => {
      c.width = parent.clientWidth
      c.height = parent.clientHeight
    }
    resize()
    const obs = new ResizeObserver(resize)
    obs.observe(parent)
    return () => obs.disconnect()
  }, [canvasRef])

  useEffect(() => {
    const onKeyDown = (e) => { if (e.code === 'Space') setSpacePan(true) }
    const onKeyUp = (e) => { if (e.code === 'Space') setSpacePan(false) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const getPos = (e) => {
    const c = canvasRef.current
    const rect = c.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale
    }
  }

  const onMouseDown = (e) => {
    if (tool === 'select' || tool === 'move') return
    if (spacePan) return
    if (e.button !== 0) return
    drawing.current = true
    const pos = getPos(e)
    start.current = pos
    const ctx = canvasRef.current.getContext('2d')
    snapshot.current = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)

    if (tool === 'pencil') {
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      ctx.strokeStyle = color
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }
    if (tool === 'text') {
      drawing.current = false
      const text = prompt(t('canvasTextPrompt', lang))
      if (text) {
        ctx.font = `${strokeWidth * 4 + 12}px sans-serif`
        ctx.fillStyle = color
        ctx.fillText(text, pos.x, pos.y)
      }
    }
  }

  const onMouseMove = (e) => {
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)

    if (tool === 'pencil') {
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    } else if (tool === 'rect' || tool === 'circle' || tool === 'line') {
      ctx.putImageData(snapshot.current, 0, 0)
      ctx.strokeStyle = color
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'round'
      if (tool === 'rect') {
        const w = pos.x - start.current.x
        const h = pos.y - start.current.y
        ctx.strokeRect(start.current.x, start.current.y, w, h)
      } else if (tool === 'circle') {
        const rx = Math.abs(pos.x - start.current.x) / 2
        const ry = Math.abs(pos.y - start.current.y) / 2
        const cx = start.current.x + (pos.x - start.current.x) / 2
        const cy = start.current.y + (pos.y - start.current.y) / 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (tool === 'line') {
        ctx.beginPath()
        ctx.moveTo(start.current.x, start.current.y)
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
      }
    }
  }

  const onMouseUp = () => { drawing.current = false }

  const isDrawingTool = tool !== 'select' && tool !== 'move'

  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0, zIndex: 5,
      pointerEvents: isDrawingTool && !spacePan ? 'auto' : 'none',
      cursor: isDrawingTool && !spacePan ? 'crosshair' : 'default'
    }} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} />
  )
}

function ToolIcon({ id, size = 16 }) {
  return <Ic n={id === 'line' ? 'minus' : id} size={size} sw={1.6} />
}

function EditBar({ activeTool, setActiveTool, drawColor, setDrawColor, drawWidth, setDrawWidth, onClearDrawings, lang }) {
  const [hoveredTool, setHoveredTool] = useState(null)
  const isDrawingTool = !['select', 'move'].includes(activeTool)
  const toolByKey = useRef(new Map(TOOL_GROUPS.flatMap(group => group.tools.map(tool => [tool.key.toLowerCase(), tool.id]))))

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      const toolId = toolByKey.current.get(e.key.toLowerCase())
      if (!toolId) return
      e.preventDefault()
      setActiveTool(toolId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setActiveTool])

  return (
    <div data-toolbar="true" className="glass-floating" onMouseDown={e => e.stopPropagation()} style={{
      position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
      display: 'flex', alignItems: 'center', gap: 2,
      borderRadius: '99px', padding: '6px 12px',
      userSelect: 'none'
    }}>
      {TOOL_GROUPS.map((group, gi) => (
        <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {gi > 0 && <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 3px' }} />}
          {group.tools.map(tool => {
            const isActive = activeTool === tool.id
            const isHovered = hoveredTool === tool.id
            const label = t(tool.labelKey, lang)
            return (
              <div key={tool.id} style={{ position: 'relative' }}>
                <button
                  onClick={() => setActiveTool(tool.id)}
                  onMouseEnter={() => setHoveredTool(tool.id)}
                  onMouseLeave={() => setHoveredTool(null)}
                  title={`${label} (${tool.key})`}
                  style={{
                    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? 'var(--accent-soft)' : isHovered ? 'var(--bg-hover)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--border-accent)' : 'transparent'}`,
                    borderRadius: 'var(--radius-sm)',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.1s'
                  }}>
                  <ToolIcon id={tool.id} size={15} />
                </button>
                {isHovered && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                    marginBottom: 6, padding: '4px 8px', background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                    fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap',
                    boxShadow: 'var(--shadow-md)', pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', gap: 6, zIndex: 30
                  }}>
                    {label}
                    <span style={{
                      fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                      background: 'var(--bg-surface)', padding: '1px 4px', borderRadius: 3
                    }}>{tool.key}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
      {isDrawingTool && (
        <>
          <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 3px' }} />
          {COLORS.map(c => (
            <button key={c} onClick={() => setDrawColor(c)} style={{
              width: 16, height: 16, borderRadius: '50%', background: c, border: 'none',
              cursor: 'pointer',
              outline: drawColor === c ? '2px solid var(--accent)' : '1px solid var(--border-default)',
              outlineOffset: drawColor === c ? 1 : 0,
              transform: drawColor === c ? 'scale(1.2)' : 'scale(1)',
              transition: 'all 0.12s', margin: '0 1px'
            }} />
          ))}
          <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 3px' }} />
          {[1, 2, 4].map(w => (
            <button key={w} onClick={() => setDrawWidth(w)} style={{
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: drawWidth === w ? 'var(--accent-soft)' : 'transparent',
              border: `1px solid ${drawWidth === w ? 'var(--border-accent)' : 'transparent'}`,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.12s'
            }}>
              <div style={{
                width: 12, borderRadius: w,
                height: Math.max(w, 2), background: drawWidth === w ? 'var(--accent)' : 'var(--text-secondary)'
              }} />
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 3px' }} />
          <button onClick={onClearDrawings} title={t('clearDrawings', lang)} style={{
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.12s'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            <Ic n="trash" size={15} />
          </button>
        </>
      )}
    </div>
  )
}

function GeneratingOverlay({ asset }) {
  if (!asset._generating) return null
  return (
    <div style={{
      position: 'absolute', inset: -2, borderRadius: 'var(--radius-md)',
      border: '2px solid var(--accent)',
      animation: 'genPulse 1.5s ease-in-out infinite',
      pointerEvents: 'none', zIndex: 2,
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg, transparent 0%, var(--accent-glow) 25%, var(--accent-soft) 50%, var(--accent-glow) 75%, transparent 100%)',
        backgroundSize: '300% 100%',
        animation: 'shimmerGlow 2s ease-in-out infinite',
        borderRadius: 'var(--radius-md)'
      }} />
    </div>
  )
}

function MiniMap({ assets, selectedId, setSelectedId, scale, offset, setOffset, viewportRef, lang }) {
  if (!assets?.length) return null
  const cardW = 240
  const cardH = 260
  const mapW = 168
  const mapH = 112
  const points = assets.map((asset, i) => {
    const col = i % 4
    const row = Math.floor(i / 4)
    return {
      asset,
      x: asset.x !== undefined ? asset.x : 30 + col * 280,
      y: asset.y !== undefined ? asset.y : 30 + row * 280
    }
  })
  const minX = Math.min(...points.map(p => p.x)) - 80
  const minY = Math.min(...points.map(p => p.y)) - 80
  const maxX = Math.max(...points.map(p => p.x + cardW)) + 80
  const maxY = Math.max(...points.map(p => p.y + cardH)) + 80
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const mapScale = Math.min(mapW / spanX, mapH / spanY)
  const contentW = spanX * mapScale
  const contentH = spanY * mapScale
  const padX = (mapW - contentW) / 2
  const padY = (mapH - contentH) / 2
  const toMapX = (x) => padX + (x - minX) * mapScale
  const toMapY = (y) => padY + (y - minY) * mapScale
  const viewport = viewportRef.current?.getBoundingClientRect()
  const viewX = viewport ? toMapX(-offset.x / scale) : 0
  const viewY = viewport ? toMapY(-offset.y / scale) : 0
  const viewW = viewport ? Math.min(mapW, (viewport.width / scale) * mapScale) : 0
  const viewH = viewport ? Math.min(mapH, (viewport.height / scale) * mapScale) : 0

  const navigate = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const canvasX = minX + ((mx - padX) / mapScale)
    const canvasY = minY + ((my - padY) / mapScale)
    const viewportRect = viewportRef.current?.getBoundingClientRect()
    if (!viewportRect) return
    setOffset({
      x: viewportRect.width / 2 - canvasX * scale,
      y: viewportRect.height / 2 - canvasY * scale
    })
  }

  return (
    <div data-toolbar="true" className="glass-floating" title={t('minimap', lang)} onMouseDown={e => e.stopPropagation()} onClick={navigate} style={{
      position: 'absolute', top: 14, right: 14, zIndex: 18,
      width: mapW, height: mapH, borderRadius: 'var(--radius-md)',
      padding: 0, overflow: 'hidden', cursor: 'crosshair'
    }}>
      <svg width={mapW} height={mapH} style={{ display: 'block' }}>
        <rect x="0" y="0" width={mapW} height={mapH} fill="var(--bg-surface)" opacity="0.72" />
        {points.map(({ asset, x, y }) => (
          <rect
            key={asset.id}
            x={toMapX(x)}
            y={toMapY(y)}
            width={Math.max(5, cardW * mapScale)}
            height={Math.max(5, cardH * mapScale)}
            rx="2"
            fill={asset.id === selectedId ? 'var(--accent)' : asset.isMaterial ? 'var(--accent-soft)' : 'var(--text-muted)'}
            stroke={asset.id === selectedId ? 'var(--accent)' : 'var(--border-subtle)'}
            opacity={asset.id === selectedId ? 0.95 : 0.65}
            onClick={(e) => { e.stopPropagation(); setSelectedId(asset.id) }}
          />
        ))}
        {viewport && (
          <rect
            x={Math.max(0, Math.min(mapW, viewX))}
            y={Math.max(0, Math.min(mapH, viewY))}
            width={Math.max(8, viewW)}
            height={Math.max(8, viewH)}
            fill="transparent"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
        )}
      </svg>
    </div>
  )
}

function assetCanvasPosition(asset, index) {
  const col = index % 4
  const row = Math.floor(index / 4)
  return {
    x: asset.x !== undefined ? asset.x : 30 + col * 280,
    y: asset.y !== undefined ? asset.y : 30 + row * 280
  }
}

function LineageLines({ assets }) {
  if (!assets?.length) return null
  const assetById = new Map(assets.map((asset, index) => [asset.id, { asset, index, ...assetCanvasPosition(asset, index) }]))
  const lines = []
  assets.forEach((asset, index) => {
    const target = assetById.get(asset.id)
    const refs = [
      asset.generation?.parentAssetId,
      ...(asset.generation?.sourceAssetIds || []),
      ...(asset.generation?.promptReferenceAssetIds || [])
    ].filter(Boolean)
    Array.from(new Set(refs)).forEach(refId => {
      const source = assetById.get(refId)
      if (!source || source.asset.id === asset.id) return
      lines.push({ id: `${refId}-${asset.id}-${index}`, source, target })
    })
  })
  if (lines.length === 0) return null
  return (
    <svg width="2000" height="1500" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'visible' }}>
      <defs>
        <marker id="lineage-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)" opacity="0.7" />
        </marker>
      </defs>
      {lines.map(line => {
        const x1 = line.source.x + 120
        const y1 = line.source.y + 130
        const x2 = line.target.x + 120
        const y2 = line.target.y + 130
        const midX = (x1 + x2) / 2
        return (
          <path
            key={line.id}
            d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeOpacity="0.42"
            strokeDasharray="6 5"
            markerEnd="url(#lineage-arrow)"
          />
        )
      })}
    </svg>
  )
}

function makeAgentActions(asset, { referenceEnabled, videoEnabled, lang }) {
  if (!asset) return []
  const prompt = asset.generation?.prompt || asset.prompt || ''
  const isImage = asset.type === 'image'
  const items = [
    { action: 'toggleMaterial', label: asset.isMaterial ? t('unmarkMaterial', lang) : t('markMaterial', lang), icon: 'star' }
  ]
  if (asset.url && referenceEnabled) items.push({ action: 'useAsReference', label: t('useAsReference', lang), icon: 'link' })
  if (prompt) items.push({ action: 'usePrompt', label: t('usePrompt', lang), icon: 'pencil' })
  if (isImage) {
    items.push({ action: 'variation', label: t('variation', lang), icon: 'sparkle' })
    items.push({ action: 'restyle', label: t('restyle', lang), icon: 'image' })
    items.push({ action: 'regenerate', label: t('regenerate', lang), icon: 'refresh' })
    if (videoEnabled) items.push({ action: 'toVideo', label: t('toVideo', lang), icon: 'film' })
  }
  return items.map((item, index) => ({ ...item, id: `${asset.id}-${item.action}-${index}`, assetId: asset.id }))
}

function formatAgentPlan(asset, queue, lang) {
  if (!asset || queue.length === 0) return ''
  const title = t('agentPlanTitle', lang)
  const assetLabel = asset.label || asset.name || asset.id
  const lines = [
    title,
    `${t('agentPlanAsset', lang)}: ${assetLabel} (${asset.type || 'asset'}, ${asset.id})`,
    ''
  ]
  queue.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.label} [${item.action}]`)
  })
  return lines.join('\n')
}

function AgentQueue({ selectedAsset, onAction, referenceEnabled, videoEnabled, lang }) {
  const [open, setOpen] = useState(false)
  const [queue, setQueue] = useState([])
  const [running, setRunning] = useState(false)
  const [copiedPlan, setCopiedPlan] = useState(false)
  const suggested = useMemo(
    () => makeAgentActions(selectedAsset, { referenceEnabled, videoEnabled, lang }),
    [selectedAsset, referenceEnabled, videoEnabled, lang]
  )

  useEffect(() => {
    setQueue(prev => prev.filter(item => item.assetId === selectedAsset?.id))
    setCopiedPlan(false)
  }, [selectedAsset?.id])

  const addSuggested = () => {
    if (!selectedAsset) return
    setQueue(prev => {
      const existing = new Set(prev.map(item => item.id))
      return [...prev, ...suggested.filter(item => !existing.has(item.id))]
    })
    setOpen(true)
  }

  const removeItem = (id) => setQueue(prev => prev.filter(item => item.id !== id))
  const clear = () => setQueue([])
  const copyPlan = async () => {
    const plan = formatAgentPlan(selectedAsset, queue, lang)
    if (!plan) return
    try {
      await navigator.clipboard.writeText(plan)
      setCopiedPlan(true)
      window.setTimeout(() => setCopiedPlan(false), 1200)
    } catch {
      setCopiedPlan(false)
    }
  }
  const runItem = async (item) => {
    if (!selectedAsset || item.assetId !== selectedAsset.id) return
    await onAction?.(item.action, selectedAsset)
    removeItem(item.id)
  }
  const runAll = async () => {
    if (running) return
    setRunning(true)
    try {
      for (const item of [...queue]) {
        await runItem(item)
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div data-toolbar="true" className="glass-floating" onMouseDown={e => e.stopPropagation()} style={{
      position: 'absolute', top: 14, left: 14, zIndex: 18,
      width: open ? 260 : 'auto', borderRadius: 'var(--radius-md)',
      padding: open ? 8 : 6
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => setOpen(prev => !prev)} title={t('agentQueue', lang)} style={agentBtnStyle}>
          <Ic n="zap" size={13} /> {t('agentQueue', lang)}
        </button>
        {open && (
          <button onClick={addSuggested} disabled={!selectedAsset || suggested.length === 0} style={{ ...agentBtnStyle, opacity: selectedAsset && suggested.length > 0 ? 1 : 0.45 }}>
            <Ic n="plus" size={12} /> {t('proposeActions', lang)}
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          {queue.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 4px' }}>
              {selectedAsset ? t('noAgentActions', lang) : t('selectAssetFirst', lang)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {queue.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)', padding: '5px 6px'
                }}>
                  <Ic n={item.icon} size={11} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                  <button onClick={() => runItem(item)} disabled={running} title={t('executeAction', lang)} style={agentIconBtnStyle}>
                    <Ic n="check" size={11} />
                  </button>
                  <button onClick={() => removeItem(item.id)} disabled={running} title={t('delete', lang)} style={agentIconBtnStyle}>
                    <Ic n="close" size={11} />
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button onClick={copyPlan} disabled={running || queue.length === 0} style={{ ...agentBtnStyle, flex: 1 }}>
                  <Ic n={copiedPlan ? 'check' : 'copy'} size={11} /> {copiedPlan ? t('copied', lang) : t('copyAgentPlan', lang)}
                </button>
                <button onClick={runAll} disabled={running} style={{ ...agentBtnStyle, flex: 1 }}>
                  <Ic n="zap" size={11} /> {t('runAllActions', lang)}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button onClick={clear} disabled={running} style={{ ...agentBtnStyle, flex: 1 }}>
                  <Ic n="trash" size={11} /> {t('clearQueue', lang)}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const agentBtnStyle = {
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  padding: '5px 8px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5
}

const agentIconBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: 'var(--radius-sm)'
}

export default function CanvasPanel({ canvas, lang, onContextMenu, onAssetAction, generationMode = 'image', videoEnabled = false, referenceEnabled = false }) {
  const { selectedAsset, selectedId, setSelectedId, viewMode, setViewMode } = canvas
  const modeAssets = (canvas.assets || []).filter(asset => asset.type === generationMode)
  const materialCount = modeAssets.filter(asset => asset.isMaterial === true).length
  const [showMaterialsOnly, setShowMaterialsOnly] = useState(false)
  const assets = showMaterialsOnly ? modeAssets.filter(asset => asset.isMaterial === true) : modeAssets
  const visibleSelectedAsset = assets.some(asset => asset.id === selectedId) ? selectedAsset : null
  const [activeTool, setActiveTool] = useState('select')
  const [drawColor, setDrawColor] = useState('#E8A849')
  const [drawWidth, setDrawWidth] = useState(2)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [draggedAsset, setDraggedAsset] = useState(null)
  const [showLineage, setShowLineage] = useState(false)

  const scaleRef = useRef(1)
  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  const drawingCanvasRef = useRef(null)
  const dragCleanupRef = useRef(null)
  const viewportRef = useRef(null)

  useEffect(() => {
    if (selectedId && !assets.some(asset => asset.id === selectedId)) {
      setSelectedId(null)
    }
  }, [assets, selectedId, setSelectedId])

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) canvas.redo()
      else canvas.undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canvas.undo, canvas.redo])

  // Unmount cleanup for mouse drag listeners
  useEffect(() => {
    return () => {
      if (dragCleanupRef.current) {
        dragCleanupRef.current()
      }
    }
  }, [])

  const handleClearDrawings = () => {
    const c = drawingCanvasRef.current
    if (c) {
      const ctx = c.getContext('2d')
      ctx.clearRect(0, 0, c.width, c.height)
    }
  }

  // Assign coordinate fields (x and y) to assets if they are missing in Free Mode
  useEffect(() => {
    if (viewMode !== 'free') return
    const missingCoords = assets.filter(a => a.x === undefined || a.y === undefined)
    if (missingCoords.length === 0) return

    const patches = {}
    missingCoords.forEach(a => {
      const idx = assets.findIndex(item => item.id === a.id)
      if (idx !== -1) {
        const col = idx % 4
        const row = Math.floor(idx / 4)
        const x = 30 + col * 280
        const y = 30 + row * 280
        patches[a.id] = { x, y }
      }
    })
    canvas.updateAssets(patches)
  }, [viewMode, assets, canvas.updateAssets])

  const handleCardMouseDown = (e, asset, defaultX, defaultY) => {
    if (activeTool !== 'select') return
    const tag = e.target.tagName
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
    if (e.target.closest('button')) return

    e.preventDefault()
    setSelectedId(asset.id)

    const startX = asset.x !== undefined ? asset.x : defaultX
    const startY = asset.y !== undefined ? asset.y : defaultY
    const startMouseX = e.clientX
    const startMouseY = e.clientY

    setDraggedAsset({ id: asset.id, x: startX, y: startY })

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      dragCleanupRef.current = null
    }
    dragCleanupRef.current = cleanup

    const onMouseMove = (moveEvent) => {
      const currentScale = scaleRef.current
      const dx = (moveEvent.clientX - startMouseX) / currentScale
      const dy = (moveEvent.clientY - startMouseY) / currentScale
      setDraggedAsset({ id: asset.id, x: startX + dx, y: startY + dy })
    }

    const onMouseUp = (upEvent) => {
      cleanup()

      const currentScale = scaleRef.current
      const dx = (upEvent.clientX - startMouseX) / currentScale
      const dy = (upEvent.clientY - startMouseY) / currentScale
      const finalX = startX + dx
      const finalY = startY + dy

      setDraggedAsset(null)
      if (onAssetAction) {
        onAssetAction('moveAsset', { ...asset, x: finalX, y: finalY })
      } else {
        canvas.updateAsset(asset.id, { x: finalX, y: finalY }, { history: true })
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleSelectLinkedAsset = useCallback((id) => {
    const target = canvas.allAssets.find(asset => asset.id === id)
    if (!target) return
    if (target.type === generationMode) {
      setSelectedId(id)
      return
    }
    onAssetAction?.('selectAsset', target)
  }, [canvas.allAssets, generationMode, onAssetAction, setSelectedId])

  const emptyTitle = showMaterialsOnly && modeAssets.length > 0 ? t('noMaterialAssets', lang) : t('canvasEmpty', lang)

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px',
          background: 'transparent', zIndex: 10
        }}>
          <button onClick={() => setViewMode('grid')} style={filterBtnStyle(viewMode === 'grid')}>
            <Ic n="grid" size={12} /> {t('gridView', lang)}
          </button>
          <button onClick={() => setViewMode('free')} style={filterBtnStyle(viewMode === 'free')}>
            <Ic n="layoutGrid" size={12} />
            {t('freeView', lang)}
          </button>
          <button onClick={canvas.undo} disabled={!canvas.canUndo} title={t('undo', lang)} style={{ ...filterBtnStyle(false), opacity: canvas.canUndo ? 1 : 0.45, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Ic n="undo" size={12} />
          </button>
          <button onClick={canvas.redo} disabled={!canvas.canRedo} title={t('redo', lang)} style={{ ...filterBtnStyle(false), opacity: canvas.canRedo ? 1 : 0.45, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Ic n="redo" size={12} />
          </button>
          <button
            onClick={() => setShowMaterialsOnly(prev => !prev)}
            disabled={materialCount === 0 && !showMaterialsOnly}
            title={materialCount === 0 ? t('noMaterialAssets', lang) : t('materialsOnly', lang)}
            style={{ ...filterBtnStyle(showMaterialsOnly), opacity: materialCount === 0 && !showMaterialsOnly ? 0.45 : 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Ic n="star" size={12} />
            {t('materialsOnly', lang)}
          </button>
          <button
            onClick={() => setShowLineage(prev => !prev)}
            disabled={viewMode !== 'free'}
            title={t('lineageLines', lang)}
            style={{ ...filterBtnStyle(showLineage), opacity: viewMode === 'free' ? 1 : 0.45, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Ic n="link" size={12} />
            {t('lineageLines', lang)}
          </button>
          <button title={t('openNanaGallery', lang)} onClick={() => openExternal(OPENNANA_PROMPT_GALLERY_URL)} style={{ ...filterBtnStyle(false), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Ic n="sparkle" size={12} />
            {t('openNanaGallery', lang)}
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>{assets.length} {t('assetUnit', lang)}</span>
        </div>
        <div ref={viewportRef} className={assets.length === 0 ? 'canvas-surface' : undefined} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {assets.length === 0 ? (
            <div className="canvas-empty-state">
              <div className="canvas-empty-icon">
                <Ic n="layoutGrid" size={22} color="var(--text-muted)" />
              </div>
              <div>
                <div className="canvas-empty-title">
                  {emptyTitle}
                </div>
                <div className="canvas-empty-description">
                  {generationMode === 'video'
                    ? t('describeVideoLeft', lang)
                    : t('describeImageLeft', lang)}
                </div>
                <div className="canvas-empty-description" style={{ display: 'none' }}>
                  {t('describeCreateInChat', lang)}
                </div>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid mode: structured layout, no pan/zoom, scrollable */
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 14
              }}>
                {assets.map(a => (
                  <div key={a.id} data-asset-card="true" style={{ position: 'relative' }}>
                    <GeneratingOverlay asset={a} />
                    <AssetCard asset={a} selected={a.id === selectedId} onClick={setSelectedId}
                      onContextMenu={(e, asset) => onContextMenu?.(e, asset)} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Free mode: infinite canvas with free positioning */
            <>
              <InfiniteCanvas
                assets={assets}
                activeTool={activeTool}
                scale={scale}
                setScale={setScale}
                offset={offset}
                setOffset={setOffset}
                lang={lang}
              >
                <div style={{ position: 'relative', minWidth: 2000, minHeight: 1500 }}>
                  {showLineage && <LineageLines assets={assets} />}
                  {assets.map((a, i) => {
                    const col = i % 4
                    const row = Math.floor(i / 4)
                    const defaultX = 30 + col * 280
                    const defaultY = 30 + row * 280
                    
                    const isDragging = draggedAsset && draggedAsset.id === a.id
                    const x = isDragging ? draggedAsset.x : (a.x !== undefined ? a.x : defaultX)
                    const y = isDragging ? draggedAsset.y : (a.y !== undefined ? a.y : defaultY)

                    return (
                      <div
                        key={a.id}
                        data-asset-card="true"
                        style={{
                          position: 'absolute',
                          left: x,
                          top: y,
                          width: 240,
                          cursor: activeTool === 'select' ? 'move' : 'default',
                          userSelect: 'none'
                        }}
                        onMouseDown={(e) => handleCardMouseDown(e, a, defaultX, defaultY)}
                      >
                        <GeneratingOverlay asset={a} />
                        <AssetCard asset={a} selected={a.id === selectedId} onClick={setSelectedId}
                          onContextMenu={(e, asset) => onContextMenu?.(e, asset)} />
                      </div>
                    )
                  })}
                  <DrawingOverlay tool={activeTool} color={drawColor} width={drawWidth} scale={scale} canvasRef={drawingCanvasRef} lang={lang} />
                </div>
              </InfiniteCanvas>
            </>
          )}
          {viewMode === 'free' && <EditBar activeTool={activeTool} setActiveTool={setActiveTool} drawColor={drawColor} setDrawColor={setDrawColor} drawWidth={drawWidth} setDrawWidth={setDrawWidth} onClearDrawings={handleClearDrawings} lang={lang} />}
          {viewMode === 'free' && assets.length > 0 && (
            <MiniMap assets={assets} selectedId={selectedId} setSelectedId={setSelectedId} scale={scale} offset={offset} setOffset={setOffset} viewportRef={viewportRef} lang={lang} />
          )}
          <AgentQueue selectedAsset={visibleSelectedAsset} onAction={onAssetAction} referenceEnabled={referenceEnabled} videoEnabled={videoEnabled} lang={lang} />
        </div>
      </div>
      {visibleSelectedAsset && (
        <AssetDetail asset={visibleSelectedAsset} onClose={() => setSelectedId(null)}
          allAssets={canvas.allAssets}
          onDelete={() => onAssetAction?.('delete', visibleSelectedAsset)}
          onAction={onAssetAction}
          onSelectAsset={handleSelectLinkedAsset}
          lang={lang}
          videoEnabled={videoEnabled}
          referenceEnabled={referenceEnabled} />
      )}
    </div>
  )
}
