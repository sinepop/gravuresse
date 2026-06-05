import { useState, useEffect, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar'
import ModelBar from './components/ModelBar'
import ChatPanel from './components/ChatPanel'
import CanvasPanel from './components/CanvasPanel'
import Settings from './components/Settings'
import TaskQueue from './components/TaskQueue'
import ContextMenu from './components/ContextMenu'
import useConfig from './hooks/useConfig'
import useChat from './hooks/useChat'
import useCanvas from './hooks/useCanvas'
import useTaskQueue from './hooks/useTaskQueue'
import './styles/global.css'

const FONT_SIZES = { small: '12px', medium: '13px', large: '14px' }

export default function App() {
  const { config, save, updateProvider } = useConfig()
  const canvas = useCanvas()
  const chat = useChat(config, canvas)
  const taskQueue = useTaskQueue(canvas)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null)

  // Conversation management
  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId] = useState(null)
  const skipSave = useRef(false)
  const switchLoading = useRef(false)
  const prevConvIdRef = useRef(null)

  // Load conversations on startup
  useEffect(() => {
    window.electronAPI?.loadConversations().then(data => {
      if (data?.conversations?.length > 0) {
        setConversations(data.conversations)
        const activeId = data.activeId || data.conversations[0].id
        setActiveConvId(activeId)
        const conv = data.conversations.find(c => c.id === activeId)
        if (conv) {
          switchLoading.current = true
          skipSave.current = true
          chat.setMessages(() => conv.messages || [])
          if (conv.assets) conv.assets.forEach(a => canvas.addAsset(a))
          skipSave.current = false
          switchLoading.current = false
          prevConvIdRef.current = activeId
        }
      }
    }).catch(() => {})
  }, [])

  // Reload messages + canvas when active conversation changes
  useEffect(() => {
    if (!activeConvId) return
    switchLoading.current = true
    skipSave.current = true
    setConversations(prev => {
      const conv = prev.find(c => c.id === activeConvId)
      if (conv) {
        chat.setMessages(() => conv.messages || [])
        canvas.allAssets.forEach(a => canvas.removeAsset(a.id))
        if (conv.assets) conv.assets.forEach(a => canvas.addAsset(a))
      }
      return prev
    })
    skipSave.current = false
    switchLoading.current = false
    prevConvIdRef.current = activeConvId
  }, [activeConvId])

  // Sync current messages + assets into conversations state
  useEffect(() => {
    if (skipSave.current || !activeConvId || switchLoading.current) return
    if (prevConvIdRef.current !== activeConvId) return
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === activeConvId)
      if (idx < 0) return prev
      const cur = prev[idx]
      if (cur.messages === chat.messages && cur.assets === canvas.allAssets) return prev
      const next = [...prev]
      next[idx] = { ...cur, messages: chat.messages, assets: canvas.allAssets, updatedAt: new Date().toISOString() }
      return next.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    })
  }, [chat.messages, canvas.allAssets, activeConvId])

  // Debounced disk save
  useEffect(() => {
    if (skipSave.current || !activeConvId) return
    const timer = setTimeout(() => {
      const title = chat.messages.find(m => m.role === 'user')?.content?.slice(0, 30) || ''
      window.electronAPI?.saveConversation(activeConvId, {
        messages: chat.messages,
        assets: canvas.allAssets,
        title
      })
    }, 1000)
    return () => clearTimeout(timer)
  }, [chat.messages, canvas.allAssets, activeConvId])

  const handleNewConv = useCallback(() => {
    // Flush current conversation to state + disk before switching
    if (activeConvId) {
      const title = chat.messages.find(m => m.role === 'user')?.content?.slice(0, 30) || ''
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === activeConvId)
        if (idx < 0) return prev
        const next = [...prev]
        next[idx] = { ...next[idx], messages: chat.messages, assets: canvas.allAssets }
        return next
      })
      window.electronAPI?.saveConversation(activeConvId, {
        messages: chat.messages, assets: canvas.allAssets, title
      })
    }
    const id = `conv_${Date.now()}`
    const conv = { id, title: '', messages: [], assets: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    setConversations(prev => [conv, ...prev])
    setActiveConvId(id)
    window.electronAPI?.saveConversation(id, { messages: [], assets: [], title: '' })
    window.electronAPI?.setActiveConversation(id)
  }, [activeConvId, chat.messages, canvas.allAssets])

  const handleSwitchConv = useCallback((id) => {
    if (id === activeConvId) return
    // Save current messages into conversations state before switching
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === activeConvId)
      if (idx < 0) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], messages: chat.messages, assets: canvas.allAssets }
      return next
    })
    setActiveConvId(id)
    window.electronAPI?.setActiveConversation(id)
  }, [activeConvId, chat.messages, canvas.allAssets])

  const handleDeleteConv = useCallback((id) => {
    window.electronAPI?.deleteConversation(id)
    setConversations(prev => {
      const remaining = prev.filter(c => c.id !== id)
      if (id === activeConvId) {
        if (remaining.length > 0) {
          handleSwitchConv(remaining[0].id)
        } else {
          handleNewConv()
        }
      }
      return remaining
    })
  }, [activeConvId, handleSwitchConv, handleNewConv])

  const handleRenameConv = useCallback((id, newTitle) => {
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], title: newTitle }
      return next
    })
    const conv = conversations.find(c => c.id === id)
    if (conv) {
      window.electronAPI?.saveConversation(id, { ...conv, title: newTitle })
    }
  }, [conversations])

  // Apply theme, language, font-size from config
  useEffect(() => {
    if (!config?.general) return
    const { theme, fontSize } = config.general
    document.documentElement.dataset.theme = theme || 'dark'
    document.documentElement.style.setProperty('--font-size-base', FONT_SIZES[fontSize] || FONT_SIZES.medium)
  }, [config?.general?.theme, config?.general?.fontSize])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleAssetAction = useCallback((action, asset) => {
    if (action === 'view') {
      canvas.setSelectedId(asset.id)
    }
    if (action === 'download' && asset.url) {
      const a = document.createElement('a'); a.href = asset.url; a.download = `${asset.label}.png`; a.click()
    }
    if (action === 'copyPrompt') navigator.clipboard.writeText(asset.prompt || '')
    if (action === 'delete') canvas.removeAsset(asset.id)
    if (action === 'regenerate') {
      chat.send(`重新生成：${asset.prompt}`)
    }
    if (action === 'toVideo') {
      chat.send(`把这张图片做成视频：${asset.prompt}`)
    }
  }, [canvas, chat])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} lang={config?.general?.language} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: '40%', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
          <ChatPanel chat={chat} config={config} lang={config?.general?.language}
            conversations={conversations} activeConvId={activeConvId}
            onSwitchConv={handleSwitchConv} onNewConv={handleNewConv} onDeleteConv={handleDeleteConv}
            onRenameConv={handleRenameConv} canvas={canvas} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CanvasPanel canvas={canvas} lang={config?.general?.language}
              onContextMenu={(e, asset) => setCtxMenu({ x: e.clientX, y: e.clientY, asset })} />
          </div>
          <TaskQueue tasks={taskQueue.tasks} onRetry={taskQueue.retry} onRemove={taskQueue.remove} />
        </div>
      </div>
      <ModelBar config={config} onProviderChange={updateProvider} onOpenSettings={() => setSettingsOpen(true)} lang={config?.general?.language} />
      {settingsOpen && <Settings config={config} onSave={save} onClose={() => setSettingsOpen(false)} />}
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} asset={ctxMenu.asset} onClose={() => setCtxMenu(null)} onAction={handleAssetAction} />}
    </div>
  )
}
