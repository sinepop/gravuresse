import { normalizeConversationRecord } from './conversationImport'

let conversationsLoadPromise = null

export function loadConversationsOnce(electronAPI = window.electronAPI) {
  if (!conversationsLoadPromise) {
    conversationsLoadPromise = electronAPI?.loadConversations?.() || Promise.resolve(null)
  }
  return conversationsLoadPromise
}

export function normalizeStoredConversations(conversations = []) {
  const seenIds = new Set()
  return (Array.isArray(conversations) ? conversations : [])
    .map(normalizeConversationRecord)
    .filter(Boolean)
    .map(conv => ({ ...conv, id: typeof conv.id === 'string' || typeof conv.id === 'number' ? String(conv.id) : '' }))
    .filter(conv => {
      if (!conv.id || seenIds.has(conv.id)) return false
      seenIds.add(conv.id)
      return true
    })
}
