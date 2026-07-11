import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import MessageBubble from './MessageBubble'
import ModelSelector from './ModelSelector'
import { t } from '../i18n'
import Ic from './icons'
import useSafeMediaUrl from '../hooks/useSafeMediaUrl'

function ChipSelect({ value, options, onChange, style }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const selectedLabel = options.find(o => o.value === value)?.label || value
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        ...style, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
      }}>
        {selectedLabel}
        <Ic n="chevDown" size={8} sw={2} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)', padding: 4, zIndex: 1000,
          boxShadow: 'var(--shadow-lg)', minWidth: 120, maxHeight: 200, overflow: 'auto',
          animation: 'scaleIn 0.12s ease',
        }}>
          {options.map(o => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false) }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px',
              background: o.value === value ? 'var(--accent-soft)' : 'transparent',
              border: 'none', borderRadius: 'var(--radius-sm)',
              color: o.value === value ? 'var(--accent)' : 'var(--text-primary)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
            }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const ASPECT_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2']
const STYLE_PRESETS = [
  { value: 'flat illustration', label: { zh: '扁平插画', en: 'Flat illustration' } },
  { value: '3D render', label: { zh: '3D 渲染', en: '3D render' } },
  { value: 'realistic photography', label: { zh: '写实摄影', en: 'Realistic photography' } },
  { value: 'watercolor painting', label: { zh: '水彩画', en: 'Watercolor' } },
  { value: 'anime style', label: { zh: '动漫风', en: 'Anime' } },
  { value: 'pixel art', label: { zh: '像素艺术', en: 'Pixel art' } },
  { value: 'oil painting', label: { zh: '油画', en: 'Oil painting' } },
  { value: 'minimalism', label: { zh: '极简主义', en: 'Minimalism' } },
  { value: 'cyberpunk', label: { zh: '赛博朋克', en: 'Cyberpunk' } },
  { value: 'paper cutout', label: { zh: '剪纸', en: 'Paper cutout' } },
]

function styleLabel(value, lang) {
  return STYLE_PRESETS.find(item => item.value === value || item.label.zh === value)?.label?.[lang] || value
}

function normalizeStyleValue(value) {
  return STYLE_PRESETS.find(item => item.value === value || item.label.zh === value)?.value || value || ''
}

