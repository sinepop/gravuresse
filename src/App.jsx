// @ts-check

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import TitleBar from './components/TitleBar'
import ChatPanel from './components/ChatPanel'
import CanvasPanel from './components/CanvasPanel'
import Settings from './components/Settings'
import TaskQueue from './components/TaskQueue'
import ContextMenu from './components/ContextMenu'
import Ic from './components/icons'
import Pill from './components/ui/Pill'
import StatusBadge from './components/ui/StatusBadge'
import useConfig from './hooks/useConfig'
import useChat from './hooks/useChat'
import useCanvas from './hooks/useCanvas'
import useTaskQueue from './hooks/useTaskQueue'
import { formatErrorAlert, getConversationTitle, normalizeConversationRecord, normalizeImportedConversations } from './utils/conversationImport'
import {
  addAssetToConversationRecord,
  appendMessageToConversation,
  removeConversationAsset,
  updateConversationAsset,
  updateConversationTask
} from './utils/conversationStore'
import { loadConversationsOnce, normalizeStoredConversations } from './utils/conversationList'
import { t } from './i18n'
import './styles/global.css'

/** @typedef {import('./types/domain').Asset} Asset */
/** @typedef {import('./types/domain').Conversation} Conversation */
/** @typedef {import('./types/domain').ConversationBridge} ConversationBridge */
/** @typedef {import('./types/domain').Message} Message */
/** @typedef {import('./types/domain').ProviderConnectionsConfig} ProviderConnectionsConfig */
/** @typedef {import('./types/domain').StoredConversation} StoredConversation */
/** @typedef {import('./types/domain').Track} Track */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {'image' | 'video'} WorkspaceModule */
/** @typedef {{ id: WorkspaceModule, icon: 'image' | 'film', labels: Record<string, string> }} WorkspaceModuleDefinition */
/** @typedef {{ id: string, messages: Message[], assets: Asset[] }} LoadingSnapshot */
/** @typedef {{ id: string, conversation: StoredConversation }} EnsureConversationResult */
/** @typedef {{ flushCurrent?: boolean, applyToView?: boolean }} CreateConversationOptions */
/** @typedef {{ forSend?: boolean }} EnsureConversationOptions */
/** @typedef {{ x: number, y: number, asset: Asset }} ContextMenuState */
/** @typedef {{ nonce: number, asset: Pick<Asset, 'id' | 'url' | 'type' | 'label'> }} ReferenceIntent */
/** @typedef {{ nonce: number, text: string, parentAssetId: string, createdFrom: string }} ComposerIntent */
/** @typedef {{ connectionId?: string, providerId?: string, modelId?: string, model?: string }} ActiveSelection */

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** @param {unknown} value @returns {UnknownRecord} */
function recordOf(value) {
  return isRecord(value) ? value : {}
}

/** @param {unknown} value @param {string} fallback @returns {string} */
function textOr(value, fallback) {
  return typeof value === 'string' && value ? value : fallback
}

/** @param {StoredConversation[]} conversations @returns {StoredConversation[]} */
function sortConversations(conversations) {
  return conversations.sort((a, b) => new Date(b.updatedAt || '').getTime() - new Date(a.updatedAt || '').getTime())
}

