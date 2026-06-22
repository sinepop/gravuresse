import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import TitleBar from './components/TitleBar'
import ModelBar from './components/ModelBar'
import ChatPanel from './components/ChatPanel'
import CanvasPanel from './components/CanvasPanel'
import Settings from './components/Settings'
import TaskQueue from './components/TaskQueue'
import ContextMenu from './components/ContextMenu'
import Ic from './components/icons'
import useConfig from './hooks/useConfig'
import useChat from './hooks/useChat'
import useCanvas from './hooks/useCanvas'
import useTaskQueue from './hooks/useTaskQueue'
import './styles/global.css'

const FONT_SIZES = { small: '12px', medium: '13px', large: '14px' }
const MODULES = [
  { id: 'chat', icon: 'chat', labels: { zh: '对话', en: 'Chat' } },
  { id: 'image', icon: 'image', labels: { zh: '生图', en: 'Image' } },
  { id: 'video', icon: 'film', labels: { zh: '视频', en: 'Video' } }
]
let conversationsLoadPromise = null

function loadConversationsOnce() {
  if (!conversationsLoadPromise) {
    conversationsLoadPromise = window.electronAPI?.loadConversations?.() || Promise.resolve(null)
  }
  return conversationsLoadPromise
}

function getConversationTitle(messages) {
  return messages.find(m => m.role === 'user')?.content?.slice(0, 30) || ''
}

function createStoredAsset(asset) {
  return {
    id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'image', label: asset.label || '未命名', prompt: asset.prompt || '',
    negativePrompt: asset.negativePrompt || '', url: asset.url || '',
    model: asset.model || '', ratio: asset.ratio || '1:1', style: asset.style || '',
    createdAt: new Date().toISOString(), _generating: false, ...asset
  }
}

