import { normalizeConversationRecord } from './conversationImport'
import type { ElectronAPI } from '../types/electron-api'
import type { Conversation, ConversationStorePayload } from '../types/domain'

let conversationsLoadPromise: Promise<ConversationStorePayload | null> | null = null

export function loadConversationsOnce(electronAPI: ElectronAPI | undefined = window.electronAPI): Promise<ConversationStorePayload | null> {
  if (!conversationsLoadPromise) {
    conversationsLoadPromise = electronAPI?.loadConversations?.() || Promise.resolve(null)
  }
  return conversationsLoadPromise
}

export function normalizeStoredConversations(conversations: unknown[] = []): Conversation[] {
  const seenIds = new Set<string>()
  return (Array.isArray(conversations) ? conversations : [])
    .map(source => normalizeConversationRecord(source as {}) as Conversation | null)
    .filter((conv): conv is Conversation => Boolean(conv))
    .map(conv => ({ ...conv, id: typeof conv.id === 'string' || typeof conv.id === 'number' ? String(conv.id) : '' }))
    .filter(conv => {
      if (!conv.id || seenIds.has(conv.id)) return false
      seenIds.add(conv.id)
      return true
    })
}
