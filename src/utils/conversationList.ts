import { normalizeConversationRecord } from './conversationImport'
import type { ElectronAPI } from '../types/electron-api'
import type { ConversationStorePayload, StoredConversation } from '../types/domain'

let conversationsLoadPromise: Promise<ConversationStorePayload | null> | null = null

export function loadConversationsOnce(electronAPI: ElectronAPI | undefined = window.electronAPI): Promise<ConversationStorePayload | null> {
  if (!conversationsLoadPromise) {
    conversationsLoadPromise = electronAPI?.loadConversations?.() || Promise.resolve(null)
  }
  return conversationsLoadPromise
}

export function normalizeStoredConversations(conversations: unknown[] = []): StoredConversation[] {
  const seenIds = new Set<string>()
  return (Array.isArray(conversations) ? conversations : [])
    .map(source => normalizeConversationRecord(source))
    .filter((conv): conv is NonNullable<typeof conv> => Boolean(conv))
    .map(conv => ({ ...conv, id: typeof conv.id === 'string' || typeof conv.id === 'number' ? String(conv.id) : '' }))
    .filter((conv): conv is StoredConversation => {
      if (!conv.id || seenIds.has(conv.id)) return false
      seenIds.add(conv.id)
      return true
    })
}
