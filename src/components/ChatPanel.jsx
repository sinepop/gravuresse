import { useState, useRef, useEffect, useCallback } from 'react'
import MessageBubble from './MessageBubble'
import { t } from '../i18n'
import Ic from './icons'

export default function ChatPanel({ chat, lang, conversations, activeConvId, onSwitchConv, onNewConv, onDeleteConv }) {
  const [input, setInput] = useState('')
  const [showConvList, setShowConvList] = useState(false)
  const endRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [input])

  const handleSend = useCallback(() => {
    if (!input.trim() || chat.loading) return
    chat.send(input)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [input, chat])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Conversation bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <button onClick={() => setShowConvList(!showConvList)} style={{
          background: showConvList ? 'var(--accent-soft)' : 'transparent',
          border: `1px solid ${showConvList ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-sm)', padding: '3px 8px', color: 'var(--text-secondary)',
          fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
        }}>
          <Ic n="grid" size={10} /> {t('conversations', lang)}
        </button>
        <button onClick={onNewConv} style={{
          background: 'transparent', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)', padding: '3px 8px', color: 'var(--accent)',
          fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
        }}>
          + {t('newConversation', lang)}
        </button>
        <div style={{ flex: 1 }} />
        {conversations.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {conversations.findIndex(c => c.id === activeConvId) + 1}/{conversations.length}
          </span>
        )}
      </div>

      {/* Conversation list dropdown */}
      {showConvList && (
        <div style={{
          borderBottom: '1px solid var(--border-subtle)', maxHeight: 200, overflow: 'auto',
          background: 'var(--bg-elevated)', padding: 4
        }}>
          {conversations.length === 0 ? (
            <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
              {lang === 'en' ? 'No conversations' : '暂无对话'}
            </div>
          ) : conversations.map(conv => (
            <div key={conv.id} onClick={() => { onSwitchConv(conv.id); setShowConvList(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: conv.id === activeConvId ? 'var(--accent-soft)' : 'transparent',
                border: conv.id === activeConvId ? '1px solid var(--border-accent)' : '1px solid transparent'
              }}
              onMouseEnter={e => { if (conv.id !== activeConvId) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (conv.id !== activeConvId) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conv.title || (lang === 'en' ? 'Untitled' : '未命名对话')}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatDate(conv.updatedAt)}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); if (window.confirm(t('deleteConvConfirm', lang))) onDeleteConv(conv.id) }}
                style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', cursor: 'pointer', padding: 2 }}>
                <Ic n="trash" size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 12px' }}>
        {chat.messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: 12 }}><Ic n="sparkle" size={32} color="var(--accent)" /></div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontStyle: 'italic', marginBottom: 8 }}>{t('studioAi', lang)}</div>
            <div style={{ fontSize: 11 }}>{lang === 'en' ? 'Tell me what you want to create' : '告诉我你想创作什么'}</div>
          </div>
        )}
        {chat.messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} lang={lang}
            onConfirmTask={(msgId, task) => chat.confirmGenerate(msgId, task)} />
        ))}
        {chat.loading && (
          <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 11 }}>
            <span style={{ animation: 'pulse 1.5s infinite' }}>{t('thinking', lang)}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-end',
          background: 'var(--bg-input)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)', padding: '8px 10px'
        }}>
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={t('inputPlaceholder', lang)} rows={1}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13, resize: 'none', maxHeight: 120, lineHeight: 1.5 }} />
          <button onClick={handleSend} disabled={!input.trim() || chat.loading} style={{
            background: input.trim() && !chat.loading ? 'var(--accent)' : 'var(--bg-hover)',
            border: 'none', borderRadius: 'var(--radius-sm)', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: input.trim() && !chat.loading ? 'pointer' : 'default', flexShrink: 0
          }}>
            <Ic n="send" size={14} color={input.trim() && !chat.loading ? '#000' : 'var(--text-muted)'} />
          </button>
        </div>
      </div>
    </div>
  )
}
