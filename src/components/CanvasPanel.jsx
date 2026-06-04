import { useState, useRef, useEffect, useCallback } from 'react'
import { MousePointer, Hand, Pencil, Square, Circle, Minus, Type } from 'lucide-react'
import AssetCard from './AssetCard'
import AssetDetail from './AssetDetail'
import Ic from './icons'

const TOOL_GROUPS = [
  { tools: [
    { id: 'select', label: '选择', key: 'V' },
    { id: 'move', label: '抓手', key: 'H' },
  ]},
  { tools: [
    { id: 'pencil', label: '铅笔', key: 'P' },
    { id: 'rect', label: '矩形', key: 'R' },
    { id: 'circle', label: '圆形', key: 'O' },
    { id: 'line', label: '直线', key: 'L' },
    { id: 'text', label: '文字', key: 'T' },
  ]},
]

const COLORS = ['#E8A849', '#E8706A', '#5ABF8A', '#6B9FF0', '#B07AFF', '#E8E8EC', '#1A1A1E']

const filterBtnStyle = (active) => ({
  background: active ? 'var(--accent-soft)' : 'transparent',
  border: `1px solid ${active ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
  borderRadius: 'var(--radius-sm)', padding: '4px 10px',
  color: active ? 'var(--accent)' : 'var(--text-secondary)',
  fontSize: 10, cursor: 'pointer', fontWeight: active ? 500 : 400,
  transition: 'all 0.15s'
})

const MIN_SCALE = 0.1
const MAX_SCALE = 5

function InfiniteCanvas({ children, assets }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const containerRef = useRef(null)
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })

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
      if (e.target.closest('button')) return
      e.preventDefault()
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY }
      offsetStart.current = { ...offsetRef.current }
    }
    el.addEventListener('mousedown', onMouseDown)
    return () => el.removeEventListener('mousedown', onMouseDown)
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
    <div ref={containerRef} style={{
      flex: 1, overflow: 'hidden', position: 'relative',
      cursor: isPanning ? 'grabbing' : 'grab',
      background: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(circle, var(--border-subtle) 1px, transparent 1px)',
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

      <div style={{
        position: 'absolute', bottom: 14, right: 14, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 2,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)', padding: '3px 4px',
        boxShadow: 'var(--shadow-md)', userSelect: 'none'
      }}>
        <button onClick={zoomOut} style={zoomCtrlBtn} title="缩小">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <span style={{
          fontSize: 10, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'center',
          fontFamily: 'var(--font-mono)', cursor: 'pointer', padding: '2px 4px', borderRadius: 3
        }} onClick={resetZoom} title="重置为 100%">
          {Math.round(scale * 100)}%
        </span>
        <button onClick={zoomIn} style={zoomCtrlBtn} title="放大">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 2px' }} />
        <button onClick={fitToView} style={{ ...zoomCtrlBtn, width: 'auto', padding: '2px 6px', fontSize: 10 }} title="适应视图">
          适应
        </button>
      </div>

      {!isPanning && scale === 1 && offset.x === 0 && offset.y === 0 && assets?.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 14, left: 14, zIndex: 10,
          fontSize: 10, color: 'var(--text-ghost)', display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)', opacity: 0.7
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 9l4-4 4 4M5 15l4 4 4-4"/><path d="M15 5l4 4-4 4M9 15l-4 4 4 4"/></svg>
          滚轮缩放 · 拖拽平移
        </div>
      )}
    </div>
  )
}

const zoomCtrlBtn = {
  background: 'transparent', border: 'none', color: 'var(--text-secondary)',
  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 0,
  transition: 'background 0.12s, color 0.12s'
}

function DrawingOverlay({ tool, color, width: strokeWidth }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const start = useRef({ x: 0, y: 0 })
  const snapshot = useRef(null)

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
  }, [])

  const getPos = (e) => {
    const c = canvasRef.current
    const rect = c.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onMouseDown = (e) => {
    if (tool === 'select' || tool === 'move') return
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
      const text = prompt('输入文字：')
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
      pointerEvents: isDrawingTool ? 'auto' : 'none',
      cursor: isDrawingTool ? 'crosshair' : 'default'
    }} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} />
  )
}

const TOOL_ICONS = { select: MousePointer, move: Hand, pencil: Pencil, rect: Square, circle: Circle, line: Minus, text: Type }

function ToolIcon({ id, size = 16 }) {
  const Icon = TOOL_ICONS[id]
  if (!Icon) return null
  return <Icon size={size} strokeWidth={1.6} />
}

function EditBar({ activeTool, setActiveTool, drawColor, setDrawColor, drawWidth, setDrawWidth }) {
  const [hoveredTool, setHoveredTool] = useState(null)
  const isDrawingTool = !['select', 'move'].includes(activeTool)

  return (
    <div style={{
      position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
      display: 'flex', alignItems: 'center', gap: 2,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)', padding: '4px 6px',
      boxShadow: 'var(--shadow-md)', userSelect: 'none'
    }}>
      {TOOL_GROUPS.map((group, gi) => (
        <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {gi > 0 && <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 3px' }} />}
          {group.tools.map(tool => {
            const isActive = activeTool === tool.id
            const isHovered = hoveredTool === tool.id
            return (
              <div key={tool.id} style={{ position: 'relative' }}>
                <button
                  onClick={() => setActiveTool(tool.id)}
                  onMouseEnter={() => setHoveredTool(tool.id)}
                  onMouseLeave={() => setHoveredTool(null)}
                  title={`${tool.label} (${tool.key})`}
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
                    {tool.label}
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
      pointerEvents: 'none', zIndex: 2
    }} />
  )
}

export default function CanvasPanel({ canvas, lang }) {
  const { assets, selectedAsset, selectedId, setSelectedId, viewMode, setViewMode, filter, setFilter } = canvas
  const [activeTool, setActiveTool] = useState('select')
  const [drawColor, setDrawColor] = useState('#E8A849')
  const [drawWidth, setDrawWidth] = useState(2)

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
          borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)'
        }}>
          <button onClick={() => setViewMode('grid')} style={filterBtnStyle(viewMode === 'grid')}>
            <Ic n="grid" size={12} /> {lang === 'en' ? 'Grid' : '网格'}
          </button>
          <button onClick={() => setViewMode('free')} style={filterBtnStyle(viewMode === 'free')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="3" y="14" width="7" height="4" rx="1"/>
            </svg>
            {lang === 'en' ? 'Free' : '自由'}
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />
          {['all', 'image', 'video'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={filterBtnStyle(filter === f)}>{f === 'all' ? (lang === 'en' ? 'All' : '全部') : f === 'image' ? (lang === 'en' ? 'Image' : '图片') : (lang === 'en' ? 'Video' : '视频')}</button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>{assets.length} {lang === 'en' ? 'assets' : '个资产'}</span>
        </div>
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {assets.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  marginBottom: 16
                }}>
                  <Ic n="image" size={24} color="var(--text-ghost)" />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {lang === 'en' ? 'Canvas is empty' : '画布为空'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {lang === 'en' ? 'Describe what you want to create in the chat' : '在对话中描述你想创作的内容'}
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
                  <div key={a.id} style={{ position: 'relative' }}>
                    <GeneratingOverlay asset={a} />
                    <AssetCard asset={a} selected={a.id === selectedId} onClick={setSelectedId}
                      onContextMenu={(e, asset) => {}} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Free mode: infinite canvas with free positioning */
            <>
              <InfiniteCanvas assets={assets}>
                <div style={{ position: 'relative', minWidth: 2000, minHeight: 1500 }}>
                  {assets.map((a, i) => {
                    const col = i % 4
                    const row = Math.floor(i / 4)
                    const x = 30 + col * 280
                    const y = 30 + row * 280
                    return (
                      <div key={a.id} style={{
                        position: 'absolute', left: x, top: y, width: 240
                      }}>
                        <GeneratingOverlay asset={a} />
                        <AssetCard asset={a} selected={a.id === selectedId} onClick={setSelectedId}
                          onContextMenu={(e, asset) => {}} />
                      </div>
                    )
                  })}
                </div>
              </InfiniteCanvas>
              <DrawingOverlay tool={activeTool} color={drawColor} width={drawWidth} />
            </>
          )}
          <EditBar activeTool={activeTool} setActiveTool={setActiveTool} drawColor={drawColor} setDrawColor={setDrawColor} drawWidth={drawWidth} setDrawWidth={setDrawWidth} />
        </div>
      </div>
      {selectedAsset && (
        <AssetDetail asset={selectedAsset} onClose={() => setSelectedId(null)}
          onDelete={() => canvas.removeAsset(selectedAsset.id)} onRegenerate={() => {}} lang={lang} />
      )}
    </div>
  )
}