export default function App() {
  const { config, providerLists, save, updateProvider } = useConfig()
  const canvas = useCanvas()
  const taskQueue = useTaskQueue(canvas)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [activeModule, setActiveModule] = useState('chat')

  // Conversation management
  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId] = useState(null)
  const skipSave = useRef(false)
  const switchLoading = useRef(false)
  const prevConvIdRef = useRef(null)
  const loadingSnapshot = useRef(null)
  const activeConvIdRef = useRef(null)
  const conversationsRef = useRef([])
  const deletedConvIds = useRef(new Set())
  const saveEpoch = useRef(0)

  useEffect(() => {
    activeConvIdRef.current = activeConvId
  }, [activeConvId])
  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  const isActiveConversation = useCallback((id) => id && activeConvIdRef.current === id && !deletedConvIds.current.has(id), [])

  const patchStoredConversation = useCallback((id, patcher) => {
    if (!id || deletedConvIds.current.has(id)) return null
    const currentList = conversationsRef.current
    const idx = currentList.findIndex(c => c.id === id)
    if (idx < 0) return null
    const current = currentList[idx]
    const patched = patcher(current)
    if (!patched) return null
    const updated = { ...patched, updatedAt: new Date().toISOString() }
    const next = [...currentList]
    next[idx] = updated
    next.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    conversationsRef.current = next
    setConversations(next)
    const messages = updated.messages || []
    const assets = updated.assets || []
    const title = updated.title || getConversationTitle(messages)
    window.electronAPI?.saveConversation(id, { messages, assets, title }).catch(e => console.error('Failed to save conversation:', e))
    return updated
  }, [])

  const conversationBridge = useMemo(() => ({
    canWrite: (id) => Boolean(id && !deletedConvIds.current.has(id) && conversationsRef.current.some(c => c.id === id)),
    appendMessage: (id, message) => patchStoredConversation(id, conv => ({
      ...conv,
      messages: [...(conv.messages || []), message],
      title: conv.title || getConversationTitle([...(conv.messages || []), message])
    })),
    updateTask: (id, msgId, taskIndex, patch) => patchStoredConversation(id, conv => ({
      ...conv,
      messages: (conv.messages || []).map(m => {
        if (m.id !== msgId) return m
        const tasks = [...(m.tasks || [m.task])]
        tasks[taskIndex ?? 0] = { ...tasks[taskIndex ?? 0], ...patch }
        return { ...m, tasks }
      })
    })),
    addAsset: (id, asset) => {
      const item = createStoredAsset(asset)
      const updated = patchStoredConversation(id, conv => ({ ...conv, assets: [item, ...(conv.assets || [])] }))
      return updated ? item : null
    },
    updateAsset: (id, assetId, patch) => patchStoredConversation(id, conv => ({
      ...conv,
      assets: (conv.assets || []).map(a => a.id === assetId ? { ...a, ...patch } : a)
    })),
    removeAsset: (id, assetId) => patchStoredConversation(id, conv => ({
      ...conv,
      assets: (conv.assets || []).filter(a => a.id !== assetId)
    }))
  }), [patchStoredConversation])

  const chat = useChat(config, canvas, taskQueue.add, activeConvId, isActiveConversation, conversationBridge)

  const setChatMessages = chat.setMessages
  const replaceCanvasAssets = canvas.replaceAssets

  const applyConversation = useCallback((conv, id) => {
    const messages = conv?.messages || []
    const assets = conv?.assets || []
    loadingSnapshot.current = { id, messages, assets }
    switchLoading.current = true
    skipSave.current = true
    setChatMessages(() => messages)
    replaceCanvasAssets(assets)
  }, [setChatMessages, replaceCanvasAssets])

  // Load conversations on startup
  useEffect(() => {
    let cancelled = false
    loadConversationsOnce().then(data => {
      if (cancelled) return
      deletedConvIds.current = new Set(data?.deletedIds || [])
      if (data?.conversations?.length > 0) {
        setConversations(data.conversations)
        conversationsRef.current = data.conversations
        const activeId = data.activeId || data.conversations[0].id
        setActiveConvId(activeId)
        const conv = data.conversations.find(c => c.id === activeId)
        if (conv) applyConversation(conv, activeId)
      }
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [applyConversation])

  // Reload messages + canvas when active conversation changes
  useEffect(() => {
    if (!activeConvId) return
    if (loadingSnapshot.current?.id === activeConvId) return
    if (prevConvIdRef.current === activeConvId) return
    const conv = conversations.find(c => c.id === activeConvId)
    if (conv) applyConversation(conv, activeConvId)
  }, [activeConvId, conversations, applyConversation])

  useEffect(() => {
    const snapshot = loadingSnapshot.current
    if (!snapshot || snapshot.id !== activeConvId) return
    if (chat.messages === snapshot.messages && canvas.allAssets === snapshot.assets) {
      loadingSnapshot.current = null
      skipSave.current = false
      switchLoading.current = false
      prevConvIdRef.current = activeConvId
    }
  }, [chat.messages, canvas.allAssets, activeConvId])

  // Sync current messages + assets into conversations state
  useEffect(() => {
    if (loadingSnapshot.current) return
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
    if (loadingSnapshot.current) return
    if (skipSave.current || !activeConvId) return
    const convId = activeConvId
    const epoch = saveEpoch.current
    const timer = setTimeout(() => {
      if (saveEpoch.current !== epoch || deletedConvIds.current.has(convId) || activeConvIdRef.current !== convId) return
      const title = getConversationTitle(chat.messages)
      window.electronAPI?.saveConversation(convId, {
        messages: chat.messages,
        assets: canvas.allAssets,
        title
      }).catch(e => console.error('Failed to save conversation:', e))
    }, 1000)
    return () => clearTimeout(timer)
  }, [chat.messages, canvas.allAssets, activeConvId])

  const flushActiveConversation = useCallback(async () => {
    if (!activeConvId) return
    const messages = chat.messages
    const assets = canvas.allAssets
    const title = getConversationTitle(messages)
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === activeConvId)
      if (idx < 0) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], messages, assets, updatedAt: new Date().toISOString() }
      return next.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    })
    await window.electronAPI?.saveConversation(activeConvId, { messages, assets, title })
  }, [activeConvId, chat.messages, canvas.allAssets])

  const doSwitchConv = useCallback(async (id) => {
    if (id === activeConvId) return
    try {
      saveEpoch.current++
      await flushActiveConversation()
      await window.electronAPI?.setActiveConversation(id)
      setActiveConvId(id)
    } catch (e) {
      console.error('Failed to switch conversation:', e)
    }
  }, [activeConvId, flushActiveConversation])

  const doNewConv = useCallback(async () => {
    const id = `conv_${Date.now()}`
    const conv = { id, title: '', messages: [], assets: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    try {
      saveEpoch.current++
      await flushActiveConversation()
      await window.electronAPI?.saveConversation(id, { messages: [], assets: [], title: '' })
      await window.electronAPI?.setActiveConversation(id)
      setConversations(prev => [conv, ...prev])
      setActiveConvId(id)
    } catch (e) {
      console.error('Failed to create conversation:', e)
    }
  }, [flushActiveConversation])

  const handleNewConv = useCallback(() => doNewConv(), [doNewConv])
  const handleSwitchConv = useCallback((id) => doSwitchConv(id), [doSwitchConv])

  const handleDeleteConv = useCallback(async (id) => {
    const deletingActive = id === activeConvId
    const remaining = conversations.filter(c => c.id !== id)
    try {
      saveEpoch.current++
      if (deletingActive) await flushActiveConversation()
      deletedConvIds.current.add(id)
      await window.electronAPI?.deleteConversation(id)
      if (!deletingActive) {
        setConversations(prev => prev.filter(c => c.id !== id))
        return
      }
      const nextActive = remaining[0]
      if (nextActive) {
        await window.electronAPI?.setActiveConversation(nextActive.id)
        setConversations(prev => prev.filter(c => c.id !== id))
        setActiveConvId(nextActive.id)
        return
      }
      const newId = `conv_${Date.now()}`
      const conv = { id: newId, title: '', messages: [], assets: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      await window.electronAPI?.saveConversation(newId, { messages: [], assets: [], title: '' })
      await window.electronAPI?.setActiveConversation(newId)
      setConversations(prev => [conv, ...prev.filter(c => c.id !== id)])
      setActiveConvId(newId)
    } catch (e) {
      deletedConvIds.current.delete(id)
      console.error('Failed to delete conversation:', e)
    }
  }, [activeConvId, conversations, flushActiveConversation])

  const handleRenameConv = useCallback((id, newTitle) => {
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], title: newTitle }
      return next
    })
    window.electronAPI?.saveConversation(id, { title: newTitle }).catch(e => console.error('Failed to rename conversation:', e))
  }, [])

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

  const handleAssetAction = useCallback(async (action, asset) => {
    if (action === 'view') {
      canvas.setSelectedId(asset.id)
    }
    if (action === 'download' && asset.url) {
      try {
        await window.electronAPI?.saveAssetWithDialog?.({ url: asset.url, label: asset.label, type: asset.type })
      } catch (e) {
        console.error('Save failed:', e)
      }
    }
    if (action === 'copyPrompt') {
      try { navigator.clipboard.writeText(asset.prompt || '') } catch {}
    }
    if (action === 'delete') canvas.removeAsset(asset.id)
    if (action === 'regenerate') {
      chat.send(`重新生成：${asset.prompt}`)
    }
    if (action === 'toVideo') {
      chat.send(`把资产 ${asset.id} 做成视频：${asset.prompt}`, [asset])
    }
  }, [canvas, chat])

  const lang = config?.general?.language || 'zh'

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} lang={lang} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <nav className="module-sidebar" aria-label={lang === 'en' ? 'Workspace modules' : '工作区模块'}>
          {MODULES.map(module => {
            const active = activeModule === module.id
            const label = module.labels[lang] || module.labels.zh
            return (
              <button
                key={module.id}
                className={`module-nav-button ${active ? 'active' : ''}`}
                onClick={() => setActiveModule(module.id)}
                title={label}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
              >
                <Ic n={module.icon} size={17} sw={active ? 2 : 1.6} />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>
        <main className="module-content">
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ChatPanel chat={chat} config={config} lang={lang}
                conversations={conversations} activeConvId={activeConvId}
                onSwitchConv={handleSwitchConv} onNewConv={handleNewConv} onDeleteConv={handleDeleteConv}
                onRenameConv={handleRenameConv} canvas={canvas} />
              {activeModule === 'video' && (
                <TaskQueue tasks={taskQueue.tasks} onRetry={taskQueue.retry} onRemove={taskQueue.remove} lang={lang} />
              )}
            </div>
            <CanvasPanel canvas={canvas} lang={lang}
              onContextMenu={(e, asset) => setCtxMenu({ x: e.clientX, y: e.clientY, asset })} />
          </div>
        </main>
      </div>
      <ModelBar config={config} providerLists={providerLists} onProviderChange={updateProvider} onOpenSettings={() => setSettingsOpen(true)} lang={lang} />
      {settingsOpen && <Settings config={config} providerLists={providerLists} onSave={save} onClose={() => setSettingsOpen(false)} />}
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} asset={ctxMenu.asset} onClose={() => setCtxMenu(null)} onAction={handleAssetAction} lang={config?.general?.language} />}
    </div>
  )
}