/** @returns {StoredConversation} */
function createEmptyConversation() {
  return {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    messages: [],
    assets: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

const FONT_SIZES = { small: '13px', medium: '14px', large: '16px' }
/** @type {WorkspaceModuleDefinition[]} */
const MODULES = [
  { id: 'image', icon: 'image', labels: { zh: '生图', en: 'Image' } },
  { id: 'video', icon: 'film', labels: { zh: '视频', en: 'Video' } }
]
// Stored assets use the same shape as canvas assets (see assetFactory), so the
// conversation bridge and the live canvas stay structurally identical.

export default function App() {
  const { config, providerLists, save } = useConfig()
  const [liveConnections, setLiveConnections] = useState(/** @type {ProviderConnectionsConfig | null} */ (null))
  const [activeSelections, setActiveSelections] = useState(/** @type {Partial<Record<Track, ActiveSelection>>} */ ({}))
  const runtimeConfig = useMemo(() => liveConnections && config ? { ...config, connections: liveConnections } : config, [config, liveConnections])
  const canvas = useCanvas()
  const taskQueue = useTaskQueue(canvas)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState('accounts')
  const [ctxMenu, setCtxMenu] = useState(/** @type {ContextMenuState | null} */ (null))
  const [activeModule, setActiveModule] = useState(/** @type {WorkspaceModule} */ ('image'))
  const [referenceIntent, setReferenceIntent] = useState(/** @type {ReferenceIntent | null} */ (null))
  const [composerIntent, setComposerIntent] = useState(/** @type {ComposerIntent | null} */ (null))
  const generalConfig = recordOf(runtimeConfig?.general)
  const lang = textOr(generalConfig.language, 'zh')

  // Conversation management
  const [conversations, setConversations] = useState(/** @type {StoredConversation[]} */ ([]))
  const [activeConvId, setActiveConvId] = useState(/** @type {string | null} */ (null))
  const [conversationBusy, setConversationBusy] = useState(false)
  const skipSave = useRef(false)
  const switchLoading = useRef(false)
  const prevConvIdRef = useRef(/** @type {string | null} */ (null))
  const loadingSnapshot = useRef(/** @type {LoadingSnapshot | null} */ (null))
  const activeConvIdRef = useRef(/** @type {string | null} */ (null))
  const conversationsRef = useRef(/** @type {StoredConversation[]} */ ([]))
  const deletedConvIds = useRef(new Set(/** @type {string[]} */ ([])))
  const saveEpoch = useRef(0)
  const ensuringConversationRef = useRef(/** @type {Promise<EnsureConversationResult> | null} */ (null))
  const didLoadConversationsRef = useRef(false)

  useEffect(() => {
    activeConvIdRef.current = activeConvId
  }, [activeConvId])
  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  const isActiveConversation = useCallback(/** @param {string} id */ (id) => Boolean(id && activeConvIdRef.current === id && !deletedConvIds.current.has(id)), [])

  const patchStoredConversation = useCallback(/**
   * @param {string | null} id
   * @param {(conversation: StoredConversation) => (Partial<Conversation> & UnknownRecord) | null} patcher
   * @returns {StoredConversation | null}
   */ (id, patcher) => {
    if (!id || deletedConvIds.current.has(id)) return null
    const currentList = conversationsRef.current
    const idx = currentList.findIndex(c => c.id === id)
    if (idx < 0) return null
    const current = currentList[idx]
    const patched = patcher(current)
    if (!patched) return null
    const updated = { ...current, ...patched, id: current.id, updatedAt: new Date().toISOString() }
    const next = [...currentList]
    next[idx] = updated
    sortConversations(next)
    conversationsRef.current = next
    setConversations(next)
    const messages = updated.messages || []
    const assets = updated.assets || []
    const title = updated.title || getConversationTitle(messages)
    window.electronAPI?.saveConversation(id, { messages, assets, title }).catch(e => console.error('Failed to save conversation:', e))
    return updated
  }, [])

  const conversationBridge = useMemo(/** @returns {ConversationBridge} */ () => ({
    canWrite: (id) => Boolean(id && !deletedConvIds.current.has(id) && conversationsRef.current.some(c => c.id === id)),
    appendMessage: (id, message) => patchStoredConversation(id, conv => appendMessageToConversation(conv, message)),
    updateTask: (id, msgId, taskIndex, patch) => patchStoredConversation(id, conv => updateConversationTask(conv, msgId, taskIndex, patch)),
    addAsset: (id, asset) => {
      /** @type {Asset | null} */
      let item = null
      const updated = patchStoredConversation(id, conv => {
        const result = addAssetToConversationRecord(conv, asset)
        item = result.asset
        return result.conversation
      })
      return updated ? item : null
    },
    getAsset: (id, assetId) => {
      const conv = conversationsRef.current.find(item => item.id === id)
      return conv?.assets?.find(asset => asset.id === assetId) || null
    },
    updateAsset: (id, assetId, patch) => patchStoredConversation(id, conv => updateConversationAsset(conv, assetId, patch)),
    removeAsset: (id, assetId) => patchStoredConversation(id, conv => removeConversationAsset(conv, assetId))
  }), [patchStoredConversation])

  const chat = useChat(runtimeConfig, canvas, taskQueue.add, activeConvId, isActiveConversation, conversationBridge, providerLists, activeSelections)

  const setChatMessages = chat.setMessages
  const replaceCanvasAssets = canvas.replaceAssets

  const applyConversation = useCallback(/** @param {unknown} conv @param {string} id */ (conv, id) => {
    const normalized = normalizeConversationRecord(conv) || { messages: [], assets: [] }
    const messages = normalized.messages || []
    const assets = normalized.assets || []
    switchLoading.current = true
    skipSave.current = true
    setChatMessages(() => messages)
    const normalizedAssets = replaceCanvasAssets(assets)
    loadingSnapshot.current = { id, messages, assets: normalizedAssets }
  }, [setChatMessages, replaceCanvasAssets])

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
      return sortConversations(next)
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
      const sorted = sortConversations(next)
      conversationsRef.current = sorted
      return sorted
    })
    await window.electronAPI?.saveConversation(activeConvId, { messages, assets, title })
  }, [activeConvId, chat.messages, canvas.allAssets])

  const createConversation = useCallback(/** @param {CreateConversationOptions} [options] @returns {Promise<EnsureConversationResult>} */ async ({ flushCurrent = true, applyToView = true } = {}) => {
    const conv = createEmptyConversation()
    const id = conv.id
    saveEpoch.current++
    if (flushCurrent) await flushActiveConversation()
    await window.electronAPI?.saveConversation(id, { messages: [], assets: [], title: '' })
    await window.electronAPI?.setActiveConversation(id)
    const next = [conv, ...conversationsRef.current.filter(c => c.id !== id)]
    conversationsRef.current = next
    setConversations(next)
    setActiveConvId(id)
    if (applyToView) {
      applyConversation(conv, id)
    } else {
      loadingSnapshot.current = null
      skipSave.current = false
      switchLoading.current = false
      prevConvIdRef.current = id
      replaceCanvasAssets(conv.assets)
    }
    return { id, conversation: conv }
  }, [applyConversation, flushActiveConversation, replaceCanvasAssets])

  const ensureActiveConversation = useCallback(/** @param {EnsureConversationOptions} [options] @returns {Promise<EnsureConversationResult>} */ async ({ forSend = false } = {}) => {
    const currentId = activeConvIdRef.current
    if (currentId && conversationsRef.current.some(c => c.id === currentId) && !deletedConvIds.current.has(currentId)) {
      return {
        id: currentId,
        conversation: {
          id: currentId,
          messages: chat.messages,
          assets: canvas.allAssets,
          title: getConversationTitle(chat.messages)
        }
      }
    }
    if (ensuringConversationRef.current) return ensuringConversationRef.current
    ensuringConversationRef.current = (async () => {
      const existing = conversationsRef.current.find(c => !deletedConvIds.current.has(c.id))
      if (existing) {
        await window.electronAPI?.setActiveConversation(existing.id)
        setActiveConvId(existing.id)
        if (!forSend) {
          applyConversation(existing, existing.id)
        } else {
          prevConvIdRef.current = existing.id
          replaceCanvasAssets(existing.assets || [])
        }
        return { id: existing.id, conversation: existing }
      }
      const data = await loadConversationsOnce().catch(() => null)
      const deletedIds = new Set((Array.isArray(data?.deletedIds) ? data.deletedIds : []).map(String))
      const loaded = normalizeStoredConversations(data?.conversations).filter(c => !deletedIds.has(c.id))
      if (loaded.length > 0) {
        deletedConvIds.current = deletedIds
        conversationsRef.current = loaded
        setConversations(loaded)
        const activeId = data?.activeId && loaded.some(c => c.id === String(data.activeId)) ? String(data.activeId) : loaded[0].id
        await window.electronAPI?.setActiveConversation(activeId)
        setActiveConvId(activeId)
        const conv = loaded.find(c => c.id === activeId) || loaded[0]
        if (!forSend) {
          applyConversation(conv, activeId)
        } else if (forSend) {
          prevConvIdRef.current = activeId
          replaceCanvasAssets(conv.assets || [])
        }
        return { id: activeId, conversation: conv }
      }
      return createConversation({ flushCurrent: false, applyToView: !forSend })
    })().finally(() => {
      ensuringConversationRef.current = null
    })
    return ensuringConversationRef.current
  }, [applyConversation, createConversation, chat.messages, canvas.allAssets])

  // Load conversations on startup. A fresh install still gets an active empty
  // conversation so the first send never disappears into a missing active id.
  useEffect(() => {
    if (didLoadConversationsRef.current) return
    let cancelled = false
    loadConversationsOnce().then(async data => {
      if (cancelled) return
      didLoadConversationsRef.current = true
      const deletedIds = new Set((Array.isArray(data?.deletedIds) ? data.deletedIds : []).map(String))
      deletedConvIds.current = deletedIds
      const loaded = normalizeStoredConversations(data?.conversations).filter(c => !deletedIds.has(c.id))
      if (loaded.length > 0) {
        setConversations(loaded)
        conversationsRef.current = loaded
        const activeId = data?.activeId && loaded.some(c => c.id === String(data.activeId)) ? String(data.activeId) : loaded[0].id
        setActiveConvId(activeId)
        const conv = loaded.find(c => c.id === activeId)
        if (conv) applyConversation(conv, activeId)
        return
      }
      await ensureActiveConversation()
    }).catch(() => {
      if (!cancelled) {
        didLoadConversationsRef.current = true
        ensureActiveConversation()
      }
    })
    return () => {
      cancelled = true
    }
  }, [applyConversation, ensureActiveConversation])

  const doSwitchConv = useCallback(/** @param {string} id */ async (id) => {
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
    try {
      await createConversation({ flushCurrent: true })
    } catch (e) {
      console.error('Failed to create conversation:', e)
    }
  }, [createConversation])

  const handleNewConv = useCallback(() => doNewConv(), [doNewConv])
  const handleSwitchConv = useCallback(/** @param {string} id */ (id) => doSwitchConv(id), [doSwitchConv])

  const handleDeleteConv = useCallback(/** @param {string} id */ async (id) => {
    const deletingActive = id === activeConvId
    const remaining = conversations.filter(c => c.id !== id)
    setConversationBusy(true)
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
      /** @type {StoredConversation} */
      const conv = { id: newId, title: '', messages: [], assets: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      await window.electronAPI?.saveConversation(newId, { messages: [], assets: [], title: '' })
      await window.electronAPI?.setActiveConversation(newId)
      setConversations(prev => [conv, ...prev.filter(c => c.id !== id)])
      setActiveConvId(newId)
    } catch (e) {
      deletedConvIds.current.delete(id)
      console.error('Failed to delete conversation:', e)
    } finally {
      setConversationBusy(false)
    }
  }, [activeConvId, conversations, flushActiveConversation])

  const handleRenameConv = useCallback(/** @param {string} id @param {string} newTitle */ (id, newTitle) => {
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], title: newTitle }
      return next
    })
    window.electronAPI?.saveConversation(id, { title: newTitle }).catch(e => console.error('Failed to rename conversation:', e))
  }, [])

  const handleExportConv = useCallback(async () => {
    setConversationBusy(true)
    try {
      const ensured = await ensureActiveConversation()
      if (!ensured?.id) return
      await flushActiveConversation()
      const title = conversationsRef.current.find(c => c.id === ensured.id)?.title || getConversationTitle(chat.messages)
      const result = await window.electronAPI?.exportConversation?.({
        title,
        messages: chat.messages,
        assets: canvas.allAssets
      })
      if (result && !result.canceled) {
        const media = result.media || {}
        const suffix = media.inlined || media.skipped
          ? `\n${t('exportMediaSummary', lang)}: ${media.inlined || 0} / ${media.skipped || 0}`
          : ''
        const fallback = media.fallback ? `\n${t('exportMediaFallback', lang)}` : ''
        window.alert(`${t('exportConversationSuccess', lang)}${suffix}${fallback}`)
      }
    } catch (e) {
      console.error('Failed to export conversation:', e)
      window.alert(formatErrorAlert(t('exportConversationFail', lang), e))
    } finally {
      setConversationBusy(false)
    }
  }, [ensureActiveConversation, flushActiveConversation, chat.messages, canvas.allAssets, lang])

  const handleExportProject = useCallback(async () => {
    setConversationBusy(true)
    try {
      await flushActiveConversation()
      const result = await window.electronAPI?.exportProject?.(conversationsRef.current)
      if (result && !result.canceled) {
        const media = result.media || {}
        const suffix = media.inlined || media.skipped
          ? `\n${t('exportMediaSummary', lang)}: ${media.inlined || 0} / ${media.skipped || 0}`
          : ''
        const fallback = media.fallback ? `\n${t('exportMediaFallback', lang)}` : ''
        window.alert(`${t('exportProjectSuccess', lang)} (${result.count || conversationsRef.current.length})${suffix}${fallback}`)
      }
    } catch (e) {
      console.error('Failed to export project:', e)
      window.alert(formatErrorAlert(t('exportConversationFail', lang), e))
    } finally {
      setConversationBusy(false)
    }
  }, [flushActiveConversation, lang])

  const handleImportConv = useCallback(async () => {
    setConversationBusy(true)
    try {
      const result = await window.electronAPI?.importConversation?.()
      if (!result || result.canceled) return
      const importedItems = normalizeImportedConversations(result.data)
      if (importedItems.length === 0) throw new Error(t('importNoConversations', lang))
      const now = new Date().toISOString()
      const importedConvs = importedItems.map((item, index) => ({
        id: `conv_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
        title: item.title,
        messages: item.messages,
        assets: item.assets,
        createdAt: now,
        updatedAt: now
      }))

      saveEpoch.current++
      await flushActiveConversation()
      for (const conv of importedConvs) {
        await window.electronAPI?.saveConversation(conv.id, { messages: conv.messages, assets: conv.assets, title: conv.title })
      }
      const activeImported = importedConvs[0]
      await window.electronAPI?.setActiveConversation(activeImported.id)
      const importedIds = new Set(importedConvs.map(conv => conv.id))
      const next = [...importedConvs, ...conversationsRef.current.filter(c => !importedIds.has(c.id))]
      conversationsRef.current = next
      setConversations(next)
      setActiveConvId(activeImported.id)
      applyConversation(activeImported, activeImported.id)
      window.alert(importedConvs.length > 1 ? `${t('importProjectSuccess', lang)} (${importedConvs.length})` : t('importConversationSuccess', lang))
    } catch (e) {
      console.error('Failed to import conversation:', e)
      window.alert(formatErrorAlert(t('importConversationFail', lang), e))
    } finally {
      setConversationBusy(false)
    }
  }, [applyConversation, flushActiveConversation, lang])

  const handleImportImages = useCallback(/** @param {{ files?: File[], position?: { x: number, y: number } | null }} [options] */ async ({ files = /** @type {File[]} */ ([]), position = null } = {}) => {
    const ensured = await ensureActiveConversation()
    if (!ensured?.id) throw new Error(t('importImagesFail', lang))
    const results = []
    if (Array.isArray(files) && files.length > 0) {
      for (const file of files) {
        try {
          const bytes = await file.arrayBuffer()
          results.push(await window.electronAPI?.importImageBytes?.({
            name: file.name || `pasted-${Date.now()}.png`,
            mime: file.type || '',
            bytes
          }))
        } catch (/** @type {unknown} */ error) {
          results.push({ canceled: false, imported: [], rejected: [{ name: file.name || 'image', reason: error instanceof Error ? error.message : t('importImagesFail', lang) }] })
        }
      }
    } else {
      results.push(await window.electronAPI?.importLocalImages?.())
    }
    const imported = results.flatMap(result => result?.imported || [])
    const rejected = results.flatMap(result => result?.rejected || [])
    if (imported.length > 0) {
      const origin = position && Number.isFinite(position.x) && Number.isFinite(position.y) ? position : null
      canvas.addAssets(imported.map((record, index) => ({
        ...record,
        isMaterial: true,
        createdFrom: 'local-import',
        ...(origin ? { x: origin.x + index * 24, y: origin.y + index * 24 } : {}),
        generation: { mode: 'image', createdFrom: 'local-import' }
      })), { history: true })
      setActiveModule('image')
    }
    return { canceled: results.every(result => result?.canceled), imported, rejected }
  }, [canvas, ensureActiveConversation, lang])

  // Apply theme, language, font-size from config
  useEffect(() => {
    if (!runtimeConfig?.general) return
    const theme = textOr(recordOf(runtimeConfig.general).theme, 'light')
    const fontSize = recordOf(runtimeConfig.general).fontSize
    const resolvedFontSize = fontSize === 'small' || fontSize === 'large' ? FONT_SIZES[fontSize] : FONT_SIZES.medium
    document.documentElement.dataset.theme = theme
    document.documentElement.style.setProperty('--font-size-base', resolvedFontSize)
  }, [runtimeConfig?.general])

  useEffect(() => {
    /** @param {KeyboardEvent} e */
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleAssetAction = useCallback(/** @param {string} action @param {Asset} asset */ async (action, asset) => {
    if (action === 'moveAsset') {
      if (!asset?.id) return
      const patch = { x: asset.x, y: asset.y }
      canvas.updateAsset(asset.id, patch, { history: true })
      patchStoredConversation(activeConvIdRef.current, conv => updateConversationAsset(conv, asset.id, patch))
      return
    }
    if (action === 'selectAsset') {
      if (!asset?.id) return
      setActiveModule(asset.type === 'video' ? 'video' : 'image')
      canvas.setSelectedId(asset.id)
      return
    }
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
      try { navigator.clipboard.writeText(asset.generation?.prompt || asset.prompt || '') } catch {}
    }
    if (action === 'usePrompt') {
      const prompt = asset.generation?.prompt || asset.prompt || ''
      if (!prompt) return
      const isVideoAsset = asset.type === 'video'
      const text = t('continueFromPrompt', lang)
        .replace('{type}', t(isVideoAsset ? 'video' : 'image', lang))
        .replace('{prompt}', prompt)
      setComposerIntent({ nonce: Date.now(), text, parentAssetId: asset.id, createdFrom: 'promptEdit' })
      return
    }
    if (action === 'toggleMaterial') {
      const isMaterial = asset.isMaterial !== true
      canvas.updateAsset(asset.id, { isMaterial }, { history: true })
      patchStoredConversation(activeConvIdRef.current, conv => updateConversationAsset(conv, asset.id, { isMaterial }))
    }
    if (action === 'useAsReference') {
      if (generalConfig.enableReference !== true) return
      if (!asset?.url) return
      setReferenceIntent({
        nonce: Date.now(),
        asset: { id: asset.id, url: asset.url, type: asset.type, label: asset.label }
      })
      return
    }
    if (action === 'delete') {
      canvas.removeAsset(asset.id, { history: true })
      patchStoredConversation(activeConvIdRef.current, conv => removeConversationAsset(conv, asset.id))
      return
    }
    if (action === 'regenerate') {
      if (asset.type && asset.type !== 'image') return
      const ensured = await ensureActiveConversation({ forSend: true })
      if (ensured?.id) {
        const lang = textOr(generalConfig.language, 'zh')
        chat.regenerateDirectly(asset, lang, { conversationId: ensured.id })
      }
    }
    if (action === 'variation') {
      if (asset.type && asset.type !== 'image') return
      const ensured = await ensureActiveConversation({ forSend: true })
      if (ensured?.id) {
        const lang = textOr(generalConfig.language, 'zh')
        chat.createDerivedImageDirectly(asset, lang, { conversationId: ensured.id, createdFrom: 'variation' })
      }
    }
    if (action === 'restyle') {
      if (asset.type && asset.type !== 'image') return
      const lang = textOr(generalConfig.language, 'zh')
      const styleDirection = window.prompt(t('styleDirectionPrompt', lang), '')
      if (!styleDirection?.trim()) return
      const ensured = await ensureActiveConversation({ forSend: true })
      if (ensured?.id) {
        chat.createDerivedImageDirectly(asset, lang, { conversationId: ensured.id, createdFrom: 'restyle', styleDirection: styleDirection.trim() })
      }
    }
    if (action === 'toVideo') {
      if (generalConfig.enableVideo !== true) return
      const ensured = await ensureActiveConversation({ forSend: true })
      if (!ensured?.id) return
      setActiveModule('video')
      const prompt = asset.generation?.prompt || asset.prompt || ''
      const message = t('toVideoInstruction', lang)
        .replace('{id}', asset.id)
        .replace('{prompt}', prompt)
      chat.send(message, [asset], {
        conversationId: ensured.id,
        conversationSnapshot: ensured.conversation,
        generationMode: 'video',
        createdFrom: 'toVideo',
        parentAssetId: asset.id,
        sourceImageId: asset.id
      })
    }
  }, [canvas, chat, generalConfig, ensureActiveConversation, activeModule, patchStoredConversation, lang])

  const openSettings = useCallback(/** @param {string} [page] */ (page = 'accounts') => {
    setSettingsPage(page)
    setSettingsOpen(true)
  }, [])

  const videoEnabled = generalConfig.enableVideo === true
  const referenceEnabled = generalConfig.enableReference === true
  const workspaceMode = generalConfig.workspaceMode === 'pipeline' ? 'pipeline' : 'canvas'
  const visibleModules = useMemo(
    () => MODULES.filter(module => module.id !== 'video' || videoEnabled),
    [videoEnabled]
  )

  useEffect(() => {
    if (!videoEnabled && activeModule === 'video') setActiveModule('image')
  }, [videoEnabled, activeModule])

  // Derive active conversation title for topbar breadcrumb
  const activeConversation = useMemo(
    () => conversations.find(c => c.id === activeConvId) || null,
    [conversations, activeConvId]
  )
  const activeConversationTitle = activeConversation?.title || ''
  const activeTaskCount = taskQueue.tasks?.length || 0
  const autosaveReady = Boolean(activeConvId && !conversationBusy)

  return (
    <div className="app-shell">
      <TitleBar onOpenSettings={() => openSettings('accounts')} lang={lang} />
      <div className="workspace-shell">
        <nav className="module-sidebar" aria-label={lang === 'en' ? 'Workspace modules' : '工作区模块'}>
          {/* Brand block */}
          <div className="sidebar-brand-block">
            <div className="sidebar-brand-dot" />
            <span className="sidebar-brand-label">Grav</span>
          </div>
          <div style={{ height: 8 }} />
          {visibleModules.map(module => {
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
          {/* Settings entry */}
          <button
            className="module-nav-button"
            onClick={() => openSettings('accounts')}
            title={t('settingsTitle', lang)}
            aria-label={t('settingsTitle', lang)}
            style={{ marginTop: 4 }}
          >
            <Ic n="link" size={16} sw={1.6} />
            <span>{t('connection', lang)}</span>
          </button>
          {/* Status block */}
          <div className="sidebar-status-block">
            <div className="sidebar-status-dot" />
            <span className="sidebar-status-label">
              {autosaveReady ? t('statusReady', lang) : t('statusSaving', lang)}
            </span>
          </div>
        </nav>
        <main className="module-content">
          {/* Workspace top bar */}
          <div className="workspace-topbar">
            <div className="workspace-topbar-breadcrumb">
              <span>{activeModule === 'video' ? t('video', lang) : t('image', lang)}</span>
              <span className="workspace-topbar-breadcrumb-sep">/</span>
              <span>{lang === 'en' ? 'Chat' : t('chat', lang)}</span>
            </div>
            {activeConversationTitle && (
              <span className="workspace-topbar-title" title={activeConversationTitle}>
                {activeConversationTitle}
              </span>
            )}
            <div className="workspace-topbar-spacer" />
            <div className="workspace-topbar-actions">
              <Pill variant="active" size="sm">
                {workspaceMode === 'pipeline' ? t('workspacePipeline', lang) : t('workspaceCanvas', lang)}
              </Pill>
              {activeTaskCount > 0 && (
                <StatusBadge status="saving" label={`${activeTaskCount} ${t('running', lang)}`} size="sm" />
              )}
              {autosaveReady && (
                <span style={{ fontSize: 'var(--font-size-meta)', color: 'var(--text-ghost)' }}>
                  {t('statusAutosave', lang)}
                </span>
              )}
            </div>
          </div>
          <div className="workspace-main">
            <div className="chat-pane">
                <ChatPanel chat={chat} config={runtimeConfig} providerLists={providerLists} activeSelections={activeSelections} onConnectionModelChange={/** @param {Track} track @param {ActiveSelection} selection */ (track, selection) => setActiveSelections(current => ({ ...current, [track]: selection }))} lang={lang} generationMode={activeModule}
                  conversations={conversations} activeConvId={activeConvId}
                  onSwitchConv={handleSwitchConv} onNewConv={handleNewConv} onDeleteConv={handleDeleteConv}
                  onRenameConv={handleRenameConv} onExportConv={handleExportConv} onExportProject={handleExportProject} onImportConv={handleImportConv}
                  onEnsureConversation={ensureActiveConversation} conversationBusy={conversationBusy} canvas={canvas}
                  referenceIntent={referenceIntent} onReferenceIntentConsumed={() => setReferenceIntent(null)}
                  composerIntent={composerIntent} onComposerIntentConsumed={() => setComposerIntent(null)} />
              {activeModule === 'video' && videoEnabled && (
                <TaskQueue tasks={taskQueue.tasks} onRetry={taskQueue.retry} onRemove={taskQueue.remove} lang={lang} />
              )}
            </div>
            <div className="canvas-pane">
              <CanvasPanel canvas={canvas} lang={lang} generationMode={activeModule}
                onContextMenu={/** @param {React.MouseEvent} e @param {Asset} asset */ (e, asset) => setCtxMenu({ x: e.clientX, y: e.clientY, asset })}
                onAssetAction={handleAssetAction}
                onImportImages={handleImportImages}
                videoEnabled={videoEnabled}
                referenceEnabled={referenceEnabled}
                workspaceMode={workspaceMode} />
            </div>
          </div>
        </main>
      </div>
      {settingsOpen && <Settings config={runtimeConfig} providerLists={providerLists} onSave={save} onCanonicalChange={setLiveConnections} onClose={() => setSettingsOpen(false)} initialPage={settingsPage} />}
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} asset={ctxMenu.asset} onClose={() => setCtxMenu(null)} onAction={handleAssetAction} lang={lang} videoEnabled={videoEnabled} referenceEnabled={referenceEnabled} />}
    </div>
  )
}
