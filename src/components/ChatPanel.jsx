import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import MessageBubble from './MessageBubble'
import ModelSelector from './ModelSelector'
import { t } from '../i18n'
import Ic from './icons'

const ASPECT_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2']
const STYLE_PRESETS = ['扁平插画', '3D 渲染', '写实摄影', '水彩画', '动漫风', '像素艺术', '油画', '极简主义', '赛博朋克', '剪纸']
const RESOLUTIONS = [
  { value: '1024', label: { zh: '标准', en: 'Standard' } },
  { value: '1536', label: { zh: '高清', en: 'High' } },
  { value: '2048', label: { zh: '超清', en: 'Ultra HD' } },
  { value: '2560', label: { zh: '2K', en: '2K' } },
  { value: '3840', label: { zh: '4K', en: '4K' } },
]

const chipBtnS = (active) => ({
  background: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
  border: `1px solid ${active ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
  borderRadius: 'var(--radius-sm)', padding: '3px 8px',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
  fontSize: 10, cursor: 'pointer', fontWeight: active ? 600 : 400,
  transition: 'all 0.15s', whiteSpace: 'nowrap',
  display: 'flex', alignItems: 'center', gap: 4,
})

const selectChipS = () => ({
  background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)', padding: '3px 6px',
  color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer',
  fontFamily: 'var(--font-body)', outline: 'none',
  appearance: 'auto', transition: 'all 0.15s',
})

export default function ChatPanel({ chat, config, providerLists, onProviderChange, lang, generationMode = 'image', conversations, activeConvId, onSwitchConv, onNewConv, onDeleteConv, onRenameConv, canvas }) {
  const [input, setInput] = useState('')
  const [showConvList, setShowConvList] = useState(false)
  const [showRefPicker, setShowRefPicker] = useState(false)
  const [references, setReferences] = useState([])
  const [editingConvId, setEditingConvId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [genRatio, setGenRatio] = useState(config?.general?.defaultRatio || '1:1')
  const [genStyle, setGenStyle] = useState(config?.general?.defaultStyle || '')
  const [genResolution, setGenResolution] = useState(config?.general?.defaultResolution || '1024')
  const [showGenSettings, setShowGenSettings] = useState(false)
  const endRef = useRef(null)
  const textareaRef = useRef(null)

  const enableReference = config?.general?.enableReference === true
  const modeHint = t(generationMode === 'video' ? 'videoModeHint' : 'imageModeHint', lang)

  // Sync settings when config changes
  useEffect(() => {
    if (config?.general) {
      setGenRatio(config.general.defaultRatio || '1:1')
      setGenStyle(config.general.defaultStyle || '')
      setGenResolution(config.general.defaultResolution || '1024')
    }
  }, [config?.general?.defaultRatio, config?.general?.defaultStyle, config?.general?.defaultResolution])

  // Elapsed timer for thinking state
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  useEffect(() => {
    if (chat.loading) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [chat.loading])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages])

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = '0px'
      const nextHeight = Math.min(el.scrollHeight, 120)
      el.style.height = `${nextHeight}px`
      el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden'
    }
  }, [input])

  const handleSend = useCallback(() => {
    if (!input.trim() || chat.loading) return
    const refs = references.length > 0 ? references : undefined
    chat.send(input, refs, { ratio: genRatio, style: genStyle, resolution: genResolution, generationMode })
    setInput('')
    setReferences([])
  }, [input, chat, references, genRatio, genStyle, genResolution, generationMode])

  const addReference = useCallback((asset) => {
    if (references.find(r => r.id === asset.id)) return
    setReferences(prev => [...prev, { id: asset.id, url: asset.url, type: asset.type, label: asset.label }])
    setShowRefPicker(false)
  }, [references])

  const removeReference = useCallback((id) => {
    setReferences(prev => prev.filter(r => r.id !== id))
  }, [])

  const handleKeyDown = (e) => {
    if (e.nativeEvent?.isComposing || e.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const startRename = useCallback((conv) => {
    setEditingConvId(conv.id)
    setEditTitle(conv.title || '')
  }, [])

  const commitRename = useCallback(() => {
    if (editingConvId && editTitle.trim()) {
      onRenameConv?.(editingConvId, editTitle.trim())
    }
    setEditingConvId(null)
    setEditTitle('')
  }, [editingConvId, editTitle, onRenameConv])

  const cancelRename = useCallback(() => {
    setEditingConvId(null)
    setEditTitle('')
  }, [])

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return lang === 'en' ? 'now' : '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return d.toLocaleDateString()
  }

  const formatElapsed = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`
  }

  const canSend = Boolean(input.trim()) && !chat.loading

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Conversation bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px',
        borderBottom: '1px solid var(--border-glass)', flexShrink: 0,
        background: 'transparent'
      }}>
        <button onClick={() => setShowConvList(!showConvList)} style={{
          background: showConvList ? 'var(--accent-soft)' : 'transparent',
          border: `1px solid ${showConvList ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-sm)', padding: '5px 12px', color: showConvList ? 'var(--accent)' : 'var(--text-secondary)',
          fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          fontWeight: showConvList ? 600 : 400, transition: 'all 0.2s ease',
          boxShadow: showConvList ? '0 0 0 2px var(--accent-glow)' : 'none'
        }}
        onMouseEnter={e => { if (!showConvList) { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--accent)' } }}
        onMouseLeave={e => { if (!showConvList) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
        >
          <Ic n="grid" size={11} sw={2} /> {t('conversations', lang)}
        </button>
        <button onClick={onNewConv} style={{
          background: 'transparent', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)', padding: '5px 12px', color: 'var(--accent)',
          fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600,
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.background = 'var(--accent-soft)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'transparent' }}
        >
          + {t('newConversation', lang)}
        </button>
        <div style={{ flex: 1 }} />
        {conversations.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
            {conversations.findIndex(c => c.id === activeConvId) + 1}/{conversations.length}
          </span>
        )}
      </div>

      {/* Conversation list dropdown */}
      {showConvList && (
        <div className="glass-floating" style={{
          borderBottom: '1px solid var(--border-glass)', maxHeight: 220, overflow: 'auto',
          padding: 6, animation: 'scaleIn 0.15s ease', position: 'absolute', top: 50, left: 12, right: 12, zIndex: 50
        }}>
          {conversations.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
              {lang === 'en' ? 'No conversations' : '暂无对话'}
            </div>
          ) : conversations.map(conv => (
            <div key={conv.id} onClick={() => { onSwitchConv(conv.id); setShowConvList(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', marginBottom: 2,
                background: conv.id === activeConvId ? 'var(--accent-soft)' : 'transparent',
                border: `1px solid ${conv.id === activeConvId ? 'var(--border-accent)' : 'transparent'}`,
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => { if (conv.id !== activeConvId) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (conv.id !== activeConvId) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingConvId === conv.id ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') cancelRename()
                      e.stopPropagation()
                    }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-accent)',
                      borderRadius: 'var(--radius-sm)', padding: '2px 6px', fontSize: 12,
                      color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-body)'
                    }}
                  />
                ) : (
                  <div
                    onDoubleClick={(e) => { e.stopPropagation(); startRename(conv) }}
                    title={lang === 'en' ? 'Double-click to rename' : '双击重命名'}
                    style={{
                      fontSize: 12, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: conv.id === activeConvId ? 500 : 400, cursor: 'text'
                    }}
                  >
                    {conv.title || (lang === 'en' ? 'Untitled' : '未命名对话')}
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{formatDate(conv.updatedAt)}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); if (window.confirm(t('deleteConvConfirm', lang))) onDeleteConv(conv.id) }}
                style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', cursor: 'pointer', padding: 2, opacity: 0.5, transition: 'opacity 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
              >
                <Ic n="trash" size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 14px' }}>
        {chat.messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
            <div style={{
              marginBottom: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--accent-soft)', border: '1px solid var(--border-accent)'
            }}>
              <Ic n="sparkle" size={24} color="var(--accent)" />
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 20, fontStyle: 'italic',
              marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.5px'
            }}>{t('studioAi', lang)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{modeHint}</div>
          </div>
        )}
        {chat.messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} lang={lang}
            onConfirmTask={(msgId, task, taskIdx) => chat.confirmGenerate(msgId, task, taskIdx)}
            onBatchGenerate={(msgId, task, count, taskIdx) => chat.batchGenerate?.(msgId, task, count, taskIdx)} />
        ))}
        {chat.loading && (
          <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
              animation: 'pulse 1.2s ease-in-out infinite'
            }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('thinking', lang)}</span>
            <span style={{
              color: 'var(--text-ghost)', fontSize: 10, fontFamily: 'var(--font-mono)',
              marginLeft: 4, minWidth: 28
            }}>{formatElapsed(elapsed)}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* References preview */}
      {enableReference && references.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 14px 0', flexWrap: 'wrap'
        }}>
          {references.map(ref => (
            <div key={ref.id} style={{
              position: 'relative', width: 48, height: 48, borderRadius: 'var(--radius-sm)',
              overflow: 'hidden', border: '1px solid var(--border-accent)', flexShrink: 0
            }}>
              <img src={ref.url} alt={ref.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => removeReference(ref.id)} style={{
                position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: '50%',
                background: 'var(--danger)', border: 'none', color: 'var(--text-white)', fontSize: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                lineHeight: 1
              }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Reference picker dropdown */}
      {enableReference && showRefPicker && canvas?.allAssets?.length > 0 && (
        <div className="glass-floating" style={{
          padding: '10px 14px', maxHeight: 160, overflow: 'auto', position: 'absolute', bottom: 120, left: 12, right: 12, zIndex: 40,
          display: 'flex', gap: 6, flexWrap: 'wrap', animation: 'scaleIn 0.12s ease'
        }}>
          {canvas.allAssets.filter(a => a.url).map(asset => (
            <div key={asset.id} onClick={() => addReference(asset)} style={{
              width: 52, height: 52, borderRadius: 'var(--radius-sm)', overflow: 'hidden',
              border: references.find(r => r.id === asset.id) ? '2px solid var(--accent)' : '1px solid var(--border-default)',
              cursor: 'pointer', flexShrink: 0, position: 'relative'
            }}>
              <img src={asset.url} alt={asset.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, padding: '1px 3px',
                background: 'var(--overlay-dark)', fontSize: 8, color: 'var(--text-white)', textAlign: 'center',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>{asset.type}</div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '8px 14px 14px', borderTop: '1px solid var(--border-glass)', background: 'transparent' }}>
        {/* Toolbar row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap'
        }}>
          <button onClick={() => chat.setThinking(!chat.thinking)} style={{
            background: chat.thinking ? 'var(--accent-soft)' : 'transparent',
            border: `1px solid ${chat.thinking ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-sm)', padding: '5px 10px',
            color: chat.thinking ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontWeight: chat.thinking ? 600 : 400, transition: 'all 0.2s ease',
            boxShadow: chat.thinking ? '0 0 0 2px var(--accent-glow)' : 'none'
          }}
          onMouseEnter={e => { if (!chat.thinking) { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
          onMouseLeave={e => { if (!chat.thinking) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)' } }}
          >
            <Ic n="think" size={12} />
            {lang === 'en' ? 'Think' : '深度思考'}
          </button>

          {enableReference && (
            <button onClick={() => setShowRefPicker(!showRefPicker)} style={{
              background: showRefPicker || references.length > 0 ? 'var(--accent-soft)' : 'transparent',
              border: `1px solid ${showRefPicker || references.length > 0 ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-sm)', padding: '5px 10px',
              color: showRefPicker || references.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              fontWeight: references.length > 0 ? 600 : 400, transition: 'all 0.2s ease',
              boxShadow: showRefPicker || references.length > 0 ? '0 0 0 2px var(--accent-glow)' : 'none'
            }}
            onMouseEnter={e => { if (!showRefPicker && references.length === 0) { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
            onMouseLeave={e => { if (!showRefPicker && references.length === 0) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)' } }}
            >
              <Ic n="image" size={11} sw={2} />
              {lang === 'en' ? 'Reference' : '参考图'}
              {references.length > 0 && <span style={{
                background: 'var(--accent)', color: 'var(--text-white)', borderRadius: '50%',
                width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600
              }}>{references.length}</span>}
            </button>
          )}

          {/* Generation settings toggle */}
          <button onClick={() => setShowGenSettings(!showGenSettings)} style={chipBtnS(showGenSettings)}>
            <Ic n="gear" size={10} sw={2} />
            {lang === 'en' ? 'Gen Settings' : '生成设置'}
          </button>

          <ModelSelector
            config={config}
            providerLists={providerLists}
            activeModule={generationMode}
            onProviderChange={onProviderChange}
            lang={lang}
          />

          <div style={{ flex: 1 }} />

          {/* Quick ratio/style chips when settings open */}
          {showGenSettings && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)' }}>
              <span>{t('ratio', lang)}:</span>
              <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{genRatio}</span>
              {genStyle && <>
                <span style={{ margin: '0 2px' }}>·</span>
                <span>{t('style', lang)}:</span>
                <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{genStyle || '-'}</span>
              </>}
            </div>
          )}
        </div>

        {/* Generation settings panel */}
        {showGenSettings && (
          <div style={{
            display: 'flex', gap: 10, marginBottom: 8, padding: '8px 10px',
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)', animation: 'scaleIn 0.12s ease',
            flexWrap: 'wrap', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('ratio', lang)}</span>
              <select value={genRatio} onChange={e => setGenRatio(e.target.value)} style={selectChipS()}>
                {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('style', lang)}</span>
              <select value={genStyle} onChange={e => setGenStyle(e.target.value)} style={selectChipS()}>
                <option value="">{t('noStyle', lang)}</option>
                {STYLE_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('resolution', lang)}</span>
              <select value={genResolution} onChange={e => setGenResolution(e.target.value)} style={selectChipS()}>
                {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label[lang] || r.label.zh}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Input box */}
        <div className="glass-input" style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          padding: '10px 12px',
        }}>
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={modeHint} rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 13, resize: 'none', maxHeight: 120, lineHeight: 1.6
            }} />
          <button onClick={handleSend} disabled={!canSend} style={{
            background: canSend
              ? 'var(--accent-gradient)'
              : 'var(--bg-hover)',
            border: 'none', borderRadius: 'var(--radius-sm)', width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: canSend ? 'pointer' : 'default', flexShrink: 0,
            transition: 'all 0.2s ease',
            boxShadow: canSend ? 'var(--shadow-accent), inset 0 1px 0 rgba(255,255,255,0.15)' : 'none',
            transform: canSend ? 'scale(1)' : 'scale(0.95)'
          }}
          onMouseEnter={e => { if (canSend) e.currentTarget.style.transform = 'scale(1.08)' }}
          onMouseLeave={e => { if (canSend) e.currentTarget.style.transform = 'scale(1)' }}
          >
            <Ic n="send" size={15} sw={2} color={canSend ? 'var(--text-white)' : 'var(--text-muted)'} />
          </button>
        </div>
      </div>
    </div>
  )
}