function SafeReferenceThumb({ asset }) {
  const { src } = useSafeMediaUrl(asset?.url, asset?.type)
  if (!src) return null
  if (asset?.type === 'video') {
    return <video src={src} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  }
  return <img src={src} alt={asset?.label || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
}

const RESOLUTIONS = [
  { value: '1024', label: { zh: '标准', en: 'Standard' } },
  { value: '1536', label: { zh: '高清', en: 'High' } },
  { value: '2048', label: { zh: '超清', en: 'Ultra HD' } },
  { value: '2560', label: { zh: '2K', en: '2K' } },
  { value: '3840', label: { zh: '4K', en: '4K' } },
]

const FALLBACK_MEDIA_CONSTRAINTS = {
  image: {
    openai: { ratios: ['1:1', '4:3', '3:4', '16:9', '9:16'], resolutions: ['1024', '1536', '2048', '4096'] },
    'custom-image': { ratios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'], resolutions: ['1024', '1536', '2048', '4096'] },
    google: { ratios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'], resolutions: ['1024', '2048'] },
    volcengine: { ratios: ['1:1', '4:3', '3:4', '16:9', '9:16'], resolutions: ['1024', '2048', '4096'] },
    'alibaba-wan': { ratios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'], resolutions: ['1280', '1440'] }
  }
}

function findProviderDef(track, providerLists = {}, current = {}) {
  const id = current?.id || current?.providerId || ''
  return (providerLists?.[track] || []).find(provider => provider.id === id) || null
}

function resolutionLabel(value, lang) {
  return RESOLUTIONS.find(item => item.value === value)?.label?.[lang] || value
}

const chipBtnS = (active) => ({
  background: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
  border: `1px solid ${active ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
  borderRadius: 'var(--radius-sm)', padding: '3px 8px',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
  fontSize: 11, cursor: 'pointer', fontWeight: active ? 600 : 400,
  transition: 'all 0.15s', whiteSpace: 'nowrap',
  display: 'flex', alignItems: 'center', gap: 4,
})

const selectChipS = () => ({
  background: 'var(--select-bg)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)', padding: '3px 6px',
  color: 'var(--select-text)', fontSize: 11, cursor: 'pointer',
  fontFamily: 'var(--font-body)', outline: 'none',
  transition: 'all 0.15s',
})

export default function ChatPanel({ chat, config, providerLists, onProviderChange, lang, generationMode = 'image', conversations, activeConvId, onSwitchConv, onNewConv, onDeleteConv, onRenameConv, onExportConv, onExportProject, onImportConv, onEnsureConversation, conversationBusy = false, canvas, referenceIntent, onReferenceIntentConsumed, composerIntent, onComposerIntentConsumed }) {
  const [input, setInput] = useState('')
  const [showConvList, setShowConvList] = useState(false)
  const [showRefPicker, setShowRefPicker] = useState(false)
  const [showMaterialRefsOnly, setShowMaterialRefsOnly] = useState(false)
  const [references, setReferences] = useState([])
  const [composerGenerationMeta, setComposerGenerationMeta] = useState(null)
  const [editingConvId, setEditingConvId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [genRatio, setGenRatio] = useState(config?.general?.defaultRatio || '1:1')
  const [genStyle, setGenStyle] = useState(normalizeStyleValue(config?.general?.defaultStyle))
  const [genResolution, setGenResolution] = useState(config?.general?.defaultResolution || '1024')
  const [showGenSettings, setShowGenSettings] = useState(false)
  const endRef = useRef(null)
  const textareaRef = useRef(null)
  const sendingRef = useRef(false)

  const enableReference = config?.general?.enableReference === true
  const referenceAssets = (canvas?.allAssets || []).filter(asset => asset.url)
  const materialReferenceAssets = referenceAssets.filter(asset => asset.isMaterial === true)
  const visibleReferenceAssets = (showMaterialRefsOnly ? materialReferenceAssets : referenceAssets)
    .slice()
    .sort((a, b) => Number(b.isMaterial === true) - Number(a.isMaterial === true))
  const hasReferenceAssets = referenceAssets.length > 0
  const modeHint = t(generationMode === 'video' ? 'videoModeHint' : 'imageModeHint', lang)
  const mediaTrack = generationMode === 'video' ? 'video' : 'image'
  const mediaProvider = config?.providers?.[mediaTrack] || {}
  const mediaProviderId = mediaProvider.id || (mediaTrack === 'image' ? 'custom-image' : 'custom-video')
  const mediaProviderDef = findProviderDef(mediaTrack, providerLists, mediaProvider)
  const mediaConstraints = mediaProviderDef?.constraints?.[mediaTrack] ||
    mediaProviderDef?.meta?.constraints?.[mediaTrack] ||
    FALLBACK_MEDIA_CONSTRAINTS[mediaTrack]?.[mediaProviderId] ||
    {}
  const ratioOptions = useMemo(() => {
    const ratios = Array.isArray(mediaConstraints.ratios) && mediaConstraints.ratios.length ? mediaConstraints.ratios : ASPECT_RATIOS
    return ratios.map(ratio => ({ value: ratio, label: ratio }))
  }, [mediaConstraints.ratios])
  const resolutionOptions = useMemo(() => {
    const resolutions = Array.isArray(mediaConstraints.resolutions) && mediaConstraints.resolutions.length
      ? mediaConstraints.resolutions
      : RESOLUTIONS.map(item => item.value)
    return resolutions.map(value => ({ value, label: resolutionLabel(value, lang) }))
  }, [mediaConstraints.resolutions, lang])

  // Sync settings when config changes
  useEffect(() => {
    if (config?.general) {
      setGenRatio(config.general.defaultRatio || '1:1')
      setGenStyle(normalizeStyleValue(config.general.defaultStyle))
      setGenResolution(config.general.defaultResolution || '1024')
    }
  }, [config?.general?.defaultRatio, config?.general?.defaultStyle, config?.general?.defaultResolution])

  useEffect(() => {
    if (ratioOptions.length > 0 && !ratioOptions.some(option => option.value === genRatio)) {
      setGenRatio(ratioOptions[0].value)
    }
    if (resolutionOptions.length > 0 && !resolutionOptions.some(option => option.value === genResolution)) {
      setGenResolution(resolutionOptions[0].value)
    }
  }, [ratioOptions, resolutionOptions, genRatio, genResolution])

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

  const handleSend = useCallback(async () => {
    if (!input.trim() || chat.loading || conversationBusy || sendingRef.current) return
    sendingRef.current = true
    const text = input
    const refs = references.length > 0 ? references : undefined
    try {
      const ensured = await onEnsureConversation?.({ forSend: true })
      const accepted = await chat.send(text, refs, {
        ratio: genRatio,
        style: genStyle,
        resolution: genResolution,
        generationMode,
        ...composerGenerationMeta,
        conversationId: ensured?.id,
        conversationSnapshot: ensured?.conversation
      })
      if (accepted !== false) {
        setInput('')
        setReferences([])
        setComposerGenerationMeta(null)
      }
    } finally {
      sendingRef.current = false
    }
  }, [input, chat, references, genRatio, genStyle, genResolution, generationMode, composerGenerationMeta, onEnsureConversation, conversationBusy])

  const addReference = useCallback((asset) => {
    if (references.find(r => r.id === asset.id)) return
    setReferences(prev => [...prev, { id: asset.id, url: asset.url, type: asset.type, label: asset.label }])
    setShowRefPicker(false)
  }, [references])

  useEffect(() => {
    const asset = referenceIntent?.asset
    if (!asset?.id || !asset.url) return
    addReference(asset)
    setShowRefPicker(false)
    textareaRef.current?.focus()
    onReferenceIntentConsumed?.(referenceIntent.nonce)
  }, [referenceIntent?.nonce, addReference, onReferenceIntentConsumed])

  useEffect(() => {
    const text = composerIntent?.text
    if (!text) return
    setInput(text)
    setComposerGenerationMeta({
      parentAssetId: composerIntent.parentAssetId || null,
      createdFrom: composerIntent.createdFrom || 'promptEdit'
    })
    requestAnimationFrame(() => textareaRef.current?.focus())
    onComposerIntentConsumed?.(composerIntent.nonce)
  }, [composerIntent?.nonce, onComposerIntentConsumed])

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
    if (diff < 60000) return t('now', lang)
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return d.toLocaleDateString()
  }

  const formatElapsed = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`
  }

  const canSend = Boolean(input.trim()) && !chat.loading && !conversationBusy

  return (
    <div className="chat-panel" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Conversation bar */}
      <div className="chat-header" style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px',
        flexShrink: 0
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
        <button onClick={onExportConv} disabled={conversationBusy} title={t('exportConversation', lang)} aria-label={t('exportConversation', lang)} style={{
          background: 'transparent', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)', width: 30, height: 28, color: 'var(--text-secondary)',
          fontSize: 11, cursor: conversationBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: conversationBusy ? 0.55 : 1, transition: 'all 0.2s ease'
        }}
        onMouseEnter={e => { if (!conversationBusy) { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--accent)' } }}
        onMouseLeave={e => { if (!conversationBusy) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
        >
          <Ic n="download" size={12} sw={2} />
        </button>
        <button onClick={onImportConv} disabled={conversationBusy} title={t('importProject', lang)} aria-label={t('importProject', lang)} style={{
          background: 'transparent', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)', width: 30, height: 28, color: 'var(--text-secondary)',
          fontSize: 11, cursor: conversationBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: conversationBusy ? 0.55 : 1, transition: 'all 0.2s ease'
        }}
        onMouseEnter={e => { if (!conversationBusy) { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--accent)' } }}
        onMouseLeave={e => { if (!conversationBusy) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
        >
          <Ic n="upload" size={12} sw={2} />
        </button>
        <div style={{ flex: 1 }} />
        {conversations.length > 0 && (
          <span className="workspace-meta">
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
              {t('noConversations', lang)}
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
                    title={t('doubleClickRename', lang)}
                    style={{
                      fontSize: 12, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: conv.id === activeConvId ? 500 : 400, cursor: 'text'
                    }}
                  >
                    {conv.title || t('untitledConversation', lang)}
                  </div>
                )}
                <div className="workspace-meta" style={{ marginTop: 2 }}>{formatDate(conv.updatedAt)}</div>
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
          <div style={{ display: 'flex', gap: 6, padding: '6px 4px 2px', borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
            <button onClick={(e) => { e.stopPropagation(); onExportProject?.() }} disabled={conversationBusy || conversations.length === 0} style={{
              flex: 1, background: 'transparent', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 11,
              padding: '6px 8px', cursor: conversations.length === 0 ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              opacity: conversationBusy || conversations.length === 0 ? 0.45 : 1
            }}>
              <Ic n="download" size={11} /> {t('exportProject', lang)}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onImportConv?.() }} disabled={conversationBusy} style={{
              flex: 1, background: 'transparent', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 11,
              padding: '6px 8px', cursor: conversationBusy ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              opacity: conversationBusy ? 0.45 : 1
            }}>
              <Ic n="upload" size={11} /> {t('importProject', lang)}
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages" style={{ flex: 1, overflow: 'auto', padding: '16px 14px' }}>
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
              fontFamily: 'var(--font-display)', fontSize: 20,
              marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.5px'
            }}>{t('studioAi', lang)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{modeHint}</div>
          </div>
        )}
        {chat.messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} lang={lang}
            onConfirmTask={(msgId, task, taskIdx) => chat.confirmGenerate(msgId, task, taskIdx)}
            onBatchGenerate={(msgId, task, count, taskIdx) => chat.batchGenerate?.(msgId, task, count, taskIdx)}
            onRetryTask={(msgId, task, taskIdx) => chat.retryErroredTask(msgId, task, taskIdx, lang)} />
        ))}
        {chat.loading && (
          <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
              animation: 'pulse 1.2s ease-in-out infinite'
            }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('thinking', lang)}</span>
            <span style={{
              color: 'var(--text-ghost)', fontSize: 11, fontFamily: 'var(--font-mono)',
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
              <SafeReferenceThumb asset={ref} />
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
          <div style={{ flex: '0 0 100%', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
            <button onClick={() => setShowMaterialRefsOnly(false)} style={chipBtnS(!showMaterialRefsOnly)}>
              {t('allAssets', lang)}
            </button>
            <button onClick={() => setShowMaterialRefsOnly(true)} disabled={materialReferenceAssets.length === 0} style={{ ...chipBtnS(showMaterialRefsOnly), opacity: materialReferenceAssets.length === 0 ? 0.45 : 1, cursor: materialReferenceAssets.length === 0 ? 'default' : 'pointer' }}>
              <Ic n="star" size={10} sw={2} />
              {t('materialsOnly', lang)}
            </button>
          </div>
          {visibleReferenceAssets.length === 0 && (
            <div style={{ flex: '0 0 100%', padding: '10px 0', color: 'var(--text-muted)', fontSize: 11, textAlign: 'center' }}>
              {t('noMaterialAssets', lang)}
            </div>
          )}
          {visibleReferenceAssets.map(asset => (
            <div key={asset.id} onClick={() => addReference(asset)} style={{
              width: 52, height: 52, borderRadius: 'var(--radius-sm)', overflow: 'hidden',
              border: references.find(r => r.id === asset.id) ? '2px solid var(--accent)' : '1px solid var(--border-default)',
              cursor: 'pointer', flexShrink: 0, position: 'relative'
            }}>
              <SafeReferenceThumb asset={asset} />
              {asset.isMaterial && (
                <div style={{
                  position: 'absolute', top: 3, left: 3, width: 16, height: 16,
                  borderRadius: '50%', background: 'var(--overlay-dark)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border-white-subtle)'
                }}>
                  <Ic n="star" size={9} color="var(--accent)" sw={2.2} />
                </div>
              )}
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
            {t('thinkToggle', lang)}
          </button>

          {enableReference && (
            <button disabled={!hasReferenceAssets} title={!hasReferenceAssets ? t('noReferenceAssets', lang) : undefined} onClick={() => hasReferenceAssets && setShowRefPicker(!showRefPicker)} style={{
              background: showRefPicker || references.length > 0 ? 'var(--accent-soft)' : 'transparent',
              border: `1px solid ${showRefPicker || references.length > 0 ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-sm)', padding: '5px 10px',
              color: showRefPicker || references.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 11, cursor: hasReferenceAssets ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 5,
              fontWeight: references.length > 0 ? 600 : 400, transition: 'all 0.2s ease',
              boxShadow: showRefPicker || references.length > 0 ? '0 0 0 2px var(--accent-glow)' : 'none',
              opacity: hasReferenceAssets ? 1 : 0.45
            }}
            onMouseEnter={e => { if (hasReferenceAssets && !showRefPicker && references.length === 0) { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
            onMouseLeave={e => { if (hasReferenceAssets && !showRefPicker && references.length === 0) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)' } }}
            >
              <Ic n="image" size={11} sw={2} />
              {t('referenceImage', lang)}
              {references.length > 0 && <span style={{
                background: 'var(--accent)', color: 'var(--text-white)', borderRadius: '50%',
                width: 16, height: 16, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600
              }}>{references.length}</span>}
            </button>
          )}

          {/* Generation settings toggle */}
          <button onClick={() => setShowGenSettings(!showGenSettings)} style={chipBtnS(showGenSettings)}>
            <Ic n="gear" size={10} sw={2} />
            {t('genSettings', lang)}
          </button>

          <div style={{ minWidth: 0, maxWidth: '100%', overflow: 'visible', position: 'relative', zIndex: 10 }}>
            <ModelSelector
              config={config}
              providerLists={providerLists}
              activeModule={generationMode}
              onProviderChange={onProviderChange}
              lang={lang}
            />
          </div>

          <div style={{ flex: 1 }} />

          {/* Quick ratio/style chips when settings open */}
          {showGenSettings && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
              <span>{t('ratio', lang)}:</span>
              <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{genRatio}</span>
              {genStyle && <>
                <span style={{ margin: '0 2px' }}>·</span>
                <span>{t('style', lang)}:</span>
                <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{styleLabel(genStyle, lang) || '-'}</span>
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
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('ratio', lang)}</span>
              <ChipSelect value={genRatio} options={ratioOptions} onChange={setGenRatio} style={selectChipS()} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('style', lang)}</span>
              <ChipSelect value={genStyle} options={[{ value: '', label: t('noStyle', lang) }, ...STYLE_PRESETS.map(s => ({ value: s.value, label: s.label[lang] || s.value }))]} onChange={setGenStyle} style={selectChipS()} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('resolution', lang)}</span>
              <ChipSelect value={genResolution} options={resolutionOptions} onChange={setGenResolution} style={selectChipS()} />
            </div>
          </div>
        )}

        {/* Input box */}
        <div className="glass-input chat-composer" style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          padding: '10px 12px',
        }}>
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={modeHint} rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 14, resize: 'none', maxHeight: 120, lineHeight: 1.6
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
