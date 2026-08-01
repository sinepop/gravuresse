import { getConversationTitle } from './conversationImport.js'

/**
 * History persistence is opt-out. A missing config during startup must keep the
 * long-standing default, while an explicit false must stop automatic writes.
 *
 * @param {unknown} config
 */
export function shouldAutoSaveHistory(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return true
  const general = config.general
  if (!general || typeof general !== 'object' || Array.isArray(general)) return true
  return general.autoSave !== false
}

/**
 * A non-empty stored title is user-owned. Automatic title generation is only a
 * fallback for conversations that have never been named.
 *
 * @param {unknown} conversation
 * @param {unknown[]} messages
 */
export function titleForConversationSave(conversation, messages = []) {
  const title = conversation && typeof conversation === 'object' && !Array.isArray(conversation)
    ? conversation.title
    : ''
  return typeof title === 'string' && title.trim()
    ? title
    : getConversationTitle(messages)
}
